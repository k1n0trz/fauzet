"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchReferralCrew,
  type ReferralCodeView,
  type ReferralCommissionsView,
  type ReferralTreeView,
} from "../../../lib/referrals-api";
import { errorMessage } from "../../../lib/reward-api";

type CrewData = {
  code: ReferralCodeView;
  tree: ReferralTreeView;
  commissions: ReferralCommissionsView;
};

export function CrewExperience() {
  const [data, setData] = useState<CrewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchReferralCrew());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchReferralCrew(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(errorMessage(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const inviteUrl = useMemo(() => {
    if (!data) return "";
    if (typeof window === "undefined") return data.code.invitePath;
    return `${window.location.origin}${data.code.invitePath}`;
  }, [data]);

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (loading)
    return (
      <section className="rewardsPage crewPage" aria-busy="true">
        <div className="commerceHeading">
          <span>Red inmutable · cuatro niveles</span>
          <h1>Mining Crew</h1>
          <p>Consultando tu código, árbol y actividad validada…</p>
        </div>
      </section>
    );

  if (error || !data)
    return (
      <section className="rewardsPage crewPage">
        <div className="commerceHeading">
          <span>Red inmutable · cuatro niveles</span>
          <h1>Mining Crew</h1>
        </div>
        <div className="commerceError" role="alert">
          <strong>No pudimos consultar tu Mining Crew.</strong>
          <span>{error || "Respuesta incompleta"}</span>
          <button type="button" onClick={refresh}>
            Reintentar
          </button>
        </div>
      </section>
    );

  const { code, tree, commissions } = data;
  return (
    <section className="rewardsPage crewPage" aria-labelledby="crew-title">
      <div className="commerceHeading crewHeading">
        <span>Red inmutable · cuatro niveles</span>
        <div className="crewTitleRow">
          <div>
            <h1 id="crew-title">Mining Crew</h1>
            <p>
              Nada se paga por registrarse. Las futuras comisiones nacen solo de
              actividad monetizable validada, fondeada y reversible.
            </p>
          </div>
          <Image src="/rewards/ic-crew.png" width={74} height={74} alt="" />
        </div>
      </div>

      {code.state !== "ACTIVE" && (
        <div className="crewGate" role="status">
          <strong>Invitaciones activas · pagos todavía bloqueados</strong>
          <span>
            El árbol ya registra atribuciones, pero las Crew Rewards requieren
            aprobación legal, ingresos conciliados y un pool financiado.
          </span>
          <code>{code.reasonCode}</code>
        </div>
      )}

      <div className="crewTopGrid">
        <article className="crewInviteCard">
          <span>Tu enlace de invitación</span>
          <div className="crewInviteField">
            <code>{inviteUrl}</code>
            <button type="button" onClick={copyInvite}>
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <small>
            Código {code.code}. La atribución ocurre una sola vez durante el
            registro y no puede cambiarse después.
          </small>
          {code.sponsor && (
            <small>
              Llegaste por invitación de{" "}
              <strong>{code.sponsor.displayName}</strong>.
            </small>
          )}
        </article>
        <article className="crewSummaryCard">
          <div>
            <span>Crew total</span>
            <strong>{tree.totalMembers}</strong>
          </div>
          <div>
            <span>Activos monetizables</span>
            <strong>{tree.activeMembers}</strong>
          </div>
          <div>
            <span>Pendiente</span>
            <strong>{commissions.summary.pendingMinorUnits}</strong>
          </div>
          <div>
            <span>Disponible ganado</span>
            <strong>{commissions.summary.availableMinorUnits}</strong>
          </div>
        </article>
      </div>

      <article className="crewLevelsCard">
        <div className="crewSectionTitle">
          <div>
            <span>Ganancias por nivel</span>
            <strong>Tope mensual {code.monthlyCapMinorUnits} ZYXE</strong>
          </div>
          <small>Ventana de revisión: {code.reviewWindowHours} horas</small>
        </div>
        <div className="crewLevels">
          {tree.levels.map((level) => (
            <div className="crewLevel" key={level.level}>
              <Image
                src={`/rewards/lvl-${level.level}.png`}
                width={42}
                height={42}
                alt=""
              />
              <strong>L{level.level}</strong>
              <div>
                <span>{level.members} miembros</span>
                <small>{level.activeMembers} activos</small>
              </div>
              <b>{formatRate(level.rateBps)}</b>
            </div>
          ))}
        </div>
        <p>
          Sin comisión sobre comisión, sin pago por reclutamiento, sin
          autocuentas y con clawback si la actividad fuente se revierte.
        </p>
      </article>

      <div className="crewActivityGrid">
        <article>
          <div className="crewSectionTitle">
            <span>Miembros recientes</span>
          </div>
          {tree.recentMembers.length === 0 ? (
            <p className="crewEmpty">
              Tu crew aún no tiene miembros atribuidos.
            </p>
          ) : (
            tree.recentMembers.map((member) => (
              <div className="crewRow" key={member.id}>
                <span className="crewAvatar">
                  {member.displayName.slice(0, 1).toUpperCase()}
                </span>
                <strong>{member.displayName}</strong>
                <code>L{member.level}</code>
                <b data-state={member.state}>{member.state}</b>
              </div>
            ))
          )}
        </article>
        <article>
          <div className="crewSectionTitle">
            <span>Actividad comisionable</span>
          </div>
          {commissions.items.length === 0 ? (
            <p className="crewEmpty">
              No hay comisiones. Faucet, juegos, minería y registros no son una
              base comisionable por sí mismos.
            </p>
          ) : (
            commissions.items.map((item) => (
              <div className="crewRow" key={item.id}>
                <span className="crewAvatar">
                  {item.memberDisplayName.slice(0, 1).toUpperCase()}
                </span>
                <strong>{item.memberDisplayName}</strong>
                <code>L{item.level}</code>
                <span>+{item.rewardMinorUnits} ZYXE</span>
                <b data-state={item.status}>{item.status}</b>
              </div>
            ))
          )}
        </article>
      </div>
    </section>
  );
}

function formatRate(rateBps: number) {
  return `${(rateBps / 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })}%`;
}
