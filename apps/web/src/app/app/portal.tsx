"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";
type User = { email: string; displayName: string | null; status: string };
type Balance = { bucket: string; minorUnits: string };

export function AuthPortal() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [user, setUser] = useState<User | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
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
      const response = await fetch(`${API}/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-device-id": getDeviceId(),
        },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? "No fue posible autenticarte");
      const balanceResponse = await fetch(`${API}/balances`, {
        credentials: "include",
      });
      const balanceResult = await balanceResponse.json();
      setUser(result.user);
      setBalances(balanceResult.balances ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch(`${API}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
    setBalances([]);
  }

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
          <div className="notice">
            Tu cuenta está en estado <strong>{user.status}</strong>. El faucet
            se habilitará después de verificar el correo.
          </div>
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
            onClick={() => setMode("login")}
          >
            Ingresar
          </button>
          <button
            className={mode === "register" ? "active" : ""}
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
        </form>
        <p className="authLegal">
          ZYXE es una unidad interna de utilidad y no representa una inversión.
        </p>
      </section>
    </main>
  );
}

function getDeviceId() {
  const key = "fz_device_id";
  const current = localStorage.getItem(key);
  if (current) return current;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
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
