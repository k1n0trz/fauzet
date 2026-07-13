# ADR 0005: atribución inmutable y comisiones de Mining Crew

## Estado

Aceptado para beta cerrada. La atribución está habilitada; las comisiones monetarias permanecen deshabilitadas por `LEGAL_AND_REVENUE_GATE`.

## Decisión

Cada usuario recibe un código aleatorio `FZ-*`. Un código opcional puede vincularse exclusivamente durante el registro. `ReferralEdge` conserva el sponsor directo y `ReferralAncestor` materializa hasta cuatro ancestros. Triggers PostgreSQL impiden actualizar o borrar perfiles, edges o ancestry: una atribución no puede reasignarse silenciosamente.

No existe recompensa por registro, depósito, faucet, juego, misión, minería ni por otra comisión. El motor acepta únicamente fuentes versionadas explícitamente (`REWARDED_AD`, `OFFERWALL`, `VALIDATED_PURCHASE`) después de una validación externa. Las tasas iniciales son L1 5%, L2 2%, L3 1% y L4 0,5%, siempre sobre una base monetizable, con floor entero y tope mensual por beneficiario.

Una actividad cualificada crea todas sus comisiones en una transacción `SERIALIZABLE`. El pool debe financiar el resultado completo: si no alcanza, no se crea actividad, comisión ni asiento parcial. Un asiento global mueve pool → buckets `PENDING`. Tras la ventana de revisión, otro asiento mueve `PENDING` → `AVAILABLE` solo para beneficiarios activos, verificados y dentro del umbral de riesgo; el resto queda `HELD`.

Un reverso usa el flujo dedicado de clawback. Antes de liberar debita `PENDING`; después de liberar debita `AVAILABLE`. Si un usuario ya gastó el saldo, no se permite sobregiro ni clawback parcial: actividad y comisión pasan a `REVERSAL_PENDING`/`CLAWBACK_PENDING`, lo que deberá bloquear elegibilidad y retiros hasta resolución. Los reversos genéricos del ledger quedan prohibidos para pending, release y clawback de referidos.

## Gate de activación

`commissionsEnabled` y `legalApproved` deben ser verdaderos, la fuente debe estar permitida y el pool `platform:zyxe:referral-reward-pool` debe contener fondos provenientes de ingresos conciliados. El seed crea la cuenta, pero deliberadamente no la financia mediante emisión interna.

## Consecuencias

- La UI puede compartir códigos y mostrar el árbol hoy sin fingir ingresos.
- La profundidad máxima, no-autorreferido y unicidad se protegen también en base de datos.
- Los nombres mostrados son display names truncados; nunca se expone email del downline.
- La actividad se considera “activa” solo si produjo una actividad monetizable cualificada en los últimos 30 días.
- El futuro módulo de retiros debe consultar obligaciones `CLAWBACK_PENDING`.
