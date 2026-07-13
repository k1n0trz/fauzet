import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSandboxStatus, reserveSandboxConversion } from "./sandbox-api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sandbox API adapter", () => {
  it("accepts a complete no-external-value status contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(statusFixture())),
    );

    await expect(fetchSandboxStatus()).resolves.toMatchObject({
      mode: "SANDBOX",
      realWithdrawalsEnabled: false,
      eligibleMinorUnits: "1200",
    });
  });

  it("sends the idempotency key when reserving a quote", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        conversion: conversionFixture(),
        replayed: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await reserveSandboxConversion(
      "10000000-0000-4000-8000-000000000001",
      "sandbox-attempt-12345678",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/conversions/sandbox",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "idempotency-key": "sandbox-attempt-12345678",
        }),
      }),
    );
  });
});

function statusFixture() {
  return {
    serverNow: "2027-08-01T12:00:00.000Z",
    mode: "SANDBOX",
    enabled: true,
    realWithdrawalsEnabled: false,
    disclaimer: "Simulation only",
    eligibleMinorUnits: "1200",
    reservedMinorUnits: "0",
    withdrawnMinorUnits: "0",
    walletCooldownHours: 24,
    quoteTtlSeconds: 120,
    wallets: [],
    conversions: [],
    withdrawals: [],
  };
}

function conversionFixture() {
  return {
    id: "20000000-0000-4000-8000-000000000002",
    quote: {
      id: "10000000-0000-4000-8000-000000000001",
      asset: "SANDBOX_LTC",
      eligibleMinorUnits: "1000",
      grossAssetMinorUnits: "990000",
      networkFeeAssetMinorUnits: "100",
      netAssetMinorUnits: "989900",
      spreadBps: 100,
      status: "CONSUMED",
      expiresAt: "2027-08-01T12:02:00.000Z",
      createdAt: "2027-08-01T12:00:00.000Z",
    },
    status: "RESERVED",
    reserveTransactionId: "30000000-0000-4000-8000-000000000003",
    releaseTransactionId: null,
    createdAt: "2027-08-01T12:00:01.000Z",
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
