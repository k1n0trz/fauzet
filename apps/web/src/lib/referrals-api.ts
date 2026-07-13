import { API_BASE } from "./api";
import {
  apiRequestError,
  asNumber,
  asRecord,
  asString,
  readJson,
} from "./reward-api";

export type ReferralProgramState =
  | "ACTIVE"
  | "ATTRIBUTION_ONLY"
  | "DISABLED"
  | "RISK_BLOCKED";

export type ReferralCodeView = {
  configVersion: number;
  state: ReferralProgramState;
  reasonCode: string | null;
  code: string;
  invitePath: string;
  sponsor: { displayName: string; joinedAt: string } | null;
  rates: Array<{ level: number; rateBps: number }>;
  monthlyCapMinorUnits: string;
  reviewWindowHours: number;
};

export type ReferralTreeView = {
  state: ReferralProgramState;
  reasonCode: string | null;
  totalMembers: number;
  activeMembers: number;
  levels: Array<{
    level: number;
    rateBps: number;
    members: number;
    activeMembers: number;
  }>;
  recentMembers: Array<{
    id: string;
    displayName: string;
    level: number;
    state: "ACTIVE" | "INACTIVE" | "BLOCKED";
    joinedAt: string;
  }>;
};

export type ReferralCommissionsView = {
  state: ReferralProgramState;
  reasonCode: string | null;
  summary: {
    pendingMinorUnits: string;
    availableMinorUnits: string;
    reversedMinorUnits: string;
    cappedMinorUnits: string;
    monthEarnedMinorUnits: string;
    monthRemainingMinorUnits: string;
  };
  items: Array<{
    id: string;
    level: number;
    memberDisplayName: string;
    sourceType: string;
    status: string;
    baseMinorUnits: string;
    rewardMinorUnits: string;
    qualifiedAt: string;
    availableAt: string | null;
  }>;
};

export async function fetchReferralCrew(signal?: AbortSignal) {
  const [code, tree, commissions] = await Promise.all([
    referralRequest("/referrals/code", signal),
    referralRequest("/referrals/tree", signal),
    referralRequest("/referrals/commissions", signal),
  ]);
  return {
    code: normalizeCode(code),
    tree: normalizeTree(tree),
    commissions: normalizeCommissions(commissions),
  };
}

async function referralRequest(path: string, signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    cache: "no-store",
    signal: signal ?? null,
  });
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);
  return payload;
}

function normalizeCode(payload: unknown): ReferralCodeView {
  const root = asRecord(payload);
  const configVersion = asNumber(root?.configVersion);
  const state = programState(root?.state);
  const code = asString(root?.code);
  const invitePath = asString(root?.invitePath);
  const monthlyCap = integerString(root?.monthlyCapMinorUnits);
  const reviewWindowHours = asNumber(root?.reviewWindowHours);
  const rates = Array.isArray(root?.rates)
    ? root.rates
        .map(asRecord)
        .filter(Boolean)
        .map((rate) => ({
          level: asNumber(rate?.level) ?? 0,
          rateBps: asNumber(rate?.rateBps) ?? 0,
        }))
    : [];
  if (
    !root ||
    configVersion === null ||
    !state ||
    !code ||
    !invitePath ||
    !monthlyCap ||
    reviewWindowHours === null ||
    rates.length !== 4
  )
    throw new Error("El código de Mining Crew llegó incompleto.");
  const sponsor = asRecord(root.sponsor);
  return {
    configVersion,
    state,
    reasonCode: asString(root.reasonCode),
    code,
    invitePath,
    sponsor:
      sponsor && asString(sponsor.displayName) && asString(sponsor.joinedAt)
        ? {
            displayName: asString(sponsor.displayName)!,
            joinedAt: asString(sponsor.joinedAt)!,
          }
        : null,
    rates,
    monthlyCapMinorUnits: monthlyCap,
    reviewWindowHours,
  };
}

function normalizeTree(payload: unknown): ReferralTreeView {
  const root = asRecord(payload);
  const state = programState(root?.state);
  const totalMembers = asNumber(root?.totalMembers);
  const activeMembers = asNumber(root?.activeMembers);
  const levels = Array.isArray(root?.levels)
    ? root.levels
        .map(asRecord)
        .filter(Boolean)
        .map((level) => ({
          level: asNumber(level?.level) ?? 0,
          rateBps: asNumber(level?.rateBps) ?? 0,
          members: asNumber(level?.members) ?? 0,
          activeMembers: asNumber(level?.activeMembers) ?? 0,
        }))
    : [];
  const recentMembers = Array.isArray(root?.recentMembers)
    ? root.recentMembers
        .map(asRecord)
        .filter(Boolean)
        .map((member) => ({
          id: asString(member?.id) ?? "",
          displayName: asString(member?.displayName) ?? "Miembro Fauzet",
          level: asNumber(member?.level) ?? 0,
          state: memberState(member?.state),
          joinedAt: asString(member?.joinedAt) ?? "",
        }))
    : [];
  if (
    !root ||
    !state ||
    totalMembers === null ||
    activeMembers === null ||
    levels.length !== 4
  )
    throw new Error("El árbol de Mining Crew llegó incompleto.");
  return {
    state,
    reasonCode: asString(root.reasonCode),
    totalMembers,
    activeMembers,
    levels,
    recentMembers,
  };
}

function normalizeCommissions(payload: unknown): ReferralCommissionsView {
  const root = asRecord(payload);
  const summary = asRecord(root?.summary);
  const state = programState(root?.state);
  const pending = integerString(summary?.pendingMinorUnits);
  const available = integerString(summary?.availableMinorUnits);
  const reversed = integerString(summary?.reversedMinorUnits);
  const capped = integerString(summary?.cappedMinorUnits);
  const monthEarned = integerString(summary?.monthEarnedMinorUnits);
  const monthRemaining = integerString(summary?.monthRemainingMinorUnits);
  if (
    !root ||
    !summary ||
    !state ||
    !pending ||
    !available ||
    !reversed ||
    !capped ||
    !monthEarned ||
    !monthRemaining
  )
    throw new Error("Las comisiones de Mining Crew llegaron incompletas.");
  const items = Array.isArray(root.items)
    ? root.items
        .map(asRecord)
        .filter(Boolean)
        .map((item) => ({
          id: asString(item?.id) ?? "",
          level: asNumber(item?.level) ?? 0,
          memberDisplayName:
            asString(item?.memberDisplayName) ?? "Miembro Fauzet",
          sourceType: asString(item?.sourceType) ?? "UNKNOWN",
          status: asString(item?.status) ?? "HELD",
          baseMinorUnits: integerString(item?.baseMinorUnits) ?? "0",
          rewardMinorUnits: integerString(item?.rewardMinorUnits) ?? "0",
          qualifiedAt: asString(item?.qualifiedAt) ?? "",
          availableAt: asString(item?.availableAt),
        }))
    : [];
  return {
    state,
    reasonCode: asString(root.reasonCode),
    summary: {
      pendingMinorUnits: pending,
      availableMinorUnits: available,
      reversedMinorUnits: reversed,
      cappedMinorUnits: capped,
      monthEarnedMinorUnits: monthEarned,
      monthRemainingMinorUnits: monthRemaining,
    },
    items,
  };
}

function programState(value: unknown): ReferralProgramState | null {
  return value === "ACTIVE" ||
    value === "ATTRIBUTION_ONLY" ||
    value === "DISABLED" ||
    value === "RISK_BLOCKED"
    ? value
    : null;
}

function memberState(value: unknown): "ACTIVE" | "INACTIVE" | "BLOCKED" {
  return value === "ACTIVE" || value === "BLOCKED" || value === "INACTIVE"
    ? value
    : "INACTIVE";
}

function integerString(value: unknown) {
  const direct = asString(value);
  return direct && /^\d+$/.test(direct) ? direct : null;
}
