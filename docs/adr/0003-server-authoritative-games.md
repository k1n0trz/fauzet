# ADR 0003: Juegos server-authoritative por sesión y eventos

- Estado: aceptado
- Fecha: 2026-07-12

## Contexto

El prototipo calcula puntajes, energía y recompensas en el navegador. Ese modelo permite modificar el reloj, repetir resultados, fabricar puntajes y acreditar una misma partida varias veces. Tap Miner y Memory Drops necesitan conservar su interacción, pero ninguna decisión económica puede depender de valores finales enviados por el cliente.

## Decisión

Cada partida nace en el servidor dentro de una transacción que valida elegibilidad, riesgo, límites y energía; descuenta el costo configurado y crea una sesión expirable ligada a usuario, dispositivo de sesión e IP seudonimizada. El cliente recibe un token opaco de una sola sesión; solo su hash se persiste.

La partida avanza mediante eventos con secuencia estrictamente creciente y tiempo relativo acotado. El servidor rechaza duplicados, saltos, eventos fuera de la ventana y cadencias físicamente imposibles. Los tiempos del cliente son evidencia auxiliar: inicio, expiración y recepción se comparan contra el reloj del servidor.

Tap Miner se calcula desde taps aceptados. Memory Drops conserva el tablero únicamente en el servidor y revela una carta por flip válido; el cliente nunca recibe el layout completo ni una semilla utilizable para predecirlo.

La finalización no acepta un puntaje o premio autoritativo. El servidor recalcula ambos, aplica presupuesto y pool, y confirma sesión, recompensa y asiento balanceado en una transacción `SERIALIZABLE`. `Idempotency-Key` y constraints únicos convierten reintentos en la misma respuesta. Solo un resultado `POSTED` acredita saldo; `HELD` o `REJECTED` no se presentan como ganancia disponible.

Energía, duración, fórmulas, límites, budgets, kill switches y rangos de recompensa provienen de una versión de configuración económica que queda registrada en la sesión y la transacción.

## Consecuencias

- Automatizar taps todavía requiere controles de comportamiento; el protocolo reduce manipulación económica, pero no sustituye un motor antifraude.
- Una sesión expirada o abandonada consume energía. Un fallo antes de persistir la sesión revierte el descuento completo.
- Los clientes deben recuperar una sesión por ID después de perder una respuesta y reutilizar la clave de idempotencia al finalizar.
- Nuevos juegos pueden reutilizar la máquina de estados, pero cada validador define eventos, límites físicos y cálculo propios.

## Alternativas descartadas

- Aceptar `score` y `reward` firmados por JavaScript: el secreto sería recuperable por el cliente.
- Validar solo al finalizar: no permite comprobar secuencia, ritmo ni tablero de Memory.
- Guardar la economía de juego en Redis sin ledger: debilita atomicidad, auditoría y recuperación.
