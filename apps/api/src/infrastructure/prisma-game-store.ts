import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { GameEventRequest, GameSlug } from "@fauzet/contracts";
import { getDatabase, Prisma, type PrismaClient } from "@fauzet/database";
import { z } from "zod";
import {
  applyMemoryFlip,
  GameError,
  memoryReward,
  memoryScore,
  tapReward,
  validateTapOffsets,
  type GameCatalogResult,
  type GameContext,
  type GameEnergyView,
  type GameEventResult,
  type GamesConfig,
  type GameSessionView,
  type GameStore,
  type MemoryRules,
  type MemoryState,
  type TapRules,
} from "../domain/games.js";
import { LedgerInsufficientBalanceError } from "../domain/ledger-posting.js";
import { postLedgerTransactionInTransaction } from "./prisma-ledger-store.js";

const gameRulesSchema = z.object({
  enabled: z.boolean(),
  energyCost: z.number().int().nonnegative().max(100),
  durationSeconds: z.number().int().positive().max(120),
  rewardMinMinor: z.number().int().positive().safe(),
  rewardMaxMinor: z.number().int().positive().safe(),
});
const gamesConfigSchema = z.object({
  enabled: z.boolean(),
  dailyBudgetMinor: z.number().int().positive().safe(),
  maxRiskLevel: z.number().int().min(0).max(100),
  dailySessionLimitPerGame: z.number().int().positive().max(100),
  deviceDailySessionLimit: z.number().int().positive().max(500),
  ipDailySessionLimit: z.number().int().positive().max(2_000),
  completionGraceSeconds: z.number().int().positive().max(300),
  clientLeadToleranceMs: z.number().int().nonnegative().max(5_000),
  energy: z.object({
    max: z.literal(100),
    initial: z.number().int().min(0).max(100),
    regenIntervalSeconds: z.number().int().positive().max(86_400),
  }),
  tapMiner: gameRulesSchema.extend({
    rewardStepTaps: z.number().int().positive().max(100),
    maxTaps: z.number().int().positive().max(1_000),
    minTapIntervalMs: z.number().int().positive().max(5_000),
    maxBatchSize: z.number().int().positive().max(25),
  }),
  memoryDrops: gameRulesSchema.extend({
    symbols: z.array(z.string().min(1).max(32)).length(6),
    mismatchLockMs: z.number().int().nonnegative().max(5_000),
    minFlipIntervalMs: z.number().int().positive().max(5_000),
    completionBaseReward: z.number().int().nonnegative().safe(),
    partialBaseReward: z.number().int().nonnegative().safe(),
    rewardPerPair: z.number().int().nonnegative().safe(),
    timeBonusDivisorSeconds: z.number().int().positive().max(120),
    scorePerPair: z.number().int().positive().max(1_000),
  }),
});
const economicConfigSchema = z
  .object({ games: gamesConfigSchema })
  .passthrough();

type Tx = Prisma.TransactionClient;
type SessionRecord = Prisma.GameSessionGetPayload<{}>;

export class PrismaGameStore implements GameStore {
  constructor(
    private readonly database: PrismaClient = getDatabase(),
    private readonly secret: string = "development-only-secret-change-me-now",
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async catalog(
    userId: string,
    context: GameContext,
  ): Promise<GameCatalogResult> {
    return this.withRetry(async (tx) => {
      const user = await requireEligibleUser(tx, userId, true);
      const config = await activeGamesConfig(tx, this.clock());
      const energy = await settleEnergy(tx, userId, config, this.clock());
      const budgetDate = utcDayStart(this.clock());
      const [tapCount, memoryCount, deviceCount, ipCount, bestTap, bestMemory] =
        await Promise.all([
          sessionCount(tx, { userId, game: "TAP_MINER", budgetDate }),
          sessionCount(tx, { userId, game: "MEMORY_DROPS", budgetDate }),
          context.deviceId
            ? tx.gameSession.count({
                where: { deviceId: context.deviceId, budgetDate },
              })
            : Promise.resolve(0),
          tx.gameSession.count({
            where: { ipHash: context.ipHash, budgetDate },
          }),
          tx.gameSession.aggregate({
            where: { userId, game: "TAP_MINER", status: "COMPLETED" },
            _max: { score: true },
          }),
          tx.gameSession.aggregate({
            where: { userId, game: "MEMORY_DROPS", status: "COMPLETED" },
            _max: { score: true },
          }),
        ]);
      const common = { user, config, energy, deviceCount, ipCount };
      return {
        games: [
          catalogItem(
            "tap-miner",
            config.parameters.tapMiner,
            tapCount,
            bestTap._max.score,
            common,
          ),
          catalogItem(
            "memory-drops",
            config.parameters.memoryDrops,
            memoryCount,
            bestMemory._max.score,
            common,
          ),
        ],
        energy: energyView(energy, config.parameters),
        configVersion: config.id,
      };
    });
  }

  async createSession(input: {
    userId: string;
    game: GameSlug;
    idempotencyKey: string;
    context: GameContext;
  }): Promise<{ session: GameSessionView; replayed: boolean }> {
    const creationKey = scopedKey(
      "start",
      input.userId,
      input.game,
      input.idempotencyKey,
    );
    try {
      return await this.withRetry(async (tx) => {
        const existing = await tx.gameSession.findUnique({
          where: { creationKey },
        });
        if (existing) {
          if (
            existing.userId !== input.userId ||
            toSlug(existing.game) !== input.game
          )
            throw idempotencyConflict();
          validateStoredContext(existing, input.context);
          const config = await configById(tx, existing.ruleVersion);
          return {
            session: publicSession(
              existing,
              config,
              this.secret,
              true,
              this.clock(),
            ),
            replayed: true,
          };
        }

        const now = this.clock();
        const user = await requireEligibleUser(tx, input.userId, true);
        const config = await activeGamesConfig(tx, now, true);
        assertContextDevice(input.context);
        const rules = rulesFor(config.parameters, input.game);
        assertGameAvailable(config.parameters, rules, user.riskLevel);
        const budgetDate = utcDayStart(now);
        await tx.gameSession.updateMany({
          where: {
            userId: input.userId,
            game: toKind(input.game),
            status: "ACTIVE",
            expiresAt: { lte: now },
          },
          data: {
            status: "EXPIRED",
            completedAt: now,
            reasonCode: "SESSION_EXPIRED",
          },
        });
        if (
          await tx.gameSession.findFirst({
            where: {
              userId: input.userId,
              game: toKind(input.game),
              status: "ACTIVE",
            },
            select: { id: true },
          })
        ) {
          throw new GameError(
            "GAME_ACTIVE_SESSION_EXISTS",
            "An active session already exists for this game",
            409,
          );
        }
        const [userCount, deviceCount, ipCount] = await Promise.all([
          sessionCount(tx, {
            userId: input.userId,
            game: toKind(input.game),
            budgetDate,
          }),
          tx.gameSession.count({
            where: { deviceId: input.context.deviceId!, budgetDate },
          }),
          tx.gameSession.count({
            where: { ipHash: input.context.ipHash, budgetDate },
          }),
        ]);
        assertSessionLimits(config.parameters, userCount, deviceCount, ipCount);
        const energy = await settleEnergy(tx, input.userId, config, now);
        if (energy.current < rules.energyCost) {
          throw new GameError(
            "GAME_ENERGY_INSUFFICIENT",
            "Not enough energy to start this game",
            409,
            { current: energy.current, required: rules.energyCost },
          );
        }
        const updatedEnergy = await tx.gameEnergy.update({
          where: { userId: input.userId },
          data: { current: energy.current - rules.energyCost },
        });
        const id = randomUUID();
        const nonce = randomUUID();
        const token = sessionToken(id, nonce, this.secret);
        const session = await tx.gameSession.create({
          data: {
            id,
            userId: input.userId,
            game: toKind(input.game),
            creationKey,
            nonce,
            tokenHash: tokenHash(token, this.secret),
            ruleVersion: config.id,
            budgetDate,
            energyCost: rules.energyCost,
            state:
              input.game === "tap-miner"
                ? { taps: 0 }
                : {
                    matchedIndices: [],
                    pendingIndex: null,
                    pairs: 0,
                    flips: 0,
                    lockedUntilMs: 0,
                  },
            layout:
              input.game === "memory-drops"
                ? shuffleLayout(config.parameters.memoryDrops.symbols)
                : Prisma.JsonNull,
            deviceId: input.context.deviceId!,
            ipHash: input.context.ipHash,
            startedAt: now,
            expiresAt: new Date(
              now.getTime() +
                (rules.durationSeconds +
                  config.parameters.completionGraceSeconds) *
                  1_000,
            ),
          },
        });
        return {
          session: publicSession(
            session,
            config,
            this.secret,
            true,
            now,
            energyView(updatedEnergy, config.parameters),
          ),
          replayed: false,
        };
      });
    } catch (error) {
      if (isPrismaCode(error, "P2002") || isPrismaCode(error, "P2034")) {
        const existing = await this.database.gameSession.findUnique({
          where: { creationKey },
        });
        if (
          existing &&
          existing.userId === input.userId &&
          toSlug(existing.game) === input.game
        ) {
          validateStoredContext(existing, input.context);
          const config = await configById(this.database, existing.ruleVersion);
          return {
            session: publicSession(
              existing,
              config,
              this.secret,
              true,
              this.clock(),
            ),
            replayed: true,
          };
        }
        throw idempotencyConflict();
      }
      throw error;
    }
  }

  async getSession(input: {
    userId: string;
    sessionId: string;
    sessionToken: string;
    context: GameContext;
  }): Promise<{ session: GameSessionView }> {
    const result = await this.withRetry(async (tx) => {
      const session = await lockSession(tx, input.sessionId);
      validateSessionAccess(session, input, this.secret);
      const now = this.clock();
      const current =
        session.status === "ACTIVE" && session.expiresAt <= now
          ? await tx.gameSession.update({
              where: { id: session.id },
              data: {
                status: "EXPIRED",
                completedAt: now,
                reasonCode: "SESSION_EXPIRED",
              },
            })
          : session;
      return { current, config: await configById(tx, current.ruleVersion) };
    });
    return {
      session: publicSession(
        result.current,
        result.config,
        this.secret,
        true,
        this.clock(),
      ),
    };
  }

  async recordEvent(input: {
    userId: string;
    game: GameSlug;
    sessionId: string;
    event: GameEventRequest;
    context: GameContext;
  }): Promise<GameEventResult> {
    const outcome = await this.withRetry(async (tx) => {
      const session = await lockSession(tx, input.sessionId);
      validateSessionAccess(
        session,
        { ...input, sessionToken: input.event.sessionToken },
        this.secret,
      );
      if (toSlug(session.game) !== input.game) throw sessionNotFound();
      if (input.event.nonce !== session.nonce) throw invalidToken();

      const replay = await tx.gameEvent.findMany({
        where: {
          sessionId: session.id,
          OR: [
            { sequence: input.event.sequence },
            { eventId: input.event.eventId },
          ],
        },
        take: 2,
      });
      if (replay.length > 0) {
        const exact =
          replay.length === 1 &&
          replay[0]!.sequence === input.event.sequence &&
          replay[0]!.eventId === input.event.eventId;
        if (!exact)
          throw new GameError(
            "GAME_EVENT_REPLAY",
            "Event identity conflicts",
            409,
          );
        const saved = asObject(replay[0]!.payload).result;
        if (!saved || typeof saved !== "object")
          throw new GameError(
            "GAME_EVENT_REPLAY",
            "Event replay is invalid",
            409,
          );
        return { result: saved as unknown as GameEventResult };
      }
      if (session.status !== "ACTIVE") throw sessionNotActive(session.status);
      const now = this.clock();
      if (session.expiresAt <= now) {
        await tx.gameSession.update({
          where: { id: session.id },
          data: {
            status: "EXPIRED",
            completedAt: now,
            reasonCode: "SESSION_EXPIRED",
          },
        });
        return {
          error: new GameError(
            "GAME_SESSION_EXPIRED",
            "Game session expired",
            410,
          ),
        };
      }
      if (input.event.sequence !== session.nextSequence) {
        throw new GameError(
          "GAME_SEQUENCE_INVALID",
          "Event sequence must be contiguous",
          409,
          { expected: session.nextSequence },
        );
      }
      const config = await configById(tx, session.ruleVersion);
      const rules = rulesFor(config.parameters, input.game);
      const serverElapsed = now.getTime() - session.startedAt.getTime();
      const playEndsAt =
        session.startedAt.getTime() + rules.durationSeconds * 1_000;
      if (
        now.getTime() > playEndsAt + config.parameters.clientLeadToleranceMs ||
        input.event.atMs > rules.durationSeconds * 1_000 ||
        input.event.atMs >
          serverElapsed + config.parameters.clientLeadToleranceMs
      ) {
        throw new GameError(
          "GAME_EVENT_INVALID",
          "Event time is outside the server window",
          422,
        );
      }

      let state: Record<string, unknown>;
      let result: GameEventResult;
      let lastAtMs = input.event.atMs;
      let acceptedCount = 1;
      if (input.game === "tap-miner") {
        if (!["TAP", "TAP_BATCH"].includes(input.event.type))
          throw new GameError(
            "GAME_EVENT_INVALID",
            "Tap Miner accepts tap events only",
            422,
          );
        const offsets =
          input.event.type === "TAP"
            ? [input.event.atMs]
            : parseTapOffsets(input.event.payload.tapOffsetsMs);
        if (offsets.at(-1) !== input.event.atMs)
          throw new GameError(
            "GAME_EVENT_INVALID",
            "atMs must equal the last tap offset",
            422,
          );
        validateTapOffsets(
          session.lastEventAtMs,
          offsets,
          config.parameters.tapMiner,
        );
        const currentTaps = numberField(session.state, "taps");
        if (currentTaps + offsets.length > config.parameters.tapMiner.maxTaps)
          throw new GameError(
            "GAME_EVENT_INVALID",
            "Tap count exceeds the session cap",
            422,
          );
        const taps = currentTaps + offsets.length;
        state = { taps };
        lastAtMs = offsets.at(-1)!;
        acceptedCount = offsets.length;
        result = {
          accepted: true,
          nextSequence: session.nextSequence + 1,
          configVersion: config.id,
          state: { score: taps, taps },
        };
      } else {
        if (input.event.type !== "FLIP")
          throw new GameError(
            "GAME_EVENT_INVALID",
            "Memory Drops accepts FLIP only",
            422,
          );
        if (
          session.lastEventAtMs >= 0 &&
          input.event.atMs - session.lastEventAtMs <
            config.parameters.memoryDrops.minFlipIntervalMs
        )
          throw new GameError(
            "GAME_EVENT_TOO_FAST",
            "Flip cadence exceeds the physical limit",
            422,
          );
        const memory = memoryState(session.state);
        const layout = stringArray(session.layout);
        const applied = applyMemoryFlip(
          memory,
          layout,
          Number(input.event.payload.cardIndex),
          input.event.atMs,
          config.parameters.memoryDrops,
        );
        state = applied.state as unknown as Record<string, unknown>;
        const score = memoryScore(
          applied.state,
          input.event.atMs,
          config.parameters.memoryDrops,
        );
        result = {
          accepted: true,
          nextSequence: session.nextSequence + 1,
          configVersion: config.id,
          state: {
            score,
            pairs: applied.state.pairs,
            matchedIndices: applied.state.matchedIndices,
            pendingIndex: applied.state.pendingIndex,
            lockedUntilMs: applied.state.lockedUntilMs,
          },
          reveal: applied.reveal,
        };
      }
      await tx.gameEvent.create({
        data: {
          sessionId: session.id,
          sequence: input.event.sequence,
          eventId: input.event.eventId,
          type: input.event.type,
          atMs: input.event.atMs,
          payload: toJson({ input: input.event.payload, result }),
        },
      });
      await tx.gameSession.update({
        where: { id: session.id },
        data: {
          state: toJson(state),
          score: result.state.score,
          nextSequence: session.nextSequence + 1,
          eventCount: session.eventCount + acceptedCount,
          lastEventAtMs: lastAtMs,
        },
      });
      return { result };
    });
    if ("error" in outcome) throw outcome.error;
    return outcome.result;
  }

  async complete(input: {
    userId: string;
    game: GameSlug;
    sessionId: string;
    sessionToken: string;
    idempotencyKey: string;
    context: GameContext;
  }): Promise<{ session: GameSessionView; replayed: boolean }> {
    const completionKey = scopedKey(
      "complete",
      input.userId,
      input.game,
      input.idempotencyKey,
    );
    let outcome;
    try {
      outcome = await this.withRetry(async (tx) => {
        const session = await lockSession(tx, input.sessionId);
        validateSessionAccess(session, input, this.secret);
        if (toSlug(session.game) !== input.game) throw sessionNotFound();
        const config = await configById(tx, session.ruleVersion);
        if (session.status !== "ACTIVE") {
          if (session.completionKey === completionKey) {
            return { session, config, replayed: true };
          }
          throw sessionNotActive(session.status);
        }
        if (session.completionKey && session.completionKey !== completionKey)
          throw idempotencyConflict();
        const now = this.clock();
        if (session.expiresAt <= now) {
          const expired = await tx.gameSession.update({
            where: { id: session.id },
            data: {
              status: "EXPIRED",
              completionKey,
              completedAt: now,
              reasonCode: "SESSION_EXPIRED",
            },
          });
          return { session: expired, config, replayed: false };
        }
        const rules = rulesFor(config.parameters, input.game);
        const elapsedMs = now.getTime() - session.startedAt.getTime();
        const memory =
          input.game === "memory-drops" ? memoryState(session.state) : null;
        if (
          input.game === "tap-miner" &&
          elapsedMs < rules.durationSeconds * 1_000
        )
          throw new GameError(
            "GAME_NOT_FINISHED",
            "Tap Miner duration has not elapsed",
            409,
          );
        if (
          input.game === "memory-drops" &&
          memory!.pairs < config.parameters.memoryDrops.symbols.length &&
          elapsedMs < rules.durationSeconds * 1_000
        )
          throw new GameError(
            "GAME_NOT_FINISHED",
            "Memory Drops is not finished",
            409,
          );

        const active = await activeGamesConfig(tx, now);
        const activeRules = rulesFor(active.parameters, input.game);
        const user = await requireEligibleUser(tx, input.userId, true);
        if (
          !active.parameters.enabled ||
          !activeRules.enabled ||
          user.riskLevel > active.parameters.maxRiskLevel
        ) {
          const held = await tx.gameSession.update({
            where: { id: session.id },
            data: {
              status: "HELD",
              completionKey,
              completedAt: now,
              reasonCode:
                !active.parameters.enabled || !activeRules.enabled
                  ? "GAMES_DISABLED"
                  : "RISK_REVIEW",
            },
          });
          return { session: held, config, replayed: false };
        }
        const reward =
          input.game === "tap-miner"
            ? tapReward(
                numberField(session.state, "taps"),
                config.parameters.tapMiner,
              )
            : memoryReward(
                memory!,
                Math.min(elapsedMs, rules.durationSeconds * 1_000),
                config.parameters.memoryDrops,
              );
        const finalScore =
          input.game === "tap-miner"
            ? numberField(session.state, "taps")
            : memoryScore(
                memory!,
                memory!.pairs === config.parameters.memoryDrops.symbols.length
                  ? Math.min(
                      session.lastEventAtMs,
                      rules.durationSeconds * 1_000,
                    )
                  : rules.durationSeconds * 1_000,
                config.parameters.memoryDrops,
              );
        const pool = await tx.ledgerAccount.findUnique({
          where: { code: "platform:zyxe:game-reward-pool" },
        });
        if (!pool || !pool.active)
          throw new GameError(
            "GAME_CONFIG_INVALID",
            "Game reward pool is unavailable",
            503,
          );
        await tx.$queryRaw(Prisma.sql`
        SELECT 1 AS "acquired"
        FROM pg_advisory_xact_lock(
          hashtext(${"game-budget:" + isoDate(session.budgetDate)})
        )
      `);
        const spent = await tx.gameSession.aggregate({
          where: { budgetDate: session.budgetDate, status: "COMPLETED" },
          _sum: { rewardMinor: true },
        });
        const remaining =
          BigInt(active.parameters.dailyBudgetMinor) -
          BigInt(spent._sum.rewardMinor?.toFixed(0) ?? "0");
        if (remaining < BigInt(reward)) {
          const held = await tx.gameSession.update({
            where: { id: session.id },
            data: {
              status: "HELD",
              completionKey,
              completedAt: now,
              reasonCode: "GAME_BUDGET_EXHAUSTED",
            },
          });
          return { session: held, config, replayed: false };
        }
        const available = await tx.ledgerAccount.findFirst({
          where: {
            userId: input.userId,
            asset: "ZYXE",
            bucket: "AVAILABLE",
            active: true,
          },
        });
        if (!available)
          throw new GameError(
            "GAME_CONFIG_INVALID",
            "User reward account is unavailable",
            503,
          );
        let transaction;
        try {
          transaction = await postLedgerTransactionInTransaction(tx, {
            idempotencyKey: completionKey,
            type: "GAME_REWARD",
            sourceType: "game_session",
            sourceId: session.id,
            configVersion: session.ruleVersion,
            metadata: {
              game: input.game,
              score: finalScore,
              eventCount: session.eventCount,
              validatedServerSide: true,
            },
            postings: [
              {
                account: { id: pool.id, asset: pool.asset, kind: pool.kind },
                amount: -BigInt(reward),
              },
              {
                account: {
                  id: available.id,
                  asset: available.asset,
                  kind: available.kind,
                },
                amount: BigInt(reward),
              },
            ],
          });
        } catch (error) {
          if (error instanceof LedgerInsufficientBalanceError) {
            const held = await tx.gameSession.update({
              where: { id: session.id },
              data: {
                status: "HELD",
                completionKey,
                completedAt: now,
                reasonCode: "GAME_POOL_EXHAUSTED",
              },
            });
            return { session: held, config, replayed: false };
          }
          throw error;
        }
        const completed = await tx.gameSession.update({
          where: { id: session.id },
          data: {
            status: "COMPLETED",
            completionKey,
            completedAt: now,
            rewardMinor: String(reward),
            score: finalScore,
            transactionId: transaction.id,
            reasonCode: null,
          },
        });
        return { session: completed, config, replayed: false };
      });
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        const recovered = await this.database.gameSession.findUnique({
          where: { id: input.sessionId },
        });
        if (recovered && recovered.completionKey === completionKey) {
          validateSessionAccess(recovered, input, this.secret);
          const config = await configById(this.database, recovered.ruleVersion);
          return {
            session: publicSession(
              recovered,
              config,
              this.secret,
              true,
              this.clock(),
            ),
            replayed: true,
          };
        }
      }
      throw error;
    }
    return {
      session: publicSession(
        outcome.session,
        outcome.config,
        this.secret,
        true,
        this.clock(),
      ),
      replayed: outcome.replayed,
    };
  }

  private async withRetry<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.database.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (isSerializationError(error) && attempt < 2) continue;
        if (isSerializationError(error))
          throw new GameError(
            "GAME_BUSY",
            "Game state is busy; retry safely",
            503,
          );
        throw error;
      }
    }
    throw new GameError("GAME_BUSY", "Game state is busy; retry safely", 503);
  }
}

interface LoadedConfig {
  id: number;
  parameters: GamesConfig;
}

async function activeGamesConfig(
  client: PrismaClient | Tx,
  now: Date,
  lock = false,
): Promise<LoadedConfig> {
  const config = await client.economicConfigVersion.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }],
    },
    orderBy: { id: "desc" },
  });
  if (!config) throw configError();
  if (lock)
    await (client as Tx).$queryRaw(
      Prisma.sql`SELECT "id" FROM "EconomicConfigVersion" WHERE "id" = ${config.id} FOR UPDATE`,
    );
  return { id: config.id, parameters: parseGamesConfig(config.parameters) };
}

async function configById(
  client: PrismaClient | Tx,
  id: number,
): Promise<LoadedConfig> {
  const config = await client.economicConfigVersion.findUnique({
    where: { id },
  });
  if (!config) throw configError();
  return { id: config.id, parameters: parseGamesConfig(config.parameters) };
}

function parseGamesConfig(value: Prisma.JsonValue): GamesConfig {
  const parsed = economicConfigSchema.safeParse(value);
  if (!parsed.success) throw configError();
  const games = parsed.data.games;
  if (
    games.tapMiner.rewardMaxMinor < games.tapMiner.rewardMinMinor ||
    games.memoryDrops.rewardMaxMinor < games.memoryDrops.rewardMinMinor ||
    new Set(games.memoryDrops.symbols).size !== games.memoryDrops.symbols.length
  )
    throw configError();
  return games;
}

async function requireEligibleUser(
  client: PrismaClient | Tx,
  userId: string,
  lock: boolean,
): Promise<{ riskLevel: number }> {
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
    throw new GameError(
      "GAME_ACCOUNT_NOT_ELIGIBLE",
      "An active, verified account is required to play",
      403,
    );
  return { riskLevel: user.riskLevel };
}

async function settleEnergy(
  tx: Tx,
  userId: string,
  config: LoadedConfig,
  now: Date,
) {
  let energy = await tx.gameEnergy.findUnique({ where: { userId } });
  if (!energy) {
    return tx.gameEnergy.create({
      data: {
        userId,
        current: config.parameters.energy.initial,
        regeneratedAt: now,
        ruleVersion: config.id,
      },
    });
  }
  const intervalMs = config.parameters.energy.regenIntervalSeconds * 1_000;
  const elapsed = Math.max(0, now.getTime() - energy.regeneratedAt.getTime());
  const units = Math.floor(elapsed / intervalMs);
  const current = Math.min(
    config.parameters.energy.max,
    energy.current + units,
  );
  const regeneratedAt =
    current >= config.parameters.energy.max
      ? now
      : new Date(energy.regeneratedAt.getTime() + units * intervalMs);
  if (
    current !== energy.current ||
    energy.ruleVersion !== config.id ||
    regeneratedAt.getTime() !== energy.regeneratedAt.getTime()
  ) {
    energy = await tx.gameEnergy.update({
      where: { userId },
      data: { current, regeneratedAt, ruleVersion: config.id },
    });
  }
  return energy;
}

function energyView(
  energy: { current: number; regeneratedAt: Date },
  config: GamesConfig,
): GameEnergyView {
  return {
    current: energy.current,
    max: config.energy.max,
    regenIntervalSeconds: config.energy.regenIntervalSeconds,
    nextUnitAt:
      energy.current >= config.energy.max
        ? null
        : new Date(
            energy.regeneratedAt.getTime() +
              config.energy.regenIntervalSeconds * 1_000,
          ).toISOString(),
  };
}

function catalogItem(
  slug: GameSlug,
  rules: TapRules | MemoryRules,
  playedToday: number,
  bestScore: number | null,
  context: {
    user: { riskLevel: number };
    config: LoadedConfig;
    energy: { current: number };
    deviceCount: number;
    ipCount: number;
  },
): GameCatalogResult["games"][number] & {
  dailyRemaining: number;
  bestScore: number | null;
} {
  const { config } = context;
  let lockedReason: string | null = null;
  if (!config.parameters.enabled || !rules.enabled)
    lockedReason = "GAME_DISABLED";
  else if (context.user.riskLevel > config.parameters.maxRiskLevel)
    lockedReason = "RISK_BLOCKED";
  else if (playedToday >= config.parameters.dailySessionLimitPerGame)
    lockedReason = "DAILY_LIMIT";
  else if (context.deviceCount >= config.parameters.deviceDailySessionLimit)
    lockedReason = "DEVICE_LIMIT";
  else if (context.ipCount >= config.parameters.ipDailySessionLimit)
    lockedReason = "IP_LIMIT";
  else if (context.energy.current < rules.energyCost)
    lockedReason = "LOW_ENERGY";
  return {
    slug,
    name: slug === "tap-miner" ? "Tap Miner" : "Memory Drops",
    category: slug === "tap-miner" ? "quick" : "skill",
    difficulty: slug === "tap-miner" ? "EASY" : "MEDIUM",
    enabled: lockedReason === null,
    lockedReason,
    energyCost: rules.energyCost,
    durationSeconds: rules.durationSeconds,
    reward: {
      asset: "ZYXE",
      minMinorUnits: String(rules.rewardMinMinor),
      maxMinorUnits: String(rules.rewardMaxMinor),
      bucket: "AVAILABLE",
    },
    dailyRemaining: Math.max(
      0,
      config.parameters.dailySessionLimitPerGame - playedToday,
    ),
    bestScore,
  };
}

function publicSession(
  session: SessionRecord,
  config: LoadedConfig,
  secret: string,
  includeToken: boolean,
  now: Date,
  energy?: GameEnergyView,
): GameSessionView {
  const slug = toSlug(session.game);
  const state = asObject(session.state);
  const rules = rulesFor(config.parameters, slug);
  const serverElapsedMs = Math.max(
    0,
    now.getTime() - session.startedAt.getTime(),
  );
  const remainingMs = Math.max(
    0,
    rules.durationSeconds * 1_000 - serverElapsedMs,
  );
  const view: GameSessionView = {
    id: session.id,
    game: slug,
    status: externalStatus(session.status),
    token: sessionToken(session.id, session.nonce, secret),
    nonce: session.nonce,
    startedAt: session.startedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    nextSequence: session.nextSequence,
    score: session.score,
    reasonCode: session.reasonCode,
    reward:
      session.status === "COMPLETED" && session.rewardMinor
        ? {
            asset: "ZYXE",
            minorUnits: session.rewardMinor.toFixed(0),
            bucket: "AVAILABLE",
          }
        : null,
    transactionId: session.transactionId,
    configVersion: session.ruleVersion,
    serverNow: now.toISOString(),
    serverElapsedMs,
    remainingMs,
    rules: {
      durationSeconds: rules.durationSeconds,
      energyCost: rules.energyCost,
      reward: {
        asset: "ZYXE",
        minMinorUnits: String(rules.rewardMinMinor),
        maxMinorUnits: String(rules.rewardMaxMinor),
        bucket: "AVAILABLE",
      },
      ...(slug === "tap-miner"
        ? {
            minTapIntervalMs: config.parameters.tapMiner.minTapIntervalMs,
            maxBatchSize: config.parameters.tapMiner.maxBatchSize,
          }
        : {
            mismatchLockMs: config.parameters.memoryDrops.mismatchLockMs,
            minFlipIntervalMs: config.parameters.memoryDrops.minFlipIntervalMs,
          }),
    },
    ...(energy ? { energy } : {}),
  };
  if (slug === "tap-miner")
    view.tap = { taps: numberField(session.state, "taps") };
  else {
    const memory = memoryState(session.state);
    const layout = stringArray(session.layout);
    view.memory = {
      cardCount: config.parameters.memoryDrops.symbols.length * 2,
      matchedIndices: memory.matchedIndices,
      pendingIndex: memory.pendingIndex,
      ...(memory.pendingIndex === null
        ? {}
        : {
            pendingReveal: {
              cardIndex: memory.pendingIndex,
              symbol: layout[memory.pendingIndex]!,
            },
          }),
      pairs: memory.pairs,
      flips: memory.flips,
      lockedUntilMs: memory.lockedUntilMs,
    };
  }
  return view;
}

function validateSessionAccess(
  session: SessionRecord,
  input: { userId: string; sessionToken: string; context: GameContext },
  secret: string,
): void {
  if (session.userId !== input.userId) throw sessionNotFound();
  validateStoredContext(session, input.context);
  const expected = sessionToken(session.id, session.nonce, secret);
  if (
    !safeEqual(expected, input.sessionToken) ||
    session.tokenHash !== tokenHash(expected, secret)
  )
    throw invalidToken();
}

function validateStoredContext(
  session: Pick<SessionRecord, "deviceId" | "ipHash">,
  context: GameContext,
): void {
  if (
    session.deviceId !== context.deviceId ||
    session.ipHash !== context.ipHash
  )
    throw new GameError(
      "GAME_CONTEXT_MISMATCH",
      "Session context does not match",
      403,
    );
}

async function lockSession(tx: Tx, id: string): Promise<SessionRecord> {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "GameSession" WHERE "id" = ${id} FOR UPDATE`,
  );
  const session = await tx.gameSession.findUnique({ where: { id } });
  if (!session) throw sessionNotFound();
  return session;
}

function rulesFor(config: GamesConfig, slug: GameSlug): TapRules | MemoryRules {
  return slug === "tap-miner" ? config.tapMiner : config.memoryDrops;
}

function assertGameAvailable(
  config: GamesConfig,
  rules: GameRulesLike,
  risk: number,
) {
  if (!config.enabled || !rules.enabled)
    throw new GameError("GAME_DISABLED", "Game rewards are disabled", 503);
  if (risk > config.maxRiskLevel)
    throw new GameError(
      "GAME_RISK_BLOCKED",
      "Risk policy blocks game rewards",
      403,
    );
}

type GameRulesLike = Pick<TapRules, "enabled"> | Pick<MemoryRules, "enabled">;

function assertSessionLimits(
  config: GamesConfig,
  user: number,
  device: number,
  ip: number,
) {
  if (user >= config.dailySessionLimitPerGame)
    throw new GameError("GAME_DAILY_LIMIT", "Daily game limit reached", 429);
  if (device >= config.deviceDailySessionLimit)
    throw new GameError(
      "GAME_DEVICE_LIMIT",
      "Daily device game limit reached",
      429,
    );
  if (ip >= config.ipDailySessionLimit)
    throw new GameError(
      "GAME_IP_LIMIT",
      "Daily network game limit reached",
      429,
    );
}

function assertContextDevice(
  context: GameContext,
): asserts context is GameContext & { deviceId: string } {
  if (!context.deviceId)
    throw new GameError(
      "GAME_DEVICE_REQUIRED",
      "A session-bound device is required",
      400,
    );
}

function sessionCount(
  tx: Tx,
  input: {
    userId: string;
    game: "TAP_MINER" | "MEMORY_DROPS";
    budgetDate: Date;
  },
) {
  return tx.gameSession.count({ where: input });
}

function memoryState(value: Prisma.JsonValue): MemoryState {
  const record = asObject(value);
  return {
    matchedIndices: Array.isArray(record.matchedIndices)
      ? record.matchedIndices.filter((item): item is number =>
          Number.isSafeInteger(item),
        )
      : [],
    pendingIndex: Number.isSafeInteger(record.pendingIndex)
      ? Number(record.pendingIndex)
      : null,
    pairs: safeNumber(record.pairs),
    flips: safeNumber(record.flips),
    lockedUntilMs: safeNumber(record.lockedUntilMs),
  };
}

function numberField(value: Prisma.JsonValue, field: string): number {
  return safeNumber(asObject(value)[field]);
}

function safeNumber(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function stringArray(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw configError();
  return value as string[];
}

function parseTapOffsets(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => !Number.isSafeInteger(item))
  )
    throw new GameError("GAME_EVENT_INVALID", "Invalid tap offsets", 422);
  return value as number[];
}

function shuffleLayout(symbols: readonly string[]): string[] {
  const values = [...symbols, ...symbols];
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [values[index], values[target]] = [values[target]!, values[index]!];
  }
  return values;
}

function sessionToken(id: string, nonce: string, secret: string): string {
  const signature = createHmac("sha256", secret)
    .update(`game-session:${id}:${nonce}`)
    .digest("base64url");
  return `${id}.${nonce}.${signature}`;
}

function tokenHash(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function scopedKey(
  operation: string,
  userId: string,
  game: string,
  key: string,
) {
  return `game:${operation}:${userId}:${game}:${key}`;
}

function toKind(slug: GameSlug): "TAP_MINER" | "MEMORY_DROPS" {
  return slug === "tap-miner" ? "TAP_MINER" : "MEMORY_DROPS";
}

function toSlug(kind: "TAP_MINER" | "MEMORY_DROPS"): GameSlug {
  return kind === "TAP_MINER" ? "tap-miner" : "memory-drops";
}

function externalStatus(
  status: SessionRecord["status"],
): GameSessionView["status"] {
  return status === "COMPLETED" ? "POSTED" : status;
}

function utcDayStart(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function asObject(value: Prisma.JsonValue): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function configError() {
  return new GameError(
    "GAME_CONFIG_INVALID",
    "Game economic configuration is invalid",
    503,
  );
}

function sessionNotFound() {
  return new GameError(
    "GAME_SESSION_NOT_FOUND",
    "Game session was not found",
    404,
  );
}

function invalidToken() {
  return new GameError(
    "GAME_SESSION_TOKEN_INVALID",
    "Game session token is invalid",
    403,
  );
}

function sessionNotActive(status: string) {
  return new GameError(
    status === "EXPIRED" ? "GAME_SESSION_EXPIRED" : "GAME_SESSION_NOT_ACTIVE",
    "Game session is not active",
    status === "EXPIRED" ? 410 : 409,
  );
}

function idempotencyConflict() {
  return new GameError(
    "GAME_IDEMPOTENCY_CONFLICT",
    "Idempotency identity conflicts",
    409,
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

function isSerializationError(error: unknown): boolean {
  if (isPrismaCode(error, "P2034")) return true;
  return (
    isPrismaCode(error, "P2010") &&
    typeof error === "object" &&
    error !== null &&
    "meta" in error &&
    typeof error.meta === "object" &&
    error.meta !== null &&
    "code" in error.meta &&
    error.meta.code === "40001"
  );
}
