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

type SessionClock = {
  monotonicOrigin: number;
  initialElapsedMs: number;
  lastAtMs: number;
};

const defaultRules: GameRules = {
  durationSeconds: 10,
  energyCost: 5,
  reward: { asset: "ZYXE", minMinorUnits: "5", maxMinorUnits: "25" },
  minTapIntervalMs: null,
  maxBatchSize: null,
  mismatchLockMs: null,
  minFlipIntervalMs: null,
};

export function TapMinerGame() {
  const { catalog, loading, error: catalogError, refresh } = useGameCatalog();
  const game = catalog?.games.find((item) => item.slug === "tap-miner") ?? null;
  const rules = game?.rules ?? defaultRules;
  const [phase, setPhase] = useState<GamePhase>("intro");
  const [session, setSession] = useState<GameSession | null>(null);
  const [score, setScore] = useState(0);
  const [serverScore, setServerScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(rules.durationSeconds);
  const [endsAtMonotonic, setEndsAtMonotonic] = useState<number | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [hasPendingReservation, setHasPendingReservation] = useState(false);
  const [discardAllowed, setDiscardAllowed] = useState(false);
  const sequenceRef = useRef(1);
  const clockRef = useRef<SessionClock | null>(null);
  const lastTapAtRef = useRef(-1);
  const tapBufferRef = useRef<number[]>([]);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const eventFailureRef = useRef<Error | null>(null);
  const completionStartedRef = useRef(false);

  const hydrateActiveSession = useCallback((active: GameSession) => {
    setSession(active);
    setScore(active.provisionalScore);
    setServerScore(active.provisionalScore);
    sequenceRef.current = active.nextSequence;
    clockRef.current = createSessionClock(active);
    tapBufferRef.current = [];
    queueRef.current = Promise.resolve();
    eventFailureRef.current = null;
    completionStartedRef.current = false;
    setDiscardAllowed(false);
    lastTapAtRef.current = -1;
    setEndsAtMonotonic(performance.now() + active.remainingMs);
    setTimeLeft(Math.max(0, Math.ceil(active.remainingMs / 1000)));
    setPhase("playing");
  }, []);

  const flushTapBuffer = useCallback(() => {
    if (!session || tapBufferRef.current.length === 0) return;
    const maxBatchSize = session.rules.maxBatchSize;
    if (maxBatchSize === null) {
      setError("La sesión no incluye el límite de batch firmado.");
      setPhase("recovery");
      return;
    }
    const offsets = tapBufferRef.current.splice(0);
    for (let offset = 0; offset < offsets.length; offset += maxBatchSize) {
      const batch = offsets.slice(offset, offset + maxBatchSize);
      const sequence = sequenceRef.current;
      sequenceRef.current += 1;
      const eventId = crypto.randomUUID();
      const atMs = batch[batch.length - 1] ?? 0;

      queueRef.current = queueRef.current
        .then(async () => {
          if (eventFailureRef.current) throw eventFailureRef.current;
          const ack = await sendGameEvent(session, {
            sequence,
            eventId,
            atMs,
            type: "TAP_BATCH",
            payload: { tapOffsetsMs: batch },
          });
          if (!ack.accepted)
            throw new Error("El servidor rechazó un lote de taps.");
          setServerScore(ack.state.score ?? ack.state.taps ?? 0);
          sequenceRef.current = Math.max(sequenceRef.current, ack.nextSequence);
        })
        .catch((caught: unknown) => {
          const failure =
            caught instanceof Error
              ? caught
              : new Error("Se perdió la sincronización de la sesión.");
          eventFailureRef.current = failure;
          setDiscardAllowed(canDiscardGameState(caught));
          setError(failure.message);
          setPhase("recovery");
        });
    }
  }, [session]);

  const finishSession = useCallback(async () => {
    if (!session || completionStartedRef.current) return;
    completionStartedRef.current = true;
    flushTapBuffer();
    setPhase("submitting");

    try {
      await queueRef.current;
      if (eventFailureRef.current) throw eventFailureRef.current;
      setPhase("validating");
      const finalResult = await completeGameSession(
        session,
        getOrCreateCompletionKey("tap-miner"),
      );
      setResult(finalResult);
      clearGameOperation("tap-miner");
      setPhase("result");
    } catch (caught) {
      setError(errorMessage(caught));
      setDiscardAllowed(canDiscardGameState(caught));
      setPhase("recovery");
    } finally {
      completionStartedRef.current = false;
    }
  }, [flushTapBuffer, session]);

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(flushTapBuffer, 400);
    return () => window.clearInterval(timer);
  }, [flushTapBuffer, phase]);

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
    let cancelled = false;

    async function restoreStoredOperation() {
      await Promise.resolve();
      if (cancelled) return;
      setHasPendingReservation(getPendingStartKey("tap-miner") !== null);
      const stored = getStoredSession("tap-miner");
      if (!stored) return;

      setPhase("recovery");
      setRecovering(true);
      setError("Encontramos una sesión pendiente. Recuperando estado…");
      try {
        const recovered = await recoverGameSession(stored.id, stored.token);
        if (cancelled) return;
        if (recovered.kind === "result") {
          setResult(recovered.result);
          clearGameOperation("tap-miner");
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
      const startKey = getOrCreateStartKey("tap-miner");
      const created = await createGameSession("tap-miner", startKey);
      hydrateActiveSession(created);
      storeActiveSession("tap-miner", created, startKey);
      setHasPendingReservation(false);
    } catch (caught) {
      setError(errorMessage(caught));
      setHasPendingReservation(true);
      const canDiscard = canDiscardGameState(caught);
      setDiscardAllowed(canDiscard);
      setPhase(canDiscard ? "recovery" : "intro");
    }
  }

  function tap() {
    if (phase !== "playing" || !session || !clockRef.current) return;
    const atMs = nextEventAt(clockRef.current);
    const minInterval = session.rules.minTapIntervalMs;
    if (
      minInterval === null ||
      (lastTapAtRef.current >= 0 && atMs - lastTapAtRef.current < minInterval)
    ) {
      return;
    }
    lastTapAtRef.current = atMs;
    tapBufferRef.current.push(atMs);
    setScore((current) => current + 1);
  }

  async function recover() {
    const stored = getStoredSession("tap-miner");
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
        clearGameOperation("tap-miner");
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
    clearGameOperation("tap-miner");
    setPhase("intro");
    setSession(null);
    setResult(null);
    setScore(0);
    setServerScore(0);
    setError("");
    setHasPendingReservation(false);
    setDiscardAllowed(false);
    void refresh();
  }

  function discardLocalState() {
    if (!discardAllowed) return;
    clearGameOperation("tap-miner");
    setSession(null);
    setResult(null);
    setError("");
    setDiscardAllowed(false);
    setHasPendingReservation(false);
    setPhase("intro");
    void refresh();
  }

  return (
    <section className="gameExperience" aria-labelledby="tap-miner-title">
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
          slug="tap-miner"
          title="Tap Miner"
          description="Toca el pico tantas veces como puedas durante 10 segundos. Cada tap se agrupa y valida con secuencia y tiempo del servidor."
          rules={rules}
          game={game}
          loading={loading}
          starting={phase === "reserving"}
          allowReservationRetry={hasPendingReservation}
          onStart={() => void start()}
        />
      ) : null}

      {phase === "playing" ? (
        <section className="gameStage activeGame" aria-live="off">
          <div className="gameLiveStats">
            <span>
              Tiempo <strong>{timeLeft}s</strong>
            </span>
            <span>
              Score provisional <strong>{score}</strong>
            </span>
            <span>
              Aceptados <strong>{serverScore}</strong>
            </span>
          </div>
          <h1 id="tap-miner-title">Tap Miner</h1>
          <button
            className="tapTarget"
            type="button"
            aria-label="Tocar el pico para sumar un punto provisional"
            onClick={tap}
          >
            ⛏️
          </button>
          <p>Toca o presiona espacio tan rápido como puedas.</p>
        </section>
      ) : null}

      {phase === "submitting" || phase === "validating" ? (
        <section className="gameStage gameValidation" role="status">
          <span className="faucetSpinner" aria-hidden="true" />
          <h1>
            {phase === "submitting"
              ? "Enviando los últimos eventos…"
              : "Validando la ronda…"}
          </h1>
          <p>
            El servidor revisa secuencia, duración, límites físicos y riesgo
            antes de decidir si existe recompensa.
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

function createSessionClock(session: GameSession): SessionClock {
  return {
    monotonicOrigin: performance.now(),
    initialElapsedMs: session.serverElapsedMs,
    lastAtMs: session.serverElapsedMs - 1,
  };
}

function nextEventAt(clock: SessionClock) {
  const raw = Math.round(
    clock.initialElapsedMs + (performance.now() - clock.monotonicOrigin),
  );
  const next = Math.max(clock.lastAtMs + 1, raw);
  clock.lastAtMs = next;
  return next;
}
