import type { GameEventRequest, GameSlug, PublicUser } from "@fauzet/contracts";

export interface GameContext {
  ipHash: string;
  deviceId?: string;
}

export interface GameRules {
  enabled: boolean;
  energyCost: number;
  durationSeconds: number;
  rewardMinMinor: number;
  rewardMaxMinor: number;
}

export interface TapRules extends GameRules {
  rewardStepTaps: number;
  maxTaps: number;
  minTapIntervalMs: number;
  maxBatchSize: number;
}

export interface MemoryRules extends GameRules {
  symbols: readonly string[];
  mismatchLockMs: number;
  minFlipIntervalMs: number;
  completionBaseReward: number;
  partialBaseReward: number;
  rewardPerPair: number;
  timeBonusDivisorSeconds: number;
  scorePerPair: number;
}

export interface GamesConfig {
  enabled: boolean;
  dailyBudgetMinor: number;
  maxRiskLevel: number;
  dailySessionLimitPerGame: number;
  deviceDailySessionLimit: number;
  ipDailySessionLimit: number;
  completionGraceSeconds: number;
  clientLeadToleranceMs: number;
  energy: {
    max: number;
    initial: number;
    regenIntervalSeconds: number;
  };
  tapMiner: TapRules;
  memoryDrops: MemoryRules;
}

export interface GameEnergyView {
  current: number;
  max: number;
  regenIntervalSeconds: number;
  nextUnitAt: string | null;
}

export interface GameCatalogResult {
  games: Array<{
    slug: GameSlug;
    name: string;
    category: "quick" | "skill";
    difficulty: "EASY" | "MEDIUM";
    enabled: boolean;
    lockedReason: string | null;
    energyCost: number;
    durationSeconds: number;
    reward: {
      asset: "ZYXE";
      minMinorUnits: string;
      maxMinorUnits: string;
      bucket: "AVAILABLE";
    };
    dailyRemaining: number;
    bestScore: number | null;
  }>;
  energy: GameEnergyView;
  configVersion: number;
}

export interface GameSessionView {
  id: string;
  game: GameSlug;
  status: "ACTIVE" | "POSTED" | "HELD" | "REJECTED" | "EXPIRED" | "ABORTED";
  token: string;
  nonce: string;
  startedAt: string;
  expiresAt: string;
  nextSequence: number;
  score: number;
  reasonCode: string | null;
  reward: { asset: "ZYXE"; minorUnits: string; bucket: "AVAILABLE" } | null;
  transactionId: string | null;
  configVersion: number;
  serverNow: string;
  serverElapsedMs: number;
  remainingMs: number;
  rules: {
    durationSeconds: number;
    energyCost: number;
    reward: {
      asset: "ZYXE";
      minMinorUnits: string;
      maxMinorUnits: string;
      bucket: "AVAILABLE";
    };
    minTapIntervalMs?: number;
    maxBatchSize?: number;
    mismatchLockMs?: number;
    minFlipIntervalMs?: number;
  };
  energy?: GameEnergyView;
  tap?: { taps: number };
  memory?: {
    cardCount: number;
    matchedIndices: number[];
    pendingIndex: number | null;
    pendingReveal?: { cardIndex: number; symbol: string };
    pairs: number;
    flips: number;
    lockedUntilMs: number;
  };
}

export interface GameEventResult {
  accepted: true;
  nextSequence: number;
  configVersion: number;
  state: {
    score: number;
    taps?: number;
    pairs?: number;
    matchedIndices?: number[];
    pendingIndex?: number | null;
    lockedUntilMs?: number;
  };
  reveal?: {
    cardIndex: number;
    symbol: string;
    matched: boolean;
    matchedIndices: number[];
    pairs: number;
  };
}

export interface GameStore {
  catalog(userId: string, context: GameContext): Promise<GameCatalogResult>;
  createSession(input: {
    userId: string;
    game: GameSlug;
    idempotencyKey: string;
    context: GameContext;
  }): Promise<{ session: GameSessionView; replayed: boolean }>;
  getSession(input: {
    userId: string;
    sessionId: string;
    sessionToken: string;
    context: GameContext;
  }): Promise<{ session: GameSessionView }>;
  recordEvent(input: {
    userId: string;
    game: GameSlug;
    sessionId: string;
    event: GameEventRequest;
    context: GameContext;
  }): Promise<GameEventResult>;
  complete(input: {
    userId: string;
    game: GameSlug;
    sessionId: string;
    sessionToken: string;
    idempotencyKey: string;
    context: GameContext;
  }): Promise<{ session: GameSessionView; replayed: boolean }>;
}

export type GameErrorCode =
  | "GAME_ACCOUNT_NOT_ELIGIBLE"
  | "GAME_DEVICE_REQUIRED"
  | "GAME_DISABLED"
  | "GAME_RISK_BLOCKED"
  | "GAME_DAILY_LIMIT"
  | "GAME_DEVICE_LIMIT"
  | "GAME_IP_LIMIT"
  | "GAME_ENERGY_INSUFFICIENT"
  | "GAME_ACTIVE_SESSION_EXISTS"
  | "GAME_SESSION_NOT_FOUND"
  | "GAME_SESSION_TOKEN_INVALID"
  | "GAME_CONTEXT_MISMATCH"
  | "GAME_SESSION_NOT_ACTIVE"
  | "GAME_SESSION_EXPIRED"
  | "GAME_SEQUENCE_INVALID"
  | "GAME_EVENT_REPLAY"
  | "GAME_EVENT_INVALID"
  | "GAME_EVENT_TOO_FAST"
  | "GAME_NOT_FINISHED"
  | "GAME_IDEMPOTENCY_CONFLICT"
  | "GAME_CONFIG_INVALID"
  | "GAME_BUSY";

export class GameError extends Error {
  constructor(
    public readonly code: GameErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: Readonly<
      Record<string, string | number | boolean | null>
    >,
  ) {
    super(message);
    this.name = "GameError";
  }
}

export class GameService {
  constructor(private readonly store: GameStore) {}

  async catalog(user: PublicUser, context: GameContext) {
    assertEligible(user);
    return this.store.catalog(user.id, context);
  }

  async createSession(
    user: PublicUser,
    game: GameSlug,
    idempotencyKey: string,
    context: GameContext,
  ) {
    assertEligible(user);
    assertDevice(context);
    return this.store.createSession({
      userId: user.id,
      game,
      idempotencyKey,
      context,
    });
  }

  async getSession(
    user: PublicUser,
    sessionId: string,
    sessionToken: string,
    context: GameContext,
  ) {
    assertEligible(user);
    assertDevice(context);
    return this.store.getSession({
      userId: user.id,
      sessionId,
      sessionToken,
      context,
    });
  }

  async recordEvent(
    user: PublicUser,
    game: GameSlug,
    sessionId: string,
    event: GameEventRequest,
    context: GameContext,
  ) {
    assertEligible(user);
    assertDevice(context);
    return this.store.recordEvent({
      userId: user.id,
      game,
      sessionId,
      event,
      context,
    });
  }

  async complete(
    user: PublicUser,
    game: GameSlug,
    sessionId: string,
    sessionToken: string,
    idempotencyKey: string,
    context: GameContext,
  ) {
    assertEligible(user);
    assertDevice(context);
    return this.store.complete({
      userId: user.id,
      game,
      sessionId,
      sessionToken,
      idempotencyKey,
      context,
    });
  }
}

export function validateTapOffsets(
  previousAtMs: number,
  offsets: readonly number[],
  rules: Pick<
    TapRules,
    "durationSeconds" | "minTapIntervalMs" | "maxBatchSize"
  >,
): void {
  if (offsets.length < 1 || offsets.length > rules.maxBatchSize) {
    throw invalidEvent("Invalid tap batch size");
  }
  let previous = previousAtMs;
  for (const atMs of offsets) {
    if (
      !Number.isSafeInteger(atMs) ||
      atMs < 0 ||
      atMs > rules.durationSeconds * 1_000
    ) {
      throw invalidEvent("Tap timestamp is outside the session window");
    }
    if (previous >= 0 && atMs - previous < rules.minTapIntervalMs) {
      throw new GameError(
        "GAME_EVENT_TOO_FAST",
        "Tap cadence exceeds the physical limit",
        422,
      );
    }
    previous = atMs;
  }
}

export function tapReward(taps: number, rules: TapRules): number {
  const reward = rules.rewardMinMinor + Math.floor(taps / rules.rewardStepTaps);
  return Math.min(rules.rewardMaxMinor, Math.max(rules.rewardMinMinor, reward));
}

export interface MemoryState {
  matchedIndices: number[];
  pendingIndex: number | null;
  pairs: number;
  flips: number;
  lockedUntilMs: number;
}

export function applyMemoryFlip(
  state: MemoryState,
  layout: readonly string[],
  cardIndex: number,
  atMs: number,
  rules: MemoryRules,
): { state: MemoryState; reveal: NonNullable<GameEventResult["reveal"]> } {
  if (
    !Number.isSafeInteger(cardIndex) ||
    cardIndex < 0 ||
    cardIndex >= layout.length
  ) {
    throw invalidEvent("Card index is outside the board");
  }
  if (atMs < state.lockedUntilMs) {
    throw invalidEvent("Memory board is temporarily locked after a mismatch");
  }
  if (
    state.matchedIndices.includes(cardIndex) ||
    state.pendingIndex === cardIndex
  ) {
    throw invalidEvent("Card is already revealed or matched");
  }
  const symbol = layout[cardIndex]!;
  if (state.pendingIndex === null) {
    const next = { ...state, pendingIndex: cardIndex, flips: state.flips + 1 };
    return {
      state: next,
      reveal: {
        cardIndex,
        symbol,
        matched: false,
        matchedIndices: [...next.matchedIndices],
        pairs: next.pairs,
      },
    };
  }

  const first = state.pendingIndex;
  const matched = layout[first] === symbol;
  const matchedIndices = matched
    ? [...state.matchedIndices, first, cardIndex].sort((a, b) => a - b)
    : [...state.matchedIndices];
  const next: MemoryState = {
    matchedIndices,
    pendingIndex: null,
    pairs: state.pairs + (matched ? 1 : 0),
    flips: state.flips + 1,
    lockedUntilMs: matched ? atMs : atMs + rules.mismatchLockMs,
  };
  return {
    state: next,
    reveal: {
      cardIndex,
      symbol,
      matched,
      matchedIndices: [...next.matchedIndices],
      pairs: next.pairs,
    },
  };
}

export function memoryScore(
  state: MemoryState,
  atMs: number,
  rules: MemoryRules,
): number {
  const remaining = Math.max(
    0,
    rules.durationSeconds - Math.floor(atMs / 1_000),
  );
  return state.pairs * rules.scorePerPair + remaining;
}

export function memoryReward(
  state: MemoryState,
  elapsedMs: number,
  rules: MemoryRules,
): number {
  const remaining = Math.max(
    0,
    rules.durationSeconds - Math.floor(elapsedMs / 1_000),
  );
  const raw =
    state.pairs === rules.symbols.length
      ? rules.completionBaseReward +
        Math.floor(remaining / rules.timeBonusDivisorSeconds)
      : rules.partialBaseReward + state.pairs * rules.rewardPerPair;
  return Math.min(rules.rewardMaxMinor, Math.max(rules.rewardMinMinor, raw));
}

function assertEligible(user: PublicUser): void {
  if (user.status !== "ACTIVE") {
    throw new GameError(
      "GAME_ACCOUNT_NOT_ELIGIBLE",
      "An active, verified account is required to play",
      403,
    );
  }
}

function assertDevice(context: GameContext): void {
  if (!context.deviceId) {
    throw new GameError(
      "GAME_DEVICE_REQUIRED",
      "A valid session-bound UUIDv4 x-device-id is required",
      400,
    );
  }
}

function invalidEvent(message: string): GameError {
  return new GameError("GAME_EVENT_INVALID", message, 422);
}
