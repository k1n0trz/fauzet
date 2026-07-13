"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { EconomicConfirmation } from "../../economic-confirmation";
import {
  canStartFiatCheckout,
  createFiatOrder,
  fetchFiatCatalog,
  fiatErrorMessage,
  type FiatCatalog,
  type FiatProduct,
} from "../../../../lib/fiat-store-api";
import {
  clearMutationKey,
  getOrCreateMutationKey,
} from "../../../../lib/mutation-attempt-storage";
import { shouldKeepMutationAttempt } from "../../../../lib/reward-api";
import { StoreTabs } from "../store-tabs";

export function FiatStoreExperience() {
  const [catalog, setCatalog] = useState<FiatCatalog | null>(null);
  const [selected, setSelected] = useState<FiatProduct | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCatalog(await fetchFiatCatalog());
    } catch (caught) {
      setError(fiatErrorMessage(caught));
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
        if (!controller.signal.aborted) setError(fiatErrorMessage(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  const closeDialog = useCallback(() => {
    if (purchasing) return;
    setSelected(null);
    setTermsAccepted(false);
    setDialogError("");
  }, [purchasing]);

  async function confirmCheckout() {
    if (!catalog || !selected || !termsAccepted || purchasing) return;
    if (!canStartFiatCheckout(catalog, selected)) {
      setDialogError(
        "El servidor cerró este checkout. Actualiza el catálogo antes de continuar.",
      );
      return;
    }

    const signature = [
      selected.productVersionId,
      catalog.checkoutTermsVersion,
      selected.refundPolicyVersion,
      "1",
    ].join(":");
    const key = getOrCreateMutationKey("fiat-checkout", signature);
    setPurchasing(true);
    setDialogError("");
    try {
      const result = await createFiatOrder(
        {
          productVersionId: selected.productVersionId,
          quantity: 1,
          termsVersion: catalog.checkoutTermsVersion,
          refundPolicyVersion: selected.refundPolicyVersion,
        },
        key,
      );
      const checkout = result.order.checkout;
      if (!checkout) {
        throw new Error(
          "La orden existe, pero Mercado Pago TEST no devolvió un checkout utilizable.",
        );
      }
      window.location.assign(checkout.url);
      clearMutationKey("fiat-checkout", signature);
    } catch (caught) {
      if (!shouldKeepMutationAttempt(caught)) {
        clearMutationKey("fiat-checkout", signature);
      }
      setDialogError(fiatErrorMessage(caught));
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <section
      className="rewardsPage storePage"
      aria-labelledby="fiat-store-title"
    >
      <div className="commerceHeading">
        <div>
          <div className="eyebrow">Mercado Pago TEST · sin dinero real</div>
          <h1 className="rewardsTitle" id="fiat-store-title">
            Tienda fiat sandbox
          </h1>
          <p className="lead">
            Prueba el checkout alojado de Mercado Pago con una cuenta compradora
            y medios de pago de prueba. Fauzet no cobra dinero real ni acredita
            productos por el regreso del navegador.
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
          <strong>Checkout de prueba limitado por configuración.</strong>
          <span>{fiatReasonCopy(catalog.disabledReason)}</span>
        </div>
      ) : null}

      <div className="storeGrid">
        {catalog?.products.map((product) => (
          <FiatProductCard
            catalog={catalog}
            product={product}
            key={product.productVersionId}
            onSelect={() => {
              setSelected(product);
              setTermsAccepted(false);
              setDialogError("");
            }}
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
          <strong>Sandbox sin valor real.</strong> Checkout Pro se abre fuera de
          Fauzet y debe usarse únicamente con credenciales de comprador y medios
          de pago TEST. El inventario cambia sólo después de que el backend
          verifica el pago con Mercado Pago; la activación continúa cerrada y
          ningún producto genera ZYXE en esta fase.
        </aside>
      ) : null}

      {catalog && selected ? (
        <EconomicConfirmation
          title="Abrir checkout de prueba"
          warning="Serás enviado a Mercado Pago TEST. Volver a Fauzet, incluso con status=approved en la URL, no confirma el pago: sólo cuenta el estado verificado por el servidor."
          pending={purchasing}
          error={dialogError}
          confirmLabel="Ir a Mercado Pago TEST"
          confirmDisabled={!termsAccepted}
          pendingLabel="Creando checkout TEST…"
          onCancel={closeDialog}
          onConfirm={() => void confirmCheckout()}
        >
          <dl className="economicRows">
            <div>
              <dt>Producto</dt>
              <dd>{selected.name}</dd>
            </div>
            <div>
              <dt>Precio simulado</dt>
              <dd>{formatCop(selected.price.minorUnits)} COP</dd>
            </div>
            <div>
              <dt>Efecto</dt>
              <dd>{selected.effect.label}</dd>
            </div>
            <div>
              <dt>Ambiente</dt>
              <dd>Mercado Pago TEST</dd>
            </div>
            <div>
              <dt>Activación</dt>
              <dd>Cerrada</dd>
            </div>
          </dl>
          <label className="fiatConsent">
            <input
              type="checkbox"
              checked={termsAccepted}
              disabled={purchasing}
              onChange={(event) => setTermsAccepted(event.target.checked)}
            />
            <span>
              Entiendo que es una simulación sin dinero real y acepto las
              condiciones de prueba {catalog.checkoutTermsVersion} y la política{" "}
              de reembolso {selected.refundPolicyVersion}.
            </span>
          </label>
        </EconomicConfirmation>
      ) : null}
    </section>
  );
}

function FiatSummary({ catalog }: { catalog: FiatCatalog }) {
  return (
    <div className="commerceSummary" aria-label="Estado de la tienda fiat">
      <article>
        <span>Ambiente</span>
        <strong>TEST</strong>
        <small>No se cobrará dinero real.</small>
      </article>
      <article className="promotional">
        <span>Moneda simulada</span>
        <strong>{catalog.currency}</strong>
        <small>Importes de prueba, sin centavos.</small>
      </article>
      <article>
        <span>Proveedor</span>
        <strong>Mercado Pago</strong>
        <small>
          {catalog.checkoutEnabled
            ? "Checkout de prueba habilitado por el servidor."
            : "Checkout de prueba cerrado por el servidor."}
        </small>
      </article>
    </div>
  );
}

function FiatProductCard({
  catalog,
  product,
  onSelect,
}: {
  catalog: FiatCatalog;
  product: FiatProduct;
  onSelect: () => void;
}) {
  const art = productArt(product.kind);
  const available = canStartFiatCheckout(catalog, product);
  const reason = product.reasonCode ?? catalog.disabledReason;

  return (
    <article className={`storeCard ${available ? "" : "locked"}`}>
      <div className="storeCardTop">
        <span className="storeProductArt">
          <Image src={art.src} width={art.width} height={art.height} alt="" />
        </span>
        <span className={`storeKind kind-${product.kind.toLowerCase()}`}>
          {product.kind} · TEST
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
      {reason && !available ? (
        <div className="storeReason">
          <span>{fiatProductStateLabel(product, catalog)}</span>
          <code>{reason}</code>
        </div>
      ) : null}
      <div className="storeCardAction">
        <strong>{formatCop(product.price.minorUnits)} COP</strong>
        <button
          className={available ? "button" : ""}
          type="button"
          disabled={!available}
          onClick={onSelect}
        >
          {available ? "Probar pago" : fiatProductStateLabel(product, catalog)}
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
  return "No disponible";
}

function fiatReasonCopy(reason: string) {
  return (
    {
      CHECKOUT_DISABLED: "El servidor mantiene cerrado el checkout de prueba.",
      PRODUCT_PAUSED: "El producto está pausado para nuevas pruebas.",
      PRODUCT_COMING_SOON: "El producto todavía no admite pruebas de pago.",
      SALE_NOT_STARTED: "La ventana de prueba aún no ha comenzado.",
      SALE_ENDED: "La ventana de prueba ya finalizó.",
    }[reason] ?? reason
  );
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
