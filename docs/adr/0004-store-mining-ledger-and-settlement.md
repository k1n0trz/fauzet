# ADR 0004: Store y minería virtual con efectos atómicos y reparto por tiempo válido

- Estado: aceptado
- Fecha: 2026-07-12

## Contexto

El prototipo permite comprar recargas, boosts, reparaciones, mejoras y mineros, y muestra una recompensa diaria estimada a partir del hashpower. En el navegador también modifica saldo, energía, durabilidad y hashpower directamente. Ese comportamiento no puede llegar al producto: permitiría fabricar efectos, gastar dos veces, ocupar más slots que los permitidos, minar sin energía o liquidar dos veces el mismo periodo.

Fauzet no ejecuta Proof-of-Work. La minería es una simulación económica que reparte un pool interno limitado. La fórmula orientativa es proporcional al hashpower válido, pero una foto instantánea del hashpower no representa la contribución de un día: energía, mantenimiento, boosts, riesgo, kill switches y cambios de configuración pueden partir el periodo en varios intervalos.

Las compras son movimientos económicos. Deben usar el ledger de doble partida, aceptar únicamente saldo `AVAILABLE` y `PROMOTIONAL`, aplicar el split configurado y producir el efecto adquirido en la misma unidad atómica. El split inicial 40/40/20 es experimental y no autoriza mezclar fondos de rewards, operación u Owner.

## Decisión

### Catálogo y reglas versionadas

El servidor publica un catálogo derivado de una versión económica activa. Precio, disponibilidad, límites, buckets de pago, split, duración, multiplicadores, niveles, slots, energía, desgaste y efectos pertenecen a esa versión. El cliente envía solo identidad del producto, objetivo cuando corresponda, versión observada e `Idempotency-Key`; nunca precio, split, saldo, hashpower, duración ni efecto autoritativo.

La primera beta expone:

- `b1`, recarga de energía de minería hasta el máximo, con límite diario UTC y rechazo de compras sin efecto.
- `b2`, boost temporal de hashpower; inicia al postear la compra, no se acumula ni se solapa con otro boost de la misma familia.
- `b3`, acelerador de faucet, visible como `LOCKED` hasta que faucet pueda consumir el efecto autoritativamente.
- `b4`, kit de reparación de un uso, registrado en inventario y consumido por una reparación server-side; solo se puede comprar cuando existe al menos un minero con desgaste reparable.
- `b5`, pase de misiones premium, visible como `LOCKED` hasta que misiones pueda validar su vigencia.
- `b6`, minero permanente que requiere un slot libre.

Un producto bloqueado conserva título y explicación, pero nunca simula un efecto ni acepta una compra. Upgrade, reparación y recarga directa, si se ofrecen fuera del catálogo, siguen exactamente la misma máquina de compra, pago, split, idempotencia y receipt.

La energía de minería pertenece al perfil de minería. Es distinta de la energía de partidas mientras ambos módulos tengan relojes y políticas diferentes. API y UI deben llamarla **energía de minería**; no se presenta un contador compartido que pueda divergir entre módulos.

### Compra, pago y split

Cada operación económica se ejecuta en una transacción `SERIALIZABLE` y bloquea, en orden estable, usuario, cuentas de pago, perfil de minería, efecto o minero objetivo y slot cuando aplique. En el mismo commit:

1. Se revalidan cuenta activa y verificada, riesgo actual, kill switch, producto, versión, periodo, límites, inventario y precondiciones del efecto.
2. Se calcula el precio desde configuración.
3. Se consume primero `PROMOTIONAL` y después `AVAILABLE`; el receipt registra ambos importes. Ningún otro bucket se puede gastar.
4. Se calculan los destinos en unidades mínimas enteras. Para el split por defecto: `burn = floor(precio × 4000 / 10000)`, `recycle = floor(precio × 4000 / 10000)` y `treasury = precio - burn - recycle`. El último destino absorbe el residuo, de modo que el split siempre suma exactamente el precio. Los basis points de un producto deben sumar 10.000.
5. Se postea un único asiento balanceado que debita las cuentas del usuario y acredita cuentas separadas de quema, pool de rewards y tesorería autorizada.
6. Se crea el receipt y se aplica el efecto, inventario, upgrade, reparación o minero.

El éxito externo es `POSTED` únicamente cuando ledger y efecto están confirmados y existe `transactionId`. `PENDING`, `HELD`, `REJECTED`, `REVERSED` o un fallo parcial no se muestran como compra completada. Una clave reintentada con la misma identidad devuelve el mismo receipt; reutilizarla para otra identidad produce conflicto. Constraints únicos cubren, como mínimo, idempotencia, transacción económica, efecto y slot.

Ninguna cuenta de usuario, pool o budget puede quedar negativa. La disponibilidad de saldo se decide dentro del mismo lock que el asiento; una validación previa en UI o una lectura sin lock es solo informativa.

### Efectos, inventario y mineros

Los efectos tienen identidad, tipo, fuente, versión, estado, inicio y fin. Un efecto temporal se considera activo por el intervalo semiabierto `[startsAt, endsAt)`. Sus constraints impiden solapamientos no permitidos. Un consumible nunca puede aplicarse dos veces y conserva el vínculo compra → inventario → consumo → objetivo.

Los mineros ocupan slots numerados únicos por usuario. La capacidad inicial es cuatro. Comprar dos mineros, reasignar slots o crear un minero mientras otra solicitud ocupa el último slot se serializa por usuario; el límite no se implementa con un `count` sin lock. Hashpower base, eficiencia, consumo, durabilidad, nivel, coste de upgrade y desgaste se derivan de configuración y estado persistido. A durabilidad cero el minero no contribuye. Upgrade y reparación primero consolidan la contribución hasta el instante de la mutación y solo después cambian el estado futuro.

### Checkpoint de energía y contribución

Cada perfil mantiene un checkpoint monotónico. Antes de cualquier lectura económica o mutación —compra con efecto, recarga, boost, upgrade, reparación, cambio de riesgo o cierre de epoch— el servidor consolida el intervalo pendiente bajo lock.

El intervalo se divide en fronteras deterministas:

- inicio y fin de epoch UTC;
- activación o expiración de boost;
- agotamiento exacto de energía;
- cambio de minero, nivel, eficiencia o durabilidad;
- entrada en mantenimiento, suspensión, riesgo o kill switch;
- cambio de configuración que explícitamente deba regir actividad futura.

Para cada segmento, el servidor calcula hashpower efectivo a partir de mineros válidos y multiplicadores enteros en basis points. La contribución es un peso entero time-weighted, por ejemplo `effectiveHashMilliGh × activeSeconds`. La energía se descuenta con unidad de precisión suficiente y carry persistido; redondear por checkpoint no puede crear energía ni peso adicional. Cuando la energía llega a cero, el segmento termina en ese instante y toda contribución posterior es cero.

Los segmentos agregan a una contribución única por `(epoch, user)`. La beta persiste el peso agregado, el checkpoint y las versiones/acciones que cambian su cálculo, pero no una fila por cada segmento; esta es una limitación forense consciente. Checkpoints concurrentes sobre el mismo perfil no pueden contabilizar el mismo segundo dos veces. Fechas locales y DST no participan: los epochs son intervalos UTC `[00:00:00Z, 00:00:00Z del día siguiente)`.

### Pool, presupuesto y settlement

Un `MiningEpoch` tiene identidad única por periodo UTC, versión, pool configurado, pool financiado, budget disponible, importe asignable, peso total, payout total, residuo y evidencia de cierre. Si no existe peso válido, el payout es cero y los fondos permanecen en el pool.

Al cerrar un epoch, un worker adquiere un lock distribuido/advisory por periodo y ejecuta una transacción serializable que:

1. Consolida todos los perfiles hasta `endAt` y rechaza checkpoints posteriores que intenten reabrir el periodo.
2. Fija `distributable` desde el budget configurado del epoch y comprueba que el pool financiado cubre todo ese importe. Si no alcanza, deja el epoch `BLOCKED` sin payout parcial ni asiento.
3. Congela contribuciones y un plan único de payout por usuario.
4. Calcula `base = floor(distributable × userWeight / totalWeight)` conservando todo el peso en el denominador. Solo recibe payout quien continúe activo, verificado y dentro del umbral de riesgo al cierre; la parte calculada de un participante no elegible no se redistribuye.
5. Fija `allocated = sum(payouts elegibles)` y `roundingResidual = distributable - allocated`. El residuo de redondeo y las partes retenidas por elegibilidad quedan explícitamente en el pool. Por tanto, `sum(payouts) + roundingResidual = distributable` exactamente.
6. Crea settlement, payouts y un único asiento de ledger en el mismo commit. El asiento debita del pool `sum(payouts)` y acredita `AVAILABLE` de cada usuario por su importe. Epoch y transacción tienen identidades únicas.

La liquidación es atómica para la escala de la beta: o epoch, payouts y ledger quedan `SETTLED`/`POSTED`, o ninguno queda confirmado. Cada payout conserva identidad única `(epoch, user)` y referencia la transacción común. El plan nunca se recalcula durante un retry. Un epoch solo llega a `SETTLED` cuando todos los payouts previstos están `POSTED`, su suma más el residuo coincide exactamente con `distributable` y el débito del pool coincide con la suma pagada. Un periodo sin actividad o cuyos importes redondean a cero queda `SETTLED` sin transacción económica y conserva todo el distributable como residuo. Mientras se procesa, la UI muestra estado pendiente, no saldo acreditado.

El pool diario es un máximo, no una promesa. Toda cifra antes de `SETTLED` se denomina `estimatedReward`, lleva `asOf`, supuestos y `isGuaranteed: false`; no se usa «ganarás», APY, rendimiento fijo ni minería real.

### Reversos, riesgo y kill switches

Un reverso nunca borra historia. La transacción compensatoria referencia la original y el receipt o payout cambia a `REVERSED`/`REJECTED` con reason code.

El reverso genérico del ledger rechaza `store_purchase` y `miner_action` antes de crear asientos: la beta no devuelve saldo de una operación con efecto. Un futuro workflow dedicado solo podrá revertir si deshace efecto, inventario o minero en el mismo commit; si ya existe contribución o payout deberá congelar el beneficio y abrir clawback/revisión. Una devolución económica sin neutralizar el efecto sería doble beneficio.

Un payout revertido deja de ser una fuente `POSTED` para misiones u otras proyecciones. La reversión no reabre ni recalcula el epoch; registra neto revertido y, si procede, un proceso separado de redistribución aprobado y versionado.

Store y minería tienen kill switches independientes. Store bloquea nuevas compras sin alterar receipts ya posteados. Minería detiene contribución desde el instante autoritativo del checkpoint; no inventa actividad durante el apagado. En el cierre, suspensión, falta de verificación o riesgo alto conservan el peso en el denominador pero excluyen el payout; esa parte queda en el residuo y no beneficia a otros participantes. Un settlement confirmado usa su snapshot inmutable salvo reverso explícito.

### Jobs y operación

Los reads y mutaciones económicas consolidan checkpoints; el cierre reintentable se expone mediante `pnpm mining:settle -- YYYY-MM-DD` para que Cloud Scheduler/Cloud Run Job lo ejecute después de la frontera UTC y haga catch-up. Un advisory lock transaccional, idempotencia persistida y estados recuperables sustituyen la suposición de «exactamente una ejecución».

Se miden y alertan: lag del último checkpoint, perfiles con energía negativa, peso después de agotamiento, epochs sin cerrar, settlement atascado, diferencia plan/ledger, residuo, pool/budget insuficiente, concentración de hashpower, reversos y retries. Una conciliación diaria compara epochs, contribuciones, plan, payouts, ledger, pool, residuo y budget. El runbook cubre catch-up, retry de cierre, desbloqueo después de funding aprobado, reverso y cierre manual auditado; jamás recomienda editar balances o marcar un epoch como liquidado a mano.

## Consecuencias

- La estimación intradía puede cambiar hasta el cierre porque cambian denominador, energía, riesgo, pool y budget.
- El checkpoint time-weighted cuesta más que una foto diaria, pero evita premiar activaciones de último minuto y permite probar energía y boosts.
- La liquidación atómica simplifica la beta y evita estados parciales; si el volumen de postings supera el límite operativo, una ADR futura deberá introducir reserva/payable y procesamiento por lotes sin cambiar el plan económico.
- La precisión y los carries forman parte del modelo económico; no se usan `float` ni tiempo local.
- La contribución agregada permite reconciliar payouts, pero una investigación que necesite reproducir cada subintervalo requerirá instrumentación adicional antes de escalar el motor de riesgo.
- B3 y B5 permanecen visibles pero bloqueados hasta que sus módulos consumidores sean autoritativos.

## Alternativas descartadas

- Restar saldo y aplicar efectos en operaciones separadas: permite cobro sin producto o producto gratis.
- Confiar en precio, nivel, energía o hashpower enviados por el navegador.
- Liquidar con el hashpower visto a medianoche: ignora el tiempo realmente activo.
- Ejecutar un cron sin estado ni idempotencia y asumir que corre una vez.
- Redondear cada payout sin reconciliar el residuo.
- Mostrar la estimación diaria como recompensa garantizada.
