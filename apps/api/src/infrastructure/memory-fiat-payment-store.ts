import { randomUUID } from "node:crypto";
import {
  FiatPaymentError,
  type CheckoutReservation,
  type FiatPaymentStore,
  type ProviderPayment,
  type StoredFiatOrder,
} from "../domain/fiat-payments.js";
import {
  FIAT_CATALOG_PRODUCTS,
  FIAT_REFUND_POLICY_VERSION,
} from "../domain/fiat-catalog.js";

export type MemoryFiatProduct = {
  productVersionId: string;
  sku: string;
  name: string;
  description: string;
  amountMinor: bigint;
  refundPolicyVersion: string;
  available: boolean;
};

type MemoryOrder = Mutable<StoredFiatOrder> & {
  idempotencyKey: string;
  requestHash: string;
  product: MemoryFiatProduct;
  attemptId: string;
  leaseToken: string | null;
  leaseAt: Date | null;
  paidPaymentId: string | null;
  lastProviderSyncAt: Date | null;
};

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type MemoryWebhook = {
  id: string;
  providerObjectId: string;
  payloadHash: string;
  status:
    | "RECEIVED"
    | "PROCESSING"
    | "PROCESSED"
    | "IGNORED"
    | "FAILED"
    | "DEAD_LETTER";
  attemptCount: number;
  lockedAt: Date | null;
  nextRetryAt: Date | null;
};

export class MemoryFiatPaymentStore implements FiatPaymentStore {
  private readonly products = new Map<string, MemoryFiatProduct>();
  private readonly orders = new Map<string, MemoryOrder>();
  private readonly orderByKey = new Map<string, string>();
  private readonly webhooks = new Map<string, MemoryWebhook>();
  private readonly webhookByKey = new Map<string, string>();

  constructor(products: MemoryFiatProduct[] = defaultProducts()) {
    for (const product of products)
      this.products.set(product.productVersionId, product);
  }

  async reserveCheckout(
    input: Parameters<FiatPaymentStore["reserveCheckout"]>[0],
  ): Promise<CheckoutReservation> {
    const existingId = this.orderByKey.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.orders.get(existingId)!;
      if (
        existing.userId !== input.userId ||
        existing.productVersionId !== input.productVersionId ||
        existing.requestHash !== input.requestHash ||
        existing.termsVersion !== input.termsVersion ||
        existing.refundPolicyVersion !== input.refundPolicyVersion
      ) {
        throw new FiatPaymentError(
          "FIAT_IDEMPOTENCY_CONFLICT",
          "The idempotency key was already used for another checkout",
          409,
        );
      }
      if (!existing.checkout) {
        const lockExpired =
          existing.leaseAt === null ||
          existing.leaseAt.getTime() <
            input.now.getTime() - input.leaseTimeoutMs;
        if (existing.leaseToken === null || lockExpired) {
          existing.leaseToken = input.leaseToken;
          existing.leaseAt = input.now;
        }
      }
      return this.reservation(existing, true);
    }
    const product = this.products.get(input.productVersionId);
    if (
      !product?.available ||
      product.refundPolicyVersion !== input.refundPolicyVersion
    ) {
      throw new FiatPaymentError(
        product && product.refundPolicyVersion !== input.refundPolicyVersion
          ? "FIAT_TERMS_CHANGED"
          : "FIAT_PRODUCT_NOT_AVAILABLE",
        "The selected sandbox product is not available",
        409,
      );
    }
    const now = new Date(input.now);
    const order: MemoryOrder = {
      id: randomUUID(),
      userId: input.userId,
      status: "CREATED",
      productVersionId: product.productVersionId,
      sku: product.sku,
      name: product.name,
      quantity: 1,
      currency: "COP",
      amountMinor: product.amountMinor,
      termsVersion: input.termsVersion,
      refundPolicyVersion: input.refundPolicyVersion,
      createdAt: now,
      updatedAt: now,
      checkout: null,
      entitlementId: null,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      product,
      attemptId: randomUUID(),
      leaseToken: input.leaseToken,
      leaseAt: now,
      paidPaymentId: null,
      lastProviderSyncAt: null,
    };
    this.orders.set(order.id, order);
    this.orderByKey.set(input.idempotencyKey, order.id);
    return this.reservation(order, false);
  }

  async completeCheckout(
    input: Parameters<FiatPaymentStore["completeCheckout"]>[0],
  ) {
    const order = this.requiredOrder(input.orderId);
    if (
      order.attemptId !== input.attemptId ||
      order.leaseToken !== input.leaseToken
    ) {
      throw new FiatPaymentError(
        "FIAT_CHECKOUT_BUSY",
        "The checkout lease was lost",
        409,
        true,
      );
    }
    order.checkout = {
      preferenceId: input.preference.id,
      url: input.preference.checkoutUrl,
      expiresAt: input.preference.expiresAt,
    };
    order.status = "CHECKOUT_READY";
    order.leaseToken = null;
    order.leaseAt = null;
    order.updatedAt = input.now;
    return publicOrder(order);
  }

  async failCheckout(input: Parameters<FiatPaymentStore["failCheckout"]>[0]) {
    const order = this.orders.get(input.orderId);
    if (!order || order.leaseToken !== input.leaseToken) return;
    order.leaseToken = null;
    order.leaseAt = null;
    if (input.terminal) order.status = "HELD";
    order.updatedAt = input.now;
  }

  async orderForUser(userId: string, orderId: string) {
    const order = this.orders.get(orderId);
    return order?.userId === userId ? publicOrder(order) : null;
  }

  async recordWebhook(input: Parameters<FiatPaymentStore["recordWebhook"]>[0]) {
    const existingId = this.webhookByKey.get(input.dedupeKey);
    if (existingId) {
      const existing = this.webhooks.get(existingId)!;
      if (existing.providerObjectId !== input.providerObjectId) {
        throw new FiatPaymentError(
          "FIAT_WEBHOOK_INVALID",
          "A webhook dedupe key was reused for another provider object",
          409,
        );
      }
      return { ...existing, replayed: true };
    }
    const webhook: MemoryWebhook = {
      id: randomUUID(),
      providerObjectId: input.providerObjectId,
      payloadHash: input.payloadHash,
      status: "RECEIVED",
      attemptCount: 0,
      lockedAt: null,
      nextRetryAt: null,
    };
    this.webhooks.set(webhook.id, webhook);
    this.webhookByKey.set(input.dedupeKey, webhook.id);
    return { ...webhook, replayed: false };
  }

  async ignoreWebhook(webhookId: string, now: Date) {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) return;
    webhook.status = "IGNORED";
    webhook.lockedAt = null;
    webhook.nextRetryAt = null;
    void now;
  }

  async claimWebhook(webhookId: string, now: Date, lockTimeoutMs: number) {
    const webhook = this.webhooks.get(webhookId);
    if (
      !webhook ||
      ["PROCESSED", "IGNORED", "DEAD_LETTER"].includes(webhook.status)
    )
      return false;
    if (webhook.nextRetryAt && webhook.nextRetryAt > now) return false;
    if (
      webhook.status === "PROCESSING" &&
      webhook.lockedAt &&
      webhook.lockedAt.getTime() >= now.getTime() - lockTimeoutMs
    ) {
      return false;
    }
    webhook.status = "PROCESSING";
    webhook.lockedAt = now;
    webhook.attemptCount += 1;
    return true;
  }

  async applyPayment(input: Parameters<FiatPaymentStore["applyPayment"]>[0]) {
    const webhook = input.webhookId
      ? this.webhooks.get(input.webhookId)
      : undefined;
    if (input.webhookId && !webhook) throw new Error("Unknown memory webhook");
    if (webhook?.status === "PROCESSED") {
      return { orderId: null, fulfilled: false, orderStatus: "PROCESSED" };
    }
    const order = this.orders.get(input.payment.externalReference);
    if (!order) {
      if (webhook) {
        webhook.status = "IGNORED";
        webhook.lockedAt = null;
      }
      return { orderId: null, fulfilled: false, orderStatus: "IGNORED" };
    }
    const valid = paymentMatches(order, input);
    const approved =
      input.payment.status === "approved" &&
      input.payment.statusDetail === "accredited";
    let fulfilled = false;
    if (!valid) {
      order.status = "HELD";
    } else if (input.payment.status === "charged_back") {
      if (
        ["PAID", "REFUND_PENDING", "REFUNDED", "DISPUTED"].includes(
          order.status,
        )
      )
        order.status = "DISPUTED";
      else order.status = "HELD";
    } else if (
      input.payment.status === "refunded" ||
      input.payment.refundedAmountMinor === input.payment.amountMinor
    ) {
      if (["PAID", "REFUND_PENDING"].includes(order.status))
        order.status = "REFUNDED";
      else if (!["REFUNDED", "DISPUTED"].includes(order.status))
        order.status = "HELD";
    } else if (input.payment.refundedAmountMinor > 0n) {
      if (["PAID", "REFUND_PENDING"].includes(order.status))
        order.status = "DISPUTED";
      else if (!["REFUNDED", "DISPUTED"].includes(order.status))
        order.status = "HELD";
    } else if (approved) {
      if (order.status !== "PAID") {
        order.status = "PAID";
        order.paidPaymentId = input.payment.id;
        order.entitlementId = randomUUID();
        fulfilled = true;
      } else if (order.paidPaymentId !== input.payment.id) {
        order.status = "DISPUTED";
      }
    } else if (
      ["pending", "in_process", "authorized"].includes(input.payment.status)
    ) {
      if (order.status !== "PAID") order.status = "PENDING";
    } else if (order.status !== "PAID") {
      order.status =
        input.payment.status === "cancelled" ? "CANCELLED" : "HELD";
    }
    order.updatedAt = input.now;
    if (webhook) {
      webhook.status = "PROCESSED";
      webhook.lockedAt = null;
    }
    return { orderId: order.id, fulfilled, orderStatus: order.status };
  }

  async failWebhook(input: Parameters<FiatPaymentStore["failWebhook"]>[0]) {
    const webhook = this.webhooks.get(input.webhookId);
    if (!webhook) return;
    webhook.status = webhook.attemptCount >= 12 ? "DEAD_LETTER" : "FAILED";
    webhook.lockedAt = null;
    webhook.nextRetryAt =
      webhook.status === "DEAD_LETTER" ? null : input.retryAt;
  }

  async webhookReconciliationCandidates(
    input: Parameters<FiatPaymentStore["webhookReconciliationCandidates"]>[0],
  ) {
    return [...this.webhooks.values()]
      .filter(
        (webhook) =>
          ["RECEIVED", "FAILED"].includes(webhook.status) &&
          (!webhook.nextRetryAt || webhook.nextRetryAt <= input.now),
      )
      .slice(0, input.limit)
      .map(({ id, providerObjectId }) => ({ id, providerObjectId }));
  }

  async orderReconciliationCandidates(
    input: Parameters<FiatPaymentStore["orderReconciliationCandidates"]>[0],
  ) {
    return [...this.orders.values()]
      .filter(
        (order) =>
          order.checkout !== null &&
          ["CHECKOUT_READY", "PENDING", "EXPIRED"].includes(order.status) &&
          (order.status !== "EXPIRED" ||
            order.checkout.expiresAt >= input.expiredAfter) &&
          (!order.lastProviderSyncAt ||
            order.lastProviderSyncAt <= input.staleBefore),
      )
      .slice(0, input.limit)
      .map(({ id }) => ({ id, externalReference: id }));
  }

  async markOrderReconciliationAttempt(
    orderId: string,
    now: Date,
    paymentFound: boolean,
  ) {
    const order = this.orders.get(orderId);
    if (!order) return;
    order.lastProviderSyncAt = now;
    if (
      !paymentFound &&
      order.status === "CHECKOUT_READY" &&
      order.checkout &&
      order.checkout.expiresAt <= now
    ) {
      order.status = "EXPIRED";
      order.updatedAt = now;
    }
  }

  async failOrderReconciliation(
    input: Parameters<FiatPaymentStore["failOrderReconciliation"]>[0],
  ) {
    const order = this.orders.get(input.orderId);
    if (!order) return;
    order.lastProviderSyncAt = input.now;
    if (
      input.terminal &&
      ["CHECKOUT_READY", "PENDING", "EXPIRED"].includes(order.status)
    ) {
      order.status = "HELD";
      order.updatedAt = input.now;
    }
  }

  private reservation(
    order: MemoryOrder,
    replayed: boolean,
  ): CheckoutReservation {
    return {
      order: publicOrder(order),
      attemptId: order.attemptId,
      leaseToken: order.leaseToken,
      replayed,
      product: {
        productVersionId: order.product.productVersionId,
        sku: order.product.sku,
        name: order.product.name,
        description: order.product.description,
        currency: "COP",
        amountMinor: order.product.amountMinor,
      },
    };
  }

  private requiredOrder(id: string) {
    const order = this.orders.get(id);
    if (!order) throw new Error("Unknown memory fiat order");
    return order;
  }
}

function publicOrder(order: MemoryOrder): StoredFiatOrder {
  return {
    id: order.id,
    userId: order.userId,
    status: order.status,
    productVersionId: order.productVersionId,
    sku: order.sku,
    name: order.name,
    quantity: 1,
    currency: "COP",
    amountMinor: order.amountMinor,
    termsVersion: order.termsVersion,
    refundPolicyVersion: order.refundPolicyVersion,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    checkout: order.checkout,
    entitlementId: order.entitlementId,
  };
}

function paymentMatches(
  order: MemoryOrder,
  input: Parameters<FiatPaymentStore["applyPayment"]>[0],
) {
  return (
    input.payment.externalReference === order.id &&
    input.payment.preferenceId === order.checkout?.preferenceId &&
    input.payment.collectorId === input.expectedSellerUserId &&
    input.payment.applicationId === input.expectedApplicationId &&
    input.payment.liveMode === input.expectedLiveMode &&
    input.payment.currency === "COP" &&
    input.payment.amountMinor === order.amountMinor
  );
}

function defaultProducts(): MemoryFiatProduct[] {
  return FIAT_CATALOG_PRODUCTS.map((product) => ({
    productVersionId: product.productVersionId,
    sku: product.sku,
    name: product.name,
    description: product.description,
    amountMinor: BigInt(product.priceMinorUnits),
    refundPolicyVersion: FIAT_REFUND_POLICY_VERSION,
    available: false,
  }));
}

export function activeMemoryFiatProduct(
  input: Partial<MemoryFiatProduct> = {},
): MemoryFiatProduct {
  const source = FIAT_CATALOG_PRODUCTS.find(
    ({ sandboxReady }) => sandboxReady,
  )!;
  return {
    productVersionId: source.productVersionId,
    sku: source.sku,
    name: source.name,
    description: source.description,
    amountMinor: BigInt(source.priceMinorUnits),
    refundPolicyVersion: FIAT_REFUND_POLICY_VERSION,
    available: true,
    ...input,
  };
}
