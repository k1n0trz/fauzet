"use client";

import type { AccountActivityResponse } from "@fauzet/contracts";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { API_BASE } from "../../lib/api";
import { getDeviceId } from "../../lib/device";
import {
  googleAuthConfigured,
  signInWithGooglePopup,
  signOutGoogle,
} from "../../lib/firebase-auth";
import { fetchGameCatalog, type GameCatalog } from "../../lib/games-api";
import { fetchMiningStatus, type MiningStatus } from "../../lib/mining-api";
import { fetchMissions, type MissionCatalog } from "../../lib/missions-api";
import { fetchReferralCrew } from "../../lib/referrals-api";
import styles from "./portal.module.css";

type User = { email: string; displayName: string | null; status: string };
type Balance = { bucket: string; minorUnits: string };
type ApiError = {
  error?: string | { code?: string; message?: string };
  message?: string;
};

type FaucetStatus = {
  state: string;
  canClaim: boolean;
  nextClaimAt: string | null;
  claimsToday: number;
  dailyClaimLimit: number;
  reward: {
    asset: string;
    minMinorUnits: string;
    maxMinorUnits: string;
  };
  streakDays: number;
  bonusMultiplier: string;
};

type CrewSnapshot = Awaited<ReturnType<typeof fetchReferralCrew>>;

type DashboardModules = {
  faucet: FaucetStatus | null;
  games: GameCatalog | null;
  missions: MissionCatalog | null;
  mining: MiningStatus | null;
  crew: CrewSnapshot | null;
  activity: AccountActivityResponse["items"] | null;
};

const dashboardActions = [
  {
    href: "/app/faucet",
    label: "Faucet",
    detail: "Reclama ZYXE con reglas verificadas",
    icon: "/fauzet/ic-faucet.png",
  },
  {
    href: "/app/games",
    label: "Centro de juegos",
    detail: "Sesiones y puntajes validados",
    icon: "/fauzet/ic-games.png",
  },
  {
    href: "/app/missions",
    label: "Centro de misiones",
    detail: "Metas y recompensas trazables",
    icon: "/fauzet/ic-missions.png",
  },
  {
    href: "/app/mining",
    label: "Sala de minería",
    detail: "Miners, energía y pool diario",
    icon: "/fauzet/ic-mining.png",
  },
  {
    href: "/app/store",
    label: "Tienda de boosts",
    detail: "Mejoras con precios versionados",
    icon: "/fauzet/ic-boost.png",
  },
  {
    href: "/app/crew",
    label: "Mining Crew",
    detail: "Tu red y comisiones atribuidas",
    icon: "/fauzet/ic-crew.png",
  },
  {
    href: "/app/convert",
    label: "Conversión sandbox",
    detail: "Ensayos sin dinero ni cripto real",
    icon: "/fauzet/ic-convert.png",
  },
  {
    href: "/app/swap",
    label: "Swap",
    detail: "Módulo preparado, aún sin custodia",
    icon: "/fauzet/coin-zyxe.png",
  },
  {
    href: "/app/settings",
    label: "Ajustes",
    detail: "Perfil, seguridad y preferencias",
    icon: "/fauzet/ic-vault.png",
  },
] as const;

export function AuthPortal() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [user, setUser] = useState<User | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [modules, setModules] = useState<DashboardModules | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [balanceError, setBalanceError] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const authFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("ref");
    const stored = window.localStorage.getItem("fz_referral_code");
    const candidate = (fromUrl ?? stored ?? "").trim().toUpperCase();
    const requestedMode = params.get("mode");
    const timeout = window.setTimeout(() => {
      if (requestedMode === "register") setMode("register");
      if (/^FZ-[A-Z2-9]{8,16}$/.test(candidate)) {
        window.localStorage.setItem("fz_referral_code", candidate);
        setReferralCode(candidate);
        setMode("register");
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

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
            apiErrorMessage(result) ?? "No fue posible restaurar tu sesión",
          );
        }

        setUser(result.user);
        window.localStorage.removeItem("fz_referral_code");
        setReferralCode("");

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

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();

    async function loadModules() {
      const nextModules = await fetchDashboardModules(controller.signal);
      if (!controller.signal.aborted) {
        setModules(nextModules);
        setModulesLoading(false);
      }
    }

    void loadModules();
    return () => controller.abort();
  }, [user]);

  function selectMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setError("");
    const url = new URL(window.location.href);
    if (nextMode === "register") url.searchParams.set("mode", "register");
    else url.searchParams.delete("mode");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  async function acceptAuthenticatedUser(
    result: ApiError & { user?: User },
    requestEmailVerification: boolean,
  ) {
    if (!result.user) throw new Error("No fue posible autenticarte");
    setModules(null);
    setModulesLoading(true);
    setUser(result.user);
    window.history.replaceState(null, "", "/app");
    window.dispatchEvent(new Event("fauzet:session"));
    setBalances([]);
    window.localStorage.removeItem("fz_referral_code");
    setReferralCode("");

    if (requestEmailVerification) {
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
  }

  async function authenticateWithGoogle() {
    if (googleLoading || !googleAuthConfigured) return;
    setError("");
    setBalanceError("");

    let registration:
      | {
          displayName: string;
          countryCode: string;
          locale: "es";
          acceptedTerms: true;
          isAdult: true;
          termsVersion: "beta-2026-07-13";
          privacyVersion: "beta-2026-07-13";
          referralCode?: string;
        }
      | undefined;
    if (mode === "register") {
      const formElement = authFormRef.current;
      if (!formElement) return;
      const form = new FormData(formElement);
      const displayName = String(form.get("displayName") ?? "").trim();
      const countryCode = String(form.get("countryCode") ?? "")
        .trim()
        .toUpperCase();
      if (displayName.length < 2 || !/^[A-Z]{2}$/.test(countryCode)) {
        setError("Completa tu nombre y el código de país antes de continuar.");
        return;
      }
      if (form.get("acceptedTerms") !== "on" || form.get("isAdult") !== "on") {
        setError(
          "Debes aceptar las condiciones y confirmar la edad requerida.",
        );
        return;
      }
      const referral = String(form.get("referralCode") ?? "").trim();
      registration = {
        displayName,
        countryCode,
        locale: "es",
        acceptedTerms: true,
        isAdult: true,
        termsVersion: "beta-2026-07-13",
        privacyVersion: "beta-2026-07-13",
        ...(referral ? { referralCode: referral } : {}),
      };
    }

    setGoogleLoading(true);
    try {
      const idToken = await signInWithGooglePopup();
      const response = await fetch(`${API_BASE}/auth/google`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-device-id": getDeviceId(),
        },
        body: JSON.stringify({
          idToken,
          ...(registration ? { registration } : {}),
        }),
      });
      const result = (await response.json()) as ApiError & { user?: User };
      if (!response.ok || !result.user) {
        if (apiErrorCode(result) === "GOOGLE_REGISTRATION_REQUIRED") {
          selectMode("register");
          setError(
            "Completa los datos y consentimientos de registro; después pulsa Google nuevamente.",
          );
          return;
        }
        throw new Error(
          apiErrorMessage(result) ?? "No fue posible autenticarte con Google",
        );
      }
      await acceptAuthenticatedUser(result, false);
    } catch (caught) {
      setError(googleErrorMessage(caught));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBalanceError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (
      mode === "register" &&
      password !== String(form.get("confirmPassword") ?? "")
    ) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const body =
      mode === "login"
        ? { email: form.get("email"), password }
        : {
            email: form.get("email"),
            password,
            displayName: form.get("displayName"),
            countryCode: String(form.get("countryCode") ?? "").toUpperCase(),
            locale: "es",
            acceptedTerms: form.get("acceptedTerms") === "on",
            isAdult: form.get("isAdult") === "on",
            termsVersion: "beta-2026-07-13",
            privacyVersion: "beta-2026-07-13",
            referralCode: form.get("referralCode") || undefined,
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
      if (!response.ok || !result.user) {
        throw new Error(
          apiErrorMessage(result) ?? "No fue posible autenticarte",
        );
      }

      await acceptAuthenticatedUser(result, mode === "register");
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
      await signOutGoogle().catch(() => undefined);
      setUser(null);
      window.dispatchEvent(new Event("fauzet:session"));
      setBalances([]);
      setModules(null);
      setModulesLoading(true);
      setBalanceError("");
      setAccountMessage("");
      setMode("login");
      setReferralCode("");
      window.history.replaceState(null, "", "/app");
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

  if (sessionLoading) {
    return <SessionLoading />;
  }

  if (user) {
    return (
      <UserDashboard
        user={user}
        balances={balances}
        modules={modules}
        modulesLoading={modulesLoading}
        balanceError={balanceError}
        balancesLoading={balancesLoading}
        accountMessage={accountMessage}
        verificationLoading={verificationLoading}
        onRetryBalances={retryBalances}
        onRequestVerification={requestVerification}
        onLogout={logout}
      />
    );
  }

  return (
    <main className={styles.authShell}>
      <div className={styles.authAmbient} aria-hidden="true" />
      <Link className={styles.authBrand} href="/" aria-label="Fauzet, inicio">
        <Image
          className={styles.authBrandIcon}
          src="/fauzet/coin-zyxe.png"
          width={256}
          height={256}
          alt=""
          priority
        />
        <span>
          Fau<strong>zet</strong>
        </span>
      </Link>

      <section
        className={`${styles.authCard} ${
          mode === "register" ? styles.registerCard : ""
        }`}
      >
        <div className={styles.authEyebrow}>Tu centro de recompensas</div>
        <h1 className={styles.authTitle}>
          {mode === "login" ? "Bienvenido de vuelta" : "Empieza a ganar"}
        </h1>
        <p className={styles.authCopy}>
          {mode === "login"
            ? "Entra a tu cuenta y continúa justo donde la dejaste."
            : "Crea tu cuenta gratuita. Cada recompensa queda registrada y es trazable."}
        </p>

        <div className={styles.authTabs} aria-label="Tipo de acceso">
          <button
            className={mode === "login" ? styles.activeTab : ""}
            type="button"
            aria-pressed={mode === "login"}
            onClick={() => selectMode("login")}
          >
            Ingresar
          </button>
          <button
            className={mode === "register" ? styles.activeTab : ""}
            type="button"
            aria-pressed={mode === "register"}
            onClick={() => selectMode("register")}
          >
            Crear cuenta
          </button>
        </div>

        <button
          className={styles.googleButton}
          type="button"
          disabled={!googleAuthConfigured || googleLoading}
          aria-describedby="google-status"
          onClick={() => void authenticateWithGoogle()}
        >
          <GoogleMark />
          {googleLoading ? "Conectando…" : "Continuar con Google"}
          <small id="google-status">
            {googleAuthConfigured
              ? mode === "register"
                ? "Completa abajo tus datos y consentimientos"
                : "Acceso seguro"
              : "Configuración pendiente"}
          </small>
        </button>

        <div className={styles.authDivider}>
          <span>o continúa con email</span>
        </div>

        <form ref={authFormRef} className={styles.authForm} onSubmit={submit}>
          {mode === "register" && (
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Nombre de usuario</span>
                <input
                  name="displayName"
                  required
                  minLength={2}
                  autoComplete="name"
                  placeholder="Tu nombre en Fauzet"
                />
              </label>
              <label className={styles.field}>
                <span>País</span>
                <input
                  className={styles.countryInput}
                  name="countryCode"
                  required
                  minLength={2}
                  maxLength={2}
                  pattern="[A-Za-z]{2}"
                  defaultValue="CO"
                  autoComplete="country"
                  aria-describedby="country-help"
                />
                <small id="country-help">Código ISO: CO, US, MX…</small>
              </label>
            </div>
          )}

          <label className={styles.field}>
            <span>Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="tu@email.com"
            />
          </label>

          {mode === "register" ? (
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Contraseña (registro con email)</span>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  placeholder="Mínimo 12 caracteres"
                />
              </label>
              <label className={styles.field}>
                <span>Confirmar contraseña (registro con email)</span>
                <input
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  placeholder="Repítela"
                />
              </label>
            </div>
          ) : (
            <label className={styles.field}>
              <span>Contraseña</span>
              <input
                name="password"
                type="password"
                required
                minLength={12}
                autoComplete="current-password"
                placeholder="Tu contraseña"
              />
            </label>
          )}

          {mode === "register" && (
            <>
              <label className={styles.field}>
                <span>
                  Código de referido <small>(opcional)</small>
                </span>
                <input
                  name="referralCode"
                  value={referralCode}
                  onChange={(event) =>
                    setReferralCode(event.target.value.toUpperCase())
                  }
                  pattern="FZ-[A-Z2-9]{8,16}"
                  autoComplete="off"
                  placeholder="FZ-XXXXXXXX"
                />
              </label>
              <div className={styles.checks}>
                <label>
                  <input name="isAdult" type="checkbox" required />
                  <span>Declaro que cumplo la edad requerida en mi país.</span>
                </label>
                <label>
                  <input name="acceptedTerms" type="checkbox" required />
                  <span>
                    Acepto las{" "}
                    <Link href="/terms" target="_blank">
                      condiciones y reglas de recompensas
                    </Link>{" "}
                    y el{" "}
                    <Link href="/privacy" target="_blank">
                      aviso de privacidad
                    </Link>
                    .
                  </span>
                </label>
              </div>
            </>
          )}

          {error && (
            <div className={styles.formError} role="alert">
              {error}
            </div>
          )}

          <button className={styles.submitButton} disabled={loading}>
            {loading
              ? "Procesando…"
              : mode === "login"
                ? "Entrar a Fauzet"
                : "Crear mi cuenta"}
            {!loading && <span aria-hidden="true">→</span>}
          </button>

          {mode === "login" && (
            <Link className={styles.forgotLink} href="/app/forgot">
              ¿Olvidaste tu contraseña?
            </Link>
          )}
        </form>

        <p className={styles.authLegal}>
          ZYXE es una unidad interna de utilidad. No es una inversión ni tiene
          precio público garantizado.
        </p>
      </section>
    </main>
  );
}

function SessionLoading() {
  return (
    <main className={styles.authShell} aria-busy="true">
      <div className={styles.authAmbient} aria-hidden="true" />
      <Link className={styles.authBrand} href="/">
        <Image
          className={styles.authBrandIcon}
          src="/fauzet/coin-zyxe.png"
          width={256}
          height={256}
          alt=""
          priority
        />
        <span>
          Fau<strong>zet</strong>
        </span>
      </Link>
      <section className={`${styles.authCard} ${styles.loadingCard}`}>
        <div className={styles.loadingOrb} aria-hidden="true" />
        <div className={styles.authEyebrow}>Acceso seguro</div>
        <h1 className={styles.authTitle}>Cargando tu sesión…</h1>
        <p className={styles.authCopy}>
          Estamos recuperando tu cuenta y tus balances reales.
        </p>
      </section>
    </main>
  );
}

type UserDashboardProps = {
  user: User;
  balances: Balance[];
  modules: DashboardModules | null;
  modulesLoading: boolean;
  balanceError: string;
  balancesLoading: boolean;
  accountMessage: string;
  verificationLoading: boolean;
  onRetryBalances: () => void;
  onRequestVerification: () => void;
  onLogout: () => void;
};

function UserDashboard({
  user,
  balances,
  modules,
  modulesLoading,
  balanceError,
  balancesLoading,
  accountMessage,
  verificationLoading,
  onRetryBalances,
  onRequestVerification,
  onLogout,
}: UserDashboardProps) {
  const available = balances.find((balance) => balance.bucket === "AVAILABLE");
  const faucet = modules?.faucet ?? null;
  const games = modules?.games ?? null;
  const missions = modules?.missions ?? null;
  const mining = modules?.mining ?? null;
  const crew = modules?.crew ?? null;
  const activity = modules?.activity ?? null;
  const account = accountStatusCopy(user.status);
  const accountStatusClass =
    account.tone === "active"
      ? styles.accountActive
      : account.tone === "pending"
        ? styles.accountPending
        : styles.accountRestricted;
  const accountNoticeClass =
    account.tone === "active"
      ? styles.noticeActive
      : account.tone === "pending"
        ? styles.noticePending
        : styles.noticeRestricted;
  const miningHash = mining?.miners.reduce(
    (total, miner) =>
      miner.status === "ACTIVE" ? total + miner.effectiveHashRate : total,
    0,
  );
  const claimableMissions =
    missions?.missions.filter((mission) => mission.status === "CLAIMABLE")
      .length ?? null;
  const visibleMissions =
    missions?.missions
      .filter(
        (mission) =>
          mission.status === "CLAIMABLE" || mission.status === "IN_PROGRESS",
      )
      .slice(0, 3) ?? [];

  return (
    <main className={styles.dashboardShell}>
      <section className={styles.dashboard}>
        <header className={styles.dashboardHeader}>
          <div>
            <div className={styles.dashboardEyebrow}>Panel de recompensas</div>
            <h1>
              Hola, <span>{user.displayName ?? user.email.split("@")[0]}</span>
            </h1>
            <p>
              Este panel muestra únicamente actividad confirmada por Fauzet.
            </p>
          </div>
          <div className={`${styles.accountStatus} ${accountStatusClass}`}>
            <span aria-hidden="true" />
            {account.label}
          </div>
        </header>

        <section className={styles.heroGrid} aria-label="Resumen de la cuenta">
          <article className={`${styles.panel} ${styles.walletCard}`}>
            <div className={styles.walletTopline}>
              <span>Saldo disponible</span>
              <Image
                src="/fauzet/coin-zyxe.png"
                width={46}
                height={46}
                alt="Moneda ZYXE"
              />
            </div>
            <div className={styles.walletAmount}>
              {formatMinorUnits(available?.minorUnits)} <small>ZYXE</small>
            </div>
            <p>Sin valoración fiat: ZYXE sigue siendo una unidad interna.</p>
            <div className={styles.walletLinks}>
              <Link href="/app/faucet">Ganar ZYXE</Link>
              <Link href="/app/convert">Conversión sandbox</Link>
            </div>
          </article>

          <article className={`${styles.panel} ${styles.faucetCard}`}>
            <div className={styles.cardHeading}>
              <div>
                <span>Faucet</span>
                <strong>
                  {modulesLoading
                    ? "Consultando…"
                    : faucet
                      ? faucet.canClaim
                        ? "¡Listo para reclamar!"
                        : faucetStateLabel(faucet)
                      : "No disponible"}
                </strong>
              </div>
              <Image
                src="/fauzet/ic-faucet.png"
                width={50}
                height={50}
                alt=""
              />
            </div>
            {faucet ? (
              <p>
                {faucet.canClaim
                  ? `${faucet.reward.minMinorUnits}–${faucet.reward.maxMinorUnits} ${faucet.reward.asset}`
                  : faucet.nextClaimAt
                    ? `Próximo intento: ${formatDateTime(faucet.nextClaimAt)}`
                    : `Estado: ${faucet.state}`}
              </p>
            ) : (
              <p>
                {modulesLoading
                  ? "Leyendo las reglas vigentes."
                  : "Abre el módulo para volver a consultar."}
              </p>
            )}
            <Link className={styles.primaryCardAction} href="/app/faucet">
              {faucet?.canClaim ? "Reclamar ZYXE" : "Abrir faucet"}
              <span aria-hidden="true">→</span>
            </Link>
          </article>

          <article className={`${styles.panel} ${styles.miningCard}`}>
            <div className={styles.cardHeading}>
              <div>
                <span>Minería virtual</span>
                <strong>
                  {modulesLoading
                    ? "Consultando…"
                    : mining
                      ? `${formatMetric(miningHash ?? 0)} GH/s`
                      : "No disponible"}
                </strong>
              </div>
              <Image
                src="/fauzet/ic-mining.png"
                width={50}
                height={50}
                alt=""
              />
            </div>
            <p>
              {mining
                ? `${mining.profile.activeMiners} de ${mining.profile.maxSlots} miners activos`
                : modulesLoading
                  ? "Leyendo miners y energía."
                  : "No se pudo obtener el estado del pool."}
            </p>
            <Link className={styles.secondaryCardAction} href="/app/mining">
              Ir a la sala <span aria-hidden="true">→</span>
            </Link>
          </article>
        </section>

        <section className={styles.statGrid} aria-label="Estado diario">
          <StatCard
            label="Claims de hoy"
            value={
              faucet
                ? `${faucet.claimsToday}/${faucet.dailyClaimLimit}`
                : modulesLoading
                  ? "…"
                  : "No disponible"
            }
            detail={
              faucet ? `Racha: ${faucet.streakDays} días` : "Datos del faucet"
            }
            tone="cyan"
          />
          <StatCard
            label="Energía de juegos"
            value={
              games
                ? `${games.energy.current}/${games.energy.max}`
                : modulesLoading
                  ? "…"
                  : "No disponible"
            }
            detail={
              games
                ? `${games.games.filter((game) => game.state === "AVAILABLE").length} juegos disponibles`
                : "Datos del servidor"
            }
            tone="violet"
          />
          <StatCard
            label="Misiones reclamables"
            value={
              claimableMissions !== null
                ? String(claimableMissions)
                : modulesLoading
                  ? "…"
                  : "No disponible"
            }
            detail={
              missions
                ? `${missions.missions.length} misiones publicadas`
                : "Progreso real"
            }
            tone="green"
          />
          <StatCard
            label="Mining Crew"
            value={
              crew
                ? String(crew.tree.activeMembers)
                : modulesLoading
                  ? "…"
                  : "No disponible"
            }
            detail={
              crew
                ? `${crew.tree.totalMembers} miembros atribuidos`
                : "Miembros activos"
            }
            tone="amber"
          />
        </section>

        {balanceError && (
          <div className={styles.errorNotice} role="alert">
            <span>{balanceError}</span>
            <button
              type="button"
              disabled={balancesLoading}
              onClick={onRetryBalances}
            >
              {balancesLoading ? "Reintentando…" : "Reintentar"}
            </button>
          </div>
        )}

        <section className={styles.dashboardColumns}>
          <article className={`${styles.panel} ${styles.actionsPanel}`}>
            <div className={styles.sectionHeading}>
              <div>
                <span>Explorar</span>
                <h2>¿Qué quieres hacer?</h2>
              </div>
            </div>
            <nav className={styles.actionGrid} aria-label="Acciones rápidas">
              {dashboardActions.map((action) => (
                <Link href={action.href} key={action.href}>
                  <span className={styles.actionIcon}>
                    <Image src={action.icon} width={42} height={42} alt="" />
                  </span>
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.detail}</small>
                  </span>
                  <b aria-hidden="true">›</b>
                </Link>
              ))}
            </nav>
          </article>

          <aside className={styles.sideColumn}>
            <article className={`${styles.panel} ${styles.missionsPanel}`}>
              <div className={styles.sectionHeading}>
                <div>
                  <span>Progreso real</span>
                  <h2>Misiones activas</h2>
                </div>
                <Link href="/app/missions">Ver todas</Link>
              </div>
              {modulesLoading ? (
                <p className={styles.emptyState}>Cargando misiones…</p>
              ) : visibleMissions.length > 0 ? (
                <div className={styles.missionList}>
                  {visibleMissions.map((mission) => {
                    const percent = Math.min(
                      100,
                      Math.round(
                        (mission.progress / Math.max(mission.target, 1)) * 100,
                      ),
                    );
                    return (
                      <Link
                        href="/app/missions"
                        key={`${mission.id}-${mission.periodKey}`}
                      >
                        <div>
                          <strong>{mission.title}</strong>
                          <small>
                            {mission.progress}/{mission.target} ·{" "}
                            {mission.reward.minorUnits} {mission.reward.asset}
                          </small>
                        </div>
                        <progress
                          value={percent}
                          max={100}
                          aria-label={`${percent}%`}
                        />
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.emptyState}>
                  {missions
                    ? "No tienes misiones activas en este momento."
                    : "No fue posible consultar las misiones."}
                </p>
              )}
            </article>

            <article className={`${styles.panel} ${styles.activityPanel}`}>
              <div className={styles.sectionHeading}>
                <div>
                  <span>Trazabilidad</span>
                  <h2>Actividad reciente</h2>
                </div>
                <Link href="/app/wallet">Ver wallet</Link>
              </div>
              {modulesLoading ? (
                <p className={styles.emptyState}>Cargando movimientos…</p>
              ) : activity && activity.length > 0 ? (
                <div className={styles.activityList}>
                  {activity.map((transaction) => (
                    <Link href="/app/wallet" key={transaction.id}>
                      <span>
                        <strong>{activityLabel(transaction.type)}</strong>
                        <small>{formatDateTime(transaction.createdAt)}</small>
                      </span>
                      <span>
                        {transaction.movements.map((movement, index) => (
                          <small
                            className={
                              movement.minorUnits.startsWith("-")
                                ? styles.activityDebit
                                : styles.activityCredit
                            }
                            key={`${transaction.id}-${movement.bucket}-${index}`}
                          >
                            {signedMinorUnits(movement.minorUnits)}{" "}
                            {movement.asset}
                          </small>
                        ))}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={styles.emptyState}>
                  {activity
                    ? "Aún no hay movimientos en tu ledger personal."
                    : "No fue posible consultar la actividad reciente."}
                </p>
              )}
            </article>
          </aside>
        </section>

        <section className={`${styles.panel} ${styles.balancesPanel}`}>
          <div className={styles.sectionHeading}>
            <div>
              <span>Ledger interno</span>
              <h2>Distribución de balances</h2>
            </div>
            <small>Saldos reportados por el backend</small>
          </div>
          {balances.length > 0 ? (
            <div className={styles.balanceGrid}>
              {balances.map((balance) => (
                <div className={styles.balanceItem} key={balance.bucket}>
                  <span>{bucketLabel(balance.bucket)}</span>
                  <strong>{formatMinorUnits(balance.minorUnits)} ZYXE</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyState}>No hay balances disponibles.</p>
          )}
        </section>

        <section className={`${styles.accountNotice} ${accountNoticeClass}`}>
          <div>
            <strong>{account.title}</strong>
            <p>{account.detail}</p>
            {accountMessage && <small role="status">{accountMessage}</small>}
          </div>
          {user.status === "PENDING_VERIFICATION" ? (
            <button
              type="button"
              disabled={verificationLoading}
              onClick={onRequestVerification}
            >
              {verificationLoading ? "Enviando…" : "Reenviar verificación"}
            </button>
          ) : (
            <Link href="/app/settings">{account.action}</Link>
          )}
        </section>

        <footer className={styles.dashboardFooter}>
          <p>
            Las recompensas son variables y pueden estar sujetas a validación,
            límites y controles antifraude.
          </p>
          <button type="button" onClick={onLogout}>
            Cerrar sesión
          </button>
        </footer>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "cyan" | "violet" | "green" | "amber";
}) {
  return (
    <article className={`${styles.statCard} ${styles[tone]}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="#4285f4"
        d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.7h5.5a4.7 4.7 0 0 1-2 3.1v2.5h3.2c1.9-1.8 3.1-4.3 3.1-7.3Z"
      />
      <path
        fill="#34a853"
        d="M12 22c2.7 0 5-.9 6.7-2.5L15.5 17c-.9.6-2 .9-3.5.9a5.9 5.9 0 0 1-5.5-4.1H3.2v2.6A10.1 10.1 0 0 0 12 22Z"
      />
      <path
        fill="#fbbc05"
        d="M6.5 13.8a6.2 6.2 0 0 1 0-3.6V7.6H3.2a10.1 10.1 0 0 0 0 8.8l3.3-2.6Z"
      />
      <path
        fill="#ea4335"
        d="M12 6.1c1.6 0 3 .5 4.1 1.6l3.1-3.1A10.1 10.1 0 0 0 3.2 7.6l3.3 2.6A5.9 5.9 0 0 1 12 6.1Z"
      />
    </svg>
  );
}

async function fetchDashboardModules(
  signal: AbortSignal,
): Promise<DashboardModules> {
  const [faucet, games, missions, mining, crew, activity] =
    await Promise.allSettled([
      fetchFaucetStatus(signal),
      fetchGameCatalog(signal),
      fetchMissions(signal),
      fetchMiningStatus(signal),
      fetchReferralCrew(signal),
      fetchAccountActivity(signal),
    ]);

  return {
    faucet: settledValue(faucet),
    games: settledValue(games),
    missions: settledValue(missions),
    mining: settledValue(mining),
    crew: settledValue(crew),
    activity: settledValue(activity),
  };
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

async function fetchFaucetStatus(signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}/faucet/status`, {
    credentials: "include",
    cache: "no-store",
    headers: { "x-device-id": getDeviceId() },
    signal: signal ?? null,
  });
  const payload = (await readJson(response)) as
    | (ApiError & {
        faucet?: FaucetStatus;
      })
    | null;
  if (!response.ok || !payload?.faucet) {
    throw new Error(
      apiErrorMessage(payload) ?? "No fue posible consultar el faucet",
    );
  }
  return payload.faucet;
}

async function fetchBalances(signal?: AbortSignal): Promise<Balance[]> {
  const response = await fetch(`${API_BASE}/balances`, {
    credentials: "include",
    signal: signal ?? null,
  });
  const result = (await readJson(response)) as
    | (ApiError & {
        balances?: Balance[];
      })
    | null;

  if (!response.ok || !Array.isArray(result?.balances)) {
    throw new Error(
      apiErrorMessage(result) ?? "No fue posible cargar tus balances",
    );
  }

  return result.balances;
}

async function fetchAccountActivity(
  signal?: AbortSignal,
): Promise<AccountActivityResponse["items"]> {
  const response = await fetch(`${API_BASE}/account/activity?limit=3`, {
    credentials: "include",
    cache: "no-store",
    signal: signal ?? null,
  });
  const result = (await readJson(response)) as AccountActivityResponse | null;
  if (!response.ok || !result || !Array.isArray(result.items)) {
    throw new Error("No fue posible consultar tu actividad reciente");
  }
  return result.items;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiErrorMessage(payload: ApiError | null) {
  if (typeof payload?.error === "string") return payload.error;
  return payload?.error?.message ?? payload?.message ?? null;
}

function apiErrorCode(payload: ApiError | null) {
  return typeof payload?.error === "object" ? payload.error.code : undefined;
}

function googleErrorMessage(caught: unknown) {
  const code =
    typeof caught === "object" &&
    caught !== null &&
    "code" in caught &&
    typeof caught.code === "string"
      ? caught.code
      : "";
  if (code === "auth/popup-closed-by-user") {
    return "Cerraste la ventana de Google antes de terminar.";
  }
  if (code === "auth/popup-blocked") {
    return "El navegador bloqueó la ventana de Google. Permite ventanas emergentes e inténtalo de nuevo.";
  }
  if (code === "auth/unauthorized-domain") {
    return "Este dominio todavía no está autorizado en Firebase.";
  }
  return caught instanceof Error
    ? caught.message
    : "No fue posible autenticarte con Google.";
}

function balanceErrorMessage(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "No fue posible cargar tus balances";
}

function faucetStateLabel(status: FaucetStatus) {
  if (status.state === "COOLDOWN") return "En enfriamiento";
  if (status.state === "DAILY_LIMIT") return "Límite diario alcanzado";
  if (status.state === "CAPTCHA_REQUIRED") return "Verificación requerida";
  if (status.state === "BUDGET_EXHAUSTED") return "Presupuesto agotado";
  if (status.state === "RISK_BLOCKED") return "Revisión de seguridad";
  return "Temporalmente no disponible";
}

function formatMinorUnits(value?: string) {
  if (!value || !/^\d+$/.test(value)) return "—";
  try {
    return new Intl.NumberFormat("es-CO").format(BigInt(value));
  } catch {
    return value;
  }
}

function formatMetric(value: number) {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "fecha por confirmar";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
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

function accountStatusCopy(status: string) {
  if (status === "ACTIVE") {
    return {
      tone: "active" as const,
      label: "Cuenta verificada",
      title: "Cuenta y correo verificados",
      detail:
        "Las funciones se habilitan según reglas, disponibilidad y controles de riesgo.",
      action: "Revisar seguridad",
    };
  }
  if (status === "PENDING_VERIFICATION") {
    return {
      tone: "pending" as const,
      label: "Verificación pendiente",
      title: "Completa la verificación de tu correo",
      detail: "La verificación es necesaria antes de activar las recompensas.",
      action: "Revisar verificación",
    };
  }
  if (status === "RESTRICTED") {
    return {
      tone: "restricted" as const,
      label: "Cuenta restringida",
      title: "Tu cuenta tiene funciones restringidas",
      detail:
        "Consulta Ajustes y los avisos de la cuenta. No intentes eludir los controles mientras revisamos el estado.",
      action: "Revisar cuenta",
    };
  }
  return {
    tone: "restricted" as const,
    label: "Cuenta no disponible",
    title: "Tu cuenta requiere revisión",
    detail:
      "Las recompensas permanecen deshabilitadas. Revisa el estado de seguridad y soporte.",
    action: "Revisar cuenta",
  };
}

function activityLabel(type: string) {
  const labels: Record<string, string> = {
    WELCOME_BONUS: "Bono de bienvenida",
    FAUCET_CLAIM: "Reclamo de Faucet",
    GAME_REWARD: "Recompensa de juego",
    MISSION_REWARD: "Recompensa de misión",
    STORE_PURCHASE: "Compra en tienda",
    MINING_SETTLEMENT: "Liquidación de minería",
    REFERRAL_COMMISSION: "Comisión de Mining Crew",
    REVERSAL: "Reverso",
  };
  return labels[type.toUpperCase()] ?? type.replaceAll("_", " ");
}

function signedMinorUnits(value: string) {
  if (!/^-?\d+$/.test(value)) return value;
  try {
    const amount = BigInt(value);
    const absolute = amount < 0n ? -amount : amount;
    const formatted = new Intl.NumberFormat("es-CO").format(absolute);
    return amount < 0n ? `-${formatted}` : `+${formatted}`;
  } catch {
    return value;
  }
}
