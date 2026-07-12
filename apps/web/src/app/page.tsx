import Link from "next/link";

const buckets = [
  ["Disponible", "0 ZYXE"],
  ["Pendiente", "0 ZYXE"],
  ["Elegible", "0 ZYXE"],
] as const;

export default function Home() {
  return (
    <main className="shell">
      <nav className="nav" aria-label="Navegación principal">
        <Link className="brand" href="/">
          Fau<span>zet</span>
        </Link>
        <div className="navLinks">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#seguridad">Seguridad</a>
          <a href="#zyxe">ZYXE</a>
        </div>
        <Link className="button secondary" href="/app">
          Entrar
        </Link>
      </nav>
      <section className="hero">
        <div>
          <div className="eyebrow">Economía interna auditable</div>
          <h1>
            Drip sats.
            <br />
            <em>Every day.</em>
          </h1>
          <p className="lead">
            Reclama, juega y participa en una economía gamificada donde cada
            recompensa validada queda registrada y es completamente trazable.
          </p>
          <div className="actions">
            <Link className="button" href="/app">
              Comenzar
            </Link>
            <a className="button secondary" href="#como-funciona">
              Conocer Fauzet
            </a>
          </div>
        </div>
        <aside className="panel" aria-label="Vista previa de wallet">
          <div className="coin">Z</div>
          <div className="balance">0 ZYXE</div>
          <div className="caption">Tu unidad interna de utilidad</div>
          <div className="buckets">
            {buckets.map(([label, value]) => (
              <div className="bucket" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </aside>
      </section>
      <footer className="legal">
        ZYXE es una unidad interna de utilidad. No es una inversión, no tiene
        precio público durante el MVP y las recompensas no están garantizadas.
      </footer>
    </main>
  );
}
