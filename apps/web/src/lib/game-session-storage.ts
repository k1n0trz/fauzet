import type { GameSession, GameSlug } from "./games-api";

type StoredGameOperation = {
  startKey: string;
  completionKey?: string;
  sessionId?: string;
  sessionToken?: string;
};

export function getOrCreateStartKey(game: GameSlug) {
  const stored = readStored(game);
  if (stored?.startKey) return stored.startKey;
  const startKey = crypto.randomUUID();
  writeStored(game, { startKey });
  return startKey;
}

export function storeActiveSession(
  game: GameSlug,
  session: GameSession,
  startKey: string,
) {
  const current = readStored(game);
  writeStored(game, {
    startKey,
    sessionId: session.id,
    sessionToken: session.token,
    ...(current?.completionKey ? { completionKey: current.completionKey } : {}),
  });
}

export function getOrCreateCompletionKey(game: GameSlug) {
  const stored = readStored(game);
  if (stored?.completionKey) return stored.completionKey;
  const completionKey = crypto.randomUUID();
  writeStored(game, {
    startKey: stored?.startKey ?? crypto.randomUUID(),
    completionKey,
    ...(stored?.sessionId ? { sessionId: stored.sessionId } : {}),
    ...(stored?.sessionToken ? { sessionToken: stored.sessionToken } : {}),
  });
  return completionKey;
}

export function getStoredSession(game: GameSlug) {
  const stored = readStored(game);
  return stored?.sessionId && stored.sessionToken
    ? { id: stored.sessionId, token: stored.sessionToken }
    : null;
}

export function getPendingStartKey(game: GameSlug) {
  const stored = readStored(game);
  return stored?.startKey && !stored.sessionId ? stored.startKey : null;
}

export function clearGameOperation(game: GameSlug) {
  sessionStorage.removeItem(storageKey(game));
}

function readStored(game: GameSlug): StoredGameOperation | null {
  try {
    const raw = sessionStorage.getItem(storageKey(game));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredGameOperation>;
    return typeof value.startKey === "string"
      ? (value as StoredGameOperation)
      : null;
  } catch {
    return null;
  }
}

function writeStored(game: GameSlug, value: StoredGameOperation) {
  sessionStorage.setItem(storageKey(game), JSON.stringify(value));
}

function storageKey(game: GameSlug) {
  return `fz_game_operation_${game}`;
}
