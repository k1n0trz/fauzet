import { randomUUID } from "node:crypto";
import { getDatabase, Prisma, type PrismaClient } from "@fauzet/database";
import { z } from "zod";
import {
  MissionError,
  type MissionCatalogResult,
  type MissionClaimResult,
  type MissionStore,
  type MissionView,
} from "../domain/missions.js";
import { LedgerInsufficientBalanceError } from "../domain/ledger-posting.js";
import { postLedgerTransactionInTransaction } from "./prisma-ledger-store.js";

const definitionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(160),
  category: z.string().min(1).max(32),
  source: z.enum(["FAUCET_POSTED", "GAME_REWARDS_POSTED", "LOCKED"]),
  target: z.number().int().positive().safe(),
  rewardMinor: z.number().int().nonnegative().safe(),
  lockedReason: z.string().min(1).max(80).optional(),
});
const missionsSchema = z.object({
  enabled: z.boolean(),
  dailyBudgetMinor: z.number().int().positive().safe(),
  maxRiskLevel: z.number().int().min(0).max(100),
  definitions: z.array(definitionSchema).min(1).max(100),
});
const economicSchema = z.object({ missions: missionsSchema }).passthrough();

type Tx = Prisma.TransactionClient;
type MissionDefinition = z.infer<typeof definitionSchema>;
type MissionsParameters = z.infer<typeof missionsSchema>;

interface LoadedMissionConfig {
  id: number;
  parameters: MissionsParameters;
}

export class PrismaMissionStore implements MissionStore {
  constructor(
    private readonly database: PrismaClient = getDatabase(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async catalog(userId: string): Promise<MissionCatalogResult> {
    const now = this.clock();
    const [user, config] = await Promise.all([
      requireEligibleUser(this.database, userId, false),
      activeMissionConfig(this.database, now),
    ]);
    const missions = await Promise.all(
      config.parameters.definitions.map(async (definition) => {
        const period = missionPeriod(definition, config.id, now);
        const [progress, claimed] = await Promise.all([
          deriveProgress(this.database, userId, definition, period.periodKey),
          this.database.missionClaim.findUnique({
            where: {
              userId_missionId_periodKey: {
                userId,
                missionId: definition.id,
                periodKey: period.periodKey,
              },
            },
            include: { transaction: { select: { status: true } } },
          }),
        ]);
        return missionView(
          definition,
          period,
          progress,
          claimed?.transaction?.status === "POSTED",
          claimed !== null && claimed.transaction?.status !== "POSTED",
          config.parameters,
          user.riskLevel,
          config.id,
        );
      }),
    );
    return { missions, configVersion: config.id };
  }

  async claim(input: {
    userId: string;
    missionId: string;
    periodKey: string;
    configVersion: number;
    idempotencyKey: string;
    context: { ipHash: string; deviceId?: string };
  }): Promise<MissionClaimResult> {
    const scopedIdempotency = `mission:${input.userId}:${input.missionId}:${input.periodKey}:${input.idempotencyKey}`;
    try {
      return await this.withRetry(async (tx) => {
        const existing = await findExistingClaim(
          tx,
          input.userId,
          input.missionId,
          input.periodKey,
          scopedIdempotency,
        );
        if (existing) return claimResult(existing, true);

        const now = this.clock();
        const user = await requireEligibleUser(tx, input.userId, true);
        const config = await activeMissionConfig(tx, now, true);
        if (input.configVersion !== config.id)
          throw new MissionError(
            "MISSION_PERIOD_INVALID",
            "Mission configuration changed; refresh the catalog",
            409,
            { expectedConfigVersion: config.id },
          );
        if (!config.parameters.enabled)
          throw new MissionError(
            "MISSION_DISABLED",
            "Missions are disabled",
            503,
          );
        if (user.riskLevel > config.parameters.maxRiskLevel)
          throw new MissionError(
            "MISSION_RISK_BLOCKED",
            "Risk policy blocks mission rewards",
            403,
          );
        const definition = config.parameters.definitions.find(
          ({ id }) => id === input.missionId,
        );
        if (!definition)
          throw new MissionError(
            "MISSION_NOT_FOUND",
            "Mission was not found",
            404,
          );
        const period = missionPeriod(definition, config.id, now);
        if (input.periodKey !== period.periodKey)
          throw new MissionError(
            "MISSION_PERIOD_INVALID",
            "Mission period is no longer current",
            409,
            { expectedPeriodKey: period.periodKey },
          );
        if (definition.source === "LOCKED")
          throw new MissionError(
            "MISSION_LOCKED",
            "Mission is locked until its authoritative source is available",
            409,
            { reasonCode: definition.lockedReason ?? "SOURCE_NOT_AVAILABLE" },
          );
        const progress = await deriveProgress(
          tx,
          input.userId,
          definition,
          period.periodKey,
        );
        if (progress < BigInt(definition.target))
          throw new MissionError(
            "MISSION_INCOMPLETE",
            "Mission target has not been reached",
            409,
            { progress: progress.toString(), target: definition.target },
          );

        const budgetKey = isoDate(utcDayStart(now));
        const budgetStart = dateFromPeriodKey(budgetKey);
        const budgetEnd = new Date(budgetStart.getTime() + 86_400_000);
        await tx.$queryRaw(Prisma.sql`
          SELECT 1 AS "acquired"
          FROM pg_advisory_xact_lock(
            hashtext(${"mission-budget:" + budgetKey})
          )
        `);
        const spent = await tx.missionClaim.aggregate({
          where: {
            status: "POSTED",
            transaction: {
              is: {
                status: "POSTED",
                postedAt: { gte: budgetStart, lt: budgetEnd },
              },
            },
          },
          _sum: { rewardMinor: true },
        });
        const remaining =
          BigInt(config.parameters.dailyBudgetMinor) -
          BigInt(spent._sum.rewardMinor?.toFixed(0) ?? "0");
        if (remaining < BigInt(definition.rewardMinor))
          throw new MissionError(
            "MISSION_BUDGET_EXHAUSTED",
            "Daily mission budget is exhausted",
            503,
          );
        const [pool, available] = await Promise.all([
          tx.ledgerAccount.findUnique({
            where: { code: "platform:zyxe:mission-reward-pool" },
          }),
          tx.ledgerAccount.findFirst({
            where: {
              userId: input.userId,
              asset: "ZYXE",
              bucket: "AVAILABLE",
              active: true,
            },
          }),
        ]);
        if (!pool?.active || !available)
          throw new MissionError(
            "MISSION_CONFIG_INVALID",
            "Mission ledger accounts are unavailable",
            503,
          );
        const claimId = randomUUID();
        let transaction;
        try {
          transaction = await postLedgerTransactionInTransaction(tx, {
            idempotencyKey: scopedIdempotency,
            type: "MISSION_REWARD",
            sourceType: "mission_claim",
            sourceId: claimId,
            configVersion: config.id,
            metadata: {
              missionId: definition.id,
              periodKey: period.periodKey,
              progress: progress.toString(),
              target: String(definition.target),
              ipHash: input.context.ipHash,
              deviceId: input.context.deviceId ?? null,
              derivedFromPostedSources: true,
            },
            postings: [
              {
                account: { id: pool.id, asset: pool.asset, kind: pool.kind },
                amount: -BigInt(definition.rewardMinor),
              },
              {
                account: {
                  id: available.id,
                  asset: available.asset,
                  kind: available.kind,
                },
                amount: BigInt(definition.rewardMinor),
              },
            ],
          });
        } catch (error) {
          if (error instanceof LedgerInsufficientBalanceError)
            throw new MissionError(
              "MISSION_POOL_EXHAUSTED",
              "Funded mission reward pool is exhausted",
              503,
            );
          throw error;
        }
        const claim = await tx.missionClaim.create({
          data: {
            id: claimId,
            userId: input.userId,
            missionId: definition.id,
            periodKey: period.periodKey,
            idempotencyKey: scopedIdempotency,
            status: "POSTED",
            progress: progress.toString(),
            target: String(definition.target),
            rewardMinor: String(definition.rewardMinor),
            ruleVersion: config.id,
            transactionId: transaction.id,
          },
        });
        return claimResult(claim, false);
      });
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        const recovered = await this.database.missionClaim.findFirst({
          where: {
            userId: input.userId,
            missionId: input.missionId,
            periodKey: input.periodKey,
          },
          include: { transaction: { select: { status: true } } },
        });
        if (recovered?.idempotencyKey === scopedIdempotency)
          return claimResult(recovered, true);
        if (recovered)
          throw new MissionError(
            "MISSION_ALREADY_CLAIMED",
            "Mission was already claimed for this period",
            409,
          );
      }
      throw error;
    }
  }

  private async withRetry<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.database.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (isSerializationError(error) && attempt < 2) continue;
        if (isSerializationError(error))
          throw new MissionError(
            "MISSION_BUSY",
            "Mission state is busy; retry idempotently",
            503,
          );
        throw error;
      }
    }
    throw new MissionError(
      "MISSION_BUSY",
      "Mission state is busy; retry idempotently",
      503,
    );
  }
}

async function activeMissionConfig(
  client: PrismaClient | Tx,
  now: Date,
  lock = false,
): Promise<LoadedMissionConfig> {
  const config = await client.economicConfigVersion.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }],
    },
    orderBy: { id: "desc" },
  });
  if (!config) throw configError();
  if (lock)
    await (client as Tx).$queryRaw(
      Prisma.sql`SELECT "id" FROM "EconomicConfigVersion" WHERE "id" = ${config.id} FOR UPDATE`,
    );
  const parsed = economicSchema.safeParse(config.parameters);
  if (!parsed.success) throw configError();
  const ids = parsed.data.missions.definitions.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw configError();
  for (const definition of parsed.data.missions.definitions) {
    if (definition.source === "LOCKED" && !definition.lockedReason)
      throw configError();
  }
  return { id: config.id, parameters: parsed.data.missions };
}

async function deriveProgress(
  client: PrismaClient | Tx,
  userId: string,
  definition: MissionDefinition,
  periodKey: string,
): Promise<bigint> {
  if (definition.source === "LOCKED") return 0n;
  const budgetDate = dateFromPeriodKey(periodKey);
  const periodEnd = new Date(budgetDate.getTime() + 86_400_000);
  if (definition.source === "FAUCET_POSTED") {
    const count = await client.faucetClaim.count({
      where: {
        userId,
        status: "POSTED",
        transaction: {
          is: {
            status: "POSTED",
            postedAt: { gte: budgetDate, lt: periodEnd },
          },
        },
      },
    });
    return BigInt(count);
  }
  const result = await client.gameSession.aggregate({
    where: {
      userId,
      status: "COMPLETED",
      transaction: {
        is: {
          status: "POSTED",
          postedAt: { gte: budgetDate, lt: periodEnd },
        },
      },
    },
    _sum: { rewardMinor: true },
  });
  return BigInt(result._sum.rewardMinor?.toFixed(0) ?? "0");
}

function missionPeriod(
  definition: MissionDefinition,
  configVersion: number,
  now: Date,
): { periodKey: string; periodEndsAt: Date | null } {
  const start = utcDayStart(now);
  if (definition.category === "daily")
    return {
      periodKey: isoDate(start),
      periodEndsAt: new Date(start.getTime() + 86_400_000),
    };
  if (definition.category === "weekly") {
    const day = (start.getUTCDay() + 6) % 7;
    const week = new Date(start.getTime() - day * 86_400_000);
    return {
      periodKey: `week:${isoDate(week)}`,
      periodEndsAt: new Date(week.getTime() + 7 * 86_400_000),
    };
  }
  if (definition.category === "referral")
    return { periodKey: "lifetime", periodEndsAt: null };
  return { periodKey: `config:${configVersion}`, periodEndsAt: null };
}

function missionView(
  definition: MissionDefinition,
  period: { periodKey: string; periodEndsAt: Date | null },
  progress: bigint,
  claimed: boolean,
  reversedClaim: boolean,
  parameters: MissionsParameters,
  riskLevel: number,
  configVersion: number,
): MissionView {
  let status: MissionView["status"];
  let reasonCode: string | null = null;
  if (definition.source === "LOCKED") {
    status = "LOCKED";
    reasonCode = definition.lockedReason ?? "SOURCE_NOT_AVAILABLE";
  } else if (!parameters.enabled) {
    status = "LOCKED";
    reasonCode = "MISSIONS_DISABLED";
  } else if (riskLevel > parameters.maxRiskLevel) {
    status = "LOCKED";
    reasonCode = "RISK_BLOCKED";
  } else if (reversedClaim) {
    status = "LOCKED";
    reasonCode = "CLAIM_REVERSED";
  } else if (claimed) status = "CLAIMED";
  else if (progress >= BigInt(definition.target)) status = "CLAIMABLE";
  else status = "IN_PROGRESS";
  return {
    id: definition.id,
    periodKey: period.periodKey,
    configVersion,
    title: definition.title,
    category: definition.category === "referral" ? "crew" : definition.category,
    requirement:
      definition.source === "FAUCET_POSTED"
        ? "Valid faucet claims"
        : definition.source === "GAME_REWARDS_POSTED"
          ? "Validated game rewards"
          : (definition.lockedReason ?? "Authoritative source unavailable"),
    premium: definition.category === "premium",
    status,
    reasonCode,
    progress: safeInteger(progress),
    target: definition.target,
    reward: {
      asset: "ZYXE",
      minorUnits: String(definition.rewardMinor),
      bucket: "AVAILABLE",
    },
    periodEndsAt: period.periodEndsAt?.toISOString() ?? null,
    expiresAt: period.periodEndsAt?.toISOString() ?? null,
  };
}

async function requireEligibleUser(
  client: PrismaClient | Tx,
  userId: string,
  lock: boolean,
): Promise<{ riskLevel: number }> {
  const rows = lock
    ? await (client as Tx).$queryRaw<
        Array<{
          status: string;
          emailVerifiedAt: Date | null;
          riskLevel: number;
        }>
      >(Prisma.sql`
        SELECT "status", "emailVerifiedAt", "riskLevel"
        FROM "User" WHERE "id" = ${userId} FOR UPDATE
      `)
    : await client.user.findMany({
        where: { id: userId },
        select: { status: true, emailVerifiedAt: true, riskLevel: true },
      });
  const user = rows[0];
  if (!user || user.status !== "ACTIVE" || !user.emailVerifiedAt)
    throw new MissionError(
      "MISSION_ACCOUNT_NOT_ELIGIBLE",
      "An active, verified account is required for missions",
      403,
    );
  return { riskLevel: user.riskLevel };
}

async function findExistingClaim(
  tx: Tx,
  userId: string,
  missionId: string,
  periodKey: string,
  idempotencyKey: string,
) {
  const claims = await tx.missionClaim.findMany({
    where: {
      userId,
      OR: [{ missionId, periodKey }, { idempotencyKey }],
    },
    include: { transaction: { select: { status: true } } },
    take: 3,
  });
  if (claims.length === 0) return null;
  const exact = claims.find(
    (claim) =>
      claim.missionId === missionId &&
      claim.periodKey === periodKey &&
      claim.idempotencyKey === idempotencyKey,
  );
  if (claims.length === 1 && exact) return exact;
  if (
    claims.some(
      (claim) => claim.missionId === missionId && claim.periodKey === periodKey,
    )
  )
    throw new MissionError(
      "MISSION_ALREADY_CLAIMED",
      "Mission was already claimed for this period",
      409,
    );
  throw new MissionError(
    "MISSION_IDEMPOTENCY_CONFLICT",
    "Mission idempotency identity conflicts",
    409,
  );
}

function claimResult(
  claim: {
    id: string;
    missionId: string;
    periodKey: string;
    status: string;
    progress: Prisma.Decimal;
    target: Prisma.Decimal;
    rewardMinor: Prisma.Decimal;
    transactionId: string | null;
    ruleVersion: number;
    transaction?: { status: string } | null;
  },
  replayed: boolean,
): MissionClaimResult {
  if (
    claim.status === "REJECTED" ||
    (claim.transaction && claim.transaction.status !== "POSTED")
  )
    throw new MissionError(
      "MISSION_CLAIM_REVERSED",
      "The mission reward was reversed and cannot be replayed",
      409,
    );
  if (claim.status !== "POSTED" || !claim.transactionId) throw configError();
  return {
    missionClaim: {
      id: claim.id,
      missionId: claim.missionId,
      periodKey: claim.periodKey,
      status: "POSTED",
      progress: safeInteger(BigInt(claim.progress.toFixed(0))),
      target: safeInteger(BigInt(claim.target.toFixed(0))),
      reward: {
        asset: "ZYXE",
        minorUnits: claim.rewardMinor.toFixed(0),
        bucket: "AVAILABLE",
      },
      transactionId: claim.transactionId,
      configVersion: claim.ruleVersion,
    },
    replayed,
  };
}

function dateFromPeriodKey(periodKey: string): Date {
  const dateKey = dailyKeyFromPeriod(periodKey);
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || isoDate(date) !== dateKey)
    throw configError();
  return date;
}

function dailyKeyFromPeriod(periodKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) throw configError();
  return periodKey;
}

function utcDayStart(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function safeInteger(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw configError();
  return result;
}

function configError() {
  return new MissionError(
    "MISSION_CONFIG_INVALID",
    "Mission economic configuration is invalid",
    503,
  );
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function isSerializationError(error: unknown): boolean {
  if (isPrismaCode(error, "P2034")) return true;
  return (
    isPrismaCode(error, "P2010") &&
    typeof error === "object" &&
    error !== null &&
    "meta" in error &&
    typeof error.meta === "object" &&
    error.meta !== null &&
    "code" in error.meta &&
    error.meta.code === "40001"
  );
}
