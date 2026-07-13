# Matriz de seguridad: Admin, RBAC, riesgo y auditoría

## Controles verificados

- Un usuario sin rol administrativo recibe `403` aun con sesión válida.
- Una contraseña incorrecta no crea sesión de step-up.
- La cookie administrativa es HttpOnly, `SameSite=Strict`, expira en diez minutos y queda ligada al hash de la sesión base.
- Cada endpoint vuelve a autenticar sesión base, sesión administrativa y permiso RBAC.
- Una suspensión incrementa `credentialVersion` y revoca todas las sesiones del objetivo.
- Un operador no puede cambiar su propio estado o riesgo.
- `OWNER` y `SUPERADMIN` no pueden modificarse sin el futuro flujo maker-checker.
- Los cambios manuales de riesgo crean `RiskSignal` y `AuditEvent` dentro de la misma transacción.
- Motivo, actor, request ID, IP hasheada y before/after quedan registrados.
- PostgreSQL rechaza `UPDATE` y `DELETE` sobre `AuditEvent` y `RiskSignal`.
- Ledger administrativo informa débitos/créditos y marca cualquier transacción no balanceada.
- Una aprobación de retiro sandbox revalida bajo lock que la cuenta siga activa, verificada y por debajo del umbral de rechazo; si no, no muta ledger ni estados.
- La consola no expone ajustes de saldo ni controles para dinero real, retiros reales o trading.
- `FRAUD`, `FINANCE` y `SUPERADMIN` pueden decidir únicamente retiros sandbox en `REVIEW`; toda decisión exige motivo y asiento exact-once.

## Pruebas

La integración persistente recorre login, step-up fallido/exitoso, overview, usuarios, ledger, cambio de riesgo, suspensión, revocación, autoacción rechazada, consulta de auditoría, intento de manipulación física y logout administrativo.
