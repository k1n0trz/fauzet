import { afterAll, describe, expect, it } from "vitest";
import { getDatabase, type LedgerAccountKind } from "@fauzet/database";
import { hashPassword } from "../domain/auth.js";
import { PrismaLedgerStore } from "./prisma-ledger-store.js";
import { PrismaAdminStore } from "./prisma-admin-store.js";
import { MemoryMailer } from "./memory-mailer.js";
import { PrismaSandboxWithdrawalStore } from "./prisma-sandbox-withdrawal-store.js";

const integration = process.env.RUN_INTEGRATION === "true";
const PASSWORD = "SandboxPassword123";

describe.runIf(integration)("persistent sandbox conversion invariants", () => {
  const database = getDatabase();

  afterAll(async () => {
    await database.$disconnect();
  });

  it("reserves one quote exactly once under concurrent retries", async () => {
    let now = new Date("2027-08-01T12:00:00.000Z");
    const userId = await createFundedUser(2_000n);
    const store = new PrismaSandboxWithdrawalStore(database, () => now);
    const { quote } = await store.quote({
      userId,
      asset: "SANDBOX_LTC",
      eligibleMinor: 1_000n,
    });
    const key = `conversion-${crypto.randomUUID()}`;

    const results = await Promise.all([
      store.convert({ userId, quoteId: quote.id, idempotencyKey: key }),
      store.convert({ userId, quoteId: quote.id, idempotencyKey: key }),
    ]);

    expect(results.map(({ replayed }) => replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect(await balances(userId)).toEqual({
      ELIGIBLE: 1_000n,
      RESERVED: 1_000n,
      WITHDRAWN: 0n,
    });
    await expect(
      store.convert({
        userId,
        quoteId: quote.id,
        idempotencyKey: `different-${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "SANDBOX_QUOTE_INVALID" });
    now = new Date(now.getTime() + 121_000);
    const expiring = await store.quote({
      userId,
      asset: "SANDBOX_DOGE",
      eligibleMinor: 500n,
    });
    now = new Date(now.getTime() + 121_000);
    await expect(
      store.convert({
        userId,
        quoteId: expiring.quote.id,
        idempotencyKey: `expired-${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "SANDBOX_QUOTE_INVALID" });
  });

  it("enforces the five-destination limit under concurrent wallet creation", async () => {
    const userId = await createFundedUser(500n);
    const store = new PrismaSandboxWithdrawalStore(database);
    for (let index = 0; index < 4; index += 1)
      await store.createWallet({
        userId,
        network: "SANDBOX_LTC",
        address: `sandbox:wallet_${index}_${crypto.randomUUID().replaceAll("-", "")}`,
        label: `Destination ${index}`,
      });

    const attempts = await Promise.allSettled(
      ["fifth", "sixth"].map((label) =>
        store.createWallet({
          userId,
          network: "SANDBOX_DOGE",
          address: `sandbox:${label}_${crypto.randomUUID().replaceAll("-", "")}`,
          label: `${label} destination`,
        }),
      ),
    );

    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    expect(
      await database.externalWallet.count({
        where: { userId, status: { not: "REVOKED" } },
      }),
    ).toBe(5);
  });

  it("requires wallet cooldown and password step-up, then settles without external value", async () => {
    let now = new Date("2027-08-02T12:00:00.000Z");
    const userId = await createFundedUser(1_500n);
    const mailer = new MemoryMailer();
    const store = new PrismaSandboxWithdrawalStore(
      database,
      () => now,
      mailer,
      "integration-sandbox-secret",
    );
    const status = await store.createWallet({
      userId,
      network: "SANDBOX_LTC",
      address: `sandbox:${crypto.randomUUID().replaceAll("-", "")}`,
      label: "Primary sandbox wallet",
    });
    const wallet = status.wallets[0]!;
    const { quote } = await store.quote({
      userId,
      asset: "SANDBOX_LTC",
      eligibleMinor: 1_000n,
    });
    const { conversion } = await store.convert({
      userId,
      quoteId: quote.id,
      idempotencyKey: `reserve-${crypto.randomUUID()}`,
    });
    await expect(
      store.withdraw({
        userId,
        conversionId: conversion.id,
        walletId: wallet.id,
        password: "wrong password",
        challengeId: crypto.randomUUID(),
        code: "000000",
        idempotencyKey: `wrong-${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "SANDBOX_STEP_UP_INVALID" });
    await expect(
      store.withdraw({
        userId,
        conversionId: conversion.id,
        walletId: wallet.id,
        password: PASSWORD,
        challengeId: crypto.randomUUID(),
        code: "000000",
        idempotencyKey: `cooldown-${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "SANDBOX_WALLET_COOLDOWN" });

    now = new Date(now.getTime() + 24 * 3_600_000 + 1);
    const stepUp = await challengeFor(
      store,
      mailer,
      userId,
      conversion.id,
      wallet.id,
    );
    const wrongCode = stepUp.code === "000000" ? "000001" : "000000";
    for (let attempt = 0; attempt < 5; attempt += 1)
      await expect(
        store.withdraw({
          userId,
          conversionId: conversion.id,
          walletId: wallet.id,
          password: PASSWORD,
          challengeId: stepUp.challengeId,
          code: wrongCode,
          idempotencyKey: `invalid-code-${attempt}-${crypto.randomUUID()}`,
        }),
      ).rejects.toMatchObject({ code: "SANDBOX_CHALLENGE_INVALID" });
    await expect(
      store.withdraw({
        userId,
        conversionId: conversion.id,
        walletId: wallet.id,
        password: PASSWORD,
        ...stepUp,
        idempotencyKey: `exhausted-code-${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "SANDBOX_CHALLENGE_INVALID" });
    const replacement = await challengeFor(
      store,
      mailer,
      userId,
      conversion.id,
      wallet.id,
    );
    const freshStepUp = await challengeFor(
      store,
      mailer,
      userId,
      conversion.id,
      wallet.id,
    );
    await expect(
      store.withdraw({
        userId,
        conversionId: conversion.id,
        walletId: wallet.id,
        password: PASSWORD,
        ...replacement,
        idempotencyKey: `superseded-code-${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "SANDBOX_CHALLENGE_INVALID" });
    expect(
      await database.withdrawalChallenge.count({
        where: {
          userId,
          conversionId: conversion.id,
          walletId: wallet.id,
          consumedAt: null,
        },
      }),
    ).toBe(1);
    const key = `withdraw-${crypto.randomUUID()}`;
    const results = await Promise.all([
      store.withdraw({
        userId,
        conversionId: conversion.id,
        walletId: wallet.id,
        password: PASSWORD,
        ...freshStepUp,
        idempotencyKey: key,
      }),
      store.withdraw({
        userId,
        conversionId: conversion.id,
        walletId: wallet.id,
        password: PASSWORD,
        ...freshStepUp,
        idempotencyKey: key,
      }),
    ]);
    expect(results.map(({ replayed }) => replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect(results[0]!.withdrawal).toMatchObject({
      status: "CONFIRMED",
      assurance: "PASSWORD_EMAIL_OTP_SANDBOX",
      confirmations: 6,
    });
    expect(results[0]!.withdrawal.sandboxTxId).toMatch(/^sandbox_[a-f0-9]+$/);
    expect(await balances(userId)).toEqual({
      ELIGIBLE: 500n,
      RESERVED: 0n,
      WITHDRAWN: 1_000n,
    });
  });

  it("holds medium risk for review and cancellation releases the reservation", async () => {
    let now = new Date("2027-08-03T12:00:00.000Z");
    const userId = await createFundedUser(1_000n, 50);
    const mailer = new MemoryMailer();
    const store = new PrismaSandboxWithdrawalStore(
      database,
      () => now,
      mailer,
      "integration-sandbox-secret",
    );
    const wallet = (
      await store.createWallet({
        userId,
        network: "SANDBOX_DOGE",
        address: `sandbox:${crypto.randomUUID().replaceAll("-", "")}`,
        label: "Review destination",
      })
    ).wallets[0]!;
    now = new Date(now.getTime() + 24 * 3_600_000 + 1);
    const quote = await store.quote({
      userId,
      asset: "SANDBOX_DOGE",
      eligibleMinor: 1_000n,
    });
    const reserved = await store.convert({
      userId,
      quoteId: quote.quote.id,
      idempotencyKey: `review-reserve-${crypto.randomUUID()}`,
    });
    const stepUp = await challengeFor(
      store,
      mailer,
      userId,
      reserved.conversion.id,
      wallet.id,
    );
    const review = await store.withdraw({
      userId,
      conversionId: reserved.conversion.id,
      walletId: wallet.id,
      password: PASSWORD,
      ...stepUp,
      idempotencyKey: `review-${crypto.randomUUID()}`,
    });
    expect(review.withdrawal).toMatchObject({
      status: "REVIEW",
      reasonCodes: ["RISK_SCORE_REVIEW"],
    });
    expect(await balances(userId)).toMatchObject({ RESERVED: 1_000n });

    await store.cancel({
      userId,
      conversionId: reserved.conversion.id,
      idempotencyKey: `cancel-${crypto.randomUUID()}`,
    });
    expect(await balances(userId)).toEqual({
      ELIGIBLE: 1_000n,
      RESERVED: 0n,
      WITHDRAWN: 0n,
    });
    await expect(
      database.withdrawal.findUniqueOrThrow({
        where: { id: review.withdrawal.id },
      }),
    ).resolves.toMatchObject({ status: "CANCELLED" });
  });

  it("rejects high risk and compensates the reservation atomically", async () => {
    let now = new Date("2027-08-04T12:00:00.000Z");
    const userId = await createFundedUser(1_000n, 80);
    const mailer = new MemoryMailer();
    const store = new PrismaSandboxWithdrawalStore(
      database,
      () => now,
      mailer,
      "integration-sandbox-secret",
    );
    const wallet = (
      await store.createWallet({
        userId,
        network: "SANDBOX_LTC",
        address: `sandbox:${crypto.randomUUID().replaceAll("-", "")}`,
        label: "High risk destination",
      })
    ).wallets[0]!;
    now = new Date(now.getTime() + 24 * 3_600_000 + 1);
    const quote = await store.quote({
      userId,
      asset: "SANDBOX_LTC",
      eligibleMinor: 1_000n,
    });
    const reserved = await store.convert({
      userId,
      quoteId: quote.quote.id,
      idempotencyKey: `reject-reserve-${crypto.randomUUID()}`,
    });
    const stepUp = await challengeFor(
      store,
      mailer,
      userId,
      reserved.conversion.id,
      wallet.id,
    );
    const result = await store.withdraw({
      userId,
      conversionId: reserved.conversion.id,
      walletId: wallet.id,
      password: PASSWORD,
      ...stepUp,
      idempotencyKey: `reject-${crypto.randomUUID()}`,
    });
    expect(result.withdrawal).toMatchObject({
      status: "REJECTED",
      reasonCodes: ["RISK_SCORE_REJECT"],
      settlementTransactionId: null,
      sandboxTxId: null,
    });
    expect(result.conversion.status).toBe("REJECTED");
    expect(await balances(userId)).toEqual({
      ELIGIBLE: 1_000n,
      RESERVED: 0n,
      WITHDRAWN: 0n,
    });
  });

  it("lets an authorized admin review settle a held sandbox withdrawal exactly once", async () => {
    let now = new Date("2027-08-05T12:00:00.000Z");
    const userId = await createFundedUser(1_000n, 50);
    const actorId = await createReviewer();
    const mailer = new MemoryMailer();
    const store = new PrismaSandboxWithdrawalStore(
      database,
      () => now,
      mailer,
      "integration-sandbox-secret",
    );
    const wallet = (
      await store.createWallet({
        userId,
        network: "SANDBOX_LTC",
        address: `sandbox:${crypto.randomUUID().replaceAll("-", "")}`,
        label: "Manual review destination",
      })
    ).wallets[0]!;
    now = new Date(now.getTime() + 24 * 3_600_000 + 1);
    const quote = await store.quote({
      userId,
      asset: "SANDBOX_LTC",
      eligibleMinor: 1_000n,
    });
    const conversion = await store.convert({
      userId,
      quoteId: quote.quote.id,
      idempotencyKey: `admin-reserve-${crypto.randomUUID()}`,
    });
    const stepUp = await challengeFor(
      store,
      mailer,
      userId,
      conversion.conversion.id,
      wallet.id,
    );
    const held = await store.withdraw({
      userId,
      conversionId: conversion.conversion.id,
      walletId: wallet.id,
      password: PASSWORD,
      ...stepUp,
      idempotencyKey: `admin-hold-${crypto.randomUUID()}`,
    });
    const admin = new PrismaAdminStore(database);
    const decision = {
      actorId,
      withdrawalId: held.withdrawal.id,
      decision: "APPROVE" as const,
      reason: "Manual sandbox review passed all checks",
      requestId: `request-${crypto.randomUUID()}`,
    };
    const results = await Promise.all([
      admin.decideWithdrawal(decision),
      admin.decideWithdrawal({
        ...decision,
        requestId: `request-${crypto.randomUUID()}`,
      }),
    ]);
    expect(results.map(({ replayed }) => replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect(results[0]!.withdrawal).toMatchObject({
      status: "CONFIRMED",
      confirmations: 6,
    });
    expect(await balances(userId)).toEqual({
      ELIGIBLE: 0n,
      RESERVED: 0n,
      WITHDRAWN: 1_000n,
    });
  });

  it("refuses admin approval when the account is no longer eligible", async () => {
    let now = new Date("2027-08-06T12:00:00.000Z");
    const userId = await createFundedUser(1_000n, 50);
    const actorId = await createReviewer();
    const mailer = new MemoryMailer();
    const store = new PrismaSandboxWithdrawalStore(
      database,
      () => now,
      mailer,
      "integration-sandbox-secret",
    );
    const wallet = (
      await store.createWallet({
        userId,
        network: "SANDBOX_LTC",
        address: `sandbox:${crypto.randomUUID().replaceAll("-", "")}`,
        label: "Eligibility revalidation destination",
      })
    ).wallets[0]!;
    now = new Date(now.getTime() + 24 * 3_600_000 + 1);
    const quote = await store.quote({
      userId,
      asset: "SANDBOX_LTC",
      eligibleMinor: 1_000n,
    });
    const conversion = await store.convert({
      userId,
      quoteId: quote.quote.id,
      idempotencyKey: `admin-eligibility-reserve-${crypto.randomUUID()}`,
    });
    const stepUp = await challengeFor(
      store,
      mailer,
      userId,
      conversion.conversion.id,
      wallet.id,
    );
    const held = await store.withdraw({
      userId,
      conversionId: conversion.conversion.id,
      walletId: wallet.id,
      password: PASSWORD,
      ...stepUp,
      idempotencyKey: `admin-eligibility-hold-${crypto.randomUUID()}`,
    });
    const admin = new PrismaAdminStore(database);
    const approve = () =>
      admin.decideWithdrawal({
        actorId,
        withdrawalId: held.withdrawal.id,
        decision: "APPROVE",
        reason: "Revalidate current account eligibility",
        requestId: `request-${crypto.randomUUID()}`,
      });
    const expectStillHeld = async () => {
      const [persistedWithdrawal, persistedConversion, settlement, audits] =
        await Promise.all([
          database.withdrawal.findUniqueOrThrow({
            where: { id: held.withdrawal.id },
          }),
          database.conversion.findUniqueOrThrow({
            where: { id: conversion.conversion.id },
          }),
          database.ledgerTransaction.findUnique({
            where: {
              idempotencyKey: `sandbox:admin-withdrawal:${held.withdrawal.id}:approve`,
            },
          }),
          database.auditEvent.count({
            where: {
              action: "ADMIN_SANDBOX_WITHDRAWAL_APPROVED",
              targetType: "Withdrawal",
              targetId: held.withdrawal.id,
            },
          }),
        ]);
      expect(persistedWithdrawal).toMatchObject({
        status: "REVIEW",
        settlementTransactionId: null,
        sandboxTxId: null,
        confirmations: 0,
      });
      expect(persistedConversion.status).toBe("RESERVED");
      expect(settlement).toBeNull();
      expect(audits).toBe(0);
      expect(await balances(userId)).toEqual({
        ELIGIBLE: 0n,
        RESERVED: 1_000n,
        WITHDRAWN: 0n,
      });
    };

    await database.user.update({
      where: { id: userId },
      data: { riskLevel: 70 },
    });
    await expect(approve()).rejects.toMatchObject({
      code: "ADMIN_WITHDRAWAL_INVALID",
    });
    await expectStillHeld();

    await database.user.update({
      where: { id: userId },
      data: { riskLevel: 50, status: "SUSPENDED" },
    });
    await expect(approve()).rejects.toMatchObject({
      code: "ADMIN_WITHDRAWAL_INVALID",
    });
    await expectStillHeld();

    await database.user.update({
      where: { id: userId },
      data: { status: "ACTIVE", emailVerifiedAt: null },
    });
    await expect(approve()).rejects.toMatchObject({
      code: "ADMIN_WITHDRAWAL_INVALID",
    });
    await expectStillHeld();
  });

  it("protects the economic records against deletion", async () => {
    const userId = await createFundedUser(500n);
    const store = new PrismaSandboxWithdrawalStore(database);
    const quote = await store.quote({
      userId,
      asset: "SANDBOX_LTC",
      eligibleMinor: 500n,
    });
    await expect(
      database.conversionQuote.delete({ where: { id: quote.quote.id } }),
    ).rejects.toBeTruthy();
  });

  async function createFundedUser(amount: bigint, riskLevel = 0) {
    const identity = crypto.randomUUID();
    const user = await database.user.create({
      data: {
        email: `sandbox-${identity}@fauzet.local`,
        passwordHash: await hashPassword(PASSWORD),
        displayName: "Sandbox Integration",
        status: "ACTIVE",
        riskLevel,
        emailVerifiedAt: new Date(),
        acceptedTermsAt: new Date(),
        adultDeclaredAt: new Date(),
        accounts: {
          create: ["ELIGIBLE", "RESERVED", "WITHDRAWN"].map((bucket) => ({
            code: `user:${identity}:zyxe:${bucket.toLowerCase()}`,
            name: `Integration ${bucket.toLowerCase()}`,
            kind: "LIABILITY" as const,
            asset: "ZYXE",
            bucket: bucket as "ELIGIBLE" | "RESERVED" | "WITHDRAWN",
          })),
        },
      },
      include: { accounts: true },
    });
    const issuance = await database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:issuance" },
    });
    const eligible = user.accounts.find(({ bucket }) => bucket === "ELIGIBLE")!;
    const config = await database.economicConfigVersion.findFirstOrThrow({
      where: { status: "ACTIVE" },
      orderBy: { id: "desc" },
    });
    await new PrismaLedgerStore(database).post({
      idempotencyKey: `integration:sandbox-fund:${user.id}`,
      type: "INTEGRATION_SANDBOX_FUND",
      sourceType: "integration_test",
      sourceId: user.id,
      configVersion: config.id,
      metadata: { integration: true },
      postings: [
        { account: accountRef(issuance), amount: -amount },
        { account: accountRef(eligible), amount },
      ],
    });
    return user.id;
  }

  async function createReviewer() {
    const identity = crypto.randomUUID();
    const reviewer = await database.user.create({
      data: {
        email: `sandbox-reviewer-${identity}@fauzet.local`,
        passwordHash: await hashPassword(PASSWORD),
        displayName: "Sandbox Reviewer",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        acceptedTermsAt: new Date(),
        adultDeclaredAt: new Date(),
        roles: { create: { role: "FINANCE" } },
      },
    });
    return reviewer.id;
  }

  async function balances(userId: string) {
    const accounts = await database.ledgerAccount.findMany({
      where: {
        userId,
        bucket: { in: ["ELIGIBLE", "RESERVED", "WITHDRAWN"] },
      },
    });
    const result = { ELIGIBLE: 0n, RESERVED: 0n, WITHDRAWN: 0n };
    for (const account of accounts) {
      const aggregate = await database.ledgerPosting.aggregate({
        where: { accountId: account.id },
        _sum: { amount: true },
      });
      result[account.bucket as keyof typeof result] = BigInt(
        aggregate._sum.amount?.toFixed(0) ?? "0",
      );
    }
    return result;
  }
});

async function challengeFor(
  store: PrismaSandboxWithdrawalStore,
  mailer: MemoryMailer,
  userId: string,
  conversionId: string,
  walletId: string,
) {
  const challenge = await store.challenge({ userId, conversionId, walletId });
  const delivered = mailer.withdrawalCodes.at(-1);
  if (!delivered) throw new Error("Withdrawal code was not delivered");
  return { challengeId: challenge.challengeId, code: delivered.code };
}

function accountRef(account: {
  id: string;
  asset: string;
  kind: LedgerAccountKind;
}) {
  return { id: account.id, asset: account.asset, kind: account.kind };
}
