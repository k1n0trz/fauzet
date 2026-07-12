"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type {
  GameCatalogItem,
  GameCategory,
  GameSlug,
} from "../../../lib/games-api";
import { useGameCatalog } from "./use-game-catalog";

type Filter = "all" | GameCategory;

const filters = [
  { id: "all", label: "Todos" },
  { id: "quick", label: "Rápidos" },
  { id: "skill", label: "Habilidad" },
  { id: "daily", label: "Desafío diario" },
  { id: "premium", label: "Premium" },
] as const;

export function GamesHub() {
  const { catalog, loading, error, refresh } = useGameCatalog();
  const [filter, setFilter] = useState<Filter>("all");
  const games =
    catalog?.games.filter(
      (game) => filter === "all" || game.category === filter,
    ) ?? [];

  return (
    <section className="rewardsPage" aria-labelledby="games-title">
      <div className="rewardsPageHeading">
        <div>
          <div className="eyebrow">Actividad validada</div>
          <h1 className="rewardsTitle" id="games-title">
            Centro de juegos
          </h1>
          <p className="lead">
            Tus puntos son provisionales hasta que el servidor valide la sesión
            completa. No existe crédito calculado por el navegador.
          </p>
        </div>
        <EnergyMeter
          current={catalog?.energy.current ?? null}
          max={catalog?.energy.max ?? 100}
          regeneratesAt={catalog?.energy.regeneratesAt ?? null}
          loading={loading}
        />
      </div>

      <div className="rewardFilters" role="group" aria-label="Filtrar juegos">
        {filters.map((item) => (
          <button
            className={filter === item.id ? "active" : ""}
            type="button"
            aria-pressed={filter === item.id}
            key={item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && !catalog ? <CatalogLoading /> : null}
      {error ? (
        <div className="rewardError" role="alert">
          <strong>No pudimos cargar el catálogo.</strong>
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>
            Reintentar
          </button>
        </div>
      ) : null}
      {!loading && !error && games.length === 0 ? (
        <div className="rewardEmpty">
          No hay juegos disponibles en esta categoría.
        </div>
      ) : null}

      <div className="gameCatalog">
        {games.map((game) => (
          <GameCard game={game} key={game.slug} />
        ))}
      </div>

      <aside className="faucetPolicy">
        <strong>Recompensas variables.</strong> Cada sesión usa reglas
        versionadas, límites diarios y controles de dispositivo y riesgo. Una
        ronda puede quedar en validación, retención o rechazo sin generar saldo.
      </aside>
    </section>
  );
}

function EnergyMeter({
  current,
  max,
  regeneratesAt,
  loading,
}: {
  current: number | null;
  max: number;
  regeneratesAt: string | null;
  loading: boolean;
}) {
  const value = current ?? 0;
  return (
    <article className="energyCard" aria-busy={loading}>
      <Image src="/rewards/ic-energy.png" width={46} height={46} alt="" />
      <div>
        <span>Energía disponible</span>
        <strong>{current == null ? "—" : `${current}/${max}`}</strong>
        {regeneratesAt ? (
          <small>Próxima unidad: {formatEnergyTime(regeneratesAt)}</small>
        ) : null}
      </div>
      <progress
        value={value}
        max={max}
        aria-label={`${value} de ${max} energía`}
      />
    </article>
  );
}

function formatEnergyTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "por confirmar";
  return new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function GameCard({ game }: { game: GameCatalogItem }) {
  const available = game.state === "AVAILABLE";
  return (
    <article className="gameCard">
      <div className={`gameArt gameArt-${game.slug}`}>
        <Image src={gameAsset(game.slug)} width={130} height={130} alt="" />
      </div>
      <div className="gameCardBody">
        <div className="gameCardTitle">
          <h2>{game.name}</h2>
          <span>{game.difficulty}</span>
        </div>
        <p>{game.description}</p>
        <dl className="gameFacts">
          <div>
            <dt>Energía</dt>
            <dd>⚡ {game.rules.energyCost}</dd>
          </div>
          <div>
            <dt>Duración</dt>
            <dd>{game.rules.durationSeconds}s</dd>
          </div>
          <div>
            <dt>Rango</dt>
            <dd>
              {game.rules.reward.minMinorUnits}–
              {game.rules.reward.maxMinorUnits} {game.rules.reward.asset}
            </dd>
          </div>
        </dl>
        <div className="gameBest">
          Tu mejor: {game.bestScore == null ? "—" : game.bestScore}
        </div>
        {available ? (
          <Link className="button gameCta" href={`/app/games/${game.slug}`}>
            Jugar
          </Link>
        ) : (
          <div className="gameBlocked" role="status">
            {availabilityLabel(game)}
          </div>
        )}
      </div>
    </article>
  );
}

function CatalogLoading() {
  return (
    <div className="catalogLoading" role="status">
      <span className="faucetSpinner" aria-hidden="true" />
      Consultando energía, límites y juegos…
    </div>
  );
}

function gameAsset(slug: GameSlug) {
  return slug === "tap-miner"
    ? "/rewards/game-tap.png"
    : "/rewards/game-memory.png";
}

function availabilityLabel(game: GameCatalogItem) {
  if (game.state === "LOW_ENERGY") return "Energía insuficiente";
  if (game.state === "DAILY_LIMIT") return "Límite diario alcanzado";
  if (game.state === "DEVICE_LIMIT") return "Límite del dispositivo";
  if (game.state === "IP_LIMIT") return "Límite de red";
  if (game.state === "ACTIVE_SESSION") return "Sesión activa pendiente";
  if (game.state === "COOLDOWN") return "En cooldown";
  if (game.state === "RISK_BLOCKED") return "Revisión de seguridad";
  return "No disponible";
}
