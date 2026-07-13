"use client";
import Link from "next/link";
import { useState } from "react";
import { API_BASE } from "../../../lib/api";

export function VerifyEmail({ token }: { token: string }) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >(token ? "idle" : "error");
  const [message, setMessage] = useState(
    token
      ? "Confirma que quieres verificar esta dirección de email."
      : "El enlace no contiene un token válido.",
  );

  async function confirmEmail() {
    if (!token || status === "loading") return;
    setStatus("loading");
    setMessage("Verificando tu email…");
    try {
      const response = await fetch(
        `${API_BASE}/auth/email-verification/confirm`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.message ?? "No fue posible verificar el email",
        );
      }
      setStatus("success");
      setMessage(
        result.bonusTransactionId
          ? "Email verificado. Tu bono promocional ya está en la wallet."
          : "Email verificado correctamente.",
      );
    } catch (error: unknown) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Enlace inválido o expirado",
      );
    } finally {
      window.history.replaceState(null, "", "/app/verify");
    }
  }

  const canConfirm = token && (status === "idle" || status === "error");

  return (
    <main className="authShell">
      <Link className="brand authBrand" href="/">
        Fau<span>zet</span>
      </Link>
      <section className="authCard" aria-live="polite">
        <div className="eyebrow">Verificación de cuenta</div>
        <h1 className="authTitle">
          {status === "loading"
            ? "Un momento"
            : status === "success"
              ? "Cuenta activada"
              : status === "idle"
                ? "Confirma tu correo"
                : "No pudimos verificar"}
        </h1>
        <p className="authCopy">{message}</p>
        {canConfirm && (
          <button
            className="button submitButton authAction"
            type="button"
            onClick={confirmEmail}
          >
            {status === "error" ? "Intentar de nuevo" : "Verificar email"}
          </button>
        )}
        {status === "success" && (
          <Link className="button submitButton authAction" href="/app">
            Ir a Fauzet
          </Link>
        )}
        {status === "error" && (
          <p className="authLegal">
            <Link href="/app">Solicitar un enlace nuevo</Link>
          </p>
        )}
      </section>
    </main>
  );
}
