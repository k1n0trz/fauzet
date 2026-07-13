import { createHash } from "node:crypto";
import { parse as parseLossless } from "lossless-json";
import type {
  FiatPaymentGateway,
  ProviderPayment,
  ProviderPreference,
} from "../domain/fiat-payments.js";
import { FiatProviderError } from "../domain/fiat-payments.js";

export class MercadoPagoGateway implements FiatPaymentGateway {
  constructor(
    private readonly config: {
      accessToken: string;
      mode: "test" | "live";
    },
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (config.mode !== "test") {
      throw new Error(
        "Mercado Pago live mode is not authorized in this release",
      );
    }
  }

  async recoverPreference(externalReference: string) {
    const search = await this.request(
      `/checkout/preferences/search?${new URLSearchParams({
        external_reference: externalReference,
        limit: "10",
      })}`,
      { method: "GET" },
    );
    const elements = array(record(search.value)?.elements);
    const ids = elements
      .map((entry) => record(entry))
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .filter((entry) => string(entry.external_reference) === externalReference)
      .map((entry) => string(entry.id))
      .filter((id): id is string => Boolean(id));
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return null;
    if (uniqueIds.length > 1) {
      throw new FiatProviderError(
        "MP_PREFERENCE_AMBIGUOUS",
        "More than one Mercado Pago preference has the same external reference",
        false,
      );
    }
    const found = await this.request(
      `/checkout/preferences/${encodeURIComponent(uniqueIds[0]!)}`,
      { method: "GET" },
    );
    return preference(found.value, found.raw, this.config.mode);
  }

  async createPreference(
    input: Parameters<FiatPaymentGateway["createPreference"]>[0],
  ) {
    const amount = Number(input.amountMinor);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new FiatProviderError(
        "MP_AMOUNT_UNSUPPORTED",
        "The COP amount cannot be represented safely",
        false,
      );
    }
    const created = await this.request("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
        items: [
          {
            id: input.productVersionId,
            title: input.name,
            description: input.description,
            category_id: "services",
            quantity: 1,
            currency_id: input.currency,
            unit_price: amount,
          },
        ],
        payer: { email: input.payerEmail },
        external_reference: input.externalReference,
        metadata: {
          order_id: input.externalReference,
          product_version_id: input.productVersionId,
          sku: input.sku,
          environment: "test",
        },
        back_urls: {
          success: input.returnUrl,
          pending: input.returnUrl,
          failure: input.returnUrl,
        },
        auto_return: "approved",
        binary_mode: false,
        expires: true,
        expiration_date_to: input.expiresAt.toISOString(),
        statement_descriptor: "FAUZET",
      }),
    });
    return preference(created.value, created.raw, this.config.mode);
  }

  async searchPaymentIds(externalReference: string) {
    const ids = new Set<string>();
    let offset = 0;
    let total: number | null = null;
    do {
      const search = await this.request(
        `/v1/payments/search?${new URLSearchParams({
          external_reference: externalReference,
          sort: "date_created",
          criteria: "desc",
          limit: String(PAYMENT_SEARCH_LIMIT),
          offset: String(offset),
        })}`,
        { method: "GET" },
      );
      const source = requiredRecord(search.value, "payment search");
      total = optionalNonNegativeInteger(record(source.paging)?.total);
      if (total !== null && total > PAYMENT_SEARCH_MAX_RESULTS) {
        throw new FiatProviderError(
          "MP_PAYMENT_SEARCH_TRUNCATED",
          "Mercado Pago returned too many payments for one external reference",
          false,
        );
      }
      for (const entry of array(source.results)) {
        const candidate = record(entry);
        if (
          candidate &&
          string(candidate.external_reference) === externalReference
        ) {
          const id = string(candidate.id);
          if (id) ids.add(id);
        }
      }
      offset += PAYMENT_SEARCH_LIMIT;
    } while (total !== null && offset < total);
    return [...ids];
  }

  async getPayment(paymentId: string): Promise<ProviderPayment> {
    const result = await this.request(
      `/v1/payments/${encodeURIComponent(paymentId)}`,
      { method: "GET" },
    );
    const source = requiredRecord(result.value, "payment");
    const id = requiredString(source.id, "payment.id");
    if (id !== paymentId) {
      throw new FiatProviderError(
        "MP_PAYMENT_ID_MISMATCH",
        "Mercado Pago returned a different payment id",
        false,
      );
    }
    const externalReference = requiredString(
      source.external_reference,
      "payment.external_reference",
    );
    const collectorId = requiredString(
      source.collector_id,
      "payment.collector_id",
    );
    const merchantOrderId = requiredString(
      record(source.order)?.id,
      "payment.order.id",
    );
    const merchantOrderResult = await this.request(
      `/merchant_orders/${encodeURIComponent(merchantOrderId)}`,
      { method: "GET" },
    );
    const merchantOrder = requiredRecord(
      merchantOrderResult.value,
      "merchant_order",
    );
    const returnedMerchantOrderId = requiredString(
      merchantOrder.id,
      "merchant_order.id",
    );
    const merchantExternalReference = requiredString(
      merchantOrder.external_reference,
      "merchant_order.external_reference",
    );
    const preferenceId = requiredString(
      merchantOrder.preference_id,
      "merchant_order.preference_id",
    );
    const applicationId = requiredString(
      merchantOrder.application_id,
      "merchant_order.application_id",
    );
    const merchantCollectorId = requiredString(
      record(merchantOrder.collector)?.id ?? merchantOrder.collector_id,
      "merchant_order.collector.id",
    );
    const merchantOrderIsTest = requiredBoolean(
      merchantOrder.is_test,
      "merchant_order.is_test",
    );
    const merchantPaymentIds = array(merchantOrder.payments)
      .map((entry) => string(record(entry)?.id))
      .filter((candidate): candidate is string => Boolean(candidate));
    if (
      returnedMerchantOrderId !== merchantOrderId ||
      merchantExternalReference !== externalReference ||
      merchantCollectorId !== collectorId ||
      !merchantOrderIsTest ||
      !merchantPaymentIds.includes(id)
    ) {
      throw new FiatProviderError(
        "MP_MERCHANT_ORDER_MISMATCH",
        "Mercado Pago payment is not bound to its merchant order",
        false,
      );
    }
    return {
      id,
      externalReference,
      collectorId,
      applicationId,
      liveMode: requiredBoolean(source.live_mode, "payment.live_mode"),
      currency: requiredString(source.currency_id, "payment.currency_id"),
      amountMinor: copMinorUnits(
        requiredString(source.transaction_amount, "payment.transaction_amount"),
      ),
      refundedAmountMinor:
        source.transaction_amount_refunded === null ||
        source.transaction_amount_refunded === undefined
          ? 0n
          : copMinorUnits(
              requiredString(
                source.transaction_amount_refunded,
                "payment.transaction_amount_refunded",
              ),
            ),
      status: requiredString(source.status, "payment.status"),
      statusDetail: string(source.status_detail),
      preferenceId,
      merchantOrderId,
      approvedAt: optionalDate(source.date_approved),
      providerUpdatedAt: requiredDate(
        source.date_last_updated ?? source.date_created,
        "payment.date_last_updated",
      ),
      evidenceHash: sha256(`${result.raw}\n${merchantOrderResult.raw}`),
    };
  }

  private async request(path: string, init: RequestInit) {
    let response: Response;
    try {
      response = await this.fetcher(`${API_BASE}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.config.accessToken}`,
          accept: "application/json",
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new FiatProviderError(
        "MP_NETWORK_ERROR",
        error instanceof Error ? error.message : "Mercado Pago request failed",
        true,
      );
    }
    const raw = await response.text();
    if (!response.ok) {
      throw new FiatProviderError(
        `MP_HTTP_${response.status}`,
        `Mercado Pago returned HTTP ${response.status}`,
        response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
      );
    }
    try {
      return {
        raw,
        value: parseLossless(raw, undefined, {
          parseNumber: (value) => value,
        }),
      };
    } catch {
      throw new FiatProviderError(
        "MP_RESPONSE_INVALID",
        "Mercado Pago returned invalid JSON",
        false,
      );
    }
  }
}

function preference(
  value: unknown,
  raw: string,
  mode: "test" | "live",
): ProviderPreference {
  const source = requiredRecord(value, "preference");
  const items = array(source.items);
  const item = requiredRecord(items[0], "preference.items[0]");
  const checkoutUrl = requiredString(
    mode === "test" ? source.sandbox_init_point : source.init_point,
    mode === "test" ? "preference.sandbox_init_point" : "preference.init_point",
  );
  return {
    id: requiredString(source.id, "preference.id"),
    externalReference: requiredString(
      source.external_reference,
      "preference.external_reference",
    ),
    collectorId: requiredString(source.collector_id, "preference.collector_id"),
    currency: literalCop(item.currency_id),
    amountMinor: copMinorUnits(
      requiredString(item.unit_price, "preference.items[0].unit_price"),
    ),
    checkoutUrl,
    expiresAt: requiredDate(
      source.expiration_date_to,
      "preference.expiration_date_to",
    ),
    evidenceHash: sha256(raw),
  };
}

function requiredRecord(value: unknown, field: string) {
  const result = record(value);
  if (!result) invalid(field);
  return result;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredString(value: unknown, field: string): string {
  const result = string(value);
  if (!result) invalid(field);
  return result;
}

function requiredBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") invalid(field);
  return value;
}

function optionalNonNegativeInteger(value: unknown) {
  const candidate = string(value);
  if (candidate === null || !/^\d+$/.test(candidate)) return null;
  const result = Number(candidate);
  return Number.isSafeInteger(result) ? result : null;
}

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return requiredDate(value, "date");
}

function requiredDate(value: unknown, field: string) {
  const candidate = requiredString(value, field);
  const result = new Date(candidate);
  if (Number.isNaN(result.getTime())) invalid(field);
  return result;
}

function literalCop(value: unknown): "COP" {
  if (requiredString(value, "currency") !== "COP") invalid("currency");
  return "COP";
}

function copMinorUnits(value: string) {
  const match = /^(\d+)(?:\.0+)?$/.exec(value);
  if (!match?.[1]) invalid("amount");
  return BigInt(match[1]);
}

function invalid(field: string): never {
  throw new FiatProviderError(
    "MP_RESPONSE_INVALID",
    `Mercado Pago response is missing ${field}`,
    false,
  );
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

const API_BASE = "https://api.mercadopago.com";
const REQUEST_TIMEOUT_MS = 8_000;
const PAYMENT_SEARCH_LIMIT = 30;
const PAYMENT_SEARCH_MAX_RESULTS = 120;
