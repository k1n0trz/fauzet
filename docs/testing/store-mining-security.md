# Matriz de aceptación: Store y minería virtual

Esta matriz verifica la decisión de `docs/adr/0004-store-mining-ledger-and-settlement.md`. Los casos económicos deben ejecutarse contra PostgreSQL real y el ledger; mocks de memoria no prueban locks, constraints, serialización ni redondeo. Las suites persistentes se ejecutan sin paralelismo entre archivos, porque comparten configuración económica global; la concurrencia se crea explícitamente dentro de cada caso.

## Catálogo y autorización

- Catálogo, quotes y status salen de la versión económica activa y llevan `configVersion`, `serverNow` y `cache-control: no-store`.
- Precio, split, efecto, duración, hashpower, nivel, energía y límites manipulados en el body se ignoran o rechazan; nunca sustituyen la configuración.
- Una versión stale, producto inexistente, deshabilitado, fuera de vigencia o con kill switch se rechaza sin asiento ni efecto.
- Cuenta no verificada, suspendida o sobre el umbral de riesgo no compra, activa ni mejora.
- `b3` y `b5` se muestran `LOCKED` con reason code y no aceptan mutaciones.
- Los endpoints de Store y minería aplican rate limit, autenticación, device/IP evidence y no filtran datos de otros usuarios.
- La UI distingue energía de minería de energía de juegos y no presenta un contador compartido inconsistente.

## Pago, split y ledger

- Solo `PROMOTIONAL` y `AVAILABLE` pagan. `PENDING`, `LOCKED`, `ELIGIBLE`, reservas y otros buckets se rechazan incluso si el total aparente alcanza.
- Con saldo promocional suficiente, el débito sale solo de `PROMOTIONAL`; con saldo mixto, usa promocional primero y el resto available; el receipt coincide con postings.
- Dos compras concurrentes que compiten por el último saldo producen como máximo una compra `POSTED`; ninguna cuenta queda negativa.
- El split usa enteros, sus basis points suman 10.000 y `burn + recycle + treasury = price` para todo precio válido, incluidos residuos de 1–4 unidades.
- Quema, reward pool y tesorería son cuentas separadas; Owner no puede debitar reward pool ni quema.
- Receipt, transacción, postings y efecto guardan fuente, versión, idempotencia y evidencia. Un éxito sin `transactionId` o efecto aplicado es inválido.
- `POSTED` suma cero por activo. `HELD`, `REJECTED` o fallo antes del commit no cambia saldos, inventario, energía, slots ni mineros.

## Idempotencia y concurrencia de compra

- Reintentos y requests paralelos con la misma `Idempotency-Key` devuelven el mismo purchase, transaction, split y efecto; el saldo se debita una vez.
- Reutilizar una clave con otro producto, objetivo, usuario o versión produce conflicto sin mutación.
- Claves distintas no evitan límites de producto, boost, refill, inventario o slots.
- Crash injection antes del ledger, después del ledger lógico, después de crear efecto y antes de responder deja cero o un commit completo; el retry recupera el receipt.
- Unique constraints rechazan transaction duplicada, efecto duplicado, consumo duplicado, slot duplicado y purchase económico duplicado aunque la capa de servicio falle.

## Productos, efectos, slots y mineros

- `b1` lleva energía de minería exactamente al máximo, no supera el cap, rechaza una recarga sin efecto y respeta el máximo diario UTC bajo concurrencia.
- Dos recargas sobre energía casi llena no crean energía extra ni dos cargos si solo una tiene efecto válido.
- `b2` crea un intervalo `[startsAt, endsAt)` autoritativo; dos compras concurrentes no solapan ni multiplican dos veces el hashpower.
- El límite de boost no se elude cambiando device, IP, idempotency key o borde de fecha.
- Sin un minero desgastado, `b4` aparece bloqueado con `NO_REPAIR_NEEDED` y una llamada directa se rechaza sin cobro ni inventario.
- Con desgaste reparable, `b4` crea una unidad de inventario; reparación consume exactamente una. Dos reparaciones concurrentes con un kit dejan una reparación y consumo.
- `b6` crea un minero y ocupa un slot en el mismo commit. Dos compras por el cuarto slot producen un minero y un error estable; nunca existe un quinto slot activo.
- La asignación de slot es única por usuario y un usuario no puede mutar, reparar ni mejorar un minero ajeno.
- Upgrade consolida contribución anterior con reglas viejas y aplica nivel/hash/coste nuevo solo al futuro. Dos upgrades concurrentes no saltan nivel ni cobran dos veces de manera incoherente.
- Reparación consolida desgaste anterior, no lleva durabilidad sobre 100%, y se rechaza cuando no hace falta o el minero no es reparable.
- A durabilidad cero, minero deshabilitado, slot inactivo o mantenimiento no existe contribución válida.

## Energía y checkpoints

- El reloj usado es el del servidor; timestamps y duración enviados por cliente no aumentan energía, actividad ni peso.
- Un checkpoint calcula una sola vez `[lastCheckpointAt, now)` y avanza monotónicamente. Dos checkpoints concurrentes producen el mismo resultado que uno.
- Energía, consumo y carry usan enteros/decimal exacto. Partir un intervalo en N checkpoints produce el mismo consumo y peso que procesarlo una vez, dentro de la unidad mínima definida.
- Energía nunca es negativa ni excede capacidad. Si se agota dentro de un segmento, el peso termina en el segundo exacto de agotamiento.
- Con energía cero no hay contribución aunque la UI siga abierta, exista boost o el job esté retrasado.
- Un refill no atribuye energía nueva a tiempo anterior; un boost tampoco modifica segmentos previos.
- Activación/expiración de boost, upgrade, reparación, durabilidad cero, kill switch y riesgo parten el intervalo sin huecos ni solapamiento.
- Un intervalo que cruza 00:00Z se divide entre dos epochs. Zona horaria del usuario y DST no cambian pesos.
- Contribución es única por `(epoch, user)`; su agregado coincide exactamente con la suma calculada al partir por UTC, boost, energía y configuración, aunque la beta no persista cada segmento como fila separada.
- Reiniciar el worker, procesar catch-up o ejecutar dos workers no duplica segundos de actividad.

## Hashpower válido y estimaciones

- Hashpower efectivo se deriva solo de mineros persistidos, nivel, eficiencia, durabilidad, boost y reglas server-side.
- Valores negativos, overflow, multiplicadores fuera de rango y configuración incoherente fallan cerrados.
- La suma de pesos de segmentos coincide con la contribución del usuario y la suma de usuarios coincide con `totalWeight` del epoch cerrado.
- La UI etiqueta toda cifra intradía como «estimada, no garantizada», incluye `asOf` y no usa APY, rendimiento fijo, PoW ni promesa de pago.
- Cambiar el denominador de red, pool financiado, budget o riesgo actualiza la estimación sin alterar ledger.
- Una estimación nunca aumenta balance disponible ni aparece como transaction `POSTED`.

## Cierre de epoch y presupuesto

- Existe como máximo un epoch por `[startAt,endAt)` UTC y una sola reserva/settlement transaction por epoch.
- El cierre consolida todos los perfiles hasta `endAt`, congela contribuciones y no admite peso tardío.
- `distributable` queda fijado por la configuración del periodo. Pool menor que `distributable` deja settlement `BLOCKED`, sin reparto parcial, asiento ni cuenta negativa.
- Dos módulos o epochs compitiendo por el último budget no lo exceden; solo la operación que conserva cobertura completa puede liquidar.
- Con `totalWeight = 0` no se crean payouts cero ni asiento económico y los fondos permanecen en el pool.
- Un cambio de configuración después del cierre no recalcula el plan. Un cambio durante el día queda segmentado/versionado según su vigencia.

## Redondeo y exactitud del reparto

- Para cada usuario se verifica `floor(distributable × weight / totalWeight)` con aritmética entera, sin `float`.
- El residuo de redondeo previo es `distributable - sum(base)` y está entre cero y `participantes - 1` cuando todos son elegibles y hay peso.
- El residuo no se reparte mediante un orden arbitrario: queda identificado en el pool para el siguiente periodo o la política versionada correspondiente.
- Participantes suspendidos, no verificados o sobre riesgo conservan su peso en el denominador, no reciben payout y su parte aumenta el residuo sin redistribuirse.
- Se verifica exactamente `allocated = sum(plannedPayout)`, `allocated + roundingResidual = distributable` y débito del pool igual a `allocated`.
- Se cubren: un usuario, pesos iguales, pesos coprimos, muchos usuarios con pool menor que participantes, weights extremos y límites de entero.
- Property tests generan pools/pesos aleatorios y prueban conservación incluyendo residuo, no negatividad, determinismo, monotonicidad razonable y ausencia de overflow.

## Payouts atómicos e idempotencia de settlement

- Settlement, payouts y asiento común confirman en un único commit. Una caída en cualquier punto previo revierte todo.
- Payout `(epoch,user)` y transacción por epoch son únicos. Workers paralelos producen un settlement, un asiento y una acreditación por usuario.
- Reintentar después de un timeout recupera el mismo resultado sin recalcular contribuciones, debitar el pool ni acreditar usuarios otra vez.
- `SETTLED` exige todos los payouts `POSTED`, `sum(payouts) + residuo = distributable` y débito de pool igual a `sum(payouts)`; cero actividad permite `allocated = 0` sin transaction.
- `PENDING`, `HELD`, `REJECTED` o `REVERSED` no se presentan como saldo ganado ni cuentan como fuente de misiones.
- Dos workers cerrando el mismo epoch, retries después de timeout y mensajes duplicados conservan un plan, una transacción y una liquidación.
- Un epoch anterior atascado dispara alerta y política explícita; no se salta ni se marca manualmente sin auditoría.

## Reversos y clawback

- El reverso genérico de `store_purchase` y `miner_action` se rechaza antes de crear asientos; saldo, efecto e inventario permanecen coherentes.
- No se permite devolver saldo dejando activo boost, energía, nivel, reparación, minero o contribución generada. Un clawback dedicado futuro debe probar su compensación atómica.
- Reversar un payout marca la fuente no `POSTED`, compensa ledger una vez y no reabre ni redistribuye silenciosamente el epoch.
- Si el clawback no puede financiarse sin saldo negativo, falla cerrado y crea caso de riesgo; no edita balances.
- Wallet, catálogo, status y receipts reflejan `REVERSED`/reason code y no siguen mostrando una compra o recompensa como vigente.

## Kill switches y riesgo

- Kill de Store impide nuevas compras, upgrades, repair pagos y recargas; no altera receipts posteados.
- Kill de minería corta contribución desde su instante autoritativo y permite cerrar/reconciliar periodos anteriores.
- Al cierre, usuario suspendido, no verificado o sobre riesgo permanece en el denominador pero no recibe payout; su parte queda en el residuo.
- Bajar riesgo no rellena intervalos bloqueados ni reabre un epoch.
- Activar/desactivar flags durante compra o checkpoint concurrente se resuelve bajo lock y deja evidencia de qué versión/estado decidió.
- Admin no puede editar energía, contribución, payout, receipt ni ledger directamente; las acciones autorizadas llevan actor, motivo y before/after.

## Jobs, observabilidad y recuperación

- Reads y mutaciones mantienen checkpoints; Cloud Scheduler/Cloud Run Job invoca `pnpm mining:settle -- YYYY-MM-DD` después del cierre UTC y puede hacer catch-up.
- El advisory lock dura la transacción. Workers concurrentes o muertos se recuperan mediante retry idempotente y no bloquean el epoch indefinidamente.
- Métricas y alertas cubren checkpoint lag, energía negativa, contribución sin energía, epoch vencido, settlement atascado, diferencia plan/ledger, residuo, pool/budget, concentración, reversos y retries.
- La conciliación diaria reconstruye `pool inicial + funding + recycle - payouts/reversos`, residuo y payouts, y compara contra ledger.
- Restore/catch-up desde backup vuelve a ejecutar jobs idempotentemente y produce los mismos epochs, planes y transacciones.
- Runbook prueba caída en `OPEN` y `SETTLING`, además de `BLOCKED` por pool/budget insuficiente, ledger indisponible y configuración inválida.

## Gates de salida

- Ningún escenario probado permite doble gasto, efecto sin pago, pago sin efecto, quinto slot, minado sin energía, segundos duplicados o doble settlement.
- Toda compra y payout visible como completado tiene transaction `POSTED`, asiento balanceado y versión económica.
- La suma distribuida más el residuo explícito coincide exactamente con `distributable` y no excede pool ni budget.
- Las estimaciones permanecen separadas de balances y se presentan explícitamente como variables y no garantizadas.
