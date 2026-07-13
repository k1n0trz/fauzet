# Matriz de integración del frontend Fauzet

**Fuente visual canónica:** `frontend/Fauzet Landing.dc.html`, `frontend/Fauzet App.dc.html`, `frontend/Fauzet Admin.dc.html` y sus compilaciones HTML/JS.

**Runtime de producción:** `apps/web` (Next.js). El backend, no el navegador, conserva la autoridad sobre identidad, saldos, rewards, configuración y operaciones económicas.

## Reglas de portado

1. Conservar composición, marca, tipografía, jerarquía, navegación y estados de interacción de Claude.
2. No portar cálculos económicos, autenticación, balances, premios ni persistencia `localStorage` del prototipo.
3. Usar únicamente endpoints reales y contratos validados.
4. Mostrar como `Próximamente`, `Sandbox` o `Deshabilitado` cualquier capacidad sin backend/gate aprobado.
5. No inventar totales, tasas, rendimientos, mercado, volumen, historial ni notificaciones.
6. QA obligatorio a 360, 390, 768, 1024 y 1440 px; teclado; zoom 200%; ES/EN; claro/oscuro cuando aplique.

## Landing

| Bloque Claude         | Next | Fuente real / tratamiento                                    | Estado                                       |
| --------------------- | ---- | ------------------------------------------------------------ | -------------------------------------------- |
| Header, idioma y tema | `/`  | Preferencias locales no económicas                           | Portado                                      |
| Hero y CTA            | `/`  | CTA hacia `/app`; vista previa rotulada                      | Portado                                      |
| Cómo funciona         | `/`  | Contenido editorial                                          | Portado                                      |
| Formas de ganar       | `/`  | Capacidades sin backend marcadas para etapa futura           | Portado                                      |
| ZYXE                  | `/`  | Aviso legal de unidad interna                                | Portado                                      |
| Minería               | `/`  | Minería virtual; no Proof-of-Work                            | Portado                                      |
| Juegos                | `/`  | Tap Miner/Memory Drops reales; otros futuros                 | Portado                                      |
| Mining Crew           | `/`  | Porcentajes configurables; comisiones bajo gate              | Portado                                      |
| Vault                 | `/`  | Presentación conceptual, sin activar producto financiero     | Portado como futuro                          |
| Conversión            | `/`  | Retiros reales deshabilitados; activos planificados          | Portado como futuro                          |
| Confianza             | `/`  | Controles pendientes redactados en futuro cuando corresponda | Portado                                      |
| FAQ, CTA y footer     | `/`  | Contenido editorial y avisos vigentes                        | Portado                                      |
| Analytics             | `/`  | GA, GTM y Clarity entregados por el propietario              | Producción + consentimiento; fuera de `/app` |

## Aplicación de usuario

| Pantalla Claude   | Ruta Next                   | API / autoridad                                 | Estado y brecha                                                       |
| ----------------- | --------------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| Login/registro    | `/app`                      | `/v1/auth/login`, `/register`, `/logout`, `/me` | Real; portado visual en curso                                         |
| Verificación      | `/app/verify`               | `/v1/auth/email-verification/*`                 | Real; conservar enlaces/tokens seguros                                |
| Recuperación      | `/app/forgot`, `/app/reset` | `/v1/auth/password/*`                           | Real; paridad visual pendiente                                        |
| Google Auth       | `/app`                      | Pendiente Firebase                              | Botón gated hasta integración                                         |
| 2FA               | Ajustes                     | Sin backend TOTP                                | Deshabilitado honestamente                                            |
| Onboarding        | Pendiente                   | Requiere estado servidor                        | No portar bono local                                                  |
| Shell/rail        | `/app/*`                    | Sesión y rutas Next                             | Rail de iconos aprobado; portado visual en curso                      |
| Dashboard         | `/app`                      | `/me`, `/balances` y resúmenes por dominio      | Real; composición Claude en curso                                     |
| Faucet            | `/app/faucet`               | `/faucet/status`, `/challenges`, `/claims`      | Real; corrección proxy lista localmente                               |
| Juegos            | `/app/games/*`              | `/games/*`                                      | Tap Miner y Memory Drops reales                                       |
| Misiones          | `/app/missions`             | `/missions`, claim idempotente                  | Real                                                                  |
| Minería           | `/app/mining`               | `/mining/status`, upgrades, repair              | Real y solo ZYXE                                                      |
| Tienda ZYXE       | `/app/store`                | `/store/catalog`, `/purchases`                  | Real con saldo interno                                                |
| Tienda fiat       | Pendiente                   | Flujo MP separado                               | No entregar por retorno de navegador                                  |
| Wallet            | `/app/wallet`               | `/balances`, `/account/activity`                | Implementada localmente con buckets y movimientos exactos del usuario |
| Vault             | Pendiente                   | Sin modelo/API                                  | Cerrado                                                               |
| Mining Crew       | `/app/crew`                 | `/referrals/*`                                  | Real; comisiones sujetas a gate                                       |
| Trading           | Pendiente                   | Sin API                                         | Cerrado; no mostrar mercado sintético                                 |
| Conversión/retiro | `/app/convert`              | Sandbox completo                                | Mantener aviso sandbox                                                |
| Swap              | `/app/swap`                 | Sin custodia/liquidez/KYC                       | Placeholder honesto                                                   |
| Perfil/ajustes    | `/app/settings`             | `/profile/*`, sesiones y privacidad             | Implementado localmente; proveedores gated                            |
| Soporte           | Pendiente                   | Sin tickets                                     | FAQ posible; tickets requieren backend                                |

## Administración

| Módulo Claude                      | Next/API                 | Estado seguro                                  |
| ---------------------------------- | ------------------------ | ---------------------------------------------- |
| Shell/topbar                       | `/admin`                 | Portado visual sobre step-up real              |
| Overview                           | `/v1/admin/overview`     | Solo métricas reales disponibles               |
| Usuarios                           | `/v1/admin/users`        | Real; cambios auditados                        |
| Economía                           | `EconomicConfigVersion`  | Falta API draft → preview → approve → activate |
| Retiros                            | `/v1/admin/withdrawals`  | Solo sandbox; decisiones exact-once            |
| Tesorería                          | Sin API dedicada         | Placeholder gated hasta conciliación           |
| Fraude                             | Señales/risk score       | Falta gestión completa de casos                |
| Ledger                             | `/v1/admin/ledger`       | Real; formateo exacto de minor units           |
| Auditoría                          | `/v1/admin/audit`        | Append-only; falta filtrado/paginación         |
| Owner                              | Sin acciones financieras | Read-only/gated hasta MFA y maker-checker      |
| Faucet, juegos, minería, referrals | Sin paneles específicos  | Placeholders honestos                          |
| Vault y trading                    | Sin backend              | Deshabilitados                                 |
| Configuración                      | Parcial en DB            | Falta flujo versionado y permisos              |
| Roles/permisos                     | RBAC backend + CLI       | UI futura con anti-autoescalado                |

## Definition of done de cada pantalla

- Paridad visual comprobada contra Claude en desktop y móvil.
- Sin dato económico hardcoded presentado como real.
- Loading, vacío, error, reintento y sesión expirada.
- Teclado, foco visible, labels y anuncios accesibles.
- Mutaciones con idempotencia y confirmación cuando aplique.
- Contrato compartido o validación explícita de respuesta.
- Prueba de componente/flujo y smoke test contra API.
- ES/EN y tema aplicados de manera consistente.
- Ningún secreto, PAN/CVV, llave privada o documento KYC en cliente/logs.
