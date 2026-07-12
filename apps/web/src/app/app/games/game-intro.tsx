import Image from "next/image";
import Link from "next/link";
import type {
  GameCatalogItem,
  GameRules,
  GameSlug,
} from "../../../lib/games-api";

export function GameIntro({
  slug,
  title,
  description,
  rules,
  game,
  loading,
  starting,
  allowReservationRetry = false,
  onStart,
}: {
  slug: GameSlug;
  title: string;
  description: string;
  rules: GameRules;
  game: GameCatalogItem | null;
  loading: boolean;
  starting: boolean;
  allowReservationRetry?: boolean;
  onStart: () => void;
}) {
  const available = game?.state === "AVAILABLE" || allowReservationRetry;
  return (
    <section className="gameStage gameIntro" aria-busy={starting}>
      <Image
        className="gameIntroImage"
        src={
          slug === "tap-miner"
            ? "/rewards/game-tap.png"
            : "/rewards/game-memory.png"
        }
        width={150}
        height={150}
        alt=""
        priority
      />
      <div className="eyebrow">Sesión firmada</div>
      <h1>{title}</h1>
      <p>{description}</p>
      <dl className="gameIntroFacts">
        <div>
          <dt>Energía</dt>
          <dd>⚡ {rules.energyCost}</dd>
        </div>
        <div>
          <dt>Duración</dt>
          <dd>{rules.durationSeconds}s</dd>
        </div>
        <div>
          <dt>Rango posible</dt>
          <dd>
            {rules.reward.minMinorUnits}–{rules.reward.maxMinorUnits}{" "}
            {rules.reward.asset}
          </dd>
        </div>
      </dl>
      <button
        className="button gameStartButton"
        type="button"
        disabled={!available || loading || starting}
        onClick={onStart}
      >
        {starting
          ? "Reservando sesión…"
          : allowReservationRetry
            ? "Recuperar reserva"
            : availabilityLabel(game, loading)}
      </button>
      <small>
        La energía se reserva en el servidor. El score y la recompensa mostrados
        durante la ronda son provisionales.
      </small>
      <Link className="textButton" href="/app/games">
        Volver al centro de juegos
      </Link>
    </section>
  );
}

function availabilityLabel(game: GameCatalogItem | null, loading: boolean) {
  if (loading) return "Consultando disponibilidad…";
  if (!game) return "No disponible";
  if (game.state === "AVAILABLE") return "Comenzar";
  if (game.state === "LOW_ENERGY") return "Energía insuficiente";
  if (game.state === "DAILY_LIMIT") return "Límite diario alcanzado";
  if (game.state === "DEVICE_LIMIT") return "Límite del dispositivo";
  if (game.state === "IP_LIMIT") return "Límite de red";
  if (game.state === "ACTIVE_SESSION") return "Sesión activa pendiente";
  if (game.state === "COOLDOWN") return "En cooldown";
  if (game.state === "RISK_BLOCKED") return "Revisión de seguridad";
  return "Juego deshabilitado";
}
