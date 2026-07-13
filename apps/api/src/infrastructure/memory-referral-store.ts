import type {
  ReferralCodeResponse,
  ReferralCommissionsResponse,
  ReferralTreeResponse,
} from "@fauzet/contracts";
import type { ReferralStore } from "../domain/referrals.js";

export class MemoryReferralStore implements ReferralStore {
  private readonly codes = new Map<string, string>();

  async code(userId: string): Promise<ReferralCodeResponse> {
    const now = new Date().toISOString();
    const code = this.codeFor(userId);
    return {
      serverNow: now,
      configVersion: 1,
      state: "ATTRIBUTION_ONLY",
      reasonCode: "LEGAL_AND_REVENUE_GATE",
      code,
      invitePath: `/r/${code}`,
      sponsor: null,
      rates: [500, 200, 100, 50].map((rateBps, index) => ({
        level: index + 1,
        rateBps,
      })),
      monthlyCapMinorUnits: "50000",
      reviewWindowHours: 168,
    };
  }

  async tree(): Promise<ReferralTreeResponse> {
    return {
      serverNow: new Date().toISOString(),
      state: "ATTRIBUTION_ONLY",
      reasonCode: "LEGAL_AND_REVENUE_GATE",
      totalMembers: 0,
      activeMembers: 0,
      levels: [500, 200, 100, 50].map((rateBps, index) => ({
        level: index + 1,
        rateBps,
        members: 0,
        activeMembers: 0,
      })),
      recentMembers: [],
    };
  }

  async commissions(): Promise<ReferralCommissionsResponse> {
    return {
      serverNow: new Date().toISOString(),
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
    };
  }

  private codeFor(userId: string) {
    const existing = this.codes.get(userId);
    if (existing) return existing;
    const code = `FZ-${userId
      .replaceAll("-", "")
      .toUpperCase()
      .replace(/[01]/g, "Z")
      .slice(0, 12)}`;
    this.codes.set(userId, code);
    return code;
  }
}
