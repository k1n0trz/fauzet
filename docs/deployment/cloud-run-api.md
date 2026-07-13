# API y jobs en Google Cloud Run

Este runbook prepara dos imágenes a partir de `Dockerfile.api`:

- `api`: servidor Fastify y los workers compilados de minería y referidos. No contiene `tsx`, TypeScript, Turbo, Vitest ni Prisma CLI.
- `migrations`: ejecutor de `prisma migrate deploy` aislado. No sirve tráfico HTTP.

Los dos targets usan Node.js 22.23.1, pnpm 11.7.0, el lockfile congelado y un usuario Linux sin privilegios. La imagen base oficial está fijada por digest.

## Construcción local

Desde la raíz del repositorio:

```powershell
docker build --file Dockerfile.api --target api --tag fauzet-api:local .
docker build --file Dockerfile.api --target migrations --tag fauzet-migrations:local .
```

Los workers se ejecutan desde JavaScript compilado, sin dependencias de desarrollo:

```powershell
docker run --rm --entrypoint node fauzet-api:local --check dist/scripts/settle-mining.js
docker run --rm --entrypoint node fauzet-api:local --check dist/scripts/release-referrals.js
docker run --rm --entrypoint ./node_modules/.bin/prisma fauzet-migrations:local --version
```

## Artefactos en Artifact Registry

Los nombres siguientes son variables deliberadamente vacías; no se deben guardar IDs reales, URLs de base de datos ni secretos en Git:

```powershell
$PROJECT_ID='<gcp-project-id>'
$REGION='<gcp-region>'
$REPOSITORY='<artifact-registry-repository>'
$RELEASE='<immutable-release-id>'
$API_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/fauzet-api:$RELEASE"
$MIGRATIONS_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/fauzet-migrations:$RELEASE"

gcloud builds submit --project $PROJECT_ID --region $REGION `
  --config infra/cloud-run/cloudbuild.yaml `
  --substitutions "_REGION=$REGION,_REPOSITORY=$REPOSITORY,_RELEASE=$RELEASE" .
```

`infra/cloud-run/cloudbuild.yaml` construye y publica ambos targets. Nunca reutilizar un tag mutable para una promoción o rollback.

## Identidades y secretos

Usar cuentas de servicio distintas y sin claves descargadas:

- API: acceso de cliente a Cloud SQL y lectura únicamente de sus secretos.
- Migraciones: acceso de cliente a Cloud SQL y lectura de `DATABASE_URL`; no necesita permiso para servir o desplegar revisiones.
- Jobs económicos: acceso de cliente a Cloud SQL y lectura de `DATABASE_URL`; no necesitan invocar la API ni administrar Cloud Run.
- Scheduler: permiso para ejecutar únicamente el job correspondiente.

Guardar `DATABASE_URL`, `SESSION_SECRET`, `SMTP_USER` y `SMTP_PASSWORD` en Secret Manager. Con Cloud SQL, la URL debe usar el mecanismo de conexión elegido y TLS cuando corresponda. No pasar secretos con `--set-env-vars`, no incrustarlos en la imagen y no reutilizarlos entre staging y producción.

## Migraciones

Crear un Cloud Run Job con el target `migrations`. La imagen ya define este comando:

```text
prisma migrate deploy --schema=node_modules/@fauzet/database/prisma/schema.prisma
```

Ejecutarlo antes de dirigir tráfico a una revisión que dependa del nuevo esquema. Debe terminar con código `0`; si falla, no desplegar la API. `migrate deploy` es reintentable, pero las migraciones destructivas siguen requiriendo respaldo, revisión y un plan expand/contract.

## Servicio API

Cloud Run inyecta `PORT`; Fauzet lo usa si no se define `API_PORT`. No establecer `API_PORT` en Cloud Run salvo que exista una razón operativa explícita. La imagen usa `PORT=8080` sólo como valor local y Cloud Run puede sobrescribirlo.

Variables no secretas mínimas:

| Variable                          | Valor esperado                                               |
| --------------------------------- | ------------------------------------------------------------ |
| `NODE_ENV`                        | `production`                                                 |
| `WEB_ORIGIN`                      | origen HTTPS canónico de Vercel, sin slash final             |
| `APP_BASE_URL`                    | origen HTTPS canónico de Vercel, sin slash final             |
| `EMAIL_FROM`                      | remitente validado                                           |
| `SMTP_HOST`, `SMTP_PORT`          | relay privado o proveedor autorizado; ambos son obligatorios |
| `SMTP_USER`, `SMTP_PASSWORD`      | referencias a secretos; ambos son obligatorios               |
| `SMTP_SECURE`, `SMTP_REQUIRE_TLS` | exactamente uno en `true`, según TLS implícito o STARTTLS    |
| `TRUST_PROXY_HOPS`                | cantidad exacta de proxies validada con la topología real    |
| `REAL_MONEY_ENABLED`              | `false`                                                      |
| `WITHDRAWALS_ENABLED`             | `false`                                                      |
| `TRADING_ENABLED`                 | `false`                                                      |
| `SANDBOX_WITHDRAWALS_ENABLED`     | `true` sólo en el laboratorio aprobado                       |
| `FIAT_CATALOG_ENABLED`            | `true` para el catálogo informativo COP                      |
| `FIAT_SANDBOX_CHECKOUT_ENABLED`   | `false`; el checkout todavía no está implementado            |
| `FIAT_SANDBOX_ACTIVATION_ENABLED` | `false`; ningún producto fiat puede generar recompensas      |

La configuración de producción rechaza el arranque si faltan `DATABASE_URL`, los orígenes HTTPS, un `SESSION_SECRET` único o el transporte SMTP autenticado y cifrado. También impide iniciar si cualquiera de los tres gates de valor real está en `true`. En esta fase igualmente impide habilitar checkout o activación fiat; publicar el catálogo no autoriza cobros.

No usar `--allow-unauthenticated` por inercia. Si Vercel reenvía directamente a una API pública, limitar CORS al dominio canónico, mantener rate limits y aplicar Cloud Armor o un gateway según el modelo de exposición. Si se usa autenticación IAM entre Vercel y Cloud Run, el proxy web deberá emitir el token correspondiente.

Configurar la sonda de startup/readiness sobre `/health/ready` y la de liveness sobre `/health`. La primera comprueba PostgreSQL y debe responder `200` antes de promover tráfico.

## Jobs de minería y referidos

Los jobs reutilizan el target `api`, pero sobrescriben comando y argumentos:

```text
node dist/scripts/settle-mining.js
node dist/scripts/release-referrals.js 100
```

El cierre minero sin argumento liquida ayer UTC. Programarlo después del cambio de día UTC y permitir catch-up; el advisory lock y la idempotencia persistida evitan doble liquidación. El worker de referidos procesa lotes y puede ejecutarse periódicamente; mientras el gate legal/económico esté cerrado devuelve un lote vacío.

Cloud Scheduler debe invocar la API `jobs.run` con OAuth mediante una cuenta que sólo tenga permiso sobre el job específico. Definir timeout, reintentos y concurrencia en cada job; no superponer ejecuciones deliberadamente aunque el dominio sea reintentable.

## Orden de promoción y rollback

1. Construir ambos targets con el mismo ID inmutable de release.
2. Ejecutar migraciones y exigir salida `0`.
3. Desplegar una revisión API sin tráfico y comprobar `/health` y `/health/ready`.
4. Hacer smoke test de autenticación y ledger con una cuenta de prueba.
5. Promover tráfico gradualmente y vigilar errores, latencia, conexiones de base de datos y fallos SMTP.
6. Crear/actualizar los jobs con la misma imagen aprobada.

Para rollback, dirigir tráfico a la revisión API anterior. No revertir una migración aplicada automáticamente: usar cambios compatibles expand/contract o una migración correctiva revisada.
