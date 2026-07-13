# Fauzet / ZYXE

Plataforma gamificada de micro-recompensas con una economía interna auditable. ZYXE comienza como unidad interna no transferible; las funciones de valor externo están deshabilitadas por defecto.

## Estado

La beta cerrada ejecutable ya incluye web Next.js, API Fastify, PostgreSQL/Prisma, autenticación persistente, siete buckets por usuario, ledger de doble partida, faucet, juegos, misiones, tienda, minería virtual, Mining Crew de cuatro niveles y conversiones/retiros sandbox server-authoritative. El diagnóstico y la secuencia completa permanecen en `DIAGNOSTICO-Y-ROADMAP.md`.

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

La liquidación diaria de minería se ejecuta únicamente para un período UTC ya cerrado; sin argumento usa ayer:

```powershell
corepack pnpm mining:settle -- 2026-07-11
```

El worker de revisión de Crew libera en lotes las comisiones cuyo período de revisión terminó; mientras el gate monetario esté cerrado devuelve un lote vacío:

```powershell
corepack pnpm referrals:release -- 100
```

El primer rol administrativo se concede sólo mediante una operación explícita y auditada sobre una cuenta activa y verificada:

```powershell
$env:ADMIN_EMAIL='admin@example.com'
$env:ADMIN_ROLE='SUPERADMIN'
$env:ADMIN_REASON='Bootstrap inicial aprobado por el propietario'
corepack pnpm admin:grant
```

- Web: http://localhost:3000
- API: http://localhost:4000
- Health: http://localhost:4000/health
- Mailpit: http://localhost:8025
- PostgreSQL: localhost:55432 (aislado para no colisionar con otras instancias locales)

El navegador consume `/api/v1/*` en el mismo origen del frontend; Next.js lo reenvía a `API_ORIGIN`. En Vercel esta variable debe apuntar a la URL HTTPS de la API en Cloud Run.

La configuración reproducible y el checklist de publicación del frontend están en [`docs/deployment/vercel.md`](docs/deployment/vercel.md).

`TRUST_PROXY_HOPS` queda en `0` por defecto. En un despliegue debe configurarse con el número exacto de proxies confiables verificado para esa topología; la API nunca confía de forma abierta en cualquier `X-Forwarded-For`.

En `production` la API exige `DATABASE_URL`, orígenes HTTPS, un `SESSION_SECRET` único y un relay SMTP explícito con `SMTP_USER`/`SMTP_PASSWORD`. Para el correo debe elegirse un solo modo cifrado: `SMTP_SECURE=true` para TLS implícito (normalmente puerto 465), o `SMTP_REQUIRE_TLS=true` para STARTTLS obligatorio (normalmente 587). Los gates reales de dinero, retiros y trading fallan cerrados mientras esas integraciones no existan.

## Verificación

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm audit --prod --audit-level high
```

La integración persistente se ejecuta contra PostgreSQL con `RUN_INTEGRATION=true`; CI crea una base aislada, aplica migraciones, carga las cuentas del sistema y cubre registro, verificación, bono promocional, contabilización, reverso, restablecimiento de contraseña, faucet, juegos firmados y claims de misiones.

## Capacidades actuales

- Sesiones opacas en cookie HttpOnly, revocación y rechazo de cuentas suspendidas/cerradas.
- Verificación de email y restablecimiento de contraseña mediante tokens HMAC de un solo uso.
- Emails locales visibles en Mailpit; transporte SMTP configurable por entorno.
- Bono de bienvenida promocional idempotente al verificar la cuenta.
- Ledger transaccional `SERIALIZABLE`, balanceado por activo, con clave de idempotencia y reversos compensatorios.
- Faucet con challenges de un solo uso, cooldown, dispositivo vinculado a sesión, límites de cuenta/dispositivo/IP, presupuesto UTC, racha y acreditación atómica al ledger.
- Tap Miner y Memory Drops con energía regenerable, sesiones firmadas, secuencia e idempotencia de eventos, validación temporal y recompensas calculadas exclusivamente por el servidor.
- Misiones derivadas de claims y recompensas realmente posteadas, con períodos UTC, claim explícito e idempotente, presupuesto propio y acreditación atómica.
- Tienda con catálogo versionado, cobro promocional primero, split contable 40/40/20, límites y efectos aplicados en una sola transacción.
- Minería virtual sin PoW, energía separada de juegos, mineros persistentes, boosts, mejoras, reparaciones y contribución ponderada por tiempo.
- Liquidación minera UTC idempotente: un asiento global pool→usuarios, redondeo hacia abajo con residuo explícito y bloqueo sin pagos parciales si el pool no está completamente respaldado.
- Mining Crew con código por usuario, atribución inmutable al registro y árbol materializado L1-L4; no paga por reclutamiento ni expone emails del downline.
- Motor de comisiones 5/2/1/0,5% con allowlist de actividad monetizable, cap mensual, pending→available y clawback. El pago permanece detrás de `LEGAL_AND_REVENUE_GATE`; el seed no financia el pool de referidos con emisión.
- Consola `/admin` con reautenticación de contraseña separada por diez minutos, RBAC por endpoint y vistas reales de overview, usuarios, riesgo, ledger y auditoría.
- Cambios administrativos de estado/riesgo con motivo obligatorio, before/after, request ID, revocación de sesiones al suspender y bloqueo de autoacciones o cambios directos sobre Owner/Superadmin.
- `AuditEvent` y `RiskSignal` protegidos por triggers append-only; el admin no ofrece edición directa de saldos ni puede habilitar dinero real, retiros o trading.
- Laboratorio `/app/convert` con cotización de 120 segundos, reserva `ELIGIBLE→RESERVED`, destinos sandbox con cooldown de 24 horas y cancelación compensatoria.
- Retiro ficticio protegido por contraseña más OTP email de un solo uso; score bajo confirma con txid sandbox, score medio entra a revisión humana y score alto libera la reserva.
- Cola administrativa de retiros sandbox para `FRAUD`, `FINANCE` y `SUPERADMIN`, con motivo, auditoría, decisión concurrente exact-once y liquidación `RESERVED→WITHDRAWN` o devolución `RESERVED→ELIGIBLE`.
- Las direcciones, tasas y txid sandbox no tienen valor externo ni realizan broadcast; `WITHDRAWALS_ENABLED=false` sigue siendo independiente.
- Readiness real de PostgreSQL, cierre ordenado y soporte de proxy confiable para Cloud Run.

## Seguridad económica

- Los balances son proyecciones del ledger; nunca campos editables.
- Toda transacción posteada debe sumar cero por activo.
- Reversos crean asientos compensatorios.
- Owner Wallet no puede debitar fondos de usuarios, rewards, liquidez o seguridad.
- Retiros reales, trading y dinero real permanecen deshabilitados hasta superar sus gates; sólo está habilitado el adaptador de simulación.
