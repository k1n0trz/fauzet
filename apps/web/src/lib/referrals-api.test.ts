import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReferralCrew } from "./referrals-api";

const now = "2026-07-12T12:00:00.000Z";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("referral API adapters", () => {
  it("keeps attribution active while monetary commissions remain gated", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          serverNow: now,
          configVersion: 8,
          state: "ATTRIBUTION_ONLY",
          reasonCode: "LEGAL_AND_REVENUE_GATE",
          code: "FZ-ABCDEFGH",
          invitePath: "/r/FZ-ABCDEFGH",
          sponsor: null,
          rates: [500, 200, 100, 50].map((rateBps, index) => ({
            level: index + 1,
            rateBps,
          })),
          monthlyCapMinorUnits: "50000",
          reviewWindowHours: 168,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          serverNow: now,
          state: "ATTRIBUTION_ONLY",
          reasonCode: "LEGAL_AND_REVENUE_GATE",
          totalMembers: 1,
          activeMembers: 0,
          levels: [500, 200, 100, 50].map((rateBps, index) => ({
            level: index + 1,
            rateBps,
            members: index === 0 ? 1 : 0,
            activeMembers: 0,
          })),
          recentMembers: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              displayName: "Crew Test",
              level: 1,
              state: "INACTIVE",
              joinedAt: now,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          serverNow: now,
          state: "ATTRIBUTION_ONLY",
          reasonCode: "LEGAL_AND_REVENUE_GATE",
          summary: {
            pendingMinorUnits: "0",
            availableMinorUnits: "0",
            reversedMinorUnits: "0",
            cappedMinorUnits: "0",
            monthEarnedMinorUnits: "0",
            monthRemainingMinorUnits: "50000",
          },
          items: [],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const crew = await fetchReferralCrew();

    expect(crew.code).toMatchObject({
      state: "ATTRIBUTION_ONLY",
      code: "FZ-ABCDEFGH",
      reasonCode: "LEGAL_AND_REVENUE_GATE",
    });
    expect(crew.tree.levels).toHaveLength(4);
    expect(crew.tree.recentMembers[0]?.state).toBe("INACTIVE");
    expect(crew.commissions.summary.availableMinorUnits).toBe("0");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/v1/referrals/code",
      "/api/v1/referrals/tree",
      "/api/v1/referrals/commissions",
    ]);
  });

  it("fails closed when any economic response is incomplete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ state: "ATTRIBUTION_ONLY" })),
    );

    await expect(fetchReferralCrew()).rejects.toThrow("incompleto");
  });
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
