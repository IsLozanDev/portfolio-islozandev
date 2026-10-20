# Contexto para SPEC 10 · seq-correlativos

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx, plan docx, `3_plan.json`, `2_Estructura/estructura_*.txt`, `1_Mermaid/`, `codigo/`, y el estado actual del repo (`libs/`, `db/`, `specs/01` y `02`). Rutas de código relativas a `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/` (abreviado `PLAN/`).

## 1. Alcance y dependencias
- Roadmap (v2): spec 10 `seq-correlativos` cubre D-02 y parte de D-05 (RF 035-037), 7 h estimadas. Depende del spec 07 (`seg-permisos-efectivos-guard`: permisos efectivos, `@Permiso`, `X-Sucursal-Id`). Transitivas: 06, 05, 04, 03 (org), 02 (kernel, UoW, outbox).
- Lo necesitan: 12 (`org-alta-tenant-vencimiento`: siembra de series iniciales en el alta, RF-001 paso 5) y 22 (`sazonpos-org-seq-cfg`: CC-03). Ola 5 (junto con 09, 14, 20); es paralelo a 09 (CFG) y comparte con él la historia D-05.
- Horas: D-02 = 4 h (Back, sprint 6, R1). D-05 = 6 h (Front, sprint 7, R1) y se reparte entre los specs 09 y 10; el plan no desglosa cuánto es de series. Con 7 h estimadas, la parte de D-05 sería unas 3 h (supuesto, no está en el plan).
- Tres áreas: (a) esquema `seq` en SQL (series, contadores, función de numeración), (b) lib `libs/plataforma/correlativos` (dominio, aplicación, API, puerto), (c) UI de series en `admin-cliente/series` (parte de D-05).
- Fuera de alcance (otros specs): RF-038 reserva de bloques offline (R2, agente local, TR-RN-046); parámetros (spec 09); catálogos (spec 19); emisión de comprobantes TR-FE (R2: usan el puerto, no lo construyen); siembra de series iniciales en el alta (spec 12); migración de numeración de SazónPOS (spec 22); consumo de `serie.creada` por auditoría (spec 20).
- PL-10: `SEG --> CFG & SEQ & CAT & AUD`; `SEQ & CAT & PER --> FE`. SEQ depende de SEG y, a través de ORG, del kernel.
- Constitución aplicable (CLAUDE.md): reglas 1, 2, 3, 4, 5, 6, 7, 8, 10; DoD completo.

## 2. RF
| ID | Nombre | Permiso | Prioridad | Fase |
|---|---|---|---|---|
| TR-RF-035 | Configurar series y correlativos | plat.serie.gestionar | Must | MVP |
| TR-RF-036 | Obtener siguiente número atómico | plat.serie.numerar | Must | MVP |
| TR-RF-037 | Reiniciar correlativo por periodo | plat.serie.numerar | Must | MVP |

Los tres: módulo MOD-05 Correlativos y series (TR-SEQ). RF-038 (reservar bloques offline, Should, R2, permiso `plat.serie.reservar_bloque`) existe en el mismo módulo y queda fuera.

**TR-RF-035** (APP-02 Administración del cliente; actores: administrador del cliente, encargado de facturación del cliente; componentes TR-SEQ, TR-ORG, TR-AUD; procesos TR-P03, TR-P04; reglas TR-RN-016, 017, 009; RNF TR-RNF-103, 017)
- Precondición: la empresa y, si aplica, la sucursal o unidad existen.
- Flujo: 1) elige empresa, tipo de documento y alcance; 2) ingresa serie, reinicio y último número utilizado; 3) el sistema valida unicidad (empresa, tipo, serie) y el formato de TR-RN-017 para comprobantes; 4) guarda y publica `serie.creada`.
- Datos: `tipo` (BOLETA|FACTURA|NOTA_CREDITO|NOTA_DEBITO|TICKET|KARDEX|EXPEDIENTE|HC|ESCRITURA); `serie` (texto 1-10); `sucursal_id`, `unidad_id` (opcionales); `reinicio` (NUNCA|ANUAL|DIARIO); `ultimo_numero` (entero >= 0).
- Salida: serie disponible para numeración.

**TR-RF-036** (APP-03 API de servicios; actor: módulo de producto consumidor; componente TR-SEQ; procesos TR-P03, TR-P04; regla TR-RN-016; RNF TR-RNF-103, 008)
- Interfaz (hoja Componentes): `CorrelativoPort.siguiente(empresa, tipo, serie)`, transaccional, más "API de series" y reserva de bloques (RF-038, fuera).
- Precondición: la serie existe y está activa.
- Flujo: 1) el módulo invoca el puerto dentro de su transacción; 2) el sistema bloquea la fila de la serie (`SELECT ... FOR UPDATE`) y aplica el reinicio si cambió el periodo; 3) incrementa y devuelve serie y número; 4) si la transacción del producto se revierte, el número no se consume.
- Datos: entrada `empresa_id` (uuid), `tipo` (texto), `serie` (texto); respuesta `serie` (texto), `numero` (bigint), `numero_formateado` (p. ej. B002-00000125).
- Salida: número único y consecutivo.

**TR-RF-037** (APP-03; actor: módulo consumidor; componentes TR-SEQ, TR-ORG; procesos TR-P03, TR-P12; regla TR-RN-016; RNF TR-RNF-103, 026)
- Precondición: la serie tiene reinicio distinto de NUNCA.
- Flujo: 1) el módulo solicita el siguiente número; 2) calcula el periodo actual (año o fecha) en la zona horaria de la sucursal; 3) si difiere del periodo guardado, reinicia el contador a 1 y actualiza el periodo; 4) devuelve el número.
- Datos: `periodo` (texto: 2026 o 2026-10-10); `zona_horaria` (de la sucursal).
- Salida: primer número del periodo igual a 1.

Sin IA en los tres. Consumidores (hoja Consumidores): puerto dentro de la transacción del producto (comprobantes, tickets, expedientes, historias, kardex). Otras filas del SRS que usan SEQ y no son de este spec: TR-RF-053, 054, 055, 056 (TR-FE), 088 (ARCO), 001 (alta de tenant, paso 5), 136 (agente local).

## 3. Criterios GWT (los 8 de RF-035 a 037; N.° criterios coincide: 3 + 3 + 2)
- **TR-CA-090** (Positivo, "Serie de boletas por establecimiento"): DADO QUE la sucursal «Cayma» tiene establecimiento 0002 | CUANDO registra la serie B002 de BOLETA con reinicio NUNCA | ENTONCES la serie B002 queda asociada a «Cayma» con último número 0
- **TR-CA-091** (Negativo, "Serie de factura con formato inválido"): DADO QUE el actor configura una serie FACTURA | CUANDO ingresa la serie «B001» | ENTONCES el sistema rechaza con «Las series de factura deben iniciar con F y tener 4 caracteres»
- **TR-CA-092** (Positivo, "Ticket con reinicio diario"): DADO QUE la unidad «Ventanilla 1» de una municipalidad existe | CUANDO registra la serie A de TICKET con reinicio DIARIO | ENTONCES la numeración de tickets se reiniciará cada día
- **TR-CA-093** (Positivo, "Numeración consecutiva"): DADO QUE la serie B002 tiene último número 124 | CUANDO se emite una boleta | ENTONCES el número asignado es B002-00000125
- **TR-CA-094** (Borde, "Concurrencia de 50 ventas"): DADO QUE la serie B002 tiene último número 200 | CUANDO 50 cajas solicitan número al mismo tiempo | ENTONCES se asignan los números 201 a 250 sin duplicados ni huecos
- **TR-CA-095** (Negativo, "Transacción revertida"): DADO QUE la serie F001 tiene último número 80 | CUANDO la venta falla después de pedir número y la transacción se revierte | ENTONCES la siguiente venta recibe el número 81
- **TR-CA-096** (Positivo, "Reinicio diario de tickets"): DADO QUE la serie A de tickets terminó el 09/10/2026 en 342 | CUANDO se emite el primer ticket del 10/10/2026 a las 08:01 hora de Lima | ENTONCES el ticket recibe el número A-001
- **TR-CA-097** (Borde, "Cambio de día por zona horaria"): DADO QUE son las 23:30 del 09/10/2026 en Lima (04:30 UTC del 10/10) | CUANDO se emite un ticket | ENTONCES el ticket continúa la numeración del 09/10/2026 y no reinicia

Estado de prueba en el SRS: Pendiente. Observaciones: sin GWT para serie duplicada, serie inactiva/inexistente, sucursal de otro tenant, ni reinicio ANUAL; TR-CA-092 y TR-CA-096 muestran ticket "A-001" (3 dígitos) mientras TR-CA-093 muestra 8 dígitos (ver sección 9).

## 4. Reglas y RNF
En el SRS los RNF se llaman `TR-RNF-xxx` (el encargo los nombra `RNF-xxx`).
| ID | Texto corto |
|---|---|
| TR-RN-016 | Numeración atómica, sin duplicados ni huecos, por empresa, tipo y serie; reinicio NUNCA, ANUAL o DIARIO, aplicado al primer número del nuevo periodo. Fuente: `transversal/sql/04_seq (seq.siguiente)` (no existe en este repo). |
| TR-RN-017 | Series de comprobantes electrónicos de 4 caracteres: F### para facturas y sus notas, B### para boletas y sus notas; correlativo numérico de hasta 8 dígitos. Normativa SUNAT (marcada "verificar"). |
| TR-RN-009 | Permisos sensibles (incluye "cambiar series") exigen MFA con antigüedad máxima de 15 min y quedan auditados. Aplicación a `plat.serie.gestionar` no es explícita (ver sección 9). |
| TR-RN-001 | Toda entidad lleva `tenant_id`; ninguna consulta cruza tenants (hereda de spec 02). |
| TR-RNF-103 | (Propio, MOD-05, Must) Correlativos concurrentes sin duplicados ni huecos: >= 200 números/s por serie con 50 hilos; 0 duplicados y 0 huecos. Verificación: prueba de concurrencia automatizada en CI. |
| TR-RNF-008 | Operaciones que cambian estado idempotentes ante reintentos mediante clave de idempotencia; 0 duplicados en pruebas de reintento. Hereda por CLAUDE.md. Ojo: `siguiente` no es idempotente por naturaleza (ver sección 9). |
| TR-RNF-017 | Comprobantes conformes a SUNAT (UBL 2.1, catálogos). En este spec solo aplica el formato de serie (RN-017); la homologación es de TR-FE. |
| TR-RNF-026 | Logs estructurados con trace_id, tenant y sucursal, sin datos personales. |
| TR-RNF-010 | Doble barrera de aislamiento por tenant (contexto + RLS); 0 accesos cruzados. |

Heredados por CLAUDE.md y relevantes: 001/002/003 (desempeño; la numeración está en el camino crítico de la venta), 025 (cobertura dominio >= 70 %), 101 (permisos con caché), 106 (outbox para `serie.creada`). TR-RNF-108 y TR-RN-046 (offline) son de RF-038, fuera.

## 5. Historias del backlog (3_plan.json)
| ID | Sprint | Horas | Descripción | rf |
|---|---|---|---|---|
| D-02 | 6 | 4 | Correlativos: series, siguiente número atómico y reinicio por periodo (Back, componente TR-SEQ, R1) | TR-RF-035, 036, 037 |
| D-05 | 7 | 6 | Parámetros (herencia y restablecer), series y catálogos propios (Front, componente Admin cliente, R1) | TR-RF-025, 026, 031, 033, 035 |

Solo RF-035 de D-05 corresponde a series; el resto (025, 026, 031, 033) es de los specs 09 y 19. Relacionadas (otros specs): D-01 (CFG, 5 h), D-03/D-04/D-06 (CAT), E-01 (AUD), E-02 (relay). Sprint 6 (R1, 2027-01-11 a 2027-01-24, 20 h de capacidad): "Datos de referencia: parámetros, correlativos y catálogos". Sprint 7: "Administración de datos, auditoría y eventos".

## 6. Tablas SQL, eventos, puertos y permisos
- **Migración**: el plan prevé `db/01d_cat_seq.sql` (CAT y SEQ juntos). Ese archivo no existe en `PLAN/codigo/db/` (solo `01a_org.sql` y `01b_seg.sql`) ni en `db/` del repo (solo `rollback/.gitkeep`). La hoja de ruta separa SEQ (spec 10) de CAT (spec 19), así que hace falta un archivo propio y su rollback. El PL-03 lista el esquema `seq` en PostgreSQL ("org · seg · cfg · cat · seq · aud · sync").
- **Tablas**: el SRS cita `seq.siguiente` y "transversal/sql/04_seq" (fuente no disponible). No hay DDL. Columnas deducibles de RF-035/036/037:
  - Serie (tenant, empresa, tipo, serie, sucursal_id?, unidad_id?, reinicio, periodo vigente, último número, activa, zona horaria resuelta de la sucursal). Unicidad (empresa, tipo, serie) por RF-035 paso 3.
  - El contador y el periodo viven en la misma fila bloqueada con `FOR UPDATE` (RF-036 paso 2).
- **Patrón RLS** (`PLAN/codigo/db/01a_org.sql`): `current_setting('app.tenant_id', true)::uuid`, con `ENABLE` sin `FORCE`; el spec 02 hace `FORCE` en `sync.outbox` y el spec 03 corrige org. `org.sucursal.zona_horaria varchar(40) NOT NULL DEFAULT 'America/Lima'` y `codigo_establecimiento_sunat char(4)` (`^\d{4}$`) ya existen; `org.unidad_operativa` tiene `sucursal_id` (NULL solo si ALMACEN).
- **Data API**: el esquema `seq` debe quedar fuera de la Data API (regla 8): `REVOKE` a `anon, authenticated` como en `supabase/migrations/20261102000000_seg_supabase_auth.sql`.
- **Eventos**: `serie.creada` (RF-035). No hay evento de numeración en el SRS (no se publica por cada número). No hay evento de modificación o desactivación de serie.
- **Puertos**: `CorrelativoPort.siguiente(empresa, tipo, serie)` (hoja Componentes). Estructura: `libs/plataforma/correlativos/` con las 4 capas. Nombres: el spec 02 usa inglés (`UnitOfWork`, `TenantContext`, `EventPublisher`); mantener inglés para el puerto del kernel y decidir el de SEQ. Necesita `UnitOfWork`/EntityManager de la transacción del producto (el puerto debe correr en esa tx, no abrir otra).
- **Permisos**: `plat.serie.gestionar` (RF-035), `plat.serie.numerar` (RF-036/037; llamada interna del módulo consumidor, sin endpoint HTTP según el SRS). No hay dónde estén registrados en el código base (grep en `codigo/`: sin coincidencias); el manifiesto/seed de permisos es del spec 06.
- **API HTTP**: "API de series" para la UI (listar, crear, quizá editar/desactivar), bajo `/v1`, con `@Permiso` y OpenAPI. Rutas no definidas en el plan.
- **Front** (`estructura_frontend.txt`): `libs/plataforma/admin-cliente/src/lib/series/` y entrada "series" en `admin.routes.ts`; consume `data-access` (cliente HTTP desde OpenAPI). Etiquetas: `type:feature`, `scope:plataforma`.

## 7. Código base relacionado
- **Falta todo SEQ**: no existe código ni SQL de series/correlativos en `PLAN/codigo/`. Se escribe desde cero: DDL, función de numeración, entidades, caso de uso, repositorio, controlador, UI.
- **Estado actual del repo** (real, no del plan): `libs/plataforma/kernel/src` tiene `domain-errors.ts`, `result.ts`, `clock.port.ts`, `id-generator.port.ts`; `kernel-infra/src/index.ts` está vacío (`export {}`) y `db/` solo tiene `rollback/`. El spec 02 está Aprobado pero su implementación (UoW, `AlsTenantContext`, outbox) aún no está en código; este spec asume que existirá.
- **Conservar / tomar como referencia**:
  - `PLAN/codigo/db/01a_org.sql`: patrón de RLS, FK compuestas `(tenant_id, id)` y CHECKs (`ck_unidad_sin_sucursal`) para series con alcance sucursal/unidad.
  - `PLAN/codigo/supabase/tests/00_simular_supabase_SOLO_PRUEBAS.sql` y `correr_pruebas.sh`: prueba SQL contra PostgreSQL local; sirve para la prueba de concurrencia en SQL.
  - `PLAN/codigo/libs/plataforma/seguridad/` (estructura hexagonal, `package.json`, `tsconfig.json`, `domain/errores.ts`, `interface/decoradores.ts` con `@Permiso`, `test/seguridad.integracion.spec.ts`): plantilla de capas y de integración con PostgreSQL.
  - `PLAN/codigo/libs/shared/auth/` (`si-permiso.directive.ts`, `auth.interceptor.ts`): para ocultar acciones de la UI (spec 13/15).
- **Cambiar**: nada de `seguridad` aplica a SEQ salvo el patrón; el generador `modulo-hexagonal` (spec 01) debe crear la lib. El código base de `seguridad` no usa kernel; SEQ sí debe usar `UnitOfWork`/`TenantContext`.
- **Versiones**: backend NestJS 12; frontend Angular 21 (el plan y el docx dicen 22; vigente 21).

## 8. Diagramas relevantes (`1_Mermaid/`)
- PL-10 Dependencias entre componentes (SEG -> SEQ; SEQ -> FE).
- PL-05 Secuencia solicitud autorizada (paso `SET LOCAL app.tenant_id -> RLS · transacción + outbox`): marco de la llamada a `siguiente` dentro de la transacción del caso de uso.
- PL-03 Autenticación y autorización propia (esquema `seq` dentro de PostgreSQL).
- PL-08 Integración SazónPOS ("lee seg/org/cfg/cat/seq"; consumidor CC-03 en spec 22).
- PL-02 Cronograma (S06 "Parámetros · correlativos · catálogos") y PL-01 (R1 incluye TR-SEQ).

## 9. Ambigüedades y preguntas candidatas (Fase 2)
Ambigüedades:
- El alcance mezcla back (D-02) y front (parte de D-05) y la UI necesita `shell-y-ui` y `auth-cliente-angular` (specs 13 y 15), que son posteriores al 10 y no figuran en "Depende de" (solo 07). Además `admin-cliente` no tiene aún lib.
- D-05 no desglosa horas por RF; "parte de D-05" no se puede medir.
- RF-035 "último número utilizado" (entero >= 0) frente a `numero = último + 1`: el campo del contador y el número inicial no están separados.
- Formato de `numero_formateado`: B002-00000125 (8 dígitos) en RF-036 y CA-093; "A-001" (3 dígitos) en CA-096; para tipos no SUNAT (TICKET, KARDEX, EXPEDIENTE, HC, ESCRITURA) no hay regla de relleno.
- TR-RN-017 solo define F### y B###; las notas (NOTA_CREDITO/DEBITO) llevan serie F### o B### según el comprobante afectado (RF-055), pero el tipo de la serie no dice a cuál pertenece.
- RF-036 dice "sin huecos" y también "si la tx se revierte el número no se consume": exige numeración en la misma tx, lo que serializa a todos los emisores de la serie (TR-RNF-103: >= 200 números/s con 50 hilos). Con `FOR UPDATE` la serie es un punto de contención hasta que commitea la venta.
- `plat.serie.numerar` es llamada interna, pero la hoja Componentes menciona "API de series"; no está claro si `siguiente` también tiene endpoint HTTP.
- TR-RN-009 cita "cambiar series" como acción sensible, pero RF-035 no lo marca; no hay GWT de MFA ni de auditoría para series.
- RF-035 habla de "último número utilizado" al crear, lo que permite migrar series existentes (SazónPOS); no está dicho si se permite bajar el contador luego (riesgo de duplicar números ya emitidos).
- `serie.creada` es el único evento; modificar, desactivar o corregir un contador no tiene evento ni RF.
- El plan prevé un solo archivo `01d_cat_seq.sql`; el roadmap parte CAT y SEQ.

Preguntas candidatas, con recomendación:
1. ¿Cómo se garantiza "sin huecos" bajo concurrencia? Recomendación: fila de contador por serie con `SELECT ... FOR UPDATE` dentro de la tx del llamador (una función SQL `seq.siguiente` que hace bloqueo, reinicio e incremento en una sola sentencia), nunca una `SEQUENCE` de PostgreSQL (se consumen al revertir y generan huecos). Aceptar la serialización como costo y medirla con la prueba de TR-RNF-103 (50 hilos, >= 200 n/s). Documentar que una venta lenta bloquea la serie hasta commit.
2. ¿Dónde se calcula el periodo (reinicio ANUAL/DIARIO)? Recomendación: dentro de la función SQL, con la fecha en la zona horaria de la sucursal (`now() AT TIME ZONE zona`), bajo el mismo bloqueo, para que dos pedidos en el cambio de día no reinicien dos veces. Reloj inyectable (`Clock` del kernel) solo para pruebas del dominio; en SQL aceptar la fecha como parámetro para poder probar CA-096/097 sin esperar. Si la serie no tiene sucursal (alcance empresa), usar America/Lima como defecto.
3. ¿La numeración corre en la transacción del producto? Recomendación: sí; `CorrelativoPort.siguiente` exige una transacción activa del `UnitOfWork` (lanza `NoActiveTransactionError`, ya previsto en el spec 02) y no abre una propia. CA-095 se prueba con rollback explícito.
4. ¿Qué formato de número y validación de serie? Recomendación: guardar `numero` (bigint) y calcular `numero_formateado` en el dominio: comprobantes con serie de 4 caracteres y 8 dígitos (RN-017, mensaje exacto de CA-091); otros tipos con la serie libre (1-10) y relleno por defecto de 8 dígitos, salvo que el producto indique otro. Pedir al usuario confirmar el relleno de TICKET (CA-096 muestra A-001).
5. ¿Hay endpoint HTTP para `siguiente`? Recomendación: no; solo el puerto en proceso (el SRS lo define como llamada transaccional del módulo). Endpoints HTTP solo para la administración de series (listar, crear, ver) con `plat.serie.gestionar`; sin edición del contador en este spec.
6. ¿`plat.serie.gestionar` es sensible (aal2, TR-RN-009)? Recomendación: sí, porque "cambiar series" figura en la regla; marcarlo sensible en el manifiesto y probar el 401 step-up. Si el usuario prefiere no, decidirlo explícitamente y retirar la cita de la regla.
7. ¿Se puede modificar o bajar el contador? Recomendación: no en este spec. `ultimo_numero` solo se fija al crear (migración de datos existentes) y luego solo avanza por `siguiente`; sin PUT del contador, sin borrado. Desactivar la serie queda como campo `activa`, sin API de edición hasta que haya RF.
8. ¿Qué entra de la UI (D-05) y cuándo? Recomendación: este spec entrega solo back (D-02, 4 h) más la API de series y la lib `admin-cliente/series` como pantalla mínima solo si los specs 13 y 15 ya existen; de lo contrario mover la parte front de RF-035 a 15/16 y actualizar el roadmap (regla del 70 %). Preguntar al usuario cuál prefiere.
9. ¿Se siembran series iniciales y se valida alcance? Recomendación: este spec solo expone un caso de uso/puerto `crearSerie` que el alta de tenant (spec 12) invoque; valida con FK compuesta `(tenant_id, empresa_id)` y `(tenant_id, sucursal_id)`, y CHECK de coherencia sucursal/unidad (como `ck_unidad_sin_sucursal`). Sin siembra por defecto aquí.
