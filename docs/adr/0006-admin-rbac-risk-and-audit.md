# ADR 0006: plano administrativo, RBAC, riesgo y auditoría append-only

## Estado

Aceptado para beta cerrada.

## Decisión

La consola administrativa vive en `/admin`, pero toda autorización ocurre de nuevo en la API. Una sesión normal no basta: el operador debe revalidar su contraseña y recibe una sesión administrativa opaca, ligada a la sesión base y limitada a diez minutos.

Los roles `SUPPORT`, `CONTENT`, `FRAUD`, `FINANCE`, `AUDITOR`, `SUPERADMIN` y `OWNER` se traducen a permisos mínimos por endpoint. La interfaz sólo oculta capacidades que el rol no posee; el backend vuelve a comprobar cada permiso.

Los cambios de estado y riesgo:

- requieren motivo de al menos diez caracteres;
- guardan actor, request ID, IP en hash, before/after y fecha;
- ocurren en una transacción `SERIALIZABLE`;
- revocan sesiones normales y administrativas al suspender;
- impiden autoacciones;
- impiden modificar `OWNER` o `SUPERADMIN` hasta implementar maker-checker.

`AuditEvent` y `RiskSignal` son append-only mediante triggers PostgreSQL. La consola no tiene endpoint de ajuste de saldo. Cualquier corrección económica futura deberá usar un asiento de doble partida con aprobación separada.

## Bootstrap

No se incluye una contraseña administrativa por defecto. `pnpm admin:grant` exige email, rol y motivo, sólo opera sobre una cuenta activa/verificada y deja un evento de auditoría del sistema.

## Límites actuales

La reautenticación usa contraseña y cookie aislada; TOTP/WebAuthn y maker-checker son gates pendientes antes de cualquier operación de dinero real u Owner Wallet. Los flags de dinero real, retiros y trading permanecen forzados a `false`.
