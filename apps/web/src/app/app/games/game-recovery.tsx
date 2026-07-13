import Link from "next/link";

export function GameRecovery({
  message,
  recovering,
  canDiscard,
  onRecover,
  onDiscard,
}: {
  message: string;
  recovering: boolean;
  canDiscard: boolean;
  onRecover: () => void;
  onDiscard: () => void;
}) {
  return (
    <section className="gameStage gameRecovery" role="alert">
      <span aria-hidden="true">↻</span>
      <div className="eyebrow">Recuperación segura</div>
      <h1>No perderemos el estado del servidor</h1>
      <p>{message}</p>
      <button
        className="button"
        type="button"
        disabled={recovering}
        onClick={onRecover}
      >
        {recovering ? "Recuperando…" : "Recuperar sesión"}
      </button>
      {canDiscard ? (
        <div className="discardGameState">
          <p>
            Descarta únicamente la copia local si la sesión expiró o ya no puede
            verificarse. Esto no reembolsa energía ni altera el ledger.
          </p>
          <button type="button" disabled={recovering} onClick={onDiscard}>
            Descartar estado local
          </button>
        </div>
      ) : null}
      <Link className="textButton" href="/app/games">
        Volver al catálogo
      </Link>
    </section>
  );
}
