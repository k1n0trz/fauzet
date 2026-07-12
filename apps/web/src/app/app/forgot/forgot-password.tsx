"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { API_BASE } from "../../../lib/api";
export function ForgotPassword() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const email = new FormData(event.currentTarget).get("email");
    try {
      const response = await fetch(`${API_BASE}/auth/password/forgot`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error("request_failed");
      setMessage(
        "Si existe una cuenta, enviamos un enlace que expira en una hora.",
      );
    } catch {
      setError("No pudimos procesar la solicitud. Inténtalo de nuevo.");
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
        <div className="eyebrow">Recuperación segura</div>
        <h1 className="authTitle">Recupera tu acceso</h1>
        <p className="authCopy">
          El mensaje no revelará si el email está registrado.
        </p>
        <form className="authForm" onSubmit={submit}>
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          {message && (
            <div className="notice" role="status">
              {message}
            </div>
          )}
          {error && (
            <div className="formError" role="alert">
              {error}
            </div>
          )}
          <button className="button submitButton" disabled={loading}>
            {loading ? "Enviando…" : "Enviar enlace"}
          </button>
        </form>
        <p className="authLegal">
          <Link href="/app">Volver al ingreso</Link>
        </p>
      </section>
    </main>
  );
}
