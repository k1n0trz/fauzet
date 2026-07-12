# PROMPT PARA CODEX — Roadmap de construcción integral de Fauzet / ZYXE

## Rol

Actúa como un equipo de ingeniería senior completo (arquitecto de software, backend, frontend, seguridad, economía de tokens/ledger, QA y DevOps) asignado al proyecto **Fauzet / ZYXE**. Tu misión es **analizar a fondo la documentación y el prototipo existentes y producir un roadmap de construcción de extremo a extremo**: desde cero hasta una plataforma en producción, completa, robusta y funcionando a la perfección.

## Cómo debes trabajar (léelo primero)

- **Usa todos los agentes, subagentes, herramientas y complementos que necesites** (lectura de documentos, exploración de código, búsqueda, planificación, generación de diagramas, ejecución de comandos, etc.). Paraleliza la investigación cuando puedas.
- **No inventes requisitos.** La fuente de verdad son los dos documentos `.docx` de la carpeta `data/`. Cuando algo no esté definido, márcalo explícitamente como **"decisión abierta"** (el propio documento tiene una sección de parámetros abiertos y decisiones pendientes).
- **Cita** de qué archivo/sección proviene cada requisito clave.
- El objetivo **no es escribir todo el código ahora**, sino entregar un **plan de construcción accionable, secuenciado y sin huecos**, con detalle suficiente para que un equipo lo ejecute de principio a fin.
- Antes de escribir nada del roadmap, **lee por completo los dos `.docx` y recorre el prototipo**.

## Archivos a analizar (rutas exactas, por prioridad)

1. `data/Fauzet_Ficha_Tecnica_Funcionamiento_v0.1.docx` — **Ficha técnica de funcionamiento**: ciclo completo del usuario (adquisición → registro → verificación → onboarding → faucet → juegos/misiones → actividad monetizable → minería virtual → uso de ZYXEs → referidos 4 niveles → Vault → microtrading → elegibilidad → conversión → wallet externa → retiro → ejecución blockchain → confirmación → post-retiro). Incluye los **estados de saldo** y sus reglas. Léelo entero.
2. `data/Fauzet_ZYXE_Documentacion_Tecnica_Economica_v0.1.docx` — **Documentación técnica, económica y funcional** (26 secciones: identidad, alcance, principios económicos, modelo de ingresos y utilidad del propietario, economía de ZYXE, obtención, sinks/consumo, minería, Vault, referidos, juegos, microtrading, conversión y retiros, tesorería y separación de fondos, panel admin y Owner Wallet, ledger/contabilidad/auditoría, seguridad y antifraude, arquitectura, MVP, roadmap, indicadores y alertas, riesgos y controles, cumplimiento, parámetros abiertos). Léelo entero.
3. `frontend/docs/ficha.txt` y `frontend/docs/economia.txt` — **extractos en texto plano** de los dos `.docx` (útiles para `grep`/lectura rápida si el binario cuesta).
4. `frontend/index.html`, `frontend/app.html`, `frontend/admin.html` y `frontend/js/*.js` — **prototipo funcional ya implementado** (HTML/JS vanilla, sin backend). Reproduce toda la UX con datos simulados y persistencia en `localStorage`: auth (login/registro/recuperación/OTP/2FA) + onboarding, dashboard con saldos por estado, faucet con cooldown/captcha/racha, juegos jugables (Tap Miner, Memory Drops, Daily Spin), misiones, minería (mejora/reparación/energía), tienda de boosts, wallet, Vault, Mining Crew, microtrading simulado, conversión, retiro en 3 pasos, cuenta y soporte; y un **panel admin** de 8 módulos (overview, usuarios, economía, retiros, tesorería, fraude, ledger/auditoría, owner). **Analízalo para entender el alcance de UI/UX ya congelado y reutilízalo como especificación de frontend y base de implementación.**
5. `frontend/Fauzet Landing.dc.html`, `frontend/Fauzet App.dc.html`, `frontend/Fauzet Admin.dc.html` — diseños originales (Claude Design canvases) de los que salió el prototipo.
6. `branding/` — logo, moneda ZYXE, íconos 3D y paleta oficial: `#39FF88` (verde), `#7C3AED` (violeta), `#22D3EE` (cian), `#080B12`, `#111827`, `#E5E7EB`. Tagline: "Drip sats. Every day."

## Principios y restricciones INNEGOCIABLES (deben cumplirse en todo el diseño)

Extraídos de los documentos; el roadmap y la arquitectura deben garantizarlos por construcción:

- **Separación de saldos**: el saldo mostrado ≠ dinero retirable. Estados: _pendiente, disponible, bloqueado, promocional, elegible, en conversión, retirado_, cada uno con reglas propias de gasto y retiro.
- **Ledger inmutable**: el saldo nunca es un campo mutable; **cada cambio es un asiento** con saldo previo/nuevo, origen, estado y metadatos. Toda cifra debe ser reconciliable y auditable. Los ajustes de admin siempre llevan razón + identidad.
- **Separación de fondos / tesorería**: recompensas, reserva de retiros, liquidez, operación, obligaciones de Vault y **utilidad del propietario** en buckets separados. El **Owner Wallet** solo retira de "utilidad disponible", **jamás** de fondos de usuarios; regla forzada a nivel de ledger.
- **Minería virtual**: no se ejecuta PoW real en el dispositivo; es reparto de un pool diario limitado según hashpower válido.
- **Recompensas variables y no garantizadas**; sin APY fijo; **más sinks que fuentes** (quema/reciclaje/tesorería, p. ej. split 40/40/20 en compras).
- **Validación server-side de TODO**: claims (cooldown, captcha, presupuesto, límites por cuenta/IP/dispositivo), puntajes de juego (firmar sesión, anti-replay, no confiar en el cliente), callbacks de proveedores (acreditar solo tras callback verificable, ventana antifraude, sin doble acreditación), minería, referidos.
- **Referidos de 4 niveles** solo sobre actividad **válida y monetizable**; sin comisión sobre comisión, sin autocuentas, con topes y clawback por reversos.
- **Flujo de retiro**: elegibilidad → cotización/conversión (con expiración) → wallet en **lista blanca** (con cooldown de seguridad) → 2FA → **revisión antifraude** (score + código de razón) → firma en entorno seguro (llaves fuera de la app, multisig/límites de hot wallet) → broadcast → confirmaciones → cierre o refund. **Idempotencia y cero doble pago.**
- **Antifraude**: risk scoring, detección de multicuenta / dispositivo duplicado / VPN / datacenter, velocidad de actividad, listas negras, revisión humana cuando aplique.
- **Cumplimiento**: KYC por umbrales/riesgo/jurisdicción, edad y país, aceptación de términos. ZYXE **arranca como unidad interna sin precio público ni convertibilidad automática**; nada de promesas de inversión ni rentabilidad. La tokenización pública es una fase futura condicionada.
- **Decisión rectora**: primero validar una economía interna sostenible → luego habilitar retiros controlados → solo entonces evaluar tokenizar ZYXE en una red existente. Red propia fuera del alcance inicial.

## Punto de partida (qué ya existe)

- **Frontend completo y navegable** (landing + app + admin) con economía simulada en cliente. Sirve como spec viva de UX y como base a conectar con backend real.
- **Branding y assets** listos.
- **Falta todo lo demás**: backend, economía real, ledger, motor de saldos, antifraude, seguridad/custodia, integraciones (ads/offerwalls, email, captcha, KYC, mercado, blockchain), panel admin/owner con datos reales, infraestructura, pruebas y operación.

## ENTREGABLE: el ROADMAP (en español)

Genera un documento de roadmap **completo, secuenciado y accionable**, que como mínimo incluya:

1. **Resumen ejecutivo** y objetivos por fase.
2. **Arquitectura objetivo**: diagrama de componentes (API/backend, ledger, motor económico, antifraude, servicio de pagos/blockchain, colas/eventos, caché, almacenamiento, frontend, panel admin/owner, integraciones). Recomienda **stack con justificación** (p. ej. Node/TypeScript + PostgreSQL + Redis + colas, o la alternativa que argumentes) y el patrón (monolito modular vs. servicios) adecuado para el MVP y su evolución.
3. **Modelo de datos**: entidades núcleo (usuarios, wallets internas, **ledger de asientos**, saldos por estado, transacciones, mineros/hashpower, pools, misiones/rachas, árbol de referidos, posiciones de Vault, órdenes de trading, cotizaciones/conversiones, retiros, wallets externas whitelisted, buckets de tesorería, casos de fraude, audit log, **configuración versionada de parámetros económicos**), relaciones e **invariantes contables**.
4. **Motor económico**: emisión por presupuesto/pools, sinks, cálculo de minería (hashpower válido ÷ hashpower total × pool), Vault (pool variable ponderado por plazo), comisiones de referidos, elegibilidad de conversión; todos los parámetros configurables y versionados con vista de impacto.
5. **Superficie de API**: endpoints por dominio, contratos, **idempotencia**, autenticación y **roles** (visitante, usuario verificado, admin, finanzas, antifraude, owner).
6. **Seguridad**: 2FA, gestión de sesiones/dispositivos, KYC, rate limiting/captcha, **custodia de llaves y firma de transacciones**, gestión de secretos, hardening; **modelo de amenazas** con controles.
7. **Antifraude**: reglas, scoring, pipelines de revisión, clawback/reversos, métricas (falsos positivos, casos, bloqueos).
8. **Integraciones externas**: rewarded ads / offerwalls (con callbacks verificables y reparto económico), email, captcha, datos de mercado, KYC, blockchain (red inicial de bajo costo — LTC/DOGE según el doc) con manejo de fees, confirmaciones, reintentos e idempotencia.
9. **Frontend real**: plan para convertir el prototipo en app de producción (framework y gestión de estado recomendados, i18n EN/ES ya existente, tema claro/oscuro), integración con la API, y separación app de usuario vs. panel admin/owner.
10. **Fases y milestones**: desglosa en **MVP → beta cerrada → beta pública → producción**, mapeando cada módulo del prototipo a features reales, con criterios de aceptación y _definition of done_ por fase. Aplica la decisión rectora (economía interna sostenible primero; retiros y tokenización después).
11. **Estrategia de pruebas y QA**: unit, integración, e2e, **pruebas de conciliación contable del ledger**, carga/estrés, y pruebas específicas de antifraude e idempotencia.
12. **DevOps/infra**: entornos, CI/CD, migraciones, observabilidad (logs/métricas/alertas — el doc lista indicadores y alertas), backups y recuperación ante desastres.
13. **Cumplimiento y legal**: checklist por jurisdicción, disclaimers y políticas (términos, privacidad, riesgo, recompensas, retiros).
14. **Registro de riesgos** y **decisiones abiertas** (sección de parámetros abiertos del doc): lístalas con opciones y una recomendación.
15. **Backlog inicial**: _epics → historias → tareas_ con estimación relativa y dependencias, listo para cargar en un gestor de proyectos.

## Formato de salida

- Documento en **español**, con encabezados claros, tablas donde aporten y **diagramas Mermaid** para: arquitectura, modelo de datos, **ciclo de vida del saldo** y **flujo de retiro de extremo a extremo**.
- Cierra con un **tablero de fases (Now / Next / Later)** y un **checklist maestro** de "todo lo necesario para dejar la plataforma full y funcionando perfecto".
- Señala explícitamente supuestos y cualquier hueco de la documentación.

**Empieza ahora**: lee por completo los dos `.docx` (o los `.txt` equivalentes) y recorre el prototipo `frontend/`; luego produce el roadmap.
