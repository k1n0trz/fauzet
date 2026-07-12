import Link from "next/link";

export function RewardsHeader({ current }: { current: "games" | "missions" }) {
  return (
    <header className="appHeader rewardsHeader">
      <Link className="brand" href="/app" aria-label="Fauzet, ir al panel">
        Fau<span>zet</span>
      </Link>
      <nav className="appNav" aria-label="Navegación de recompensas">
        <Link href="/app">Panel</Link>
        {current === "games" ? (
          <span aria-current="page">Juegos</span>
        ) : (
          <Link href="/app/games">Juegos</Link>
        )}
        {current === "missions" ? (
          <span aria-current="page">Misiones</span>
        ) : (
          <Link href="/app/missions">Misiones</Link>
        )}
      </nav>
    </header>
  );
}
