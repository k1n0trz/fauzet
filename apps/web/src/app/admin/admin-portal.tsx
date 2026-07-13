"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

type View = "overview" | "users" | "withdrawals" | "risk" | "ledger" | "audit";

export function AdminPortal() {
  const [session, setSession] = useState<AdminSessionResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("overview");
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [users, setUsers] = useState<AdminUsersResponse | null>(null);
  const [ledger, setLedger] = useState<AdminLedgerResponse | null>(null);
  const [audit, setAudit] = useState<AdminAuditResponse | null>(null);
  const [risk, setRisk] = useState<AdminRiskResponse | null>(null);
  const [withdrawals, setWithdrawals] =
    useState<AdminWithdrawalsResponse | null>(null);

  const loadData = useCallback(async (current: AdminSessionResponse) => {
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
      setError(message(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void adminSession()
      .then(async (restored) => {
        if (!active) return;
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

  if (checking)
    return (
      <main className="admin-login-shell">
        <div className="admin-login-card">Validando acceso administrativo…</div>
      </main>
    );
  if (!session)
    return (
      <AdminLogin
        onAuthenticated={async (authenticated) => {
          setSession(authenticated);
          await loadData(authenticated);
        }}
      />
    );

  const permissions = new Set(session.permissions);
  const views = (
    [
      ["overview", "Overview", true],
      ["users", "Usuarios", permissions.has("USERS_READ")],
      ["withdrawals", "Retiros sandbox", permissions.has("WITHDRAWALS_READ")],
      ["risk", "Riesgo", permissions.has("RISK_READ")],
      ["ledger", "Ledger", permissions.has("LEDGER_READ")],
      ["audit", "Auditoría", permissions.has("AUDIT_READ")],
    ] as const
  ).filter((item) => item[2]);

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-logo" href="/">
          Fau<span>zet</span>
        </Link>
        <div className="admin-environment">Closed beta · internal only</div>
        <nav aria-label="Administración">
          {views.map(([id, label]) => (
            <button
              className={view === id ? "active" : ""}
              key={id}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="admin-identity">
          <strong>{session.user.email}</strong>
          <span>{session.roles.join(" · ")}</span>
          <small>Step-up hasta {formatDate(session.expiresAt)}</small>
          <button
            onClick={() =>
              void adminLogout().finally(() => {
                setSession(null);
                setOverview(null);
              })
            }
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <span>Control plane</span>
            <h1>{views.find(([id]) => id === view)?.[1]}</h1>
          </div>
          <button onClick={() => void loadData(session)} disabled={loading}>
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
        </header>
        {error ? <div className="admin-alert error">{error}</div> : null}
        {notice ? <div className="admin-alert success">{notice}</div> : null}
        {view === "overview" && overview ? <Overview data={overview} /> : null}
        {view === "users" && users ? (
          <Users
            data={users}
            canWriteStatus={permissions.has("USERS_STATUS_WRITE")}
            canWriteRisk={permissions.has("RISK_WRITE")}
            onChanged={async (text) => {
              setNotice(text);
              await loadData(session);
            }}
            onError={(caught) => setError(message(caught))}
          />
        ) : null}
        {view === "risk" && risk ? <Risk data={risk} /> : null}
        {view === "withdrawals" && withdrawals ? (
          <Withdrawals
            data={withdrawals}
            canDecide={permissions.has("WITHDRAWALS_WRITE")}
            onChanged={async (text) => {
              setNotice(text);
              await loadData(session);
            }}
            onError={(caught) => setError(message(caught))}
          />
        ) : null}
        {view === "ledger" && ledger ? <Ledger data={ledger} /> : null}
        {view === "audit" && audit ? <Audit data={audit} /> : null}
      </section>
    </main>
  );
}

function AdminLogin({
  onAuthenticated,
}: {
  onAuthenticated: (session: AdminSessionResponse) => Promise<void>;
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
    <main className="admin-login-shell">
      <form
        className="admin-login-card"
        onSubmit={(event) => void submit(event)}
      >
        <Link className="admin-logo" href="/">
          Fau<span>zet</span>
        </Link>
        <div className="admin-lock">🔒</div>
        <h1>Consola administrativa</h1>
        <p>
          Acceso aislado por rol. La contraseña se revalida y abre una sesión de
          control de diez minutos.
        </p>
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
        {error ? <div className="admin-alert error">{error}</div> : null}
        <button className="admin-primary" disabled={busy}>
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
    <div className="admin-stack">
      <section className="admin-metrics">
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
      <section className="admin-panel">
        <div className="admin-panel-title">
          <div>
            <span>Pasivo de usuarios</span>
            <h2>ZYXE por estado contable</h2>
          </div>
          <code>{formatDate(data.serverNow)}</code>
        </div>
        <div className="admin-buckets">
          {liabilities.map(([bucket, value]) => (
            <div key={bucket}>
              <span>{bucket}</span>
              <strong>{number(value)} ZYXE</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="admin-panel admin-gates">
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
    <article className="admin-metric">
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
  const [selectedId, setSelectedId] = useState(data.items[0]?.id ?? "");
  const selected = useMemo(
    () => data.items.find(({ id }) => id === selectedId) ?? data.items[0],
    [data.items, selectedId],
  );
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "RESTRICTED" | "SUSPENDED">(
    "RESTRICTED",
  );
  const [riskLevel, setRiskLevel] = useState(50);
  const [busy, setBusy] = useState(false);
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
    <div className="admin-users-layout">
      <section className="admin-panel admin-table-wrap">
        <div className="admin-panel-title">
          <div>
            <span>Directorio</span>
            <h2>{data.total} usuarios</h2>
          </div>
        </div>
        <table className="admin-table">
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
                className={selected?.id === user.id ? "selected" : ""}
                onClick={() => {
                  setSelectedId(user.id);
                  setRiskLevel(user.riskLevel);
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
        <section className="admin-panel admin-control-form">
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
              <button disabled={busy} onClick={() => void act("risk")}>
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
                className="danger"
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
    <div className="admin-users-layout">
      <section className="admin-panel admin-table-wrap">
        <div className="admin-panel-title">
          <div>
            <span>Sin valor externo · últimos 100</span>
            <h2>Cola de retiros sandbox</h2>
          </div>
        </div>
        <table className="admin-table">
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
                className={selectedId === item.id ? "selected" : ""}
                key={item.id}
                onClick={() => setSelectedId(item.id)}
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
        <section className="admin-control-form">
          <span>Revisión humana</span>
          <h2>{selected.userDisplayName ?? selected.userEmail}</h2>
          <p>
            {number(selected.eligibleMinorUnits)} ZYXE · riesgo{" "}
            {selected.riskScore}
            <br />
            {selected.reasonCodes.join(" · ")}
          </p>
          {selected.sandboxTxId ? <code>{selected.sandboxTxId}</code> : null}
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
                disabled={busy || reason.trim().length < 10}
                onClick={() => void decide("APPROVE")}
              >
                Aprobar simulación
              </button>
              <button
                className="danger"
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
    <section className="admin-panel admin-table-wrap">
      <div className="admin-panel-title">
        <div>
          <span>Señales append-only</span>
          <h2>Historial de riesgo</h2>
        </div>
      </div>
      <table className="admin-table">
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
    <section className="admin-panel admin-table-wrap">
      <div className="admin-panel-title">
        <div>
          <span>Últimos 50</span>
          <h2>Ledger & reconciliación</h2>
        </div>
      </div>
      <table className="admin-table">
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
    <section className="admin-panel admin-table-wrap">
      <div className="admin-panel-title">
        <div>
          <span>Append-only</span>
          <h2>Audit log administrativo</h2>
        </div>
      </div>
      <table className="admin-table">
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

function Status({ value }: { value: string }) {
  return <span className={`admin-status ${value.toLowerCase()}`}>{value}</span>;
}
function number(value: string | number) {
  return new Intl.NumberFormat("es-CO").format(
    typeof value === "string" ? Number(value) : value,
  );
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
