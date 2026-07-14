"use client";

import { FormEvent, useEffect, useState } from "react";
import { API_BASE } from "../../../lib/api";

type ProfileData = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    locale: "es" | "en";
    countryCode: string | null;
    status: string;
    emailVerified: boolean;
    createdAt: string;
  };
  profile: {
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    phoneVerified: boolean;
    birthDate: string | null;
    timezone: string;
    theme: "DARK" | "LIGHT" | "SYSTEM";
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    billingName: string | null;
    billingTaxId: string | null;
    billingEmail: string | null;
    marketingEmails: boolean;
    productEmails: boolean;
    avatarAvailable: boolean;
    kyc: { status: string; provider: string | null };
    closureRequestedAt: string | null;
  };
  security: {
    twoFactor: { enabled: boolean; available: boolean; reason: string };
    google: { linked: boolean; available: boolean; reason: string };
  };
  sessions: Array<{
    id: string;
    current: boolean;
    device: string;
    createdAt: string;
    expiresAt: string;
  }>;
  wallets: Array<{
    id: string;
    network: string;
    label: string;
    address: string;
    status: string;
    availableAt: string;
  }>;
  paymentMethods: unknown[];
};

const tabs = [
  ["profile", "Perfil"],
  ["appearance", "Apariencia"],
  ["security", "Seguridad"],
  ["payments", "Pagos y wallets"],
  ["billing", "Facturación"],
  ["kyc", "KYC"],
  ["privacy", "Privacidad"],
] as const;

type Tab = (typeof tabs)[number][0];

export function SettingsExperience() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [tab, setTab] = useState<Tab>("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [avatarVersion, setAvatarVersion] = useState(0);

  async function load(signal?: AbortSignal) {
    const response = await fetch(`${API_BASE}/me/profile`, {
      credentials: "include",
      cache: "no-store",
      signal: signal ?? null,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(apiMessage(payload));
    setData(payload as ProfileData);
    applyTheme((payload as ProfileData).profile.theme);
  }

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void load(controller.signal)
        .catch((caught) => setError(errorMessage(caught)))
        .finally(() => setLoading(false));
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  async function patch(fields: Record<string, unknown>, success: string) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/me/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fields),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(apiMessage(payload));
      setData(payload as ProfileData);
      setMessage(success);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  function submitForm(event: FormEvent<HTMLFormElement>, success: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields: Record<string, unknown> = {};
    form.forEach((value, key) => {
      fields[key] = value;
    });
    event.currentTarget
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((checkbox) => {
        fields[checkbox.name] = checkbox.checked;
      });
    void patch(fields, success);
  }

  async function setTheme(theme: "DARK" | "LIGHT" | "SYSTEM") {
    applyTheme(theme);
    localStorage.setItem("fz_theme", theme);
    await patch({ theme }, "Tema actualizado.");
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;
    if (file.size > 500_000) {
      setError("La imagen debe pesar máximo 500 KB.");
      return;
    }
    const dataBase64 = await fileToBase64(file);
    const response = await fetch(`${API_BASE}/me/avatar`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mime: file.type, dataBase64 }),
    });
    const payload = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      setError(apiMessage(payload));
      return;
    }
    await load();
    setAvatarVersion(Date.now());
    setMessage("Foto de perfil actualizada.");
  }

  async function removeAvatar() {
    const response = await fetch(`${API_BASE}/me/avatar`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) return setError("No fue posible quitar la foto.");
    await load();
    setMessage("Foto eliminada.");
  }

  async function requestPasswordChange() {
    if (!data) return;
    const response = await fetch(`${API_BASE}/auth/password/forgot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: data.user.email }),
    });
    setMessage(
      response.ok
        ? "Te enviamos un enlace seguro para cambiar la contraseña."
        : "No fue posible enviar el enlace.",
    );
  }

  async function revokeSession(id: string) {
    const response = await fetch(`${API_BASE}/me/sessions/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) return setError("No fue posible cerrar esa sesión.");
    await load();
    setMessage("Sesión cerrada.");
  }

  async function revokeOthers() {
    const response = await fetch(`${API_BASE}/me/sessions`, {
      method: "DELETE",
      credentials: "include",
    });
    const payload = await response.json();
    if (!response.ok) return setError(apiMessage(payload));
    await load();
    setMessage(`Se cerraron ${payload.revoked ?? 0} sesiones.`);
  }

  async function setClosure(requested: boolean) {
    const response = await fetch(`${API_BASE}/me/closure-request`, {
      method: requested ? "POST" : "DELETE",
      credentials: "include",
    });
    if (!response.ok)
      return setError("No fue posible actualizar la solicitud.");
    await load();
    setMessage(
      requested ? "Solicitud de cierre registrada." : "Solicitud cancelada.",
    );
  }

  function exportData() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fauzet-data-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function rejectAnalytics() {
    try {
      window.localStorage.setItem("fz_analytics_consent", "rejected");
      setMessage(
        "Analítica opcional rechazada. El cambio se aplicará en tu próxima visita a la landing.",
      );
    } catch {
      setError("Tu navegador no permitió guardar esta preferencia.");
    }
  }

  function resetAnalyticsChoice() {
    try {
      window.localStorage.removeItem("fz_analytics_consent");
      setMessage(
        "Preferencia restablecida. La landing volverá a pedir tu decisión.",
      );
    } catch {
      setError("Tu navegador no permitió restablecer esta preferencia.");
    }
  }

  if (loading)
    return (
      <section className="settingsPage">
        <p className="lead">Cargando tus ajustes…</p>
      </section>
    );
  if (!data)
    return (
      <section className="settingsPage">
        <div className="formError">
          {error || "No pudimos cargar el perfil."}
        </div>
      </section>
    );

  return (
    <section className="settingsPage">
      <div className="eyebrow">Cuenta Fauzet</div>
      <h1 className="settingsTitle">Ajustes y perfil</h1>
      <p className="lead">
        Administra tu identidad, seguridad, pagos y privacidad desde un solo
        lugar.
      </p>

      <div className="settingsLayout">
        <nav className="settingsTabs" aria-label="Secciones de ajustes">
          {tabs.map(([id, label]) => (
            <button
              className={tab === id ? "active" : ""}
              type="button"
              onClick={() => setTab(id)}
              key={id}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="settingsPanel">
          {message ? (
            <div className="settingsSuccess" role="status">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="formError" role="alert">
              {error}
            </div>
          ) : null}

          {tab === "profile" ? (
            <form
              className="settingsForm"
              onSubmit={(event) => submitForm(event, "Perfil actualizado.")}
            >
              <SettingsHeading
                title="Información personal"
                copy="Estos datos ayudan a identificar y proteger tu cuenta."
              />
              <div className="avatarEditor">
                <div className="profileAvatar">
                  {data.profile.avatarAvailable ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${API_BASE}/me/avatar?v=${avatarVersion}`}
                      alt="Foto de perfil"
                    />
                  ) : (
                    initials(data.user.displayName ?? data.user.email)
                  )}
                </div>
                <div>
                  <label className="fileButton">
                    Agregar o cambiar foto
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) =>
                        void uploadAvatar(event.target.files?.[0])
                      }
                    />
                  </label>
                  {data.profile.avatarAvailable ? (
                    <button
                      className="textButton"
                      type="button"
                      onClick={() => void removeAvatar()}
                    >
                      Quitar foto
                    </button>
                  ) : null}
                  <small>PNG, JPEG o WebP · máximo 500 KB.</small>
                </div>
              </div>
              <div className="settingsGrid">
                <Field
                  name="displayName"
                  label="Nombre visible"
                  value={data.user.displayName}
                  required
                />
                <Field
                  name="username"
                  label="Nombre de usuario"
                  value={data.profile.username}
                  placeholder="usuario_fauzet"
                />
                <Field
                  name="firstName"
                  label="Nombres"
                  value={data.profile.firstName}
                />
                <Field
                  name="lastName"
                  label="Apellidos"
                  value={data.profile.lastName}
                />
                <Field
                  name="phone"
                  label="Teléfono"
                  value={data.profile.phone}
                  placeholder="+57 300 000 0000"
                />
                <Field
                  name="birthDate"
                  label="Fecha de nacimiento"
                  value={data.profile.birthDate}
                  type="date"
                />
                <Field
                  name="countryCode"
                  label="País (ISO)"
                  value={data.user.countryCode}
                  placeholder="CO"
                />
                <label>
                  Idioma
                  <select name="locale" defaultValue={data.user.locale}>
                    <option value="es">Español</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label>
                  Zona horaria
                  <select name="timezone" defaultValue={data.profile.timezone}>
                    <option value="America/Bogota">Bogotá</option>
                    <option value="America/Mexico_City">
                      Ciudad de México
                    </option>
                    <option value="America/New_York">Nueva York</option>
                    <option value="Europe/Madrid">Madrid</option>
                    <option value="UTC">UTC</option>
                  </select>
                </label>
              </div>
              <h3>Dirección de contacto</h3>
              <div className="settingsGrid">
                <Field
                  name="addressLine1"
                  label="Dirección"
                  value={data.profile.addressLine1}
                />
                <Field
                  name="addressLine2"
                  label="Complemento"
                  value={data.profile.addressLine2}
                />
                <Field name="city" label="Ciudad" value={data.profile.city} />
                <Field
                  name="region"
                  label="Departamento/estado"
                  value={data.profile.region}
                />
                <Field
                  name="postalCode"
                  label="Código postal"
                  value={data.profile.postalCode}
                />
              </div>
              <button className="button" disabled={saving}>
                {saving ? "Guardando…" : "Guardar perfil"}
              </button>
            </form>
          ) : null}

          {tab === "appearance" ? (
            <div className="settingsSection">
              <SettingsHeading
                title="Apariencia"
                copy="Elige cómo quieres ver Fauzet en este dispositivo."
              />
              <div className="themeChoices">
                {(["DARK", "LIGHT", "SYSTEM"] as const).map((theme) => (
                  <button
                    className={data.profile.theme === theme ? "active" : ""}
                    type="button"
                    onClick={() => void setTheme(theme)}
                    key={theme}
                  >
                    {themeLabel(theme)}
                  </button>
                ))}
              </div>
              <form
                className="settingsForm"
                onSubmit={(event) =>
                  submitForm(event, "Preferencias actualizadas.")
                }
              >
                <label className="toggle">
                  <input
                    name="productEmails"
                    type="checkbox"
                    defaultChecked={data.profile.productEmails}
                  />{" "}
                  Avisos del producto y actividad
                </label>
                <label className="toggle">
                  <input
                    name="marketingEmails"
                    type="checkbox"
                    defaultChecked={data.profile.marketingEmails}
                  />{" "}
                  Novedades y promociones
                </label>
                <button className="button" disabled={saving}>
                  Guardar preferencias
                </button>
              </form>
            </div>
          ) : null}

          {tab === "security" ? (
            <div className="settingsSection">
              <SettingsHeading
                title="Seguridad"
                copy="Protege el acceso y revisa dónde está abierta tu cuenta."
              />
              <div className="securityCards">
                <StatusCard
                  title="Correo"
                  status={data.user.emailVerified ? "Verificado" : "Pendiente"}
                  copy={data.user.email}
                />
                <StatusCard
                  title="Google Auth"
                  status={
                    data.security.google.linked ? "Vinculado" : "Disponible"
                  }
                  copy={
                    data.security.google.linked
                      ? "Tu cuenta puede iniciar sesión de forma segura con Google."
                      : "Usa el botón Google al iniciar sesión para vincular el mismo correo verificado."
                  }
                />
                <StatusCard
                  title="2FA"
                  status="Próxima implementación"
                  copy="TOTP y códigos de recuperación requieren el flujo completo de login antes de activarse."
                />
              </div>
              <button
                className="button secondary"
                type="button"
                onClick={() => void requestPasswordChange()}
              >
                Cambiar contraseña por enlace seguro
              </button>
              <div className="sessionHeading">
                <h3>Sesiones activas</h3>
                <button
                  className="textButton"
                  type="button"
                  onClick={() => void revokeOthers()}
                >
                  Cerrar las demás
                </button>
              </div>
              <div className="sessionList">
                {data.sessions.map((session) => (
                  <article key={session.id}>
                    <div>
                      <strong>
                        {session.current ? "Este dispositivo" : session.device}
                      </strong>
                      <small>
                        Abierta {formatDate(session.createdAt)} · vence{" "}
                        {formatDate(session.expiresAt)}
                      </small>
                    </div>
                    {session.current ? (
                      <span className="statusPill">Actual</span>
                    ) : (
                      <button
                        className="textButton"
                        type="button"
                        onClick={() => void revokeSession(session.id)}
                      >
                        Cerrar
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "payments" ? (
            <div className="settingsSection">
              <SettingsHeading
                title="Pagos y wallets"
                copy="Los datos de tarjeta nunca se almacenarán en Fauzet."
              />
              <StatusCard
                title="Medios fiat"
                status="Sin proveedor"
                copy="Stripe y Mercado Pago aparecerán aquí mediante tokens seguros cuando sus cuentas estén aprobadas."
              />
              <h3>Wallets externas</h3>
              {data.wallets.length ? (
                <div className="sessionList">
                  {data.wallets.map((wallet) => (
                    <article key={wallet.id}>
                      <div>
                        <strong>
                          {wallet.label} · {wallet.network}
                        </strong>
                        <small>{wallet.address}</small>
                      </div>
                      <span className="statusPill">{wallet.status}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="settingsNotice">
                  No tienes wallets externas. En esta beta se agregan desde
                  Conversión sandbox.
                </div>
              )}
            </div>
          ) : null}

          {tab === "billing" ? (
            <form
              className="settingsForm"
              onSubmit={(event) =>
                submitForm(event, "Facturación actualizada.")
              }
            >
              <SettingsHeading
                title="Facturación"
                copy="Información usada en futuros comprobantes de compras fiat."
              />
              <div className="settingsGrid">
                <Field
                  name="billingName"
                  label="Nombre o razón social"
                  value={data.profile.billingName}
                />
                <Field
                  name="billingTaxId"
                  label="Identificación fiscal"
                  value={data.profile.billingTaxId}
                  placeholder="NIT / documento"
                />
                <Field
                  name="billingEmail"
                  label="Correo de facturación"
                  value={data.profile.billingEmail}
                  type="email"
                />
              </div>
              <button className="button" disabled={saving}>
                Guardar facturación
              </button>
              <div className="settingsNotice">
                Todavía no hay facturas ni cobros fiat porque Stripe y Mercado
                Pago no están conectados.
              </div>
            </form>
          ) : null}

          {tab === "kyc" ? (
            <div className="settingsSection">
              <SettingsHeading
                title="Verificación de identidad (KYC)"
                copy="Solo se solicitará cuando una función, límite o regulación lo requiera."
              />
              <div className="kycStatus">
                <span>Estado actual</span>
                <strong>{kycLabel(data.profile.kyc.status)}</strong>
                <small>
                  Proveedor: {data.profile.kyc.provider ?? "por seleccionar"}
                </small>
              </div>
              <div className="settingsNotice">
                No subas documentos todavía. Elegiremos un proveedor que cifre
                los archivos, valide identidad y entregue únicamente el
                resultado necesario.
              </div>
              <button className="button" type="button" disabled>
                Iniciar verificación (próximamente)
              </button>
            </div>
          ) : null}

          {tab === "privacy" ? (
            <div className="settingsSection">
              <SettingsHeading
                title="Privacidad y cuenta"
                copy="Controla tus datos y solicitudes sobre la cuenta."
              />
              <button
                className="button secondary"
                type="button"
                onClick={exportData}
              >
                Descargar mis datos
              </button>
              <div className="settingsNotice">
                <strong>Analítica opcional</strong>
                <p>
                  Google Analytics, Tag Manager y Microsoft Clarity sólo se
                  cargan en la landing después de tu consentimiento.
                </p>
                <div className="buttonRow">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={rejectAnalytics}
                  >
                    Rechazar analítica
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={resetAnalyticsChoice}
                  >
                    Volver a preguntar
                  </button>
                </div>
                <p>
                  <a href="/privacy">Aviso de privacidad</a> ·{" "}
                  <a href="/terms">Condiciones de uso</a>
                </p>
              </div>
              <div className="dangerZone">
                <h3>Cerrar cuenta</h3>
                <p>
                  La solicitud bloquea nuevas operaciones después de revisión.
                  Los datos contables que deban conservarse por ley no se
                  eliminan inmediatamente.
                </p>
                {data.profile.closureRequestedAt ? (
                  <>
                    <strong>
                      Solicitada {formatDate(data.profile.closureRequestedAt)}
                    </strong>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => void setClosure(false)}
                    >
                      Cancelar solicitud
                    </button>
                  </>
                ) : (
                  <button
                    className="button danger"
                    type="button"
                    onClick={() =>
                      window.confirm(
                        "¿Registrar la solicitud de cierre de cuenta?",
                      ) && void setClosure(true)
                    }
                  >
                    Solicitar cierre
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Field({
  name,
  label,
  value,
  type = "text",
  placeholder,
  required,
}: {
  name: string;
  label: string;
  value: string | null;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}
function SettingsHeading({ title, copy }: { title: string; copy: string }) {
  return (
    <header className="settingsHeading">
      <h2>{title}</h2>
      <p>{copy}</p>
    </header>
  );
}
function StatusCard({
  title,
  status,
  copy,
}: {
  title: string;
  status: string;
  copy: string;
}) {
  return (
    <article className="statusCard">
      <span>{title}</span>
      <strong>{status}</strong>
      <small>{copy}</small>
    </article>
  );
}
function initials(value: string) {
  return value
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function themeLabel(theme: string) {
  return (
    (
      { DARK: "Oscuro", LIGHT: "Claro", SYSTEM: "Sistema" } as Record<
        string,
        string
      >
    )[theme] ?? theme
  );
}
function kycLabel(status: string) {
  return (
    (
      {
        NOT_STARTED: "No iniciado",
        PENDING: "En revisión",
        VERIFIED: "Verificado",
        REJECTED: "Requiere atención",
      } as Record<string, string>
    )[status] ?? status
  );
}
function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme.toLowerCase();
}
function errorMessage(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "Ocurrió un error inesperado.";
}
function apiMessage(payload: unknown) {
  const value = payload as {
    error?: { message?: string };
    message?: string;
  } | null;
  return (
    value?.error?.message ??
    value?.message ??
    "El servidor rechazó la operación."
  );
}
function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
