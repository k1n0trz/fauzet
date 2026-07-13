import { randomUUID } from "node:crypto";
import type {
  ReferralCodeResponse,
  ReferralCommissionsResponse,
  ReferralTreeResponse,
} from "@fauzet/contracts";
import {
  getDatabase,
  Prisma,
  type LedgerAccountKind,
  type PrismaClient,
} from "@fauzet/database";
import { z } from "zod";
import { ReferralError, type ReferralStore } from "../domain/referrals.js";
import { LedgerInsufficientBalanceError } from "../domain/ledger-posting.js";
import { postLedgerTransactionInTransaction } from "./prisma-ledger-store.js";

type Tx = Prisma.TransactionClient;

const referralParametersSchema = z.object({
  referrals: z.object({
    version: z.literal(1),
    attributionEnabled: z.boolean(),
    commissionsEnabled: z.boolean(),
    legalApproved: z.boolean(),
    disabledReason: z.string(),
    maxRiskLevel: z.number().int().min(0).max(100),
    ratesBps: z.tuple([
      z.number().int().min(0).max(10_000),
      z.number().int().min(0).max(10_000),
      z.number().int().min(0).max(10_000),
      z.number().int().min(0).max(10_000),
    ]),
    monthlyCapMinor: z.number().int().positive().safe(),
    reviewWindowHours: z
      .number()
      .int()
      .nonnegative()
      .max(24 * 90),
    allowedSources: z.array(
      z.enum(["REWARDED_AD", "OFFERWALL", "VALIDATED_PURCHASE"]),
    ),
  }),
});

type ReferralConfig = z.infer<typeof referralParametersSchema>["referrals"] & {
  id: number;
};

export type QualifyReferralActivityInput = {
  userId: string;
  sourceType: "REWARDED_AD" | "OFFERWALL" | "VALIDATED_PURCHASE";
  sourceId: string;
  idempotencyKey: string;
  baseMinor: bigint;
  qualifiedAt: Date;
  evidence: Record<string, string | number | boolean | null>;
};

export class PrismaReferralStore implements ReferralStore {
  constructor(
    private readonly database: PrismaClient = getDatabase(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async code(userId: string): Promise<ReferralCodeResponse> {
    return this.withRetry(async (tx) => {
      const now = this.clock();
      const [user, config] = await Promise.all([
        eligibleUser(tx, userId, true),
        activeReferralConfig(tx, now),
      ]);
      let profile = await tx.referralProfile.findUnique({ where: { userId } });
      if (!profile) {
        profile = await tx.referralProfile.create({
          data: { userId, code: createReferralCode() },
        });
      }
      const edge = await tx.referralEdge.findUnique({
        where: { referredUserId: userId },
        include: { sponsor: { select: { displayName: true } } },
      });
      const program = programState(config, user.riskLevel);
      return {
        serverNow: now.toISOString(),
        configVersion: config.id,
        ...program,
        code: profile.code,
        invitePath: `/r/${profile.code}`,
        sponsor: edge
          ? {
              displayName: publicName(edge.sponsor.displayName),
              joinedAt: edge.createdAt.toISOString(),
            }
          : null,
        rates: config.ratesBps.map((rateBps, index) => ({
          level: index + 1,
          rateBps,
        })),
        monthlyCapMinorUnits: String(config.monthlyCapMinor),
        reviewWindowHours: config.reviewWindowHours,
      };
    }, true);
  }

  async tree(userId: string): Promise<ReferralTreeResponse> {
    return this.withRetry(async (tx) => {
      const now = this.clock();
      const [user, config] = await Promise.all([
        eligibleUser(tx, userId, false),
        activeReferralConfig(tx, now),
      ]);
      const cutoff = new Date(now.getTime() - 30 * 86_400_000);
      const descendants = await tx.referralAncestor.findMany({
        where: { ancestorId: userId },
        include: {
          descendant: {
            select: {
              id: true,
              displayName: true,
              status: true,
              emailVerifiedAt: true,
              riskLevel: true,
              monetizableActivities: {
                where: { status: "QUALIFIED", qualifiedAt: { gte: cutoff } },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      const isActive = (row: (typeof descendants)[number]) =>
        row.descendant.status === "ACTIVE" &&
        row.descendant.emailVerifiedAt !== null &&
        row.descendant.riskLevel <= config.maxRiskLevel &&
        row.descendant.monetizableActivities.length > 0;
      const state = programState(config, user.riskLevel);
      return {
        serverNow: now.toISOString(),
        ...state,
        totalMembers: descendants.length,
        activeMembers: descendants.filter(isActive).length,
        levels: config.ratesBps.map((rateBps, index) => {
          const level = index + 1;
          const rows = descendants.filter(({ depth }) => depth === level);
          return {
            level,
            rateBps,
            members: rows.length,
            activeMembers: rows.filter(isActive).length,
          };
        }),
        recentMembers: descendants.slice(0, 20).map((row) => ({
          id: row.descendant.id,
          displayName: publicName(row.descendant.displayName),
          level: row.depth,
          state:
            row.descendant.status !== "ACTIVE" ||
            row.descendant.riskLevel > config.maxRiskLevel
              ? ("BLOCKED" as const)
              : isActive(row)
                ? ("ACTIVE" as const)
                : ("INACTIVE" as const),
          joinedAt: row.createdAt.toISOString(),
        })),
      };
    });
  }

  async commissions(userId: string): Promise<ReferralCommissionsResponse> {
    return this.withRetry(async (tx) => {
      const now = this.clock();
      const month = utcMonth(now);
      const [user, config, commissions, totals, monthTotals] =
        await Promise.all([
          eligibleUser(tx, userId, false),
          activeReferralConfig(tx, now),
          tx.referralCommission.findMany({
            where: { beneficiaryId: userId },
            include: {
              activity: {
                include: { user: { select: { displayName: true } } },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 50,
          }),
          tx.referralCommission.groupBy({
            by: ["status"],
            where: { beneficiaryId: userId },
            _sum: { rewardMinor: true, cappedMinor: true },
          }),
          tx.referralCommission.groupBy({
            by: ["status"],
            where: { beneficiaryId: userId, capMonth: month },
            _sum: { rewardMinor: true },
          }),
        ]);
      const sum = (statuses: string[]) =>
        totals
          .filter(({ status }) => statuses.includes(status))
          .reduce(
            (total, row) =>
              total + BigInt(row._sum.rewardMinor?.toFixed(0) ?? "0"),
            0n,
          );
      const monthEarned = monthTotals
        .filter(({ status }) =>
          ["PENDING", "AVAILABLE", "HELD", "CLAWBACK_PENDING"].includes(status),
        )
        .reduce(
          (total, row) =>
            total + BigInt(row._sum.rewardMinor?.toFixed(0) ?? "0"),
          0n,
        );
      const cappedTotal = totals.reduce(
        (total, row) => total + BigInt(row._sum.cappedMinor?.toFixed(0) ?? "0"),
        0n,
      );
      const state = programState(config, user.riskLevel);
      return {
        serverNow: now.toISOString(),
        ...state,
        summary: {
          pendingMinorUnits: sum(["PENDING", "HELD"]).toString(),
          availableMinorUnits: sum(["AVAILABLE"]).toString(),
          reversedMinorUnits: sum(["REVERSED"]).toString(),
          cappedMinorUnits: cappedTotal.toString(),
          monthEarnedMinorUnits: monthEarned.toString(),
          monthRemainingMinorUnits: (
            BigInt(config.monthlyCapMinor) -
            (monthEarned < BigInt(config.monthlyCapMinor)
              ? monthEarned
              : BigInt(config.monthlyCapMinor))
          ).toString(),
        },
        items: commissions.map((commission) => ({
          id: commission.id,
          level: commission.level,
          memberDisplayName: publicName(commission.activity.user.displayName),
          sourceType: commission.activity.sourceType,
          status: commission.status,
          baseMinorUnits: commission.baseMinor.toFixed(0),
          rewardMinorUnits: commission.rewardMinor.toFixed(0),
          qualifiedAt: commission.activity.qualifiedAt.toISOString(),
          availableAt:
            commission.status === "AVAILABLE"
              ? (commission.availableAt?.toISOString() ?? null)
              : (commission.availableAt?.toISOString() ?? null),
        })),
      };
    });
  }

  async qualifyActivity(input: QualifyReferralActivityInput) {
    if (input.baseMinor <= 0n)
      throw new ReferralError(
        "REFERRAL_ACTIVITY_CONFLICT",
        "Commissionable base must be positive",
        400,
      );
    return this.withRetry(async (tx) => {
      const existing = await findActivity(tx, input);
      if (existing) return { activityId: existing.id, replayed: true };
      const config = await activeReferralConfig(tx, input.qualifiedAt);
      assertCommissionsEnabled(config);
      if (!config.allowedSources.includes(input.sourceType))
        throw new ReferralError(
          "REFERRAL_SOURCE_NOT_ALLOWED",
          "Activity source is not commissionable",
          409,
        );
      await eligibleUser(tx, input.userId, true, config.maxRiskLevel);
      const activityId = randomUUID();
      await tx.monetizableActivity.create({
        data: {
          id: activityId,
          userId: input.userId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          idempotencyKey: `referral:${input.idempotencyKey}`,
          status: "QUALIFIED",
          baseMinor: input.baseMinor.toString(),
          evidence: toJson(input.evidence),
          ruleVersion: config.id,
          qualifiedAt: input.qualifiedAt,
        },
      });
      const ancestors = await tx.referralAncestor.findMany({
        where: { descendantId: input.userId, depth: { lte: 4 } },
        include: {
          ancestor: {
            select: { status: true, emailVerifiedAt: true, riskLevel: true },
          },
        },
        orderBy: { depth: "asc" },
      });
      const capMonth = utcMonth(input.qualifiedAt);
      await tx.$queryRaw(Prisma.sql`
        SELECT 1 AS "acquired"
        FROM pg_advisory_xact_lock(hashtext(${"referral-pool"}))
      `);
      for (const beneficiaryId of [
        ...new Set(ancestors.map(({ ancestorId }) => ancestorId)),
      ].sort())
        await tx.$queryRaw(Prisma.sql`
          SELECT 1 AS "acquired"
          FROM pg_advisory_xact_lock(
            hashtext(${`referral-cap:${capMonth}:${beneficiaryId}`})
          )
        `);
      const plans: Array<{
        beneficiaryId: string;
        level: number;
        rateBps: number;
        reward: bigint;
        capped: bigint;
        status: "PENDING" | "CAPPED";
      }> = [];
      for (const row of ancestors) {
        if (
          row.ancestor.status !== "ACTIVE" ||
          !row.ancestor.emailVerifiedAt ||
          row.ancestor.riskLevel > config.maxRiskLevel
        )
          continue;
        const rateBps = config.ratesBps[row.depth - 1]!;
        const raw = (input.baseMinor * BigInt(rateBps)) / 10_000n;
        const used = await monthlyCommitted(tx, row.ancestorId, capMonth);
        const remaining = BigInt(config.monthlyCapMinor) - used;
        const reward = remaining <= 0n ? 0n : raw < remaining ? raw : remaining;
        plans.push({
          beneficiaryId: row.ancestorId,
          level: row.depth,
          rateBps,
          reward,
          capped: raw - reward,
          status: reward > 0n ? "PENDING" : "CAPPED",
        });
      }
      const funded = plans.filter(({ reward }) => reward > 0n);
      let transactionId: string | null = null;
      if (funded.length > 0) {
        const { pool, pendingByUser } = await referralAccounts(
          tx,
          funded.map(({ beneficiaryId }) => beneficiaryId),
        );
        const total = funded.reduce((sum, plan) => sum + plan.reward, 0n);
        try {
          const transaction = await postLedgerTransactionInTransaction(tx, {
            idempotencyKey: `referral:pending:${activityId}`,
            type: "REFERRAL_COMMISSIONS_PENDING",
            sourceType: "referral_activity",
            sourceId: activityId,
            configVersion: config.id,
            metadata: {
              activityUserId: input.userId,
              sourceType: input.sourceType,
              sourceId: input.sourceId,
              commissionableBaseMinor: input.baseMinor.toString(),
              totalRewardMinor: total.toString(),
              levels: funded.length,
            },
            postings: [
              { account: accountRef(pool), amount: -total },
              ...funded.map((plan) => ({
                account: accountRef(pendingByUser.get(plan.beneficiaryId)!),
                amount: plan.reward,
              })),
            ],
          });
          transactionId = transaction.id;
        } catch (error) {
          if (error instanceof LedgerInsufficientBalanceError)
            throw new ReferralError(
              "REFERRAL_POOL_INSUFFICIENT",
              "Referral pool cannot fully fund this activity",
              503,
            );
          throw error;
        }
      }
      if (plans.length > 0)
        await tx.referralCommission.createMany({
          data: plans.map((plan) => ({
            activityId,
            beneficiaryId: plan.beneficiaryId,
            level: plan.level,
            rateBps: plan.rateBps,
            baseMinor: input.baseMinor.toString(),
            rewardMinor: plan.reward.toString(),
            cappedMinor: plan.capped.toString(),
            status: plan.status,
            capMonth,
            ruleVersion: config.id,
            pendingTransactionId:
              plan.status === "PENDING" ? transactionId : null,
            availableAt:
              plan.status === "PENDING"
                ? new Date(
                    input.qualifiedAt.getTime() +
                      config.reviewWindowHours * 3_600_000,
                  )
                : null,
          })),
        });
      return { activityId, replayed: false };
    }, true);
  }

  async releaseActivity(activityId: string, now = this.clock()) {
    return this.withRetry(async (tx) => {
      await lockActivity(tx, activityId);
      const activity = await tx.monetizableActivity.findUnique({
        where: { id: activityId },
        include: {
          commissions: {
            include: { beneficiary: true },
          },
        },
      });
      if (!activity)
        throw new ReferralError(
          "REFERRAL_ACTIVITY_CONFLICT",
          "Activity was not found",
          404,
        );
      if (activity.status !== "QUALIFIED")
        return { released: 0, replayed: true };
      const [config, currentConfig] = await Promise.all([
        referralConfigById(tx, activity.ruleVersion),
        activeReferralConfig(tx, now),
      ]);
      assertCommissionsEnabled(currentConfig);
      const due = activity.commissions.filter(
        (commission) =>
          ["PENDING", "HELD"].includes(commission.status) &&
          commission.availableAt !== null &&
          commission.availableAt <= now,
      );
      const eligible = due.filter(
        ({ beneficiary }) =>
          beneficiary.status === "ACTIVE" &&
          beneficiary.emailVerifiedAt !== null &&
          beneficiary.riskLevel <=
            Math.min(config.maxRiskLevel, currentConfig.maxRiskLevel),
      );
      const held = due.filter(
        (commission) => !eligible.some(({ id }) => id === commission.id),
      );
      if (held.length > 0)
        await tx.referralCommission.updateMany({
          where: { id: { in: held.map(({ id }) => id) } },
          data: { status: "HELD" },
        });
      if (eligible.length === 0) return { released: 0, replayed: false };
      const accounts = await userBucketAccounts(
        tx,
        eligible.map(({ beneficiaryId }) => beneficiaryId),
      );
      const transaction = await postLedgerTransactionInTransaction(tx, {
        idempotencyKey: `referral:release:${activityId}`,
        type: "REFERRAL_COMMISSIONS_RELEASE",
        sourceType: "referral_release",
        sourceId: activityId,
        configVersion: activity.ruleVersion,
        metadata: { activityId, releasedAt: now.toISOString() },
        postings: eligible.flatMap((commission) => [
          {
            account: accountRef(
              accounts.pendingByUser.get(commission.beneficiaryId)!,
            ),
            amount: -BigInt(commission.rewardMinor.toFixed(0)),
          },
          {
            account: accountRef(
              accounts.availableByUser.get(commission.beneficiaryId)!,
            ),
            amount: BigInt(commission.rewardMinor.toFixed(0)),
          },
        ]),
      });
      await tx.referralCommission.updateMany({
        where: { id: { in: eligible.map(({ id }) => id) } },
        data: {
          status: "AVAILABLE",
          releaseTransactionId: transaction.id,
          availableAt: now,
        },
      });
      return { released: eligible.length, replayed: false };
    });
  }

  async reverseActivity(activityId: string, now = this.clock()) {
    return this.withRetry(async (tx) => {
      await lockActivity(tx, activityId);
      const activity = await tx.monetizableActivity.findUnique({
        where: { id: activityId },
        include: { commissions: true },
      });
      if (!activity)
        throw new ReferralError(
          "REFERRAL_ACTIVITY_CONFLICT",
          "Activity was not found",
          404,
        );
      if (activity.status === "REVERSED")
        return { pending: false, replayed: true };
      const paid = activity.commissions.filter(
        ({ rewardMinor }) => BigInt(rewardMinor.toFixed(0)) > 0n,
      );
      const accounts = await userBucketAccounts(
        tx,
        paid.map(({ beneficiaryId }) => beneficiaryId),
      );
      const debits = paid.map((commission) => ({
        commission,
        account:
          commission.releaseTransactionId !== null
            ? accounts.availableByUser.get(commission.beneficiaryId)!
            : accounts.pendingByUser.get(commission.beneficiaryId)!,
        amount: BigInt(commission.rewardMinor.toFixed(0)),
      }));
      if (!(await balancesCover(tx, debits))) {
        await tx.monetizableActivity.update({
          where: { id: activityId },
          data: { status: "REVERSAL_PENDING" },
        });
        if (paid.length > 0)
          await tx.referralCommission.updateMany({
            where: { id: { in: paid.map(({ id }) => id) } },
            data: { status: "CLAWBACK_PENDING" },
          });
        return { pending: true, replayed: false };
      }
      let transactionId: string | null = null;
      if (debits.length > 0) {
        const pool = await tx.ledgerAccount.findUniqueOrThrow({
          where: { code: "platform:zyxe:referral-reward-pool" },
        });
        const total = debits.reduce((sum, debit) => sum + debit.amount, 0n);
        const transaction = await postLedgerTransactionInTransaction(tx, {
          idempotencyKey: `referral:clawback:${activityId}`,
          type: "REFERRAL_COMMISSIONS_CLAWBACK",
          sourceType: "referral_clawback",
          sourceId: activityId,
          configVersion: activity.ruleVersion,
          metadata: { activityId, reversedAt: now.toISOString() },
          postings: [
            ...debits.map((debit) => ({
              account: accountRef(debit.account),
              amount: -debit.amount,
            })),
            { account: accountRef(pool), amount: total },
          ],
        });
        transactionId = transaction.id;
      }
      await tx.monetizableActivity.update({
        where: { id: activityId },
        data: { status: "REVERSED", reversedAt: now },
      });
      await tx.referralCommission.updateMany({
        where: { activityId },
        data: {
          status: "REVERSED",
          clawbackTransactionId: transactionId,
          reversedAt: now,
        },
      });
      return { pending: false, replayed: false };
    });
  }

  async releaseDue(now = this.clock(), limit = 100) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000)
      throw new ReferralError(
        "REFERRAL_ACTIVITY_CONFLICT",
        "Release batch limit is invalid",
        400,
      );
    const rows = await this.database.referralCommission.findMany({
      where: {
        status: "PENDING",
        availableAt: { lte: now },
        activity: { status: "QUALIFIED" },
      },
      select: { activityId: true },
      distinct: ["activityId"],
      orderBy: { availableAt: "asc" },
      take: limit,
    });
    let released = 0;
    for (const { activityId } of rows)
      released += (await this.releaseActivity(activityId, now)).released;
    return { activities: rows.length, released };
  }

  private async withRetry<T>(
    operation: (tx: Tx) => Promise<T>,
    retryUnique = false,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.database.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          (isSerialization(error) || (retryUnique && isCode(error, "P2002"))) &&
          attempt < 2
        )
          continue;
        if (isSerialization(error))
          throw new ReferralError(
            "REFERRAL_BUSY",
            "Referral state is busy; retry idempotently",
            503,
          );
        throw error;
      }
    }
    throw new ReferralError(
      "REFERRAL_BUSY",
      "Referral state is busy; retry idempotently",
      503,
    );
  }
}

async function activeReferralConfig(client: Tx | PrismaClient, now: Date) {
  const row = await client.economicConfigVersion.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }],
    },
    orderBy: { id: "desc" },
  });
  if (!row) throw configError();
  const parsed = referralParametersSchema.safeParse(row.parameters);
  if (!parsed.success) throw configError();
  return { id: row.id, ...parsed.data.referrals };
}

async function referralConfigById(client: Tx | PrismaClient, id: number) {
  const row = await client.economicConfigVersion.findUnique({ where: { id } });
  const parsed = referralParametersSchema.safeParse(row?.parameters);
  if (!row || !parsed.success) throw configError();
  return { id: row.id, ...parsed.data.referrals };
}

async function eligibleUser(
  client: Tx | PrismaClient,
  userId: string,
  lock: boolean,
  maxRisk = 100,
) {
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
    throw new ReferralError(
      "REFERRAL_ACCOUNT_NOT_ELIGIBLE",
      "An active, verified account is required",
      403,
    );
  if (user.riskLevel > maxRisk)
    throw new ReferralError(
      "REFERRAL_ACCOUNT_NOT_ELIGIBLE",
      "Risk policy blocks referral rewards",
      403,
    );
  return user;
}

function programState(config: ReferralConfig, riskLevel: number) {
  if (riskLevel > config.maxRiskLevel)
    return { state: "RISK_BLOCKED" as const, reasonCode: "RISK_BLOCKED" };
  if (!config.attributionEnabled)
    return { state: "DISABLED" as const, reasonCode: config.disabledReason };
  if (!config.commissionsEnabled || !config.legalApproved)
    return {
      state: "ATTRIBUTION_ONLY" as const,
      reasonCode: config.disabledReason,
    };
  return { state: "ACTIVE" as const, reasonCode: null };
}

function assertCommissionsEnabled(config: ReferralConfig) {
  if (
    !config.attributionEnabled ||
    !config.commissionsEnabled ||
    !config.legalApproved
  )
    throw new ReferralError(
      "REFERRAL_DISABLED",
      "Referral commissions are gated until legal and revenue approval",
      503,
      { reasonCode: config.disabledReason },
    );
}

async function findActivity(tx: Tx, input: QualifyReferralActivityInput) {
  const records = await tx.monetizableActivity.findMany({
    where: {
      OR: [
        { idempotencyKey: `referral:${input.idempotencyKey}` },
        { sourceType: input.sourceType, sourceId: input.sourceId },
      ],
    },
    take: 2,
  });
  if (records.length === 0) return null;
  const record = records[0]!;
  if (
    records.length !== 1 ||
    record.userId !== input.userId ||
    record.sourceType !== input.sourceType ||
    record.sourceId !== input.sourceId ||
    BigInt(record.baseMinor.toFixed(0)) !== input.baseMinor
  )
    throw new ReferralError(
      "REFERRAL_ACTIVITY_CONFLICT",
      "Activity identity conflicts with a previous qualification",
      409,
    );
  return record;
}

async function lockActivity(tx: Tx, activityId: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "MonetizableActivity"
    WHERE "id" = ${activityId}
    FOR UPDATE
  `);
}

async function monthlyCommitted(
  tx: Tx,
  beneficiaryId: string,
  capMonth: string,
) {
  const aggregate = await tx.referralCommission.aggregate({
    where: {
      beneficiaryId,
      capMonth,
      status: { in: ["PENDING", "AVAILABLE", "HELD", "CLAWBACK_PENDING"] },
    },
    _sum: { rewardMinor: true },
  });
  return BigInt(aggregate._sum.rewardMinor?.toFixed(0) ?? "0");
}

async function referralAccounts(tx: Tx, userIds: string[]) {
  const [pool, accounts] = await Promise.all([
    tx.ledgerAccount.findUnique({
      where: { code: "platform:zyxe:referral-reward-pool" },
    }),
    tx.ledgerAccount.findMany({
      where: {
        userId: { in: userIds },
        asset: "ZYXE",
        bucket: "PENDING",
        active: true,
      },
    }),
  ]);
  if (!pool?.active || accounts.length !== new Set(userIds).size)
    throw configError();
  return {
    pool,
    pendingByUser: new Map(
      accounts.map((account) => [account.userId!, account]),
    ),
  };
}

async function userBucketAccounts(tx: Tx, userIds: string[]) {
  const unique = [...new Set(userIds)];
  const accounts = await tx.ledgerAccount.findMany({
    where: {
      userId: { in: unique },
      asset: "ZYXE",
      bucket: { in: ["PENDING", "AVAILABLE"] },
      active: true,
    },
  });
  const pendingByUser = new Map(
    accounts
      .filter(({ bucket }) => bucket === "PENDING")
      .map((account) => [account.userId!, account]),
  );
  const availableByUser = new Map(
    accounts
      .filter(({ bucket }) => bucket === "AVAILABLE")
      .map((account) => [account.userId!, account]),
  );
  if (
    unique.some(
      (userId) => !pendingByUser.has(userId) || !availableByUser.has(userId),
    )
  )
    throw configError();
  return { pendingByUser, availableByUser };
}

async function balancesCover(
  tx: Tx,
  debits: Array<{
    account: { id: string };
    amount: bigint;
  }>,
) {
  const required = new Map<string, bigint>();
  for (const debit of debits)
    required.set(
      debit.account.id,
      (required.get(debit.account.id) ?? 0n) + debit.amount,
    );
  const balances = await tx.ledgerPosting.groupBy({
    by: ["accountId"],
    where: {
      accountId: { in: [...required.keys()] },
      transaction: { status: { in: ["POSTED", "REVERSED"] } },
    },
    _sum: { amount: true },
  });
  const byId = new Map(
    balances.map((row) => [
      row.accountId,
      BigInt(row._sum.amount?.toFixed(0) ?? "0"),
    ]),
  );
  return [...required].every(
    ([accountId, amount]) => (byId.get(accountId) ?? 0n) >= amount,
  );
}

function accountRef(account: {
  id: string;
  asset: string;
  kind: LedgerAccountKind;
}) {
  return { id: account.id, asset: account.asset, kind: account.kind };
}

function publicName(displayName: string | null) {
  const value = displayName?.trim();
  return value ? value.slice(0, 40) : "Miembro Fauzet";
}

function createReferralCode() {
  return `FZ-${randomUUID()
    .replaceAll("-", "")
    .toUpperCase()
    .replace(/[01]/g, "Z")
    .slice(0, 12)}`;
}

function utcMonth(date: Date) {
  return date.toISOString().slice(0, 7);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function configError() {
  return new ReferralError(
    "REFERRAL_CONFIG_INVALID",
    "Referral configuration or accounts are unavailable",
    503,
  );
}

function isSerialization(error: unknown) {
  return (
    isCode(error, "P2034") ||
    isCode(error, "40001") ||
    (error instanceof Error &&
      (error.message.includes("could not serialize access") ||
        error.message.includes("deadlock detected")))
  );
}

function isCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String(error.code) === code
  );
}
