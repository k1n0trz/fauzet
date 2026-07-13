"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../lib/api";
import styles from "./app-chrome.module.css";

const authOnlyRoutes = ["/app/forgot", "/app/reset", "/app/verify"];

const destinations = [
  { href: "/app", label: "Panel", icon: "home", exact: true },
  { href: "/app/faucet", label: "Faucet", icon: "faucet" },
  { href: "/app/games", label: "Centro de juegos", icon: "games" },
  { href: "/app/missions", label: "Centro de misiones", icon: "missions" },
  { href: "/app/mining", label: "Sala de minería", icon: "mining" },
  { href: "/app/store", label: "Tienda de boosts", icon: "store" },
  { href: "/app/wallet", label: "Wallet ZYXE", icon: "wallet" },
  { href: "/app/crew", label: "Mining Crew", icon: "crew" },
  {
    href: "/app/convert",
    label: "Conversión sandbox",
    icon: "convert",
  },
  { href: "/app/swap", label: "Swap", icon: "swap" },
  { href: "/app/settings", label: "Ajustes", icon: "settings" },
] as const;

const assetIcons: Record<string, string> = {
  faucet: "/fauzet/ic-faucet.png",
  games: "/fauzet/ic-games.png",
  missions: "/fauzet/ic-missions.png",
  mining: "/fauzet/ic-mining.png",
  store: "/fauzet/ic-boost.png",
  wallet: "/fauzet/coin-zyxe.png",
  crew: "/fauzet/ic-crew.png",
  convert: "/fauzet/ic-convert.png",
};

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const isAuthOnly = authOnlyRoutes.some((route) =>
    isRouteOrDescendant(pathname, route),
  );

  const refreshSession = useCallback(async () => {
    if (isAuthOnly) {
      setAuthenticated(false);
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/me`, {
        credentials: "include",
        cache: "no-store",
      });
      setAuthenticated(response.ok);
    } catch {
      setAuthenticated(false);
    }
  }, [isAuthOnly]);

  useEffect(() => {
    const storedTheme = localStorage.getItem("fz_theme") ?? "SYSTEM";
    const normalizedTheme = storedTheme.toLowerCase();
    document.documentElement.dataset.theme = [
      "dark",
      "light",
      "system",
    ].includes(normalizedTheme)
      ? normalizedTheme
      : "system";

    const timeout = window.setTimeout(() => void refreshSession(), 0);
    window.addEventListener("fauzet:session", refreshSession);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("fauzet:session", refreshSession);
    };
  }, [refreshSession]);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("logout_failed");
      }
      setAuthenticated(false);
      router.push("/app");
      router.refresh();
      window.dispatchEvent(new Event("fauzet:session"));
    } catch {
      setLogoutError(
        "No pudimos revocar tu sesión. Sigues conectado; inténtalo de nuevo.",
      );
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div
      className={`${styles.chrome} ${authenticated ? styles.withRail : ""}`}
      lang="es"
    >
      {authenticated ? (
        <aside className={styles.rail} aria-label="Navegación de Fauzet">
          <Link
            className={styles.brand}
            href="/"
            aria-label="Fauzet, ir al inicio"
          >
            <Image
              className={styles.brandImage}
              src="/fauzet/logo-white.png"
              alt=""
              width={58}
              height={52}
              priority
            />
            <span className={styles.tooltip} aria-hidden="true">
              Inicio de Fauzet
            </span>
          </Link>

          <nav className={styles.navigation} aria-label="Menú principal">
            {destinations.map((item) => {
              const active =
                "exact" in item && item.exact
                  ? pathname === item.href
                  : isRouteOrDescendant(pathname, item.href);

              return (
                <Link
                  className={`${styles.item} ${active ? styles.active : ""}`}
                  href={item.href}
                  key={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                >
                  <RailIcon name={item.icon} />
                  <span className={styles.mobileLabel}>{item.label}</span>
                  <span className={styles.tooltip} aria-hidden="true">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <button
            className={`${styles.item} ${styles.logout}`}
            type="button"
            aria-label={loggingOut ? "Cerrando sesión" : "Cerrar sesión"}
            aria-busy={loggingOut}
            aria-describedby={logoutError ? "rail-logout-error" : undefined}
            disabled={loggingOut}
            onClick={logout}
          >
            <RailIcon name="logout" />
            <span className={styles.mobileLabel}>
              {loggingOut ? "Saliendo" : "Salir"}
            </span>
            <span className={styles.tooltip} aria-hidden="true">
              {loggingOut ? "Cerrando sesión…" : logoutError || "Cerrar sesión"}
            </span>
          </button>
          {logoutError ? (
            <span className={styles.srOnly} id="rail-logout-error" role="alert">
              {logoutError}
            </span>
          ) : null}
        </aside>
      ) : null}
      <div className={styles.content}>{children}</div>
    </div>
  );
}

function RailIcon({ name }: { name: string }) {
  const asset = assetIcons[name];
  if (asset) {
    return (
      <Image
        className={styles.assetIcon}
        src={asset}
        alt=""
        width={40}
        height={40}
        sizes="40px"
      />
    );
  }

  const paths: Record<string, React.ReactNode> = {
    home: (
      <>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10.5V21h13V10.5M9 21v-6h6v6" />
      </>
    ),
    swap: (
      <>
        <path d="M7 7h11l-3-3M17 17H6l3 3" />
        <path d="m18 4 3 3-3 3M6 14l-3 3 3 3" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    logout: (
      <>
        <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
      </>
    ),
  };

  return (
    <svg
      className={styles.vectorIcon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function isRouteOrDescendant(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}
