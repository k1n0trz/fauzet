import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type {
  SandboxConversionResponse,
  SandboxStatusResponse,
  SandboxWithdrawalResponse,
} from "@fauzet/contracts";
import {
  getDatabase,
  Prisma,
  type LedgerAccountKind,
  type PrismaClient,
} from "@fauzet/database";
import {
  SandboxWithdrawalError,
  type SandboxWithdrawalStore,
} from "../domain/sandbox-withdrawals.js";
import { verifyPassword } from "../domain/auth.js";
import { LedgerInsufficientBalanceError } from "../domain/ledger-posting.js";
import { postLedgerTransactionInTransaction } from "./prisma-ledger-store.js";
import type { TransactionalMailer } from "../domain/account-security.js";

type Tx = Prisma.TransactionClient;
const ASSETS = {
  SANDBOX_LTC: { numerator: 1_000n, denominator: 1n, fee: 100n },
  SANDBOX_DOGE: { numerator: 10_000n, denominator: 1n, fee: 500n },
} as const;
const SPREAD_BPS = 100n;
const MAX_CHALLENGE_ATTEMPTS = 5;

export class PrismaSandboxWithdrawalStore implements SandboxWithdrawalStore {
  constructor(
    private readonly database: PrismaClient = getDatabase(),
    private readonly clock: () => Date = () => new Date(),
    private readonly mailer?: TransactionalMailer,
    private readonly secret = "development-only-secret-change-me-now",
  ) {}

  async status(userId: string) {
    await eligibleUser(this.database, userId);
    return statusResponse(this.database, userId, this.clock());
  }

  async createWallet(input: {
    userId: string;
    network: "SANDBOX_LTC" | "SANDBOX_DOGE";
    address: string;
    label: string;
  }) {
    await this.withRetry(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`,
      );
      await eligibleUser(tx, input.userId);
      const existing = await tx.externalWallet.findUnique({
        where: {
          userId_network_address: {
            userId: input.userId,
            network: input.network,
            address: input.address,
          },
        },
      });
      if (!existing) {
        const count = await tx.externalWallet.count({
          where: { userId: input.userId, status: { not: "REVOKED" } },
        });
        if (count >= 5)
          throw new SandboxWithdrawalError(
            "SANDBOX_CONVERSION_CONFLICT",
            "At most five sandbox destinations may be active",
            409,
          );
        await tx.externalWallet.create({
          data: {
            userId: input.userId,
            network: input.network,
            address: input.address,
            label: input.label,
            availableAt: new Date(this.clock().getTime() + 24 * 3_600_000),
          },
        });
      }
    }, Prisma.TransactionIsolationLevel.ReadCommitted);
    return statusResponse(this.database, input.userId, this.clock());
  }

  async quote(input: {
    userId: string;
    asset: "SANDBOX_LTC" | "SANDBOX_DOGE";
    eligibleMinor: bigint;
  }) {
    await eligibleUser(this.database, input.userId);
    const balances = await bucketBalances(this.database, input.userId);
    if (input.eligibleMinor < 500n || input.eligibleMinor > balances.ELIGIBLE)
      throw new SandboxWithdrawalError(
        "SANDBOX_INSUFFICIENT_ELIGIBLE",
        "Requested amount exceeds eligible ZYXE",
        409,
      );
    const rate = ASSETS[input.asset];
    const raw = (input.eligibleMinor * rate.numerator) / rate.denominator;
    const gross = (raw * (10_000n - SPREAD_BPS)) / 10_000n;
    const net = gross - rate.fee;
    if (net <= 0n)
      throw new SandboxWithdrawalError(
        "SANDBOX_QUOTE_INVALID",
        "Amount is too small after sandbox fees",
        409,
      );
    const quote = await this.database.conversionQuote.create({
      data: {
        userId: input.userId,
        asset: input.asset,
        eligibleMinor: input.eligibleMinor.toString(),
        rateNumerator: rate.numerator.toString(),
        rateDenominator: rate.denominator.toString(),
        spreadBps: Number(SPREAD_BPS),
        grossAssetMinor: gross.toString(),
        networkFeeAssetMinor: rate.fee.toString(),
        netAssetMinor: net.toString(),
        expiresAt: new Date(this.clock().getTime() + 120_000),
      },
    });
    return { quote: mapQuote(quote, this.clock()) };
  }

  async convert(input: {
    userId: string;
    quoteId: string;
    idempotencyKey: string;
  }): Promise<SandboxConversionResponse> {
    return this.withRetry(async (tx) => {
      const existing = await tx.conversion.findUnique({
        where: { idempotencyKey: `sandbox:conversion:${input.idempotencyKey}` },
        include: { quote: true },
      });
      if (existing) {
        if (
          existing.userId !== input.userId ||
          existing.quoteId !== input.quoteId
        )
          throw conflict();
        return {
          conversion: mapConversion(existing, this.clock()),
          replayed: true,
        };
      }
      await eligibleUser(tx, input.userId);
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "ConversionQuote" WHERE "id" = ${input.quoteId} FOR UPDATE
      `);
      const quote = await tx.conversionQuote.findUnique({
        where: { id: input.quoteId },
      });
      const now = this.clock();
      if (
        !quote ||
        quote.userId !== input.userId ||
        quote.status !== "OPEN" ||
        quote.expiresAt <= now
      )
        throw new SandboxWithdrawalError(
          "SANDBOX_QUOTE_INVALID",
          "Quote is invalid, expired or already consumed",
          409,
        );
      const conversionId = randomUUID();
      const accounts = await userAccounts(tx, input.userId);
      const configVersion = await activeConfigId(tx, now);
      let reserve;
      try {
        reserve = await postLedgerTransactionInTransaction(tx, {
          idempotencyKey: `sandbox:conversion:${input.idempotencyKey}`,
          type: "SANDBOX_CONVERSION_RESERVE",
          sourceType: "sandbox_conversion",
          sourceId: conversionId,
          configVersion,
          metadata: { quoteId: quote.id, mode: "SANDBOX", asset: quote.asset },
          postings: [
            {
              account: accountRef(accounts.ELIGIBLE),
              amount: -minor(quote.eligibleMinor),
            },
            {
              account: accountRef(accounts.RESERVED),
              amount: minor(quote.eligibleMinor),
            },
          ],
        });
      } catch (error) {
        if (error instanceof LedgerInsufficientBalanceError)
          throw new SandboxWithdrawalError(
            "SANDBOX_INSUFFICIENT_ELIGIBLE",
            "Eligible ZYXE changed before reservation",
            409,
          );
        throw error;
      }
      await tx.conversionQuote.update({
        where: { id: quote.id },
        data: { status: "CONSUMED" },
      });
      const conversion = await tx.conversion.create({
        data: {
          id: conversionId,
          userId: input.userId,
          quoteId: quote.id,
          idempotencyKey: `sandbox:conversion:${input.idempotencyKey}`,
          reserveTransactionId: reserve.id,
        },
        include: { quote: true },
      });
      return { conversion: mapConversion(conversion, now), replayed: false };
    });
  }

  async withdraw(input: {
    userId: string;
    conversionId: string;
    walletId: string;
    password: string;
    challengeId: string;
    code: string;
    idempotencyKey: string;
  }): Promise<SandboxWithdrawalResponse> {
    const owner = await this.database.user.findUnique({
      where: { id: input.userId },
    });
    if (!owner || !(await verifyPassword(input.password, owner.passwordHash)))
      throw new SandboxWithdrawalError(
        "SANDBOX_STEP_UP_INVALID",
        "Password re-authentication failed",
        401,
      );
    const result = await this.withRetry(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE
      `);
      const currentUser = await eligibleUser(tx, input.userId);
      if (currentUser.passwordHash !== owner.passwordHash)
        throw new SandboxWithdrawalError(
          "SANDBOX_STEP_UP_INVALID",
          "Password re-authentication is stale",
          401,
        );
      const key = `sandbox:withdrawal:${input.idempotencyKey}`;
      const existing = await tx.withdrawal.findUnique({
        where: { idempotencyKey: key },
        include: { conversion: { include: { quote: true } } },
      });
      if (existing) {
        if (
          existing.userId !== input.userId ||
          existing.conversionId !== input.conversionId ||
          existing.walletId !== input.walletId
        )
          throw conflict();
        return {
          withdrawal: mapWithdrawal(existing),
          conversion: mapConversion(existing.conversion, this.clock()),
          replayed: true,
        };
      }
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "Conversion" WHERE "id" = ${input.conversionId} FOR UPDATE
      `);
      const conversion = await tx.conversion.findUnique({
        where: { id: input.conversionId },
        include: { quote: true, withdrawal: true },
      });
      const wallet = await tx.externalWallet.findUnique({
        where: { id: input.walletId },
      });
      const now = this.clock();
      if (
        !conversion ||
        conversion.userId !== input.userId ||
        conversion.status !== "RESERVED" ||
        conversion.withdrawal
      )
        throw conflict();
      if (
        !wallet ||
        wallet.userId !== input.userId ||
        wallet.network !== conversion.quote.asset ||
        wallet.status === "REVOKED" ||
        wallet.availableAt > now
      )
        throw new SandboxWithdrawalError(
          "SANDBOX_WALLET_COOLDOWN",
          "Sandbox destination is missing or still in its 24-hour cooldown",
          409,
        );
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "WithdrawalChallenge"
        WHERE "id" = ${input.challengeId} FOR UPDATE
      `);
      const challenge = await tx.withdrawalChallenge.findUnique({
        where: { id: input.challengeId },
      });
      if (
        !challenge ||
        challenge.userId !== input.userId ||
        challenge.conversionId !== conversion.id ||
        challenge.walletId !== wallet.id ||
        challenge.consumedAt ||
        challenge.expiresAt <= now ||
        challenge.failedAttempts >= MAX_CHALLENGE_ATTEMPTS
      )
        throw new SandboxWithdrawalError(
          "SANDBOX_CHALLENGE_INVALID",
          "The email security code is invalid, expired or already used",
          401,
        );
      if (
        !safeEqual(challenge.codeHash, this.hashCode(challenge.id, input.code))
      ) {
        const failedAttempts = challenge.failedAttempts + 1;
        await tx.withdrawalChallenge.update({
          where: { id: challenge.id },
          data: {
            failedAttempts,
            ...(failedAttempts >= MAX_CHALLENGE_ATTEMPTS
              ? { consumedAt: now }
              : {}),
          },
        });
        return { challengeInvalid: true as const };
      }
      const riskScore = currentUser.riskLevel;
      const accounts = await userAccounts(tx, input.userId);
      const configVersion = await activeConfigId(tx, now);
      const reasonCodes =
        riskScore >= 70
          ? ["RISK_SCORE_REJECT"]
          : riskScore >= 40
            ? ["RISK_SCORE_REVIEW"]
            : ["SANDBOX_AUTO_APPROVE"];
      let status: "REVIEW" | "CONFIRMED" | "REJECTED" = "REVIEW";
      let settlementTransactionId: string | null = null;
      let sandboxTxId: string | null = null;
      let confirmations = 0;
      if (riskScore < 40) {
        const settlement = await postLedgerTransactionInTransaction(tx, {
          idempotencyKey: key,
          type: "SANDBOX_WITHDRAWAL_SETTLEMENT",
          sourceType: "sandbox_withdrawal",
          sourceId: input.conversionId,
          configVersion,
          metadata: {
            mode: "SANDBOX",
            noExternalValue: true,
            walletId: wallet.id,
          },
          postings: [
            {
              account: accountRef(accounts.RESERVED),
              amount: -minor(conversion.quote.eligibleMinor),
            },
            {
              account: accountRef(accounts.WITHDRAWN),
              amount: minor(conversion.quote.eligibleMinor),
            },
          ],
        });
        status = "CONFIRMED";
        settlementTransactionId = settlement.id;
        sandboxTxId = `sandbox_${randomUUID().replaceAll("-", "")}`;
        confirmations = 6;
        await tx.conversion.update({
          where: { id: conversion.id },
          data: { status: "COMPLETED" },
        });
      } else if (riskScore >= 70) {
        const release = await releaseReservation(
          tx,
          conversion,
          accounts,
          configVersion,
          `reject:${input.idempotencyKey}`,
        );
        status = "REJECTED";
        await tx.conversion.update({
          where: { id: conversion.id },
          data: { status: "REJECTED", releaseTransactionId: release.id },
        });
      }
      const withdrawal = await tx.withdrawal.create({
        data: {
          userId: input.userId,
          conversionId: conversion.id,
          walletId: wallet.id,
          idempotencyKey: key,
          status,
          riskScore,
          reasonCodes,
          assurance: "PASSWORD_EMAIL_OTP_SANDBOX",
          sandboxTxId,
          confirmations,
          settlementTransactionId,
        },
      });
      await tx.withdrawalChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });
      const current = await tx.conversion.findUniqueOrThrow({
        where: { id: conversion.id },
        include: { quote: true },
      });
      return {
        withdrawal: mapWithdrawal(withdrawal),
        conversion: mapConversion(current, now),
        replayed: false,
      };
    });
    if ("challengeInvalid" in result)
      throw new SandboxWithdrawalError(
        "SANDBOX_CHALLENGE_INVALID",
        "The email security code is invalid, expired or already used",
        401,
      );
    return result;
  }

  async challenge(input: {
    userId: string;
    conversionId: string;
    walletId: string;
  }) {
    if (!this.mailer)
      throw new SandboxWithdrawalError(
        "SANDBOX_BUSY",
        "Security code delivery is unavailable",
        503,
      );
    const user = await eligibleUser(this.database, input.userId);
    const now = this.clock();
    const challengeId = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(now.getTime() + 10 * 60_000);
    await this.withRetry(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "Conversion" WHERE "id" = ${input.conversionId} FOR UPDATE
      `);
      const [conversion, wallet] = await Promise.all([
        tx.conversion.findUnique({
          where: { id: input.conversionId },
          include: { quote: true, withdrawal: true },
        }),
        tx.externalWallet.findUnique({
          where: { id: input.walletId },
        }),
      ]);
      if (
        !conversion ||
        conversion.userId !== input.userId ||
        conversion.status !== "RESERVED" ||
        conversion.withdrawal ||
        !wallet ||
        wallet.userId !== input.userId ||
        wallet.network !== conversion.quote.asset ||
        wallet.status === "REVOKED" ||
        wallet.availableAt > now
      )
        throw new SandboxWithdrawalError(
          "SANDBOX_WALLET_COOLDOWN",
          "Sandbox destination or conversion is unavailable for verification",
          409,
        );
      await tx.withdrawalChallenge.updateMany({
        where: {
          userId: input.userId,
          conversionId: input.conversionId,
          walletId: input.walletId,
          consumedAt: null,
        },
        data: { consumedAt: now },
      });
      await tx.withdrawalChallenge.create({
        data: {
          id: challengeId,
          ...input,
          codeHash: this.hashCode(challengeId, code),
          expiresAt,
        },
      });
    }, Prisma.TransactionIsolationLevel.ReadCommitted);
    try {
      await this.mailer.sendWithdrawalCode(user, code);
    } catch {
      await this.database.withdrawalChallenge.updateMany({
        where: { id: challengeId, consumedAt: null },
        data: { consumedAt: this.clock() },
      });
      throw new SandboxWithdrawalError(
        "SANDBOX_BUSY",
        "Security code delivery is unavailable",
        503,
      );
    }
    return {
      challengeId,
      expiresAt: expiresAt.toISOString(),
      delivery: "EMAIL_MASKED" as const,
      recipientMasked: maskEmail(user.email),
    };
  }

  async cancel(input: {
    userId: string;
    conversionId: string;
    idempotencyKey: string;
  }) {
    return this.withRetry(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Conversion" WHERE "id" = ${input.conversionId} FOR UPDATE`,
      );
      const conversion = await tx.conversion.findUnique({
        where: { id: input.conversionId },
        include: { quote: true, withdrawal: true },
      });
      if (!conversion || conversion.userId !== input.userId) throw conflict();
      if (conversion.status === "CANCELLED")
        return {
          conversion: mapConversion(conversion, this.clock()),
          replayed: true,
        };
      if (conversion.status !== "RESERVED") throw conflict();
      const accounts = await userAccounts(tx, input.userId);
      const configVersion = await activeConfigId(tx, this.clock());
      const release = await releaseReservation(
        tx,
        conversion,
        accounts,
        configVersion,
        `cancel:${input.idempotencyKey}`,
      );
      const updated = await tx.conversion.update({
        where: { id: conversion.id },
        data: { status: "CANCELLED", releaseTransactionId: release.id },
        include: { quote: true },
      });
      if (conversion.withdrawal?.status === "REVIEW")
        await tx.withdrawal.update({
          where: { id: conversion.withdrawal.id },
          data: { status: "CANCELLED" },
        });
      return {
        conversion: mapConversion(updated, this.clock()),
        replayed: false,
      };
    });
  }

  private async withRetry<T>(
    work: (tx: Tx) => Promise<T>,
    isolationLevel: Prisma.TransactionIsolationLevel = Prisma
      .TransactionIsolationLevel.Serializable,
  ) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.database.$transaction(work, {
          isolationLevel,
        });
      } catch (error) {
        if (isRetryableConflict(error) && attempt < 3) continue;
        throw error;
      }
    }
    throw new SandboxWithdrawalError(
      "SANDBOX_BUSY",
      "Sandbox state is busy; retry idempotently",
      503,
    );
  }

  private hashCode(challengeId: string, code: string) {
    return createHmac("sha256", this.secret)
      .update(`withdrawal:${challengeId}:${code}`)
      .digest("hex");
  }
}

function isRetryableConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (["P2034", "P2002"].includes(error.code)) return true;
  return (
    error.code === "P2010" &&
    typeof error.meta?.code === "string" &&
    error.meta.code === "40001"
  );
}

async function statusResponse(
  client: PrismaClient | Tx,
  userId: string,
  now: Date,
): Promise<SandboxStatusResponse> {
  const [balances, wallets, conversions, withdrawals] = await Promise.all([
    bucketBalances(client, userId),
    client.externalWallet.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    client.conversion.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { quote: true },
    }),
    client.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return {
    serverNow: now.toISOString(),
    mode: "SANDBOX",
    enabled: true,
    realWithdrawalsEnabled: false,
    disclaimer: "Simulación sin dinero, cripto ni broadcast externo.",
    eligibleMinorUnits: balances.ELIGIBLE.toString(),
    reservedMinorUnits: balances.RESERVED.toString(),
    withdrawnMinorUnits: balances.WITHDRAWN.toString(),
    walletCooldownHours: 24,
    quoteTtlSeconds: 120,
    wallets: wallets.map((wallet) => ({
      id: wallet.id,
      network: wallet.network as "SANDBOX_LTC" | "SANDBOX_DOGE",
      addressMasked: mask(wallet.address),
      label: wallet.label,
      status:
        wallet.status === "PENDING_COOLDOWN" && wallet.availableAt <= now
          ? "ACTIVE"
          : wallet.status,
      availableAt: wallet.availableAt.toISOString(),
      createdAt: wallet.createdAt.toISOString(),
    })),
    conversions: conversions.map((conversion) =>
      mapConversion(conversion, now),
    ),
    withdrawals: withdrawals.map(mapWithdrawal),
  };
}

async function eligibleUser(client: PrismaClient | Tx, userId: string) {
  const user = await client.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE" || !user.emailVerifiedAt)
    throw new SandboxWithdrawalError(
      "SANDBOX_ACCOUNT_INELIGIBLE",
      "An active verified account is required",
      403,
    );
  return user;
}

async function bucketBalances(client: PrismaClient | Tx, userId: string) {
  const accounts = await client.ledgerAccount.findMany({
    where: {
      userId,
      asset: "ZYXE",
      bucket: { in: ["ELIGIBLE", "RESERVED", "WITHDRAWN"] },
    },
  });
  const sums = await client.ledgerPosting.groupBy({
    by: ["accountId"],
    where: { accountId: { in: accounts.map(({ id }) => id) } },
    _sum: { amount: true },
  });
  const byId = new Map(
    sums.map((row) => [row.accountId, minor(row._sum.amount)]),
  );
  const result = { ELIGIBLE: 0n, RESERVED: 0n, WITHDRAWN: 0n };
  for (const account of accounts)
    if (account.bucket && account.bucket in result)
      result[account.bucket as keyof typeof result] =
        byId.get(account.id) ?? 0n;
  return result;
}

async function userAccounts(tx: Tx, userId: string) {
  const accounts = await tx.ledgerAccount.findMany({
    where: {
      userId,
      asset: "ZYXE",
      bucket: { in: ["ELIGIBLE", "RESERVED", "WITHDRAWN"] },
    },
  });
  return Object.fromEntries(
    accounts.map((account) => [account.bucket!, account]),
  ) as Record<"ELIGIBLE" | "RESERVED" | "WITHDRAWN", (typeof accounts)[number]>;
}

async function activeConfigId(tx: Tx, now: Date) {
  const config = await tx.economicConfigVersion.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }],
    },
    orderBy: { id: "desc" },
  });
  if (!config)
    throw new SandboxWithdrawalError(
      "SANDBOX_CONVERSION_CONFLICT",
      "Active economic configuration is missing",
      503,
    );
  return config.id;
}

async function releaseReservation(
  tx: Tx,
  conversion: { id: string; quote: { eligibleMinor: Prisma.Decimal } },
  accounts: Awaited<ReturnType<typeof userAccounts>>,
  configVersion: number,
  key: string,
) {
  return postLedgerTransactionInTransaction(tx, {
    idempotencyKey: `sandbox:release:${key}`,
    type: "SANDBOX_CONVERSION_RELEASE",
    sourceType: "sandbox_conversion_release",
    sourceId: conversion.id,
    configVersion,
    metadata: { mode: "SANDBOX", conversionId: conversion.id },
    postings: [
      {
        account: accountRef(accounts.RESERVED),
        amount: -minor(conversion.quote.eligibleMinor),
      },
      {
        account: accountRef(accounts.ELIGIBLE),
        amount: minor(conversion.quote.eligibleMinor),
      },
    ],
  });
}

function mapQuote(
  quote: {
    id: string;
    asset: string;
    eligibleMinor: Prisma.Decimal;
    grossAssetMinor: Prisma.Decimal;
    networkFeeAssetMinor: Prisma.Decimal;
    netAssetMinor: Prisma.Decimal;
    spreadBps: number;
    status: string;
    expiresAt: Date;
    createdAt: Date;
  },
  now: Date,
) {
  return {
    id: quote.id,
    asset: quote.asset as "SANDBOX_LTC" | "SANDBOX_DOGE",
    eligibleMinorUnits: quote.eligibleMinor.toFixed(0),
    grossAssetMinorUnits: quote.grossAssetMinor.toFixed(0),
    networkFeeAssetMinorUnits: quote.networkFeeAssetMinor.toFixed(0),
    netAssetMinorUnits: quote.netAssetMinor.toFixed(0),
    spreadBps: quote.spreadBps,
    status: (quote.status === "OPEN" && quote.expiresAt <= now
      ? "EXPIRED"
      : quote.status) as "OPEN" | "CONSUMED" | "EXPIRED",
    expiresAt: quote.expiresAt.toISOString(),
    createdAt: quote.createdAt.toISOString(),
  };
}

function mapConversion(
  conversion: {
    id: string;
    status: string;
    reserveTransactionId: string;
    releaseTransactionId: string | null;
    createdAt: Date;
    quote: Parameters<typeof mapQuote>[0];
  },
  now: Date,
) {
  return {
    id: conversion.id,
    quote: mapQuote(conversion.quote, now),
    status: conversion.status as
      | "RESERVED"
      | "COMPLETED"
      | "CANCELLED"
      | "REJECTED",
    reserveTransactionId: conversion.reserveTransactionId,
    releaseTransactionId: conversion.releaseTransactionId,
    createdAt: conversion.createdAt.toISOString(),
  };
}

function mapWithdrawal(withdrawal: {
  id: string;
  conversionId: string;
  walletId: string;
  status: string;
  riskScore: number;
  reasonCodes: Prisma.JsonValue;
  assurance: string;
  sandboxTxId: string | null;
  confirmations: number;
  settlementTransactionId: string | null;
  createdAt: Date;
}) {
  return {
    id: withdrawal.id,
    conversionId: withdrawal.conversionId,
    walletId: withdrawal.walletId,
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
    assurance: withdrawal.assurance as
      | "PASSWORD_REAUTH_SANDBOX"
      | "PASSWORD_EMAIL_OTP_SANDBOX",
    sandboxTxId: withdrawal.sandboxTxId,
    confirmations: withdrawal.confirmations,
    settlementTransactionId: withdrawal.settlementTransactionId,
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
function minor(value: Prisma.Decimal | bigint | null | undefined) {
  return BigInt(value?.toString() ?? "0");
}
function mask(address: string) {
  return address.length <= 16
    ? address
    : `${address.slice(0, 10)}…${address.slice(-5)}`;
}
function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}
function safeEqual(left: string, right: string) {
  return (
    left.length === right.length &&
    timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))
  );
}
function conflict() {
  return new SandboxWithdrawalError(
    "SANDBOX_CONVERSION_CONFLICT",
    "Sandbox conversion state conflicts with this request",
    409,
  );
}
