"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  fetchFiatEntitlements,
  type FiatEntitlement,
  type FiatEntitlements,
} from "../../../../lib/fiat-store-api";
import { errorMessage } from "../../../../lib/reward-api";
import { StoreTabs } from "../store-tabs";

export function InventoryExperience() {
  const [inventory, setInventory] = useState<FiatEntitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setInventory(await fetchFiatEntitlements());
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
        const result = await fetchFiatEntitlements(controller.signal);
        if (!controller.signal.aborted) setInventory(result);
      } catch (caught) {
        if (!controller.signal.aborted) setError(errorMessage(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return (
    <section
      className="rewardsPage storePage"
      aria-labelledby="store-inventory-title"
    >
      <div className="commerceHeading">
        <div>
          <div className="eyebrow">
            Productos de prueba · estado autoritativo
          </div>
          <h1 className="rewardsTitle" id="store-inventory-title">
            Mi inventario
          </h1>
          <p className="lead">
            Aquí aparecerán los productos confirmados por el servidor. Comprar y
            activar son pasos separados; en esta fase la activación permanece
            cerrada.
          </p>
        </div>
        <Image
          className="commerceHeroArt"
          src="/rewards/ic-upgrade.png"
          width={100}
          height={100}
          alt=""
          priority
        />
      </div>

      <StoreTabs />

      {inventory ? <InventorySummary inventory={inventory} /> : null}
      {error ? (
        <div className="rewardError" role="alert">
          <strong>No pudimos consultar tu inventario.</strong>
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>
            Reintentar
          </button>
        </div>
      ) : null}
      {loading && !inventory ? (
        <div className="catalogLoading" role="status">
          <span className="faucetSpinner" aria-hidden="true" />
          Consultando productos confirmados…
        </div>
      ) : null}

      <div className="storeGrid">
        {inventory?.items.map((item) => (
          <InventoryCard
            activationEnabled={inventory.activationEnabled}
            item={item}
            key={item.id}
          />
        ))}
      </div>

      {inventory && inventory.items.length === 0 ? (
        <div className="storeEmpty">
          <Image src="/rewards/ic-boost.png" width={36} height={42} alt="" />
          <strong>Tu inventario sandbox está vacío.</strong>
          <span>
            No existe ningún producto de prueba confirmado para esta cuenta.
          </span>
          <Link href="/app/store/fiat">Ver catálogo sandbox</Link>
        </div>
      ) : null}

      {inventory ? (
        <aside className="commercePolicy">
          <strong>Activación separada y controlada.</strong> Un producto
          comprado conserva el estado PURCHASED hasta una activación explícita.
          Nada de este inventario representa dinero, hardware o cripto real, y
          en esta fase ningún elemento genera recompensas ZYXE.
        </aside>
      ) : null}
    </section>
  );
}

function InventorySummary({ inventory }: { inventory: FiatEntitlements }) {
  const purchased = inventory.items.filter(
    ({ state }) => state === "PURCHASED",
  ).length;
  const active = inventory.items.filter(
    ({ state }) => state === "ACTIVE",
  ).length;

  return (
    <div className="commerceSummary" aria-label="Resumen del inventario">
      <article>
        <span>Productos</span>
        <strong>{inventory.items.length}</strong>
        <small>Confirmados por el servidor.</small>
      </article>
      <article className="promotional">
        <span>Sin activar</span>
        <strong>{purchased}</strong>
        <small>Permanecen en estado PURCHASED.</small>
      </article>
      <article>
        <span>Activación</span>
        <strong>
          {inventory.activationEnabled ? "Restringida" : "Cerrada"}
        </strong>
        <small>{active} productos figuran activos.</small>
      </article>
    </div>
  );
}

function InventoryCard({
  activationEnabled,
  item,
}: {
  activationEnabled: boolean;
  item: FiatEntitlement;
}) {
  const art = item.effect.type.includes("MINER")
    ? { src: "/rewards/mining-machine.png", width: 76, height: 40 }
    : { src: "/rewards/ic-boost.png", width: 40, height: 46 };
  const actionable =
    item.state === "PURCHASED" && item.canActivate && activationEnabled;

  return (
    <article className={`storeCard ${item.state === "ACTIVE" ? "" : "locked"}`}>
      <div className="storeCardTop">
        <span className="storeProductArt">
          <Image src={art.src} width={art.width} height={art.height} alt="" />
        </span>
        <span className={`storeKind entitlement-${item.state.toLowerCase()}`}>
          {entitlementStateLabel(item.state)}
        </span>
      </div>
      <h2>{item.name}</h2>
      <p>{item.effect.label}</p>
      <small>
        Comprado {formatDate(item.purchasedAt)} · cantidad {item.quantity}
      </small>
      <dl className="storeProductFacts">
        <div>
          <dt>Inicio</dt>
          <dd>{item.startsAt ? formatDate(item.startsAt) : "Sin iniciar"}</dd>
        </div>
        <div>
          <dt>Finaliza</dt>
          <dd>{item.endsAt ? formatDate(item.endsAt) : "No iniciado"}</dd>
        </div>
        <div>
          <dt>Reembolso</dt>
          <dd>
            {item.canRequestRefund ? "Elegible a revisión" : "No elegible"}
          </dd>
        </div>
      </dl>
      {item.reasonCode ? (
        <div className="storeReason">
          <span>{entitlementStateLabel(item.state)}</span>
          <code>{item.reasonCode}</code>
        </div>
      ) : null}
      <div className="storeCardAction">
        <strong>Sandbox</strong>
        <button type="button" disabled>
          {activationLabel(item, activationEnabled, actionable)}
        </button>
      </div>
    </article>
  );
}

function activationLabel(
  item: FiatEntitlement,
  activationEnabled: boolean,
  actionable: boolean,
) {
  if (item.state !== "PURCHASED") return entitlementStateLabel(item.state);
  if (!activationEnabled) return "Activación cerrada";
  if (!item.canActivate) return "No activable";
  return actionable ? "Fase informativa" : "No disponible";
}

function entitlementStateLabel(state: FiatEntitlement["state"]) {
  return (
    {
      PURCHASED: "Comprado",
      ACTIVE: "Activo",
      CONSUMED: "Consumido",
      EXPIRED: "Expirado",
      REFUND_PENDING: "Reembolso en revisión",
      REFUNDED: "Reembolsado",
      REVOKED: "Revocado",
    } as const
  )[state];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}
