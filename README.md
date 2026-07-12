# Fauzet / ZYXE

Plataforma gamificada de micro-recompensas con una economía interna auditable. ZYXE comienza como unidad interna no transferible; las funciones de valor externo están deshabilitadas por defecto.

## Estado

La fundación ejecutable ya incluye web Next.js, API Fastify, PostgreSQL/Prisma, autenticación persistente, verificación de email, recuperación de contraseña, siete buckets por usuario, ledger de doble partida y faucet server-authoritative. El diagnóstico y la secuencia completa permanecen en `DIAGNOSTICO-Y-ROADMAP.md`.

## Inicio local

Requisitos: Node.js 22+, pnpm 11 y Docker Desktop.

```powershell
Copy-Item .env.example .env
docker compose up -d
corepack pnpm install
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000
- Health: http://localhost:4000/health
- Mailpit: http://localhost:8025
- PostgreSQL: localhost:55432 (aislado para no colisionar con otras instancias locales)

El navegador consume `/api/v1/*` en el mismo origen del frontend; Next.js lo reenvía a `API_ORIGIN`. En Vercel esta variable debe apuntar a la URL HTTPS de la API en Cloud Run.

`TRUST_PROXY_HOPS` queda en `0` por defecto. En un despliegue debe configurarse con el número exacto de proxies confiables verificado para esa topología; la API nunca confía de forma abierta en cualquier `X-Forwarded-For`.

## Verificación

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm audit --prod --audit-level high
```

La integración persistente se ejecuta contra PostgreSQL con `RUN_INTEGRATION=true`; CI crea una base aislada, aplica migraciones, carga las cuentas del sistema y cubre registro, verificación, bono promocional, contabilización, reverso y restablecimiento de contraseña.

## Capacidades actuales

- Sesiones opacas en cookie HttpOnly, revocación y rechazo de cuentas suspendidas/cerradas.
- Verificación de email y restablecimiento de contraseña mediante tokens HMAC de un solo uso.
- Emails locales visibles en Mailpit; transporte SMTP configurable por entorno.
- Bono de bienvenida promocional idempotente al verificar la cuenta.
- Ledger transaccional `SERIALIZABLE`, balanceado por activo, con clave de idempotencia y reversos compensatorios.
- Faucet con challenges de un solo uso, cooldown, dispositivo vinculado a sesión, límites de cuenta/dispositivo/IP, presupuesto UTC, racha y acreditación atómica al ledger.
- Readiness real de PostgreSQL, cierre ordenado y soporte de proxy confiable para Cloud Run.

## Seguridad económica

- Los balances son proyecciones del ledger; nunca campos editables.
- Toda transacción posteada debe sumar cero por activo.
- Reversos crean asientos compensatorios.
- Owner Wallet no puede debitar fondos de usuarios, rewards, liquidez o seguridad.
- Retiros, trading y dinero real permanecen deshabilitados hasta superar sus gates.
