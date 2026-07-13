import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchFiatCatalog,
  fetchFiatEntitlements,
  normalizeFiatCatalog,
  normalizeFiatEntitlements,
} from "./fiat-store-api";

const now = "2026-07-13T16:00:00.000Z";
const deviceId = "20000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => deviceId),
    setItem: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fiat store API adapters", () => {
  it("loads and normalizes the fail-closed sandbox catalog", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return jsonResponse(catalogFixture());
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await fetchFiatCatalog();
    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(url).toBe("/api/v1/fiat/catalog");
    expect(init).toMatchObject({ credentials: "include", cache: "no-store" });
    expect(init?.headers).toEqual({ "x-device-id": deviceId });
    expect(catalog).toMatchObject({
      mode: "SANDBOX",
      realChargeEnabled: false,
      provider: "MERCADO_PAGO",
      catalogEnabled: true,
      checkoutEnabled: false,
      activationEnabled: false,
      currency: "COP",
      exponent: 0,
    });
    expect(catalog.products[0]).toMatchObject({
      sku: "MINER_DRIPPER_MINI",
      state: "AVAILABLE",
      price: { currency: "COP", minorUnits: "19900", exponent: 0 },
      rewardEligible: false,
    });
  });

  it("rejects a catalog that claims real charges or reward eligibility", () => {
    expect(() =>
      normalizeFiatCatalog({
        ...catalogFixture(),
        realChargeEnabled: true,
      }),
    ).toThrow(/realChargeEnabled/);

    const fixture = catalogFixture();
    fixture.products[0]!.rewardEligible = true;
    expect(() => normalizeFiatCatalog(fixture)).toThrow(/rewardEligible/);
  });

  it("normalizes inventory without turning PURCHASED into an active effect", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return jsonResponse(entitlementsFixture());
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const inventory = await fetchFiatEntitlements();
    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(url).toBe("/api/v1/fiat/entitlements");
    expect(init?.headers).toEqual({ "x-device-id": deviceId });
    expect(inventory.activationEnabled).toBe(false);
    expect(inventory.items[0]).toMatchObject({
      state: "PURCHASED",
      activatedAt: null,
      startsAt: null,
      endsAt: null,
      canActivate: false,
      canRequestRefund: true,
    });
  });

  it("rejects malformed entitlement timestamps and unknown states", () => {
    const badTimestamp = entitlementsFixture();
    badTimestamp.items[0]!.purchasedAt = "not-a-date";
    expect(() => normalizeFiatEntitlements(badTimestamp)).toThrow(
      /purchasedAt/,
    );

    const badState = entitlementsFixture();
    badState.items[0]!.state = "PAID";
    expect(() => normalizeFiatEntitlements(badState)).toThrow(/state/);
  });

  it("uses the shared API error instead of accepting an error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { error: { code: "FIAT_DISABLED", message: "Sandbox cerrado" } },
          503,
        ),
      ),
    );

    await expect(fetchFiatCatalog()).rejects.toMatchObject({
      status: 503,
      code: "FIAT_DISABLED",
      message: "Sandbox cerrado",
    });
  });
});

function catalogFixture() {
  return {
    serverNow: now,
    mode: "SANDBOX" as const,
    realChargeEnabled: false as boolean,
    provider: "MERCADO_PAGO" as const,
    catalogEnabled: true,
    checkoutEnabled: false,
    activationEnabled: false,
    currency: "COP" as const,
    exponent: 0 as const,
    disabledReason: "SANDBOX_CHECKOUT_DISABLED",
    products: [
      {
        productVersionId: "30000000-0000-4000-8000-000000000003",
        sku: "MINER_DRIPPER_MINI",
        version: 1,
        kind: "MINER",
        state: "AVAILABLE",
        reasonCode: "CHECKOUT_DISABLED",
        name: "Dripper Mini",
        description: "Minero virtual sandbox.",
        price: { currency: "COP", minorUnits: "19900", exponent: 0 },
        durationSeconds: 2_592_000,
        effect: {
          type: "TEMPORARY_MINER",
          label: "0,25 MH/s durante 30 días",
          parameters: { hashRateGh: 250 },
        },
        rewardEligible: false as boolean,
        refundPolicyVersion: "beta-0.1",
        activationConsentVersion: "beta-0.1",
      },
    ],
  };
}

function entitlementsFixture() {
  return {
    serverNow: now,
    activationEnabled: false,
    items: [
      {
        id: "40000000-0000-4000-8000-000000000004",
        orderId: "50000000-0000-4000-8000-000000000005",
        productVersionId: "30000000-0000-4000-8000-000000000003",
        sku: "MINER_DRIPPER_MINI",
        name: "Dripper Mini",
        state: "PURCHASED",
        quantity: 1,
        purchasedAt: now,
        activatedAt: null,
        startsAt: null,
        endsAt: null,
        canActivate: false,
        canRequestRefund: true,
        reasonCode: "ACTIVATION_DISABLED",
        effect: {
          type: "TEMPORARY_MINER",
          label: "0,25 MH/s durante 30 días",
          parameters: { hashRateGh: 250 },
        },
      },
    ],
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
