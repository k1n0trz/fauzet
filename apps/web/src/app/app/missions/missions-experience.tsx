"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  claimMission,
  fetchMissions,
  type Mission,
  type MissionCatalog,
  type MissionCategory,
  type MissionClaim,
} from "../../../lib/missions-api";
import { errorMessage } from "../../../lib/reward-api";

type MissionFilter = "all" | MissionCategory;

const filters = [
  { id: "all", label: "Todas" },
  { id: "daily", label: "Diarias" },
  { id: "weekly", label: "Semanales" },
  { id: "mining", label: "Minería" },
  { id: "crew", label: "Crew" },
  { id: "premium", label: "Premium" },
] as const;

export function MissionsExperience() {
  const [catalog, setCatalog] = useState<MissionCatalog | null>(null);
  const [filter, setFilter] = useState<MissionFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [lastClaim, setLastClaim] = useState<MissionClaim | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchMissions();
      cleanupClaimedMissionKeys(result.missions);
      setCatalog(result);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const result = await fetchMissions(controller.signal);
        if (!controller.signal.aborted) {
          cleanupClaimedMissionKeys(result.missions);
          setCatalog(result);
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(errorMessage(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  async function submitClaim(mission: Mission) {
    if (mission.status !== "CLAIMABLE" || claimingId) return;
    setClaimingId(mission.id);
    setError("");
    setLastClaim(null);
    const key = getOrCreateMissionClaimKey(mission);
    try {
      const claim = await claimMission(
        mission.id,
        mission.periodKey,
        mission.configVersion,
        key,
      );
      setLastClaim(claim);
      clearMissionClaimKey(mission.id, mission.periodKey);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setClaimingId(null);
    }
  }

  const missions =
    catalog?.missions.filter(
      (mission) => filter === "all" || mission.category === filter,
    ) ?? [];

  return (
    <section className="rewardsPage" aria-labelledby="missions-title">
      <div className="missionsHeading">
        <Image
          src="/rewards/ic-missions.png"
          width={70}
          height={70}
          alt=""
          priority
        />
        <div>
          <div className="eyebrow">Progreso verificable</div>
          <h1 className="rewardsTitle" id="missions-title">
            Centro de misiones
          </h1>
          <p className="lead">
            El progreso proviene únicamente de actividad validada. Completar una
            barra no acredita saldo hasta confirmar el claim.
          </p>
        </div>
      </div>

      {catalog?.summary ? <MissionSummary summary={catalog.summary} /> : null}

      <div className="rewardFilters" role="group" aria-label="Filtrar misiones">
        {filters.map((item) => (
          <button
            className={filter === item.id ? "active" : ""}
            type="button"
            aria-pressed={filter === item.id}
            key={item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {lastClaim ? <MissionClaimNotice claim={lastClaim} /> : null}
      {error ? (
        <div className="rewardError" role="alert">
          <strong>No pudimos completar la operación.</strong>
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>
            Actualizar misiones
          </button>
        </div>
      ) : null}
      {loading && !catalog ? (
        <div className="catalogLoading" role="status">
          <span className="faucetSpinner" aria-hidden="true" />
          Consultando progreso validado…
        </div>
      ) : null}
      {!loading && !error && missions.length === 0 ? (
        <div className="rewardEmpty">
          No hay misiones en esta categoría por ahora.
        </div>
      ) : null}

      <div className="missionList">
        {missions.map((mission) => (
          <MissionCard
            mission={mission}
            claiming={claimingId === mission.id}
            key={mission.id}
            onClaim={() => void submitClaim(mission)}
          />
        ))}
      </div>

      <aside className="faucetPolicy">
        <strong>Metas y recompensas versionadas.</strong> Las misiones premium
        solo avanzan después del callback verificable del proveedor. Los estados
        retenido, rechazado o pendiente no representan saldo disponible.
      </aside>
    </section>
  );
}

function MissionSummary({
  summary,
}: {
  summary: NonNullable<MissionCatalog["summary"]>;
}) {
  return (
    <div className="missionSummary">
      <article>
        <span aria-hidden="true">🔥</span>
        <div>
          <small>Racha diaria</small>
          <strong>{summary.streakDays} días</strong>
          <div className="weekDots" aria-label="Actividad validada esta semana">
            {["L", "M", "X", "J", "V", "S", "D"].map((day) => (
              <span
                className={summary.activeWeekDays.includes(day) ? "active" : ""}
                key={day}
              >
                {day}
              </span>
            ))}
          </div>
        </div>
      </article>
      <article>
        <span aria-hidden="true">🏅</span>
        <div>
          <small>Logros</small>
          <strong>
            {summary.achievements.unlocked}/{summary.achievements.total}
          </strong>
          <p>Solo actividad confirmada cuenta para los logros.</p>
        </div>
      </article>
    </div>
  );
}

function MissionCard({
  mission,
  claiming,
  onClaim,
}: {
  mission: Mission;
  claiming: boolean;
  onClaim: () => void;
}) {
  const complete = mission.status === "CLAIMED";
  const explanation = missionExplanation(mission);
  return (
    <article className={`missionCard ${mission.premium ? "premium" : ""}`}>
      <span className="missionIcon" aria-hidden="true">
        {missionIcon(mission.category)}
      </span>
      <div className="missionBody">
        <div className="missionTitleRow">
          <h2>{mission.title}</h2>
          <span>{missionStatusLabel(mission.status)}</span>
        </div>
        <p>
          {mission.requirement}
          {mission.expiresAt ? ` · ${formatExpiry(mission.expiresAt)}` : ""}
        </p>
        {explanation ? (
          <small className="missionReason">{explanation}</small>
        ) : null}
        <div className="missionProgress">
          <progress
            value={Math.min(mission.progress, mission.target)}
            max={mission.target}
            aria-label={`${mission.progress} de ${mission.target} para ${mission.title}`}
          />
          <span>
            {mission.progress}/{mission.target}
          </span>
        </div>
      </div>
      <div className="missionReward">
        <strong>
          +{mission.reward.minorUnits} {mission.reward.asset}
        </strong>
        {mission.status === "CLAIMABLE" ? (
          <button
            className="button"
            type="button"
            disabled={claiming}
            onClick={onClaim}
          >
            {claiming ? "Validando…" : "Reclamar"}
          </button>
        ) : (
          <span className={complete ? "complete" : ""}>
            {missionStatusLabel(mission.status)}
          </span>
        )}
      </div>
    </article>
  );
}

function MissionClaimNotice({ claim }: { claim: MissionClaim }) {
  const confirmed =
    claim.status === "POSTED" && claim.transactionId && claim.reward;
  return (
    <div className="missionClaimNotice" role="status">
      <strong>
        {confirmed
          ? "Claim de misión confirmado."
          : "Claim recibido; aún no existe crédito confirmado."}
      </strong>
      {confirmed ? (
        <span>
          +{claim.reward?.minorUnits} {claim.reward?.asset} ·{" "}
          {claim.reward?.bucket}
        </span>
      ) : (
        <span>Estado: {claim.status}</span>
      )}
    </div>
  );
}

function missionIcon(category: MissionCategory) {
  return (
    {
      daily: "🎮",
      weekly: "🔥",
      mining: "⛏️",
      crew: "👥",
      premium: "💎",
    } as const
  )[category];
}

function missionStatusLabel(status: Mission["status"]) {
  return (
    {
      IN_PROGRESS: "En progreso",
      CLAIMABLE: "Lista",
      CLAIMED: "Completada",
      LOCKED: "Bloqueada",
      PENDING_PROVIDER: "Validando proveedor",
      EXPIRED: "Expirada",
      HELD: "En revisión",
      REJECTED: "Rechazada",
    } as const
  )[status];
}

function missionExplanation(mission: Mission) {
  if (
    !["LOCKED", "PENDING_PROVIDER", "HELD", "REJECTED"].includes(mission.status)
  ) {
    return null;
  }
  const known: Record<string, string> = {
    PREMIUM_PASS_REQUIRED:
      "Requiere acceso premium activo antes de iniciar esta misión.",
    PROVIDER_VERIFICATION_PENDING:
      "Esperando confirmación verificable del proveedor; aún no existe crédito.",
    PREREQUISITE_REQUIRED:
      "Completa primero la actividad requerida para desbloquearla.",
    FEATURE_DISABLED: "Esta misión está pausada por configuración.",
    RISK_REVIEW: "El progreso está bajo revisión de seguridad.",
  };
  if (mission.reasonCode && known[mission.reasonCode]) {
    return known[mission.reasonCode];
  }
  if (mission.status === "PENDING_PROVIDER") {
    return "Esperando validación externa; aún no existe crédito.";
  }
  if (mission.status === "HELD") {
    return "El progreso está retenido para revisión; aún no existe crédito.";
  }
  if (mission.status === "REJECTED") {
    return "La actividad no superó la validación y no genera recompensa.";
  }
  return "Esta misión requiere una condición previa antes de poder avanzar.";
}

function formatExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "vigencia por confirmar";
  return `vence ${new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)}`;
}

function getOrCreateMissionClaimKey(mission: Mission) {
  const storageKey = missionClaimStorageKey(mission.id, mission.periodKey);
  const current = sessionStorage.getItem(storageKey);
  if (current) return current;
  const created = crypto.randomUUID();
  sessionStorage.setItem(storageKey, created);
  return created;
}

function clearMissionClaimKey(missionId: string, periodKey: string) {
  sessionStorage.removeItem(missionClaimStorageKey(missionId, periodKey));
}

function cleanupClaimedMissionKeys(missions: Mission[]) {
  for (const mission of missions) {
    if (mission.status === "CLAIMED") {
      clearMissionClaimKey(mission.id, mission.periodKey);
    }
  }
}

function missionClaimStorageKey(missionId: string, periodKey: string) {
  return `fz_mission_claim_${encodeURIComponent(`${missionId}:${periodKey}`)}`;
}
