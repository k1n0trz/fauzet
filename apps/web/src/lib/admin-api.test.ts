import { afterEach, describe, expect, it, vi } from "vitest";
import { adminLogin, getAdminOverview } from "./admin-api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("admin API adapters", () => {
  it("validates the server-authoritative overview contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          serverNow: "2026-07-13T00:00:00.000Z",
          users: {
            total: 10,
            active: 8,
            restricted: 1,
            suspended: 1,
            registered24h: 2,
          },
          risk: { elevated: 2, high: 1, signals24h: 3 },
          ledger: {
            transactions24h: 24,
            userLiabilities: {
              PENDING: "0",
              AVAILABLE: "1200",
              PROMOTIONAL: "50",
              LOCKED: "0",
              ELIGIBLE: "0",
              RESERVED: "0",
              WITHDRAWN: "0",
            },
          },
          features: {
            realMoney: false,
            withdrawals: false,
            trading: false,
          },
        }),
      ),
    );

    await expect(getAdminOverview()).resolves.toMatchObject({
      users: { total: 10 },
      features: { withdrawals: false },
    });
  });

  it("logs out the base session when administrative step-up fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          user: {
            id: "10000000-0000-4000-8000-000000000001",
            email: "admin@fauzet.local",
            displayName: "Admin",
            locale: "es",
            countryCode: "CO",
            status: "ACTIVE",
            roles: ["SUPERADMIN"],
          },
          sessionExpiresAt: "2026-07-14T00:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { message: "Administrative re-authentication failed" } },
          401,
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      adminLogin("admin@fauzet.local", "WrongPassword123"),
    ).rejects.toThrow("Administrative re-authentication failed");
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe("/api/v1/auth/logout");
  });
});

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
