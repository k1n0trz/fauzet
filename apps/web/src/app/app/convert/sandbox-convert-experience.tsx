"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelSandboxConversion,
  confirmSandboxWithdrawal,
  createSandboxQuote,
  createSandboxWallet,
  fetchSandboxStatus,
  reserveSandboxConversion,
  requestSandboxWithdrawalCode,
  type SandboxQuoteResponse,
  type SandboxStatusResponse,
} from "../../../lib/sandbox-api";
import {
  clearMutationKey,
  getOrCreateMutationKey,
} from "../../../lib/mutation-attempt-storage";
import {
  errorMessage,
  shouldKeepMutationAttempt,
} from "../../../lib/reward-api";

type Asset = "SANDBOX_LTC" | "SANDBOX_DOGE";

export function SandboxConvertExperience() {
  const [status, setStatus] = useState<SandboxStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<SandboxQuoteResponse["quote"] | null>(
    null,
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [asset, setAsset] = useState<Asset>("SANDBOX_LTC");
  const [amount, setAmount] = useState("5.00");
  const [walletNetwork, setWalletNetwork] = useState<Asset>("SANDBOX_LTC");
  const [walletAddress, setWalletAddress] = useState(
    "sandbox:destination_demo_0001",
  );
  const [walletLabel, setWalletLabel] = useState("Billetera de prueba");
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [walletSelections, setWalletSelections] = useState<
    Record<string, string>
  >({});
  const [challenges, setChallenges] = useState<
    Record<string, { challengeId: string; recipientMasked: string }>
  >({});
  const [codes, setCodes] = useState<Record<string, string>>({});

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      setStatus(await fetchSandboxStatus(signal));
    } catch (caught) {
      if (!signal?.aborted) setError(errorMessage(caught));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const result = await fetchSandboxStatus(controller.signal);
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

  const activeWallets = useMemo(
    () => status?.wallets.filter((wallet) => wallet.status === "ACTIVE") ?? [],
    [status],
  );
  const conversionsUnderReview = useMemo(
    () =>
      new Set(
        status?.withdrawals
          .filter((withdrawal) => withdrawal.status === "REVIEW")
          .map((withdrawal) => withdrawal.conversionId) ?? [],
      ),
    [status],
  );

  async function addWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("wallet");
    setError("");
    setNotice("");
    try {
      setStatus(
        await createSandboxWallet({
          network: walletNetwork,
          address: walletAddress,
          label: walletLabel,
        }),
      );
      setNotice(
        "Destino sandbox guardado. Queda bloqueado durante 24 horas como control de seguridad.",
      );
      setWalletAddress(`sandbox:${crypto.randomUUID().replaceAll("-", "")}`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function requestQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("quote");
    setError("");
    setNotice("");
    try {
      const eligibleMinorUnits = toMinor(amount);
      const result = await createSandboxQuote({ asset, eligibleMinorUnits });
      setQuote(result.quote);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function reserve() {
    if (!quote) return;
    const signature = quote.id;
    const key = getOrCreateMutationKey("sandbox-conversion", signature);
    setBusy("reserve");
    setError("");
    try {
      await reserveSandboxConversion(quote.id, key);
      clearMutationKey("sandbox-conversion", signature);
      setQuote(null);
      setNotice("ZYXE reservado en el ledger para esta simulación.");
      await refresh();
    } catch (caught) {
      if (!shouldKeepMutationAttempt(caught))
        clearMutationKey("sandbox-conversion", signature);
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function withdraw(conversionId: string) {
    const walletId = walletSelections[conversionId];
    const password = passwords[conversionId];
    const challenge = challenges[conversionId];
    const code = codes[conversionId] ?? "";
    if (!walletId || !password || !challenge || !/^\d{6}$/.test(code ?? "")) {
      setError(
        "Selecciona un destino, solicita el código por email y confirma código y contraseña.",
      );
      return;
    }
    const signature = `${conversionId}:${walletId}`;
    const key = getOrCreateMutationKey("sandbox-withdrawal", signature);
    setBusy(`withdraw:${conversionId}`);
    setError("");
    try {
      const result = await confirmSandboxWithdrawal(
        {
          conversionId,
          walletId,
          password,
          challengeId: challenge.challengeId,
          code,
        },
        key,
      );
      clearMutationKey("sandbox-withdrawal", signature);
      setPasswords((current) => ({ ...current, [conversionId]: "" }));
      setNotice(
        result.withdrawal.status === "CONFIRMED"
          ? "Simulación confirmada: se generó un txid ficticio y no hubo broadcast."
          : result.withdrawal.status === "REVIEW"
            ? "La simulación quedó retenida para revisión por riesgo. Puedes cancelarla."
            : "La simulación fue rechazada y la reserva regresó a elegible.",
      );
      await refresh();
    } catch (caught) {
      if (!shouldKeepMutationAttempt(caught))
        clearMutationKey("sandbox-withdrawal", signature);
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function requestCode(conversionId: string) {
    const walletId = walletSelections[conversionId];
    if (!walletId) {
      setError("Selecciona primero un destino sandbox activo.");
      return;
    }
    setBusy(`code:${conversionId}`);
    setError("");
    try {
      const challenge = await requestSandboxWithdrawalCode({
        conversionId,
        walletId,
      });
      setChallenges((current) => ({
        ...current,
        [conversionId]: {
          challengeId: challenge.challengeId,
          recipientMasked: challenge.recipientMasked,
        },
      }));
      setNotice(
        `Código de un solo uso enviado a ${challenge.recipientMasked}; expira en 10 minutos.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function cancel(conversionId: string) {
    const key = getOrCreateMutationKey("sandbox-cancel", conversionId);
    setBusy(`cancel:${conversionId}`);
    setError("");
    try {
      await cancelSandboxConversion(conversionId, key);
      clearMutationKey("sandbox-cancel", conversionId);
      setNotice("Reserva cancelada mediante un asiento compensatorio.");
      await refresh();
    } catch (caught) {
      if (!shouldKeepMutationAttempt(caught))
        clearMutationKey("sandbox-cancel", conversionId);
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  return (
    <section
      className="rewardsPage sandboxPage"
      aria-labelledby="sandbox-title"
    >
      <div className="commerceHeading">
        <div>
          <div className="eyebrow">
            Laboratorio económico · sin valor externo
          </div>
          <h1 className="rewardsTitle" id="sandbox-title">
            Conversión y retiro sandbox
          </h1>
          <p className="lead">
            Ensaya el flujo ZYXE → activo ficticio con cotización, reserva,
            cooldown, reautenticación y trazabilidad contable.
          </p>
        </div>
        <span className="sandboxBadge" aria-label="Modo sandbox">
          SANDBOX
        </span>
      </div>

      <aside className="sandboxWarning">
        <strong>No mueve dinero ni criptomonedas.</strong> Las redes,
        direcciones, tasas y txid de esta sección son ficticios. Los retiros
        reales permanecen desactivados.
      </aside>

      {error ? (
        <div className="rewardError" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="sandboxNotice" role="status">
          {notice}
        </div>
      ) : null}

      {status ? (
        <div className="commerceSummary sandboxBalances">
          <Balance label="Elegible" value={status.eligibleMinorUnits} />
          <Balance label="Reservado" value={status.reservedMinorUnits} />
          <Balance
            label="Retirado sandbox"
            value={status.withdrawnMinorUnits}
          />
        </div>
      ) : loading ? (
        <div className="catalogLoading" role="status">
          Cargando laboratorio…
        </div>
      ) : null}

      <div className="sandboxSetupGrid">
        <form className="sandboxCard" onSubmit={requestQuote}>
          <span className="sandboxStep">Paso 1</span>
          <h2>Cotiza y reserva</h2>
          <label>
            Activo ficticio
            <select
              value={asset}
              onChange={(event) => setAsset(event.target.value as Asset)}
            >
              <option value="SANDBOX_LTC">Sandbox LTC</option>
              <option value="SANDBOX_DOGE">Sandbox DOGE</option>
            </select>
          </label>
          <label>
            ZYXE elegible
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
          <button disabled={Boolean(busy)} type="submit">
            {busy === "quote" ? "Cotizando…" : "Crear cotización (120 s)"}
          </button>
        </form>

        <form className="sandboxCard" onSubmit={addWallet}>
          <span className="sandboxStep">Paso 2</span>
          <h2>Registra un destino</h2>
          <label>
            Red ficticia
            <select
              value={walletNetwork}
              onChange={(event) =>
                setWalletNetwork(event.target.value as Asset)
              }
            >
              <option value="SANDBOX_LTC">Sandbox LTC</option>
              <option value="SANDBOX_DOGE">Sandbox DOGE</option>
            </select>
          </label>
          <label>
            Dirección sandbox
            <input
              value={walletAddress}
              onChange={(event) => setWalletAddress(event.target.value)}
              required
            />
          </label>
          <label>
            Etiqueta
            <input
              value={walletLabel}
              onChange={(event) => setWalletLabel(event.target.value)}
              required
            />
          </label>
          <button disabled={Boolean(busy)} type="submit">
            {busy === "wallet" ? "Guardando…" : "Guardar con cooldown de 24 h"}
          </button>
        </form>
      </div>

      {quote ? (
        <QuoteCard
          quote={quote}
          busy={busy === "reserve"}
          onReserve={reserve}
        />
      ) : null}

      <section className="sandboxHistory" aria-labelledby="sandbox-operations">
        <div className="sectionTitleRow">
          <div>
            <span className="eyebrow">Ledger y estados</span>
            <h2 id="sandbox-operations">Operaciones recientes</h2>
          </div>
          <button
            className="subtleButton"
            type="button"
            onClick={() => void refresh()}
          >
            Actualizar
          </button>
        </div>
        {status?.conversions.length ? (
          status.conversions.map((conversion) => (
            <article className="sandboxOperation" key={conversion.id}>
              <div>
                <span
                  className={`sandboxStatus status-${conversion.status.toLowerCase()}`}
                >
                  {statusLabel(conversion.status)}
                </span>
                <h3>
                  {formatMinor(conversion.quote.eligibleMinorUnits)} ZYXE →{" "}
                  {assetLabel(conversion.quote.asset)}
                </h3>
                <small>
                  Reserva {shortId(conversion.reserveTransactionId)} ·{" "}
                  {formatDate(conversion.createdAt)}
                </small>
              </div>
              {conversion.status === "RESERVED" ? (
                conversionsUnderReview.has(conversion.id) ? (
                  <div className="sandboxActions">
                    <p role="status">
                      <strong>Retiro en revisión.</strong> La reserva sigue
                      protegida mientras el equipo revisa esta simulación.
                    </p>
                    <button
                      className="subtleButton"
                      disabled={Boolean(busy)}
                      type="button"
                      onClick={() => void cancel(conversion.id)}
                    >
                      {busy === `cancel:${conversion.id}`
                        ? "Cancelando…"
                        : "Cancelar retiro en revisión"}
                    </button>
                  </div>
                ) : (
                  <div className="sandboxActions">
                    <select
                      aria-label="Destino sandbox activo"
                      value={walletSelections[conversion.id] ?? ""}
                      onChange={(event) => {
                        setWalletSelections((current) => ({
                          ...current,
                          [conversion.id]: event.target.value,
                        }));
                        setChallenges((current) => {
                          const next = { ...current };
                          delete next[conversion.id];
                          return next;
                        });
                      }}
                    >
                      <option value="">Destino activo…</option>
                      {activeWallets
                        .filter(
                          (wallet) => wallet.network === conversion.quote.asset,
                        )
                        .map((wallet) => (
                          <option value={wallet.id} key={wallet.id}>
                            {wallet.label} · {wallet.addressMasked}
                          </option>
                        ))}
                    </select>
                    <button
                      className="subtleButton"
                      disabled={Boolean(busy)}
                      type="button"
                      onClick={() => void requestCode(conversion.id)}
                    >
                      {busy === `code:${conversion.id}`
                        ? "Enviando…"
                        : "Enviar código 2FA"}
                    </button>
                    <input
                      aria-label="Código de seguridad de seis dígitos"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Código de 6 dígitos"
                      value={codes[conversion.id] ?? ""}
                      onChange={(event) =>
                        setCodes((current) => ({
                          ...current,
                          [conversion.id]: event.target.value.replace(
                            /\D/g,
                            "",
                          ),
                        }))
                      }
                    />
                    <input
                      type="password"
                      autoComplete="current-password"
                      placeholder="Confirma tu contraseña"
                      value={passwords[conversion.id] ?? ""}
                      onChange={(event) =>
                        setPasswords((current) => ({
                          ...current,
                          [conversion.id]: event.target.value,
                        }))
                      }
                    />
                    <button
                      disabled={Boolean(busy)}
                      type="button"
                      onClick={() => void withdraw(conversion.id)}
                    >
                      {busy === `withdraw:${conversion.id}`
                        ? "Validando…"
                        : "Simular retiro"}
                    </button>
                    <button
                      className="subtleButton"
                      disabled={Boolean(busy)}
                      type="button"
                      onClick={() => void cancel(conversion.id)}
                    >
                      {busy === `cancel:${conversion.id}`
                        ? "Cancelando…"
                        : "Cancelar reserva"}
                    </button>
                  </div>
                )
              ) : null}
            </article>
          ))
        ) : (
          <p className="sandboxEmpty">Aún no hay conversiones sandbox.</p>
        )}
      </section>

      {status?.wallets.length ? (
        <section className="sandboxWallets" aria-label="Destinos sandbox">
          <h2>Destinos registrados</h2>
          {status.wallets.map((wallet) => (
            <div key={wallet.id}>
              <span>
                {wallet.label} · {wallet.addressMasked}
              </span>
              <strong>
                {wallet.status === "ACTIVE"
                  ? "Activo"
                  : `Disponible ${formatDate(wallet.availableAt)}`}
              </strong>
            </div>
          ))}
        </section>
      ) : null}
    </section>
  );
}

function Balance({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{formatMinor(value)} ZYXE</strong>
      <small>Bucket contable interno.</small>
    </article>
  );
}

function QuoteCard({
  quote,
  busy,
  onReserve,
}: {
  quote: SandboxQuoteResponse["quote"];
  busy: boolean;
  onReserve: () => void;
}) {
  return (
    <aside className="sandboxQuote">
      <div>
        <span>Cotización efímera</span>
        <strong>
          {formatAsset(quote.netAssetMinorUnits)} {assetLabel(quote.asset)}
        </strong>
      </div>
      <dl>
        <div>
          <dt>Reserva</dt>
          <dd>{formatMinor(quote.eligibleMinorUnits)} ZYXE</dd>
        </div>
        <div>
          <dt>Spread</dt>
          <dd>{quote.spreadBps / 100}%</dd>
        </div>
        <div>
          <dt>Fee sandbox</dt>
          <dd>{formatAsset(quote.networkFeeAssetMinorUnits)}</dd>
        </div>
        <div>
          <dt>Expira</dt>
          <dd>{formatDate(quote.expiresAt)}</dd>
        </div>
      </dl>
      <button
        disabled={busy || quote.status !== "OPEN"}
        type="button"
        onClick={onReserve}
      >
        {busy ? "Reservando…" : "Reservar ZYXE"}
      </button>
    </aside>
  );
}

function toMinor(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Ingresa un monto con máximo dos decimales.");
  const [whole, fraction = ""] = value.trim().split(".");
  return (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}
const integerFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});
const decimalSeparator =
  new Intl.NumberFormat("es-CO")
    .formatToParts(1.1)
    .find((part) => part.type === "decimal")?.value ?? ",";

export function formatMinor(value: string) {
  return formatUnits(value, 2, 2);
}
export function formatAsset(value: string) {
  return formatUnits(value, 8, 0);
}
function formatUnits(value: string, decimals: number, minimumDecimals: number) {
  const units = BigInt(value);
  const absoluteUnits = units < 0n ? -units : units;
  const scale = 10n ** BigInt(decimals);
  const whole = absoluteUnits / scale;
  let fraction = (absoluteUnits % scale).toString().padStart(decimals, "0");

  while (fraction.length > minimumDecimals && fraction.endsWith("0")) {
    fraction = fraction.slice(0, -1);
  }

  const sign = units < 0n ? "-" : "";
  const formattedWhole = integerFormatter.format(whole);
  return fraction
    ? `${sign}${formattedWhole}${decimalSeparator}${fraction}`
    : `${sign}${formattedWhole}`;
}
function assetLabel(asset: Asset) {
  return asset === "SANDBOX_LTC" ? "sLTC" : "sDOGE";
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
function shortId(value: string) {
  return `${value.slice(0, 8)}…`;
}
function statusLabel(value: string) {
  return (
    (
      {
        RESERVED: "Reservado",
        COMPLETED: "Confirmado",
        CANCELLED: "Cancelado",
        REJECTED: "Rechazado",
      } as Record<string, string>
    )[value] ?? value
  );
}
