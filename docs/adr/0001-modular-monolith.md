# ADR 0001: Monolito modular para el MVP

## Estado

Aceptado — 2026-07-12.

## Decisión

Construir una API Fastify modular sobre PostgreSQL y Redis, con una aplicación Next.js independiente. Ledger, economía, rewards y administración permanecen en el mismo límite transaccional durante el MVP.

## Consecuencias

- Las invariantes de doble partida se garantizan en una única transacción de base de datos.
- Los módulos se separan por interfaces y eventos, no por red.
- Notificaciones, risk scoring y blockchain signer podrán extraerse cuando el volumen o aislamiento lo justifique.
