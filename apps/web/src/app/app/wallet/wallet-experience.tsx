"use client";

import type { AccountActivityResponse, Balance } from "@fauzet/contracts";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./wallet.module.css";

const API_BASE = "/api/v1";

type BalanceResponse = { balances: Balance[]; asOf: string };

const bucketCopy: Record<string, { label: string; help: string }> = {
  AVAILABLE: { label: "Disponible", help: "Puede usarse dentro de Fauzet." },
  PENDING: { label: "Pendiente", help: "En validación antes de liberarse." },
  PROMOTIONAL: { label: "Promocional", help: "Uso interno; no retirable." },
  LOCKED: { label: "Bloqueado", help: "Sujeto a una condición o periodo." },
  ELIGIBLE: {
    label: "Elegible",
    help: "Apto para conversión cuando esté habilitada.",
  },
  RESERVED: {
    label: "Reservado",
    help: "Apartado por una operación en curso.",
  },
  WITHDRAWN: {
    label: "Retirado",
    help: "Liquidado en operaciones completadas.",
  },
};

const activityCopy: Record<string, string> = {
  welcome_bonus: "Bono de bienvenida",
  faucet_claim: "Reclamo de Faucet",
  game_reward: "Recompensa de juego",
  mission_reward: "Recompensa de misión",
  store_purchase: "Compra en tienda",
  miner_purchase: "Compra de minero",
  miner_upgrade: "Mejora de minero",
  miner_repair: "Reparación de minero",
  mining_settlement: "Liquidación de minería",
  referral_commission: "Comisión de Mining Crew",
  conversion_reserve: "Reserva de conversión",
  conversion_release: "Liberación de conversión",
  withdrawal_settlement: "Liquidación de retiro",
  reversal: "Reverso",
};

export function WalletExperience() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [activity, setActivity] = useState<AccountActivityResponse["items"]>(
    [],
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balanceResponse, activityResponse] = await Promise.all([
        fetch(`${API_BASE}/balances`, { credentials: "include" }),
        fetch(`${API_BASE}/account/activity?limit=20`, {
          credentials: "include",
        }),
      ]);
      if (balanceResponse.status === 401 || activityResponse.status === 401) {
        setSignedOut(true);
        return;
      }
      if (!balanceResponse.ok || !activityResponse.ok) {
        throw new Error("No pudimos cargar tu wallet.");
      }
      const balancePayload = (await balanceResponse.json()) as BalanceResponse;
      const activityPayload =
        (await activityResponse.json()) as AccountActivityResponse;
      setBalances(balancePayload.balances);
      setActivity(activityPayload.items);
      setNextCursor(activityPayload.nextCursor);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pudimos cargar tu wallet.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const byBucket = useMemo(
    () => new Map(balances.map((balance) => [balance.bucket, balance])),
    [balances],
  );

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/account/activity?limit=20&cursor=${encodeURIComponent(nextCursor)}`,
        { credentials: "include" },
      );
      if (response.status === 401) {
        setSignedOut(true);
        return;
      }
      if (!response.ok) throw new Error("No pudimos cargar más movimientos.");
      const payload = (await response.json()) as AccountActivityResponse;
      setActivity((current) => [...current, ...payload.items]);
      setNextCursor(payload.nextCursor);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pudimos cargar más movimientos.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  if (signedOut) {
    return (
      <main className={styles.statePage}>
        <h1>Tu sesión terminó</h1>
        <p>Vuelve a iniciar sesión para consultar balances y movimientos.</p>
        <Link href="/app">Iniciar sesión</Link>
      </main>
    );
  }

  return (
    <main className={styles.walletPage}>
      <header className={styles.heading}>
        <div>
          <span>WALLET INTERNA</span>
          <h1>Tu wallet ZYXE</h1>
          <p>
            Saldos derivados directamente del ledger. Cada bucket conserva sus
            propias reglas de uso y elegibilidad.
          </p>
        </div>
        <Image
          src="/fauzet/coin-zyxe.png"
          alt="ZYXE"
          width={76}
          height={76}
          priority
        />
      </header>

      {loading ? (
        <div className={styles.loading} role="status">
          Cargando balances y movimientos…
        </div>
      ) : (
        <>
          <section className={styles.balanceGrid} aria-label="Saldos ZYXE">
            {Object.entries(bucketCopy).map(([bucket, copy]) => {
              const balance = byBucket.get(bucket as Balance["bucket"]);
              return (
                <article className={styles.balanceCard} key={bucket}>
                  <span>{copy.label}</span>
                  <strong>
                    {formatMinor(balance?.minorUnits ?? "0")}{" "}
                    <small>ZYXE</small>
                  </strong>
                  <p>{copy.help}</p>
                </article>
              );
            })}
          </section>

          <aside className={styles.walletNotice}>
            <strong>ZYXE sigue siendo una unidad interna.</strong>
            <span>
              Los retiros y conversiones reales están deshabilitados. La sección
              sandbox no mueve dinero ni criptomonedas.
            </span>
            <Link href="/app/convert">Abrir conversión sandbox</Link>
          </aside>

          <section className={styles.activitySection}>
            <div className={styles.sectionHeading}>
              <div>
                <span>LEDGER PERSONAL</span>
                <h2>Movimientos recientes</h2>
              </div>
              <button type="button" onClick={() => void load()}>
                Actualizar
              </button>
            </div>

            {activity.length === 0 ? (
              <div className={styles.emptyState}>
                <strong>Aún no hay movimientos.</strong>
                <p>Tu primera recompensa o compra aparecerá aquí.</p>
              </div>
            ) : (
              <div className={styles.activityList}>
                {activity.map((transaction) => (
                  <article className={styles.activityRow} key={transaction.id}>
                    <div className={styles.activityIdentity}>
                      <span>{activityLabel(transaction.type)}</span>
                      <small>
                        {new Intl.DateTimeFormat("es-CO", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(transaction.createdAt))}
                      </small>
                    </div>
                    <div className={styles.movements}>
                      {transaction.movements.map((movement, index) => (
                        <div
                          className={
                            movement.minorUnits.startsWith("-")
                              ? styles.debit
                              : styles.credit
                          }
                          key={`${transaction.id}-${movement.bucket}-${index}`}
                        >
                          <span>
                            {bucketCopy[movement.bucket]?.label ??
                              movement.bucket}
                          </span>
                          <strong>
                            {signedMinor(movement.minorUnits)} {movement.asset}
                          </strong>
                        </div>
                      ))}
                    </div>
                    <span className={styles.status}>{transaction.status}</span>
                  </article>
                ))}
              </div>
            )}

            {nextCursor ? (
              <button
                className={styles.loadMore}
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? "Cargando…" : "Ver más movimientos"}
              </button>
            ) : null}
          </section>
        </>
      )}

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}
    </main>
  );
}

function activityLabel(type: string) {
  return activityCopy[type.toLowerCase()] ?? type.replaceAll("_", " ");
}

function formatMinor(value: string) {
  try {
    return new Intl.NumberFormat("es-CO").format(BigInt(value));
  } catch {
    return value;
  }
}

function signedMinor(value: string) {
  const formatted = formatMinor(value);
  return value.startsWith("-") ? formatted : `+${formatted}`;
}
