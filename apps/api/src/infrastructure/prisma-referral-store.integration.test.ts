import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDatabase, Prisma } from "@fauzet/database";
import { AuthStoreReferralError, type SessionContext } from "../domain/auth.js";
import { ReferralError } from "../domain/referrals.js";
import { PrismaAuthStore } from "./prisma-auth-store.js";
import { PrismaLedgerStore } from "./prisma-ledger-store.js";
import { PrismaReferralStore } from "./prisma-referral-store.js";

const integration = process.env.RUN_INTEGRATION === "true";

describe.runIf(integration)("persistent referral invariants", () => {
  const database = getDatabase();
  const auth = new PrismaAuthStore(database);
  const referrals = new PrismaReferralStore(database);
  let originalConfigId = 0;
  let testConfigId = 0;
  let chain: Array<{ userId: string; code: string }> = [];

  beforeAll(async () => {
    const original = await database.economicConfigVersion.findFirstOrThrow({
      where: { status: "ACTIVE" },
      orderBy: { id: "desc" },
    });
    originalConfigId = original.id;
    const parameters = structuredClone(original.parameters);
    if (!isRecord(parameters) || !isRecord(parameters.referrals))
      throw new Error("Referral parameters are missing from active config");
    Object.assign(parameters.referrals, {
      version: 1,
      attributionEnabled: true,
      commissionsEnabled: true,
      legalApproved: true,
      disabledReason: "TEST_ONLY",
      maxRiskLevel: 30,
      ratesBps: [500, 200, 100, 50],
      monthlyCapMinor: 1_000,
      reviewWindowHours: 0,
      allowedSources: ["REWARDED_AD", "OFFERWALL", "VALIDATED_PURCHASE"],
    });
    const config = await database.$transaction(async (tx) => {
      await tx.economicConfigVersion.updateMany({
        where: { status: "ACTIVE" },
        data: { status: "SUPERSEDED" },
      });
      return tx.economicConfigVersion.create({
        data: {
          status: "ACTIVE",
          parameters: parameters as Prisma.InputJsonValue,
          reason: "Referral integration test",
          createdById: "integration-test",
          effectiveAt: new Date(),
        },
      });
    });
    testConfigId = config.id;
    await fundReferralPool(100_000n, config.id);
    chain = [];
    for (let index = 0; index < 5; index += 1) {
      const sponsorCode = index === 0 ? undefined : chain[index - 1]!.code;
      const user = await createUser(sponsorCode, {
        deviceId: crypto.randomUUID(),
      });
      const code = await referrals.code(user.id);
      chain.push({ userId: user.id, code: code.code });
    }
  });

  afterAll(async () => {
    if (testConfigId && originalConfigId) {
      await database.$transaction(async (tx) => {
        await tx.economicConfigVersion.updateMany({
          where: { status: "ACTIVE" },
          data: { status: "SUPERSEDED" },
        });
        await tx.economicConfigVersion.update({
          where: { id: originalConfigId },
          data: { status: "ACTIVE" },
        });
      });
    }
    await database.$disconnect();
  });

  it("materializes one immutable four-level ancestry without cycles", async () => {
    const ancestors = await database.referralAncestor.findMany({
      where: { descendantId: chain[4]!.userId },
      orderBy: { depth: "asc" },
    });
    expect(
      ancestors.map(({ ancestorId, depth }) => ({ ancestorId, depth })),
    ).toEqual([
      { ancestorId: chain[3]!.userId, depth: 1 },
      { ancestorId: chain[2]!.userId, depth: 2 },
      { ancestorId: chain[1]!.userId, depth: 3 },
      { ancestorId: chain[0]!.userId, depth: 4 },
    ]);
    await expect(
      database.referralEdge.update({
        where: { referredUserId: chain[4]!.userId },
        data: { sponsorId: chain[0]!.userId },
      }),
    ).rejects.toBeTruthy();
  });

  it("blocks invalid codes and same-device self-attribution", async () => {
    await expect(
      createUser("FZ-ZZZZZZZZZZZZ", { deviceId: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(AuthStoreReferralError);
    const sponsor = chain[0]!;
    const deviceId = crypto.randomUUID();
    await auth.createSession(
      sponsor.userId,
      `integration-session-${crypto.randomUUID()}`,
      new Date(Date.now() + 86_400_000),
      { deviceId },
      1,
    );
    await expect(createUser(sponsor.code, { deviceId })).rejects.toMatchObject({
      code: "REFERRAL_ATTRIBUTION_BLOCKED",
    });
  });

  it("posts exactly 5/2/1/0.5 percent to pending without commission-on-commission", async () => {
    const input = activityInput(chain[4]!.userId, 1_000n);
    const attempts = await Promise.all([
      referrals.qualifyActivity(input),
      referrals.qualifyActivity(input),
    ]);
    expect(attempts.map(({ replayed }) => replayed).sort()).toEqual([
      false,
      true,
    ]);
    const result = attempts[0]!;
    expect(attempts[1]!.activityId).toBe(result.activityId);
    const commissions = await database.referralCommission.findMany({
      where: { activityId: result.activityId },
      orderBy: { level: "asc" },
    });
    expect(
      commissions.map(({ level, rateBps, rewardMinor, status }) => ({
        level,
        rateBps,
        reward: rewardMinor.toFixed(0),
        status,
      })),
    ).toEqual([
      { level: 1, rateBps: 500, reward: "50", status: "PENDING" },
      { level: 2, rateBps: 200, reward: "20", status: "PENDING" },
      { level: 3, rateBps: 100, reward: "10", status: "PENDING" },
      { level: 4, rateBps: 50, reward: "5", status: "PENDING" },
    ]);
    await expect(
      referrals.qualifyActivity({
        ...activityInput(chain[4]!.userId, 1_000n),
        sourceType: "REFERRAL" as never,
      }),
    ).rejects.toBeInstanceOf(ReferralError);
  });

  it("enforces the monthly cap and rejects idempotency payload drift", async () => {
    const capped = await referrals.qualifyActivity(
      activityInput(chain[4]!.userId, 100_000n),
    );
    const levelOne = await database.referralCommission.findFirstOrThrow({
      where: { activityId: capped.activityId, level: 1 },
    });
    expect(levelOne.rewardMinor.toFixed(0)).toBe("950");
    await expect(
      referrals.qualifyActivity({
        ...activityInput(chain[4]!.userId, 2_000n),
        sourceId: (
          await database.monetizableActivity.findUniqueOrThrow({
            where: { id: capped.activityId },
          })
        ).sourceId,
      }),
    ).rejects.toMatchObject({ code: "REFERRAL_ACTIVITY_CONFLICT" });
  });

  it("serializes two branches competing for the same final monthly cap", async () => {
    const sponsor = await createUser(undefined, {
      deviceId: crypto.randomUUID(),
    });
    const sponsorCode = (await referrals.code(sponsor.id)).code;
    const [first, second] = await Promise.all([
      createUser(sponsorCode, { deviceId: crypto.randomUUID() }),
      createUser(sponsorCode, { deviceId: crypto.randomUUID() }),
    ]);
    const results = await Promise.all([
      referrals.qualifyActivity(activityInput(first.id, 100_000n)),
      referrals.qualifyActivity(activityInput(second.id, 100_000n)),
    ]);
    const commissions = await database.referralCommission.findMany({
      where: {
        beneficiaryId: sponsor.id,
        activityId: { in: results.map(({ activityId }) => activityId) },
      },
    });
    expect(
      commissions.reduce(
        (sum, commission) => sum + BigInt(commission.rewardMinor.toFixed(0)),
        0n,
      ),
    ).toBe(1_000n);
    expect(
      commissions.reduce(
        (sum, commission) => sum + BigInt(commission.cappedMinor.toFixed(0)),
        0n,
      ),
    ).toBe(9_000n);
  });

  it("releases reviewed pending rewards and claws them back atomically", async () => {
    const input = activityInput(chain[3]!.userId, 1_000n);
    const qualified = await referrals.qualifyActivity(input);
    const releases = await Promise.all([
      referrals.releaseActivity(
        qualified.activityId,
        new Date(input.qualifiedAt.getTime() + 1),
      ),
      referrals.releaseActivity(
        qualified.activityId,
        new Date(input.qualifiedAt.getTime() + 1),
      ),
    ]);
    expect(
      releases.reduce((sum, release) => sum + release.released, 0),
    ).toBeGreaterThan(0);
    await expect(
      database.ledgerTransaction.count({
        where: {
          sourceType: "referral_release",
          sourceId: qualified.activityId,
        },
      }),
    ).resolves.toBe(1);
    const releasedCommission =
      await database.referralCommission.findFirstOrThrow({
        where: { activityId: qualified.activityId, status: "AVAILABLE" },
      });
    const before = await balance(releasedCommission.beneficiaryId, "AVAILABLE");
    expect(before).toBeGreaterThan(0n);
    const reversed = await referrals.reverseActivity(qualified.activityId);
    expect(reversed).toMatchObject({ pending: false, replayed: false });
    expect(await balance(releasedCommission.beneficiaryId, "AVAILABLE")).toBe(
      before - BigInt(releasedCommission.rewardMinor.toFixed(0)),
    );
    const commissions = await database.referralCommission.findMany({
      where: { activityId: qualified.activityId },
    });
    expect(commissions.every(({ status }) => status === "REVERSED")).toBe(true);
  });

  it("halts pending releases when the current legal kill switch closes", async () => {
    const input = activityInput(chain[3]!.userId, 1_000n);
    const qualified = await referrals.qualifyActivity(input);
    const active = await database.economicConfigVersion.findUniqueOrThrow({
      where: { id: testConfigId },
    });
    const parameters = structuredClone(active.parameters);
    if (!isRecord(parameters) || !isRecord(parameters.referrals))
      throw new Error("Referral parameters are missing from test config");
    Object.assign(parameters.referrals, {
      commissionsEnabled: false,
      legalApproved: false,
      disabledReason: "LEGAL_REVIEW_TEST",
    });
    const disabled = await database.$transaction(async (tx) => {
      await tx.economicConfigVersion.update({
        where: { id: testConfigId },
        data: { status: "SUPERSEDED" },
      });
      return tx.economicConfigVersion.create({
        data: {
          status: "ACTIVE",
          parameters: parameters as Prisma.InputJsonValue,
          reason: "Referral kill-switch integration test",
          createdById: "integration-test",
          effectiveAt: input.qualifiedAt,
        },
      });
    });

    try {
      await expect(
        referrals.releaseActivity(
          qualified.activityId,
          new Date(input.qualifiedAt.getTime() + 1),
        ),
      ).rejects.toMatchObject({ code: "REFERRAL_DISABLED" });
      await expect(
        database.referralCommission.count({
          where: { activityId: qualified.activityId, status: "AVAILABLE" },
        }),
      ).resolves.toBe(0);
    } finally {
      await database.$transaction(async (tx) => {
        await tx.economicConfigVersion.update({
          where: { id: disabled.id },
          data: { status: "SUPERSEDED" },
        });
        await tx.economicConfigVersion.update({
          where: { id: testConfigId },
          data: { status: "ACTIVE" },
        });
      });
    }
    const released = await referrals.releaseActivity(
      qualified.activityId,
      new Date(input.qualifiedAt.getTime() + 1),
    );
    expect(released.released).toBeGreaterThan(0);
  });

  it("records a clawback obligation instead of overdrawing spent rewards", async () => {
    const input = activityInput(chain[2]!.userId, 1_000n);
    const qualified = await referrals.qualifyActivity(input);
    await referrals.releaseActivity(
      qualified.activityId,
      new Date(input.qualifiedAt.getTime() + 1),
    );
    const releasedCommissions = await database.referralCommission.findMany({
      where: { activityId: qualified.activityId, status: "AVAILABLE" },
    });
    for (const beneficiaryId of [
      ...new Set(releasedCommissions.map(({ beneficiaryId }) => beneficiaryId)),
    ]) {
      await spendAvailable(
        beneficiaryId,
        await balance(beneficiaryId, "AVAILABLE"),
      );
    }
    const pending = await referrals.reverseActivity(qualified.activityId);
    expect(pending.pending).toBe(true);
    await expect(
      database.monetizableActivity.findUniqueOrThrow({
        where: { id: qualified.activityId },
      }),
    ).resolves.toMatchObject({ status: "REVERSAL_PENDING" });
    await expect(
      database.referralCommission.findFirstOrThrow({
        where: {
          activityId: qualified.activityId,
          beneficiaryId: releasedCommissions[0]!.beneficiaryId,
        },
      }),
    ).resolves.toMatchObject({ status: "CLAWBACK_PENDING" });
  });

  async function createUser(
    referralCode?: string,
    context: SessionContext = {},
  ) {
    const id = crypto.randomUUID();
    const user = await auth.createUser(
      {
        email: `referral-${id}@fauzet.local`,
        password: "NotUsedPassword123",
        passwordHash: "integration-only",
        displayName: `Crew ${id.slice(0, 6)}`,
        countryCode: "CO",
        locale: "es",
        acceptedTerms: true,
        isAdult: true,
        ...(referralCode ? { referralCode } : {}),
      },
      context,
    );
    await database.user.update({
      where: { id: user.id },
      data: { status: "ACTIVE", emailVerifiedAt: new Date() },
    });
    return user;
  }

  function activityInput(userId: string, baseMinor: bigint) {
    const id = crypto.randomUUID();
    return {
      userId,
      sourceType: "OFFERWALL" as const,
      sourceId: `offer-${id}`,
      idempotencyKey: `offer-${id}`,
      baseMinor,
      qualifiedAt: new Date(),
      evidence: { provider: "integration", callbackVerified: true },
    };
  }

  async function fundReferralPool(amount: bigint, configVersion: number) {
    const [issuance, pool] = await Promise.all([
      database.ledgerAccount.findUniqueOrThrow({
        where: { code: "platform:zyxe:issuance" },
      }),
      database.ledgerAccount.findUniqueOrThrow({
        where: { code: "platform:zyxe:referral-reward-pool" },
      }),
    ]);
    await new PrismaLedgerStore(database).post({
      idempotencyKey: `integration:referral-pool:${crypto.randomUUID()}`,
      type: "INTEGRATION_REFERRAL_POOL_FUND",
      sourceType: "integration_test",
      sourceId: crypto.randomUUID(),
      configVersion,
      metadata: { integration: true },
      postings: [
        { account: accountRef(issuance), amount: -amount },
        { account: accountRef(pool), amount },
      ],
    });
  }

  async function spendAvailable(userId: string, amount: bigint) {
    if (amount === 0n) return;
    const [available, burn] = await Promise.all([
      database.ledgerAccount.findFirstOrThrow({
        where: { userId, asset: "ZYXE", bucket: "AVAILABLE" },
      }),
      database.ledgerAccount.findUniqueOrThrow({
        where: { code: "platform:zyxe:burn" },
      }),
    ]);
    await new PrismaLedgerStore(database).post({
      idempotencyKey: `integration:spend-referral:${crypto.randomUUID()}`,
      type: "INTEGRATION_REFERRAL_SPEND",
      sourceType: "integration_test",
      sourceId: crypto.randomUUID(),
      configVersion: testConfigId,
      metadata: { integration: true },
      postings: [
        { account: accountRef(available), amount: -amount },
        { account: accountRef(burn), amount },
      ],
    });
  }

  async function balance(userId: string, bucket: "PENDING" | "AVAILABLE") {
    const account = await database.ledgerAccount.findFirstOrThrow({
      where: { userId, asset: "ZYXE", bucket },
    });
    const aggregate = await database.ledgerPosting.aggregate({
      where: { accountId: account.id },
      _sum: { amount: true },
    });
    return BigInt(aggregate._sum.amount?.toFixed(0) ?? "0");
  }
});

function accountRef(account: {
  id: string;
  asset: string;
  kind: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE" | "CONTRA";
}) {
  return { id: account.id, asset: account.asset, kind: account.kind };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
