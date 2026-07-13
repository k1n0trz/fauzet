import { PrismaClient, type LedgerAccountKind } from "@prisma/client";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const localEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

const database = new PrismaClient();
const welcomeBonusMinor = positiveIntegerEnv("WELCOME_BONUS_MINOR", 100);
const welcomeBonusBudgetMinor = positiveIntegerEnv(
  "WELCOME_BONUS_BUDGET_MINOR",
  1_000_000,
);
const faucetDailyBudgetMinor = positiveIntegerEnv(
  "FAUCET_DAILY_BUDGET_MINOR",
  200_000,
);
const faucetPoolFundingMinor = positiveIntegerEnv(
  "FAUCET_POOL_FUNDING_MINOR",
  faucetDailyBudgetMinor * 30,
);
const gamesDailyBudgetMinor = positiveIntegerEnv(
  "GAMES_DAILY_BUDGET_MINOR",
  200_000,
);
const gamesPoolFundingMinor = positiveIntegerEnv(
  "GAMES_POOL_FUNDING_MINOR",
  gamesDailyBudgetMinor * 30,
);
const missionsDailyBudgetMinor = positiveIntegerEnv(
  "MISSIONS_DAILY_BUDGET_MINOR",
  100_000,
);
const missionsPoolFundingMinor = positiveIntegerEnv(
  "MISSIONS_POOL_FUNDING_MINOR",
  missionsDailyBudgetMinor * 30,
);
const miningDailyPoolMinor = positiveIntegerEnv(
  "MINING_DAILY_POOL_MINOR",
  250_000,
);
const miningPoolFundingMinor = positiveIntegerEnv(
  "MINING_POOL_FUNDING_MINOR",
  miningDailyPoolMinor * 30,
);
if (welcomeBonusBudgetMinor < welcomeBonusMinor) {
  throw new Error("WELCOME_BONUS_BUDGET_MINOR must cover at least one bonus");
}
const systemAccounts: Array<{
  code: string;
  name: string;
  kind: LedgerAccountKind;
  allowNegative?: boolean;
}> = [
  {
    code: "platform:zyxe:issuance",
    name: "ZYXE internal issuance control",
    kind: "EQUITY",
    allowNegative: true,
  },
  {
    code: "platform:zyxe:reward-pool",
    name: "ZYXE reward pool",
    kind: "EQUITY",
  },
  {
    code: "platform:zyxe:promotional-pool",
    name: "ZYXE promotional pool",
    kind: "EQUITY",
  },
  {
    code: "platform:zyxe:game-reward-pool",
    name: "ZYXE game reward pool",
    kind: "EQUITY",
  },
  {
    code: "platform:zyxe:mission-reward-pool",
    name: "ZYXE mission reward pool",
    kind: "EQUITY",
  },
  {
    code: "platform:zyxe:mining-reward-pool",
    name: "ZYXE virtual mining reward pool",
    kind: "EQUITY",
  },
  {
    code: "platform:zyxe:referral-reward-pool",
    name: "ZYXE referral rewards backed by reconciled revenue",
    kind: "EQUITY",
  },
  { code: "platform:zyxe:burn", name: "ZYXE burned", kind: "CONTRA" },
  {
    code: "platform:zyxe:recycle",
    name: "ZYXE recycled rewards",
    kind: "EQUITY",
  },
  {
    code: "treasury:operation:zyxe",
    name: "Operational treasury ZYXE",
    kind: "EQUITY",
  },
  {
    code: "treasury:owner:available:zyxe",
    name: "Owner available ZYXE",
    kind: "EQUITY",
  },
];

async function seed() {
  for (const account of systemAccounts) {
    await database.ledgerAccount.upsert({
      where: { code: account.code },
      update: {
        name: account.name,
        kind: account.kind,
        active: true,
        allowNegative: account.allowNegative ?? false,
      },
      create: {
        ...account,
        asset: "ZYXE",
        allowNegative: account.allowNegative ?? false,
      },
    });
  }

  const faucetParameters = {
    enabled: true,
    rewardMinMinor: 5,
    rewardMaxMinor: 25,
    dailyBudgetMinor: faucetDailyBudgetMinor,
    cooldownSeconds: 15 * 60,
    dailyClaimLimit: 8,
    deviceDailyClaimLimit: 8,
    ipDailyClaimLimit: 24,
    captchaAfterClaims: 3,
    captchaProviderEnabled: false,
    maxRiskLevel: 50,
    streakBonusAfterDays: 7,
    streakBonusPercent: 20,
    challengeTtlSeconds: 5 * 60,
    creditBucket: "AVAILABLE",
  } as const;
  const gamesParameters = {
    enabled: true,
    dailyBudgetMinor: gamesDailyBudgetMinor,
    maxRiskLevel: 50,
    dailySessionLimitPerGame: 10,
    deviceDailySessionLimit: 20,
    ipDailySessionLimit: 60,
    completionGraceSeconds: 30,
    clientLeadToleranceMs: 750,
    energy: { max: 100, initial: 100, regenIntervalSeconds: 300 },
    tapMiner: {
      enabled: true,
      energyCost: 5,
      durationSeconds: 10,
      rewardMinMinor: 5,
      rewardMaxMinor: 25,
      rewardStepTaps: 4,
      maxTaps: 100,
      minTapIntervalMs: 80,
      maxBatchSize: 25,
    },
    memoryDrops: {
      enabled: true,
      energyCost: 8,
      durationSeconds: 45,
      rewardMinMinor: 10,
      rewardMaxMinor: 40,
      symbols: ["💧", "⛏️", "💠", "🚀", "🔋", "🏆"],
      mismatchLockMs: 700,
      minFlipIntervalMs: 120,
      completionBaseReward: 15,
      partialBaseReward: 5,
      rewardPerPair: 3,
      timeBonusDivisorSeconds: 2,
      scorePerPair: 10,
    },
  } as const;
  const missionsParameters = {
    enabled: true,
    dailyBudgetMinor: missionsDailyBudgetMinor,
    maxRiskLevel: 50,
    definitions: [
      {
        id: "m1",
        title: "Reclama 3 veces hoy",
        category: "daily",
        source: "FAUCET_POSTED",
        target: 3,
        rewardMinor: 30,
      },
      {
        id: "m2",
        title: "Gana 50 ZYXE en juegos",
        category: "daily",
        source: "GAME_REWARDS_POSTED",
        target: 50,
        rewardMinor: 40,
      },
      {
        id: "m3",
        title: "Mantén 100+ GH/s por 24h",
        category: "mining",
        source: "LOCKED",
        target: 24,
        rewardMinor: 60,
        lockedReason: "MINING_NOT_AVAILABLE",
      },
      {
        id: "m4",
        title: "Racha de 7 días",
        category: "weekly",
        source: "LOCKED",
        target: 7,
        rewardMinor: 100,
        lockedReason: "WEEKLY_MISSIONS_NOT_AVAILABLE",
      },
      {
        id: "m5",
        title: "Un miembro de crew activo",
        category: "referral",
        source: "LOCKED",
        target: 1,
        rewardMinor: 50,
        lockedReason: "REFERRAL_COMMISSIONS_GATED",
      },
      {
        id: "m6",
        title: "Misión patrocinada: encuesta",
        category: "premium",
        source: "LOCKED",
        target: 1,
        rewardMinor: 200,
        lockedReason: "PROVIDER_NOT_AVAILABLE",
      },
    ],
  } as const;
  const storeParameters = {
    enabled: true,
    maxRiskLevel: 50,
    split: { burnBps: 4000, recycleBps: 4000, treasuryBps: 2000 },
    products: [
      {
        id: "b1",
        kind: "ENERGY_REFILL",
        name: "Recarga de energía",
        description: "Restaura la energía minera al 100%.",
        category: "UTILITY",
        enabled: true,
        priceMinor: 80,
      },
      {
        id: "b2",
        kind: "HASH_BOOST",
        name: "Boost de hashpower ×1.5",
        description: "Aumenta el hash válido durante 6 horas; no acumulable.",
        category: "BOOST",
        enabled: true,
        priceMinor: 150,
      },
      {
        id: "b3",
        kind: "LOCKED",
        name: "Acelerador de cooldown",
        description: "Integración de faucet no disponible.",
        category: "BOOST",
        enabled: false,
        priceMinor: 200,
        lockedReason: "FAUCET_BOOST_NOT_AVAILABLE",
      },
      {
        id: "b4",
        kind: "REPAIR_KIT",
        name: "Kit de reparación",
        description: "Repara completamente un minero.",
        category: "UTILITY",
        enabled: true,
        priceMinor: 120,
      },
      {
        id: "b5",
        kind: "LOCKED",
        name: "Pase de misión premium",
        description: "Proveedor de misiones premium no disponible.",
        category: "PREMIUM",
        enabled: false,
        priceMinor: 350,
        lockedReason: "PREMIUM_MISSIONS_NOT_AVAILABLE",
      },
      {
        id: "b6",
        kind: "MINER",
        name: "Nova Rig II",
        description: "Minero premium permanente de 74 GH/s.",
        category: "MINER",
        enabled: true,
        priceMinor: 1200,
      },
    ],
  } as const;
  const miningParameters = {
    enabled: true,
    maxRiskLevel: 50,
    maxSlots: 4,
    maxEnergy: 100,
    initialEnergy: 100,
    refillMaxPerDay: 3,
    boostMultiplierBps: 15_000,
    boostDurationSeconds: 6 * 60 * 60,
    dailyPoolMinor: miningDailyPoolMinor,
    maxLevel: 10,
    upgradeCostMultiplierBps: 16_000,
    upgradeHashMultiplierBps: 12_500,
    repairBaseMinor: 200,
    starter: {
      modelId: "drip-node",
      name: "Drip Node",
      tier: "BASIC",
      hashRate: 20,
      energyPerHour: 2,
      efficiencyBps: 9600,
      upgradeBaseMinor: 220,
    },
    nova: {
      modelId: "nova-rig-ii",
      name: "Nova Rig II",
      tier: "PREMIUM",
      hashRate: 74,
      energyPerHour: 6,
      efficiencyBps: 9200,
      upgradeBaseMinor: 900,
    },
  } as const;
  const referralParameters = {
    version: 1,
    attributionEnabled: true,
    commissionsEnabled: false,
    legalApproved: false,
    disabledReason: "LEGAL_AND_REVENUE_GATE",
    maxRiskLevel: 30,
    ratesBps: [500, 200, 100, 50],
    monthlyCapMinor: 50_000,
    reviewWindowHours: 7 * 24,
    allowedSources: ["REWARDED_AD", "OFFERWALL", "VALIDATED_PURCHASE"],
  } as const;
  let activeConfig = await database.economicConfigVersion.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { id: "desc" },
  });
  if (!activeConfig) {
    activeConfig = await database.economicConfigVersion.create({
      data: {
        id: 1,
        status: "ACTIVE",
        reason: "Closed beta baseline",
        createdById: "system",
        effectiveAt: new Date(),
        parameters: {
          welcomeBonusMinor,
          welcomeBonusBudgetMinor,
          faucet: faucetParameters,
          games: gamesParameters,
          missions: missionsParameters,
          store: storeParameters,
          mining: miningParameters,
          referrals: referralParameters,
          purchaseSplit: { burn: 40, recycle: 40, treasury: 20 },
          referralsEnabled: false,
          withdrawalsEnabled: false,
          tradingEnabled: false,
        },
      },
    });
  } else if (!hasRuntimeParameters(activeConfig.parameters)) {
    activeConfig = await database.$transaction(async (tx) => {
      await tx.economicConfigVersion.updateMany({
        where: { status: "ACTIVE" },
        data: { status: "SUPERSEDED" },
      });
      return tx.economicConfigVersion.create({
        data: {
          status: "ACTIVE",
          reason: "Add server-authoritative closed beta runtime modules",
          createdById: "system",
          effectiveAt: new Date(),
          parameters: {
            ...asParameterRecord(activeConfig!.parameters),
            faucet: faucetParameters,
            games: gamesParameters,
            missions: missionsParameters,
            store: storeParameters,
            mining: miningParameters,
            referrals: referralParameters,
          },
        },
      });
    });
  }

  await database.$queryRaw`
    SELECT setval(
      pg_get_serial_sequence('"EconomicConfigVersion"', 'id'),
      (SELECT MAX(id) FROM "EconomicConfigVersion")
    )
  `;

  const [
    issuance,
    promotionalPool,
    rewardPool,
    gameRewardPool,
    missionRewardPool,
    miningRewardPool,
  ] = await Promise.all([
    database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:issuance" },
    }),
    database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:promotional-pool" },
    }),
    database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:reward-pool" },
    }),
    database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:game-reward-pool" },
    }),
    database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:mission-reward-pool" },
    }),
    database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:mining-reward-pool" },
    }),
  ]);
  await database.ledgerTransaction.upsert({
    where: { idempotencyKey: "seed:closed-beta:promotional-budget" },
    update: {},
    create: {
      idempotencyKey: "seed:closed-beta:promotional-budget",
      type: "PROMOTIONAL_BUDGET_FUNDED",
      sourceType: "economic_config",
      sourceId: "1:welcome-bonus-budget",
      status: "POSTED",
      configVersion: activeConfig.id,
      postedAt: new Date(),
      metadata: { seeded: true, budgetMinor: String(welcomeBonusBudgetMinor) },
      postings: {
        create: [
          {
            accountId: issuance.id,
            amount: String(-welcomeBonusBudgetMinor),
          },
          {
            accountId: promotionalPool.id,
            amount: String(welcomeBonusBudgetMinor),
          },
        ],
      },
    },
  });
  await database.ledgerTransaction.upsert({
    where: { idempotencyKey: "seed:closed-beta:faucet-pool" },
    update: {},
    create: {
      idempotencyKey: "seed:closed-beta:faucet-pool",
      type: "FAUCET_POOL_FUNDED",
      sourceType: "economic_config",
      sourceId: `${activeConfig.id}:faucet-pool`,
      status: "POSTED",
      configVersion: activeConfig.id,
      postedAt: new Date(),
      metadata: {
        seeded: true,
        dailyBudgetMinor: String(faucetDailyBudgetMinor),
        fundedMinor: String(faucetPoolFundingMinor),
      },
      postings: {
        create: [
          {
            accountId: issuance.id,
            amount: String(-faucetPoolFundingMinor),
          },
          {
            accountId: rewardPool.id,
            amount: String(faucetPoolFundingMinor),
          },
        ],
      },
    },
  });
  await fundPool({
    idempotencyKey: "seed:closed-beta:game-reward-pool",
    type: "GAME_REWARD_POOL_FUNDED",
    sourceId: `${activeConfig.id}:game-reward-pool`,
    configVersion: activeConfig.id,
    amount: gamesPoolFundingMinor,
    issuanceId: issuance.id,
    poolId: gameRewardPool.id,
    metadata: {
      dailyBudgetMinor: String(gamesDailyBudgetMinor),
      fundedMinor: String(gamesPoolFundingMinor),
    },
  });
  await fundPool({
    idempotencyKey: "seed:closed-beta:mining-reward-pool",
    type: "MINING_REWARD_POOL_FUNDED",
    sourceId: `${activeConfig.id}:mining-reward-pool`,
    configVersion: activeConfig.id,
    amount: miningPoolFundingMinor,
    issuanceId: issuance.id,
    poolId: miningRewardPool.id,
    metadata: {
      dailyBudgetMinor: String(miningDailyPoolMinor),
      fundedMinor: String(miningPoolFundingMinor),
    },
  });
  await fundPool({
    idempotencyKey: "seed:closed-beta:mission-reward-pool",
    type: "MISSION_REWARD_POOL_FUNDED",
    sourceId: `${activeConfig.id}:mission-reward-pool`,
    configVersion: activeConfig.id,
    amount: missionsPoolFundingMinor,
    issuanceId: issuance.id,
    poolId: missionRewardPool.id,
    metadata: {
      dailyBudgetMinor: String(missionsDailyBudgetMinor),
      fundedMinor: String(missionsPoolFundingMinor),
    },
  });
}

async function fundPool(input: {
  idempotencyKey: string;
  type: string;
  sourceId: string;
  configVersion: number;
  amount: number;
  issuanceId: string;
  poolId: string;
  metadata: Record<string, string>;
}) {
  await database.ledgerTransaction.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      idempotencyKey: input.idempotencyKey,
      type: input.type,
      sourceType: "economic_config",
      sourceId: input.sourceId,
      status: "POSTED",
      configVersion: input.configVersion,
      postedAt: new Date(),
      metadata: { seeded: true, ...input.metadata },
      postings: {
        create: [
          { accountId: input.issuanceId, amount: String(-input.amount) },
          { accountId: input.poolId, amount: String(input.amount) },
        ],
      },
    },
  });
}

function hasRuntimeParameters(value: unknown): boolean {
  const parameters = asParameterRecord(value);
  const referrals = asParameterRecord(parameters.referrals);
  return (
    "faucet" in parameters &&
    "games" in parameters &&
    "missions" in parameters &&
    "store" in parameters &&
    "mining" in parameters &&
    referrals.version === 1
  );
}

function asParameterRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

seed()
  .then(() => database.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await database.$disconnect();
    process.exit(1);
  });
