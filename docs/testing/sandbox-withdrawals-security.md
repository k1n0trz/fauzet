# Matriz de seguridad: conversiones y retiros sandbox

## Controles verificados

- Sólo cuentas activas y con email verificado pueden cotizar o retirar.
- La cotización expira en 120 segundos y sólo puede consumirse una vez.
- Dos confirmaciones concurrentes reservan una sola vez.
- El ledger conserva `ELIGIBLE + RESERVED + WITHDRAWN` y cada movimiento suma cero.
- Un destino sólo acepta formato `sandbox:*`, máximo cinco activos y cooldown de 24 horas.
- El retiro exige contraseña y OTP email de un solo uso ligado a usuario, conversión y destino.
- Sólo puede existir un OTP activo por conversión y destino; cada reemplazo invalida el anterior y cinco intentos incorrectos consumen el reto.
- Reintentos concurrentes de retiro producen una liquidación y un replay.
- Riesgo medio conserva la reserva para revisión; riesgo alto la libera atómicamente.
- La revisión administrativa requiere permiso y motivo; antes de aprobar vuelve a validar cuenta activa, correo verificado y riesgo menor de 70 bajo lock. Decisión y auditoría son atómicas.
- Cancelación y rechazo usan asientos compensatorios, nunca edición de balance.
- PostgreSQL impide borrar cotizaciones, conversiones, retiros y challenges.
- `WITHDRAWALS_ENABLED=false`; no existen llamadas de red blockchain ni credenciales de firma.

## Pruebas

La integración persistente cubre expiración, idempotencia, serialización concurrente, límite concurrente de destinos, cooldown, contraseña incorrecta, agotamiento y reemplazo de OTP, autoaprobación, revisión, cancelación, rechazo, revalidación y aprobación administrativa concurrente, conservación de buckets y triggers append-only.
