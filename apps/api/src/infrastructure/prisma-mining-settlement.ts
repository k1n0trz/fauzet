import {
  getDatabase,
  Prisma,
  type LedgerAccountKind,
  type PrismaClient,
} from "@fauzet/database";
import { postLedgerTransactionInTransaction } from "./prisma-ledger-store.js";
import {
  commerceConfigById,
  ensureAndCheckpoint,
  ensureEpoch,
} from "./prisma-commerce-store.js";

type Tx = Prisma.TransactionClient;

export type MiningSettlementResult = {
  periodKey: string;
  status: "BLOCKED" | "SETTLED" | "REVERSED";
  reasonCode: string | null;
  configVersion: number;
  configuredMinorUnits: string;
  distributableMinorUnits: string;
  allocatedMinorUnits: string;
  residueMinorUnits: string;
  totalHashMillis: string;
  payoutCount: number;
  transactionId: string | null;
  settledAt: string | null;
  replayed: boolean;
};

export class MiningSettlementError extends Error {
  constructor(
    public readonly code:
      | "MINING_PERIOD_NOT_CLOSED"
      | "MINING_SETTLEMENT_BUSY"
      | "MINING_SETTLEMENT_CONFIG_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "MiningSettlementError";
  }
}

/**
 * Closes one past UTC mining period. All checkpoints, payouts, ledger postings,
 * and the epoch projection are committed in the same serializable transaction.
 */
export class PrismaMiningSettlement {
  constructor(
    private readonly database: PrismaClient = getDatabase(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async settle(periodDate: Date): Promise<MiningSettlementResult> {
    const periodStart = utcDay(periodDate);
    const periodEnd = nextUtcDay(periodStart);
    const now = this.clock();
    if (periodEnd > utcDay(now)) {
      throw new MiningSettlementError(
        "MINING_PERIOD_NOT_CLOSED",
        "Only a fully closed UTC mining period can be settled",
      );
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.database.$transaction(
          async (tx) =>
            this.settleInTransaction(tx, periodStart, periodEnd, now),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isRetryable(error) && attempt < 2) continue;
        if (isRetryable(error)) {
          throw new MiningSettlementError(
            "MINING_SETTLEMENT_BUSY",
            "Mining settlement is busy; retry the same UTC period",
          );
        }
        throw error;
      }
    }

    throw new MiningSettlementError(
      "MINING_SETTLEMENT_BUSY",
      "Mining settlement is busy; retry the same UTC period",
    );
  }

  private async settleInTransaction(
    tx: Tx,
    periodStart: Date,
    periodEnd: Date,
    now: Date,
  ): Promise<MiningSettlementResult> {
    const periodKey = isoDate(periodStart);
    const settlementKey = `mining:settlement:${periodKey}`;
    await tx.$queryRaw(Prisma.sql`
      SELECT 1 AS "acquired"
      FROM pg_advisory_xact_lock(hashtext(${settlementKey}))
    `);

    let epoch = await tx.miningEpoch.findUnique({
      where: { periodDate: periodStart },
    });
    if (epoch?.status === "SETTLED" || epoch?.status === "REVERSED") {
      return settlementView(tx, epoch, true);
    }
    if (epoch?.settlementKey && epoch.settlementKey !== settlementKey) {
      throw new MiningSettlementError(
        "MINING_SETTLEMENT_CONFIG_INVALID",
        "The mining epoch is linked to a different settlement identity",
      );
    }

    const closingConfig = await commerceConfigAt(
      tx,
      new Date(periodEnd.getTime() - 1),
    );

    const profiles = await tx.miningProfile.findMany({
      where: { lastCheckpointAt: { lt: periodEnd } },
      include: {
        user: {
          select: { status: true, emailVerifiedAt: true, riskLevel: true },
        },
      },
      orderBy: { userId: "asc" },
    });
    for (const profile of profiles) {
      if (profile.user.status === "ACTIVE" && profile.user.emailVerifiedAt) {
        await ensureAndCheckpoint(
          tx,
          profile.userId,
          closingConfig,
          periodEnd,
          profile.user.riskLevel,
        );
      } else {
        // Conservative boundary: an ineligible account never accrues an
        // unobserved historical interval and cannot gain it on reactivation.
        await tx.miningProfile.update({
          where: { userId: profile.userId },
          data: {
            lastCheckpointAt: periodEnd,
            boostExpiresAt:
              profile.boostExpiresAt && profile.boostExpiresAt <= periodEnd
                ? null
                : profile.boostExpiresAt,
            ruleVersion: closingConfig.id,
          },
        });
      }
    }

    epoch = await tx.miningEpoch.findUnique({
      where: { periodDate: periodStart },
    });
    if (!epoch) {
      epoch = await ensureEpoch(tx, periodStart, closingConfig);
    }
    const contributions = await tx.miningContribution.findMany({
      where: { periodDate: periodStart, hashMillis: { gt: 0 } },
      select: {
        userId: true,
        hashMillis: true,
        user: {
          select: { status: true, emailVerifiedAt: true, riskLevel: true },
        },
      },
      orderBy: { userId: "asc" },
    });
    const totalHash = contributions.reduce(
      (total, contribution) =>
        total + BigInt(contribution.hashMillis.toFixed(0)),
      0n,
    );
    const distributable = BigInt(epoch.distributableMinor.toFixed(0));

    if (totalHash === 0n) {
      const settled = await tx.miningEpoch.update({
        where: { periodDate: periodStart },
        data: {
          status: "SETTLED",
          reasonCode: "NO_ACTIVITY",
          settlementKey,
          allocatedMinor: "0",
          residueMinor: distributable.toString(),
          totalHashMillis: "0",
          transactionId: null,
          settledAt: now,
        },
      });
      return settlementView(tx, settled, false);
    }

    const payouts = contributions
      .map((contribution) => {
        const hashMillis = BigInt(contribution.hashMillis.toFixed(0));
        return {
          userId: contribution.userId,
          hashMillis,
          rewardMinor: (distributable * hashMillis) / totalHash,
          eligible:
            contribution.user.status === "ACTIVE" &&
            contribution.user.emailVerifiedAt !== null &&
            contribution.user.riskLevel <= closingConfig.mining.maxRiskLevel,
        };
      })
      .filter(({ eligible, rewardMinor }) => eligible && rewardMinor > 0n);
    const allocated = payouts.reduce(
      (total, payout) => total + payout.rewardMinor,
      0n,
    );
    const residue = distributable - allocated;

    if (allocated === 0n) {
      const settled = await tx.miningEpoch.update({
        where: { periodDate: periodStart },
        data: {
          status: "SETTLED",
          reasonCode: contributions.some(
            ({ user }) =>
              user.status === "ACTIVE" &&
              user.emailVerifiedAt !== null &&
              user.riskLevel <= closingConfig.mining.maxRiskLevel,
          )
            ? "ROUNDING_TO_ZERO"
            : "NO_ELIGIBLE_PAYOUTS",
          settlementKey,
          allocatedMinor: "0",
          residueMinor: distributable.toString(),
          totalHashMillis: totalHash.toString(),
          transactionId: null,
          settledAt: now,
        },
      });
      return settlementView(tx, settled, false);
    }

    const pool = await tx.ledgerAccount.findUnique({
      where: { code: "platform:zyxe:mining-reward-pool" },
    });
    if (!pool?.active) {
      return blockEpoch(tx, epoch, {
        reasonCode: "MINING_POOL_UNAVAILABLE",
        settlementKey,
        totalHash,
      });
    }
    const poolBalance = await accountBalance(tx, pool.id);
    // The advertised daily pool must be fully backed, even though integer
    // rounding leaves the residue in the pool account.
    if (poolBalance < distributable) {
      return blockEpoch(tx, epoch, {
        reasonCode: "MINING_POOL_INSUFFICIENT",
        settlementKey,
        totalHash,
      });
    }

    const availableAccounts = await tx.ledgerAccount.findMany({
      where: {
        userId: { in: payouts.map(({ userId }) => userId) },
        asset: "ZYXE",
        bucket: "AVAILABLE",
        active: true,
      },
    });
    const availableByUser = new Map(
      availableAccounts.map((account) => [account.userId!, account]),
    );
    if (payouts.some(({ userId }) => !availableByUser.has(userId))) {
      return blockEpoch(tx, epoch, {
        reasonCode: "PAYOUT_ACCOUNT_MISSING",
        settlementKey,
        totalHash,
      });
    }

    const transaction = await postLedgerTransactionInTransaction(tx, {
      idempotencyKey: settlementKey,
      type: "MINING_EPOCH_SETTLEMENT",
      sourceType: "mining_epoch",
      sourceId: periodKey,
      configVersion: epoch.ruleVersion,
      metadata: {
        periodKey,
        configuredMinor: epoch.configuredMinor.toFixed(0),
        distributableMinor: distributable.toString(),
        allocatedMinor: allocated.toString(),
        residueMinor: residue.toString(),
        totalHashMillis: totalHash.toString(),
        payoutCount: payouts.length,
        excludedContributorCount: contributions.length - payouts.length,
        rounding: "floor",
      },
      postings: [
        { account: accountRef(pool), amount: -allocated },
        ...payouts.map((payout) => ({
          account: accountRef(availableByUser.get(payout.userId)!),
          amount: payout.rewardMinor,
        })),
      ],
    });
    await tx.miningPayout.createMany({
      data: payouts.map((payout) => ({
        periodDate: periodStart,
        userId: payout.userId,
        status: "POSTED" as const,
        hashMillis: payout.hashMillis.toString(),
        rewardMinor: payout.rewardMinor.toString(),
        transactionId: transaction.id,
      })),
    });
    const settled = await tx.miningEpoch.update({
      where: { periodDate: periodStart },
      data: {
        status: "SETTLED",
        reasonCode: null,
        settlementKey,
        allocatedMinor: allocated.toString(),
        residueMinor: residue.toString(),
        totalHashMillis: totalHash.toString(),
        transactionId: transaction.id,
        settledAt: now,
      },
    });
    return settlementView(tx, settled, false);
  }
}

async function commerceConfigAt(tx: Tx, at: Date) {
  const row = await tx.economicConfigVersion.findFirst({
    where: {
      status: { in: ["ACTIVE", "SUPERSEDED"] },
      OR: [{ effectiveAt: null }, { effectiveAt: { lte: at } }],
    },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  if (!row) {
    throw new MiningSettlementError(
      "MINING_SETTLEMENT_CONFIG_INVALID",
      "No economic configuration applies to this UTC period",
    );
  }
  return commerceConfigById(tx, row.id);
}

async function blockEpoch(
  tx: Tx,
  epoch: Prisma.MiningEpochGetPayload<Record<string, never>>,
  input: {
    reasonCode: string;
    settlementKey: string;
    totalHash: bigint;
  },
) {
  const distributable = epoch.distributableMinor.toFixed(0);
  const blocked = await tx.miningEpoch.update({
    where: { periodDate: epoch.periodDate },
    data: {
      status: "BLOCKED",
      reasonCode: input.reasonCode,
      settlementKey: input.settlementKey,
      allocatedMinor: "0",
      residueMinor: distributable,
      totalHashMillis: input.totalHash.toString(),
      transactionId: null,
      settledAt: null,
    },
  });
  return settlementView(tx, blocked, false);
}

async function settlementView(
  client: Tx | PrismaClient,
  epoch: Prisma.MiningEpochGetPayload<Record<string, never>>,
  replayed: boolean,
): Promise<MiningSettlementResult> {
  const payoutCount = await client.miningPayout.count({
    where: { periodDate: epoch.periodDate },
  });
  return {
    periodKey: isoDate(epoch.periodDate),
    status: epoch.status as MiningSettlementResult["status"],
    reasonCode: epoch.reasonCode,
    configVersion: epoch.ruleVersion,
    configuredMinorUnits: epoch.configuredMinor.toFixed(0),
    distributableMinorUnits: epoch.distributableMinor.toFixed(0),
    allocatedMinorUnits: epoch.allocatedMinor.toFixed(0),
    residueMinorUnits: epoch.residueMinor.toFixed(0),
    totalHashMillis: epoch.totalHashMillis.toFixed(0),
    payoutCount,
    transactionId: epoch.transactionId,
    settledAt: epoch.settledAt?.toISOString() ?? null,
    replayed,
  };
}

async function accountBalance(tx: Tx, accountId: string) {
  const result = await tx.ledgerPosting.aggregate({
    where: {
      accountId,
      transaction: { status: { in: ["POSTED", "REVERSED"] } },
    },
    _sum: { amount: true },
  });
  return BigInt(result._sum.amount?.toFixed(0) ?? "0");
}

function accountRef(account: {
  id: string;
  asset: string;
  kind: LedgerAccountKind;
}) {
  return { id: account.id, asset: account.asset, kind: account.kind };
}

function isRetryable(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return (
    code === "P2034" ||
    code === "P2002" ||
    code === "40001" ||
    message.includes("could not serialize access") ||
    message.includes("deadlock detected")
  );
}

function utcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function nextUtcDay(value: Date) {
  return new Date(value.getTime() + 86_400_000);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
