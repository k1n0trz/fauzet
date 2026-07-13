import { afterAll, describe, expect, it } from "vitest";
import { getDatabase, Prisma } from "@fauzet/database";
import { LedgerReversalError } from "../domain/ledger-posting.js";
import { PrismaLedgerStore } from "./prisma-ledger-store.js";
import {
  activeCommerceConfig,
  PrismaCommerceStore,
} from "./prisma-commerce-store.js";
import { PrismaMiningSettlement } from "./prisma-mining-settlement.js";

const integration = process.env.RUN_INTEGRATION === "true";

describe.runIf(integration)("persistent store and mining invariants", () => {
  const database = getDatabase();

  afterAll(async () => {
    await database.$disconnect();
  });

  it("replays one concurrent purchase and preserves promo-first 40/40/20 conservation", async () => {
    const now = new Date("2027-07-12T12:00:00.000Z");
    const userId = await createFundedUser(100n, 1_000n);
    const store = new PrismaCommerceStore(database, () => new Date(now));
    const config = await activeCommerceConfig(database, now);
    const key = `commerce-concurrent-${crypto.randomUUID()}`;
    await damageStarter(store, userId);

    const attempts = await Promise.all([
      store.purchase(purchaseInput(userId, "b4", config.id, key)),
      store.purchase(purchaseInput(userId, "b4", config.id, key)),
    ]);

    expect(attempts.map(({ replayed }) => replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect(attempts[0]!.purchase.payment).toEqual({
      promotionalMinorUnits: "100",
      availableMinorUnits: "20",
    });
    expect(attempts[0]!.purchase.split).toMatchObject({
      burnMinorUnits: "48",
      recycleMinorUnits: "48",
      treasuryMinorUnits: "24",
    });

    const [purchases, profile] = await Promise.all([
      database.storePurchase.findMany({
        where: { userId, productId: "b4" },
        include: { transaction: { include: { postings: true } } },
      }),
      database.miningProfile.findUniqueOrThrow({ where: { userId } }),
    ]);
    expect(purchases).toHaveLength(1);
    expect(profile.repairKitCount).toBe(1);
    expect(
      purchases[0]!.transaction!.postings.reduce(
        (sum, posting) => sum + BigInt(posting.amount.toFixed(0)),
        0n,
      ),
    ).toBe(0n);
    expect(
      BigInt(purchases[0]!.promotionalDebitMinor.toFixed(0)) +
        BigInt(purchases[0]!.availableDebitMinor.toFixed(0)),
    ).toBe(BigInt(purchases[0]!.priceMinor.toFixed(0)));
    expect(
      BigInt(purchases[0]!.burnMinor.toFixed(0)) +
        BigInt(purchases[0]!.recycleMinor.toFixed(0)) +
        BigInt(purchases[0]!.treasuryMinor.toFixed(0)),
    ).toBe(BigInt(purchases[0]!.priceMinor.toFixed(0)));
  });

  it("rejects reuse of a raw idempotency key with any different payload", async () => {
    const now = new Date("2027-07-12T13:00:00.000Z");
    const userId = await createFundedUser(500n, 1_000n);
    const store = new PrismaCommerceStore(database, () => new Date(now));
    const config = await activeCommerceConfig(database, now);
    const key = `commerce-conflict-${crypto.randomUUID()}`;
    await damageStarter(store, userId);

    await store.purchase(purchaseInput(userId, "b4", config.id, key));

    await expect(
      store.purchase(purchaseInput(userId, "b4", config.id + 1, key)),
    ).rejects.toMatchObject({ code: "COMMERCE_IDEMPOTENCY_CONFLICT" });
    await expect(
      store.purchase(purchaseInput(userId, "b2", config.id, key)),
    ).rejects.toMatchObject({ code: "COMMERCE_IDEMPOTENCY_CONFLICT" });

    const minerId = (await store.miningStatus(userId)).miners[0]!.id;
    const minerKey = `miner-conflict-${crypto.randomUUID()}`;
    await store.mutateMiner({
      userId,
      minerId,
      type: "UPGRADE",
      configVersion: config.id,
      idempotencyKey: minerKey,
      context: commerceContext(),
    });
    await expect(
      store.mutateMiner({
        userId,
        minerId,
        type: "REPAIR",
        configVersion: config.id,
        idempotencyKey: minerKey,
        context: commerceContext(),
      }),
    ).rejects.toMatchObject({ code: "COMMERCE_IDEMPOTENCY_CONFLICT" });
    await expect(
      store.mutateMiner({
        userId,
        minerId,
        type: "UPGRADE",
        configVersion: config.id + 1,
        idempotencyKey: minerKey,
        context: commerceContext(),
      }),
    ).rejects.toMatchObject({ code: "COMMERCE_IDEMPOTENCY_CONFLICT" });
  });

  it("enforces full energy, refill limit, non-stacking boost, and four miner slots", async () => {
    const now = new Date("2027-07-12T14:00:00.000Z");
    const userId = await createFundedUser(10_000n, 10_000n);
    const store = new PrismaCommerceStore(database, () => new Date(now));
    const config = await activeCommerceConfig(database, now);
    await store.miningStatus(userId);

    await expect(
      store.purchase(
        purchaseInput(userId, "b1", config.id, `full-${crypto.randomUUID()}`),
      ),
    ).rejects.toMatchObject({
      code: "PRODUCT_LIMIT_REACHED",
      details: { reasonCode: "ENERGY_FULL" },
    });

    for (let index = 0; index < 3; index += 1) {
      await database.miningProfile.update({
        where: { userId },
        data: { energyCreditMillis: "0", lastCheckpointAt: now },
      });
      await store.purchase(
        purchaseInput(
          userId,
          "b1",
          config.id,
          `refill-${index}-${crypto.randomUUID()}`,
        ),
      );
    }
    await database.miningProfile.update({
      where: { userId },
      data: { energyCreditMillis: "0", lastCheckpointAt: now },
    });
    await expect(
      store.purchase(
        purchaseInput(
          userId,
          "b1",
          config.id,
          `refill-limit-${crypto.randomUUID()}`,
        ),
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_LIMIT_REACHED" });

    await store.purchase(
      purchaseInput(userId, "b2", config.id, `boost-${crypto.randomUUID()}`),
    );
    await expect(
      store.purchase(
        purchaseInput(
          userId,
          "b2",
          config.id,
          `boost-stack-${crypto.randomUUID()}`,
        ),
      ),
    ).rejects.toMatchObject({ code: "BOOST_ALREADY_ACTIVE" });

    for (let index = 0; index < 3; index += 1) {
      await store.purchase(
        purchaseInput(
          userId,
          "b6",
          config.id,
          `miner-${index}-${crypto.randomUUID()}`,
        ),
      );
    }
    await expect(
      store.purchase(
        purchaseInput(
          userId,
          "b6",
          config.id,
          `miner-full-${crypto.randomUUID()}`,
        ),
      ),
    ).rejects.toMatchObject({ code: "MINER_SLOTS_FULL" });
    await expect(
      database.userMiner.findMany({ where: { userId } }),
    ).resolves.toHaveLength(4);
  });

  it("serializes competing final refill, boost, and miner-slot purchases", async () => {
    const now = new Date("2027-07-12T15:00:00.000Z");
    const userId = await createFundedUser(25_000n, 25_000n);
    const store = new PrismaCommerceStore(database, () => new Date(now));
    const config = await activeCommerceConfig(database, now);
    await store.miningStatus(userId);

    for (let index = 0; index < 2; index += 1) {
      await database.miningProfile.update({
        where: { userId },
        data: { energyCreditMillis: "0", lastCheckpointAt: now },
      });
      await store.purchase(
        purchaseInput(
          userId,
          "b1",
          config.id,
          `refill-prime-${index}-${crypto.randomUUID()}`,
        ),
      );
    }
    await database.miningProfile.update({
      where: { userId },
      data: { energyCreditMillis: "0", lastCheckpointAt: now },
    });
    await expectOneWinner(
      [
        store.purchase(
          purchaseInput(
            userId,
            "b1",
            config.id,
            `refill-race-a-${crypto.randomUUID()}`,
          ),
        ),
        store.purchase(
          purchaseInput(
            userId,
            "b1",
            config.id,
            `refill-race-b-${crypto.randomUUID()}`,
          ),
        ),
      ],
      "PRODUCT_LIMIT_REACHED",
    );
    await expect(
      database.storePurchase.count({
        where: { userId, productId: "b1", status: "POSTED" },
      }),
    ).resolves.toBe(3);

    await expectOneWinner(
      [
        store.purchase(
          purchaseInput(
            userId,
            "b2",
            config.id,
            `boost-race-a-${crypto.randomUUID()}`,
          ),
        ),
        store.purchase(
          purchaseInput(
            userId,
            "b2",
            config.id,
            `boost-race-b-${crypto.randomUUID()}`,
          ),
        ),
      ],
      "BOOST_ALREADY_ACTIVE",
    );
    await expect(
      database.storePurchase.count({
        where: { userId, productId: "b2", status: "POSTED" },
      }),
    ).resolves.toBe(1);

    for (let index = 0; index < 2; index += 1) {
      await store.purchase(
        purchaseInput(
          userId,
          "b6",
          config.id,
          `miner-prime-${index}-${crypto.randomUUID()}`,
        ),
      );
    }
    await expectOneWinner(
      [
        store.purchase(
          purchaseInput(
            userId,
            "b6",
            config.id,
            `miner-race-a-${crypto.randomUUID()}`,
          ),
        ),
        store.purchase(
          purchaseInput(
            userId,
            "b6",
            config.id,
            `miner-race-b-${crypto.randomUUID()}`,
          ),
        ),
      ],
      "MINER_SLOTS_FULL",
    );
    await expect(
      database.userMiner.findMany({ where: { userId } }),
    ).resolves.toHaveLength(4);
  });

  it("checkpoints exactly across UTC midnight, boost expiry, and energy exhaustion", async () => {
    let now = new Date("2027-07-12T23:59:00.000Z");
    const userId = await createFundedUser(0n, 0n);
    const store = new PrismaCommerceStore(database, () => new Date(now));
    await store.miningStatus(userId);
    await database.miningProfile.update({
      where: { userId },
      data: {
        // Starter miner consumes 2 energy/hour, represented as energy*milliseconds.
        // This funds exactly 120 seconds of activity.
        energyCreditMillis: "240000",
        lastCheckpointAt: now,
        boostExpiresAt: new Date("2027-07-13T00:00:30.000Z"),
      },
    });

    now = new Date("2027-07-13T00:02:00.000Z");
    const status = await store.miningStatus(userId);
    const contributions = await database.miningContribution.findMany({
      where: { userId },
      orderBy: { periodDate: "asc" },
    });

    expect(
      contributions.map(({ periodDate, hashMillis }) => ({
        day: periodDate.toISOString().slice(0, 10),
        hashMillis: hashMillis.toFixed(0),
      })),
    ).toEqual([
      { day: "2027-07-12", hashMillis: "1728000000" },
      { day: "2027-07-13", hashMillis: "1440000000" },
    ]);
    expect(status.state).toBe("OUT_OF_ENERGY");
    expect(status.profile.energy.current).toBe(0);
    expect(status.profile.boost).toBeNull();

    await store.miningStatus(userId);
    const replayed = await database.miningContribution.findMany({
      where: { userId },
      orderBy: { periodDate: "asc" },
    });
    expect(replayed.map(({ hashMillis }) => hashMillis.toFixed(0))).toEqual([
      "1728000000",
      "1440000000",
    ]);
  });

  it("leaves no purchase, ledger transaction, or effect when funds are insufficient", async () => {
    const now = new Date("2027-07-12T15:30:00.000Z");
    const userId = await createFundedUser(50n, 0n);
    const store = new PrismaCommerceStore(database, () => new Date(now));
    const config = await activeCommerceConfig(database, now);
    const key = `insufficient-${crypto.randomUUID()}`;
    await store.miningStatus(userId);
    await expect(
      store.purchase(purchaseInput(userId, "b2", config.id, key)),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PURCHASE_FUNDS" });

    const [purchases, transaction, profile, promotional] = await Promise.all([
      database.storePurchase.findMany({ where: { userId } }),
      database.ledgerTransaction.findUnique({
        where: { idempotencyKey: `store:${userId}:${key}` },
      }),
      database.miningProfile.findUniqueOrThrow({ where: { userId } }),
      balanceFor(userId, "PROMOTIONAL"),
    ]);
    expect(purchases).toHaveLength(0);
    expect(transaction).toBeNull();
    expect(profile.repairKitCount).toBe(0);
    expect(promotional).toBe(50n);
  });

  it("repairs with one inventory kit at zero cost and replays without consuming twice", async () => {
    const now = new Date("2027-07-12T15:45:00.000Z");
    const userId = await createFundedUser(120n, 0n);
    const store = new PrismaCommerceStore(database, () => new Date(now));
    const config = await activeCommerceConfig(database, now);
    const mining = await store.miningStatus(userId);
    const minerId = mining.miners[0]!.id;
    const fullCatalog = await store.catalog(userId);
    expect(fullCatalog.products.find(({ id }) => id === "b4")).toMatchObject({
      enabled: false,
      lockedReason: "NO_REPAIR_NEEDED",
    });
    await database.userMiner.update({
      where: { id: minerId },
      data: { durabilityBps: 5_000 },
    });
    await store.purchase(
      purchaseInput(userId, "b4", config.id, `kit-${crypto.randomUUID()}`),
    );
    const key = `kit-repair-${crypto.randomUUID()}`;
    const input = {
      userId,
      minerId,
      type: "REPAIR" as const,
      configVersion: config.id,
      idempotencyKey: key,
      context: commerceContext(),
    };

    const first = await store.mutateMiner(input);
    const replay = await store.mutateMiner(input);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.action).toEqual(first.action);
    expect(first.action).toMatchObject({
      type: "REPAIR",
      status: "POSTED",
      costMinorUnits: "0",
      transactionId: null,
      payment: {
        availableMinorUnits: "0",
        promotionalMinorUnits: "0",
      },
      split: {
        burnMinorUnits: "0",
        recycleMinorUnits: "0",
        treasuryMinorUnits: "0",
      },
    });
    const [profile, miner, actions] = await Promise.all([
      database.miningProfile.findUniqueOrThrow({ where: { userId } }),
      database.userMiner.findUniqueOrThrow({ where: { id: minerId } }),
      database.minerAction.findMany({ where: { userId, minerId } }),
    ]);
    expect(profile.repairKitCount).toBe(0);
    expect(miner.durabilityBps).toBe(10_000);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ costMinor: expect.anything() });
    expect(actions[0]!.costMinor.toFixed(0)).toBe("0");
    expect(actions[0]!.transactionId).toBeNull();
  });

  it("settles concurrent workers once with exact floor payouts and residue", async () => {
    const fixture = await createSettlementFixture(100, [
      { hashMillis: 1n },
      { hashMillis: 2n },
      { hashMillis: 3n },
    ]);
    const settlement = new PrismaMiningSettlement(database, fixture.clock);

    const results = await Promise.all([
      settlement.settle(fixture.periodDate),
      settlement.settle(fixture.periodDate),
    ]);

    expect(results.map(({ replayed }) => replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect(results[0]).toMatchObject({
      status: "SETTLED",
      distributableMinorUnits: "100",
      allocatedMinorUnits: "99",
      residueMinorUnits: "1",
      totalHashMillis: "6",
      payoutCount: 3,
      transactionId: expect.any(String),
    });
    const [payouts, transactions] = await Promise.all([
      database.miningPayout.findMany({
        where: { periodDate: fixture.periodDate },
        orderBy: { userId: "asc" },
      }),
      database.ledgerTransaction.findMany({
        where: {
          sourceType: "mining_epoch",
          sourceId: fixture.periodKey,
        },
        include: { postings: true },
      }),
    ]);
    const payoutByUser = new Map(
      payouts.map(({ userId, rewardMinor }) => [
        userId,
        rewardMinor.toFixed(0),
      ]),
    );
    expect(fixture.users.map(({ userId }) => payoutByUser.get(userId))).toEqual(
      ["16", "33", "50"],
    );
    expect(payouts.every(({ status }) => status === "POSTED")).toBe(true);
    expect(transactions).toHaveLength(1);
    expect(
      transactions[0]!.postings.reduce(
        (sum, posting) => sum + BigInt(posting.amount.toFixed(0)),
        0n,
      ),
    ).toBe(0n);
    expect(
      payouts.reduce(
        (sum, payout) => sum + BigInt(payout.rewardMinor.toFixed(0)),
        0n,
      ) + 1n,
    ).toBe(100n);
    await expect(
      Promise.all(
        fixture.users.map(({ userId }) => balanceFor(userId, "AVAILABLE")),
      ),
    ).resolves.toEqual([16n, 33n, 50n]);
  });

  it("blocks an underfunded epoch without a partial payout or ledger debit", async () => {
    const poolBefore = await miningPoolBalance();
    expect(poolBefore < BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    const distributable = Number(poolBefore + 1n);
    const fixture = await createSettlementFixture(distributable, [
      { hashMillis: 1n },
    ]);
    const result = await new PrismaMiningSettlement(
      database,
      fixture.clock,
    ).settle(fixture.periodDate);

    expect(result).toMatchObject({
      status: "BLOCKED",
      reasonCode: "MINING_POOL_INSUFFICIENT",
      allocatedMinorUnits: "0",
      residueMinorUnits: String(distributable),
      payoutCount: 0,
      transactionId: null,
    });
    const [payouts, transactions, poolAfter, available] = await Promise.all([
      database.miningPayout.findMany({
        where: { periodDate: fixture.periodDate },
      }),
      database.ledgerTransaction.findMany({
        where: {
          sourceType: "mining_epoch",
          sourceId: fixture.periodKey,
        },
      }),
      miningPoolBalance(),
      balanceFor(fixture.users[0]!.userId, "AVAILABLE"),
    ]);
    expect(payouts).toHaveLength(0);
    expect(transactions).toHaveLength(0);
    expect(poolAfter).toBe(poolBefore);
    expect(available).toBe(0n);
  });

  it("settles zero activity without a debit and rejects an open UTC period", async () => {
    const fixture = await createSettlementFixture(100, []);
    const poolBefore = await miningPoolBalance();
    const settlement = new PrismaMiningSettlement(database, fixture.clock);
    const result = await settlement.settle(fixture.periodDate);

    expect(result).toMatchObject({
      status: "SETTLED",
      reasonCode: "NO_ACTIVITY",
      allocatedMinorUnits: "0",
      residueMinorUnits: "100",
      totalHashMillis: "0",
      payoutCount: 0,
      transactionId: null,
      replayed: false,
    });
    await expect(settlement.settle(fixture.periodDate)).resolves.toMatchObject({
      status: "SETTLED",
      transactionId: null,
      replayed: true,
    });
    expect(await miningPoolBalance()).toBe(poolBefore);
    await expect(
      settlement.settle(new Date(fixture.clock().toISOString().slice(0, 10))),
    ).rejects.toMatchObject({ code: "MINING_PERIOD_NOT_CLOSED" });
  });

  it("keeps suspended and high-risk weight in the denominator without paying it", async () => {
    const fixture = await createSettlementFixture(100, [
      { hashMillis: 1n },
      { hashMillis: 1n, status: "SUSPENDED" },
      { hashMillis: 1n, riskLevel: 100 },
    ]);
    const result = await new PrismaMiningSettlement(
      database,
      fixture.clock,
    ).settle(fixture.periodDate);
    const payouts = await database.miningPayout.findMany({
      where: { periodDate: fixture.periodDate },
    });

    expect(result).toMatchObject({
      status: "SETTLED",
      allocatedMinorUnits: "33",
      residueMinorUnits: "67",
      totalHashMillis: "3",
      payoutCount: 1,
    });
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({ userId: fixture.users[0]!.userId });
    expect(payouts[0]!.rewardMinor.toFixed(0)).toBe("33");
    await expect(
      Promise.all(
        fixture.users.map(({ userId }) => balanceFor(userId, "AVAILABLE")),
      ),
    ).resolves.toEqual([33n, 0n, 0n]);
  });

  it("reverses an epoch and every payout projection without silently resettling", async () => {
    const fixture = await createSettlementFixture(100, [
      { hashMillis: 1n },
      { hashMillis: 1n },
    ]);
    const poolBefore = await miningPoolBalance();
    const settlement = new PrismaMiningSettlement(database, fixture.clock);
    const settled = await settlement.settle(fixture.periodDate);
    expect(settled.transactionId).toEqual(expect.any(String));

    await new PrismaLedgerStore(database).reverse({
      transactionId: settled.transactionId!,
      idempotencyKey: `reverse-epoch-${crypto.randomUUID()}`,
      metadata: { reason: "Adversarial integration test" },
    });

    const [epoch, payouts, original, replay] = await Promise.all([
      database.miningEpoch.findUniqueOrThrow({
        where: { periodDate: fixture.periodDate },
      }),
      database.miningPayout.findMany({
        where: { periodDate: fixture.periodDate },
      }),
      database.ledgerTransaction.findUniqueOrThrow({
        where: { id: settled.transactionId! },
      }),
      settlement.settle(fixture.periodDate),
    ]);
    expect(epoch).toMatchObject({
      status: "REVERSED",
      reasonCode: "PAYOUT_REVERSED",
      transactionId: settled.transactionId,
    });
    expect(
      payouts.every(
        ({ status, reversedAt }) => status === "REVERSED" && reversedAt,
      ),
    ).toBe(true);
    expect(original).toMatchObject({
      status: "REVERSED",
      reversedById: expect.any(String),
    });
    expect(replay).toMatchObject({
      status: "REVERSED",
      transactionId: settled.transactionId,
      replayed: true,
    });
    await expect(
      Promise.all(
        fixture.users.map(({ userId }) => balanceFor(userId, "AVAILABLE")),
      ),
    ).resolves.toEqual([0n, 0n]);
    expect(await miningPoolBalance()).toBe(poolBefore);
  });

  it("blocks generic reversal of purchases whose effect cannot be atomically undone", async () => {
    const now = new Date("2027-07-12T16:00:00.000Z");
    const userId = await createFundedUser(0n, 1_000n);
    const store = new PrismaCommerceStore(database, () => new Date(now));
    const config = await activeCommerceConfig(database, now);
    await damageStarter(store, userId);
    const purchase = await store.purchase(
      purchaseInput(userId, "b4", config.id, `reverse-${crypto.randomUUID()}`),
    );

    const ledger = new PrismaLedgerStore(database);
    const purchaseReversalKey = `reverse-store-${crypto.randomUUID()}`;
    await expect(
      ledger.reverse({
        transactionId: purchase.purchase.transactionId,
        idempotencyKey: purchaseReversalKey,
        metadata: {
          reason: "Adversarial integration test",
          actorId: "integration-test",
        },
      }),
    ).rejects.toBeInstanceOf(LedgerReversalError);

    await expect(
      database.miningProfile.findUniqueOrThrow({ where: { userId } }),
    ).resolves.toMatchObject({ repairKitCount: 1 });
    await expect(
      database.ledgerTransaction.findUniqueOrThrow({
        where: { id: purchase.purchase.transactionId },
      }),
    ).resolves.toMatchObject({ status: "POSTED", reversedById: null });
    await expect(
      database.ledgerTransaction.findUnique({
        where: { idempotencyKey: purchaseReversalKey },
      }),
    ).resolves.toBeNull();

    const mining = await store.miningStatus(userId);
    const minerId = mining.miners[0]!.id;
    const action = await store.mutateMiner({
      userId,
      minerId,
      type: "UPGRADE",
      configVersion: config.id,
      idempotencyKey: `upgrade-${crypto.randomUUID()}`,
      context: commerceContext(),
    });
    const actionReversalKey = `reverse-miner-${crypto.randomUUID()}`;
    await expect(
      ledger.reverse({
        transactionId: action.action.transactionId!,
        idempotencyKey: actionReversalKey,
        metadata: {
          reason: "Adversarial integration test",
          actorId: "integration-test",
        },
      }),
    ).rejects.toBeInstanceOf(LedgerReversalError);
    await expect(
      database.userMiner.findUniqueOrThrow({ where: { id: minerId } }),
    ).resolves.toMatchObject({ level: 2 });
    await expect(
      database.ledgerTransaction.findUniqueOrThrow({
        where: { id: action.action.transactionId! },
      }),
    ).resolves.toMatchObject({ status: "POSTED", reversedById: null });
    await expect(
      database.ledgerTransaction.findUnique({
        where: { idempotencyKey: actionReversalKey },
      }),
    ).resolves.toBeNull();
  });

  async function createFundedUser(
    promotional: bigint,
    available: bigint,
  ): Promise<string> {
    const identity = crypto.randomUUID();
    const user = await database.user.create({
      data: {
        email: `commerce-${identity}@fauzet.local`,
        passwordHash: "integration-only",
        displayName: "Commerce Integration",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        acceptedTermsAt: new Date(),
        adultDeclaredAt: new Date(),
        accounts: {
          create: [
            {
              code: `user:${identity}:zyxe:available`,
              name: "Integration available",
              kind: "LIABILITY",
              asset: "ZYXE",
              bucket: "AVAILABLE",
            },
            {
              code: `user:${identity}:zyxe:promotional`,
              name: "Integration promotional",
              kind: "LIABILITY",
              asset: "ZYXE",
              bucket: "PROMOTIONAL",
            },
          ],
        },
      },
      include: { accounts: true },
    });
    const total = promotional + available;
    if (total === 0n) return user.id;
    const issuance = await database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:issuance" },
    });
    const promotionalAccount = user.accounts.find(
      ({ bucket }) => bucket === "PROMOTIONAL",
    )!;
    const availableAccount = user.accounts.find(
      ({ bucket }) => bucket === "AVAILABLE",
    )!;
    await new PrismaLedgerStore(database).post({
      idempotencyKey: `integration:commerce-fund:${user.id}`,
      type: "INTEGRATION_COMMERCE_FUND",
      sourceType: "integration_test",
      sourceId: user.id,
      configVersion: (await activeCommerceConfig(database, new Date())).id,
      metadata: { integration: true },
      postings: [
        { account: accountRef(issuance), amount: -total },
        ...(promotional > 0n
          ? [
              {
                account: accountRef(promotionalAccount),
                amount: promotional,
              },
            ]
          : []),
        ...(available > 0n
          ? [{ account: accountRef(availableAccount), amount: available }]
          : []),
      ],
    });
    return user.id;
  }

  async function balanceFor(
    userId: string,
    bucket: "AVAILABLE" | "PROMOTIONAL",
  ) {
    const account = await database.ledgerAccount.findFirstOrThrow({
      where: { userId, asset: "ZYXE", bucket },
    });
    const total = await database.ledgerPosting.aggregate({
      where: { accountId: account.id },
      _sum: { amount: true },
    });
    return BigInt(total._sum.amount?.toFixed(0) ?? "0");
  }

  async function damageStarter(
    store: PrismaCommerceStore,
    userId: string,
    durabilityBps = 5_000,
  ) {
    const minerId = (await store.miningStatus(userId)).miners[0]!.id;
    await database.userMiner.update({
      where: { id: minerId },
      data: { durabilityBps },
    });
    return minerId;
  }

  async function createSettlementFixture(
    dailyPoolMinor: number,
    contributors: Array<{
      hashMillis: bigint;
      status?: "ACTIVE" | "SUSPENDED";
      riskLevel?: number;
    }>,
  ) {
    const periodDate = await unusedPeriodDate();
    const configVersion = await createHistoricalCommerceConfig(
      dailyPoolMinor,
      periodDate,
    );
    await database.miningEpoch.create({
      data: {
        periodDate,
        status: "OPEN",
        ruleVersion: configVersion,
        configuredMinor: String(dailyPoolMinor),
        distributableMinor: String(dailyPoolMinor),
        allocatedMinor: "0",
        residueMinor: String(dailyPoolMinor),
        totalHashMillis: "0",
      },
    });
    const users: Array<{ userId: string; hashMillis: bigint }> = [];
    for (const contributor of contributors) {
      const userId = await createFundedUser(0n, 0n);
      if (contributor.status || contributor.riskLevel !== undefined) {
        await database.user.update({
          where: { id: userId },
          data: {
            ...(contributor.status ? { status: contributor.status } : {}),
            ...(contributor.riskLevel !== undefined
              ? { riskLevel: contributor.riskLevel }
              : {}),
          },
        });
      }
      users.push({ userId, hashMillis: contributor.hashMillis });
    }
    if (users.length > 0) {
      await database.miningContribution.createMany({
        data: users.map(({ userId, hashMillis }) => ({
          userId,
          periodDate,
          hashMillis: hashMillis.toString(),
        })),
      });
    }
    return {
      periodDate,
      periodKey: periodDate.toISOString().slice(0, 10),
      configVersion,
      users,
      clock: () => new Date(periodDate.getTime() + 3 * 86_400_000),
    };
  }

  async function createHistoricalCommerceConfig(
    dailyPoolMinor: number,
    effectiveAt: Date,
  ) {
    const source = await database.economicConfigVersion.findFirstOrThrow({
      where: { status: "ACTIVE" },
      orderBy: { id: "desc" },
    });
    const parameters = structuredClone(source.parameters);
    if (!isRecord(parameters) || !isRecord(parameters.mining)) {
      throw new Error("Active integration config has no mining parameters");
    }
    parameters.mining.dailyPoolMinor = dailyPoolMinor;
    const config = await database.economicConfigVersion.create({
      data: {
        status: "SUPERSEDED",
        parameters: parameters as Prisma.InputJsonValue,
        reason: "Adversarial mining settlement fixture",
        createdById: "integration-test",
        effectiveAt,
      },
    });
    return config.id;
  }

  async function unusedPeriodDate() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const randomDays =
        Number.parseInt(crypto.randomUUID().slice(0, 8), 16) % (20 * 365);
      const candidate = new Date(
        Date.UTC(1995, 0, 1) + randomDays * 86_400_000,
      );
      if (
        !(await database.miningEpoch.findUnique({
          where: { periodDate: candidate },
        }))
      ) {
        return candidate;
      }
    }
    throw new Error("Could not allocate an unused UTC mining period");
  }

  async function miningPoolBalance() {
    const pool = await database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:mining-reward-pool" },
    });
    const result = await database.ledgerPosting.aggregate({
      where: {
        accountId: pool.id,
        transaction: { status: { in: ["POSTED", "REVERSED"] } },
      },
      _sum: { amount: true },
    });
    return BigInt(result._sum.amount?.toFixed(0) ?? "0");
  }
});

function purchaseInput(
  userId: string,
  productId: string,
  configVersion: number,
  idempotencyKey: string,
) {
  return {
    userId,
    productId,
    configVersion,
    idempotencyKey,
    context: commerceContext(),
  };
}

function commerceContext() {
  return {
    ipHash: `integration-${crypto.randomUUID()}`,
    deviceId: crypto.randomUUID(),
  };
}

async function expectOneWinner<T>(
  attempts: [Promise<T>, Promise<T>],
  rejectedCode: string,
) {
  const outcomes = await Promise.allSettled(attempts);
  expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1,
  );
  const rejected = outcomes.find(({ status }) => status === "rejected");
  expect(rejected).toMatchObject({
    status: "rejected",
    reason: { code: rejectedCode },
  });
}

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
