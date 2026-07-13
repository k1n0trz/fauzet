import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fiatOrderResponseSchema, type PublicUser } from "@fauzet/contracts";
import {
  FIAT_CHECKOUT_TERMS_VERSION,
  FIAT_REFUND_POLICY_VERSION,
} from "./fiat-catalog.js";
import {
  FiatPaymentService,
  FiatProviderError,
  type FiatPaymentGateway,
  type ProviderPayment,
  type ProviderPreference,
} from "./fiat-payments.js";
import {
  activeMemoryFiatProduct,
  MemoryFiatPaymentStore,
} from "../infrastructure/memory-fiat-payment-store.js";

const NOW = new Date("2026-07-14T01:00:00.000Z");
const USER: PublicUser = {
  id: "20000000-0000-4000-8000-000000000001",
  email: "mp-buyer@fauzet.local",
  displayName: "MP Buyer",
  locale: "es",
  countryCode: "CO",
  status: "ACTIVE",
  roles: ["USER"],
};
const SECRET = "test-webhook-secret-with-32-characters";
const SELLER_ID = "1234567890";
const APPLICATION_ID = "123456789012345";

describe("FiatPaymentService", () => {
  it("creates one preference for idempotent retries and returns the same order", async () => {
    const product = activeMemoryFiatProduct();
    const gateway = new FakeGateway();
    const service = createService(
      new MemoryFiatPaymentStore([product]),
      gateway,
    );
    const request = checkoutRequest(product.productVersionId);

    const first = fiatOrderResponseSchema.parse(
      await service.checkout(USER, request, "checkout-attempt-0001", "device"),
    );
    const replay = fiatOrderResponseSchema.parse(
      await service.checkout(USER, request, "checkout-attempt-0001", "device"),
    );

    expect(first.order.id).toBe(replay.order.id);
    expect(first.order.status).toBe("CHECKOUT_READY");
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(gateway.created).toBe(1);
    expect(gateway.recovered).toBe(1);
  });

  it("rejects an idempotency key reused for another product", async () => {
    const first = activeMemoryFiatProduct();
    const second = activeMemoryFiatProduct({
      productVersionId: "10000000-0000-4000-8000-000000000099",
      sku: "SECOND_TEST_PRODUCT",
    });
    const service = createService(
      new MemoryFiatPaymentStore([first, second]),
      new FakeGateway(),
    );
    await service.checkout(
      USER,
      checkoutRequest(first.productVersionId),
      "same-checkout-key",
      "device",
    );

    await expect(
      service.checkout(
        USER,
        checkoutRequest(second.productVersionId),
        "same-checkout-key",
        "device",
      ),
    ).rejects.toMatchObject({ code: "FIAT_IDEMPOTENCY_CONFLICT" });
  });

  it("fulfills an approved signed payment exactly once", async () => {
    const product = activeMemoryFiatProduct();
    const gateway = new FakeGateway();
    const store = new MemoryFiatPaymentStore([product]);
    const service = createService(store, gateway);
    const checkout = await service.checkout(
      USER,
      checkoutRequest(product.productVersionId),
      "approved-payment-key",
      "device",
    );
    gateway.payments.set(
      "900000000001",
      payment({
        id: "900000000001",
        externalReference: checkout.order.id,
        preferenceId: checkout.order.checkout!.preferenceId,
        amountMinor: BigInt(product.amountMinor),
      }),
    );
    const signed = webhook("900000000001", "evt-approved-1");

    const first = await service.webhook(signed);
    const replay = await service.webhook(signed);
    await service.reconcile();
    const order = await service.order(USER, checkout.order.id);

    expect(first).toMatchObject({ status: "RECEIVED" });
    expect(replay).toMatchObject({ status: "RECEIVED", replayed: true });
    expect(order.order.status).toBe("PAID");
    expect(order.order.entitlementId).toMatch(UUID);
    expect(gateway.paymentReads).toBe(1);
  });

  it("rejects an invalid signature before reading Mercado Pago", async () => {
    const gateway = new FakeGateway();
    const service = createService(
      new MemoryFiatPaymentStore([activeMemoryFiatProduct()]),
      gateway,
    );

    await expect(
      service.webhook({
        dataId: "900000000002",
        queryType: "payment",
        xRequestId: "request-invalid",
        xSignature: "ts=1,v1=invalid",
        payload: { id: "evt-invalid", action: "payment.updated" },
      }),
    ).rejects.toMatchObject({ code: "FIAT_WEBHOOK_SIGNATURE_INVALID" });
    expect(gateway.paymentReads).toBe(0);
  });

  it("holds a payment whose authoritative seller does not match", async () => {
    const product = activeMemoryFiatProduct();
    const gateway = new FakeGateway();
    const service = createService(
      new MemoryFiatPaymentStore([product]),
      gateway,
    );
    const checkout = await service.checkout(
      USER,
      checkoutRequest(product.productVersionId),
      "mismatch-payment-key",
      "device",
    );
    gateway.payments.set(
      "900000000003",
      payment({
        id: "900000000003",
        externalReference: checkout.order.id,
        preferenceId: checkout.order.checkout!.preferenceId,
        collectorId: "9999999999",
        amountMinor: product.amountMinor,
      }),
    );

    await service.webhook(webhook("900000000003", "evt-mismatch-1"));
    await service.reconcile();
    const order = await service.order(USER, checkout.order.id);
    expect(order.order.status).toBe("HELD");
    expect(order.order.entitlementId).toBeNull();
  });

  it("reconciles an approved TEST payment even when no webhook arrives", async () => {
    const product = activeMemoryFiatProduct();
    const gateway = new FakeGateway();
    const service = createService(
      new MemoryFiatPaymentStore([product]),
      gateway,
    );
    const checkout = await service.checkout(
      USER,
      checkoutRequest(product.productVersionId),
      "polling-payment-key",
      "device",
    );
    const paymentId = "900000000004";
    gateway.paymentIdsByReference.set(checkout.order.id, [paymentId]);
    gateway.payments.set(
      paymentId,
      payment({
        id: paymentId,
        externalReference: checkout.order.id,
        preferenceId: checkout.order.checkout!.preferenceId,
        amountMinor: product.amountMinor,
      }),
    );

    await expect(service.reconcile()).resolves.toMatchObject({
      processed: 1,
      failed: 0,
    });
    expect((await service.order(USER, checkout.order.id)).order).toMatchObject({
      status: "PAID",
      entitlementId: expect.stringMatching(UUID),
    });
  });

  it("fails closed when the merchant order preference is not the issued checkout", async () => {
    const product = activeMemoryFiatProduct();
    const gateway = new FakeGateway();
    const service = createService(
      new MemoryFiatPaymentStore([product]),
      gateway,
    );
    const checkout = await service.checkout(
      USER,
      checkoutRequest(product.productVersionId),
      "wrong-preference-key",
      "device",
    );
    const paymentId = "900000000005";
    gateway.paymentIdsByReference.set(checkout.order.id, [paymentId]);
    gateway.payments.set(
      paymentId,
      payment({
        id: paymentId,
        externalReference: checkout.order.id,
        preferenceId: "another-preference",
        amountMinor: product.amountMinor,
      }),
    );

    await service.reconcile();
    expect((await service.order(USER, checkout.order.id)).order).toMatchObject({
      status: "HELD",
      entitlementId: null,
    });
  });

  it("deduplicates a signed replay even when its unsigned body changes", async () => {
    const product = activeMemoryFiatProduct();
    const gateway = new FakeGateway();
    const service = createService(
      new MemoryFiatPaymentStore([product]),
      gateway,
    );
    const checkout = await service.checkout(
      USER,
      checkoutRequest(product.productVersionId),
      "signed-replay-key",
      "device",
    );
    const paymentId = "900000000006";
    gateway.payments.set(
      paymentId,
      payment({
        id: paymentId,
        externalReference: checkout.order.id,
        preferenceId: checkout.order.checkout!.preferenceId,
        amountMinor: product.amountMinor,
      }),
    );
    const signed = webhook(paymentId, "evt-replay-1");

    await service.webhook(signed);
    await service.webhook({
      ...signed,
      payload: { id: "changed", action: "payment.created", arbitrary: true },
    });
    await service.reconcile();
    expect(gateway.paymentReads).toBe(1);
  });

  it("marks a checkout without payments as expired after its provider TTL", async () => {
    const product = activeMemoryFiatProduct();
    const gateway = new FakeGateway();
    const store = new MemoryFiatPaymentStore([product]);
    let current = new Date(NOW);
    const service = new FiatPaymentService(
      store,
      gateway,
      paymentPolicy(),
      () => new Date(current),
      () => undefined,
    );
    const checkout = await service.checkout(
      USER,
      checkoutRequest(product.productVersionId),
      "expired-checkout-key",
      "device",
    );
    current = new Date(NOW.getTime() + 31 * 60_000);

    await service.reconcile();
    expect((await service.order(USER, checkout.order.id)).order.status).toBe(
      "EXPIRED",
    );
  });

  it("holds and throttles an order after a known reconciliation integrity failure", async () => {
    const product = activeMemoryFiatProduct();
    const gateway = new FakeGateway();
    const store = new MemoryFiatPaymentStore([product]);
    const service = createService(store, gateway);
    const checkout = await service.checkout(
      USER,
      checkoutRequest(product.productVersionId),
      "terminal-reconciliation-integrity-key",
      "device",
    );
    gateway.searchFailure = new FiatProviderError(
      "MP_RESPONSE_INVALID",
      "invalid authoritative response",
      false,
    );

    await expect(service.reconcile()).resolves.toMatchObject({
      selected: 1,
      processed: 0,
      failed: 1,
    });
    expect((await service.order(USER, checkout.order.id)).order.status).toBe(
      "HELD",
    );

    await expect(service.reconcile()).resolves.toMatchObject({
      selected: 0,
      processed: 0,
      failed: 0,
    });
    expect(gateway.searchReads).toBe(1);
  });

  it("throttles a retryable provider HTTP failure without holding the order", async () => {
    const product = activeMemoryFiatProduct();
    const gateway = new FakeGateway();
    const store = new MemoryFiatPaymentStore([product]);
    const service = createService(store, gateway);
    const checkout = await service.checkout(
      USER,
      checkoutRequest(product.productVersionId),
      "retryable-reconciliation-http-key",
      "device",
    );
    gateway.searchFailure = new FiatProviderError(
      "MP_HTTP_503",
      "provider unavailable",
      true,
    );

    await expect(service.reconcile()).resolves.toMatchObject({
      selected: 1,
      processed: 0,
      failed: 1,
    });
    expect((await service.order(USER, checkout.order.id)).order.status).toBe(
      "CHECKOUT_READY",
    );

    await expect(service.reconcile()).resolves.toMatchObject({ selected: 0 });
    expect(gateway.searchReads).toBe(1);
  });

  it("throttles a reconciliation configuration failure without holding the order", async () => {
    const product = activeMemoryFiatProduct();
    const gateway = new FakeGateway();
    const store = new MemoryFiatPaymentStore([product]);
    const configuredPolicy = paymentPolicy();
    const service = new FiatPaymentService(
      store,
      gateway,
      {
        checkoutEnabled: configuredPolicy.checkoutEnabled,
        checkoutAllowedUsers: configuredPolicy.checkoutAllowedUsers,
        mode: configuredPolicy.mode,
        sellerUserId: configuredPolicy.sellerUserId,
        webhookSecret: configuredPolicy.webhookSecret,
        appBaseUrl: configuredPolicy.appBaseUrl,
      },
      () => new Date(NOW),
      () => undefined,
    );
    const checkout = await service.checkout(
      USER,
      checkoutRequest(product.productVersionId),
      "reconciliation-configuration-key",
      "device",
    );
    const paymentId = "900000000007";
    gateway.paymentIdsByReference.set(checkout.order.id, [paymentId]);
    gateway.payments.set(
      paymentId,
      payment({
        id: paymentId,
        externalReference: checkout.order.id,
        preferenceId: checkout.order.checkout!.preferenceId,
        amountMinor: product.amountMinor,
      }),
    );

    await expect(service.reconcile()).resolves.toMatchObject({
      selected: 1,
      processed: 0,
      failed: 1,
    });
    expect((await service.order(USER, checkout.order.id)).order.status).toBe(
      "CHECKOUT_READY",
    );

    await expect(service.reconcile()).resolves.toMatchObject({ selected: 0 });
    expect(gateway.searchReads).toBe(1);
    expect(gateway.paymentReads).toBe(1);
  });

  it("does not label a non-retryable provider failure as temporary", async () => {
    const gateway = new FakeGateway();
    gateway.recoverFailure = new FiatProviderError(
      "MP_PREFERENCE_AMBIGUOUS",
      "ambiguous",
      false,
    );
    const service = createService(
      new MemoryFiatPaymentStore([activeMemoryFiatProduct()]),
      gateway,
    );

    await expect(
      service.checkout(
        USER,
        checkoutRequest(activeMemoryFiatProduct().productVersionId),
        "terminal-provider-key",
        "device",
      ),
    ).rejects.toMatchObject({
      code: "FIAT_PROVIDER_MISMATCH",
      retryable: false,
      statusCode: 502,
    });
  });
});

class FakeGateway implements FiatPaymentGateway {
  created = 0;
  recovered = 0;
  paymentReads = 0;
  searchReads = 0;
  readonly preferences = new Map<string, ProviderPreference>();
  readonly payments = new Map<string, ProviderPayment>();
  readonly paymentIdsByReference = new Map<string, string[]>();
  recoverFailure: FiatProviderError | null = null;
  searchFailure: Error | null = null;

  async recoverPreference(externalReference: string) {
    this.recovered += 1;
    if (this.recoverFailure) throw this.recoverFailure;
    return this.preferences.get(externalReference) ?? null;
  }

  async createPreference(
    input: Parameters<FiatPaymentGateway["createPreference"]>[0],
  ) {
    this.created += 1;
    const result: ProviderPreference = {
      id: `preference-${this.created}`,
      externalReference: input.externalReference,
      collectorId: SELLER_ID,
      currency: "COP",
      amountMinor: input.amountMinor,
      checkoutUrl: `https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=${this.created}`,
      expiresAt: input.expiresAt,
      evidenceHash: "preference-evidence",
    };
    this.preferences.set(input.externalReference, result);
    return result;
  }

  async searchPaymentIds(externalReference: string) {
    this.searchReads += 1;
    if (this.searchFailure) throw this.searchFailure;
    return this.paymentIdsByReference.get(externalReference) ?? [];
  }

  async getPayment(paymentId: string) {
    this.paymentReads += 1;
    const result = this.payments.get(paymentId);
    if (!result) throw new Error("Missing fake payment");
    return result;
  }
}

function createService(
  store: MemoryFiatPaymentStore,
  gateway: FiatPaymentGateway,
) {
  return new FiatPaymentService(
    store,
    gateway,
    paymentPolicy(),
    () => new Date(NOW),
    () => undefined,
  );
}

function paymentPolicy() {
  return {
    checkoutEnabled: true,
    checkoutAllowedUsers: [USER.email],
    mode: "test" as const,
    sellerUserId: SELLER_ID,
    applicationId: APPLICATION_ID,
    webhookSecret: SECRET,
    appBaseUrl: "https://fauzet.app",
  };
}

function checkoutRequest(productVersionId: string) {
  return {
    productVersionId,
    quantity: 1 as const,
    termsVersion: FIAT_CHECKOUT_TERMS_VERSION,
    refundPolicyVersion: FIAT_REFUND_POLICY_VERSION,
  };
}

function payment(
  input: Partial<ProviderPayment> &
    Pick<ProviderPayment, "id" | "externalReference">,
): ProviderPayment {
  return {
    collectorId: SELLER_ID,
    applicationId: APPLICATION_ID,
    liveMode: false,
    currency: "COP",
    amountMinor: 39_900n,
    refundedAmountMinor: 0n,
    status: "approved",
    statusDetail: "accredited",
    preferenceId: "preference-1",
    merchantOrderId: "merchant-order-1",
    approvedAt: NOW,
    providerUpdatedAt: NOW,
    evidenceHash: "payment-evidence",
    ...input,
  };
}

function webhook(dataId: string, eventId: string) {
  const xRequestId = `request-${eventId}`;
  const ts = String(NOW.getTime());
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const signature = createHmac("sha256", SECRET).update(manifest).digest("hex");
  return {
    dataId,
    queryType: "payment",
    xRequestId,
    xSignature: `ts=${ts},v1=${signature}`,
    payload: { id: eventId, action: "payment.updated", data: { id: dataId } },
  };
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
