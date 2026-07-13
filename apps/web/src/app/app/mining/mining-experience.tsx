"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EconomicConfirmation } from "../economic-confirmation";
import {
  fetchMiningStatus,
  isConfirmedMiningAction,
  mutateMiner,
  type MinerView,
  type MiningAction,
  type MiningActionReceipt,
  type MiningStatus,
} from "../../../lib/mining-api";
import {
  clearMutationKey,
  getOrCreateMutationKey,
} from "../../../lib/mutation-attempt-storage";
import {
  errorMessage,
  shouldKeepMutationAttempt,
} from "../../../lib/reward-api";

type SelectedAction = { miner: MinerView; action: MiningAction };

export function MiningExperience() {
  const [status, setStatus] = useState<MiningStatus | null>(null);
  const [selected, setSelected] = useState<SelectedAction | null>(null);
  const [receipt, setReceipt] = useState<MiningActionReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStatus(await fetchMiningStatus());
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
        const result = await fetchMiningStatus(controller.signal);
        if (!controller.signal.aborted) setStatus(result);
      } catch (caught) {
        if (!controller.signal.aborted) setError(errorMessage(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  const closeDialog = useCallback(() => {
    setSelected(null);
    setDialogError("");
  }, []);

  async function confirmAction() {
    if (!selected || !status || mutating) return;
    const signature = `${selected.action}:${selected.miner.id}:${status.configVersion}`;
    const key = getOrCreateMutationKey("miner-action", signature);
    setMutating(true);
    setDialogError("");
    try {
      const result = await mutateMiner(
        selected.miner.id,
        selected.action,
        status.configVersion,
        key,
      );
      if (!isConfirmedMiningAction(result)) {
        throw new Error(
          "La acción fue recibida, pero el servidor aún no confirmó el nuevo estado del minero.",
        );
      }
      clearMutationKey("miner-action", signature);
      setStatus(result.mining);
      setReceipt(result);
      closeDialog();
    } catch (caught) {
      if (!shouldKeepMutationAttempt(caught)) {
        clearMutationKey("miner-action", signature);
      }
      setDialogError(errorMessage(caught));
    } finally {
      setMutating(false);
    }
  }

  return (
    <section className="rewardsPage miningPage" aria-labelledby="mining-title">
      <div className="miningHeading">
        <div>
          <div className="eyebrow">Pool limitado · simulación económica</div>
          <h1 className="rewardsTitle" id="mining-title">
            Sala de minería
          </h1>
          <p className="lead">
            No ejecutamos Proof-of-Work en tu dispositivo. El servidor calcula
            hashpower válido y distribuye el pool del período mediante un
            settlement automático.
          </p>
        </div>
        <Image
          className="miningMachineArt"
          src="/rewards/mining-machine.png"
          width={280}
          height={146}
          alt=""
          priority
        />
      </div>

      {status ? <MiningStats status={status} /> : null}
      {receipt ? <MiningActionNotice receipt={receipt} /> : null}
      {error ? (
        <div className="rewardError" role="alert">
          <strong>No pudimos consultar el estado de minería.</strong>
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>
            Reintentar
          </button>
        </div>
      ) : null}
      {loading && !status ? (
        <div className="catalogLoading" role="status">
          <span className="faucetSpinner" aria-hidden="true" />
          Validando mineros, energía y contribución al pool…
        </div>
      ) : null}

      {status ? (
        <>
          <section className="miningFormula">
            <strong>Estimación del período; no garantizada</strong>
            <code>
              recompensa ≈ hashpower válido ÷ hashpower total válido × pool
            </code>
            <span>
              El settlement lo ejecuta el sistema al cerrar el período. No hay
              un botón de cobro manual.
            </span>
          </section>

          <div className="miningSectionTitle">
            <div>
              <span>Tus mineros</span>
              <small>
                {status.profile.activeMiners}/{status.profile.maxSlots} slots
                activos
              </small>
            </div>
            <Link href="/app/store">+ Comprar minero</Link>
          </div>

          {status.miners.length > 0 ? (
            <div className="minerGrid">
              {status.miners.map((miner) => (
                <MinerCard
                  miner={miner}
                  key={miner.id}
                  onAction={(action) => {
                    setReceipt(null);
                    setDialogError("");
                    setSelected({ miner, action });
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="rewardEmpty">
              Aún no tienes mineros. El catálogo indicará si existe un slot
              disponible.
            </div>
          )}

          <div className="miningBottomGrid">
            <EnergyPanel status={status} />
            <PeriodPanel status={status} />
          </div>
        </>
      ) : null}

      {selected && status ? (
        <EconomicConfirmation
          title={
            selected.action === "upgrade"
              ? `Mejorar ${selected.miner.name}`
              : `Reparar ${selected.miner.name}`
          }
          warning="El cambio solo aparecerá tras recibir el estado POSTED y el snapshot actualizado del servidor. Un fallo transitorio conserva la misma clave idempotente para reintentar."
          pending={mutating}
          error={dialogError}
          confirmLabel={
            selected.action === "upgrade"
              ? "Confirmar mejora"
              : "Confirmar reparación"
          }
          onCancel={closeDialog}
          onConfirm={() => void confirmAction()}
        >
          <MiningConfirmationRows selected={selected} />
        </EconomicConfirmation>
      ) : null}
    </section>
  );
}

function MiningStats({ status }: { status: MiningStatus }) {
  const effectiveHash = status.miners.reduce(
    (total, miner) =>
      miner.status === "ACTIVE" ? total + miner.effectiveHashRate : total,
    0,
  );
  const cards = [
    {
      label: "Hashpower activo",
      value: `${formatMetric(effectiveHash)} GH/s`,
    },
    {
      label: "Mineros activos",
      value: `${status.profile.activeMiners}/${status.profile.maxSlots}`,
    },
    {
      label: "Energía de minería",
      value: `${formatMetric(status.profile.energy.current)}/${formatMetric(status.profile.energy.max)}`,
    },
    {
      label: "Pool del período",
      value: `${formatMinor(status.period.poolMinorUnits)} ZYXE`,
    },
    {
      label: "Estimado",
      value: `~${formatMinor(status.period.estimatedRewardMinorUnits)} ZYXE`,
      accent: true,
    },
  ];
  return (
    <>
      <div className="miningStatusLine">
        <span className={status.state === "ACTIVE" ? "active" : ""}>
          <i aria-hidden="true" /> {miningStateLabel(status.state)}
        </span>
        {status.reasonCode ? <code>{status.reasonCode}</code> : null}
        <small>Reglas v{status.configVersion}</small>
      </div>
      <div className="miningStats">
        {cards.map((card) => (
          <article className={card.accent ? "accent" : ""} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>
    </>
  );
}

function MinerCard({
  miner,
  onAction,
}: {
  miner: MinerView;
  onAction: (action: MiningAction) => void;
}) {
  const durability = Math.max(0, Math.min(100, miner.durabilityBps / 100));
  const efficiency = Math.max(0, Math.min(100, miner.efficiencyBps / 100));
  const needsRepair = miner.durabilityBps < 10000;
  const canUpgrade = Boolean(
    miner.upgrade?.enabled && !miner.upgrade.reasonCode,
  );
  const canRepair = Boolean(
    needsRepair && miner.repair?.enabled && !miner.repair.reasonCode,
  );
  return (
    <article className={`minerCard ${durability < 40 ? "maintenance" : ""}`}>
      <div className="minerCardHeading">
        <span>
          <Image
            src="/rewards/mining-machine.png"
            width={66}
            height={35}
            alt=""
          />
        </span>
        <div>
          <h2>{miner.name}</h2>
          <small>
            Lv {miner.level} · {formatMetric(miner.effectiveHashRate)} GH/s ·{" "}
            {formatMetric(miner.energyPerHour)} energía/h
          </small>
        </div>
        <b>{miner.tier}</b>
      </div>
      <div className="minerBars">
        <MetricBar
          label="Durabilidad"
          value={durability}
          warning={durability < 40}
        />
        <MetricBar label="Eficiencia" value={efficiency} />
      </div>
      <div className="minerState">
        <span>{miner.status}</span>
        {miner.reasonCode ? <code>{miner.reasonCode}</code> : null}
      </div>
      <div className="minerActions">
        <button
          type="button"
          disabled={!canUpgrade}
          onClick={() => onAction("upgrade")}
        >
          ↑ Mejorar
          {miner.upgrade
            ? ` · ${formatMinor(miner.upgrade.priceMinorUnits)}`
            : ""}
        </button>
        <button
          className="repair"
          type="button"
          disabled={!canRepair}
          onClick={() => onAction("repair")}
        >
          Reparar
          {miner.repair
            ? miner.repair.usesKit
              ? " · 1 kit"
              : ` · ${formatMinor(miner.repair.priceMinorUnits)}`
            : ""}
        </button>
      </div>
      {miner.upgrade?.reasonCode || miner.repair?.reasonCode ? (
        <small className="minerReason">
          {miner.upgrade?.reasonCode ?? miner.repair?.reasonCode}
        </small>
      ) : null}
    </article>
  );
}

function MetricBar({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div>
      <span>
        {label} <b>{value}%</b>
      </span>
      <progress
        className={warning ? "warning" : ""}
        value={value}
        max={100}
        aria-label={`${label}: ${value}%`}
      />
    </div>
  );
}

function EnergyPanel({ status }: { status: MiningStatus }) {
  const energy = status.profile.energy;
  const percentage = energy.max > 0 ? (energy.current / energy.max) * 100 : 0;
  return (
    <article className="miningPanel">
      <div className="miningPanelTitle">
        <span>Energía de minería</span>
        <strong>
          {formatMetric(energy.current)}/{formatMetric(energy.max)}
        </strong>
      </div>
      <progress
        value={percentage}
        max={100}
        aria-label="Energía de minería disponible"
      />
      <p>
        Consumo validado: {formatMetric(energy.consumptionPerHour)} por hora.
        {energy.estimatedExhaustsAt
          ? ` Agotamiento estimado: ${formatDate(energy.estimatedExhaustsAt)}.`
          : ""}
      </p>
      <div className="energyMeta">
        <span>Kits de reparación: {status.profile.repairKits}</span>
        {status.profile.boost ? (
          <span>
            Boost ×{status.profile.boost.multiplierBps / 10000} hasta{" "}
            {formatDate(status.profile.boost.expiresAt)}
          </span>
        ) : (
          <span>Sin boost activo</span>
        )}
      </div>
      <Link href="/app/store">Abrir tienda de energía y boosts</Link>
    </article>
  );
}

function PeriodPanel({ status }: { status: MiningStatus }) {
  return (
    <article className="miningPanel periodPanel">
      <div className="miningPanelTitle">
        <span>Período del pool</span>
        <strong>{status.period.state ?? "ABIERTO"}</strong>
      </div>
      <dl>
        <div>
          <dt>Identificador</dt>
          <dd>{status.period.key}</dd>
        </div>
        <div>
          <dt>Contribución válida</dt>
          <dd>{formatMinor(status.period.validHashMillis)} hash·ms</dd>
        </div>
        <div>
          <dt>Estimación al</dt>
          <dd>{formatDate(status.period.asOf)}</dd>
        </div>
        {status.period.endAt ? (
          <div>
            <dt>Cierre</dt>
            <dd>{formatDate(status.period.endAt)}</dd>
          </div>
        ) : null}
      </dl>
      <p>
        El valor estimado puede variar hasta el settlement por energía,
        durabilidad, boost y hashpower válido total de la red.
      </p>
    </article>
  );
}

function MiningConfirmationRows({ selected }: { selected: SelectedAction }) {
  const quote =
    selected.action === "upgrade"
      ? selected.miner.upgrade
      : selected.miner.repair;
  return (
    <dl className="economicRows">
      <div>
        <dt>Minero</dt>
        <dd>{selected.miner.name}</dd>
      </div>
      <div>
        <dt>Acción</dt>
        <dd>{selected.action === "upgrade" ? "Mejora" : "Reparación"}</dd>
      </div>
      <div>
        <dt>Costo</dt>
        <dd>
          {quote?.usesKit
            ? "1 kit de reparación"
            : `${formatMinor(quote?.priceMinorUnits ?? "0")} ZYXE`}
        </dd>
      </div>
      {selected.action === "upgrade" && quote?.nextLevel ? (
        <div>
          <dt>Resultado cotizado</dt>
          <dd>
            Nivel {quote.nextLevel}
            {quote.nextHashRate
              ? ` · ${formatMetric(quote.nextHashRate)} GH/s`
              : ""}
          </dd>
        </div>
      ) : (
        <div>
          <dt>Resultado cotizado</dt>
          <dd>Durabilidad restaurada</dd>
        </div>
      )}
    </dl>
  );
}

function MiningActionNotice({ receipt }: { receipt: MiningActionReceipt }) {
  const usedKit = receipt.type === "REPAIR" && receipt.costMinorUnits === "0";
  return (
    <div className="purchaseReceipt miningReceipt" role="status">
      <div>
        <strong>
          {receipt.type === "UPGRADE" ? "Mejora" : "Reparación"} confirmada
        </strong>
        <small>
          Operación {receipt.id}
          {receipt.transactionId
            ? ` · transacción ${receipt.transactionId}`
            : ""}
          {receipt.replayed ? " · respuesta idempotente recuperada" : ""}
        </small>
      </div>
      <span>
        {usedKit
          ? "1 kit consumido"
          : `-${formatMinor(receipt.costMinorUnits)} ZYXE`}
      </span>
    </div>
  );
}

function miningStateLabel(state: string) {
  const labels: Record<string, string> = {
    ACTIVE: "Minería activa",
    IDLE: "Minería inactiva",
    DISABLED: "Minería deshabilitada",
    SETTLEMENT_PENDING: "Settlement en curso",
    UNKNOWN: "Estado operativo no expuesto",
  };
  return labels[state] ?? state;
}

function formatMinor(value: string) {
  try {
    return BigInt(value).toLocaleString("es-CO");
  } catch {
    return value;
  }
}

function formatMetric(value: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(
    value,
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
