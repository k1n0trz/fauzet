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
          purchaseSplit: { burn: 40, recycle: 40, treasury: 20 },
          referralsEnabled: false,
          withdrawalsEnabled: false,
          tradingEnabled: false,
        },
      },
    });
  } else if (!hasFaucetParameters(activeConfig.parameters)) {
    activeConfig = await database.$transaction(async (tx) => {
      await tx.economicConfigVersion.updateMany({
        where: { status: "ACTIVE" },
        data: { status: "SUPERSEDED" },
      });
      return tx.economicConfigVersion.create({
        data: {
          status: "ACTIVE",
          reason: "Add server-authoritative closed beta faucet",
          createdById: "system",
          effectiveAt: new Date(),
          parameters: {
            ...asParameterRecord(activeConfig!.parameters),
            faucet: faucetParameters,
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

  const [issuance, promotionalPool, rewardPool] = await Promise.all([
    database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:issuance" },
    }),
    database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:promotional-pool" },
    }),
    database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:reward-pool" },
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
}

function hasFaucetParameters(value: unknown): boolean {
  return "faucet" in asParameterRecord(value);
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
