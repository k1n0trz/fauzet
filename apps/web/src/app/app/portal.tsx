"use client";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { API_BASE } from "../../lib/api";
import { getDeviceId } from "../../lib/device";

type User = { email: string; displayName: string | null; status: string };
type Balance = { bucket: string; minorUnits: string };
type ApiError = { error?: { message?: string } };

export function AuthPortal() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [user, setUser] = useState<User | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [verificationLoading, setVerificationLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function restoreSession() {
      try {
        const response = await fetch(`${API_BASE}/me`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) return;

        const result = (await response.json()) as ApiError & { user?: User };
        if (!response.ok || !result.user) {
          throw new Error(
            result.error?.message ?? "No fue posible restaurar tu sesión",
          );
        }

        setUser(result.user);

        try {
          setBalances(await fetchBalances(controller.signal));
        } catch (caught) {
          if (!controller.signal.aborted) {
            setBalanceError(balanceErrorMessage(caught));
          }
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "No fue posible restaurar tu sesión",
          );
        }
      } finally {
        if (!controller.signal.aborted) setSessionLoading(false);
      }
    }

    void restoreSession();
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setBalanceError("");
    const form = new FormData(event.currentTarget);
    const body =
      mode === "login"
        ? { email: form.get("email"), password: form.get("password") }
        : {
            email: form.get("email"),
            password: form.get("password"),
            displayName: form.get("displayName"),
            countryCode: form.get("countryCode"),
            locale: "es",
            acceptedTerms: form.get("acceptedTerms") === "on",
            isAdult: form.get("isAdult") === "on",
          };
    try {
      const response = await fetch(`${API_BASE}/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-device-id": getDeviceId(),
        },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as ApiError & { user?: User };
      if (!response.ok || !result.user)
        throw new Error(result.error?.message ?? "No fue posible autenticarte");

      setUser(result.user);
      setBalances([]);

      if (mode === "register") {
        const verification = await fetch(
          `${API_BASE}/auth/email-verification/request`,
          {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: "{}",
          },
        );
        setAccountMessage(
          verification.ok
            ? "Te enviamos el enlace de verificación."
            : "La cuenta fue creada, pero no pudimos enviar el email.",
        );
      }

      try {
        setBalances(await fetchBalances());
      } catch (caught) {
        setBalanceError(balanceErrorMessage(caught));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      const response = await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("logout_failed");
      setUser(null);
      setBalances([]);
      setBalanceError("");
      setAccountMessage("");
    } catch {
      setAccountMessage("No fue posible cerrar la sesión. Inténtalo de nuevo.");
    }
  }

  async function retryBalances() {
    setBalancesLoading(true);
    setBalanceError("");
    try {
      setBalances(await fetchBalances());
    } catch (caught) {
      setBalanceError(balanceErrorMessage(caught));
    } finally {
      setBalancesLoading(false);
    }
  }

  async function requestVerification() {
    if (verificationLoading) return;
    setVerificationLoading(true);
    setAccountMessage("Enviando verificación…");
    try {
      const response = await fetch(
        `${API_BASE}/auth/email-verification/request`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      setAccountMessage(
        response.ok
          ? "Te enviamos un nuevo enlace de verificación."
          : "No fue posible enviar el email. Inténtalo de nuevo.",
      );
    } catch {
      setAccountMessage("No fue posible enviar el email. Inténtalo de nuevo.");
    } finally {
      setVerificationLoading(false);
    }
  }

  if (sessionLoading)
    return (
      <main className="authShell" aria-busy="true">
        <Link className="brand authBrand" href="/">
          Fau<span>zet</span>
        </Link>
        <section className="authCard" aria-live="polite">
          <div className="eyebrow">Acceso seguro</div>
          <h1 className="authTitle">Cargando tu sesión…</h1>
          <p className="authCopy">
            Estamos recuperando tu cuenta y tus balances.
          </p>
        </section>
      </main>
    );

  if (user)
    return (
      <main className="appShell">
        <header className="appHeader">
          <Link className="brand" href="/">
            Fau<span>zet</span>
          </Link>
          <button className="textButton" onClick={logout}>
            Cerrar sesión
          </button>
        </header>
        <section className="dashboard">
          <div className="eyebrow">Beta cerrada · economía interna</div>
          <h1 className="dashboardTitle">
            Hola, {user.displayName ?? user.email}
          </h1>
          <p className="lead">
            Tu wallet está respaldada por siete cuentas de ledger separadas.
          </p>
          <div className="balanceGrid">
            {balances.map((balance) => (
              <article className="balanceCard" key={balance.bucket}>
                <span>{bucketLabel(balance.bucket)}</span>
                <strong>{balance.minorUnits} ZYXE</strong>
              </article>
            ))}
          </div>
          <nav className="dashboardActions" aria-label="Acciones principales">
            <Link className="faucetShortcut" href="/app/faucet">
              <span className="faucetShortcutIcon" aria-hidden="true">
                💧
              </span>
              <span>
                <strong>Ir al faucet</strong>
                <small>
                  Consulta tu cooldown y reclama recompensas validadas.
                </small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="faucetShortcut" href="/app/games">
              <span className="faucetShortcutIcon">
                <Image
                  src="/rewards/ic-games.png"
                  width={30}
                  height={30}
                  alt=""
                />
              </span>
              <span>
                <strong>Centro de juegos</strong>
                <small>Juega sesiones firmadas con score validado.</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="faucetShortcut" href="/app/missions">
              <span className="faucetShortcutIcon">
                <Image
                  src="/rewards/ic-missions.png"
                  width={30}
                  height={30}
                  alt=""
                />
              </span>
              <span>
                <strong>Centro de misiones</strong>
                <small>Consulta progreso y reclama metas confirmadas.</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="faucetShortcut" href="/app/mining">
              <span className="faucetShortcutIcon">
                <Image
                  src="/rewards/ic-mining.png"
                  width={30}
                  height={30}
                  alt=""
                />
              </span>
              <span>
                <strong>Sala de minería</strong>
                <small>
                  Consulta hashpower válido, energía y el pool estimado.
                </small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="faucetShortcut" href="/app/store">
              <span className="faucetShortcutIcon">
                <Image
                  src="/rewards/ic-boost.png"
                  width={27}
                  height={31}
                  alt=""
                />
              </span>
              <span>
                <strong>Tienda de boosts</strong>
                <small>Compra utilidades con precio y pago versionados.</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          </nav>
          {balanceError && (
            <div className="notice" role="alert">
              <strong>{balanceError}</strong>{" "}
              <button
                className="textButton"
                type="button"
                disabled={balancesLoading}
                onClick={retryBalances}
              >
                {balancesLoading ? "Reintentando…" : "Reintentar"}
              </button>
            </div>
          )}
          <div className="notice">
            Tu cuenta está en estado <strong>{user.status}</strong>.{" "}
            {user.status === "PENDING_VERIFICATION" ? (
              <>
                Verifica el correo para activar las recompensas.
                <button
                  className="textButton"
                  type="button"
                  disabled={verificationLoading}
                  onClick={requestVerification}
                >
                  {verificationLoading ? "Enviando…" : "Reenviar verificación"}
                </button>
              </>
            ) : (
              "Tu email está verificado; las recompensas se habilitarán por fases."
            )}
          </div>
          {accountMessage && (
            <div className="notice" role="status">
              {accountMessage}
            </div>
          )}
        </section>
      </main>
    );

  return (
    <main className="authShell">
      <Link className="brand authBrand" href="/">
        Fau<span>zet</span>
      </Link>
      <section className="authCard">
        <div className="eyebrow">Acceso seguro</div>
        <h1 className="authTitle">
          {mode === "login" ? "Hola de nuevo" : "Crea tu cuenta"}
        </h1>
        <p className="authCopy">
          {mode === "login"
            ? "Entra a tu wallet interna Fauzet."
            : "Empieza con saldo cero y actividad completamente trazable."}
        </p>
        <div className="authTabs">
          <button
            className={mode === "login" ? "active" : ""}
            type="button"
            aria-pressed={mode === "login"}
            onClick={() => setMode("login")}
          >
            Ingresar
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            type="button"
            aria-pressed={mode === "register"}
            onClick={() => setMode("register")}
          >
            Registro
          </button>
        </div>
        <form className="authForm" onSubmit={submit}>
          {mode === "register" && (
            <>
              <label>
                Nombre
                <input
                  name="displayName"
                  required
                  minLength={2}
                  autoComplete="name"
                />
              </label>
              <label>
                País
                <select name="countryCode" defaultValue="CO">
                  <option value="CO">Colombia</option>
                  <option value="US">Estados Unidos</option>
                  <option value="MX">México</option>
                </select>
              </label>
            </>
          )}
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </label>
          {mode === "register" && (
            <div className="checks">
              <label>
                <input name="isAdult" type="checkbox" required /> Declaro que
                cumplo la edad requerida.
              </label>
              <label>
                <input name="acceptedTerms" type="checkbox" required /> Acepto
                términos, privacidad y reglas de recompensas.
              </label>
            </div>
          )}
          {error && (
            <div className="formError" role="alert">
              {error}
            </div>
          )}
          <button className="button submitButton" disabled={loading}>
            {loading
              ? "Procesando…"
              : mode === "login"
                ? "Ingresar"
                : "Crear cuenta"}
          </button>
          {mode === "login" && (
            <Link className="authLegal" href="/app/forgot">
              ¿Olvidaste tu contraseña?
            </Link>
          )}
        </form>
        <p className="authLegal">
          ZYXE es una unidad interna de utilidad y no representa una inversión.
        </p>
      </section>
    </main>
  );
}

async function fetchBalances(signal?: AbortSignal): Promise<Balance[]> {
  const response = await fetch(`${API_BASE}/balances`, {
    credentials: "include",
    signal: signal ?? null,
  });
  const result = (await response.json()) as ApiError & {
    balances?: Balance[];
  };

  if (!response.ok || !Array.isArray(result.balances)) {
    throw new Error(
      result.error?.message ?? "No fue posible cargar tus balances",
    );
  }

  return result.balances;
}

function balanceErrorMessage(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "No fue posible cargar tus balances";
}

function bucketLabel(bucket: string) {
  return (
    (
      {
        PENDING: "Pendiente",
        AVAILABLE: "Disponible",
        PROMOTIONAL: "Promocional",
        LOCKED: "Bloqueado",
        ELIGIBLE: "Elegible",
        RESERVED: "En conversión",
        WITHDRAWN: "Retirado",
      } as Record<string, string>
    )[bucket] ?? bucket
  );
}
