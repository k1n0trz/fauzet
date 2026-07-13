export default function SwapPage() {
  return (
    <main className="appShell">
      <section className="settingsPage">
        <div className="eyebrow">Próxima fase · cerrado por seguridad</div>
        <h1 className="settingsTitle">Swap multi-activo</h1>
        <p className="lead">
          Aquí podrás cotizar intercambios entre ZYXE y activos aprobados. Se
          habilitará después de integrar custodia, liquidez, precios, KYC y
          límites por país.
        </p>
        <div className="settingsNotice">
          No existen swaps ni cobros de gas reales en esta beta. El ledger y los
          fondos externos permanecerán separados hasta completar los gates.
        </div>
      </section>
    </main>
  );
}
