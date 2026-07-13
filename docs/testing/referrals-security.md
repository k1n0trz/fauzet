# Matriz de seguridad: Mining Crew

| Riesgo                                       | Control                                                                      | Prueba                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Pago por reclutamiento vacío                 | Registro solo crea edge/ancestry; nunca comisión                             | Código y árbol muestran cero rewards                              |
| Autorreferido/multicuenta básica             | Sponsor activo/verificado y bloqueo de dispositivo compartido                | Registro con sesión sponsor en el mismo device falla              |
| Reasignación o ciclo                         | Edge único, ancestry L1-L4, checks no-self y triggers inmutables             | UPDATE/DELETE del grafo falla                                     |
| Más de cuatro niveles                        | `depth BETWEEN 1 AND 4` y copia limitada de ancestry                         | Cadena de cinco usuarios materializa exactamente cuatro ancestros |
| Comisión sobre comisión                      | Allowlist cerrada de fuentes monetizables                                    | Fuente `REFERRAL` se rechaza                                      |
| Callback duplicado/replay                    | Idempotency key y `(sourceType, sourceId)` únicos con comparación de payload | Retry idéntico reproduce; drift retorna conflicto                 |
| Doble gasto del pool                         | Lock de usuario, `SERIALIZABLE` y posting protegido                          | Actividad completa o rollback total                               |
| Sobrepasar cap                               | Suma mensual de estados comprometidos dentro de la misma transacción         | Reward se trunca y `cappedMinor` conserva diferencia              |
| Liberar a cuenta bloqueada                   | Revalidación de status, email y risk al release                              | Comisión queda `HELD`                                             |
| Reverso después de release                   | Clawback dedicado desde `AVAILABLE`                                          | Saldo y proyección regresan atómicamente                          |
| Saldo ya gastado                             | Sin negativo ni clawback parcial                                             | Estado `CLAWBACK_PENDING` auditable                               |
| Reverso genérico deja proyección incoherente | Source types referral bloqueados por ledger genérico                         | No se crea asiento compensatorio genérico                         |
| Exposición de PII                            | API solo entrega id, display name truncado, nivel y estado                   | Contratos no contienen email ni dispositivo                       |
| Activación accidental                        | `commissionsEnabled=false`, `legalApproved=false`, pool sin funding de seed  | UI `ATTRIBUTION_ONLY` con reason code                             |

## Gates de aceptación

- Códigos válidos, únicos y estables para usuarios nuevos y existentes.
- Atribución solo durante registro; invalid/same-device falla sin crear usuario parcial.
- 5/2/1/0,5% exacto con floor, tope y una sola base monetizable.
- Pending, release y clawback conservan suma cero en ledger.
- Retry concurrente no duplica actividad, comisión ni posting.
- La UI nunca presenta rewards gateadas como disponibles o garantizadas.
