import type {
  AdminAuditResponse,
  AdminLedgerResponse,
  AdminOverviewResponse,
  AdminRiskResponse,
  AdminUsersResponse,
  AdminWithdrawalDecisionResponse,
  AdminWithdrawalsResponse,
} from "@fauzet/contracts";
import {
  getDatabase,
  Prisma,
  type LedgerAccountKind,
  type PrismaClient,
  type UserStatus,
} from "@fauzet/database";
import {
  AdminError,
  adminRoles,
  permissionsFor,
  type AdminStore,
} from "../domain/admin.js";
import { verifyPassword } from "../domain/auth.js";
import { postLedgerTransactionInTransaction } from "./prisma-ledger-store.js";

type Tx = Prisma.TransactionClient;
const BUCKETS = [
  "PENDING",
  "AVAILABLE",
  "PROMOTIONAL",
  "LOCKED",
  "ELIGIBLE",
  "RESERVED",
  "WITHDRAWN",
] as const;

export class PrismaAdminStore implements AdminStore {
  constructor(private readonly database: PrismaClient = getDatabase()) {}

  async createAdminSession(input: {
    userId: string;
    password: string;
    baseSessionHash: string;
    tokenHash: string;
    expiresAt: Date;
    requestId: string;
    ipHash?: string;
  }) {
    const user = await this.database.user.findUnique({
      where: { id: input.userId },
      include: { roles: true },
    });
    const valid = user
      ? await verifyPassword(input.password, user.passwordHash)
      : false;
    const roles = adminRoles(user?.roles.map(({ role }) => role) ?? []);
    if (
      !user ||
      !valid ||
      user.status !== "ACTIVE" ||
      !user.emailVerifiedAt ||
      roles.length === 0
    )
      throw new AdminError(
        "ADMIN_STEP_UP_INVALID",
        "Administrative re-authentication failed",
        401,
      );
    await this.database.$transaction(async (tx) => {
      const session = await tx.adminSession.create({
        data: {
          userId: user.id,
          tokenHash: input.tokenHash,
          baseSessionHash: input.baseSessionHash,
          expiresAt: input.expiresAt,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "ADMIN_STEP_UP_SUCCEEDED",
          targetType: "AdminSession",
          targetId: session.id,
          reason: "Password re-authentication",
          after: { assurance: "PASSWORD_REAUTH", expiresAt: input.expiresAt },
          requestId: input.requestId,
          ...(input.ipHash ? { ipHash: input.ipHash } : {}),
        },
      });
    });
    return { roles };
  }

  async findAdminSession(
    tokenHash: string,
    baseSessionHash: string,
    now: Date,
  ) {
    const session = await this.database.adminSession.findFirst({
      where: {
        tokenHash,
        baseSessionHash,
        revokedAt: null,
        expiresAt: { gt: now },
        user: { status: "ACTIVE", emailVerifiedAt: { not: null } },
      },
      include: { user: { include: { roles: true } } },
    });
    if (!session) return null;
    const roles = adminRoles(session.user.roles.map(({ role }) => role));
    if (roles.length === 0) return null;
    return {
      user: publicUser(session.user),
      roles,
      permissions: permissionsFor(roles),
      expiresAt: session.expiresAt,
    };
  }

  async revokeAdminSession(tokenHash: string, now: Date) {
    await this.database.adminSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async overview(): Promise<AdminOverviewResponse> {
    const now = new Date();
    const since = new Date(now.getTime() - 86_400_000);
    const [
      total,
      active,
      restricted,
      suspended,
      registered24h,
      elevated,
      high,
      signals24h,
      transactions24h,
      liabilities,
    ] = await Promise.all([
      this.database.user.count(),
      this.database.user.count({ where: { status: "ACTIVE" } }),
      this.database.user.count({ where: { status: "RESTRICTED" } }),
      this.database.user.count({ where: { status: "SUSPENDED" } }),
      this.database.user.count({ where: { createdAt: { gte: since } } }),
      this.database.user.count({ where: { riskLevel: { gte: 50 } } }),
      this.database.user.count({ where: { riskLevel: { gte: 80 } } }),
      this.database.riskSignal.count({ where: { createdAt: { gte: since } } }),
      this.database.ledgerTransaction.count({
        where: { createdAt: { gte: since } },
      }),
      this.database.$queryRaw<
        Array<{ bucket: string; balance: bigint }>
      >(Prisma.sql`
          SELECT a."bucket"::text AS "bucket",
                 COALESCE(SUM(p."amount"), 0)::bigint AS "balance"
          FROM "LedgerAccount" a
          LEFT JOIN "LedgerPosting" p ON p."accountId" = a."id"
          WHERE a."userId" IS NOT NULL AND a."asset" = 'ZYXE'
          GROUP BY a."bucket"
        `),
    ]);
    const userLiabilities = emptyBalances();
    for (const row of liabilities)
      if (isBucket(row.bucket))
        userLiabilities[row.bucket] = row.balance.toString();
    return {
      serverNow: now.toISOString(),
      users: { total, active, restricted, suspended, registered24h },
      risk: { elevated, high, signals24h },
      ledger: { transactions24h, userLiabilities },
      features: { realMoney: false, withdrawals: false, trading: false },
    };
  }

  async users(input: { page: number; pageSize: number; search?: string }) {
    const where = input.search
      ? {
          OR: [
            { email: { contains: input.search, mode: "insensitive" as const } },
            {
              displayName: {
                contains: input.search,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {};
    const [total, users] = await Promise.all([
      this.database.user.count({ where }),
      this.database.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          roles: true,
          accounts: { select: { id: true, bucket: true } },
        },
      }),
    ]);
    const accountIds = users.flatMap(({ accounts }) =>
      accounts.map(({ id }) => id),
    );
    const sums = accountIds.length
      ? await this.database.ledgerPosting.groupBy({
          by: ["accountId"],
          where: { accountId: { in: accountIds } },
          _sum: { amount: true },
        })
      : [];
    const byAccount = new Map(
      sums.map((row) => [row.accountId, row._sum.amount?.toFixed(0) ?? "0"]),
    );
    return {
      items: users.map((user) => {
        const balances = emptyBalances();
        for (const account of user.accounts)
          if (account.bucket && isBucket(account.bucket))
            balances[account.bucket] = byAccount.get(account.id) ?? "0";
        return adminUser(user, balances);
      }),
      total,
      page: input.page,
      pageSize: input.pageSize,
    } satisfies AdminUsersResponse;
  }

  async ledger(): Promise<AdminLedgerResponse> {
    const transactions = await this.database.ledgerTransaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { postings: { select: { amount: true } } },
    });
    return {
      items: transactions.map((transaction) => {
        let debits = 0n;
        let credits = 0n;
        let net = 0n;
        for (const posting of transaction.postings) {
          const amount = BigInt(posting.amount.toFixed(0));
          net += amount;
          if (amount < 0n) debits -= amount;
          else credits += amount;
        }
        return {
          id: transaction.id,
          type: transaction.type,
          status: transaction.status,
          sourceType: transaction.sourceType,
          sourceId: transaction.sourceId,
          configVersion: transaction.configVersion,
          createdAt: transaction.createdAt.toISOString(),
          postingCount: transaction.postings.length,
          balanced: net === 0n && transaction.postings.length >= 2,
          totalDebitsMinorUnits: debits.toString(),
          totalCreditsMinorUnits: credits.toString(),
        };
      }),
    };
  }

  async audit(): Promise<AdminAuditResponse> {
    const events = await this.database.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { actor: { select: { email: true } } },
    });
    return {
      items: events.map((event) => ({
        id: event.id,
        actor: event.actor?.email ?? null,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        reason: event.reason,
        before: event.before,
        after: event.after,
        requestId: event.requestId,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  async risk(): Promise<AdminRiskResponse> {
    const signals = await this.database.riskSignal.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { displayName: true } },
        actor: { select: { email: true } },
      },
    });
    return {
      items: signals.map((signal) => ({
        id: signal.id,
        userId: signal.userId,
        userDisplayName: signal.user.displayName,
        actor: signal.actor?.email ?? null,
        type: signal.type,
        severity: signal.severity,
        scoreDelta: signal.scoreDelta,
        previousScore: signal.previousScore,
        nextScore: signal.nextScore,
        reason: signal.reason,
        createdAt: signal.createdAt.toISOString(),
      })),
    };
  }

  async withdrawals(): Promise<AdminWithdrawalsResponse> {
    const withdrawals = await this.database.withdrawal.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { email: true, displayName: true } },
        wallet: true,
        conversion: { include: { quote: true } },
      },
    });
    return { items: withdrawals.map(adminWithdrawal) };
  }

  async decideWithdrawal(input: {
    actorId: string;
    withdrawalId: string;
    decision: "APPROVE" | "REJECT";
    reason: string;
    requestId: string;
    ipHash?: string;
  }): Promise<AdminWithdrawalDecisionResponse> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.database.$transaction(
          async (tx) => {
            const initial = await tx.withdrawal.findUnique({
              where: { id: input.withdrawalId },
              select: { conversionId: true, userId: true },
            });
            if (!initial) throw invalidWithdrawal();
            await tx.$queryRaw(Prisma.sql`
              SELECT "id" FROM "Conversion"
              WHERE "id" = ${initial.conversionId} FOR UPDATE
            `);
            await tx.$queryRaw(Prisma.sql`
              SELECT "id" FROM "Withdrawal"
              WHERE "id" = ${input.withdrawalId} FOR UPDATE
            `);
            const withdrawal = await tx.withdrawal.findUniqueOrThrow({
              where: { id: input.withdrawalId },
              include: {
                user: { select: { email: true, displayName: true } },
                wallet: true,
                conversion: { include: { quote: true } },
              },
            });
            const finalStatus =
              input.decision === "APPROVE" ? "CONFIRMED" : "REJECTED";
            const action =
              input.decision === "APPROVE"
                ? "ADMIN_SANDBOX_WITHDRAWAL_APPROVED"
                : "ADMIN_SANDBOX_WITHDRAWAL_REJECTED";
            if (withdrawal.status === finalStatus) {
              const audit = await tx.auditEvent.findFirst({
                where: {
                  action,
                  targetType: "Withdrawal",
                  targetId: withdrawal.id,
                },
                orderBy: { createdAt: "desc" },
              });
              if (!audit) throw invalidWithdrawal();
              return {
                withdrawal: adminWithdrawal(withdrawal),
                auditEventId: audit.id,
                replayed: true,
              };
            }
            if (
              withdrawal.status !== "REVIEW" ||
              withdrawal.conversion.status !== "RESERVED"
            )
              throw invalidWithdrawal();

            if (input.decision === "APPROVE") {
              const currentUser = await lockedUser(tx, initial.userId);
              if (
                currentUser.status !== "ACTIVE" ||
                !currentUser.emailVerifiedAt ||
                currentUser.riskLevel >= 70
              )
                throw invalidWithdrawal();
            }

            const now = new Date();
            const accounts = await tx.ledgerAccount.findMany({
              where: {
                userId: withdrawal.userId,
                asset: "ZYXE",
                bucket: { in: ["ELIGIBLE", "RESERVED", "WITHDRAWN"] },
              },
            });
            const byBucket = Object.fromEntries(
              accounts.map((account) => [account.bucket!, account]),
            ) as Record<
              "ELIGIBLE" | "RESERVED" | "WITHDRAWN",
              (typeof accounts)[number]
            >;
            if (!byBucket.ELIGIBLE || !byBucket.RESERVED || !byBucket.WITHDRAWN)
              throw invalidWithdrawal();
            const config = await tx.economicConfigVersion.findFirst({
              where: {
                status: "ACTIVE",
                OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }],
              },
              orderBy: { id: "desc" },
            });
            if (!config) throw invalidWithdrawal();
            const amount = BigInt(
              withdrawal.conversion.quote.eligibleMinor.toFixed(0),
            );
            let settlementTransactionId: string | null = null;
            let releaseTransactionId: string | null = null;
            let sandboxTxId: string | null = null;
            if (input.decision === "APPROVE") {
              const settlement = await postLedgerTransactionInTransaction(tx, {
                idempotencyKey: `sandbox:admin-withdrawal:${withdrawal.id}:approve`,
                type: "SANDBOX_WITHDRAWAL_SETTLEMENT",
                sourceType: "sandbox_withdrawal",
                sourceId: withdrawal.id,
                configVersion: config.id,
                metadata: {
                  mode: "SANDBOX",
                  noExternalValue: true,
                  actorId: input.actorId,
                  manualReview: true,
                },
                postings: [
                  { account: accountRef(byBucket.RESERVED), amount: -amount },
                  { account: accountRef(byBucket.WITHDRAWN), amount },
                ],
              });
              settlementTransactionId = settlement.id;
              sandboxTxId = `sandbox_${crypto.randomUUID().replaceAll("-", "")}`;
              await tx.conversion.update({
                where: { id: withdrawal.conversionId },
                data: { status: "COMPLETED" },
              });
            } else {
              const release = await postLedgerTransactionInTransaction(tx, {
                idempotencyKey: `sandbox:admin-withdrawal:${withdrawal.id}:reject`,
                type: "SANDBOX_CONVERSION_RELEASE",
                sourceType: "sandbox_conversion_release",
                sourceId: withdrawal.conversionId,
                configVersion: config.id,
                metadata: {
                  mode: "SANDBOX",
                  actorId: input.actorId,
                  manualReview: true,
                },
                postings: [
                  { account: accountRef(byBucket.RESERVED), amount: -amount },
                  { account: accountRef(byBucket.ELIGIBLE), amount },
                ],
              });
              releaseTransactionId = release.id;
              await tx.conversion.update({
                where: { id: withdrawal.conversionId },
                data: {
                  status: "REJECTED",
                  releaseTransactionId: release.id,
                },
              });
            }
            const previousReasons = Array.isArray(withdrawal.reasonCodes)
              ? withdrawal.reasonCodes.filter(
                  (value): value is string => typeof value === "string",
                )
              : [];
            const updated = await tx.withdrawal.update({
              where: { id: withdrawal.id },
              data: {
                status: finalStatus,
                reasonCodes: [
                  ...previousReasons,
                  input.decision === "APPROVE"
                    ? "ADMIN_REVIEW_APPROVED"
                    : "ADMIN_REVIEW_REJECTED",
                ],
                sandboxTxId,
                confirmations: input.decision === "APPROVE" ? 6 : 0,
                settlementTransactionId,
              },
              include: {
                user: { select: { email: true, displayName: true } },
                wallet: true,
                conversion: { include: { quote: true } },
              },
            });
            const audit = await tx.auditEvent.create({
              data: {
                actorId: input.actorId,
                action,
                targetType: "Withdrawal",
                targetId: withdrawal.id,
                reason: input.reason,
                before: {
                  status: "REVIEW",
                  conversionStatus: "RESERVED",
                  riskScore: withdrawal.riskScore,
                },
                after: {
                  status: finalStatus,
                  conversionStatus:
                    input.decision === "APPROVE" ? "COMPLETED" : "REJECTED",
                  settlementTransactionId,
                  releaseTransactionId,
                  sandboxTxId,
                  noExternalValue: true,
                },
                requestId: input.requestId,
                ...(input.ipHash ? { ipHash: input.ipHash } : {}),
              },
            });
            return {
              withdrawal: adminWithdrawal(updated),
              auditEventId: audit.id,
              replayed: false,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (retryableAdminConflict(error) && attempt < 3) continue;
        throw error;
      }
    }
    throw invalidWithdrawal();
  }

  async updateUserStatus(input: {
    actorId: string;
    targetId: string;
    status: "ACTIVE" | "RESTRICTED" | "SUSPENDED";
    reason: string;
    requestId: string;
    ipHash?: string;
  }) {
    return this.database.$transaction(
      async (tx) => {
        const target = await lockedUser(tx, input.targetId);
        await assertTargetMutable(tx, target.id);
        const updated = await tx.user.update({
          where: { id: target.id },
          data: {
            status: input.status,
            ...(input.status === "SUSPENDED"
              ? { credentialVersion: { increment: 1 } }
              : {}),
          },
          include: { roles: true },
        });
        if (input.status === "SUSPENDED") {
          const now = new Date();
          await Promise.all([
            tx.session.updateMany({
              where: { userId: target.id, revokedAt: null },
              data: { revokedAt: now },
            }),
            tx.adminSession.updateMany({
              where: { userId: target.id, revokedAt: null },
              data: { revokedAt: now },
            }),
          ]);
        }
        const audit = await tx.auditEvent.create({
          data: {
            actorId: input.actorId,
            action: "ADMIN_USER_STATUS_CHANGED",
            targetType: "User",
            targetId: target.id,
            reason: input.reason,
            before: { status: target.status },
            after: { status: updated.status },
            requestId: input.requestId,
            ...(input.ipHash ? { ipHash: input.ipHash } : {}),
          },
        });
        return {
          user: adminUserWithoutBalances(updated),
          auditEventId: audit.id,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateRisk(input: {
    actorId: string;
    targetId: string;
    riskLevel: number;
    reason: string;
    requestId: string;
    ipHash?: string;
  }) {
    return this.database.$transaction(
      async (tx) => {
        const target = await lockedUser(tx, input.targetId);
        await assertTargetMutable(tx, target.id);
        const updated = await tx.user.update({
          where: { id: target.id },
          data: { riskLevel: input.riskLevel },
          include: { roles: true },
        });
        const delta = input.riskLevel - target.riskLevel;
        await tx.riskSignal.create({
          data: {
            userId: target.id,
            actorId: input.actorId,
            type: "MANUAL_ADMIN_ASSESSMENT",
            severity: severity(input.riskLevel),
            scoreDelta: delta,
            previousScore: target.riskLevel,
            nextScore: input.riskLevel,
            reason: input.reason,
            evidence: { source: "admin", manual: true },
            requestId: input.requestId,
          },
        });
        const audit = await tx.auditEvent.create({
          data: {
            actorId: input.actorId,
            action: "ADMIN_USER_RISK_CHANGED",
            targetType: "User",
            targetId: target.id,
            reason: input.reason,
            before: { riskLevel: target.riskLevel },
            after: { riskLevel: input.riskLevel, scoreDelta: delta },
            requestId: input.requestId,
            ...(input.ipHash ? { ipHash: input.ipHash } : {}),
          },
        });
        return {
          user: adminUserWithoutBalances(updated),
          auditEventId: audit.id,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

async function lockedUser(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      email: string;
      displayName: string | null;
      countryCode: string | null;
      status: UserStatus;
      riskLevel: number;
      emailVerifiedAt: Date | null;
      createdAt: Date;
    }>
  >(Prisma.sql`
    SELECT "id", "email", "displayName", "countryCode", "status", "riskLevel",
           "emailVerifiedAt", "createdAt"
    FROM "User" WHERE "id" = ${id} FOR UPDATE
  `);
  const user = rows[0];
  if (!user)
    throw new AdminError(
      "ADMIN_TARGET_INVALID",
      "Target user was not found",
      404,
    );
  return user;
}

async function assertTargetMutable(tx: Tx, userId: string) {
  const protectedRole = await tx.userRole.findFirst({
    where: { userId, role: { in: ["OWNER", "SUPERADMIN"] } },
  });
  if (protectedRole)
    throw new AdminError(
      "ADMIN_TARGET_INVALID",
      "Owner and superadmin accounts require maker-checker approval",
      409,
    );
}

function emptyBalances() {
  return Object.fromEntries(BUCKETS.map((bucket) => [bucket, "0"])) as Record<
    (typeof BUCKETS)[number],
    string
  >;
}

function isBucket(value: string): value is (typeof BUCKETS)[number] {
  return BUCKETS.includes(value as (typeof BUCKETS)[number]);
}

function publicUser(user: {
  id: string;
  email: string;
  displayName: string | null;
  locale: string;
  countryCode: string | null;
  status: UserStatus;
  roles: Array<{ role: string }>;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    locale: user.locale === "en" ? ("en" as const) : ("es" as const),
    countryCode: user.countryCode,
    status: user.status,
    roles: user.roles.map(({ role }) => role),
  };
}

function adminUser(
  user: {
    id: string;
    email: string;
    displayName: string | null;
    countryCode: string | null;
    status: UserStatus;
    riskLevel: number;
    emailVerifiedAt: Date | null;
    createdAt: Date;
    roles: Array<{ role: string }>;
  },
  balances: ReturnType<typeof emptyBalances>,
) {
  return { ...adminUserWithoutBalances(user), balances };
}

function adminUserWithoutBalances(user: {
  id: string;
  email: string;
  displayName: string | null;
  countryCode: string | null;
  status: UserStatus;
  riskLevel: number;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  roles: Array<{ role: string }>;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    countryCode: user.countryCode,
    status: user.status,
    riskLevel: user.riskLevel,
    roles: user.roles.map(({ role }) => role),
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}

function severity(score: number) {
  if (score >= 90) return "CRITICAL" as const;
  if (score >= 70) return "HIGH" as const;
  if (score >= 40) return "MEDIUM" as const;
  return "LOW" as const;
}

function adminWithdrawal(withdrawal: {
  id: string;
  userId: string;
  conversionId: string;
  status: string;
  riskScore: number;
  reasonCodes: Prisma.JsonValue;
  sandboxTxId: string | null;
  confirmations: number;
  createdAt: Date;
  user: { email: string; displayName: string | null };
  wallet: { label: string; address: string };
  conversion: {
    quote: {
      asset: string;
      eligibleMinor: Prisma.Decimal;
      netAssetMinor: Prisma.Decimal;
    };
  };
}) {
  return {
    id: withdrawal.id,
    userId: withdrawal.userId,
    userEmail: withdrawal.user.email,
    userDisplayName: withdrawal.user.displayName,
    conversionId: withdrawal.conversionId,
    asset: withdrawal.conversion.quote.asset as "SANDBOX_LTC" | "SANDBOX_DOGE",
    eligibleMinorUnits: withdrawal.conversion.quote.eligibleMinor.toFixed(0),
    netAssetMinorUnits: withdrawal.conversion.quote.netAssetMinor.toFixed(0),
    walletLabel: withdrawal.wallet.label,
    walletAddressMasked: maskAddress(withdrawal.wallet.address),
    status: withdrawal.status as
      | "REVIEW"
      | "CONFIRMED"
      | "REJECTED"
      | "CANCELLED",
    riskScore: withdrawal.riskScore,
    reasonCodes: Array.isArray(withdrawal.reasonCodes)
      ? withdrawal.reasonCodes.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    sandboxTxId: withdrawal.sandboxTxId,
    confirmations: withdrawal.confirmations,
    createdAt: withdrawal.createdAt.toISOString(),
  };
}

function accountRef(account: {
  id: string;
  asset: string;
  kind: LedgerAccountKind;
}) {
  return { id: account.id, asset: account.asset, kind: account.kind };
}

function maskAddress(address: string) {
  return address.length <= 16
    ? address
    : `${address.slice(0, 10)}…${address.slice(-5)}`;
}

function retryableAdminConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (["P2034", "P2002"].includes(error.code)) return true;
  return error.code === "P2010" && error.meta?.code === "40001";
}

function invalidWithdrawal() {
  return new AdminError(
    "ADMIN_WITHDRAWAL_INVALID",
    "Sandbox withdrawal is not available for this decision",
    409,
  );
}
