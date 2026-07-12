import Link from "next/link";

export default function AppEntry() {
  return (
    <main className="shell">
      <section
        className="hero"
        style={{ gridTemplateColumns: "1fr", maxWidth: 760 }}
      >
        <div className="panel">
          <div className="eyebrow">Beta cerrada</div>
          <h1 style={{ fontSize: 52 }}>
            El núcleo de Fauzet está en construcción.
          </h1>
          <p className="lead">
            La nueva aplicación reemplazará los saldos locales del prototipo por
            autenticación real, ledger de doble partida y validación
            server-side.
          </p>
          <div className="actions">
            <Link className="button secondary" href="/">
              Volver a la landing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
