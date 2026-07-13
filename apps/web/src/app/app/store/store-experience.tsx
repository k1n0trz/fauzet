"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { EconomicConfirmation } from "../economic-confirmation";
import {
  fetchStoreCatalog,
  isConfirmedPurchase,
  purchaseStoreProduct,
  type PurchaseReceipt,
  type StoreCatalog,
  type StoreProduct,
} from "../../../lib/store-api";
import {
  clearMutationKey,
  getOrCreateMutationKey,
} from "../../../lib/mutation-attempt-storage";
import {
  errorMessage,
  shouldKeepMutationAttempt,
} from "../../../lib/reward-api";

export function StoreExperience() {
  const [catalog, setCatalog] = useState<StoreCatalog | null>(null);
  const [selected, setSelected] = useState<StoreProduct | null>(null);
  const [receipt, setReceipt] = useState<PurchaseReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCatalog(await fetchStoreCatalog());
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
        const result = await fetchStoreCatalog(controller.signal);
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

  const closeDialog = useCallback(() => {
    setSelected(null);
    setDialogError("");
  }, []);

  async function confirmPurchase() {
    if (!selected || !catalog || purchasing) return;
    const signature = `${selected.id}:${catalog.configVersion}:1`;
    const key = getOrCreateMutationKey("store-purchase", signature);
    setPurchasing(true);
    setDialogError("");
    try {
      const result = await purchaseStoreProduct(
        selected.id,
        catalog.configVersion,
        key,
      );
      if (!isConfirmedPurchase(result)) {
        throw new Error(
          "La compra fue recibida, pero todavía no existe un efecto confirmado.",
        );
      }
      clearMutationKey("store-purchase", signature);
      setReceipt(result);
      closeDialog();
      await refresh();
    } catch (caught) {
      if (!shouldKeepMutationAttempt(caught)) {
        clearMutationKey("store-purchase", signature);
      }
      setDialogError(errorMessage(caught));
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <section className="rewardsPage storePage" aria-labelledby="store-title">
      <div className="commerceHeading">
        <div>
          <div className="eyebrow">Utilidad interna · precios versionados</div>
          <h1 className="rewardsTitle" id="store-title">
            Tienda de boosts
          </h1>
          <p className="lead">
            Confirma cada compra contra el ledger. Ningún saldo ni efecto cambia
            en pantalla hasta recibir un comprobante posteado por el servidor.
          </p>
        </div>
        <Image
          className="commerceHeroArt"
          src="/rewards/ic-boost.png"
          width={110}
          height={124}
          alt=""
          priority
        />
      </div>

      {catalog ? <StoreSummary catalog={catalog} /> : null}
      {receipt ? <PurchaseNotice receipt={receipt} /> : null}
      {error ? (
        <div className="rewardError" role="alert">
          <strong>No pudimos consultar la tienda.</strong>
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>
            Reintentar
          </button>
        </div>
      ) : null}
      {loading && !catalog ? (
        <div className="catalogLoading" role="status">
          <span className="faucetSpinner" aria-hidden="true" />
          Consultando precios, límites y saldos autorizados…
        </div>
      ) : null}

      <div className="storeGrid">
        {catalog?.products.map((product) => (
          <StoreProductCard
            product={product}
            key={product.id}
            onSelect={() => {
              setReceipt(null);
              setDialogError("");
              setSelected(product);
            }}
          />
        ))}
      </div>

      {catalog ? (
        <aside className="commercePolicy">
          <strong>Compra final y auditable.</strong> El pago usa los buckets en
          el orden indicado por el servidor. La distribución económica vigente
          es {formatBps(catalog.splitBps.burn)} quema,{" "}
          {formatBps(catalog.splitBps.recycle)} pools y{" "}
          {formatBps(catalog.splitBps.treasury)} tesorería.
        </aside>
      ) : null}

      {selected && catalog ? (
        <EconomicConfirmation
          title="Confirmar compra"
          warning="La compra no es reembolsable salvo error de plataforma. El desglose definitivo se acredita únicamente con el comprobante POSTED del servidor."
          pending={purchasing}
          error={dialogError}
          confirmLabel="Confirmar compra"
          onCancel={closeDialog}
          onConfirm={() => void confirmPurchase()}
        >
          <dl className="economicRows">
            <div>
              <dt>Artículo</dt>
              <dd>{selected.name}</dd>
            </div>
            <div>
              <dt>Efecto</dt>
              <dd>{selected.effect.label}</dd>
            </div>
            <div>
              <dt>Precio</dt>
              <dd>
                {formatMinor(selected.price.minorUnits)} {selected.price.asset}
              </dd>
            </div>
            <div>
              <dt>Orden de pago</dt>
              <dd>{catalog.paymentOrder.map(bucketLabel).join(" → ")}</dd>
            </div>
            <div>
              <dt>Disponible</dt>
              <dd>{formatMinor(catalog.paymentBalances.AVAILABLE)} ZYXE</dd>
            </div>
            <div>
              <dt>Promocional</dt>
              <dd>{formatMinor(catalog.paymentBalances.PROMOTIONAL)} ZYXE</dd>
            </div>
          </dl>
        </EconomicConfirmation>
      ) : null}
    </section>
  );
}

function StoreSummary({ catalog }: { catalog: StoreCatalog }) {
  return (
    <div className="commerceSummary" aria-label="Saldos utilizables">
      <article>
        <span>Disponible</span>
        <strong>{formatMinor(catalog.paymentBalances.AVAILABLE)} ZYXE</strong>
        <small>Saldo validado utilizable.</small>
      </article>
      <article className="promotional">
        <span>Promocional</span>
        <strong>{formatMinor(catalog.paymentBalances.PROMOTIONAL)} ZYXE</strong>
        <small>Utilizable con límites; no retirable.</small>
      </article>
      <article>
        <span>Orden de débito</span>
        <strong>{catalog.paymentOrder.map(bucketLabel).join(" → ")}</strong>
        <small>La respuesta final muestra el desglose exacto.</small>
      </article>
    </div>
  );
}

function StoreProductCard({
  product,
  onSelect,
}: {
  product: StoreProduct;
  onSelect: () => void;
}) {
  const available = product.state === "AVAILABLE";
  const art = productArt(product.id);
  return (
    <article className={`storeCard ${available ? "" : "locked"}`}>
      <div className="storeCardTop">
        <span className="storeProductArt">
          <Image src={art.src} width={art.width} height={art.height} alt="" />
        </span>
        <span className={`storeKind kind-${product.kind.toLowerCase()}`}>
          {product.kind}
        </span>
      </div>
      <h2>{product.name}</h2>
      <p>{product.description}</p>
      <small>{product.meta}</small>
      <dl className="storeProductFacts">
        <div>
          <dt>Efecto</dt>
          <dd>{product.effect.label}</dd>
        </div>
        {product.limits.remainingToday !== null ? (
          <div>
            <dt>Restantes hoy</dt>
            <dd>{product.limits.remainingToday}</dd>
          </div>
        ) : null}
      </dl>
      {product.reasonCode ? (
        <div className="storeReason">
          <span>{productStateLabel(product.state)}</span>
          <code>{product.reasonCode}</code>
        </div>
      ) : null}
      <div className="storeCardAction">
        <strong>
          {formatMinor(product.price.minorUnits)} {product.price.asset}
        </strong>
        <button
          className={available ? "button" : ""}
          type="button"
          disabled={!available}
          onClick={onSelect}
        >
          {available ? "Comprar" : productStateLabel(product.state)}
        </button>
      </div>
    </article>
  );
}

function PurchaseNotice({ receipt }: { receipt: PurchaseReceipt }) {
  return (
    <section className="purchaseReceipt" role="status">
      <div>
        <strong>Compra confirmada · {receipt.effectLabel}</strong>
        <small>
          Transacción {receipt.transactionId}
          {receipt.replayed ? " · respuesta idempotente recuperada" : ""}
        </small>
      </div>
      <dl>
        <div>
          <dt>Disponible</dt>
          <dd>-{formatMinor(receipt.payment.availableMinorUnits)}</dd>
        </div>
        <div>
          <dt>Promocional</dt>
          <dd>-{formatMinor(receipt.payment.promotionalMinorUnits)}</dd>
        </div>
        <div>
          <dt>Quema</dt>
          <dd>{formatMinor(receipt.split.burnMinorUnits)}</dd>
        </div>
        <div>
          <dt>Pools</dt>
          <dd>{formatMinor(receipt.split.recycleMinorUnits)}</dd>
        </div>
        <div>
          <dt>Tesorería</dt>
          <dd>{formatMinor(receipt.split.treasuryMinorUnits)}</dd>
        </div>
      </dl>
    </section>
  );
}

function productArt(id: string) {
  if (id === "b1")
    return { src: "/rewards/ic-energy.png", width: 31, height: 48 };
  if (id === "b4")
    return { src: "/rewards/ic-upgrade.png", width: 46, height: 46 };
  if (id === "b5")
    return { src: "/rewards/ic-missions.png", width: 46, height: 46 };
  if (id === "b6")
    return { src: "/rewards/mining-machine.png", width: 76, height: 40 };
  return { src: "/rewards/ic-boost.png", width: 40, height: 46 };
}

function productStateLabel(state: StoreProduct["state"]) {
  return (
    {
      AVAILABLE: "Disponible",
      LOCKED: "Bloqueado",
      ACTIVE: "Ya activo",
      LIMIT_REACHED: "Límite alcanzado",
      NO_SLOT: "Sin slot",
      DISABLED: "Deshabilitado",
    } as const
  )[state];
}

function bucketLabel(bucket: "AVAILABLE" | "PROMOTIONAL") {
  return bucket === "AVAILABLE" ? "Disponible" : "Promocional";
}

function formatBps(value: number) {
  return `${value / 100}%`;
}

function formatMinor(value: string) {
  try {
    return BigInt(value).toLocaleString("es-CO");
  } catch {
    return value;
  }
}
