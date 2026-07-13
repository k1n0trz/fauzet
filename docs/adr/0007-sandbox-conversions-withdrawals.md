# ADR 0007: conversiones y retiros sandbox sin valor externo

## Estado

Aceptado para beta cerrada.

## Decisión

La beta implementa el recorrido económico completo sin custodia, blockchain, dinero ni cripto real. Los únicos activos externos admitidos son `SANDBOX_LTC` y `SANDBOX_DOGE`; sus tasas, direcciones y txid son ficticios y se presentan siempre como simulación.

El flujo server-authoritative es:

1. una cuenta activa y verificada solicita una cotización de 120 segundos;
2. confirmar la cotización mueve ZYXE de `ELIGIBLE` a `RESERVED` mediante un asiento idempotente;
3. el destino sandbox debe haber cumplido 24 horas de cooldown;
4. el usuario revalida contraseña y un OTP email de seis dígitos, de un solo uso y ligado a conversión y destino; sólo uno puede estar activo y se consume tras cinco fallos;
5. riesgo menor de 40 se confirma automáticamente; 40–69 queda en `REVIEW`; 70 o más se rechaza;
6. aprobar mueve `RESERVED` a `WITHDRAWN`; rechazar o cancelar devuelve `RESERVED` a `ELIGIBLE` con un asiento compensatorio.

Cada mutación económica corre en aislamiento `SERIALIZABLE`, bloquea sus registros, conserva clave de idempotencia y reintenta conflictos de serialización. Cotizaciones, conversiones, retiros y challenges OTP no se pueden borrar físicamente.

## Revisión humana

`FRAUD`, `FINANCE` y `SUPERADMIN` pueden decidir elementos `REVIEW`. Toda decisión requiere motivo, guarda actor, request ID, IP hasheada, before/after y el identificador del asiento. Antes de aprobar se revalidan bajo lock el estado activo, el correo verificado y un riesgo menor de 70. Repetir concurrentemente la misma aprobación devuelve el mismo resultado sin segundo pago.

## Gate real

`SANDBOX_WITHDRAWALS_ENABLED` controla exclusivamente el laboratorio. `WITHDRAWALS_ENABLED` permanece en `false`; no existe signer, clave privada, proveedor de custodia ni broadcast en este adaptador. La integración real requiere aprobación legal, KYC/AML, tesorería respaldada, maker-checker, custodia aislada y observabilidad operativa.
