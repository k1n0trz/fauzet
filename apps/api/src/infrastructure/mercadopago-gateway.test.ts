import { describe, expect, it, vi } from "vitest";
import { MercadoPagoGateway } from "./mercadopago-gateway.js";

describe("MercadoPagoGateway", () => {
  it("creates a Checkout Pro preference from server-owned COP data", async () => {
    const expiresAt = new Date("2026-07-14T02:00:00.000Z");
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse(`{
        "id":"pref-test-1",
        "collector_id":12345678901234567890,
        "external_reference":"40000000-0000-4000-8000-000000000001",
        "sandbox_init_point":"https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=pref-test-1",
        "init_point":"https://www.mercadopago.com/checkout/v1/redirect?pref_id=pref-test-1",
        "expiration_date_to":"${expiresAt.toISOString()}",
        "items":[{"currency_id":"COP","unit_price":39900}]
      }`),
    );
    const gateway = new MercadoPagoGateway(
      { accessToken: "APP_USR-test-token-never-logged", mode: "test" },
      fetcher,
    );

    const result = await gateway.createPreference({
      externalReference: "40000000-0000-4000-8000-000000000001",
      productVersionId: "10000000-0000-4000-8000-000000000001",
      sku: "MINER_DRIPPER_MINI",
      name: "Dripper Mini",
      description: "Minero virtual de prueba",
      currency: "COP",
      amountMinor: 39_900n,
      payerEmail: "buyer@example.com",
      expiresAt,
      returnUrl:
        "https://fauzet.app/app/store/fiat/orders/40000000-0000-4000-8000-000000000001",
    });

    expect(result).toMatchObject({
      id: "pref-test-1",
      collectorId: "12345678901234567890",
      amountMinor: 39_900n,
    });
    const [, init] = fetcher.mock.calls[0]!;
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      external_reference: "40000000-0000-4000-8000-000000000001",
      items: [{ quantity: 1, currency_id: "COP", unit_price: 39900 }],
      auto_return: "approved",
      binary_mode: false,
    });
    expect(body.notification_url).toBeUndefined();
    expect(init.headers["x-idempotency-key"]).toBeUndefined();
  });

  it("parses authoritative payment identities without losing Int64 precision", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(`{
          "id":900000000001,
          "collector_id":12345678901234567890,
          "external_reference":"40000000-0000-4000-8000-000000000001",
          "order":{"id":8000000000000000001,"type":"mercadopago"},
          "live_mode":false,
          "currency_id":"COP",
          "transaction_amount":39900.00,
          "transaction_amount_refunded":0,
          "status":"approved",
          "status_detail":"accredited",
          "date_approved":"2026-07-14T01:05:00.000Z",
          "date_last_updated":"2026-07-14T01:05:01.000Z"
        }`),
      )
      .mockResolvedValueOnce(
        jsonResponse(`{
          "id":8000000000000000001,
          "preference_id":"pref-test-1",
          "application_id":9876543210987654321,
          "external_reference":"40000000-0000-4000-8000-000000000001",
          "is_test":true,
          "collector":{"id":12345678901234567890},
          "payments":[{"id":900000000001}]
        }`),
      );
    const gateway = new MercadoPagoGateway(
      { accessToken: "APP_USR-test-token-never-logged", mode: "test" },
      fetcher,
    );

    const payment = await gateway.getPayment("900000000001");

    expect(payment).toMatchObject({
      id: "900000000001",
      collectorId: "12345678901234567890",
      applicationId: "9876543210987654321",
      preferenceId: "pref-test-1",
      merchantOrderId: "8000000000000000001",
      currency: "COP",
      amountMinor: 39_900n,
      refundedAmountMinor: 0n,
      status: "approved",
      statusDetail: "accredited",
    });
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "https://api.mercadopago.com/merchant_orders/8000000000000000001",
    );
  });

  it("discovers TEST payments by exact external reference", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse(`{
        "paging":{"total":2,"limit":30,"offset":0},
        "results":[
          {"id":900000000011,"external_reference":"order-1"},
          {"id":900000000012,"external_reference":"order-1"},
          {"id":900000000013,"external_reference":"another-order"}
        ]
      }`),
    );
    const gateway = new MercadoPagoGateway(
      { accessToken: "APP_USR-test-token-never-logged", mode: "test" },
      fetcher,
    );

    await expect(gateway.searchPaymentIds("order-1")).resolves.toEqual([
      "900000000011",
      "900000000012",
    ]);
  });

  it("fails closed when recovery finds duplicate preferences", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse(`{
        "elements":[
          {"id":"pref-1","external_reference":"same-order"},
          {"id":"pref-2","external_reference":"same-order"}
        ]
      }`),
    );
    const gateway = new MercadoPagoGateway(
      { accessToken: "APP_USR-test-token-never-logged", mode: "test" },
      fetcher,
    );

    await expect(gateway.recoverPreference("same-order")).rejects.toMatchObject(
      {
        code: "MP_PREFERENCE_AMBIGUOUS",
        retryable: false,
      },
    );
  });
});

function jsonResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}
