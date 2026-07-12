import { randomInt, randomUUID } from "node:crypto";
import { getDatabase, Prisma, type PrismaClient } from "@fauzet/database";
import { z } from "zod";
import {
  FaucetError,
  type FaucetChallenge,
  type FaucetClaimResult,
  type FaucetRequestContext,
  type FaucetState,
  type FaucetStatus,
  type FaucetStore,
} from "../domain/faucet.js";
import { LedgerInsufficientBalanceError } from "../domain/ledger-posting.js";
import { postLedgerTransactionInTransaction } from "./prisma-ledger-store.js";

const faucetParametersSchema = z.object({
  enabled: z.boolean(),
  rewardMinMinor: z.number().int().positive().safe(),
  rewardMaxMinor: z.number().int().positive().safe(),
  dailyBudgetMinor: z.number().int().positive().safe(),
  cooldownSeconds: z.number().int().positive().max(86_400),
  dailyClaimLimit: z.number().int().positive().max(100),
  deviceDailyClaimLimit: z.number().int().positive().max(100),
  ipDailyClaimLimit: z.number().int().positive().max(1_000),
  captchaAfterClaims: z.number().int().nonnegative().max(100),
  captchaProviderEnabled: z.literal(false),
  maxRiskLevel: z.number().int().min(0).max(100),
  streakBonusAfterDays: z.number().int().positive().max(365),
  streakBonusPercent: z.number().int().min(0).max(100),
  challengeTtlSeconds: z.number().int().positive().max(3_600),
  creditBucket: z.literal("AVAILABLE"),
});

const economicParametersSchema = z
  .object({ faucet: faucetParametersSchema })
  .passthrough();

type FaucetParameters = z.infer<typeof faucetParametersSchema>;
type TransactionClient = Prisma.TransactionClient;

interface Availability {
  configVersion: number;
  parameters: FaucetParameters;
  state: FaucetState;
  claimsToday: number;
  deviceClaimsToday: number;
  ipClaimsToday: number;
  nextClaimAt: Date | null;
  budgetDate: Date;
  budgetRemaining: bigint;
  streakDays: number;
  prospectiveStreakDays: number;
  bonusPercent: number;
}

export class PrismaFaucetStore implements FaucetStore {
  constructor(
    private readonly database: PrismaClient = getDatabase(),
    private readonly pickReward: (
      min: number,
      max: number,
    ) => number = secureReward,
  ) {}

  async status(
    userId: string,
    context: FaucetRequestContext,
    now: Date,
  ): Promise<FaucetStatus> {
    const user = await requireEligibleUser(this.database, userId, false);
    const availability = await readAvailability(
      this.database,
      userId,
      context,
      user.riskLevel,
      now,
    );
    return toPublicStatus(availability);
  }

  async createChallenge(
    userId: string,
    context: FaucetRequestContext,
    now: Date,
  ): Promise<FaucetChallenge> {
    return this.withSerializableRetry(async (tx) => {
      const user = await requireEligibleUser(tx, userId, true);
      const availability = await readAvailability(
        tx,
        userId,
        context,
        user.riskLevel,
        now,
      );
      assertClaimAvailable(availability);

      await tx.faucetChallenge.updateMany({
        where: { userId, status: "ISSUED" },
        data: { status: "EXPIRED" },
      });
      const challenge = await tx.faucetChallenge.create({
        data: {
          userId,
          expiresAt: new Date(
            now.getTime() + availability.parameters.challengeTtlSeconds * 1_000,
          ),
          ipHash: context.ipHash,
          deviceId: context.deviceId ?? null,
        },
      });
      return {
        id: challenge.id,
        expiresAt: challenge.expiresAt.toISOString(),
      };
    });
  }

  async claim(input: {
    userId: string;
    challengeId: string;
    idempotencyKey: string;
    context: FaucetRequestContext;
    now: Date;
  }): Promise<FaucetClaimResult> {
    const scopedKey = scopedIdempotencyKey(input.userId, input.idempotencyKey);
    try {
      return await this.withSerializableRetry(async (tx) => {
        const existing = await findExistingClaim(
          tx,
          input.userId,
          input.challengeId,
          scopedKey,
        );
        if (existing) return toClaimResult(existing, true);

        const user = await requireEligibleUser(tx, input.userId, true);
        const availability = await readAvailability(
          tx,
          input.userId,
          input.context,
          user.riskLevel,
          input.now,
          true,
        );
        assertClaimAvailable(availability);

        const challenge = await tx.faucetChallenge.findUnique({
          where: { id: input.challengeId },
        });
        validateChallenge(challenge, input, input.now);

        const multiplierPercent = 100 + availability.bonusPercent;
        const maxBaseByBudget =
          (availability.budgetRemaining * 100n) / BigInt(multiplierPercent);
        const remainingMax = Number(
          minBigInt(
            maxBaseByBudget,
            BigInt(availability.parameters.rewardMaxMinor),
          ),
        );
        if (remainingMax < availability.parameters.rewardMinMinor) {
          throw budgetExhaustedError();
        }
        const baseRewardMinor = BigInt(
          this.pickReward(availability.parameters.rewardMinMinor, remainingMax),
        );
        const rewardMinor =
          (baseRewardMinor * BigInt(multiplierPercent)) / 100n;
        const [pool, available] = await Promise.all([
          tx.ledgerAccount.findUnique({
            where: { code: "platform:zyxe:reward-pool" },
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
        if (!pool || !pool.active || !available) {
          throw new FaucetError(
            "FAUCET_CONFIG_INVALID",
            "Faucet ledger accounts are unavailable",
            503,
          );
        }

        const claimId = randomUUID();
        let transaction;
        try {
          transaction = await postLedgerTransactionInTransaction(tx, {
            idempotencyKey: scopedKey,
            type: "FAUCET_REWARD",
            sourceType: "faucet_claim",
            sourceId: claimId,
            configVersion: availability.configVersion,
            metadata: {
              challengeId: input.challengeId,
              ipHash: input.context.ipHash,
              deviceId: input.context.deviceId ?? null,
              budgetDate: isoDate(availability.budgetDate),
              baseRewardMinor: baseRewardMinor.toString(),
              streakDays: availability.prospectiveStreakDays,
              bonusPercent: availability.bonusPercent,
            },
            postings: [
              {
                account: {
                  id: pool.id,
                  asset: pool.asset,
                  kind: pool.kind,
                },
                amount: -rewardMinor,
              },
              {
                account: {
                  id: available.id,
                  asset: available.asset,
                  kind: available.kind,
                },
                amount: rewardMinor,
              },
            ],
          });
        } catch (error) {
          if (error instanceof LedgerInsufficientBalanceError) {
            throw new FaucetError(
              "FAUCET_POOL_EXHAUSTED",
              "The funded faucet reward pool is exhausted",
              503,
            );
          }
          throw error;
        }

        const nextClaimAt = new Date(
          input.now.getTime() + availability.parameters.cooldownSeconds * 1_000,
        );
        const claim = await tx.faucetClaim.create({
          data: {
            id: claimId,
            userId: input.userId,
            challengeId: input.challengeId,
            idempotencyKey: scopedKey,
            rewardMinor: rewardMinor.toString(),
            status: "POSTED",
            ruleVersion: availability.configVersion,
            budgetDate: availability.budgetDate,
            streakDays: availability.prospectiveStreakDays,
            bonusPercent: availability.bonusPercent,
            nextClaimAt,
            transactionId: transaction.id,
            ipHash: input.context.ipHash,
            deviceId: input.context.deviceId ?? null,
          },
        });
        const consumed = await tx.faucetChallenge.updateMany({
          where: { id: input.challengeId, status: "ISSUED" },
          data: { status: "CONSUMED", consumedAt: input.now },
        });
        if (consumed.count !== 1) {
          throw new FaucetError(
            "FAUCET_CHALLENGE_CONSUMED",
            "The faucet challenge was already consumed",
            409,
          );
        }
        return toClaimResult(claim, false);
      });
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        const recovered = await this.database.faucetClaim.findFirst({
          where: {
            userId: input.userId,
            OR: [
              { challengeId: input.challengeId },
              { idempotencyKey: scopedKey },
            ],
          },
        });
        if (
          recovered?.challengeId === input.challengeId &&
          recovered.idempotencyKey === scopedKey
        ) {
          return toClaimResult(recovered, true);
        }
        throw idempotencyConflictError();
      }
      throw error;
    }
  }

  private async withSerializableRetry<T>(
    operation: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.database.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (isPrismaCode(error, "P2034")) {
          if (attempt < 2) continue;
          throw faucetBusyError();
        }
        throw error;
      }
    }
    throw new Error("Unreachable faucet transaction retry state");
  }
}

async function requireEligibleUser(
  client: PrismaClient | TransactionClient,
  userId: string,
  lock: boolean,
): Promise<{ riskLevel: number }> {
  const users = lock
    ? await (client as TransactionClient).$queryRaw<
        Array<{
          id: string;
          status: string;
          emailVerifiedAt: Date | null;
          riskLevel: number;
        }>
      >(Prisma.sql`
        SELECT "id", "status", "emailVerifiedAt", "riskLevel"
        FROM "User"
        WHERE "id" = ${userId}
        FOR UPDATE
      `)
    : await client.user.findMany({
        where: { id: userId },
        select: {
          id: true,
          status: true,
          emailVerifiedAt: true,
          riskLevel: true,
        },
      });
  const user = users[0];
  if (!user || user.status !== "ACTIVE" || user.emailVerifiedAt === null) {
    throw new FaucetError(
      "FAUCET_ACCOUNT_NOT_ELIGIBLE",
      "An active, verified account is required to use the faucet",
      403,
    );
  }
  return { riskLevel: user.riskLevel };
}

async function readAvailability(
  client: PrismaClient | TransactionClient,
  userId: string,
  context: FaucetRequestContext,
  riskLevel: number,
  now: Date,
  lockConfig = false,
): Promise<Availability> {
  const config = await client.economicConfigVersion.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }],
    },
    orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
  });
  if (!config) {
    throw new FaucetError(
      "FAUCET_CONFIG_INVALID",
      "No active economic configuration is available",
      503,
    );
  }
  if (lockConfig) {
    await (client as TransactionClient).$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "EconomicConfigVersion"
      WHERE "id" = ${config.id}
      FOR UPDATE
    `);
  }
  const parameters = parseParameters(config.parameters);
  const budgetDate = utcDayStart(now);
  const [
    lastClaim,
    claimsToday,
    deviceClaimsToday,
    ipClaimsToday,
    spent,
    streakRows,
  ] = await Promise.all([
    client.faucetClaim.findFirst({
      where: { userId, status: "POSTED" },
      orderBy: { createdAt: "desc" },
    }),
    client.faucetClaim.count({
      where: {
        userId,
        status: "POSTED",
        budgetDate,
      },
    }),
    context.deviceId
      ? client.faucetClaim.count({
          where: {
            deviceId: context.deviceId,
            status: "POSTED",
            budgetDate,
          },
        })
      : Promise.resolve(0),
    client.faucetClaim.count({
      where: {
        ipHash: context.ipHash,
        status: "POSTED",
        budgetDate,
      },
    }),
    client.faucetClaim.aggregate({
      where: {
        budgetDate,
        status: "POSTED",
      },
      _sum: { rewardMinor: true },
    }),
    client.faucetClaim.findMany({
      where: { userId, status: "POSTED" },
      select: { budgetDate: true },
      distinct: ["budgetDate"],
      orderBy: { budgetDate: "desc" },
      take: 370,
    }),
  ]);
  const spentMinor = BigInt(spent._sum.rewardMinor?.toFixed(0) ?? "0");
  const budgetRemaining = BigInt(parameters.dailyBudgetMinor) - spentMinor;
  const nextClaimAt =
    lastClaim && lastClaim.nextClaimAt > now ? lastClaim.nextClaimAt : null;
  const { streakDays, prospectiveStreakDays } = calculateStreak(
    streakRows.map(({ budgetDate: claimBudgetDate }) => claimBudgetDate),
    now,
  );
  const bonusPercent =
    prospectiveStreakDays >= parameters.streakBonusAfterDays
      ? parameters.streakBonusPercent
      : 0;
  const minimumRewardWithBonus =
    (BigInt(parameters.rewardMinMinor) * BigInt(100 + bonusPercent)) / 100n;
  let state: FaucetState = "READY";
  if (!parameters.enabled) state = "DISABLED";
  else if (riskLevel > parameters.maxRiskLevel) state = "RISK_BLOCKED";
  else if (nextClaimAt) state = "COOLDOWN";
  else if (claimsToday >= parameters.dailyClaimLimit) state = "DAILY_LIMIT";
  else if (
    context.deviceId &&
    deviceClaimsToday >= parameters.deviceDailyClaimLimit
  )
    state = "DEVICE_LIMIT";
  else if (ipClaimsToday >= parameters.ipDailyClaimLimit) state = "IP_LIMIT";
  else if (claimsToday >= parameters.captchaAfterClaims)
    state = "CAPTCHA_REQUIRED";
  else if (budgetRemaining < minimumRewardWithBonus) state = "BUDGET_EXHAUSTED";

  return {
    configVersion: config.id,
    parameters,
    state,
    claimsToday,
    deviceClaimsToday,
    ipClaimsToday,
    nextClaimAt,
    budgetDate,
    budgetRemaining,
    streakDays,
    prospectiveStreakDays,
    bonusPercent,
  };
}

function parseParameters(parameters: Prisma.JsonValue): FaucetParameters {
  const parsed = economicParametersSchema.safeParse(parameters);
  if (!parsed.success) {
    throw new FaucetError(
      "FAUCET_CONFIG_INVALID",
      "The active faucet economic configuration is invalid",
      503,
    );
  }
  if (parsed.data.faucet.rewardMaxMinor < parsed.data.faucet.rewardMinMinor) {
    throw new FaucetError(
      "FAUCET_CONFIG_INVALID",
      "The faucet reward range is invalid",
      503,
    );
  }
  return parsed.data.faucet;
}

function toPublicStatus(availability: Availability): FaucetStatus {
  const { parameters } = availability;
  return {
    state: availability.state,
    canClaim: availability.state === "READY",
    captchaRequired: availability.state === "CAPTCHA_REQUIRED",
    nextClaimAt: availability.nextClaimAt?.toISOString() ?? null,
    claimsToday: availability.claimsToday,
    dailyClaimLimit: parameters.dailyClaimLimit,
    cooldownSeconds: parameters.cooldownSeconds,
    streakDays: availability.streakDays,
    bonusMultiplier: multiplier(availability.bonusPercent),
    reward: {
      asset: "ZYXE",
      minMinorUnits: String(parameters.rewardMinMinor),
      maxMinorUnits: String(parameters.rewardMaxMinor),
      bucket: "AVAILABLE",
    },
    configVersion: availability.configVersion,
  };
}

function assertClaimAvailable(availability: Availability): void {
  switch (availability.state) {
    case "READY":
      return;
    case "COOLDOWN":
      throw new FaucetError(
        "FAUCET_COOLDOWN",
        "The faucet cooldown is still active",
        429,
        { nextClaimAt: availability.nextClaimAt!.toISOString() },
      );
    case "DAILY_LIMIT":
      throw new FaucetError(
        "FAUCET_DAILY_LIMIT",
        "The daily faucet claim limit has been reached",
        429,
      );
    case "DEVICE_LIMIT":
      throw new FaucetError(
        "FAUCET_DEVICE_LIMIT",
        "The daily faucet limit for this device has been reached",
        429,
      );
    case "IP_LIMIT":
      throw new FaucetError(
        "FAUCET_IP_LIMIT",
        "The daily faucet limit for this network has been reached",
        429,
      );
    case "CAPTCHA_REQUIRED":
      throw new FaucetError(
        "FAUCET_CAPTCHA_REQUIRED",
        "A real CAPTCHA provider is required for further claims today",
        403,
        { captchaRequired: true },
      );
    case "RISK_BLOCKED":
      throw new FaucetError(
        "FAUCET_RISK_BLOCKED",
        "The account risk policy does not permit a faucet claim",
        403,
      );
    case "BUDGET_EXHAUSTED":
      throw budgetExhaustedError();
    case "DISABLED":
      throw new FaucetError(
        "FAUCET_DISABLED",
        "The faucet is currently disabled",
        503,
      );
  }
}

function validateChallenge(
  challenge: {
    userId: string;
    status: string;
    expiresAt: Date;
    ipHash: string;
    deviceId: string | null;
  } | null,
  input: {
    userId: string;
    context: FaucetRequestContext;
  },
  now: Date,
): void {
  if (!challenge || challenge.userId !== input.userId) {
    throw new FaucetError(
      "FAUCET_CHALLENGE_INVALID",
      "The faucet challenge is invalid",
      400,
    );
  }
  if (challenge.status === "CONSUMED") {
    throw new FaucetError(
      "FAUCET_CHALLENGE_CONSUMED",
      "The faucet challenge was already consumed",
      409,
    );
  }
  if (challenge.status !== "ISSUED" || challenge.expiresAt <= now) {
    throw new FaucetError(
      "FAUCET_CHALLENGE_EXPIRED",
      "The faucet challenge has expired",
      410,
    );
  }
  if (
    challenge.ipHash !== input.context.ipHash ||
    challenge.deviceId !== (input.context.deviceId ?? null)
  ) {
    throw new FaucetError(
      "FAUCET_CONTEXT_MISMATCH",
      "The faucet challenge does not match this IP/device context",
      403,
    );
  }
}

async function findExistingClaim(
  client: TransactionClient,
  userId: string,
  challengeId: string,
  idempotencyKey: string,
) {
  const matches = await client.faucetClaim.findMany({
    where: {
      userId,
      OR: [{ challengeId }, { idempotencyKey }],
    },
    take: 2,
  });
  if (matches.length === 0) return null;
  const claim = matches[0]!;
  if (
    matches.length === 1 &&
    claim.challengeId === challengeId &&
    claim.idempotencyKey === idempotencyKey
  ) {
    return claim;
  }
  throw idempotencyConflictError();
}

function toClaimResult(
  claim: {
    id: string;
    status: string;
    rewardMinor: Prisma.Decimal;
    nextClaimAt: Date;
    transactionId: string | null;
    ruleVersion: number;
    streakDays: number;
    bonusPercent: number;
  },
  replayed: boolean,
): FaucetClaimResult {
  if (claim.status !== "POSTED" || !claim.transactionId) {
    throw new FaucetError(
      "FAUCET_IDEMPOTENCY_CONFLICT",
      "The previous faucet request did not complete",
      409,
    );
  }
  return {
    claim: {
      id: claim.id,
      status: "POSTED",
      reward: {
        asset: "ZYXE",
        minorUnits: claim.rewardMinor.toFixed(0),
        bucket: "AVAILABLE",
      },
      nextClaimAt: claim.nextClaimAt.toISOString(),
      transactionId: claim.transactionId,
      configVersion: claim.ruleVersion,
      streakDays: claim.streakDays,
      bonusMultiplier: multiplier(claim.bonusPercent),
    },
    replayed,
  };
}

function utcDayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function calculateStreak(
  claimDates: readonly Date[],
  now: Date,
): { streakDays: number; prospectiveStreakDays: number } {
  const days = new Set(claimDates.map((date) => isoDate(utcDayStart(date))));
  const today = utcDayStart(now);
  const yesterday = new Date(today.getTime() - 86_400_000);
  let cursor: Date;
  let includesToday = false;
  if (days.has(isoDate(today))) {
    cursor = today;
    includesToday = true;
  } else if (days.has(isoDate(yesterday))) {
    cursor = yesterday;
  } else {
    return { streakDays: 0, prospectiveStreakDays: 1 };
  }

  let streakDays = 0;
  while (days.has(isoDate(cursor))) {
    streakDays += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return {
    streakDays,
    prospectiveStreakDays: includesToday ? streakDays : streakDays + 1,
  };
}

function multiplier(bonusPercent: number): string {
  const value = 1 + bonusPercent / 100;
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "");
}

function scopedIdempotencyKey(userId: string, key: string): string {
  return `faucet:${userId}:${key}`;
}

function secureReward(min: number, max: number): number {
  return randomInt(min, max + 1);
}

function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function budgetExhaustedError(): FaucetError {
  return new FaucetError(
    "FAUCET_BUDGET_EXHAUSTED",
    "The configured daily faucet budget is exhausted",
    503,
  );
}

function idempotencyConflictError(): FaucetError {
  return new FaucetError(
    "FAUCET_IDEMPOTENCY_CONFLICT",
    "Idempotency-Key or challenge identity conflicts with another claim",
    409,
  );
}

function faucetBusyError(): FaucetError {
  return new FaucetError(
    "FAUCET_BUSY",
    "The faucet is temporarily busy; retry and reuse the Idempotency-Key for claims",
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
