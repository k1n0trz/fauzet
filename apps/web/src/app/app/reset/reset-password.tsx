"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { API_BASE } from "../../../lib/api";
export function ResetPassword({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const password = new FormData(event.currentTarget).get("password");
    try {
      const response = await fetch(`${API_BASE}/auth/password/reset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? "Enlace inválido o expirado");
      setDone(true);
      setMessage(
        "Contraseña actualizada. Cerramos tus sesiones anteriores por seguridad.",
      );
      window.history.replaceState(null, "", "/app/reset");
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pudimos actualizar la contraseña.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="authShell">
      <Link className="brand authBrand" href="/">
        Fau<span>zet</span>
      </Link>
      <section className="authCard">
        <div className="eyebrow">Nueva contraseña</div>
        <h1 className="authTitle">Protege tu cuenta</h1>
        {done ? (
          <>
            <div className="notice" role="status">
              {message}
            </div>
            <Link className="button submitButton authAction" href="/app">
              Ingresar de nuevo
            </Link>
          </>
        ) : (
          <form className="authForm" onSubmit={submit}>
            {!token && (
              <div className="formError" role="alert">
                El enlace no contiene un token válido. Solicita uno nuevo.
              </div>
            )}
            <label>
              Nueva contraseña
              <input
                name="password"
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
              />
            </label>
            {error && (
              <div className="formError" role="alert">
                {error}
              </div>
            )}
            <button
              className="button submitButton"
              disabled={loading || !token}
            >
              {loading ? "Actualizando…" : "Cambiar contraseña"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
