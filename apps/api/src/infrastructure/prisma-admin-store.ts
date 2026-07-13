import type {
  AdminAuditResponse,
  AdminLedgerResponse,
  AdminOverviewResponse,
  AdminRiskResponse,
  AdminUsersResponse,
} from "@fauzet/contracts";
import {
  getDatabase,
  Prisma,
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
