import { API_BASE } from "./api";
import { getDeviceId } from "./device";
import {
  apiRequestError,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  readJson,
} from "./reward-api";

export type MissionCategory =
  | "daily"
  | "weekly"
  | "mining"
  | "crew"
  | "premium";

export type MissionStatus =
  | "IN_PROGRESS"
  | "CLAIMABLE"
  | "CLAIMED"
  | "LOCKED"
  | "PENDING_PROVIDER"
  | "EXPIRED"
  | "HELD"
  | "REJECTED";

export type Mission = {
  id: string;
  periodKey: string;
  category: MissionCategory;
  title: string;
  requirement: string;
  progress: number;
  target: number;
  reward: { asset: string; minorUnits: string; bucket: string };
  status: MissionStatus;
  expiresAt: string | null;
  premium: boolean;
  reasonCode: string | null;
  configVersion: number;
};

export type MissionCatalog = {
  summary: {
    streakDays: number;
    activeWeekDays: string[];
    achievements: { unlocked: number; total: number };
  } | null;
  missions: Mission[];
};

export type MissionClaim = {
  missionId: string;
  periodKey: string;
  status: string;
  reward: { asset: string; minorUnits: string; bucket: string } | null;
  transactionId: string | null;
  reasonCode: string | null;
  replayed: boolean;
};

const missionCategories = new Set<MissionCategory>([
  "daily",
  "weekly",
  "mining",
  "crew",
  "premium",
]);
const missionStatuses = new Set<MissionStatus>([
  "IN_PROGRESS",
  "CLAIMABLE",
  "CLAIMED",
  "LOCKED",
  "PENDING_PROVIDER",
  "EXPIRED",
  "HELD",
  "REJECTED",
]);

export async function fetchMissions(signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}/missions`, {
    credentials: "include",
    cache: "no-store",
    headers: { "x-device-id": getDeviceId() },
    signal: signal ?? null,
  });
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);

  const root = asRecord(payload);
  const source = asRecord(root?.catalog) ?? root;
  const rawMissions = Array.isArray(source?.missions) ? source.missions : [];
  const configVersion = asNumber(source?.configVersion) ?? 1;
  const missions = rawMissions
    .map((mission) => normalizeMission(mission, configVersion))
    .filter((mission): mission is Mission => mission !== null);
  if (!source) throw new Error("El centro de misiones llegó incompleto.");

  const summary = asRecord(source.summary);
  const achievements = asRecord(summary?.achievements);
  const activeWeekDays = Array.isArray(summary?.activeWeekDays)
    ? summary.activeWeekDays.filter(
        (day): day is string => typeof day === "string",
      )
    : [];

  return {
    summary: summary
      ? {
          streakDays: asNumber(summary.streakDays) ?? 0,
          activeWeekDays,
          achievements: {
            unlocked: asNumber(achievements?.unlocked) ?? 0,
            total: asNumber(achievements?.total) ?? 0,
          },
        }
      : null,
    missions,
  } satisfies MissionCatalog;
}

export async function claimMission(
  missionId: string,
  periodKey: string,
  configVersion: number,
  idempotencyKey: string,
) {
  const response = await fetch(
    `${API_BASE}/missions/${encodeURIComponent(missionId)}/claim`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        "x-device-id": getDeviceId(),
      },
      body: JSON.stringify({ periodKey, configVersion }),
    },
  );
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);

  const root = asRecord(payload);
  const source = asRecord(root?.missionClaim) ?? asRecord(root?.claim);
  if (!source) throw new Error("El servidor no devolvió el claim de misión.");
  const reward = asRecord(source.reward);
  const status = asString(source.status) ?? "VALIDATING";
  const transactionId = asString(source.transactionId);
  const asset = asString(reward?.asset);
  const minorUnits = asString(reward?.minorUnits);
  const bucket = asString(reward?.bucket);
  return {
    missionId: asString(source.missionId) ?? missionId,
    periodKey: asString(source.periodKey) ?? periodKey,
    status,
    reward:
      status === "POSTED" && transactionId && asset && minorUnits && bucket
        ? { asset, minorUnits, bucket }
        : null,
    transactionId,
    reasonCode: asString(source.reasonCode),
    replayed: asBoolean(root?.replayed) === true,
  } satisfies MissionClaim;
}

function normalizeMission(
  value: unknown,
  configVersion: number,
): Mission | null {
  const mission = asRecord(value);
  const id = asString(mission?.id);
  const title = asString(mission?.title);
  if (!mission || !id || !title) return null;
  const rawCategory = asString(mission.category)?.toLowerCase();
  const normalizedCategory = rawCategory === "referral" ? "crew" : rawCategory;
  const rawStatus = asString(mission.status)?.toUpperCase();
  const reward = asRecord(mission.reward);
  const periodEndsAt =
    asString(mission.periodEndsAt) ?? asString(mission.expiresAt);
  const periodKey =
    asString(mission.periodKey) ??
    asString(mission.instanceKey) ??
    periodEndsAt ??
    `config-${configVersion}`;

  return {
    id,
    periodKey,
    category:
      normalizedCategory &&
      missionCategories.has(normalizedCategory as MissionCategory)
        ? (normalizedCategory as MissionCategory)
        : "daily",
    title,
    requirement:
      asString(mission.requirement) ??
      asString(mission.description) ??
      missionRequirement(id),
    progress: Math.max(0, numericValue(mission.progress) ?? 0),
    target: Math.max(1, numericValue(mission.target) ?? 1),
    reward: {
      asset: asString(reward?.asset) ?? "ZYXE",
      minorUnits: asString(reward?.minorUnits) ?? "0",
      bucket: asString(reward?.bucket) ?? "AVAILABLE",
    },
    status:
      rawStatus && missionStatuses.has(rawStatus as MissionStatus)
        ? (rawStatus as MissionStatus)
        : "LOCKED",
    expiresAt: periodEndsAt,
    premium:
      asBoolean(mission.premium) === true || normalizedCategory === "premium",
    reasonCode: asString(mission.reasonCode),
    configVersion,
  };
}

function numericValue(value: unknown) {
  const numeric = asNumber(value);
  if (numeric !== null) return numeric;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function missionRequirement(id: string) {
  const descriptions: Record<string, string> = {
    m1: "Claims de faucet confirmados por el servidor",
    m2: "Recompensas de juego validadas",
    m3: "Hashpower válido continuo",
    m4: "Actividad diaria válida",
    m5: "Actividad monetizable de un miembro de Crew",
    m6: "Confirmación verificable del proveedor",
  };
  return descriptions[id] ?? "Actividad validada por el servidor";
}
