"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type {
  AdminAuditResponse,
  AdminLedgerResponse,
  AdminOverviewResponse,
  AdminRiskResponse,
  AdminSessionResponse,
  AdminUsersResponse,
  AdminWithdrawalsResponse,
} from "@fauzet/contracts";
import {
  adminLogin,
  adminLogout,
  adminSession,
  getAdminAudit,
  getAdminLedger,
  getAdminOverview,
  getAdminRisk,
  getAdminUsers,
  getAdminWithdrawals,
  decideAdminWithdrawal,
  updateAdminRisk,
  updateAdminUserStatus,
} from "../../lib/admin-api";
import styles from "./admin-portal.module.css";

type View =
  | "overview"
  | "users"
  | "economy"
  | "faucetadm"
  | "gamesadm"
  | "miningadm"
  | "referraladm"
  | "vaultadm"
  | "tradingadm"
  | "withdrawals"
  | "treasury"
  | "ledger"
  | "risk"
  | "owner"
  | "config"
  | "roles";

type NavItem = {
  id: View;
  icon: string;
  label: string;
  title: string;
  visible: boolean;
  gated?: boolean;
  badge?: string;
};

type NavGroup = { label: string; items: NavItem[] };
type MutableUserStatus = "ACTIVE" | "RESTRICTED" | "SUSPENDED";

type GatedModuleDefinition = {
  icon: string;
  eyebrow: string;
  title: string;
  description: string;
  requirements: string[];
};

const GATED_MODULES: Partial<Record<View, GatedModuleDefinition>> = {
  economy: {
    icon: "⚖️",
    eyebrow: "Configuración versionada",
    title: "Economía ZYXE",
    description:
      "La configuración económica ya se versiona en el backend, pero todavía no existe un flujo administrativo seguro para editarla o publicarla.",
    requirements: [
      "Lectura y validación de la versión activa",
      "Simulación de impacto antes de publicar",
      "Aprobación separada y auditoría before/after",
    ],
  },
  faucetadm: {
    icon: "💧",
    eyebrow: "Operación server-authoritative",
    title: "Faucet Admin",
    description:
      "El faucet funciona con reglas y presupuesto reales, pero sus agregados y controles administrativos aún no tienen una API dedicada.",
    requirements: [
      "Presupuesto y consumo por periodo",
      "Límites, cooldown y señales de abuso",
      "Cambios mediante configuración versionada",
    ],
  },
  gamesadm: {
    icon: "🎮",
    eyebrow: "Contenido y recompensas",
    title: "Games Admin",
    description:
      "Las sesiones y recompensas se validan en servidor. La gestión de catálogo, campañas y métricas sigue bloqueada hasta exponer contratos administrativos.",
    requirements: [
      "Catálogo y reglas de score versionadas",
      "Métricas de sesiones, holds y rechazos",
      "Presupuestos y kill switch por juego",
    ],
  },
  miningadm: {
    icon: "⛏️",
    eyebrow: "Minería virtual",
    title: "Mining Admin",
    description:
      "Los mineros, epochs y payouts existen en el dominio. Este panel permanecerá de solo espera hasta contar con consultas operativas protegidas.",
    requirements: [
      "Estado de epochs y pool financiado",
      "Payouts, residuos y reconciliación",
      "Configuración con aprobación y rollback",
    ],
  },
  referraladm: {
    icon: "👥",
    eyebrow: "Mining Crew",
    title: "Referral Admin",
    description:
      "El árbol y las comisiones se calculan en backend. Falta la superficie administrativa para agregados, caps, ciclos y clawbacks.",
    requirements: [
      "Exploración del árbol con PII limitada",
      "Alertas de ciclos y farming",
      "Clawback dedicado, idempotente y auditado",
    ],
  },
  vaultadm: {
    icon: "🏦",
    eyebrow: "Feature gate activo",
    title: "Vault Admin",
    description:
      "Vault todavía no está habilitado en el backend de producción. No se muestran saldos, rendimientos ni obligaciones simuladas.",
    requirements: [
      "Modelo de posiciones y obligaciones",
      "Cobertura y vencimientos reconciliados",
      "Revisión económica, legal y de riesgo",
    ],
  },
  tradingadm: {
    icon: "📈",
    eyebrow: "Feature gate activo",
    title: "Trading Admin",
    description:
      "Trading real permanece deshabilitado. La consola no puede activar mercados ni alterar precios desde el cliente.",
    requirements: [
      "Motor de mercado y límites server-side",
      "Prevención de wash trading",
      "Liquidez, precios auditables y kill switch",
    ],
  },
  treasury: {
    icon: "🏛️",
    eyebrow: "Sin conciliación externa",
    title: "Treasury",
    description:
      "El ledger separa cuentas internas ZYXE, pero aún no hay conciliación de MP, Stripe, custodio, bancos o reservas cripto.",
    requirements: [
      "Snapshots por fondo y activo",
      "Conciliación diaria con proveedores",
      "Cobertura, runway y alertas verificables",
    ],
  },
  owner: {
    icon: "🔒",
    eyebrow: "Owner-only · bloqueado",
    title: "Owner Dashboard",
    description:
      "No existe retiro del propietario en la API. La cuenta Owner está excluida del posting genérico y seguirá cerrada hasta superar todos los gates de dinero real.",
    requirements: [
      "MFA real y wallet en lista blanca",
      "Maker-checker, límites y espera de seguridad",
      "Cobertura conciliada antes y después",
    ],
  },
  config: {
    icon: "⚙️",
    eyebrow: "Solo lectura pendiente",
    title: "System Configuration",
    description:
      "El permiso CONFIG_READ existe, pero todavía no hay endpoints web para inspeccionar o administrar feature flags y parámetros.",
    requirements: [
      "Contratos de lectura con secretos redactados",
      "Versionado y validación de esquema",
      "Publicación con aprobación e historial",
    ],
  },
  roles: {
    icon: "🛡️",
    eyebrow: "Sin autoescalado",
    title: "Roles & Permissions",
    description:
      "Los roles se aplican en cada endpoint. Por ahora solo se conceden mediante el bootstrap auditado; no existe mutación web de privilegios.",
    requirements: [
      "Grant/revoke con motivo e idempotencia",
      "Protección de Owner y Superadmin",
      "Aprobación separada y matriz de pruebas RBAC",
    ],
  },
};

export function AdminPortal() {
  const [session, setSession] = useState<AdminSessionResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lockReason, setLockReason] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [users, setUsers] = useState<AdminUsersResponse | null>(null);
  const [ledger, setLedger] = useState<AdminLedgerResponse | null>(null);
  const [audit, setAudit] = useState<AdminAuditResponse | null>(null);
  const [risk, setRisk] = useState<AdminRiskResponse | null>(null);
  const [withdrawals, setWithdrawals] =
    useState<AdminWithdrawalsResponse | null>(null);

  const clearSensitiveState = useCallback((reason = "") => {
    setSession(null);
    setOverview(null);
    setUsers(null);
    setLedger(null);
    setAudit(null);
    setRisk(null);
    setWithdrawals(null);
    setView("overview");
    setSidebarOpen(false);
    setLoading(false);
    setError("");
    setNotice("");
    setLockReason(reason);
  }, []);

  const handleAdminError = useCallback(
    (caught: unknown) => {
      const detail = message(caught);
      if (isAdministrativeSessionFailure(detail)) {
        clearSensitiveState(
          "La sesión administrativa venció o dejó de ser válida. Revalida tu acceso para continuar.",
        );
        return;
      }
      setNotice("");
      setError(detail);
    },
    [clearSensitiveState],
  );

  const loadData = useCallback(
    async (current: AdminSessionResponse) => {
      setLoading(true);
      try {
        const permissions = new Set(current.permissions);
        const [
          nextOverview,
          nextUsers,
          nextLedger,
          nextAudit,
          nextRisk,
          nextWithdrawals,
        ] = await Promise.all([
          getAdminOverview(),
          permissions.has("USERS_READ") ? getAdminUsers() : null,
          permissions.has("LEDGER_READ") ? getAdminLedger() : null,
          permissions.has("AUDIT_READ") ? getAdminAudit() : null,
          permissions.has("RISK_READ") ? getAdminRisk() : null,
          permissions.has("WITHDRAWALS_READ") ? getAdminWithdrawals() : null,
        ]);
        setOverview(nextOverview);
        setUsers(nextUsers);
        setLedger(nextLedger);
        setAudit(nextAudit);
        setRisk(nextRisk);
        setWithdrawals(nextWithdrawals);
        setError("");
      } catch (loadError) {
        handleAdminError(loadError);
      } finally {
        setLoading(false);
      }
    },
    [handleAdminError],
  );

  useEffect(() => {
    let active = true;
    void adminSession()
      .then(async (restored) => {
        if (!active) return;
        setLockReason("");
        setSession(restored);
        await loadData(restored);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [loadData]);

  useEffect(() => {
    if (!session) return;
    const expiresAt = Date.parse(session.expiresAt);
    const lockIfExpired = () => {
      if (Date.now() >= expiresAt)
        clearSensitiveState(
          "La sesión administrativa de diez minutos venció. Revalida tu acceso para continuar.",
        );
    };
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      lockIfExpired();
      return;
    }
    const timer = window.setTimeout(lockIfExpired, remaining);
    document.addEventListener("visibilitychange", lockIfExpired);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", lockIfExpired);
    };
  }, [clearSensitiveState, session]);

  if (checking)
    return (
      <main className={styles.loginShell} lang="es">
        <div className={styles.loginCard}>Validando acceso administrativo…</div>
      </main>
    );
  if (!session)
    return (
      <AdminLogin
        lockReason={lockReason}
        onAuthenticated={async (authenticated) => {
          setLockReason("");
          setSession(authenticated);
          await loadData(authenticated);
        }}
      />
    );

  const permissions = new Set(session.permissions);
  const navigation = buildNavigation(session, {
    withdrawalReviews:
      withdrawals?.items.filter(({ status }) => status === "REVIEW").length ??
      0,
    elevatedSignals:
      risk?.items.filter(({ severity }) =>
        ["HIGH", "CRITICAL"].includes(severity),
      ).length ?? 0,
  });
  const visibleItems = navigation.flatMap(({ items }) => items);
  const activeView = visibleItems.some(({ id }) => id === view)
    ? view
    : "overview";
  const activeItem = visibleItems.find(({ id }) => id === activeView);
  const gatedModule = GATED_MODULES[activeView];

  const changed = async (text: string) => {
    setNotice(text);
    setError("");
    await loadData(session);
  };

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setError("");
    try {
      await adminLogout();
      clearSensitiveState("Sesión administrativa cerrada correctamente.");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <main className={styles.shell} lang="es">
      {sidebarOpen ? (
        <button
          className={styles.backdrop}
          aria-label="Cerrar navegación administrativa"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside
        className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}
      >
        <div className={styles.sidebarBrand}>
          <Link className={styles.brand} href="/" aria-label="Ir a Fauzet">
            <Image
              className={styles.brandLogo}
              src="/fauzet/logo-white.png"
              alt="Fauzet"
              width={34}
              height={31}
              priority
            />
          </Link>
          <span className={styles.adminBadge}>ADMIN</span>
        </div>
        <div className={styles.environment}>Closed beta · internal only</div>
        <nav className={styles.nav} aria-label="Administración">
          {navigation.map((group) => (
            <div className={styles.navGroup} key={group.label}>
              <div className={styles.groupLabel}>{group.label}</div>
              {group.items.map((item) => (
                <button
                  type="button"
                  className={`${styles.navButton} ${
                    activeView === item.id ? styles.navButtonActive : ""
                  }`}
                  key={item.id}
                  onClick={() => {
                    setView(item.id);
                    setSidebarOpen(false);
                    setError("");
                    setNotice("");
                  }}
                >
                  <span className={styles.navIcon} aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className={styles.navLabel}>{item.label}</span>
                  {item.badge ? (
                    <span className={styles.navBadge}>{item.badge}</span>
                  ) : item.gated ? (
                    <span className={styles.navGate}>GATED</span>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className={styles.identity}>
          <span className={styles.avatar} aria-hidden="true">
            {(session.user.displayName ?? session.user.email)
              .slice(0, 1)
              .toUpperCase()}
          </span>
          <div className={styles.identityText}>
            <strong>{session.user.email}</strong>
            <span>{session.roles.join(" · ")}</span>
            <small>Password step-up · {formatDate(session.expiresAt)}</small>
          </div>
          <button
            type="button"
            className={styles.exitButton}
            aria-label={
              loggingOut
                ? "Cerrando sesión administrativa"
                : "Cerrar sesión administrativa"
            }
            aria-busy={loggingOut}
            disabled={loggingOut}
            onClick={() => void logout()}
          >
            {loggingOut ? "…" : "⏻"}
          </button>
        </div>
      </aside>
      <section className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarTitle}>
            <button
              type="button"
              className={styles.menuButton}
              aria-label="Abrir navegación administrativa"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <div>
              <span className={styles.topbarEyebrow}>Control plane</span>
              <h1>{activeItem?.title ?? "Admin"}</h1>
            </div>
          </div>
          <div className={styles.topbarActions}>
            <span className={styles.syncLabel}>
              DATOS REALES · SANDBOX
              {overview ? ` · ${formatDate(overview.serverNow)}` : ""}
            </span>
            <span className={styles.secureStatus}>
              <span className={styles.statusDot} /> RBAC activo
            </span>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => void loadData(session)}
              disabled={loading}
            >
              {loading ? "Actualizando…" : "↻ Actualizar"}
            </button>
          </div>
        </header>
        <div className={styles.content}>
          {error ? (
            <div className={`${styles.alert} ${styles.alertError}`}>
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className={`${styles.alert} ${styles.alertSuccess}`}>
              {notice}
            </div>
          ) : null}
          {gatedModule ? <GatedModule module={gatedModule} /> : null}
          {activeView === "overview" && overview ? (
            <Overview data={overview} />
          ) : null}
          {activeView === "users" && users ? (
            <Users
              data={users}
              canWriteStatus={permissions.has("USERS_STATUS_WRITE")}
              canWriteRisk={permissions.has("RISK_WRITE")}
              onChanged={changed}
              onError={handleAdminError}
            />
          ) : null}
          {activeView === "risk" && risk ? <Risk data={risk} /> : null}
          {activeView === "withdrawals" && withdrawals ? (
            <Withdrawals
              data={withdrawals}
              canDecide={permissions.has("WITHDRAWALS_WRITE")}
              onChanged={changed}
              onError={handleAdminError}
            />
          ) : null}
          {activeView === "ledger" ? (
            <div className={styles.stack}>
              {ledger ? <Ledger data={ledger} /> : null}
              {audit ? <Audit data={audit} /> : null}
            </div>
          ) : null}
          {!gatedModule &&
          !["overview", "users", "risk", "withdrawals", "ledger"].includes(
            activeView,
          ) ? (
            <ModuleUnavailable />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function buildNavigation(
  session: AdminSessionResponse,
  counts: { withdrawalReviews: number; elevatedSignals: number },
): NavGroup[] {
  const permissions = new Set(session.permissions);
  const roles = new Set(session.roles);
  const contentControl =
    roles.has("CONTENT") || roles.has("SUPERADMIN") || roles.has("OWNER");
  const financialControl =
    roles.has("FINANCE") ||
    roles.has("AUDITOR") ||
    roles.has("SUPERADMIN") ||
    roles.has("OWNER");
  const systemControl = roles.has("SUPERADMIN") || roles.has("OWNER");
  const groups: NavGroup[] = [
    {
      label: "PLATFORM",
      items: [
        {
          id: "overview",
          icon: "⬒",
          label: "Overview",
          title: "Platform Overview",
          visible: true,
        },
        {
          id: "users",
          icon: "👤",
          label: "Users",
          title: "User Management",
          visible: permissions.has("USERS_READ"),
        },
        {
          id: "economy",
          icon: "⚖️",
          label: "Economy",
          title: "Economy Controls",
          visible: permissions.has("CONFIG_READ"),
          gated: true,
        },
        {
          id: "faucetadm",
          icon: "💧",
          label: "Faucet",
          title: "Faucet Admin",
          visible: contentControl,
          gated: true,
        },
        {
          id: "gamesadm",
          icon: "🎮",
          label: "Games",
          title: "Games Admin",
          visible: contentControl,
          gated: true,
        },
        {
          id: "miningadm",
          icon: "⛏️",
          label: "Mining",
          title: "Mining Admin",
          visible: contentControl,
          gated: true,
        },
        {
          id: "referraladm",
          icon: "👥",
          label: "Referrals",
          title: "Referral Admin",
          visible: contentControl,
          gated: true,
        },
        {
          id: "vaultadm",
          icon: "🏦",
          label: "Vault",
          title: "Vault Admin",
          visible: financialControl,
          gated: true,
        },
        {
          id: "tradingadm",
          icon: "📈",
          label: "Trading",
          title: "Trading Admin",
          visible: financialControl,
          gated: true,
        },
      ],
    },
    {
      label: "FINANCE",
      items: [
        {
          id: "withdrawals",
          icon: "📤",
          label: "Withdrawals",
          title: "Withdrawal Review Queue",
          visible: permissions.has("WITHDRAWALS_READ"),
          ...(counts.withdrawalReviews > 0
            ? { badge: String(counts.withdrawalReviews) }
            : {}),
        },
        {
          id: "treasury",
          icon: "🏛️",
          label: "Treasury",
          title: "Treasury",
          visible: financialControl,
          gated: true,
        },
        {
          id: "ledger",
          icon: "📒",
          label: "Ledger & Audit",
          title: "Ledger & Audit",
          visible:
            permissions.has("LEDGER_READ") || permissions.has("AUDIT_READ"),
        },
      ],
    },
    {
      label: "RISK",
      items: [
        {
          id: "risk",
          icon: "🚨",
          label: "Fraud & Risk",
          title: "Fraud & Risk",
          visible: permissions.has("RISK_READ"),
          ...(counts.elevatedSignals > 0
            ? { badge: String(counts.elevatedSignals) }
            : {}),
        },
      ],
    },
    {
      label: "OWNER",
      items: [
        {
          id: "owner",
          icon: "🔒",
          label: "Owner Dashboard",
          title: "Owner Dashboard",
          visible: roles.has("OWNER"),
          gated: true,
        },
      ],
    },
    {
      label: "SYSTEM",
      items: [
        {
          id: "config",
          icon: "⚙️",
          label: "Configuration",
          title: "System Configuration",
          visible: permissions.has("CONFIG_READ"),
          gated: true,
        },
        {
          id: "roles",
          icon: "🛡️",
          label: "Roles & Permissions",
          title: "Roles & Permissions",
          visible: systemControl,
          gated: true,
        },
      ],
    },
  ];
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(({ visible }) => visible),
    }))
    .filter(({ items }) => items.length > 0);
}

function GatedModule({
  module,
}: {
  module: {
    icon: string;
    eyebrow: string;
    title: string;
    description: string;
    requirements: string[];
  };
}) {
  return (
    <section className={styles.gatedModule}>
      <div className={styles.gatedIcon} aria-hidden="true">
        {module.icon}
      </div>
      <div className={styles.gatedCopy}>
        <span>{module.eyebrow}</span>
        <h2>{module.title}</h2>
        <p>{module.description}</p>
        <div className={styles.gatedPill}>GATED · SIN MUTACIONES WEB</div>
      </div>
      <div className={styles.gatedRequirements}>
        <strong>Antes de habilitar</strong>
        <ul>
          {module.requirements.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ModuleUnavailable() {
  return (
    <section className={styles.gatedModule}>
      <div className={styles.gatedIcon} aria-hidden="true">
        🛠️
      </div>
      <div className={styles.gatedCopy}>
        <span>Módulo no conectado</span>
        <h2>Sin API administrativa</h2>
        <p>
          Esta superficie no ejecutará simulaciones ni acciones de cliente hasta
          contar con contratos server-side y permisos explícitos.
        </p>
      </div>
    </section>
  );
}

function AdminLogin({
  onAuthenticated,
  lockReason,
}: {
  onAuthenticated: (session: AdminSessionResponse) => Promise<void>;
  lockReason: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onAuthenticated(await adminLogin(email, password));
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className={styles.loginShell} lang="es">
      <form
        className={styles.loginCard}
        onSubmit={(event) => void submit(event)}
      >
        <div className={styles.loginBrand}>
          <Link className={styles.brand} href="/" aria-label="Ir a Fauzet">
            <Image
              className={styles.loginLogo}
              src="/fauzet/logo-white.png"
              alt="Fauzet"
              width={48}
              height={43}
              priority
            />
          </Link>
          <span className={styles.adminBadge}>ADMIN</span>
        </div>
        <div className={styles.lock}>🔒</div>
        <h1>Consola administrativa</h1>
        <p>
          Acceso aislado por rol. La contraseña se revalida y abre una sesión de
          control de diez minutos.
        </p>
        {lockReason ? (
          <div className={`${styles.alert} ${styles.alertWarning}`}>
            {lockReason}
          </div>
        ) : null}
        <label>
          Email administrativo
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? (
          <div className={`${styles.alert} ${styles.alertError}`}>{error}</div>
        ) : null}
        <button className={styles.primary} disabled={busy}>
          {busy ? "Validando…" : "Entrar con step-up"}
        </button>
        <small>
          Los roles se comprueban en cada endpoint. No existe acceso por URL sin
          autorización.
        </small>
      </form>
    </main>
  );
}

function Overview({ data }: { data: AdminOverviewResponse }) {
  const liabilities = Object.entries(data.ledger.userLiabilities);
  return (
    <div className={styles.stack}>
      <section className={styles.metrics}>
        <Metric
          label="Usuarios"
          value={data.users.total}
          note={`${data.users.registered24h} nuevos / 24h`}
        />
        <Metric
          label="Activos"
          value={data.users.active}
          note={`${data.users.suspended} suspendidos`}
        />
        <Metric
          label="Riesgo ≥ 50"
          value={data.risk.elevated}
          note={`${data.risk.high} con score ≥ 80`}
        />
        <Metric
          label="Asientos / 24h"
          value={data.ledger.transactions24h}
          note="Ledger de doble partida"
        />
      </section>
      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <div>
            <span>Pasivo de usuarios</span>
            <h2>ZYXE por estado contable</h2>
          </div>
          <code>{formatDate(data.serverNow)}</code>
        </div>
        <div className={styles.buckets}>
          {liabilities.map(([bucket, value]) => (
            <div key={bucket}>
              <span>{bucket}</span>
              <strong>{number(value)} ZYXE</strong>
            </div>
          ))}
        </div>
      </section>
      <section className={`${styles.panel} ${styles.gates}`}>
        <div>
          <strong>Dinero real</strong>
          <span>DESHABILITADO</span>
        </div>
        <div>
          <strong>Retiros</strong>
          <span>DESHABILITADO</span>
        </div>
        <div>
          <strong>Trading</strong>
          <span>DESHABILITADO</span>
        </div>
        <p>
          Estos gates se fuerzan en backend; la consola no puede
          sobreescribirlos.
        </p>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <article className={styles.metric}>
      <span>{label}</span>
      <strong>{number(value)}</strong>
      <small>{note}</small>
    </article>
  );
}

function Users({
  data,
  canWriteStatus,
  canWriteRisk,
  onChanged,
  onError,
}: {
  data: AdminUsersResponse;
  canWriteStatus: boolean;
  canWriteRisk: boolean;
  onChanged: (notice: string) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const initialUser = data.items[0];
  const [selectedId, setSelectedId] = useState(initialUser?.id ?? "");
  const selected = useMemo(
    () => data.items.find(({ id }) => id === selectedId) ?? data.items[0],
    [data.items, selectedId],
  );
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<MutableUserStatus>(
    mutableUserStatus(initialUser?.status),
  );
  const [riskLevel, setRiskLevel] = useState(initialUser?.riskLevel ?? 50);
  const [busy, setBusy] = useState(false);

  const selectUser = (user: AdminUsersResponse["items"][number]) => {
    setSelectedId(user.id);
    setRiskLevel(user.riskLevel);
    setStatus(mutableUserStatus(user.status));
  };
  const act = async (kind: "status" | "risk") => {
    if (!selected || reason.trim().length < 10) {
      onError(new Error("Escribe un motivo de al menos 10 caracteres."));
      return;
    }
    setBusy(true);
    try {
      if (kind === "status")
        await updateAdminUserStatus(selected.id, status, reason.trim());
      else await updateAdminRisk(selected.id, riskLevel, reason.trim());
      setReason("");
      await onChanged(
        kind === "status"
          ? "Estado actualizado y auditado."
          : "Riesgo actualizado y auditado.",
      );
    } catch (caught) {
      onError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.usersLayout}>
      <section className={`${styles.panel} ${styles.tableWrap}`}>
        <div className={styles.panelTitle}>
          <div>
            <span>Directorio</span>
            <h2>{data.total} usuarios</h2>
          </div>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Estado</th>
              <th>Riesgo</th>
              <th>Disponible</th>
              <th>Roles</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((user) => (
              <tr
                key={user.id}
                role="button"
                className={
                  selected?.id === user.id ? styles.selectedRow : undefined
                }
                tabIndex={0}
                aria-pressed={selected?.id === user.id}
                onClick={() => selectUser(user)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectUser(user);
                  }
                }}
              >
                <td>
                  <strong>{user.displayName ?? "Sin nombre"}</strong>
                  <small>{user.email}</small>
                </td>
                <td>
                  <Status value={user.status} />
                </td>
                <td>
                  <code>{user.riskLevel}</code>
                </td>
                <td>{number(user.balances.AVAILABLE ?? "0")}</td>
                <td>{user.roles.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {selected && (canWriteStatus || canWriteRisk) ? (
        <section className={`${styles.panel} ${styles.controlForm}`}>
          <span>Acción controlada</span>
          <h2>{selected.displayName ?? selected.email}</h2>
          <p>Cada cambio exige motivo, identidad, request ID y before/after.</p>
          <label>
            Motivo operativo
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Evidencia y razón de la decisión…"
            />
          </label>
          {canWriteRisk ? (
            <>
              <label>
                Risk score
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={riskLevel}
                  onChange={(event) => setRiskLevel(Number(event.target.value))}
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act("risk")}
              >
                Aplicar riesgo
              </button>
            </>
          ) : null}
          {canWriteStatus ? (
            <>
              <label>
                Estado
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as typeof status)
                  }
                >
                  <option>ACTIVE</option>
                  <option>RESTRICTED</option>
                  <option>SUSPENDED</option>
                </select>
              </label>
              <button
                type="button"
                className={styles.danger}
                disabled={busy}
                onClick={() => void act("status")}
              >
                Aplicar estado
              </button>
            </>
          ) : null}
          <small>
            Owner y Superadmin requieren maker-checker y se bloquean aquí.
          </small>
        </section>
      ) : null}
    </div>
  );
}

function Withdrawals({
  data,
  canDecide,
  onChanged,
  onError,
}: {
  data: AdminWithdrawalsResponse;
  canDecide: boolean;
  onChanged: (notice: string) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = data.items.find((item) => item.id === selectedId) ?? null;
  const selectWithdrawal = (item: AdminWithdrawalsResponse["items"][number]) =>
    setSelectedId(item.id);
  const decide = async (decision: "APPROVE" | "REJECT") => {
    if (!selected || reason.trim().length < 10) return;
    setBusy(true);
    try {
      await decideAdminWithdrawal(selected.id, decision, reason.trim());
      setSelectedId("");
      setReason("");
      await onChanged(
        decision === "APPROVE"
          ? "Retiro sandbox aprobado, liquidado y auditado."
          : "Retiro sandbox rechazado, liberado y auditado.",
      );
    } catch (caught) {
      onError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.usersLayout}>
      <section className={`${styles.panel} ${styles.tableWrap}`}>
        <div className={styles.panelTitle}>
          <div>
            <span>Sin valor externo · últimos 100</span>
            <h2>Cola de retiros sandbox</h2>
          </div>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Monto</th>
              <th>Destino</th>
              <th>Riesgo</th>
              <th>Estado</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr
                className={
                  selectedId === item.id ? styles.selectedRow : undefined
                }
                key={item.id}
                role="button"
                tabIndex={0}
                aria-pressed={selectedId === item.id}
                onClick={() => selectWithdrawal(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectWithdrawal(item);
                  }
                }}
              >
                <td>
                  <strong>{item.userDisplayName ?? item.userEmail}</strong>
                  <small>{item.userEmail}</small>
                </td>
                <td>
                  {number(item.eligibleMinorUnits)} ZYXE
                  <small>{item.asset}</small>
                </td>
                <td>
                  {item.walletLabel}
                  <small>{item.walletAddressMasked}</small>
                </td>
                <td>
                  <code>{item.riskScore}</code>
                </td>
                <td>
                  <Status value={item.status} />
                </td>
                <td>{formatDate(item.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {selected ? (
        <section className={`${styles.panel} ${styles.controlForm}`}>
          <span>Revisión humana</span>
          <h2>{selected.userDisplayName ?? selected.userEmail}</h2>
          <p>
            {number(selected.eligibleMinorUnits)} ZYXE · riesgo{" "}
            {selected.riskScore}
            <br />
            {selected.reasonCodes.join(" · ")}
          </p>
          {selected.sandboxTxId ? <code>{selected.sandboxTxId}</code> : null}
          {selected.riskScore >= 70 && selected.status === "REVIEW" ? (
            <div className={`${styles.alert} ${styles.alertWarning}`}>
              La API impide aprobar cuentas con riesgo 70 o superior. Solo se
              permite rechazar o revisar la evaluación.
            </div>
          ) : null}
          {canDecide && selected.status === "REVIEW" ? (
            <>
              <label>
                Motivo obligatorio
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  minLength={10}
                  placeholder="Describe la evidencia y la decisión…"
                />
              </label>
              <button
                type="button"
                disabled={
                  busy || reason.trim().length < 10 || selected.riskScore >= 70
                }
                onClick={() => void decide("APPROVE")}
              >
                Aprobar simulación
              </button>
              <button
                type="button"
                className={styles.danger}
                disabled={busy || reason.trim().length < 10}
                onClick={() => void decide("REJECT")}
              >
                Rechazar y liberar
              </button>
            </>
          ) : (
            <small>Vista de solo lectura o decisión ya cerrada.</small>
          )}
        </section>
      ) : null}
    </div>
  );
}

function Risk({ data }: { data: AdminRiskResponse }) {
  return (
    <section className={`${styles.panel} ${styles.tableWrap}`}>
      <div className={styles.panelTitle}>
        <div>
          <span>Señales append-only</span>
          <h2>Historial de riesgo</h2>
        </div>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Tipo</th>
            <th>Score</th>
            <th>Severidad</th>
            <th>Motivo</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id}>
              <td>{item.userDisplayName ?? item.userId.slice(0, 8)}</td>
              <td>{item.type}</td>
              <td>
                <code>
                  {item.previousScore} → {item.nextScore} (
                  {item.scoreDelta >= 0 ? "+" : ""}
                  {item.scoreDelta})
                </code>
              </td>
              <td>
                <Status value={item.severity} />
              </td>
              <td>{item.reason}</td>
              <td>{formatDate(item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Ledger({ data }: { data: AdminLedgerResponse }) {
  return (
    <section className={`${styles.panel} ${styles.tableWrap}`}>
      <div className={styles.panelTitle}>
        <div>
          <span>Últimos 50</span>
          <h2>Ledger & reconciliación</h2>
        </div>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Transacción</th>
            <th>Fuente</th>
            <th>Débitos</th>
            <th>Créditos</th>
            <th>Control</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.type}</strong>
                <small>{item.id.slice(0, 12)}</small>
              </td>
              <td>{item.sourceType}</td>
              <td>{number(item.totalDebitsMinorUnits)}</td>
              <td>{number(item.totalCreditsMinorUnits)}</td>
              <td>
                <Status value={item.balanced ? "BALANCED" : "ALERT"} />
              </td>
              <td>{formatDate(item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Audit({ data }: { data: AdminAuditResponse }) {
  return (
    <section className={`${styles.panel} ${styles.tableWrap}`}>
      <div className={styles.panelTitle}>
        <div>
          <span>Append-only</span>
          <h2>Audit log administrativo</h2>
        </div>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Actor</th>
            <th>Acción</th>
            <th>Objetivo</th>
            <th>Motivo</th>
            <th>Request</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id}>
              <td>{item.actor ?? "system"}</td>
              <td>
                <strong>{item.action}</strong>
              </td>
              <td>
                {item.targetType}:{item.targetId.slice(0, 10)}
              </td>
              <td>{item.reason ?? "—"}</td>
              <td>
                <code>{item.requestId.slice(0, 12)}</code>
              </td>
              <td>{formatDate(item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function mutableUserStatus(value?: string): MutableUserStatus {
  return value === "ACTIVE" || value === "SUSPENDED" || value === "RESTRICTED"
    ? value
    : "RESTRICTED";
}

function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = ["suspended", "critical", "alert", "rejected"].includes(
    normalized,
  )
    ? styles.statusDanger
    : ["restricted", "high", "review"].includes(normalized)
      ? styles.statusWarning
      : ["active", "balanced", "low", "confirmed"].includes(normalized)
        ? styles.statusSuccess
        : styles.statusNeutral;
  return <span className={`${styles.status} ${tone}`}>{value}</span>;
}
function number(value: string | number) {
  const formatter = new Intl.NumberFormat("es-CO");
  if (typeof value === "number") return formatter.format(value);
  if (/^-?\d+$/.test(value)) return formatter.format(BigInt(value));
  return value;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No fue posible completar la operación.";
}

function isAdministrativeSessionFailure(detail: string) {
  const normalized = detail.toLowerCase();
  return [
    "administrative re-authentication is required",
    "administrative session is invalid or expired",
    "authentication required",
    "session is invalid or expired",
    "account access is restricted",
  ].some((candidate) => normalized.includes(candidate));
}
