"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  fetchFiatCatalog,
  type FiatCatalog,
  type FiatProduct,
} from "../../../../lib/fiat-store-api";
import { errorMessage } from "../../../../lib/reward-api";
import { StoreTabs } from "../store-tabs";

export function FiatStoreExperience() {
  const [catalog, setCatalog] = useState<FiatCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCatalog(await fetchFiatCatalog());
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
        const result = await fetchFiatCatalog(controller.signal);
        if (!controller.signal.aborted) setCatalog(result);
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
      aria-labelledby="fiat-store-title"
    >
      <div className="commerceHeading">
        <div>
          <div className="eyebrow">Catálogo informativo · pagos de prueba</div>
          <h1 className="rewardsTitle" id="fiat-store-title">
            Tienda fiat sandbox
          </h1>
          <p className="lead">
            Consulta el catálogo COP preparado para Mercado Pago. En esta fase
            no se crean órdenes, no se cobra dinero y no se entregan
            recompensas.
          </p>
        </div>
        <Image
          className="commerceHeroArt"
          src="/rewards/mining-machine.png"
          width={150}
          height={80}
          alt=""
          priority
        />
      </div>

      <StoreTabs />

      {catalog ? <FiatSummary catalog={catalog} /> : null}
      {error ? (
        <div className="rewardError" role="alert">
          <strong>No pudimos consultar el catálogo sandbox.</strong>
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>
            Reintentar
          </button>
        </div>
      ) : null}
      {loading && !catalog ? (
        <div className="catalogLoading" role="status">
          <span className="faucetSpinner" aria-hidden="true" />
          Consultando el catálogo fiat autorizado…
        </div>
      ) : null}

      {catalog?.disabledReason ? (
        <div className="storePhaseNotice" role="status">
          <strong>Catálogo limitado por configuración.</strong>
          <span>{catalog.disabledReason}</span>
        </div>
      ) : null}

      <div className="storeGrid">
        {catalog?.products.map((product) => (
          <FiatProductCard
            catalog={catalog}
            product={product}
            key={product.productVersionId}
          />
        ))}
      </div>

      {catalog && catalog.products.length === 0 ? (
        <div className="storeEmpty">
          <strong>Aún no hay productos fiat publicados.</strong>
          <span>
            El catálogo aparecerá aquí cuando exista una versión activa.
          </span>
        </div>
      ) : null}

      {catalog ? (
        <aside className="commercePolicy">
          <strong>Sandbox sin valor real.</strong> Mercado Pago figura como
          proveedor de prueba, pero checkout y activación permanecen cerrados.
          Estos productos no representan hardware ni minería blockchain y no
          generan ZYXEs en esta fase.
        </aside>
      ) : null}
    </section>
  );
}

function FiatSummary({ catalog }: { catalog: FiatCatalog }) {
  return (
    <div className="commerceSummary" aria-label="Estado de la tienda fiat">
      <article>
        <span>Ambiente</span>
        <strong>Sandbox</strong>
        <small>No se cobrará dinero real.</small>
      </article>
      <article className="promotional">
        <span>Moneda</span>
        <strong>{catalog.currency}</strong>
        <small>Importes de prueba, sin centavos.</small>
      </article>
      <article>
        <span>Proveedor</span>
        <strong>Mercado Pago</strong>
        <small>
          {catalog.checkoutEnabled
            ? "Integración preparada; acceso público cerrado."
            : "Checkout deshabilitado por el servidor."}
        </small>
      </article>
    </div>
  );
}

function FiatProductCard({
  catalog,
  product,
}: {
  catalog: FiatCatalog;
  product: FiatProduct;
}) {
  const art = productArt(product.kind);
  const reason = product.reasonCode ?? catalog.disabledReason;

  return (
    <article
      className={`storeCard ${product.state === "AVAILABLE" ? "" : "locked"}`}
    >
      <div className="storeCardTop">
        <span className="storeProductArt">
          <Image src={art.src} width={art.width} height={art.height} alt="" />
        </span>
        <span className={`storeKind kind-${product.kind.toLowerCase()}`}>
          {product.kind} · SANDBOX
        </span>
      </div>
      <h2>{product.name}</h2>
      <p>{product.description}</p>
      <small>Versión {product.version} · sin recompensas ZYXE</small>
      <dl className="storeProductFacts">
        <div>
          <dt>Efecto</dt>
          <dd>{product.effect.label}</dd>
        </div>
        <div>
          <dt>Duración</dt>
          <dd>{formatDuration(product.durationSeconds)}</dd>
        </div>
      </dl>
      {reason ? (
        <div className="storeReason">
          <span>{fiatProductStateLabel(product, catalog)}</span>
          <code>{reason}</code>
        </div>
      ) : null}
      <div className="storeCardAction">
        <strong>{formatCop(product.price.minorUnits)} COP</strong>
        <button type="button" disabled>
          {fiatProductStateLabel(product, catalog)}
        </button>
      </div>
    </article>
  );
}

function fiatProductStateLabel(product: FiatProduct, catalog: FiatCatalog) {
  if (product.state === "COMING_SOON") return "Próximamente";
  if (product.state === "DISABLED") return "Deshabilitado";
  if (!catalog.catalogEnabled) return "Catálogo cerrado";
  if (!catalog.checkoutEnabled) return "Checkout cerrado";
  return "Fase informativa";
}

function productArt(kind: string) {
  if (kind.includes("MINER"))
    return { src: "/rewards/mining-machine.png", width: 76, height: 40 };
  if (kind.includes("ENERGY"))
    return { src: "/rewards/ic-energy.png", width: 31, height: 48 };
  if (kind.includes("REPAIR"))
    return { src: "/rewards/ic-upgrade.png", width: 46, height: 46 };
  return { src: "/rewards/ic-boost.png", width: 40, height: 46 };
}

function formatCop(value: string) {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(BigInt(value));
  } catch {
    return `$${value}`;
  }
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Uso único";
  const days = seconds / 86_400;
  if (Number.isInteger(days)) return `${days} ${days === 1 ? "día" : "días"}`;
  const hours = seconds / 3_600;
  if (Number.isInteger(hours))
    return `${hours} ${hours === 1 ? "hora" : "horas"}`;
  return `${seconds.toLocaleString("es-CO")} segundos`;
}
