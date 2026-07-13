import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Condiciones de la beta | Fauzet",
  description: "Condiciones operativas de la beta técnica cerrada de Fauzet.",
  robots: { index: false, follow: true },
};

export default function TermsPage() {
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
          <span className={styles.eyebrow}>DOCUMENTO OPERATIVO DE BETA</span>
          <h1>Condiciones de uso</h1>
          <p>
            Estas condiciones regulan la beta técnica cerrada de Fauzet. Debes
            leerlas antes de crear una cuenta o usar recompensas internas.
          </p>
          <div className={styles.meta}>
            <span>Versión: beta-2026-07-13</span>
            <span>Vigente desde: 13 de julio de 2026</span>
            <span>Jurisdicción operativa inicial: Colombia</span>
          </div>
        </section>

        <aside className={styles.notice}>
          Este documento es provisional para la beta técnica y no habilita
          dinero real, custodia, trading ni retiros de criptomonedas. Las
          condiciones comerciales y la identificación jurídica definitiva se
          publicarán y requerirán una nueva aceptación antes de activar valor
          externo.
        </aside>

        <div className={styles.sections}>
          <section className={styles.section}>
            <h2>1. Cuenta y elegibilidad</h2>
            <p>
              Debes proporcionar información veraz, mantener segura tu cuenta,
              cumplir la edad exigida en tu país y utilizar Fauzet únicamente
              donde sea legal. Una persona no puede crear cuentas múltiples para
              eludir límites, controles o reglas de referidos.
            </p>
          </section>

          <section className={styles.section} id="rewards">
            <h2>2. ZYXE y recompensas</h2>
            <p>
              ZYXE es una unidad interna de utilidad y recompensa durante la
              beta. No es dinero, valor negociable, inversión, acción, deuda ni
              promesa de rentabilidad. No tiene precio público ni conversión
              automática. Las recompensas son variables, dependen de actividad
              válida, presupuestos, límites y controles antifraude, y no están
              garantizadas.
            </p>
          </section>

          <section className={styles.section}>
            <h2>3. Faucet, juegos, misiones y minería virtual</h2>
            <p>
              Cada módulo aplica reglas server-side, cooldowns, energía, límites
              y validación de actividad. La minería es una simulación
              gamificada: el navegador no ejecuta Proof-of-Work real ni extrae
              criptomonedas de una blockchain. Fauzet puede retener o rechazar
              actividad anómala mientras la revisa.
            </p>
          </section>

          <section className={styles.section}>
            <h2>4. Conducta prohibida</h2>
            <ul>
              <li>
                Automatizar claims o juegos, manipular solicitudes o explotar
                errores.
              </li>
              <li>
                Usar identidades, dispositivos o referidos coordinados para
                farming.
              </li>
              <li>
                Acceder a cuentas ajenas o interferir con la seguridad del
                servicio.
              </li>
              <li>
                Intentar convertir saldos sandbox en una obligación de pago
                real.
              </li>
            </ul>
          </section>

          <section className={styles.section} id="risk">
            <h2>5. Riesgo, restricciones y disponibilidad</h2>
            <p>
              Fauzet puede limitar, poner en revisión o suspender funciones para
              proteger usuarios, pools y plataforma. Procuraremos mostrar el
              estado y permitir revisión cuando corresponda. La beta puede
              cambiar, interrumpirse o contener errores; no debes depender de
              ella para ingresos ni necesidades financieras.
            </p>
          </section>

          <section className={styles.section} id="withdrawals">
            <h2>6. Compras, conversiones y retiros</h2>
            <p>
              Las compras actuales con ZYXE pertenecen a la economía interna.
              Los checkouts fiat, swaps, depósitos y retiros reales están
              deshabilitados. Antes de habilitarlos publicaremos precios,
              impuestos, reembolsos, comisiones, límites, países y requisitos
              KYC/AML aplicables, y solicitaremos consentimiento adicional.
            </p>
          </section>

          <section className={styles.section}>
            <h2>7. Cambios y cierre</h2>
            <p>
              Puedes solicitar cierre o exportación desde Ajustes. Conservaremos
              lo necesario para seguridad, auditoría y obligaciones aplicables.
              Si un cambio material afecta estas condiciones, mostraremos una
              nueva versión y pediremos aceptación antes de continuar con las
              funciones afectadas.
            </p>
          </section>

          <section className={styles.section}>
            <h2>8. Contacto y revisión</h2>
            <p>
              Durante la beta puedes ejercer solicitudes desde{" "}
              <Link href="/app/settings">Ajustes → Privacidad</Link>. Este canal
              quedará complementado con el correo legal/de soporte antes de la
              apertura pública.
            </p>
          </section>
        </div>

        <footer className={styles.footer}>
          <span>© 2026 Fauzet · Beta técnica cerrada</span>
          <Link href="/privacy">Aviso de privacidad</Link>
        </footer>
      </div>
    </main>
  );
}
