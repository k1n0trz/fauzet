# Matriz de aceptación: juegos y misiones

## Sesión y energía

- Dos inicios concurrentes con la misma `Idempotency-Key` crean una sesión y descuentan energía una vez.
- Inicios con claves distintas no pueden gastar por debajo de cero ni superar el límite diario.
- Token ausente, alterado, expirado o usado por otro usuario, dispositivo o contexto IP se rechaza sin mutación.
- Un fallo antes de crear la sesión revierte energía; abandono o expiración posterior no la reembolsa.
- Regeneración concurrente respeta cap, intervalo y reloj del servidor.

## Eventos

- Secuencia repetida, con huecos o fuera de orden no cambia el estado.
- Reintentar el mismo `eventId` y secuencia devuelve el mismo ack/reveal; cambiar uno de los dos produce conflicto.
- Eventos fuera de duración, con timestamp regresivo o futuro imposible se rechazan.
- Tap Miner limita frecuencia y total físicamente aceptables; el score se deriva solo de taps persistidos.
- Memory Drops no expone layout/seed; índices repetidos, ya emparejados o un tercer flip durante bloqueo no progresan.
- Dos lotes concurrentes sobre la misma sesión conservan una única secuencia canónica.

## Finalización y ledger

- `complete` ignora cualquier score/reward cliente y recalcula desde eventos aceptados.
- Reintentos y finalizaciones paralelas producen una respuesta económica y un asiento balanceado.
- Dos usuarios compitiendo por el último cupo global no exceden budget ni pool.
- `REJECTED`, `HELD`, `EXPIRED` y `ABORTED` no aparecen como saldo disponible.
- La recuperación por ID devuelve el mismo estado/resultados sin volver a acreditar.

## Misiones

- Progreso cuenta únicamente faucet claims y game rewards `POSTED` dentro del periodo correcto.
- Eventos cliente, sesiones incompletas, recompensas held/rejected y callbacks no verificados no progresan.
- Un claim incompleto, expirado, bloqueado o de otra versión se rechaza.
- Claims concurrentes con la misma o distinta clave producen a lo sumo una recompensa y un asiento.
- Metas no disponibles por módulos futuros se muestran `LOCKED` con reason code; nunca como progreso ficticio.

## Invariantes

- Toda transacción suma cero por activo.
- Ninguna cuenta de usuario, budget o pool queda negativa.
- Cada resultado guarda versión económica, fuente, request/idempotency y evidencia de validación.
