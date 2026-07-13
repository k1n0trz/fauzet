import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Privacidad de la beta | Fauzet",
  description: "Aviso operativo de privacidad de la beta técnica de Fauzet.",
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <main className={styles.page} lang="es">
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/" aria-label="Volver a Fauzet">
            <Image
              className={styles.brand}
              src="/fauzet/logo-white.png"
              alt="Fauzet"
              width={222}
              height={92}
              priority
            />
          </Link>
          <Link href="/app">Ir a mi cuenta</Link>
        </header>

        <section className={styles.hero}>
          <span className={styles.eyebrow}>PRIVACIDAD DE LA BETA</span>
          <h1>Aviso de privacidad</h1>
          <p>
            Explica qué información procesa Fauzet durante la beta, para qué se
            utiliza y cómo puedes ejercer control sobre ella.
          </p>
          <div className={styles.meta}>
            <span>Versión: beta-2026-07-13</span>
            <span>Actualizado: 13 de julio de 2026</span>
          </div>
        </section>

        <aside className={styles.notice}>
          Google Analytics, Google Tag Manager y Microsoft Clarity son
          opcionales: no se cargan hasta que aceptas la analítica en la landing.
          Puedes rechazarla sin perder acceso a Fauzet.
        </aside>

        <div className={styles.sections}>
          <section className={styles.section}>
            <h2>1. Información que tratamos</h2>
            <ul>
              <li>Cuenta: email, nombre visible, país, idioma y estado.</li>
              <li>
                Perfil opcional: contacto, dirección, facturación y avatar.
              </li>
              <li>
                Seguridad: sesiones, dispositivo, IP transformada y señales de
                riesgo.
              </li>
              <li>
                Actividad: claims, juegos, misiones, minería, Crew, compras y
                ledger.
              </li>
              <li>
                Preferencias: tema, zona horaria, avisos y consentimiento
                analítico.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>2. Finalidades</h2>
            <p>
              Usamos estos datos para crear y proteger cuentas, validar
              recompensas, mantener el ledger, prevenir abuso, prestar soporte,
              cumplir solicitudes y mejorar el producto. No vendemos datos
              personales ni usamos secretos de wallets en el navegador.
            </p>
          </section>

          <section className={styles.section}>
            <h2>3. Proveedores y transferencias</h2>
            <p>
              La infraestructura actual utiliza Google Cloud, Vercel y Resend.
              La analítica opcional utiliza Google y Microsoft tras tu
              consentimiento. Cada proveedor procesa únicamente lo necesario
              para su función y puede operar desde otros países bajo sus
              mecanismos contractuales y de seguridad.
            </p>
          </section>

          <section className={styles.section}>
            <h2>4. Conservación y seguridad</h2>
            <p>
              Conservamos datos mientras la cuenta esté activa y después según
              necesidades de seguridad, auditoría o ley. Aplicamos sesiones
              seguras, secretos aislados, cifrado de transporte, acceso por rol,
              trazabilidad y respaldos. Ningún sistema ofrece riesgo cero.
            </p>
          </section>

          <section className={styles.section}>
            <h2>5. Tus opciones y derechos</h2>
            <p>
              Puedes editar perfil y preferencias, rechazar analítica, solicitar
              copia, corrección, cierre o eliminación desde{" "}
              <Link href="/app/settings">Ajustes → Privacidad</Link>. Algunas
              evidencias podrán conservarse si son necesarias para fraude,
              contabilidad o una obligación aplicable.
            </p>
          </section>

          <section className={styles.section}>
            <h2>6. Menores y KYC</h2>
            <p>
              Fauzet exige declarar la edad requerida en el país del usuario. No
              cargues documentos de identidad mientras no exista un flujo KYC
              explícito con proveedor y consentimiento. La beta actual sólo
              muestra un estado KYC; no habilita valor externo.
            </p>
          </section>

          <section className={styles.section}>
            <h2>7. Responsable y futuras actualizaciones</h2>
            <p>
              Fauzet opera esta beta técnica inicialmente desde Colombia. La
              identificación jurídica y los canales legales definitivos se
              completarán antes de la apertura comercial. Los cambios materiales
              producirán una nueva versión y, cuando corresponda, una nueva
              solicitud de consentimiento.
            </p>
          </section>
        </div>

        <footer className={styles.footer}>
          <span>© 2026 Fauzet · Beta técnica cerrada</span>
          <Link href="/terms">Condiciones de uso</Link>
        </footer>
      </div>
    </main>
  );
}
