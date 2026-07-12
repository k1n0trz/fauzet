# Fauzet / ZYXE

Plataforma gamificada de micro-recompensas con una economía interna auditable. ZYXE comienza como unidad interna no transferible; las funciones de valor externo están deshabilitadas por defecto.

## Estado

La construcción parte de los prototipos en `frontend/` y de los documentos canónicos en `data/`. El diagnóstico y la secuencia completa están en `DIAGNOSTICO-Y-ROADMAP.md`.

## Inicio local

Requisitos: Node.js 22+, pnpm 11 y Docker Desktop.

```powershell
Copy-Item .env.example .env
docker compose up -d
corepack pnpm install
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000
- Health: http://localhost:4000/health
- Mailpit: http://localhost:8025

## Verificación

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## Seguridad económica

- Los balances son proyecciones del ledger; nunca campos editables.
- Toda transacción posteada debe sumar cero por activo.
- Reversos crean asientos compensatorios.
- Owner Wallet no puede debitar fondos de usuarios, rewards, liquidez o seguridad.
- Retiros, trading y dinero real permanecen deshabilitados hasta superar sus gates.
