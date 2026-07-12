import { API_BASE } from "./api";
import { getDeviceId } from "./device";
import {
  apiRequestError,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  readJson,
  type UnknownRecord,
} from "./reward-api";

export type GameSlug = "tap-miner" | "memory-drops";
export type GameCategory = "quick" | "skill" | "daily" | "premium";
export type GameAvailability =
  | "AVAILABLE"
  | "LOW_ENERGY"
  | "COOLDOWN"
  | "DAILY_LIMIT"
  | "DEVICE_LIMIT"
  | "IP_LIMIT"
  | "ACTIVE_SESSION"
  | "DISABLED"
  | "RISK_BLOCKED";

export type GameRules = {
  durationSeconds: number;
  energyCost: number;
  reward: {
    asset: string;
    minMinorUnits: string;
    maxMinorUnits: string;
  };
  minTapIntervalMs: number | null;
  maxBatchSize: number | null;
  mismatchLockMs: number | null;
  minFlipIntervalMs: number | null;
};

export type GameCatalogItem = {
  slug: GameSlug;
  name: string;
  description: string;
  category: GameCategory;
  difficulty: string;
  state: GameAvailability;
  reasonCode: string | null;
  nextAvailableAt: string | null;
  dailyRemaining: number | null;
  bestScore: number | null;
  rules: GameRules;
  configVersion: number;
};

export type GameCatalog = {
  energy: { current: number; max: number; regeneratesAt: string | null };
  games: GameCatalogItem[];
};

export type GameSession = {
  id: string;
  token: string;
  nonce: string;
  game: GameSlug;
  status: string;
  startedAt: string;
  expiresAt: string;
  nextSequence: number;
  configVersion: number;
  serverElapsedMs: number;
  remainingMs: number;
  energyRemaining: number | null;
  rules: GameRules;
  provisionalScore: number;
  memoryState: {
    cardCount: number;
    pairs: number;
    matchedIndices: number[];
    pendingReveal: { cardIndex: number; symbol: string } | null;
    lockedUntilMs: number;
  } | null;
};

export type GameEventReveal = {
  cardIndex: number;
  symbol: string;
  matched: boolean;
  matchedIndices: number[];
  pairs: number;
};

export type GameEventAck = {
  accepted: boolean;
  nextSequence: number;
  state: {
    score: number | null;
    taps: number | null;
    pairs: number | null;
    matchedIndices: number[];
    pendingIndex: number | null;
    lockedUntilMs: number | null;
  };
  configVersion: number;
  reveal: GameEventReveal | null;
};

export type GameResult = {
  sessionId: string;
  status: string;
  score: number | null;
  reward: {
    asset: string;
    minorUnits: string;
    bucket: string;
  } | null;
  reasonCode: string | null;
  transactionId: string | null;
  energyRemaining: number | null;
  configVersion: number;
  replayed: boolean;
};

export type RecoveredGameSession =
  | { kind: "active"; session: GameSession }
  | { kind: "result"; result: GameResult };

const knownGameSlugs = new Set<GameSlug>(["tap-miner", "memory-drops"]);
const gameStates = new Set<GameAvailability>([
  "AVAILABLE",
  "LOW_ENERGY",
  "COOLDOWN",
  "DAILY_LIMIT",
  "DEVICE_LIMIT",
  "IP_LIMIT",
  "ACTIVE_SESSION",
  "DISABLED",
  "RISK_BLOCKED",
]);

export async function fetchGameCatalog(signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}/games/catalog`, {
    credentials: "include",
    cache: "no-store",
    headers: { "x-device-id": getDeviceId() },
    signal: signal ?? null,
  });
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);

  const root = asRecord(payload);
  const source = asRecord(root?.catalog) ?? root;
  const energy = asRecord(source?.energy);
  const rawGames = Array.isArray(source?.games) ? source.games : [];
  const configVersion = asNumber(source?.configVersion) ?? 1;
  const games = rawGames
    .map(normalizeCatalogGame)
    .filter((game): game is GameCatalogItem => game !== null)
    .map((game) => ({ ...game, configVersion }));

  if (!source || !energy || games.length === 0) {
    throw new Error("El catálogo de juegos llegó incompleto.");
  }

  return {
    energy: {
      current: asNumber(energy.current) ?? 0,
      max: Math.max(1, asNumber(energy.max) ?? 100),
      regeneratesAt:
        asString(energy.nextUnitAt) ?? asString(energy.regeneratesAt),
    },
    games,
  } satisfies GameCatalog;
}

export async function createGameSession(
  game: GameSlug,
  idempotencyKey: string,
) {
  const response = await fetch(`${API_BASE}/games/${game}/sessions`, {
    method: "POST",
    credentials: "include",
    headers: mutationHeaders(idempotencyKey),
    body: "{}",
  });
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);
  return normalizeSession(payload, game);
}

export async function sendGameEvent(
  session: GameSession,
  event: {
    sequence: number;
    eventId: string;
    atMs: number;
    type: "TAP" | "TAP_BATCH" | "FLIP";
    payload: UnknownRecord;
  },
) {
  const response = await fetch(
    `${API_BASE}/games/${session.game}/sessions/${session.id}/events`,
    {
      method: "POST",
      credentials: "include",
      headers: mutationHeaders(event.eventId),
      body: JSON.stringify({
        sessionToken: session.token,
        sequence: event.sequence,
        nonce: session.nonce,
        eventId: event.eventId,
        type: event.type,
        atMs: event.atMs,
        payload: event.payload,
      }),
    },
  );
  const body = await readJson(response);
  if (!response.ok) throw apiRequestError(body, response.status);

  const root = asRecord(body);
  const revealSource = asRecord(root?.reveal);
  return {
    accepted: asBoolean(root?.accepted) === true,
    nextSequence: asNumber(root?.nextSequence) ?? event.sequence + 1,
    state: normalizeEventState(root?.state),
    configVersion: asNumber(root?.configVersion) ?? session.configVersion,
    reveal: revealSource ? normalizeReveal(revealSource) : null,
  } satisfies GameEventAck;
}

function normalizeEventState(value: unknown): GameEventAck["state"] {
  const state = asRecord(value);
  const rawMatched = Array.isArray(state?.matchedIndices)
    ? state.matchedIndices
    : [];
  return {
    score: asNumber(state?.score),
    taps: asNumber(state?.taps),
    pairs: asNumber(state?.pairs),
    matchedIndices: rawMatched.filter(
      (index): index is number =>
        typeof index === "number" && Number.isInteger(index),
    ),
    pendingIndex: asNumber(state?.pendingIndex),
    lockedUntilMs: asNumber(state?.lockedUntilMs),
  };
}

export async function completeGameSession(
  session: GameSession,
  idempotencyKey: string,
) {
  const response = await fetch(
    `${API_BASE}/games/${session.game}/sessions/${session.id}/complete`,
    {
      method: "POST",
      credentials: "include",
      headers: mutationHeaders(idempotencyKey),
      body: JSON.stringify({ sessionToken: session.token }),
    },
  );
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);
  return normalizeResult(payload, session.id);
}

export async function recoverGameSession(
  sessionId: string,
  sessionToken: string,
) {
  const response = await fetch(`${API_BASE}/games/sessions/${sessionId}`, {
    credentials: "include",
    cache: "no-store",
    headers: {
      "x-device-id": getDeviceId(),
      "x-game-session-token": sessionToken,
    },
  });
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);

  const root = asRecord(payload);
  const session = asRecord(root?.session) ?? root;
  const status = asString(session?.status) ?? asString(session?.state);
  const rawGame = asString(session?.game);
  if (
    session &&
    status &&
    ["CREATED", "ACTIVE", "PLAYING"].includes(status) &&
    rawGame &&
    knownGameSlugs.has(rawGame as GameSlug)
  ) {
    const game = rawGame as GameSlug;
    return {
      kind: "active",
      session: normalizeSession(payload, game, sessionToken),
    } satisfies RecoveredGameSession;
  }

  return {
    kind: "result",
    result: normalizeResult(payload, sessionId),
  } satisfies RecoveredGameSession;
}

function normalizeCatalogGame(value: unknown): GameCatalogItem | null {
  const game = asRecord(value);
  const rawSlug = asString(game?.slug) ?? asString(game?.id);
  if (!game || !rawSlug || !knownGameSlugs.has(rawSlug as GameSlug))
    return null;
  const slug = rawSlug as GameSlug;
  const presentation = gamePresentation(slug);
  const rawCategory = asString(game.category)?.toLowerCase();
  const rawState = asString(game.state)?.toUpperCase() ?? null;
  const lockedReason = asString(game.lockedReason)?.toUpperCase() ?? null;

  return {
    slug,
    name: asString(game.name) ?? presentation.name,
    description: asString(game.description) ?? presentation.description,
    category:
      rawCategory && ["skill", "daily", "premium"].includes(rawCategory)
        ? (rawCategory as GameCategory)
        : presentation.category,
    difficulty: difficultyLabel(
      asString(game.difficulty),
      presentation.difficulty,
    ),
    state: catalogGameState(game, rawState, lockedReason),
    reasonCode: asString(game.reasonCode) ?? lockedReason,
    nextAvailableAt: asString(game.nextAvailableAt),
    dailyRemaining: asNumber(game.dailyRemaining),
    bestScore: asNumber(game.bestScore),
    rules: normalizeRules(
      game.rules ?? {
        durationSeconds: game.durationSeconds,
        energyCost: game.energyCost,
        reward: game.reward,
      },
      presentation.rules,
    ),
    configVersion: asNumber(game.configVersion) ?? 1,
  };
}

function normalizeSession(
  payload: unknown,
  game: GameSlug,
  knownToken?: string,
) {
  const root = asRecord(payload);
  const source = asRecord(root?.session);
  const id = asString(source?.id);
  const token =
    asString(source?.token) ?? asString(source?.sessionToken) ?? knownToken;
  const nonce = asString(source?.nonce);
  const startedAt = asString(source?.startedAt);
  const expiresAt = asString(source?.expiresAt);
  const configVersion = asNumber(source?.configVersion);
  const serverElapsedMs = asNumber(source?.serverElapsedMs);
  const remainingMs = asNumber(source?.remainingMs);
  if (
    !source ||
    !id ||
    !token ||
    !nonce ||
    !startedAt ||
    !expiresAt ||
    configVersion === null ||
    serverElapsedMs === null ||
    remainingMs === null
  ) {
    throw new Error("El servidor no devolvió una sesión de juego válida.");
  }
  const energy = asRecord(source.energy);

  return {
    id,
    token,
    nonce,
    game,
    status: asString(source.status) ?? "ACTIVE",
    startedAt,
    expiresAt,
    nextSequence: asNumber(source.nextSequence) ?? 1,
    configVersion,
    serverElapsedMs: Math.max(0, serverElapsedMs),
    remainingMs: Math.max(0, remainingMs),
    energyRemaining:
      asNumber(source.energyRemaining) ??
      asNumber(source.energy) ??
      asNumber(energy?.current),
    rules: normalizeSessionRules(source.rules, game),
    provisionalScore: asNumber(source.score) ?? 0,
    memoryState: normalizeMemoryState(source),
  } satisfies GameSession;
}

function normalizeRules(value: unknown, fallback: GameRules): GameRules {
  const rules = asRecord(value);
  const reward = asRecord(rules?.reward);
  return {
    durationSeconds:
      asNumber(rules?.durationSeconds) ?? fallback.durationSeconds,
    energyCost: asNumber(rules?.energyCost) ?? fallback.energyCost,
    reward: {
      asset: asString(reward?.asset) ?? fallback.reward.asset,
      minMinorUnits:
        asString(reward?.minMinorUnits) ?? fallback.reward.minMinorUnits,
      maxMinorUnits:
        asString(reward?.maxMinorUnits) ?? fallback.reward.maxMinorUnits,
    },
    minTapIntervalMs:
      asNumber(rules?.minTapIntervalMs) ?? fallback.minTapIntervalMs,
    maxBatchSize: asNumber(rules?.maxBatchSize) ?? fallback.maxBatchSize,
    mismatchLockMs: asNumber(rules?.mismatchLockMs) ?? fallback.mismatchLockMs,
    minFlipIntervalMs:
      asNumber(rules?.minFlipIntervalMs) ?? fallback.minFlipIntervalMs,
  };
}

function normalizeSessionRules(value: unknown, game: GameSlug): GameRules {
  const rules = asRecord(value);
  const reward = asRecord(rules?.reward);
  const durationSeconds = asNumber(rules?.durationSeconds);
  const energyCost = asNumber(rules?.energyCost);
  const asset = asString(reward?.asset);
  const minMinorUnits = asString(reward?.minMinorUnits);
  const maxMinorUnits = asString(reward?.maxMinorUnits);
  const minTapIntervalMs = asNumber(rules?.minTapIntervalMs);
  const maxBatchSize = asNumber(rules?.maxBatchSize);
  const mismatchLockMs = asNumber(rules?.mismatchLockMs);
  const minFlipIntervalMs = asNumber(rules?.minFlipIntervalMs);
  const gameSpecificValid =
    game === "tap-miner"
      ? minTapIntervalMs !== null && maxBatchSize !== null
      : mismatchLockMs !== null && minFlipIntervalMs !== null;

  if (
    !rules ||
    durationSeconds === null ||
    energyCost === null ||
    !asset ||
    !minMinorUnits ||
    !maxMinorUnits ||
    !gameSpecificValid
  ) {
    throw new Error(
      "El servidor no devolvió el snapshot de reglas de la sesión.",
    );
  }

  return {
    durationSeconds,
    energyCost,
    reward: { asset, minMinorUnits, maxMinorUnits },
    minTapIntervalMs,
    maxBatchSize,
    mismatchLockMs,
    minFlipIntervalMs,
  };
}

function normalizeReveal(source: UnknownRecord): GameEventReveal {
  const rawIndices = Array.isArray(source.matchedIndices)
    ? source.matchedIndices
    : [];
  return {
    cardIndex: asNumber(source.cardIndex) ?? -1,
    symbol: asString(source.symbol) ?? "•",
    matched: asBoolean(source.matched) === true,
    matchedIndices: rawIndices.filter(
      (index): index is number =>
        typeof index === "number" && Number.isInteger(index),
    ),
    pairs: asNumber(source.pairs) ?? 0,
  };
}

function normalizeMemoryState(source: UnknownRecord) {
  const memory = asRecord(source.memoryState) ?? asRecord(source.memory);
  if (!memory) return null;
  const rawMatched = Array.isArray(memory.matchedIndices)
    ? memory.matchedIndices
    : [];
  const pending = asRecord(memory.pendingReveal);
  const pendingCardIndex = asNumber(pending?.cardIndex);
  const pendingSymbol = asString(pending?.symbol);
  return {
    cardCount: asNumber(memory.cardCount) ?? 12,
    pairs: asNumber(memory.pairs) ?? 0,
    matchedIndices: rawMatched.filter(
      (index): index is number =>
        typeof index === "number" && Number.isInteger(index),
    ),
    pendingReveal:
      pendingCardIndex !== null && pendingSymbol
        ? { cardIndex: pendingCardIndex, symbol: pendingSymbol }
        : null,
    lockedUntilMs: asNumber(memory.lockedUntilMs) ?? 0,
  };
}

function normalizeResult(payload: unknown, sessionId: string): GameResult {
  const root = asRecord(payload);
  const session = asRecord(root?.session) ?? root;
  const reward = asRecord(root?.reward) ?? asRecord(session?.reward);
  if (!session) throw new Error("No pudimos recuperar el resultado del juego.");
  const status =
    asString(session.status) ?? asString(session.state) ?? "VALIDATING";
  const transactionId =
    asString(session.transactionId) ?? asString(root?.transactionId);
  const configVersion = asNumber(session.configVersion);
  if (configVersion === null) {
    throw new Error("El resultado no incluyó la versión de reglas aplicada.");
  }
  return {
    sessionId,
    status,
    score: asNumber(session.score),
    reward:
      status === "POSTED" && transactionId
        ? normalizePostedReward(reward)
        : null,
    reasonCode: asString(session.reasonCode) ?? asString(root?.reasonCode),
    transactionId,
    energyRemaining:
      asNumber(session.energyRemaining) ?? asNumber(root?.energyRemaining),
    configVersion,
    replayed: asBoolean(root?.replayed) === true,
  };
}

function normalizePostedReward(value: UnknownRecord | null) {
  const asset = asString(value?.asset);
  const minorUnits = asString(value?.minorUnits);
  const bucket = asString(value?.bucket);
  return asset && minorUnits && bucket ? { asset, minorUnits, bucket } : null;
}

function catalogGameState(
  game: UnknownRecord,
  rawState: string | null,
  lockedReason: string | null,
): GameAvailability {
  if (rawState && gameStates.has(rawState as GameAvailability)) {
    return rawState as GameAvailability;
  }
  if (lockedReason) {
    const aliases: Record<string, GameAvailability> = {
      INSUFFICIENT_ENERGY: "LOW_ENERGY",
      ENERGY_INSUFFICIENT: "LOW_ENERGY",
      GAME_ENERGY_INSUFFICIENT: "LOW_ENERGY",
      LOW_ENERGY: "LOW_ENERGY",
      DAILY_LIMIT: "DAILY_LIMIT",
      GAME_DAILY_LIMIT: "DAILY_LIMIT",
      GAME_DEVICE_LIMIT: "DEVICE_LIMIT",
      GAME_IP_LIMIT: "IP_LIMIT",
      GAME_ACTIVE_SESSION_EXISTS: "ACTIVE_SESSION",
      COOLDOWN: "COOLDOWN",
      RISK_BLOCKED: "RISK_BLOCKED",
      GAME_RISK_BLOCKED: "RISK_BLOCKED",
      DISABLED: "DISABLED",
      GAME_DISABLED: "DISABLED",
    };
    if (aliases[lockedReason]) return aliases[lockedReason];
  }
  return asBoolean(game.enabled) === true ? "AVAILABLE" : "DISABLED";
}

function mutationHeaders(idempotencyKey: string) {
  return {
    "content-type": "application/json",
    "idempotency-key": idempotencyKey,
    "x-device-id": getDeviceId(),
  };
}

function difficultyLabel(value: string | null, fallback: string) {
  if (value === "EASY") return "FÁCIL";
  if (value === "MEDIUM") return "MEDIO";
  return value ?? fallback;
}

function gamePresentation(slug: GameSlug) {
  if (slug === "memory-drops") {
    return {
      name: "Memory Drops",
      description: "Encuentra los 6 pares antes de que acabe el tiempo.",
      category: "skill" as const,
      difficulty: "MEDIO",
      rules: {
        durationSeconds: 45,
        energyCost: 8,
        reward: {
          asset: "ZYXE",
          minMinorUnits: "10",
          maxMinorUnits: "40",
        },
        minTapIntervalMs: null,
        maxBatchSize: null,
        mismatchLockMs: null,
        minFlipIntervalMs: null,
      },
    };
  }
  return {
    name: "Tap Miner",
    description: "Toca lo más rápido posible durante 10 segundos.",
    category: "quick" as const,
    difficulty: "FÁCIL",
    rules: {
      durationSeconds: 10,
      energyCost: 5,
      reward: {
        asset: "ZYXE",
        minMinorUnits: "5",
        maxMinorUnits: "25",
      },
      minTapIntervalMs: null,
      maxBatchSize: null,
      mismatchLockMs: null,
      minFlipIntervalMs: null,
    },
  };
}
