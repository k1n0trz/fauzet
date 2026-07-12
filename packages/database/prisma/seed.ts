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

  await database.economicConfigVersion.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      status: "ACTIVE",
      reason: "Closed beta baseline",
      createdById: "system",
      effectiveAt: new Date(),
      parameters: {
        welcomeBonusMinor,
        welcomeBonusBudgetMinor,
        purchaseSplit: { burn: 40, recycle: 40, treasury: 20 },
        referralsEnabled: false,
        withdrawalsEnabled: false,
        tradingEnabled: false,
      },
    },
  });

  await database.$queryRaw`
    SELECT setval(
      pg_get_serial_sequence('"EconomicConfigVersion"', 'id'),
      (SELECT MAX(id) FROM "EconomicConfigVersion")
    )
  `;

  const [issuance, promotionalPool] = await Promise.all([
    database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:issuance" },
    }),
    database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:promotional-pool" },
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
      configVersion: 1,
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
