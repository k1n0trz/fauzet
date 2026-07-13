"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchFiatOrder,
  fiatErrorMessage,
  nextFiatOrderPollDelay,
  type FiatOrder,
  type FiatOrderStatus,
} from "../../../../../../lib/fiat-store-api";
import { StoreTabs } from "../../../store-tabs";

export function FiatOrderExperience({ orderId }: { orderId: string }) {
  const [result, setResult] = useState<FiatOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pollingExhausted, setPollingExhausted] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    async function poll(completedAttempts: number) {
      try {
        const next = await fetchFiatOrder(orderId, controller.signal);
        if (disposed) return;
        setResult(next);
        setLoading(false);
        setError("");

        const attempts = completedAttempts + 1;
        const delay = nextFiatOrderPollDelay(next.order.status, attempts);
        if (delay === null) {
          setPollingExhausted(isPendingStatus(next.order.status));
          return;
        }
        timer = setTimeout(() => void poll(attempts), delay);
      } catch (caught) {
        if (disposed || isAbortError(caught)) return;
        setLoading(false);
        setError(fiatErrorMessage(caught));
      }
    }

    void poll(0);
    return () => {
      disposed = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [orderId, refreshKey]);

  const order = result?.order ?? null;
  const presentation = order ? orderPresentation(order.status) : null;

  function refresh() {
    setLoading(result === null);
    setError("");
    setPollingExhausted(false);
    setRefreshKey((key) => key + 1);
  }

  return (
    <section
      className="rewardsPage storePage fiatOrderPage"
      aria-labelledby="fiat-order-title"
    >
      <div className="commerceHeading">
        <div>
          <div className="eyebrow">Mercado Pago TEST · estado autoritativo</div>
          <h1 className="rewardsTitle" id="fiat-order-title">
            Estado de la orden
          </h1>
          <p className="lead">
            Esta pantalla ignora los parámetros de retorno de Mercado Pago. El
            resultado que ves procede únicamente del backend de Fauzet.
          </p>
        </div>
      </div>

      <StoreTabs />

      {loading && !result ? (
        <div className="catalogLoading" role="status">
          <span className="faucetSpinner" aria-hidden="true" />
          Verificando la orden con el servidor…
        </div>
      ) : null}

      {error ? (
        <div className="rewardError" role="alert">
          <strong>No pudimos verificar esta orden.</strong>
          <span>{error}</span>
          <button type="button" onClick={refresh}>
            Reintentar
          </button>
        </div>
      ) : null}

      {order && presentation ? (
        <article
          className={`fiatOrderPanel tone-${presentation.tone}`}
          aria-live="polite"
        >
          <div className="fiatOrderStatus">
            <span>{presentation.kicker}</span>
            <strong>{presentation.title}</strong>
            <p>{presentation.copy}</p>
            {order.reasonCode ? <code>{order.reasonCode}</code> : null}
          </div>

          <dl className="fiatOrderFacts">
            <div>
              <dt>Producto</dt>
              <dd>{order.name}</dd>
            </div>
            <div>
              <dt>Precio simulado</dt>
              <dd>{formatCop(order.price.minorUnits)} COP</dd>
            </div>
            <div>
              <dt>Estado del servidor</dt>
              <dd>{order.status}</dd>
            </div>
            <div>
              <dt>Orden</dt>
              <dd>{order.id}</dd>
            </div>
            <div>
              <dt>Actualizada</dt>
              <dd>{formatDate(order.updatedAt)}</dd>
            </div>
            <div>
              <dt>Activación</dt>
              <dd>Cerrada</dd>
            </div>
          </dl>

          {pollingExhausted ? (
            <div className="fiatOrderWaiting" role="status">
              La verificación continúa en segundo plano. Puedes actualizar el
              estado sin repetir el pago.
            </div>
          ) : null}

          <div className="fiatOrderActions">
            {isPendingStatus(order.status) ? (
              <button type="button" onClick={refresh}>
                Actualizar estado
              </button>
            ) : null}
            {canResumeCheckout(order) ? (
              <a href={order.checkout!.url} rel="noreferrer">
                Reabrir Mercado Pago TEST
              </a>
            ) : null}
            {order.status === "PAID" ? (
              <Link className="primary" href="/app/store/inventory">
                Ver mi inventario
              </Link>
            ) : null}
            <Link href="/app/store/fiat">Volver al catálogo TEST</Link>
          </div>
        </article>
      ) : null}

      <aside className="commercePolicy">
        <strong>Nunca acreditamos por URL.</strong> Los parámetros como
        <code> status</code>, <code>payment_id</code> o
        <code> external_reference</code> pueden aparecer al regresar, pero esta
        vista no los lee ni los usa para crear inventario.
      </aside>
    </section>
  );
}

function orderPresentation(status: FiatOrderStatus) {
  return (
    {
      CREATED: {
        tone: "pending",
        kicker: "Preparando checkout",
        title: "La orden de prueba fue recibida",
        copy: "Mercado Pago TEST todavía está preparando el checkout. No se acreditó ningún producto.",
      },
      CHECKOUT_READY: {
        tone: "pending",
        kicker: "Esperando pago verificado",
        title: "El checkout de prueba está disponible",
        copy: "Aún no existe un pago confirmado por el servidor ni un producto en el inventario.",
      },
      PENDING: {
        tone: "pending",
        kicker: "Verificación en curso",
        title: "Mercado Pago reporta un pago pendiente",
        copy: "Fauzet seguirá consultando el estado. No se acreditó ningún producto todavía.",
      },
      PAID: {
        tone: "success",
        kicker: "Pago TEST verificado",
        title: "El producto está en tu inventario",
        copy: "El backend verificó el pago directamente con Mercado Pago. El producto permanece sin activar y no genera ZYXE.",
      },
      HELD: {
        tone: "warning",
        kicker: "Revisión requerida",
        title: "La orden quedó retenida",
        copy: "La verificación no coincidió con la orden esperada. No se acreditó ningún producto.",
      },
      DISPUTED: {
        tone: "warning",
        kicker: "Pago disputado",
        title: "La orden está en revisión",
        copy: "El producto no debe utilizarse mientras el servidor resuelve la disputa de prueba.",
      },
      REFUND_PENDING: {
        tone: "warning",
        kicker: "Reembolso en curso",
        title: "La devolución de prueba está pendiente",
        copy: "El servidor conserva el estado hasta recibir confirmación autoritativa del proveedor.",
      },
      REFUNDED: {
        tone: "neutral",
        kicker: "Pago devuelto",
        title: "La orden fue reembolsada",
        copy: "El pago de prueba fue devuelto y el producto no está disponible para activación.",
      },
      CANCELLED: {
        tone: "neutral",
        kicker: "Checkout cancelado",
        title: "La orden no se completó",
        copy: "No existe un producto acreditado por esta orden de prueba.",
      },
      EXPIRED: {
        tone: "neutral",
        kicker: "Checkout vencido",
        title: "La orden expiró",
        copy: "No existe un pago confirmado ni un producto acreditado por esta orden.",
      },
    } as const
  )[status];
}

function isPendingStatus(status: FiatOrderStatus) {
  return ["CREATED", "CHECKOUT_READY", "PENDING"].includes(status);
}

function canResumeCheckout(order: FiatOrder["order"]) {
  return (
    order.status === "CHECKOUT_READY" &&
    order.checkout !== null &&
    Date.parse(order.checkout.expiresAt) > Date.now()
  );
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

function isAbortError(caught: unknown) {
  return caught instanceof Error && caught.name === "AbortError";
}
