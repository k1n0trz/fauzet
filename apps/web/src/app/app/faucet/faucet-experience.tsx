"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../../../lib/api";
import { getDeviceId } from "../../../lib/device";

type FaucetState =
  | "READY"
  | "COOLDOWN"
  | "DAILY_LIMIT"
  | "DEVICE_LIMIT"
  | "IP_LIMIT"
  | "CAPTCHA_REQUIRED"
  | "RISK_BLOCKED"
  | "BUDGET_EXHAUSTED"
  | "DISABLED";

type FaucetStatus = {
  state: FaucetState;
  canClaim: boolean;
  captchaRequired: boolean;
  nextClaimAt: string | null;
  claimsToday: number;
  dailyClaimLimit: number;
  cooldownSeconds: number;
  reward: {
    asset: string;
    minMinorUnits: string;
    maxMinorUnits: string;
    bucket: string;
  };
  streakDays: number;
  bonusMultiplier: string;
};

type ClaimResult = {
  rewardMinorUnits: string;
  asset: string;
  nextClaimAt: string;
  replayed: boolean;
  streakDays: number;
  bonusMultiplier: string;
};

type ApiError = {
  error?: string | { message?: string };
  message?: string;
};

export function FaucetExperience() {
  const [status, setStatus] = useState<FaucetStatus | null>(null);
  const [lastClaim, setLastClaim] = useState<ClaimResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const refreshedCooldown = useRef<string | null>(null);

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      setStatus(await fetchFaucetStatus(signal));
      setNow(Date.now());
    } catch (caught) {
      if (!signal?.aborted) setError(errorMessage(caught));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function restoreStatus() {
      try {
        const faucet = await fetchFaucetStatus(controller.signal);
        if (!controller.signal.aborted) {
          setStatus(faucet);
          setNow(Date.now());
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(errorMessage(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void restoreStatus();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!status?.nextClaimAt || status.canClaim) return;

    const cooldownKey = status.nextClaimAt;
    const expiresAt = new Date(cooldownKey).getTime();
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (
        Number.isFinite(expiresAt) &&
        current >= expiresAt &&
        refreshedCooldown.current !== cooldownKey
      ) {
        refreshedCooldown.current = cooldownKey;
        void loadStatus();
      }
    };

    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [loadStatus, status?.canClaim, status?.nextClaimAt]);

  async function claim() {
    if (!status?.canClaim || claiming) return;

    setClaiming(true);
    setLastClaim(null);
    setError("");

    try {
      const deviceId = getDeviceId();
      const challengeResponse = await fetch(`${API_BASE}/faucet/challenges`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-device-id": deviceId,
        },
        body: "{}",
      });
      const challengePayload = (await readPayload(challengeResponse)) as
        | (ApiError & { challenge?: { id?: string } })
        | null;
      const challengeId = challengePayload?.challenge?.id;

      if (!challengeResponse.ok || !challengeId) {
        throw new Error(
          apiErrorMessage(challengePayload, challengeResponse.status),
        );
      }

      const claimResponse = await fetch(`${API_BASE}/faucet/claims`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
          "x-device-id": deviceId,
        },
        body: JSON.stringify({ challengeId }),
      });
      const claimPayload = (await readPayload(claimResponse)) as
        | (ApiError & {
            claim?: {
              reward?: { minorUnits?: string; asset?: string };
              nextClaimAt?: string;
              streakDays?: number;
              bonusMultiplier?: string;
            };
            replayed?: boolean;
          })
        | null;
      const postedClaim = claimPayload?.claim;

      if (
        !claimResponse.ok ||
        !postedClaim?.reward?.minorUnits ||
        !postedClaim.nextClaimAt
      ) {
        throw new Error(apiErrorMessage(claimPayload, claimResponse.status));
      }

      setLastClaim({
        rewardMinorUnits: postedClaim.reward.minorUnits,
        asset: postedClaim.reward.asset ?? "ZYXE",
        nextClaimAt: postedClaim.nextClaimAt,
        replayed: claimPayload?.replayed === true,
        streakDays: postedClaim.streakDays ?? status.streakDays,
        bonusMultiplier: postedClaim.bonusMultiplier ?? status.bonusMultiplier,
      });

      await loadStatus();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setClaiming(false);
    }
  }

  const remainingSeconds = getRemainingSeconds(status, now);
  return (
    <main className="appShell">
      <section className="faucetPage" aria-labelledby="faucet-title">
        <div className="eyebrow">Recompensas validadas</div>
        <h1 className="faucetTitle" id="faucet-title">
          <span aria-hidden="true">💧</span> Faucet
        </h1>
        <p className="lead">
          Cada claim se valida en el servidor y, si se aprueba, se acredita al
          saldo disponible con un movimiento trazable en el ledger.
        </p>

        <section className="faucetClaimCard" aria-busy={loading || claiming}>
          {loading && !status ? (
            <FaucetLoading />
          ) : status ? (
            <>
              {lastClaim ? (
                <ClaimSuccess claim={lastClaim} />
              ) : status.canClaim ? (
                <ReadyState
                  status={status}
                  claiming={claiming}
                  onClaim={claim}
                />
              ) : status.state === "COOLDOWN" ? (
                <CooldownState seconds={remainingSeconds} />
              ) : (
                <BlockedState state={status.state} />
              )}
            </>
          ) : null}

          {error && (
            <div className="faucetError" role="alert">
              <strong>No pudimos completar la operación.</strong>
              <span>{error}</span>
              <button
                className="textButton"
                type="button"
                disabled={loading || claiming}
                onClick={() => void loadStatus()}
              >
                {loading ? "Consultando…" : "Volver a intentar"}
              </button>
            </div>
          )}
        </section>

        {status && (
          <div className="faucetStats">
            <article className="faucetStatCard">
              <span>Límite diario de claims</span>
              <strong>
                {status.claimsToday}/{status.dailyClaimLimit}
              </strong>
              <progress
                value={status.claimsToday}
                max={Math.max(status.dailyClaimLimit, 1)}
                aria-label={`${status.claimsToday} de ${status.dailyClaimLimit} claims diarios usados`}
              />
              <small>El límite se reinicia a las 00:00 UTC.</small>
            </article>
            <article className="faucetStatCard">
              <span>Racha de claims</span>
              <strong>
                <span aria-hidden="true">🔥</span>{" "}
                {formatStreakDays(status.streakDays)} · ×
                {status.bonusMultiplier}
              </strong>
              <small>
                La bonificación de racha se calcula con actividad válida.
              </small>
            </article>
          </div>
        )}

        <aside className="faucetPolicy" aria-label="Reglas del faucet">
          <strong>Recompensas variables, no garantizadas.</strong> La
          disponibilidad depende del cooldown, los límites diarios, el
          presupuesto y los controles de cuenta, dispositivo y riesgo. Una
          verificación adicional puede ser necesaria.
        </aside>
      </section>
    </main>
  );
}

function FaucetLoading() {
  return (
    <div className="faucetCentered" role="status">
      <span className="faucetSpinner" aria-hidden="true" />
      <strong>Consultando tu faucet…</strong>
      <small>Validamos disponibilidad, límites y cooldown.</small>
    </div>
  );
}

function ReadyState({
  status,
  claiming,
  onClaim,
}: {
  status: FaucetStatus;
  claiming: boolean;
  onClaim: () => void;
}) {
  return (
    <div className="faucetCentered">
      <span className="faucetStateLabel faucetStateReady">
        Tu faucet está listo
      </span>
      <div className="faucetReward">
        {status.reward.minMinorUnits}–{status.reward.maxMinorUnits}{" "}
        <span>{status.reward.asset}</span>
      </div>
      <small>Rango sujeto a validación y reglas vigentes.</small>
      <button
        className="button faucetClaimButton"
        type="button"
        disabled={claiming}
        onClick={onClaim}
      >
        {claiming ? "Validando claim…" : "Reclamar ZYXEs"}
      </button>
      {claiming && (
        <p className="faucetValidationNote">
          Revisando cooldown, dispositivo y controles antifraude.
        </p>
      )}
    </div>
  );
}

function CooldownState({ seconds }: { seconds: number }) {
  return (
    <div className="faucetCentered">
      <span className="faucetStateLabel">Faucet en enfriamiento</span>
      <time className="faucetCountdown" dateTime={`PT${seconds}S`}>
        {formatCountdown(seconds)}
      </time>
      <small>
        Vuelve cuando termine la cuenta regresiva. El servidor confirma la
        disponibilidad final.
      </small>
    </div>
  );
}

function BlockedState({ state }: { state: FaucetState }) {
  const content = blockedStateContent(state);

  return (
    <div className="faucetCentered">
      <span className="faucetStateLabel">{content.title}</span>
      <div className="faucetDisabledIcon" aria-hidden="true">
        ◌
      </div>
      <small>{content.description}</small>
    </div>
  );
}

function ClaimSuccess({ claim }: { claim: ClaimResult }) {
  return (
    <div className="faucetCentered faucetSuccess" role="status">
      <span className="faucetDrop" aria-hidden="true">
        💧
      </span>
      <div className="faucetReward">
        +{claim.rewardMinorUnits} <span>{claim.asset}</span>
      </div>
      <strong>{claim.replayed ? "Claim recuperado" : "Claim aprobado"}</strong>
      <small>
        La recompensa quedó acreditada en tu saldo disponible. Próximo claim:{" "}
        {formatDateTime(claim.nextClaimAt)}. Racha:{" "}
        {formatStreakDays(claim.streakDays)} · ×{claim.bonusMultiplier}.
      </small>
      <Link className="button secondary faucetBackButton" href="/app">
        Volver al panel
      </Link>
    </div>
  );
}

function getRemainingSeconds(status: FaucetStatus | null, now: number) {
  if (!status || status.canClaim) return 0;
  if (!status.nextClaimAt) return Math.max(0, status.cooldownSeconds);
  return Math.max(
    0,
    Math.ceil((new Date(status.nextClaimAt).getTime() - now) / 1000),
  );
}

function formatCountdown(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "pendiente de confirmación";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  })
    .format(date)
    .replace(/\.$/, "");
}

function formatStreakDays(days: number) {
  return `${days} ${days === 1 ? "día" : "días"}`;
}

function blockedStateContent(state: FaucetState) {
  if (state === "DAILY_LIMIT") {
    return {
      title: "Límite diario alcanzado",
      description:
        "Ya usaste los claims disponibles de hoy. El límite se reinicia a las 00:00 UTC.",
    };
  }
  if (state === "CAPTCHA_REQUIRED") {
    return {
      title: "Verificación adicional requerida",
      description:
        "La verificación adicional aún no está habilitada en esta beta. Por seguridad, los nuevos claims quedan pausados hasta el reinicio UTC.",
    };
  }
  if (state === "DEVICE_LIMIT") {
    return {
      title: "Límite del dispositivo alcanzado",
      description:
        "Este dispositivo alcanzó su límite diario de claims. El control se reinicia a las 00:00 UTC.",
    };
  }
  if (state === "IP_LIMIT") {
    return {
      title: "Límite de red alcanzado",
      description:
        "La red actual alcanzó el límite diario antifraude. Inténtalo después del reinicio UTC.",
    };
  }
  if (state === "RISK_BLOCKED") {
    return {
      title: "Claim pausado por seguridad",
      description:
        "La cuenta requiere una revisión de seguridad antes de recibir nuevas recompensas.",
    };
  }
  if (state === "BUDGET_EXHAUSTED") {
    return {
      title: "Presupuesto diario agotado",
      description:
        "El pool del faucet no tiene presupuesto disponible ahora. Las recompensas nunca están garantizadas.",
    };
  }
  return {
    title: "Faucet no disponible",
    description:
      "Revisa la verificación de tu cuenta. La disponibilidad también puede pausarse por configuración o controles de riesgo.",
  };
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchFaucetStatus(signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}/faucet/status`, {
    credentials: "include",
    cache: "no-store",
    headers: { "x-device-id": getDeviceId() },
    signal: signal ?? null,
  });
  const payload = (await readPayload(response)) as ApiError & {
    faucet?: FaucetStatus;
  };

  if (!response.ok || !payload.faucet) {
    throw new Error(apiErrorMessage(payload, response.status));
  }

  return payload.faucet;
}

function apiErrorMessage(payload: ApiError | null, status: number) {
  if (typeof payload?.error === "string") return payload.error;
  if (payload?.error?.message) return payload.error.message;
  if (payload?.message) return payload.message;
  if (status === 401)
    return "Tu sesión expiró. Ingresa de nuevo para continuar.";
  if (status === 403)
    return "Tu cuenta no cumple todavía las condiciones para reclamar.";
  if (status === 429)
    return "Se alcanzó un límite temporal. Espera antes de volver a intentar.";
  return "El servicio no respondió como esperábamos. Inténtalo de nuevo.";
}

function errorMessage(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "Ocurrió un error inesperado. Inténtalo de nuevo.";
}
