import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { fiatOrderResponseSchema } from "@fauzet/contracts";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import {
  FIAT_CHECKOUT_TERMS_VERSION,
  FIAT_REFUND_POLICY_VERSION,
} from "./domain/fiat-catalog.js";
import type {
  FiatPaymentGateway,
  ProviderPayment,
} from "./domain/fiat-payments.js";
import { MemoryAuthStore } from "./infrastructure/memory-auth-store.js";
import {
  activeMemoryFiatProduct,
  MemoryFiatPaymentStore,
} from "./infrastructure/memory-fiat-payment-store.js";

const EMAIL = "route-buyer@example.com";
const DEVICE = "50000000-0000-4000-8000-000000000001";
const SELLER_ID = "1234567890";
const APPLICATION_ID = "123456789012345";
const SECRET = "route-webhook-secret-with-32-characters";

describe("fiat payment routes", () => {
  it("creates, reads and fulfills an allowlisted sandbox order", async () => {
    const authStore = new MemoryAuthStore();
    const product = activeMemoryFiatProduct();
    const gateway = new RouteGateway();
    const app = await createApp(
      loadConfig({
        NODE_ENV: "test",
        APP_BASE_URL: "https://fauzet.app",
        FIAT_SANDBOX_CHECKOUT_ENABLED: "true",
        FIAT_SANDBOX_CHECKOUT_ALLOWED_USERS: EMAIL,
        MERCADOPAGO_MODE: "test",
        MERCADOPAGO_ACCESS_TOKEN: "APP_USR-route-test-token-with-enough-length",
        MERCADOPAGO_WEBHOOK_SECRET: SECRET,
        MERCADOPAGO_APPLICATION_ID: APPLICATION_ID,
        MERCADOPAGO_SELLER_USER_ID: SELLER_ID,
      }),
      {
        authStore,
        fiatPaymentStore: new MemoryFiatPaymentStore([product]),
        fiatPaymentGateway: gateway,
      },
    );
    const registration = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "x-device-id": DEVICE },
      payload: {
        email: EMAIL,
        password: "ValidPassword123",
        displayName: "Route Buyer",
        countryCode: "CO",
        locale: "es",
        acceptedTerms: true,
        isAdult: true,
      },
    });
    const cookie = registration.cookies.find(
      ({ name }) => name === "fz_session",
    )!;
    const user = await authStore.findUserByEmail(EMAIL);
    if (!user) throw new Error("Expected route test user");
    user.status = "ACTIVE";

    const created = await app.inject({
      method: "POST",
      url: "/v1/fiat/orders",
      cookies: { fz_session: cookie.value },
      headers: {
        "x-device-id": DEVICE,
        "idempotency-key": "route-checkout-key-0001",
      },
      payload: {
        productVersionId: product.productVersionId,
        quantity: 1,
        termsVersion: FIAT_CHECKOUT_TERMS_VERSION,
        refundPolicyVersion: FIAT_REFUND_POLICY_VERSION,
      },
    });
    expect(created.statusCode).toBe(201);
    const order = fiatOrderResponseSchema.parse(created.json());
    expect(order.order.status).toBe("CHECKOUT_READY");

    const payment: ProviderPayment = {
      id: "900000000010",
      externalReference: order.order.id,
      collectorId: SELLER_ID,
      applicationId: APPLICATION_ID,
      liveMode: false,
      currency: "COP",
      amountMinor: BigInt(product.amountMinor),
      refundedAmountMinor: 0n,
      status: "approved",
      statusDetail: "accredited",
      preferenceId: order.order.checkout!.preferenceId,
      merchantOrderId: "route-merchant-order-1",
      approvedAt: new Date(),
      providerUpdatedAt: new Date(),
      evidenceHash: "route-payment-evidence",
    };
    gateway.payment = payment;
    const requestId = "route-webhook-request-1";
    const ts = String(Date.now());
    const signature = createHmac("sha256", SECRET)
      .update(`id:${payment.id};request-id:${requestId};ts:${ts};`)
      .digest("hex");
    const webhook = await app.inject({
      method: "POST",
      url: `/v1/fiat/webhooks/mercadopago?data.id=${payment.id}&type=payment`,
      headers: {
        "x-request-id": requestId,
        "x-signature": `ts=${ts},v1=${signature}`,
      },
      payload: {
        id: "route-event-1",
        type: "payment",
        action: "payment.updated",
        data: { id: payment.id },
      },
    });
    expect(webhook.statusCode).toBe(200);
    expect(webhook.json()).toMatchObject({
      status: "RECEIVED",
    });

    await vi.waitFor(async () => {
      const status = await app.inject({
        method: "GET",
        url: `/v1/fiat/orders/${order.order.id}`,
        cookies: { fz_session: cookie.value },
      });
      expect(fiatOrderResponseSchema.parse(status.json()).order).toMatchObject({
        status: "PAID",
        entitlementId: expect.stringMatching(UUID),
      });
    });
    await app.close();
  });

  it("keeps checkout protected by authentication and a session-bound device", async () => {
    const app = await createApp(loadConfig({ NODE_ENV: "test" }));
    const anonymous = await app.inject({
      method: "POST",
      url: "/v1/fiat/orders",
      headers: { "idempotency-key": "anonymous-checkout" },
      payload: {
        productVersionId: "10000000-0000-4000-8000-000000000001",
        quantity: 1,
        termsVersion: FIAT_CHECKOUT_TERMS_VERSION,
        refundPolicyVersion: FIAT_REFUND_POLICY_VERSION,
      },
    });
    expect(anonymous.statusCode).toBe(401);
    await app.close();
  });
});

class RouteGateway implements FiatPaymentGateway {
  payment: ProviderPayment | null = null;

  async recoverPreference() {
    return null;
  }

  async createPreference(
    input: Parameters<FiatPaymentGateway["createPreference"]>[0],
  ) {
    return {
      id: "route-preference-1",
      externalReference: input.externalReference,
      collectorId: SELLER_ID,
      currency: "COP" as const,
      amountMinor: input.amountMinor,
      checkoutUrl:
        "https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=route-preference-1",
      expiresAt: input.expiresAt,
      evidenceHash: "route-preference-evidence",
    };
  }

  async searchPaymentIds() {
    return [];
  }

  async getPayment(paymentId: string) {
    if (!this.payment || this.payment.id !== paymentId)
      throw new Error("Missing route payment");
    return this.payment;
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
