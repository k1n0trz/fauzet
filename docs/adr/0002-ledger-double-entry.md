# ADR 0002: Ledger inmutable de doble partida

## Estado

Aceptado — 2026-07-12.

## Decisión

Cada movimiento económico se registra como una transacción con dos o más postings cuya suma por activo es cero. Los balances se derivan de postings. Un error se corrige mediante una transacción compensatoria.

## Invariantes

- Idempotency key única.
- Source type, source id y tipo de operación únicos.
- Postings balanceados por activo.
- Sin edición ni borrado de transacciones posteadas.
- Owner Wallet aislada de obligaciones de usuarios y tesorería restringida.
