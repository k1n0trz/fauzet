import Link from "next/link";
import type { GameResult } from "../../../lib/games-api";

export function GameResultView({
  result,
  provisionalScore,
  onAgain,
}: {
  result: GameResult;
  provisionalScore: number;
  onAgain: () => void;
}) {
  const posted = result.status === "POSTED";
  const rejected = result.status === "REJECTED";
  const displayedScore = result.score ?? provisionalScore;
  return (
    <section className="gameStage gameResult" role="status">
      <span className="gameResultIcon" aria-hidden="true">
        {posted ? "🏁" : rejected ? "⚠️" : "⌛"}
      </span>
      <div className="eyebrow">
        {posted
          ? "Sesión validada"
          : rejected
            ? "Sesión rechazada"
            : "Validación en curso"}
      </div>
      <h1>
        {displayedScore} puntos
        {result.score === null ? " provisionales" : ""}
      </h1>
      {posted && result.transactionId && result.reward ? (
        <div className="validatedReward">
          +{result.reward.minorUnits} {result.reward.asset}
          <small>Destino confirmado: {bucketLabel(result.reward.bucket)}</small>
        </div>
      ) : (
        <p className="gameResultMessage">{resultMessage(result)}</p>
      )}
      {result.reasonCode ? (
        <code className="reasonCode">Motivo: {result.reasonCode}</code>
      ) : null}
      <small>Reglas económicas v{result.configVersion}</small>
      <div className="gameResultActions">
        <Link className="button secondary" href="/app/games">
          Centro de juegos
        </Link>
        <button className="button" type="button" onClick={onAgain}>
          Jugar de nuevo
        </button>
      </div>
      <small>
        Solo una respuesta con recompensa y destino confirmados representa un
        movimiento económico. El navegador nunca acredita saldo.
      </small>
    </section>
  );
}

function resultMessage(result: GameResult) {
  if (result.status === "POSTED")
    return "La sesión cerró, pero falta el comprobante económico. Actualiza el estado antes de considerar cualquier crédito.";
  if (result.status === "REJECTED")
    return "La ronda no generó recompensa porque no superó la validación.";
  if (result.status === "HELD")
    return "La ronda quedó retenida para revisión. Aún no existe crédito.";
  return "El servidor sigue validando la ronda. Aún no existe crédito.";
}

function bucketLabel(bucket: string) {
  return (
    {
      AVAILABLE: "saldo disponible",
      PENDING: "saldo pendiente",
      PROMOTIONAL: "saldo promocional",
    }[bucket] ?? bucket
  );
}
