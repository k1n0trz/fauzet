# Despliegue web en Vercel

Este runbook publica únicamente el frontend Next.js. La API debe estar desplegada y saludable antes de construir el frontend porque el destino del proxy queda fijado durante el build.

## Configuración del proyecto

Al importar el repositorio de GitHub en Vercel:

1. Seleccionar `apps/web` como **Root Directory**.
2. Mantener habilitada la opción **Include source files outside of the Root Directory**. El frontend depende de `packages/contracts` y del lockfile/workspace de la raíz.
3. Usar el preset **Next.js** y Node.js 22.x.
4. No sobrescribir Install Command, Build Command ni Output Directory en el panel. `apps/web/vercel.json` instala el workspace con pnpm 11 mediante Corepack y ejecuta Turbo para construir también las dependencias del frontend. La salida conserva el valor predeterminado de Next.js.
5. Activar **Skip deployments when there are no changes** si el proyecto ya está conectado al monorepo.

## Variables de Vercel

Configurar las variables para Production y, si se usarán previews funcionales, también para Preview:

| Variable                       | Ejemplo seguro                            | Alcance | Secreto |
| ------------------------------ | ----------------------------------------- | ------- | ------- |
| `API_ORIGIN`                   | `https://<servicio-api>.<region>.run.app` | Build   | No      |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1`                                       | Build   | No      |

`API_ORIGIN` debe ser únicamente el origen HTTPS: sin `/v1`, credenciales, query ni fragmento; un slash final se normaliza. No debe llamarse `NEXT_PUBLIC_API_ORIGIN`; el navegador consume `/api/v1/*` en el dominio de Vercel y el rewrite server-side lo reenvía a Cloud Run. No hay secretos del backend que deban copiarse a Vercel.

Al cambiar `API_ORIGIN`, crear un nuevo deployment: los rewrites se generan durante el build.

## Acoplamiento con la API

Antes del primer deployment de producción, comprobar en Cloud Run:

- `WEB_ORIGIN=https://<dominio-web>` y `APP_BASE_URL=https://<dominio-web>` usan el dominio canónico sin slash final.
- `NODE_ENV=production` para emitir cookies `Secure`.
- `TRUST_PROXY_HOPS` representa exactamente la topología validada del servicio.
- `GET https://<origen-api>/health/ready` responde `200`.

Las previews mantienen su propio cookie host-only gracias al proxy de mismo origen. Los enlaces enviados por email continúan usando el `APP_BASE_URL` canónico del backend.

## Dominio y validación

1. Asociar el dominio existente al deployment de Production y elegir un único dominio canónico.
2. Esperar que Vercel confirme DNS y TLS.
3. Abrir la portada y `/app`; confirmar que no hay errores de consola ni contenido mixto.
4. Registrar y verificar una cuenta de prueba, cerrar y volver a iniciar sesión.
5. Confirmar que `/api/v1/me` devuelve `200` con la sesión iniciada y `401` después de cerrar sesión.
6. Probar `/app/convert` y `/admin` sólo con cuentas de prueba y manteniendo `WITHDRAWALS_ENABLED=false`, `REAL_MONEY_ENABLED=false` y `TRADING_ENABLED=false` en la API.

## Rollback

Promover el último deployment sano desde Vercel. Si el incidente proviene de la API, restaurar primero la revisión sana de Cloud Run y luego reconstruir Vercel si cambió `API_ORIGIN`. No desactivar los gates monetarios como parte de una recuperación.
