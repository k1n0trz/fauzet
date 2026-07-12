import Link from "next/link";

const destinations = [
  { id: "games", href: "/app/games", label: "Juegos" },
  { id: "missions", href: "/app/missions", label: "Misiones" },
  { id: "mining", href: "/app/mining", label: "Minería" },
  { id: "store", href: "/app/store", label: "Tienda" },
] as const;

export function RewardsHeader({
  current,
}: {
  current: (typeof destinations)[number]["id"];
}) {
  return (
    <header className="appHeader rewardsHeader">
      <Link className="brand" href="/app" aria-label="Fauzet, ir al panel">
        Fau<span>zet</span>
      </Link>
      <nav className="appNav" aria-label="Navegación de recompensas">
        <Link href="/app">Panel</Link>
        {destinations.map((destination) =>
          current === destination.id ? (
            <span aria-current="page" key={destination.id}>
              {destination.label}
            </span>
          ) : (
            <Link href={destination.href} key={destination.id}>
              {destination.label}
            </Link>
          ),
        )}
      </nav>
    </header>
  );
}
