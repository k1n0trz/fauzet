import { createHash, randomUUID } from "node:crypto";
import type {
  FiatCheckoutRequest,
  FiatOrderResponse,
  PublicUser,
} from "@fauzet/contracts";
import {
  InvalidWebhookSignatureError,
  WebhookSignatureValidator,
} from "mercadopago";
import { FIAT_CHECKOUT_TERMS_VERSION } from "./fiat-catalog.js";

export type FiatPaymentPolicy = Readonly<{
  checkoutEnabled: boolean;
  checkoutAllowedUsers: readonly string[];
  mode: "test" | "live";
  sellerUserId?: string;
  applicationId?: string;
  webhookSecret?: string;
  appBaseUrl: string;
}>;

export type ProviderPreference = Readonly<{
  id: string;
  externalReference: string;
  collectorId: string;
  currency: "COP";
  amountMinor: bigint;
  checkoutUrl: string;
  expiresAt: Date;
  evidenceHash: string;
}>;

export type ProviderPayment = Readonly<{
  id: string;
  externalReference: string;
  collectorId: string;
  applicationId: string;
  liveMode: boolean;
  currency: string;
  amountMinor: bigint;
  refundedAmountMinor: bigint;
  status: string;
  statusDetail: string | null;
  preferenceId: string;
  merchantOrderId: string;
  approvedAt: Date | null;
  providerUpdatedAt: Date;
  evidenceHash: string;
}>;

export interface FiatPaymentGateway {
  recoverPreference(
    externalReference: string,
  ): Promise<ProviderPreference | null>;
  createPreference(input: {
    externalReference: string;
    productVersionId: string;
    sku: string;
    name: string;
    description: string;
    currency: "COP";
    amountMinor: bigint;
    payerEmail: string;
    expiresAt: Date;
    returnUrl: string;
  }): Promise<ProviderPreference>;
  searchPaymentIds(externalReference: string): Promise<string[]>;
  getPayment(paymentId: string): Promise<ProviderPayment>;
}

export type StoredFiatOrder = Readonly<{
  id: string;
  userId: string;
  status:
    | "CREATED"
    | "CHECKOUT_READY"
    | "PENDING"
    | "PAID"
    | "REFUND_PENDING"
    | "REFUNDED"
    | "CANCELLED"
    | "EXPIRED"
    | "HELD"
    | "DISPUTED";
  productVersionId: string;
  sku: string;
  name: string;
  quantity: 1;
  currency: "COP";
  amountMinor: bigint;
  termsVersion: string;
  refundPolicyVersion: string;
  createdAt: Date;
  updatedAt: Date;
  checkout: null | {
    preferenceId: string;
    url: string;
    expiresAt: Date;
  };
  entitlementId: string | null;
}>;

export type CheckoutReservation = Readonly<{
  order: StoredFiatOrder;
  attemptId: string;
  leaseToken: string | null;
  replayed: boolean;
  product: {
    productVersionId: string;
    sku: string;
    name: string;
    description: string;
    currency: "COP";
    amountMinor: bigint;
  };
}>;

export type StoredWebhook = Readonly<{
  id: string;
  providerObjectId: string;
  status:
    | "RECEIVED"
    | "PROCESSING"
    | "PROCESSED"
    | "IGNORED"
    | "FAILED"
    | "DEAD_LETTER";
  replayed: boolean;
}>;

export interface FiatPaymentStore {
  reserveCheckout(input: {
    userId: string;
    productVersionId: string;
    idempotencyKey: string;
    requestHash: string;
    termsVersion: string;
    refundPolicyVersion: string;
    leaseToken: string;
    now: Date;
    leaseTimeoutMs: number;
  }): Promise<CheckoutReservation>;
  completeCheckout(input: {
    orderId: string;
    attemptId: string;
    leaseToken: string;
    preference: ProviderPreference;
    now: Date;
  }): Promise<StoredFiatOrder>;
  failCheckout(input: {
    orderId: string;
    attemptId: string;
    leaseToken: string;
    reasonCode: string;
    terminal: boolean;
    now: Date;
  }): Promise<void>;
  orderForUser(
    userId: string,
    orderId: string,
  ): Promise<StoredFiatOrder | null>;
  recordWebhook(input: {
    dedupeKey: string;
    providerEventId: string | null;
    providerObjectId: string;
    payloadHash: string;
    payload: Record<string, unknown>;
    signatureVerifiedAt: Date;
  }): Promise<StoredWebhook>;
  ignoreWebhook(
    webhookId: string,
    now: Date,
    reasonCode: string,
  ): Promise<void>;
  claimWebhook(
    webhookId: string,
    now: Date,
    lockTimeoutMs: number,
  ): Promise<boolean>;
  applyPayment(input: {
    webhookId: string | null;
    payment: ProviderPayment;
    expectedSellerUserId: string;
    expectedApplicationId: string;
    expectedLiveMode: boolean;
    now: Date;
  }): Promise<{
    orderId: string | null;
    fulfilled: boolean;
    orderStatus: string;
  }>;
  failWebhook(input: {
    webhookId: string;
    reasonCode: string;
    now: Date;
    retryAt: Date;
  }): Promise<void>;
  webhookReconciliationCandidates(input: {
    now: Date;
    limit: number;
  }): Promise<Array<{ id: string; providerObjectId: string }>>;
  orderReconciliationCandidates(input: {
    now: Date;
    staleBefore: Date;
    expiredAfter: Date;
    limit: number;
  }): Promise<Array<{ id: string; externalReference: string }>>;
  markOrderReconciliationAttempt(
    orderId: string,
    now: Date,
    paymentFound: boolean,
  ): Promise<void>;
  failOrderReconciliation(input: {
    orderId: string;
    now: Date;
    reasonCode: string;
    terminal: boolean;
  }): Promise<void>;
}

export type FiatPaymentErrorCode =
  | "FIAT_ACCOUNT_NOT_ELIGIBLE"
  | "FIAT_CHECKOUT_DISABLED"
  | "FIAT_CHECKOUT_NOT_ALLOWED"
  | "FIAT_DEVICE_REQUIRED"
  | "FIAT_PROVIDER_NOT_CONFIGURED"
  | "FIAT_PRODUCT_NOT_AVAILABLE"
  | "FIAT_TERMS_CHANGED"
  | "FIAT_IDEMPOTENCY_CONFLICT"
  | "FIAT_CHECKOUT_BUSY"
  | "FIAT_PROVIDER_UNAVAILABLE"
  | "FIAT_PROVIDER_MISMATCH"
  | "FIAT_ORDER_NOT_FOUND"
  | "FIAT_WEBHOOK_NOT_CONFIGURED"
  | "FIAT_WEBHOOK_SIGNATURE_INVALID"
  | "FIAT_WEBHOOK_INVALID";

export class FiatPaymentError extends Error {
  constructor(
    public readonly code: FiatPaymentErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "FiatPaymentError";
  }
}

export class FiatProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "FiatProviderError";
  }
}

export class FiatPaymentService {
  constructor(
    private readonly store: FiatPaymentStore,
    private readonly gateway: FiatPaymentGateway | null,
    private readonly policy: FiatPaymentPolicy,
    private readonly clock: () => Date = () => new Date(),
    private readonly schedule: (
      task: () => Promise<void>,
    ) => void = scheduleBestEffort,
  ) {
    if (policy.mode !== "test") {
      throw new Error(
        "Mercado Pago live mode is not authorized in this release",
      );
    }
  }

  async checkout(
    user: PublicUser,
    request: FiatCheckoutRequest,
    idempotencyKey: string,
    deviceId: string | undefined,
  ): Promise<FiatOrderResponse> {
    this.assertCheckoutAllowed(user, deviceId);
    const gateway = this.requireGateway();
    if (request.termsVersion !== FIAT_CHECKOUT_TERMS_VERSION) {
      throw new FiatPaymentError(
        "FIAT_TERMS_CHANGED",
        "The checkout terms changed; refresh the catalog before continuing",
        409,
      );
    }

    const now = this.clock();
    const leaseToken = randomUUID();
    const reservation = await this.store.reserveCheckout({
      userId: user.id,
      productVersionId: request.productVersionId,
      idempotencyKey: hash(`${user.id}:${idempotencyKey}`),
      requestHash: hash(
        canonical({
          userId: user.id,
          productVersionId: request.productVersionId,
          quantity: request.quantity,
          termsVersion: request.termsVersion,
          refundPolicyVersion: request.refundPolicyVersion,
        }),
      ),
      termsVersion: request.termsVersion,
      refundPolicyVersion: request.refundPolicyVersion,
      leaseToken,
      now,
      leaseTimeoutMs: CHECKOUT_LEASE_MS,
    });

    if (reservation.order.checkout) {
      return response(reservation.order, true, now);
    }
    if (reservation.leaseToken !== leaseToken) {
      throw new FiatPaymentError(
        "FIAT_CHECKOUT_BUSY",
        "The sandbox checkout is already being prepared; retry shortly",
        409,
        true,
      );
    }

    try {
      const recovered = await gateway.recoverPreference(reservation.order.id);
      const preference =
        recovered ??
        (await gateway.createPreference({
          externalReference: reservation.order.id,
          productVersionId: reservation.product.productVersionId,
          sku: reservation.product.sku,
          name: reservation.product.name,
          description: reservation.product.description,
          currency: reservation.product.currency,
          amountMinor: reservation.product.amountMinor,
          payerEmail: user.email,
          expiresAt: new Date(now.getTime() + CHECKOUT_TTL_MS),
          returnUrl: `${this.policy.appBaseUrl}/app/store/fiat/orders/${reservation.order.id}`,
        }));
      this.assertPreference(preference, reservation);
      const completed = await this.store.completeCheckout({
        orderId: reservation.order.id,
        attemptId: reservation.attemptId,
        leaseToken,
        preference,
        now: this.clock(),
      });
      return response(
        completed,
        reservation.replayed || recovered !== null,
        this.clock(),
      );
    } catch (error) {
      const mismatch =
        error instanceof FiatPaymentError &&
        error.code === "FIAT_PROVIDER_MISMATCH";
      const terminalProviderFailure =
        error instanceof FiatProviderError && !error.retryable;
      await this.store.failCheckout({
        orderId: reservation.order.id,
        attemptId: reservation.attemptId,
        leaseToken,
        reasonCode:
          error instanceof FiatProviderError
            ? error.code
            : mismatch
              ? "PROVIDER_RESPONSE_MISMATCH"
              : "PROVIDER_REQUEST_FAILED",
        terminal: mismatch || terminalProviderFailure,
        now: this.clock(),
      });
      if (error instanceof FiatPaymentError) throw error;
      throw new FiatPaymentError(
        terminalProviderFailure
          ? "FIAT_PROVIDER_MISMATCH"
          : "FIAT_PROVIDER_UNAVAILABLE",
        terminalProviderFailure
          ? "Mercado Pago returned a non-retryable checkout error"
          : "Mercado Pago TEST is temporarily unavailable",
        terminalProviderFailure ? 502 : 503,
        !terminalProviderFailure,
      );
    }
  }

  async order(user: PublicUser, orderId: string): Promise<FiatOrderResponse> {
    assertActive(user);
    const order = await this.store.orderForUser(user.id, orderId);
    if (!order) {
      throw new FiatPaymentError(
        "FIAT_ORDER_NOT_FOUND",
        "The fiat sandbox order does not exist",
        404,
      );
    }
    return response(order, false, this.clock());
  }

  async webhook(input: {
    dataId: string | undefined;
    xRequestId: string | undefined;
    xSignature: string | undefined;
    queryType: string | undefined;
    payload: unknown;
  }) {
    const secret = this.policy.webhookSecret;
    if (!secret) {
      throw new FiatPaymentError(
        "FIAT_WEBHOOK_NOT_CONFIGURED",
        "The Mercado Pago TEST webhook is not configured",
        503,
        true,
      );
    }
    const dataId = normalizeProviderDataId(input.dataId);
    if (!dataId || !PROVIDER_ID.test(dataId)) {
      throw new FiatPaymentError(
        "FIAT_WEBHOOK_INVALID",
        "A valid signed Mercado Pago data.id is required",
        400,
      );
    }
    try {
      WebhookSignatureValidator.validate({
        xSignature: input.xSignature,
        xRequestId: input.xRequestId,
        dataId,
        secret,
        toleranceSeconds: WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
        now: () => this.clock().getTime(),
      });
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) {
        throw new FiatPaymentError(
          "FIAT_WEBHOOK_SIGNATURE_INVALID",
          "Invalid Mercado Pago webhook signature",
          401,
        );
      }
      throw error;
    }

    const now = this.clock();
    const signatureTimestamp = signatureTimestampFrom(input.xSignature);
    if (!signatureTimestamp) {
      throw new FiatPaymentError(
        "FIAT_WEBHOOK_SIGNATURE_INVALID",
        "Invalid Mercado Pago webhook signature",
        401,
      );
    }
    const payload = asRecord(input.payload) ?? {};
    const payloadHash = hash(canonical(payload));
    const providerEventId = primitiveString(payload.id);
    const dedupeKey = hash(
      canonical({
        dataId,
        requestId: input.xRequestId?.trim() || null,
        timestamp: signatureTimestamp,
      }),
    );
    const inbox = await this.store.recordWebhook({
      dedupeKey,
      providerEventId,
      providerObjectId: dataId,
      payloadHash,
      payload,
      signatureVerifiedAt: now,
    });
    if (inbox.status === "PROCESSED" || inbox.status === "IGNORED") {
      return { accepted: true, replayed: true, status: inbox.status } as const;
    }

    if (input.queryType && input.queryType !== "payment") {
      await this.store.ignoreWebhook(inbox.id, now, "UNSUPPORTED_TOPIC");
      return {
        accepted: true,
        replayed: inbox.replayed,
        status: "IGNORED",
      } as const;
    }

    this.schedule(async () => {
      await this.processWebhook(inbox.id, dataId);
    });
    return {
      accepted: true,
      replayed: inbox.replayed,
      status: inbox.status === "FAILED" ? "RECEIVED" : inbox.status,
    } as const;
  }

  async reconcile(limit = 50) {
    const now = this.clock();
    const normalizedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 50;
    const boundedLimit = Math.max(1, Math.min(normalizedLimit, 200));
    const webhookCandidates = await this.store.webhookReconciliationCandidates({
      now,
      limit: boundedLimit,
    });
    const orderCandidates = await this.store.orderReconciliationCandidates({
      now,
      staleBefore: new Date(now.getTime() - ORDER_RECONCILIATION_INTERVAL_MS),
      expiredAfter: new Date(
        now.getTime() - ORDER_RECONCILIATION_EXPIRED_GRACE_MS,
      ),
      limit: boundedLimit,
    });
    let processed = 0;
    let failed = 0;
    for (const candidate of webhookCandidates) {
      const result = await this.processWebhook(
        candidate.id,
        candidate.providerObjectId,
      );
      if (result === "PROCESSED") processed += 1;
      if (result === "FAILED") failed += 1;
    }
    const gateway = this.requireGateway();
    for (const candidate of orderCandidates) {
      try {
        const paymentIds = await gateway.searchPaymentIds(
          candidate.externalReference,
        );
        for (const paymentId of paymentIds) {
          const payment = await gateway.getPayment(paymentId);
          if (payment.externalReference !== candidate.externalReference) {
            throw new FiatProviderError(
              "MP_PAYMENT_SEARCH_MISMATCH",
              "Mercado Pago search returned a payment for another order",
              false,
            );
          }
          await this.apply(null, payment);
        }
        await this.store.markOrderReconciliationAttempt(
          candidate.id,
          this.clock(),
          paymentIds.length > 0,
        );
        processed += 1;
      } catch (error) {
        const reasonCode =
          error instanceof FiatProviderError
            ? error.code
            : error instanceof FiatPaymentError
              ? error.code
              : "ORDER_RECONCILIATION_FAILED";
        await this.store.failOrderReconciliation({
          orderId: candidate.id,
          now: this.clock(),
          reasonCode,
          terminal: isTerminalReconciliationFailure(error),
        });
        failed += 1;
      }
    }
    return {
      selected: webhookCandidates.length + orderCandidates.length,
      processed,
      failed,
    };
  }

  private async processWebhook(webhookId: string, dataId: string) {
    if (
      !(await this.store.claimWebhook(webhookId, this.clock(), WEBHOOK_LOCK_MS))
    ) {
      return "SKIPPED" as const;
    }
    try {
      const payment = await this.requireGateway().getPayment(dataId);
      await this.apply(webhookId, payment);
      return "PROCESSED" as const;
    } catch (error) {
      await this.store.failWebhook({
        webhookId,
        reasonCode:
          error instanceof FiatProviderError
            ? error.code
            : "PAYMENT_RECONCILIATION_FAILED",
        now: this.clock(),
        retryAt: new Date(this.clock().getTime() + WEBHOOK_RETRY_MS),
      });
      return "FAILED" as const;
    }
  }

  private async apply(webhookId: string | null, payment: ProviderPayment) {
    const sellerUserId = this.policy.sellerUserId;
    const applicationId = this.policy.applicationId;
    if (!sellerUserId || !applicationId) {
      throw new FiatPaymentError(
        "FIAT_PROVIDER_NOT_CONFIGURED",
        "Mercado Pago TEST identity is incomplete",
        503,
        true,
      );
    }
    return this.store.applyPayment({
      webhookId,
      payment,
      expectedSellerUserId: sellerUserId,
      expectedApplicationId: applicationId,
      expectedLiveMode: false,
      now: this.clock(),
    });
  }

  private assertCheckoutAllowed(
    user: PublicUser,
    deviceId: string | undefined,
  ) {
    assertActive(user);
    if (!this.policy.checkoutEnabled) {
      throw new FiatPaymentError(
        "FIAT_CHECKOUT_DISABLED",
        "The Mercado Pago sandbox checkout is disabled",
        404,
      );
    }
    const allowed = this.policy.checkoutAllowedUsers.some(
      (entry) =>
        entry.toLowerCase() === user.id.toLowerCase() ||
        entry.toLowerCase() === user.email.toLowerCase(),
    );
    if (!allowed) {
      throw new FiatPaymentError(
        "FIAT_CHECKOUT_NOT_ALLOWED",
        "This account is not allowlisted for sandbox payments",
        403,
      );
    }
    if (!deviceId) {
      throw new FiatPaymentError(
        "FIAT_DEVICE_REQUIRED",
        "A session-bound device is required for sandbox checkout",
        400,
      );
    }
  }

  private requireGateway() {
    if (!this.gateway) {
      throw new FiatPaymentError(
        "FIAT_PROVIDER_NOT_CONFIGURED",
        "Mercado Pago TEST is not configured",
        503,
        true,
      );
    }
    return this.gateway;
  }

  private assertPreference(
    preference: ProviderPreference,
    reservation: CheckoutReservation,
  ) {
    const expectedSeller = this.policy.sellerUserId;
    const valid =
      expectedSeller !== undefined &&
      preference.externalReference === reservation.order.id &&
      preference.collectorId === expectedSeller &&
      preference.currency === reservation.product.currency &&
      preference.amountMinor === reservation.product.amountMinor &&
      isMercadoPagoHttps(preference.checkoutUrl);
    if (!valid) {
      throw new FiatPaymentError(
        "FIAT_PROVIDER_MISMATCH",
        "Mercado Pago returned a checkout that does not match the server order",
        502,
      );
    }
  }
}

function response(
  order: StoredFiatOrder,
  replayed: boolean,
  now: Date,
): FiatOrderResponse {
  return {
    serverNow: now.toISOString(),
    mode: "SANDBOX",
    realChargeEnabled: false,
    provider: "MERCADO_PAGO",
    environment: "TEST",
    order: {
      id: order.id,
      status: order.status,
      productVersionId: order.productVersionId,
      sku: order.sku,
      name: order.name,
      quantity: 1,
      price: {
        currency: "COP",
        minorUnits: order.amountMinor.toString(),
        exponent: 0,
      },
      termsVersion: order.termsVersion,
      refundPolicyVersion: order.refundPolicyVersion,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      checkout: order.checkout
        ? {
            preferenceId: order.checkout.preferenceId,
            url: order.checkout.url,
            expiresAt: order.checkout.expiresAt.toISOString(),
          }
        : null,
      entitlementId: order.entitlementId,
      reasonCode: orderReason(order, now),
    },
    replayed,
  };
}

function orderReason(order: StoredFiatOrder, now: Date) {
  if (
    order.status === "CHECKOUT_READY" &&
    order.checkout &&
    order.checkout.expiresAt <= now
  ) {
    return "CHECKOUT_EXPIRED";
  }
  switch (order.status) {
    case "CREATED":
      return "CHECKOUT_PREPARING";
    case "PENDING":
      return "PAYMENT_PENDING";
    case "HELD":
      return "PAYMENT_REVIEW_REQUIRED";
    case "DISPUTED":
      return "PAYMENT_DISPUTED";
    case "CANCELLED":
      return "PAYMENT_CANCELLED";
    case "EXPIRED":
      return "CHECKOUT_EXPIRED";
    case "REFUND_PENDING":
      return "REFUND_PENDING";
    case "REFUNDED":
      return "PAYMENT_REFUNDED";
    default:
      return null;
  }
}

function assertActive(user: PublicUser) {
  if (user.status !== "ACTIVE") {
    throw new FiatPaymentError(
      "FIAT_ACCOUNT_NOT_ELIGIBLE",
      "An active, verified account is required",
      403,
    );
  }
}

function isMercadoPagoHttps(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "mercadopago.com" ||
        url.hostname.endsWith(".mercadopago.com") ||
        url.hostname === "mercadopago.com.co" ||
        url.hostname.endsWith(".mercadopago.com.co"))
    );
  } catch {
    return false;
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function primitiveString(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

function normalizeProviderDataId(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /^[A-Za-z0-9]+$/.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

function signatureTimestampFrom(value: string | undefined) {
  if (!value) return null;
  for (const part of value.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim().toLowerCase();
    const candidate = part.slice(separator + 1).trim();
    if (key === "ts" && /^\d+$/.test(candidate)) return candidate;
  }
  return null;
}

function scheduleBestEffort(task: () => Promise<void>) {
  setImmediate(() => {
    void task().catch(() => undefined);
  });
}

function isTerminalReconciliationFailure(error: unknown) {
  return (
    error instanceof FiatProviderError &&
    [
      "MP_PAYMENT_SEARCH_MISMATCH",
      "MP_PAYMENT_SEARCH_TRUNCATED",
      "MP_PAYMENT_ID_MISMATCH",
      "MP_MERCHANT_ORDER_MISMATCH",
      "MP_RESPONSE_INVALID",
    ].includes(error.code)
  );
}

const PROVIDER_ID = /^[A-Za-z0-9._:-]{1,256}$/;
const CHECKOUT_LEASE_MS = 2 * 60 * 1000;
const CHECKOUT_TTL_MS = 30 * 60 * 1000;
const WEBHOOK_LOCK_MS = 2 * 60 * 1000;
const WEBHOOK_RETRY_MS = 5 * 60 * 1000;
const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const ORDER_RECONCILIATION_INTERVAL_MS = 60 * 1000;
const ORDER_RECONCILIATION_EXPIRED_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
