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

export type MinerQuote = {
  enabled: boolean;
  priceMinorUnits: string;
  reasonCode: string | null;
  nextLevel: number | null;
  nextHashRate: number | null;
  usesKit: boolean;
};

export type MinerView = {
  id: string;
  modelId: string;
  name: string;
  tier: string;
  level: number;
  hashRate: number;
  effectiveHashRate: number;
  energyPerHour: number;
  efficiencyBps: number;
  durabilityBps: number;
  status: string;
  reasonCode: string | null;
  upgrade: MinerQuote | null;
  repair: MinerQuote | null;
};

export type MiningStatus = {
  serverNow: string;
  configVersion: number;
  state: string;
  reasonCode: string | null;
  profile: {
    energy: {
      current: number;
      max: number;
      consumptionPerHour: number;
      estimatedExhaustsAt: string | null;
    };
    boost: { multiplierBps: number; expiresAt: string } | null;
    repairKits: number;
    activeMiners: number;
    maxSlots: number;
  };
  miners: MinerView[];
  period: {
    key: string;
    startAt: string | null;
    endAt: string | null;
    state: string | null;
    validHashMillis: string;
    poolMinorUnits: string;
    allocatedMinorUnits: string | null;
    estimatedRewardMinorUnits: string;
    userWeight: string | null;
    totalWeight: string | null;
    asOf: string;
    isGuaranteed: false;
  };
};

export type MiningAction = "upgrade" | "repair";

export type MiningActionReceipt = {
  id: string;
  type: string;
  status: string;
  costMinorUnits: string;
  transactionId: string | null;
  configVersion: number;
  mining: MiningStatus | null;
  replayed: boolean;
};

export async function fetchMiningStatus(signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}/mining/status`, {
    credentials: "include",
    cache: "no-store",
    headers: { "x-device-id": getDeviceId() },
    signal: signal ?? null,
  });
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);
  return normalizeMiningStatus(payload);
}

export async function mutateMiner(
  minerId: string,
  action: MiningAction,
  configVersion: number,
  idempotencyKey: string,
) {
  const response = await fetch(
    `${API_BASE}/miners/${encodeURIComponent(minerId)}/${action}`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        "x-device-id": getDeviceId(),
      },
      body: JSON.stringify({ configVersion }),
    },
  );
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);
  return normalizeMiningAction(payload);
}

export function isConfirmedMiningAction(receipt: MiningActionReceipt) {
  return (
    receipt.status === "POSTED" &&
    receipt.mining !== null &&
    (receipt.transactionId !== null || receipt.costMinorUnits === "0")
  );
}

function normalizeMiningStatus(payload: unknown): MiningStatus {
  const root = asRecord(payload);
  const source = asRecord(root?.mining) ?? asRecord(root?.status) ?? root;
  const profile = asRecord(source?.profile) ?? source;
  const energy = asRecord(profile?.energy);
  const boost = asRecord(profile?.boost);
  const rawMiners = Array.isArray(source?.miners) ? source.miners : [];
  const miners = rawMiners
    .map(normalizeMiner)
    .filter((miner): miner is MinerView => miner !== null);
  const today = asRecord(source?.today) ?? asRecord(source?.epoch);
  const pool = asRecord(today?.pool);
  const configVersion = asNumber(source?.configVersion);
  const serverNow = asString(source?.serverNow);
  const currentEnergy =
    asNumber(energy?.current) ?? asNumber(energy?.currentMicro);
  const maxEnergy = asNumber(energy?.max) ?? asNumber(energy?.maxMicro);
  const consumptionPerHour =
    asNumber(energy?.consumptionPerHour) ??
    asNumber(energy?.consumptionPerHourMicro) ??
    miners.reduce(
      (total, miner) =>
        miner.status === "ACTIVE" ? total + miner.energyPerHour : total,
      0,
    );
  const activeMiners =
    asNumber(profile?.activeMiners) ??
    miners.filter((miner) => miner.status === "ACTIVE").length;
  const maxSlots =
    asNumber(profile?.maxSlots) ?? asNumber(asRecord(source?.slots)?.max);
  const periodKey = asString(today?.periodKey) ?? asString(today?.id);
  const validHashMillis = integerString(
    today?.hashMillis ?? source?.validHashMilliGh,
  );
  const poolMinorUnits =
    asString(today?.poolMinorUnits) ??
    asString(pool?.configuredMinorUnits) ??
    integerString(pool?.configured);
  const estimatedRewardMinorUnits =
    asString(today?.estimatedPayoutMinorUnits) ??
    asString(today?.estimatedRewardMinorUnits);

  if (
    !source ||
    !profile ||
    !energy ||
    !today ||
    configVersion === null ||
    !serverNow ||
    currentEnergy === null ||
    maxEnergy === null ||
    maxSlots === null ||
    !periodKey ||
    !validHashMillis ||
    !poolMinorUnits ||
    !estimatedRewardMinorUnits
  ) {
    throw new Error("El estado de minería llegó incompleto.");
  }

  return {
    serverNow,
    configVersion,
    state: asString(source.state) ?? "UNKNOWN",
    reasonCode: asString(source.reasonCode),
    profile: {
      energy: {
        current: currentEnergy,
        max: maxEnergy,
        consumptionPerHour,
        estimatedExhaustsAt: asString(energy.estimatedExhaustsAt),
      },
      boost:
        boost &&
        asNumber(boost.multiplierBps) !== null &&
        asString(boost.expiresAt)
          ? {
              multiplierBps: asNumber(boost.multiplierBps)!,
              expiresAt: asString(boost.expiresAt)!,
            }
          : null,
      repairKits:
        asNumber(profile.repairKits) ?? asNumber(profile.repairInventory) ?? 0,
      activeMiners,
      maxSlots,
    },
    miners,
    period: {
      key: periodKey,
      startAt: asString(today.startAt),
      endAt: asString(today.endAt),
      state: asString(today.state),
      validHashMillis,
      poolMinorUnits,
      allocatedMinorUnits:
        asString(today.allocatedMinorUnits) ??
        asString(pool?.allocatedMinorUnits) ??
        integerString(pool?.allocated),
      estimatedRewardMinorUnits,
      userWeight: integerString(today.userWeight),
      totalWeight: integerString(today.totalWeight),
      asOf: asString(today.asOf) ?? serverNow,
      isGuaranteed: false,
    },
  };
}

function normalizeMiner(value: unknown): MinerView | null {
  const miner = asRecord(value);
  const id = asString(miner?.id);
  const name = asString(miner?.name);
  const level = asNumber(miner?.level);
  const baseHash =
    asNumber(miner?.hashRate) ?? asNumber(miner?.baseHashMilliGh);
  const energyPerHour =
    asNumber(miner?.energyPerHour) ?? asNumber(miner?.energyPerHourMicro);
  const efficiencyBps = asNumber(miner?.efficiencyBps);
  const durabilityBps = asNumber(miner?.durabilityBps);
  const status = asString(miner?.status);
  if (
    !miner ||
    !id ||
    !name ||
    level === null ||
    baseHash === null ||
    energyPerHour === null ||
    efficiencyBps === null ||
    durabilityBps === null ||
    !status
  ) {
    return null;
  }

  return {
    id,
    modelId: asString(miner.modelId) ?? asString(miner.productId) ?? "miner",
    name,
    tier: asString(miner.tier) ?? "BASIC",
    level,
    hashRate: baseHash,
    effectiveHashRate: asNumber(miner.effectiveHashMilliGh) ?? baseHash,
    energyPerHour,
    efficiencyBps,
    durabilityBps,
    status,
    reasonCode: asString(miner.reasonCode),
    upgrade: normalizeQuote(miner.upgrade, "upgrade"),
    repair: normalizeQuote(miner.repair, "repair"),
  };
}

function normalizeQuote(
  value: unknown,
  kind: "upgrade" | "repair",
): MinerQuote | null {
  const quote = asRecord(value);
  if (!quote) return null;
  const price = asRecord(quote.price);
  const priceMinorUnits =
    asString(quote.priceMinorUnits) ?? asString(price?.minorUnits);
  if (!priceMinorUnits) return null;
  return {
    enabled: asBoolean(quote.enabled) !== false,
    priceMinorUnits,
    reasonCode: asString(quote.reasonCode),
    nextLevel: kind === "upgrade" ? asNumber(quote.nextLevel) : null,
    nextHashRate:
      kind === "upgrade"
        ? (asNumber(quote.hashRate) ?? asNumber(quote.nextHashRate))
        : null,
    usesKit: kind === "repair" && asBoolean(quote.usesKit) === true,
  };
}

function normalizeMiningAction(payload: unknown): MiningActionReceipt {
  const root = asRecord(payload);
  const source =
    asRecord(root?.action) ??
    asRecord(root?.operation) ??
    asRecord(root?.receipt);
  const id = asString(source?.id);
  const type = asString(source?.type);
  const status = asString(source?.status);
  const costMinorUnits =
    asString(source?.costMinorUnits) ??
    asString(asRecord(source?.price)?.minorUnits);
  const configVersion = asNumber(source?.configVersion);
  if (
    !source ||
    !id ||
    !type ||
    !status ||
    !costMinorUnits ||
    configVersion === null
  ) {
    throw new Error(
      "El servidor no devolvió un comprobante de minería válido.",
    );
  }

  let mining: MiningStatus | null = null;
  if (asRecord(root?.mining)) {
    mining = normalizeMiningStatus(root?.mining);
  }

  return {
    id,
    type,
    status,
    costMinorUnits,
    transactionId: asString(source.transactionId),
    configVersion,
    mining,
    replayed: asBoolean(root?.replayed) === true,
  };
}

function integerString(value: unknown) {
  const direct = asString(value);
  if (direct && /^\d+$/.test(direct)) return direct;
  const numeric = asNumber(value);
  return numeric !== null && Number.isSafeInteger(numeric) && numeric >= 0
    ? String(numeric)
    : null;
}
