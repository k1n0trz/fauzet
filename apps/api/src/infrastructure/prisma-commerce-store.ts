import { randomUUID } from "node:crypto";
import type {
  MinerActionResponse,
  MiningStatusResponse,
  StoreCatalogResponse,
  StorePurchaseResponse,
} from "@fauzet/contracts";
import {
  getDatabase,
  Prisma,
  type LedgerAccountKind,
  type PrismaClient,
} from "@fauzet/database";
import { z } from "zod";
import { CommerceError, type CommerceStore } from "../domain/commerce.js";
import { LedgerInsufficientBalanceError } from "../domain/ledger-posting.js";
import { postLedgerTransactionInTransaction } from "./prisma-ledger-store.js";

const productSchema = z.object({
  id: z.enum(["b1", "b2", "b3", "b4", "b5", "b6"]),
  kind: z.enum([
    "ENERGY_REFILL",
    "HASH_BOOST",
    "LOCKED",
    "REPAIR_KIT",
    "MINER",
  ]),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(["UTILITY", "BOOST", "PREMIUM", "MINER"]),
  enabled: z.boolean(),
  priceMinor: z.number().int().positive().safe(),
  lockedReason: z.string().optional(),
});
const minerTemplateSchema = z.object({
  modelId: z.string().min(1),
  name: z.string().min(1),
  tier: z.string().min(1),
  hashRate: z.number().int().positive().safe(),
  energyPerHour: z.number().int().positive().safe(),
  efficiencyBps: z.number().int().min(1).max(10_000),
  upgradeBaseMinor: z.number().int().positive().safe(),
});
const commerceParametersSchema = z
  .object({
    store: z.object({
      enabled: z.boolean(),
      maxRiskLevel: z.number().int().min(0).max(100),
      split: z.object({
        burnBps: z.literal(4000),
        recycleBps: z.literal(4000),
        treasuryBps: z.literal(2000),
      }),
      products: z.array(productSchema).length(6),
    }),
    mining: z.object({
      enabled: z.boolean(),
      maxRiskLevel: z.number().int().min(0).max(100),
      maxSlots: z.literal(4),
      maxEnergy: z.literal(100),
      initialEnergy: z.number().int().min(0).max(100),
      refillMaxPerDay: z.literal(3),
      boostMultiplierBps: z.literal(15000),
      boostDurationSeconds: z.literal(21600),
      dailyPoolMinor: z.number().int().positive().safe(),
      maxLevel: z.number().int().min(2).max(100),
      upgradeCostMultiplierBps: z.number().int().min(10001).max(50000),
      upgradeHashMultiplierBps: z.number().int().min(10001).max(50000),
      repairBaseMinor: z.number().int().positive().safe(),
      starter: minerTemplateSchema,
      nova: minerTemplateSchema,
    }),
  })
  .passthrough();

export type CommerceConfig = z.infer<typeof commerceParametersSchema>;
export interface LoadedCommerceConfig extends CommerceConfig {
  id: number;
  effectiveAt: Date | null;
}
type Tx = Prisma.TransactionClient;
type Product = z.infer<typeof productSchema>;

export class PrismaCommerceStore implements CommerceStore {
  constructor(
    private readonly database: PrismaClient = getDatabase(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async catalog(userId: string): Promise<StoreCatalogResponse> {
    return this.withRetry(async (tx) => {
      const now = this.clock();
      const user = await eligibleUser(tx, userId, true);
      const config = await activeCommerceConfig(tx, now);
      const state = await ensureAndCheckpoint(
        tx,
        userId,
        config,
        now,
        user.riskLevel,
      );
      return catalogView(tx, userId, config, state, now, user.riskLevel);
    });
  }

  async miningStatus(userId: string): Promise<MiningStatusResponse> {
    return this.withRetry(async (tx) => {
      const now = this.clock();
      const user = await eligibleUser(tx, userId, true);
      const config = await activeCommerceConfig(tx, now);
      const state = await ensureAndCheckpoint(
        tx,
        userId,
        config,
        now,
        user.riskLevel,
      );
      return miningView(tx, userId, config, state, now, user.riskLevel);
    });
  }

  async purchase(input: {
    userId: string;
    productId: string;
    configVersion: number;
    idempotencyKey: string;
    context: { ipHash: string; deviceId?: string };
  }): Promise<StorePurchaseResponse> {
    const scoped = `store:${input.userId}:${input.idempotencyKey}`;
    try {
      return await this.withRetry(async (tx) => {
        const existing = await tx.storePurchase.findUnique({
          where: { idempotencyKey: scoped },
        });
        if (existing) {
          if (
            existing.userId !== input.userId ||
            existing.productId !== input.productId ||
            existing.ruleVersion !== input.configVersion
          )
            throw idempotencyConflict();
          return purchaseResult(tx, existing, true, this.clock());
        }
        const now = this.clock();
        const user = await eligibleUser(tx, input.userId, true);
        const config = await activeCommerceConfig(tx, now);
        validateMutationConfig(input.configVersion, config.id);
        assertCommerceEnabled(config, user.riskLevel);
        const state = await ensureAndCheckpoint(
          tx,
          input.userId,
          config,
          now,
          user.riskLevel,
        );
        const product = config.store.products.find(
          ({ id }) => id === input.productId,
        );
        if (!product)
          throw new CommerceError(
            "PRODUCT_NOT_FOUND",
            "Product was not found",
            404,
          );
        const effect = await validateProduct(
          tx,
          input.userId,
          product,
          config,
          state,
          now,
        );
        const purchaseId = randomUUID();
        const charge = await chargeSpend(tx, {
          userId: input.userId,
          amount: BigInt(product.priceMinor),
          sourceType: "store_purchase",
          sourceId: purchaseId,
          idempotencyKey: scoped,
          transactionType: "STORE_PURCHASE",
          config,
          metadata: {
            productId: product.id,
            ipHash: input.context.ipHash,
            deviceId: input.context.deviceId ?? null,
          },
        });
        const purchase = await tx.storePurchase.create({
          data: {
            id: purchaseId,
            userId: input.userId,
            productId: product.id,
            idempotencyKey: scoped,
            status: "POSTED",
            priceMinor: String(product.priceMinor),
            availableDebitMinor: charge.available.toString(),
            promotionalDebitMinor: charge.promotional.toString(),
            burnMinor: charge.burn.toString(),
            recycleMinor: charge.recycle.toString(),
            treasuryMinor: charge.treasury.toString(),
            effectType: product.kind,
            effectRef: effect.refId,
            evidence: toJson({ ...effect, configVersion: config.id }),
            ruleVersion: config.id,
            periodDate: utcDay(now),
            transactionId: charge.transactionId,
            postedAt: now,
          },
        });
        await applyProduct(
          tx,
          input.userId,
          purchase.id,
          product,
          config,
          state,
          effect,
          now,
        );
        return purchaseResult(tx, purchase, false, now);
      });
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        const existing = await this.database.storePurchase.findUnique({
          where: { idempotencyKey: scoped },
        });
        if (
          existing &&
          existing.userId === input.userId &&
          existing.productId === input.productId &&
          existing.ruleVersion === input.configVersion
        )
          return purchaseResult(this.database, existing, true, this.clock());
        throw idempotencyConflict();
      }
      throw error;
    }
  }

  async mutateMiner(input: {
    userId: string;
    minerId: string;
    type: "UPGRADE" | "REPAIR";
    configVersion: number;
    idempotencyKey: string;
    context: { ipHash: string; deviceId?: string };
  }): Promise<MinerActionResponse> {
    const scoped = `miner:${input.userId}:${input.idempotencyKey}`;
    try {
      return await this.withRetry(async (tx) => {
        const existing = await tx.minerAction.findUnique({
          where: { idempotencyKey: scoped },
        });
        if (existing) {
          if (
            existing.userId !== input.userId ||
            existing.minerId !== input.minerId ||
            existing.kind !== input.type ||
            existing.ruleVersion !== input.configVersion
          )
            throw idempotencyConflict();
          return actionResult(tx, existing, true, this.clock());
        }
        const now = this.clock();
        const user = await eligibleUser(tx, input.userId, true);
        const config = await activeCommerceConfig(tx, now);
        validateMutationConfig(input.configVersion, config.id);
        assertCommerceEnabled(config, user.riskLevel);
        const state = await ensureAndCheckpoint(
          tx,
          input.userId,
          config,
          now,
          user.riskLevel,
        );
        const miner = state.miners.find(({ id }) => id === input.minerId);
        if (!miner)
          throw new CommerceError(
            "MINER_NOT_FOUND",
            "Miner was not found",
            404,
          );
        const actionId = randomUUID();
        const before = {
          level: miner.level,
          durability: miner.durabilityBps,
          hashRate: miner.hashRate,
        };
        let cost = 0n;
        let transactionId: string | null = null;
        let after = before;
        let formula: Record<string, string | number | boolean>;
        if (input.type === "UPGRADE") {
          if (miner.level >= config.mining.maxLevel)
            throw new CommerceError(
              "MINER_MAX_LEVEL",
              "Miner is at maximum level",
              409,
            );
          cost = upgradePrice(miner, config);
          const nextHash = Math.ceil(
            (miner.hashRate * config.mining.upgradeHashMultiplierBps) / 10_000,
          );
          const charge = await chargeSpend(tx, {
            userId: input.userId,
            amount: cost,
            sourceType: "miner_action",
            sourceId: actionId,
            idempotencyKey: scoped,
            transactionType: "MINER_UPGRADE",
            config,
            metadata: {
              minerId: miner.id,
              levelBefore: miner.level,
              levelAfter: miner.level + 1,
              ipHash: input.context.ipHash,
            },
          });
          transactionId = charge.transactionId;
          after = {
            level: miner.level + 1,
            durability: miner.durabilityBps,
            hashRate: nextHash,
          };
          formula = {
            baseMinor: templateFor(miner.modelId, config).upgradeBaseMinor,
            multiplierBps: config.mining.upgradeCostMultiplierBps,
            hashMultiplierBps: config.mining.upgradeHashMultiplierBps,
          };
          await tx.userMiner.update({
            where: { id: miner.id },
            data: {
              level: after.level,
              hashRate: after.hashRate,
              ruleVersion: config.id,
            },
          });
        } else {
          if (miner.durabilityBps >= 10_000)
            throw new CommerceError(
              "MINER_REPAIR_NOT_NEEDED",
              "Miner does not need repair",
              409,
            );
          const usesKit = state.profile.repairKitCount > 0;
          if (usesKit) {
            await tx.miningProfile.update({
              where: { userId: input.userId },
              data: { repairKitCount: { decrement: 1 } },
            });
          } else {
            cost = roundUpFive(
              BigInt(
                Math.ceil(
                  (config.mining.repairBaseMinor *
                    (10_000 - miner.durabilityBps)) /
                    10_000,
                ),
              ),
            );
            const charge = await chargeSpend(tx, {
              userId: input.userId,
              amount: cost,
              sourceType: "miner_action",
              sourceId: actionId,
              idempotencyKey: scoped,
              transactionType: "MINER_REPAIR",
              config,
              metadata: {
                minerId: miner.id,
                durabilityBefore: miner.durabilityBps,
                ipHash: input.context.ipHash,
              },
            });
            transactionId = charge.transactionId;
          }
          after = {
            level: miner.level,
            durability: 10_000,
            hashRate: miner.hashRate,
          };
          formula = {
            repairBaseMinor: config.mining.repairBaseMinor,
            missingDurabilityBps: 10_000 - miner.durabilityBps,
            usesKit,
          };
          await tx.userMiner.update({
            where: { id: miner.id },
            data: { durabilityBps: 10_000, ruleVersion: config.id },
          });
        }
        const action = await tx.minerAction.create({
          data: {
            id: actionId,
            userId: input.userId,
            minerId: miner.id,
            kind: input.type,
            idempotencyKey: scoped,
            status: "POSTED",
            costMinor: cost.toString(),
            levelBefore: before.level,
            levelAfter: after.level,
            durabilityBefore: before.durability,
            durabilityAfter: after.durability,
            formula: toJson(formula),
            ruleVersion: config.id,
            transactionId,
            postedAt: now,
          },
        });
        return actionResult(tx, action, false, now);
      });
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        const existing = await this.database.minerAction.findUnique({
          where: { idempotencyKey: scoped },
        });
        if (
          existing &&
          existing.userId === input.userId &&
          existing.minerId === input.minerId &&
          existing.kind === input.type &&
          existing.ruleVersion === input.configVersion
        )
          return actionResult(this.database, existing, true, this.clock());
        throw idempotencyConflict();
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
        if (isSerialization(error) && attempt < 2) continue;
        if (isSerialization(error))
          throw new CommerceError(
            "COMMERCE_BUSY",
            "Commerce state is busy; retry idempotently",
            503,
          );
        throw error;
      }
    }
    throw new CommerceError(
      "COMMERCE_BUSY",
      "Commerce state is busy; retry idempotently",
      503,
    );
  }
}

export async function activeCommerceConfig(
  client: PrismaClient | Tx,
  now: Date,
): Promise<LoadedCommerceConfig> {
  const row = await client.economicConfigVersion.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }],
    },
    orderBy: { id: "desc" },
  });
  if (!row) throw configError();
  const parsed = commerceParametersSchema.safeParse(row.parameters);
  if (!parsed.success) throw configError();
  const ids = parsed.data.store.products.map(({ id }) => id);
  if (
    new Set(ids).size !== 6 ||
    parsed.data.store.split.burnBps +
      parsed.data.store.split.recycleBps +
      parsed.data.store.split.treasuryBps !==
      10_000
  )
    throw configError();
  return { id: row.id, effectiveAt: row.effectiveAt, ...parsed.data };
}

export async function ensureAndCheckpoint(
  tx: Tx,
  userId: string,
  config: LoadedCommerceConfig,
  now: Date,
  riskLevel: number,
) {
  let profile = await tx.miningProfile.findUnique({ where: { userId } });
  if (!profile) {
    profile = await tx.miningProfile.create({
      data: {
        userId,
        energyCreditMillis: energyCredit(
          config.mining.initialEnergy,
        ).toString(),
        lastCheckpointAt: now,
        ruleVersion: config.id,
      },
    });
    await tx.userMiner.create({
      data: {
        userId,
        slot: 1,
        ...minerData(config.mining.starter),
        durabilityBps: 10_000,
        status: "ACTIVE",
        level: 1,
        ruleVersion: config.id,
      },
    });
  }
  await tx.$queryRaw(
    Prisma.sql`SELECT "userId" FROM "MiningProfile" WHERE "userId" = ${userId} FOR UPDATE`,
  );
  profile = await tx.miningProfile.findUniqueOrThrow({ where: { userId } });
  let miners = await tx.userMiner.findMany({
    where: { userId },
    orderBy: { slot: "asc" },
  });
  if (now > profile.lastCheckpointAt) {
    let cursor = profile.lastCheckpointAt;
    let energy = BigInt(profile.energyCreditMillis.toFixed(0));
    let segmentConfig =
      profile.ruleVersion === config.id
        ? config
        : await commerceConfigById(tx, profile.ruleVersion);
    const transitionRows = await tx.economicConfigVersion.findMany({
      where: {
        id: { not: profile.ruleVersion },
        status: { in: ["ACTIVE", "SUPERSEDED"] },
        effectiveAt: { gt: profile.lastCheckpointAt, lte: now },
      },
      select: { id: true, effectiveAt: true },
      orderBy: { effectiveAt: "asc" },
    });
    const transitions: Array<{ at: Date; config: LoadedCommerceConfig }> = [];
    for (const row of transitionRows) {
      if (row.effectiveAt)
        transitions.push({
          at: row.effectiveAt,
          config: await commerceConfigById(tx, row.id),
        });
    }
    if (
      segmentConfig.id !== config.id &&
      !transitions.some(({ config: candidate }) => candidate.id === config.id)
    ) {
      transitions.push({
        at:
          config.effectiveAt && config.effectiveAt > profile.lastCheckpointAt
            ? config.effectiveAt
            : profile.lastCheckpointAt,
        config,
      });
      transitions.sort((left, right) => left.at.getTime() - right.at.getTime());
    }
    let transitionIndex = 0;
    while (cursor < now) {
      while (
        transitions[transitionIndex] &&
        transitions[transitionIndex]!.at <= cursor
      ) {
        segmentConfig = transitions[transitionIndex]!.config;
        transitionIndex += 1;
      }
      const midnight = nextUtcDay(cursor);
      const boostBoundary =
        profile.boostExpiresAt && profile.boostExpiresAt > cursor
          ? profile.boostExpiresAt
          : null;
      const boundary = new Date(
        Math.min(
          now.getTime(),
          midnight.getTime(),
          boostBoundary?.getTime() ?? Number.POSITIVE_INFINITY,
          transitions[transitionIndex]?.at.getTime() ??
            Number.POSITIVE_INFINITY,
        ),
      );
      const duration = boundary.getTime() - cursor.getTime();
      const active = miners.filter(
        (miner) => miner.status === "ACTIVE" && miner.durabilityBps > 0,
      );
      const rate = active.reduce(
        (sum, miner) => sum + BigInt(miner.energyPerHour),
        0n,
      );
      const possibleMs = rate > 0n ? energy / rate : BigInt(duration);
      const enabled =
        segmentConfig.mining.enabled &&
        riskLevel <= segmentConfig.mining.maxRiskLevel;
      const activeMs = enabled
        ? Number(possibleMs < BigInt(duration) ? possibleMs : BigInt(duration))
        : 0;
      if (activeMs > 0 && rate > 0n) {
        const baseHashMilli = active.reduce(
          (sum, miner) =>
            sum +
            (BigInt(miner.hashRate) *
              1000n *
              BigInt(miner.efficiencyBps) *
              BigInt(miner.durabilityBps)) /
              100_000_000n,
          0n,
        );
        const boosted =
          profile.boostExpiresAt && cursor < profile.boostExpiresAt;
        const multiplier = BigInt(
          boosted ? segmentConfig.mining.boostMultiplierBps : 10_000,
        );
        const weight =
          (baseHashMilli * BigInt(activeMs) * multiplier) / 10_000n;
        const day = utcDay(cursor);
        const epoch = await ensureEpoch(tx, day, segmentConfig);
        if (epoch.status !== "OPEN")
          throw new CommerceError(
            "COMMERCE_CONFIG_INVALID",
            "Cannot add mining weight to a closed epoch",
            503,
          );
        await tx.miningContribution.upsert({
          where: { userId_periodDate: { userId, periodDate: day } },
          create: { userId, periodDate: day, hashMillis: weight.toString() },
          update: { hashMillis: { increment: weight.toString() } },
        });
        energy -= rate * BigInt(activeMs);
      }
      cursor = boundary;
    }
    profile = await tx.miningProfile.update({
      where: { userId },
      data: {
        energyCreditMillis: energy.toString(),
        lastCheckpointAt: now,
        boostExpiresAt:
          profile.boostExpiresAt && profile.boostExpiresAt <= now
            ? null
            : profile.boostExpiresAt,
        ruleVersion: segmentConfig.id,
      },
    });
    miners = await tx.userMiner.findMany({
      where: { userId },
      orderBy: { slot: "asc" },
    });
  }
  return { profile, miners };
}

export async function ensureEpoch(
  tx: Tx,
  periodDate: Date,
  config: LoadedCommerceConfig,
) {
  return tx.miningEpoch.upsert({
    where: { periodDate },
    create: {
      periodDate,
      status: "OPEN",
      ruleVersion: config.id,
      configuredMinor: String(config.mining.dailyPoolMinor),
      distributableMinor: String(config.mining.dailyPoolMinor),
      allocatedMinor: "0",
      residueMinor: String(config.mining.dailyPoolMinor),
      totalHashMillis: "0",
    },
    update: {},
  });
}

async function validateProduct(
  tx: Tx,
  userId: string,
  product: Product,
  config: LoadedCommerceConfig,
  state: Awaited<ReturnType<typeof ensureAndCheckpoint>>,
  now: Date,
) {
  if (!product.enabled || product.kind === "LOCKED")
    throw new CommerceError("PRODUCT_LOCKED", "Product is not available", 409, {
      reasonCode: product.lockedReason ?? "SOURCE_NOT_AVAILABLE",
    });
  if (product.id === "b1") {
    if (
      BigInt(state.profile.energyCreditMillis.toFixed(0)) >=
      energyCredit(config.mining.maxEnergy)
    )
      throw new CommerceError(
        "PRODUCT_LIMIT_REACHED",
        "Mining energy is already full",
        409,
        { reasonCode: "ENERGY_FULL" },
      );
    const count = await tx.storePurchase.count({
      where: {
        userId,
        productId: "b1",
        periodDate: utcDay(now),
        status: "POSTED",
      },
    });
    if (count >= config.mining.refillMaxPerDay)
      throw new CommerceError(
        "PRODUCT_LIMIT_REACHED",
        "Daily refill limit reached",
        409,
      );
    return effectEvidence(product, userId, now, null);
  }
  if (product.id === "b2") {
    if (state.profile.boostExpiresAt && state.profile.boostExpiresAt > now)
      throw new CommerceError(
        "BOOST_ALREADY_ACTIVE",
        "Hash boost does not stack",
        409,
      );
    return effectEvidence(
      product,
      userId,
      now,
      new Date(now.getTime() + config.mining.boostDurationSeconds * 1000),
    );
  }
  if (
    product.id === "b4" &&
    !state.miners.some(({ durabilityBps }) => durabilityBps < 10_000)
  ) {
    throw new CommerceError(
      "PRODUCT_LOCKED",
      "No miner currently needs a repair kit",
      409,
      { reasonCode: "NO_REPAIR_NEEDED" },
    );
  }
  if (product.id === "b6") {
    if (state.miners.length >= config.mining.maxSlots)
      throw new CommerceError(
        "MINER_SLOTS_FULL",
        "All miner slots are occupied",
        409,
      );
    return effectEvidence(product, randomUUID(), now, null);
  }
  return effectEvidence(
    product,
    product.id === "b4" ? `repair-inventory:${userId}` : userId,
    now,
    null,
  );
}

async function applyProduct(
  tx: Tx,
  userId: string,
  purchaseId: string,
  product: Product,
  config: LoadedCommerceConfig,
  state: Awaited<ReturnType<typeof ensureAndCheckpoint>>,
  effect: ReturnType<typeof effectEvidence>,
  now: Date,
) {
  if (product.id === "b1") {
    await tx.miningProfile.update({
      where: { userId },
      data: {
        energyCreditMillis: energyCredit(config.mining.maxEnergy).toString(),
        lastCheckpointAt: now,
      },
    });
  } else if (product.id === "b2") {
    await tx.miningProfile.update({
      where: { userId },
      data: { boostExpiresAt: effect.endsAt, lastCheckpointAt: now },
    });
  } else if (product.id === "b4") {
    await tx.miningProfile.update({
      where: { userId },
      data: { repairKitCount: { increment: 1 } },
    });
  } else if (product.id === "b6") {
    const occupied = new Set(state.miners.map(({ slot }) => slot));
    const slot = [1, 2, 3, 4].find((candidate) => !occupied.has(candidate));
    if (!slot)
      throw new CommerceError(
        "MINER_SLOTS_FULL",
        "All miner slots are occupied",
        409,
      );
    await tx.userMiner.create({
      data: {
        id: effect.refId,
        userId,
        slot,
        ...minerData(config.mining.nova),
        durabilityBps: 10_000,
        status: "ACTIVE",
        level: 1,
        ruleVersion: config.id,
        sourcePurchaseId: purchaseId,
      },
    });
  }
}

async function catalogView(
  tx: Tx,
  userId: string,
  config: LoadedCommerceConfig,
  state: Awaited<ReturnType<typeof ensureAndCheckpoint>>,
  now: Date,
  riskLevel: number,
): Promise<StoreCatalogResponse> {
  const [balances, counts] = await Promise.all([
    paymentBalances(tx, userId),
    tx.storePurchase.groupBy({
      by: ["productId"],
      where: { userId, periodDate: utcDay(now), status: "POSTED" },
      _count: { _all: true },
    }),
  ]);
  const countMap = new Map(
    counts.map((row) => [row.productId, row._count._all]),
  );
  return {
    serverNow: now.toISOString(),
    configVersion: config.id,
    paymentBalances: {
      AVAILABLE: balances.available.toString(),
      PROMOTIONAL: balances.promotional.toString(),
    },
    paymentOrder: ["PROMOTIONAL", "AVAILABLE"],
    allowedPaymentBuckets: ["PROMOTIONAL", "AVAILABLE"],
    slots: { used: state.miners.length, max: config.mining.maxSlots },
    split: { burnBps: 4000, recycleBps: 4000, treasuryBps: 2000 },
    products: config.store.products.map((product) =>
      productView(
        product,
        config,
        state,
        countMap.get(product.id) ?? 0,
        now,
        riskLevel,
      ),
    ),
  };
}

function productView(
  product: Product,
  config: LoadedCommerceConfig,
  state: Awaited<ReturnType<typeof ensureAndCheckpoint>>,
  purchasesToday: number,
  now: Date,
  riskLevel: number,
): StoreCatalogResponse["products"][number] {
  let lockedReason: string | null = !config.store.enabled
    ? "STORE_DISABLED"
    : riskLevel > config.store.maxRiskLevel
      ? "RISK_BLOCKED"
      : !product.enabled
        ? (product.lockedReason ?? "PRODUCT_DISABLED")
        : null;
  if (!lockedReason && product.id === "b1") {
    if (purchasesToday >= config.mining.refillMaxPerDay)
      lockedReason = "DAILY_LIMIT";
    else if (
      BigInt(state.profile.energyCreditMillis.toFixed(0)) >=
      energyCredit(config.mining.maxEnergy)
    )
      lockedReason = "ENERGY_FULL";
  }
  if (
    !lockedReason &&
    product.id === "b2" &&
    state.profile.boostExpiresAt &&
    state.profile.boostExpiresAt > now
  )
    lockedReason = "BOOST_ACTIVE";
  if (
    !lockedReason &&
    product.id === "b6" &&
    state.miners.length >= config.mining.maxSlots
  )
    lockedReason = "NO_SLOT";
  if (
    !lockedReason &&
    product.id === "b4" &&
    !state.miners.some(({ durabilityBps }) => durabilityBps < 10_000)
  )
    lockedReason = "NO_REPAIR_NEEDED";
  const effect = productEffect(product, config);
  return {
    id: product.id,
    kind: product.kind,
    name: product.name,
    description: product.description,
    category: product.category,
    enabled: lockedReason === null,
    lockedReason,
    state:
      lockedReason === null
        ? "AVAILABLE"
        : product.id === "b2" && lockedReason === "BOOST_ACTIVE"
          ? "ACTIVE"
          : product.id === "b6" && lockedReason === "NO_SLOT"
            ? "NO_SLOT"
            : lockedReason === "DAILY_LIMIT"
              ? "LIMIT_REACHED"
              : "LOCKED",
    reasonCode: lockedReason,
    priceMinorUnits: String(product.priceMinor),
    price: { asset: "ZYXE", minorUnits: String(product.priceMinor) },
    meta: product.description,
    purchasesToday,
    remainingToday:
      product.id === "b1"
        ? Math.max(0, config.mining.refillMaxPerDay - purchasesToday)
        : null,
    effect,
    limits: {
      perUtcDay: product.id === "b1" ? config.mining.refillMaxPerDay : null,
      remainingToday:
        product.id === "b1"
          ? Math.max(0, config.mining.refillMaxPerDay - purchasesToday)
          : null,
      maxActive: product.id === "b2" ? 1 : null,
      requiresSlot: product.id === "b6",
    },
  };
}

async function miningView(
  tx: Tx | PrismaClient,
  userId: string,
  config: LoadedCommerceConfig,
  state: Awaited<ReturnType<typeof ensureAndCheckpoint>>,
  now: Date,
  riskLevel: number,
): Promise<MiningStatusResponse> {
  const day = utcDay(now);
  const [contribution, total, epoch] = await Promise.all([
    tx.miningContribution.findUnique({
      where: { userId_periodDate: { userId, periodDate: day } },
    }),
    tx.miningContribution.aggregate({
      where: { periodDate: day },
      _sum: { hashMillis: true },
    }),
    tx.miningEpoch.findUnique({ where: { periodDate: day } }),
  ]);
  const userWeight = BigInt(contribution?.hashMillis.toFixed(0) ?? "0");
  const totalWeight = BigInt(total._sum.hashMillis?.toFixed(0) ?? "0");
  const epochPool = BigInt(
    epoch?.distributableMinor.toFixed(0) ??
      String(config.mining.dailyPoolMinor),
  );
  const estimate =
    totalWeight > 0n ? (epochPool * userWeight) / totalWeight : 0n;
  const energy = BigInt(state.profile.energyCreditMillis.toFixed(0));
  const activeMinerCount = state.miners.filter(
    ({ status, durabilityBps }) => status === "ACTIVE" && durabilityBps > 0,
  ).length;
  const miningState = !config.mining.enabled
    ? "DISABLED"
    : riskLevel > config.mining.maxRiskLevel
      ? "RISK_BLOCKED"
      : energy <= 0n
        ? "OUT_OF_ENERGY"
        : activeMinerCount === 0
          ? "IDLE"
          : "ACTIVE";
  const consumptionPerHour = state.miners
    .filter(
      ({ status, durabilityBps }) => status === "ACTIVE" && durabilityBps > 0,
    )
    .reduce((sum, miner) => sum + miner.energyPerHour, 0);
  return {
    serverNow: now.toISOString(),
    configVersion: config.id,
    state: miningState,
    reasonCode: !config.mining.enabled
      ? "MINING_DISABLED"
      : riskLevel > config.mining.maxRiskLevel
        ? "RISK_BLOCKED"
        : energy <= 0n
          ? "OUT_OF_ENERGY"
          : null,
    profile: {
      energy: {
        current: Number(energy / 3_600_000n),
        max: config.mining.maxEnergy,
        consumptionPerHour,
        estimatedExhaustsAt:
          consumptionPerHour > 0 && energy > 0n
            ? new Date(
                now.getTime() + Number(energy / BigInt(consumptionPerHour)),
              ).toISOString()
            : null,
      },
      boost:
        state.profile.boostExpiresAt && state.profile.boostExpiresAt > now
          ? {
              multiplierBps: config.mining.boostMultiplierBps,
              expiresAt: state.profile.boostExpiresAt.toISOString(),
            }
          : null,
      repairKits: state.profile.repairKitCount,
      activeMiners: activeMinerCount,
      maxSlots: config.mining.maxSlots,
    },
    miners: state.miners.map((miner) => ({
      id: miner.id,
      modelId: miner.modelId,
      name: miner.name,
      tier: miner.tier,
      slot: miner.slot,
      status:
        miningState === "DISABLED" || miningState === "RISK_BLOCKED"
          ? "DISABLED"
          : miner.status,
      reasonCode:
        miningState === "DISABLED"
          ? "MINING_DISABLED"
          : miningState === "RISK_BLOCKED"
            ? "RISK_BLOCKED"
            : miner.durabilityBps <= 0
              ? "REPAIR_REQUIRED"
              : null,
      level: miner.level,
      hashRate: miner.hashRate,
      energyPerHour: miner.energyPerHour,
      efficiencyBps: miner.efficiencyBps,
      durabilityBps: miner.durabilityBps,
      effectiveHashRate: Math.floor(
        (miner.hashRate * miner.efficiencyBps * miner.durabilityBps) /
          100_000_000,
      ),
      upgrade: {
        nextLevel: miner.level + 1,
        priceMinorUnits: upgradePrice(miner, config).toString(),
        hashRate: Math.ceil(
          (miner.hashRate * config.mining.upgradeHashMultiplierBps) / 10_000,
        ),
        enabled: miner.level < config.mining.maxLevel,
      },
      repair: {
        priceMinorUnits: repairPrice(miner, config).toString(),
        usesKit: state.profile.repairKitCount > 0,
        enabled: miner.durabilityBps < 10_000,
      },
    })),
    today: {
      periodKey: isoDay(day),
      startAt: day.toISOString(),
      endAt: new Date(day.getTime() + 86_400_000).toISOString(),
      hashMillis: userWeight.toString(),
      poolMinorUnits: epochPool.toString(),
      estimatedPayoutMinorUnits: estimate.toString(),
      asOf: now.toISOString(),
      isGuaranteed: false,
      status: epoch?.status ?? "OPEN",
      allocatedMinorUnits: epoch?.allocatedMinor.toFixed(0) ?? null,
      residueMinorUnits: epoch?.residueMinor.toFixed(0) ?? epochPool.toString(),
      userWeight: userWeight.toString(),
      totalWeight: totalWeight.toString(),
    },
  };
}

async function purchaseResult(
  client: Tx | PrismaClient,
  purchase: Prisma.StorePurchaseGetPayload<{}>,
  replayed: boolean,
  now: Date,
): Promise<StorePurchaseResponse> {
  if (purchase.status !== "POSTED" || !purchase.transactionId)
    throw new CommerceError(
      "COMMERCE_PURCHASE_REVERSED",
      "Purchase is not posted and its effect cannot be replayed",
      409,
    );
  const postedTransaction = await client.ledgerTransaction.findUnique({
    where: { id: purchase.transactionId },
    select: { status: true },
  });
  if (postedTransaction?.status !== "POSTED")
    throw new CommerceError(
      "COMMERCE_PURCHASE_REVERSED",
      "Purchase transaction was reversed",
      409,
    );
  const config = await commerceConfigById(client, purchase.ruleVersion);
  const user = await eligibleUser(client, purchase.userId, false);
  const state = await readMiningState(client, purchase.userId);
  const evidence = asObject(purchase.evidence);
  return {
    purchase: {
      id: purchase.id,
      productId: purchase.productId as "b1",
      status: "POSTED",
      quantity: 1,
      totalMinorUnits: purchase.priceMinor.toFixed(0),
      price: { asset: "ZYXE", minorUnits: purchase.priceMinor.toFixed(0) },
      payment: {
        availableMinorUnits: purchase.availableDebitMinor.toFixed(0),
        promotionalMinorUnits: purchase.promotionalDebitMinor.toFixed(0),
      },
      split: {
        burnMinorUnits: purchase.burnMinor.toFixed(0),
        rewardPoolsMinorUnits: purchase.recycleMinor.toFixed(0),
        recycleMinorUnits: purchase.recycleMinor.toFixed(0),
        treasuryMinorUnits: purchase.treasuryMinor.toFixed(0),
      },
      effect: {
        type: purchase.effectType,
        status: "APPLIED",
        refId: purchase.effectRef ?? purchase.id,
        startsAt: String(evidence.startsAt ?? purchase.postedAt?.toISOString()),
        endsAt: typeof evidence.endsAt === "string" ? evidence.endsAt : null,
      },
      transactionId: purchase.transactionId!,
      configVersion: purchase.ruleVersion,
      createdAt: purchase.createdAt.toISOString(),
    },
    mining: await miningView(
      client,
      purchase.userId,
      config,
      state,
      now,
      user.riskLevel,
    ),
    replayed,
  };
}

async function actionResult(
  client: Tx | PrismaClient,
  action: Prisma.MinerActionGetPayload<{}>,
  replayed: boolean,
  now: Date,
): Promise<MinerActionResponse> {
  if (action.status !== "POSTED")
    throw new CommerceError(
      "COMMERCE_ACTION_REVERSED",
      "Miner action is not posted",
      409,
    );
  const config = await commerceConfigById(client, action.ruleVersion);
  const user = await eligibleUser(client, action.userId, false);
  const state = await readMiningState(client, action.userId);
  const transaction = action.transactionId
    ? await client.ledgerTransaction.findUnique({
        where: { id: action.transactionId },
        select: { metadata: true, status: true },
      })
    : null;
  if (action.transactionId && (!transaction || transaction.status !== "POSTED"))
    throw new CommerceError(
      "COMMERCE_ACTION_REVERSED",
      "Miner action transaction is unavailable",
      409,
    );
  const payment = asObject(transaction?.metadata ?? {});
  return {
    action: {
      id: action.id,
      minerId: action.minerId,
      type: action.kind,
      status: "POSTED",
      costMinorUnits: action.costMinor.toFixed(0),
      payment: {
        availableMinorUnits:
          typeof payment.available === "string" ? payment.available : "0",
        promotionalMinorUnits:
          typeof payment.promotional === "string" ? payment.promotional : "0",
      },
      split: {
        burnMinorUnits: typeof payment.burn === "string" ? payment.burn : "0",
        recycleMinorUnits:
          typeof payment.recycle === "string" ? payment.recycle : "0",
        treasuryMinorUnits:
          typeof payment.treasury === "string" ? payment.treasury : "0",
      },
      transactionId: action.transactionId,
      configVersion: action.ruleVersion,
    },
    mining: await miningView(
      client,
      action.userId,
      config,
      state,
      now,
      user.riskLevel,
    ),
    replayed,
  };
}

async function readMiningState(client: Tx | PrismaClient, userId: string) {
  const [profile, miners] = await Promise.all([
    client.miningProfile.findUniqueOrThrow({ where: { userId } }),
    client.userMiner.findMany({ where: { userId }, orderBy: { slot: "asc" } }),
  ]);
  return { profile, miners };
}

async function chargeSpend(
  tx: Tx,
  input: {
    userId: string;
    amount: bigint;
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    transactionType: string;
    config: LoadedCommerceConfig;
    metadata: Record<string, string | number | boolean | null>;
  },
) {
  const accounts = await paymentAccounts(tx, input.userId);
  const balances = await paymentBalances(tx, input.userId, accounts);
  const promotional =
    balances.promotional < input.amount ? balances.promotional : input.amount;
  const available = input.amount - promotional;
  if (available > balances.available)
    throw new CommerceError(
      "INSUFFICIENT_PURCHASE_FUNDS",
      "Available and promotional balances are insufficient",
      409,
    );
  const burn =
    (input.amount * BigInt(input.config.store.split.burnBps)) / 10_000n;
  const recycle =
    (input.amount * BigInt(input.config.store.split.recycleBps)) / 10_000n;
  const treasury = input.amount - burn - recycle;
  const postings = [
    ...(promotional > 0n
      ? [{ account: accountRef(accounts.promotional), amount: -promotional }]
      : []),
    ...(available > 0n
      ? [{ account: accountRef(accounts.available), amount: -available }]
      : []),
    { account: accountRef(accounts.burn), amount: burn },
    { account: accountRef(accounts.recycle), amount: recycle },
    { account: accountRef(accounts.treasury), amount: treasury },
  ];
  try {
    const transaction = await postLedgerTransactionInTransaction(tx, {
      idempotencyKey: input.idempotencyKey,
      type: input.transactionType,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      configVersion: input.config.id,
      metadata: {
        ...input.metadata,
        paymentOrder: "PROMOTIONAL,AVAILABLE",
        promotional: promotional.toString(),
        available: available.toString(),
        burn: burn.toString(),
        recycle: recycle.toString(),
        treasury: treasury.toString(),
      },
      postings,
    });
    return {
      promotional,
      available,
      burn,
      recycle,
      treasury,
      transactionId: transaction.id,
    };
  } catch (error) {
    if (error instanceof LedgerInsufficientBalanceError)
      throw new CommerceError(
        "INSUFFICIENT_PURCHASE_FUNDS",
        "Balance changed before the purchase could post",
        409,
      );
    throw error;
  }
}

async function paymentAccounts(tx: Tx, userId: string) {
  const [available, promotional, burn, recycle, treasury] = await Promise.all([
    tx.ledgerAccount.findFirst({
      where: { userId, asset: "ZYXE", bucket: "AVAILABLE", active: true },
    }),
    tx.ledgerAccount.findFirst({
      where: { userId, asset: "ZYXE", bucket: "PROMOTIONAL", active: true },
    }),
    tx.ledgerAccount.findUnique({ where: { code: "platform:zyxe:burn" } }),
    tx.ledgerAccount.findUnique({ where: { code: "platform:zyxe:recycle" } }),
    tx.ledgerAccount.findUnique({ where: { code: "treasury:operation:zyxe" } }),
  ]);
  if (
    !available ||
    !promotional ||
    !burn?.active ||
    !recycle?.active ||
    !treasury?.active
  )
    throw configError();
  return { available, promotional, burn, recycle, treasury };
}

async function paymentBalances(
  client: Tx | PrismaClient,
  userId: string,
  supplied?: Awaited<ReturnType<typeof paymentAccounts>>,
) {
  const accounts = supplied ?? (await paymentAccounts(client as Tx, userId));
  const sums = await client.ledgerPosting.groupBy({
    by: ["accountId"],
    where: {
      accountId: { in: [accounts.available.id, accounts.promotional.id] },
    },
    _sum: { amount: true },
  });
  const byId = new Map(
    sums.map((row) => [
      row.accountId,
      BigInt(row._sum.amount?.toFixed(0) ?? "0"),
    ]),
  );
  return {
    available: byId.get(accounts.available.id) ?? 0n,
    promotional: byId.get(accounts.promotional.id) ?? 0n,
  };
}

async function eligibleUser(
  client: Tx | PrismaClient,
  userId: string,
  lock: boolean,
) {
  const rows = lock
    ? await (client as Tx).$queryRaw<
        Array<{
          status: string;
          emailVerifiedAt: Date | null;
          riskLevel: number;
        }>
      >(
        Prisma.sql`SELECT "status", "emailVerifiedAt", "riskLevel" FROM "User" WHERE "id" = ${userId} FOR UPDATE`,
      )
    : await client.user.findMany({
        where: { id: userId },
        select: { status: true, emailVerifiedAt: true, riskLevel: true },
      });
  const user = rows[0];
  if (!user || user.status !== "ACTIVE" || !user.emailVerifiedAt)
    throw new CommerceError(
      "COMMERCE_ACCOUNT_NOT_ELIGIBLE",
      "An active, verified account is required",
      403,
    );
  return { riskLevel: user.riskLevel };
}

export async function commerceConfigById(
  client: Tx | PrismaClient,
  id: number,
) {
  const row = await client.economicConfigVersion.findUnique({ where: { id } });
  const parsed = commerceParametersSchema.safeParse(row?.parameters);
  if (!row || !parsed.success) throw configError();
  return { id: row.id, effectiveAt: row.effectiveAt, ...parsed.data };
}

function assertCommerceEnabled(
  config: LoadedCommerceConfig,
  riskLevel: number,
) {
  if (!config.store.enabled || !config.mining.enabled)
    throw new CommerceError(
      "COMMERCE_DISABLED",
      "Store or mining is disabled",
      503,
    );
  if (
    riskLevel > Math.min(config.store.maxRiskLevel, config.mining.maxRiskLevel)
  )
    throw new CommerceError(
      "COMMERCE_RISK_BLOCKED",
      "Risk policy blocks this operation",
      403,
    );
}
function validateMutationConfig(input: number, expected: number) {
  if (input !== expected)
    throw new CommerceError(
      "COMMERCE_CONFIG_CHANGED",
      "Economic configuration changed; refresh",
      409,
      { expectedConfigVersion: expected },
    );
}
function effectEvidence(
  product: Product,
  refId: string,
  startsAt: Date,
  endsAt: Date | null,
) {
  return {
    type: product.kind,
    refId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt?.toISOString() ?? null,
  };
}
function productEffect(product: Product, config: LoadedCommerceConfig) {
  if (product.id === "b1")
    return {
      type: product.kind,
      label: "Mining energy to 100",
      maxPerDay: 3,
      energyTo: 100,
    };
  if (product.id === "b2")
    return {
      type: product.kind,
      label: "1.5x valid hash for 6 hours",
      durationSeconds: config.mining.boostDurationSeconds,
      multiplierBps: config.mining.boostMultiplierBps,
    };
  if (product.id === "b4")
    return { type: product.kind, label: "One full miner repair" };
  if (product.id === "b6")
    return {
      type: product.kind,
      label: "+74 GH/s miner",
      miner: {
        modelId: config.mining.nova.modelId,
        name: config.mining.nova.name,
        tier: config.mining.nova.tier,
        hashRate: config.mining.nova.hashRate,
        energyPerHour: config.mining.nova.energyPerHour,
        efficiencyBps: config.mining.nova.efficiencyBps,
      },
    };
  return { type: product.kind, label: product.lockedReason ?? "Unavailable" };
}
function templateFor(modelId: string, config: LoadedCommerceConfig) {
  return modelId === config.mining.nova.modelId
    ? config.mining.nova
    : config.mining.starter;
}
function upgradePrice(
  miner: { modelId: string; level: number },
  config: LoadedCommerceConfig,
) {
  let price = BigInt(templateFor(miner.modelId, config).upgradeBaseMinor);
  for (let level = 1; level < miner.level; level += 1)
    price =
      (price * BigInt(config.mining.upgradeCostMultiplierBps) + 9999n) /
      10_000n;
  return roundUpFive(price);
}
function repairPrice(
  miner: { durabilityBps: number },
  config: LoadedCommerceConfig,
) {
  if (miner.durabilityBps >= 10_000) return 0n;
  return roundUpFive(
    BigInt(
      Math.ceil(
        (config.mining.repairBaseMinor * (10_000 - miner.durabilityBps)) /
          10_000,
      ),
    ),
  );
}
function roundUpFive(value: bigint) {
  return value <= 0n ? 0n : ((value + 4n) / 5n) * 5n;
}
function minerData(template: z.infer<typeof minerTemplateSchema>) {
  return {
    modelId: template.modelId,
    name: template.name,
    tier: template.tier,
    hashRate: template.hashRate,
    energyPerHour: template.energyPerHour,
    efficiencyBps: template.efficiencyBps,
  };
}
function energyCredit(units: number) {
  return BigInt(units) * 3_600_000n;
}
function utcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
function nextUtcDay(date: Date) {
  return new Date(utcDay(date).getTime() + 86_400_000);
}
function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}
function accountRef(account: {
  id: string;
  asset: string;
  kind: LedgerAccountKind;
}) {
  return { id: account.id, asset: account.asset, kind: account.kind };
}
function toJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}
function asObject(value: Prisma.JsonValue) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function configError() {
  return new CommerceError(
    "COMMERCE_CONFIG_INVALID",
    "Store or mining economic configuration is invalid",
    503,
  );
}
function idempotencyConflict() {
  return new CommerceError(
    "COMMERCE_IDEMPOTENCY_CONFLICT",
    "Idempotency identity conflicts",
    409,
  );
}
function isPrismaCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
function isSerialization(error: unknown) {
  return (
    isPrismaCode(error, "P2034") ||
    (isPrismaCode(error, "P2010") &&
      typeof error === "object" &&
      error !== null &&
      "meta" in error &&
      typeof error.meta === "object" &&
      error.meta !== null &&
      "code" in error.meta &&
      error.meta.code === "40001")
  );
}
