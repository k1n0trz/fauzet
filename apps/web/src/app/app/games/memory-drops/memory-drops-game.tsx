"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  completeGameSession,
  createGameSession,
  recoverGameSession,
  sendGameEvent,
  type GameResult,
  type GameRules,
  type GameSession,
} from "../../../../lib/games-api";
import {
  clearGameOperation,
  getOrCreateCompletionKey,
  getOrCreateStartKey,
  getPendingStartKey,
  getStoredSession,
  storeActiveSession,
} from "../../../../lib/game-session-storage";
import { canDiscardGameState, errorMessage } from "../../../../lib/reward-api";
import { GameIntro } from "../game-intro";
import { GameRecovery } from "../game-recovery";
import { GameResultView } from "../game-result";
import { useGameCatalog } from "../use-game-catalog";

type GamePhase =
  | "intro"
  | "reserving"
  | "playing"
  | "submitting"
  | "validating"
  | "result"
  | "recovery";
type CardState = "hidden" | "pending" | "revealed" | "matched";
type MemoryCardState = {
  index: number;
  state: CardState;
  symbol: string | null;
};
type SessionClock = {
  monotonicOrigin: number;
  initialElapsedMs: number;
  lastAtMs: number;
};

const defaultRules: GameRules = {
  durationSeconds: 45,
  energyCost: 8,
  reward: { asset: "ZYXE", minMinorUnits: "10", maxMinorUnits: "40" },
  minTapIntervalMs: null,
  maxBatchSize: null,
  mismatchLockMs: null,
  minFlipIntervalMs: null,
};

export function MemoryDropsGame() {
  const { catalog, loading, error: catalogError, refresh } = useGameCatalog();
  const game =
    catalog?.games.find((item) => item.slug === "memory-drops") ?? null;
  const rules = game?.rules ?? defaultRules;
  const [phase, setPhase] = useState<GamePhase>("intro");
  const [session, setSession] = useState<GameSession | null>(null);
  const [cards, setCards] = useState(() => createCards(12));
  const [pairs, setPairs] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(rules.durationSeconds);
  const [endsAtMonotonic, setEndsAtMonotonic] = useState<number | null>(null);
  const [eventPending, setEventPending] = useState(false);
  const [boardLocked, setBoardLocked] = useState(false);
  const [lockEndsAtMonotonic, setLockEndsAtMonotonic] = useState<number | null>(
    null,
  );
  const [minFlipLocked, setMinFlipLocked] = useState(false);
  const [minFlipEndsAtMonotonic, setMinFlipEndsAtMonotonic] = useState<
    number | null
  >(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [hasPendingReservation, setHasPendingReservation] = useState(false);
  const [discardAllowed, setDiscardAllowed] = useState(false);
  const sequenceRef = useRef(1);
  const clockRef = useRef<SessionClock | null>(null);
  const revealedIndicesRef = useRef<number[]>([]);
  const mismatchIndicesRef = useRef<number[]>([]);
  const pendingEventRef = useRef<Promise<void>>(Promise.resolve());
  const eventFailureRef = useRef<Error | null>(null);
  const completionStartedRef = useRef(false);

  const hydrateActiveSession = useCallback((active: GameSession) => {
    setSession(active);
    setPairs(active.memoryState?.pairs ?? 0);
    setScore(active.provisionalScore);
    setCards(
      createCards(active.memoryState?.cardCount ?? 12).map((card) =>
        active.memoryState?.matchedIndices.includes(card.index)
          ? { ...card, state: "matched", symbol: "✓" }
          : active.memoryState?.pendingReveal?.cardIndex === card.index
            ? {
                ...card,
                state: "revealed",
                symbol: active.memoryState.pendingReveal.symbol,
              }
            : card,
      ),
    );
    sequenceRef.current = active.nextSequence;
    clockRef.current = createSessionClock(active);
    revealedIndicesRef.current = active.memoryState?.pendingReveal
      ? [active.memoryState.pendingReveal.cardIndex]
      : [];
    mismatchIndicesRef.current = [];
    pendingEventRef.current = Promise.resolve();
    eventFailureRef.current = null;
    completionStartedRef.current = false;
    setDiscardAllowed(false);
    setEventPending(false);
    const lockRemaining = Math.max(
      0,
      (active.memoryState?.lockedUntilMs ?? 0) - active.serverElapsedMs,
    );
    setBoardLocked(lockRemaining > 0);
    setLockEndsAtMonotonic(
      lockRemaining > 0 ? performance.now() + lockRemaining : null,
    );
    const minFlipLock = active.memoryState?.pendingReveal
      ? (active.rules.minFlipIntervalMs ?? 0)
      : 0;
    setMinFlipLocked(minFlipLock > 0);
    setMinFlipEndsAtMonotonic(
      minFlipLock > 0 ? performance.now() + minFlipLock : null,
    );
    setEndsAtMonotonic(performance.now() + active.remainingMs);
    setTimeLeft(Math.max(0, Math.ceil(active.remainingMs / 1000)));
    setPhase("playing");
  }, []);

  const finishSession = useCallback(async () => {
    if (!session || completionStartedRef.current) return;
    completionStartedRef.current = true;
    setPhase("submitting");
    try {
      await pendingEventRef.current;
      if (eventFailureRef.current) throw eventFailureRef.current;
      setPhase("validating");
      const finalResult = await completeGameSession(
        session,
        getOrCreateCompletionKey("memory-drops"),
      );
      setResult(finalResult);
      clearGameOperation("memory-drops");
      setPhase("result");
    } catch (caught) {
      setError(errorMessage(caught));
      setDiscardAllowed(canDiscardGameState(caught));
      setPhase("recovery");
    } finally {
      completionStartedRef.current = false;
    }
  }, [session]);

  useEffect(() => {
    if (phase !== "playing" || endsAtMonotonic === null) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((endsAtMonotonic - performance.now()) / 1000),
      );
      setTimeLeft(remaining);
      if (remaining === 0) void finishSession();
    }, 200);
    return () => window.clearInterval(timer);
  }, [endsAtMonotonic, finishSession, phase]);

  useEffect(() => {
    if (lockEndsAtMonotonic === null) return;
    const delay = Math.max(0, lockEndsAtMonotonic - performance.now());
    const timer = window.setTimeout(() => {
      const mismatch = mismatchIndicesRef.current;
      setCards((current) =>
        current.map((card) =>
          mismatch.includes(card.index) && card.state !== "matched"
            ? { ...card, state: "hidden", symbol: null }
            : card,
        ),
      );
      mismatchIndicesRef.current = [];
      setBoardLocked(false);
      setLockEndsAtMonotonic(null);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [lockEndsAtMonotonic]);

  useEffect(() => {
    if (minFlipEndsAtMonotonic === null) return;
    const delay = Math.max(0, minFlipEndsAtMonotonic - performance.now());
    const timer = window.setTimeout(() => {
      setMinFlipLocked(false);
      setMinFlipEndsAtMonotonic(null);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [minFlipEndsAtMonotonic]);

  useEffect(() => {
    let cancelled = false;

    async function restoreStoredOperation() {
      await Promise.resolve();
      if (cancelled) return;
      setHasPendingReservation(getPendingStartKey("memory-drops") !== null);
      const stored = getStoredSession("memory-drops");
      if (!stored) return;

      setPhase("recovery");
      setRecovering(true);
      setError("Encontramos una sesión pendiente. Recuperando estado…");
      try {
        const recovered = await recoverGameSession(stored.id, stored.token);
        if (cancelled) return;
        if (recovered.kind === "result") {
          setResult(recovered.result);
          clearGameOperation("memory-drops");
          setPhase("result");
        } else {
          hydrateActiveSession(recovered.session);
        }
        setError("");
      } catch (caught) {
        if (!cancelled) {
          setError(errorMessage(caught));
          setDiscardAllowed(canDiscardGameState(caught));
        }
      } finally {
        if (!cancelled) setRecovering(false);
      }
    }

    void restoreStoredOperation();
    return () => {
      cancelled = true;
    };
  }, [hydrateActiveSession]);

  async function start() {
    if ((!game || game.state !== "AVAILABLE") && !hasPendingReservation) return;
    setPhase("reserving");
    setError("");
    setDiscardAllowed(false);
    setResult(null);
    try {
      const startKey = getOrCreateStartKey("memory-drops");
      const created = await createGameSession("memory-drops", startKey);
      hydrateActiveSession(created);
      storeActiveSession("memory-drops", created, startKey);
      setHasPendingReservation(false);
    } catch (caught) {
      setError(errorMessage(caught));
      setHasPendingReservation(true);
      const canDiscard = canDiscardGameState(caught);
      setDiscardAllowed(canDiscard);
      setPhase(canDiscard ? "recovery" : "intro");
    }
  }

  async function flip(cardIndex: number) {
    if (
      phase !== "playing" ||
      !session ||
      !clockRef.current ||
      eventPending ||
      boardLocked ||
      minFlipLocked ||
      cards[cardIndex]?.state !== "hidden"
    ) {
      return;
    }

    const minFlipIntervalMs = session.rules.minFlipIntervalMs;
    const mismatchLockMs = session.rules.mismatchLockMs;
    if (minFlipIntervalMs === null || mismatchLockMs === null) {
      setError("La sesión no incluye las reglas de bloqueo firmadas.");
      setPhase("recovery");
      return;
    }

    setEventPending(true);
    setCards((current) =>
      current.map((card) =>
        card.index === cardIndex ? { ...card, state: "pending" } : card,
      ),
    );
    const sequence = sequenceRef.current;
    sequenceRef.current += 1;
    const atMs = nextEventAt(clockRef.current);
    const eventPromise = sendGameEvent(session, {
      sequence,
      eventId: crypto.randomUUID(),
      atMs,
      type: "FLIP",
      payload: { cardIndex },
    });
    pendingEventRef.current = eventPromise.then(
      () => undefined,
      (caught: unknown) => {
        eventFailureRef.current =
          caught instanceof Error
            ? caught
            : new Error("Se perdió la sincronización de la sesión.");
      },
    );

    try {
      const ack = await eventPromise;
      if (!ack.accepted || !ack.reveal || ack.reveal.cardIndex !== cardIndex) {
        throw new Error("El servidor no confirmó el flip de la carta.");
      }
      sequenceRef.current = Math.max(sequenceRef.current, ack.nextSequence);
      const elapsedNow = currentServerElapsed(clockRef.current);
      const minFlipRemaining = Math.max(
        0,
        atMs + minFlipIntervalMs - elapsedNow,
      );
      setMinFlipLocked(minFlipRemaining > 0);
      setMinFlipEndsAtMonotonic(
        minFlipRemaining > 0
          ? monotonicAtElapsed(clockRef.current, atMs + minFlipIntervalMs)
          : null,
      );
      const reveal = ack.reveal;
      const acceptedPairs = ack.state.pairs ?? reveal.pairs;
      const matchedIndices =
        ack.state.matchedIndices.length > 0
          ? ack.state.matchedIndices
          : reveal.matchedIndices;
      setCards((current) =>
        current.map((card) => {
          if (card.state === "matched") return card;
          if (matchedIndices.includes(card.index)) {
            return {
              ...card,
              state: "matched",
              symbol: card.symbol ?? reveal.symbol,
            };
          }
          if (card.index === cardIndex) {
            return { ...card, state: "revealed", symbol: reveal.symbol };
          }
          return card;
        }),
      );
      setPairs(acceptedPairs);
      setScore(ack.state.score ?? acceptedPairs * 10 + timeLeft);

      if (reveal.matched) {
        revealedIndicesRef.current = [];
        if (acceptedPairs >= 6) void finishSession();
      } else if (revealedIndicesRef.current.length === 0) {
        revealedIndicesRef.current = [cardIndex];
      } else {
        const mismatch = [...revealedIndicesRef.current, cardIndex];
        revealedIndicesRef.current = [];
        mismatchIndicesRef.current = mismatch;
        const lockedUntilMs = ack.state.lockedUntilMs ?? atMs + mismatchLockMs;
        const lockRemaining = Math.max(
          0,
          lockedUntilMs - currentServerElapsed(clockRef.current),
        );
        setBoardLocked(lockRemaining > 0);
        setLockEndsAtMonotonic(
          lockRemaining > 0
            ? monotonicAtElapsed(clockRef.current, lockedUntilMs)
            : null,
        );
      }
    } catch (caught) {
      const failure =
        caught instanceof Error
          ? caught
          : new Error("Se perdió la sincronización de la sesión.");
      eventFailureRef.current = failure;
      setError(failure.message);
      setDiscardAllowed(canDiscardGameState(caught));
      setPhase("recovery");
    } finally {
      setEventPending(false);
    }
  }

  async function recover() {
    const stored = getStoredSession("memory-drops");
    const active =
      stored ?? (session ? { id: session.id, token: session.token } : null);
    if (!active) {
      setError("No encontramos una sesión pendiente para recuperar.");
      return;
    }

    setRecovering(true);
    setDiscardAllowed(false);
    try {
      const recovered = await recoverGameSession(active.id, active.token);
      if (recovered.kind === "result") {
        setResult(recovered.result);
        clearGameOperation("memory-drops");
        setPhase("result");
      } else {
        hydrateActiveSession(recovered.session);
      }
      setError("");
    } catch (caught) {
      setError(errorMessage(caught));
      setDiscardAllowed(canDiscardGameState(caught));
    } finally {
      setRecovering(false);
    }
  }

  function playAgain() {
    clearGameOperation("memory-drops");
    setPhase("intro");
    setSession(null);
    setResult(null);
    setCards(createCards(12));
    setPairs(0);
    setScore(0);
    setError("");
    setHasPendingReservation(false);
    setDiscardAllowed(false);
    void refresh();
  }

  function discardLocalState() {
    if (!discardAllowed) return;
    clearGameOperation("memory-drops");
    setSession(null);
    setResult(null);
    setCards(createCards(12));
    setPairs(0);
    setScore(0);
    setError("");
    setDiscardAllowed(false);
    setHasPendingReservation(false);
    setPhase("intro");
    void refresh();
  }

  return (
    <section className="gameExperience">
      {catalogError ? (
        <div className="rewardError" role="alert">
          <strong>No pudimos confirmar la disponibilidad.</strong>
          <span>{catalogError}</span>
          <button type="button" onClick={() => void refresh()}>
            Reintentar
          </button>
        </div>
      ) : null}
      {error && phase !== "recovery" ? (
        <div className="gameInlineError" role="alert">
          {error}
        </div>
      ) : null}

      {phase === "intro" || phase === "reserving" ? (
        <GameIntro
          slug="memory-drops"
          title="Memory Drops"
          description="Encuentra 6 pares antes de que acabe el tiempo. Cada carta se revela únicamente después de la confirmación del servidor."
          rules={rules}
          game={game}
          loading={loading}
          starting={phase === "reserving"}
          allowReservationRetry={hasPendingReservation}
          onStart={() => void start()}
        />
      ) : null}

      {phase === "playing" ? (
        <section className="gameStage activeGame memoryGame">
          <div className="gameLiveStats">
            <span>
              Tiempo <strong>{timeLeft}s</strong>
            </span>
            <span>
              Pares <strong>{pairs}/6</strong>
            </span>
            <span>
              Score provisional <strong>{score}</strong>
            </span>
          </div>
          <h1>Memory Drops</h1>
          <div
            className="memoryBoard"
            role="group"
            aria-label="Tablero de 12 cartas"
          >
            {cards.map((card) => (
              <button
                className={`memoryCard ${card.state}`}
                type="button"
                disabled={
                  eventPending ||
                  boardLocked ||
                  minFlipLocked ||
                  card.state === "matched" ||
                  card.state === "revealed" ||
                  card.state === "pending"
                }
                aria-label={cardLabel(card)}
                key={`memory-card-${card.index}`}
                onClick={() => void flip(card.index)}
              >
                {card.state === "hidden"
                  ? "?"
                  : card.state === "pending"
                    ? "…"
                    : card.symbol}
              </button>
            ))}
          </div>
          <p>
            {boardLocked
              ? "No fue pareja. Las cartas volverán a ocultarse."
              : minFlipLocked
                ? "Espera un instante antes del próximo flip."
                : eventPending
                  ? "Confirmando flip con el servidor…"
                  : "Selecciona una carta oculta."}
          </p>
        </section>
      ) : null}

      {phase === "submitting" || phase === "validating" ? (
        <section className="gameStage gameValidation" role="status">
          <span className="faucetSpinner" aria-hidden="true" />
          <h1>
            {phase === "submitting"
              ? "Cerrando la sesión…"
              : "Validando la ronda…"}
          </h1>
          <p>
            El servidor reconstruye las jugadas, la secuencia y el tiempo antes
            de decidir si existe recompensa.
          </p>
        </section>
      ) : null}

      {phase === "recovery" ? (
        <GameRecovery
          message={error}
          recovering={recovering}
          canDiscard={discardAllowed}
          onRecover={() => void recover()}
          onDiscard={discardLocalState}
        />
      ) : null}

      {phase === "result" && result ? (
        <GameResultView
          result={result}
          provisionalScore={score}
          onAgain={playAgain}
        />
      ) : null}
    </section>
  );
}

function createCards(count: number): MemoryCardState[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    state: "hidden",
    symbol: null,
  }));
}

function cardLabel(card: MemoryCardState) {
  if (card.state === "matched")
    return `Carta ${card.index + 1}, pareja encontrada`;
  if (card.state === "revealed")
    return `Carta ${card.index + 1}, ${card.symbol ?? "revelada"}`;
  if (card.state === "pending")
    return `Carta ${card.index + 1}, esperando confirmación`;
  return `Carta ${card.index + 1}, oculta`;
}

function createSessionClock(session: GameSession): SessionClock {
  return {
    monotonicOrigin: performance.now(),
    initialElapsedMs: session.serverElapsedMs,
    lastAtMs: session.serverElapsedMs - 1,
  };
}

function nextEventAt(clock: SessionClock) {
  const raw = Math.round(currentServerElapsed(clock));
  const next = Math.max(clock.lastAtMs + 1, raw);
  clock.lastAtMs = next;
  return next;
}

function currentServerElapsed(clock: SessionClock) {
  return clock.initialElapsedMs + (performance.now() - clock.monotonicOrigin);
}

function monotonicAtElapsed(clock: SessionClock, elapsedMs: number) {
  return clock.monotonicOrigin + elapsedMs - clock.initialElapsedMs;
}
