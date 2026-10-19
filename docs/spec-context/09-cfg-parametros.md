# Contexto para SPEC 09 · cfg-parametros

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores, Trazabilidad), plan docx, `3_plan.json`, `2_Estructura/`, `1_Mermaid/`, `codigo/`, `specs/01` y `specs/02`.

## 1. Alcance y dependencias
- Roadmap v2: spec 09 `cfg-parametros` cubre D-01 y parte de D-05 (RF 030-033). Estimado 8-9 h. Depende de 07 (`seg-permisos-efectivos-guard`: `@Permiso`, `X-Sucursal-Id`, caché Redis de permisos). Lo necesitan 12 (alta de tenant, siembra) y 22 (SazónPOS CC-05).
- Ojo con los nombres: el archivo `docs/spec-context/06-seg-autorizacion.md` corresponde ahora a los specs 06 y 07 del roadmap, y `08-seg-membresias.md` al spec 08. Los contextos se escribieron antes de la partición v2.
- Horas del plan: D-01 = 5 h (sprint 6, Back) y D-05 = 6 h (sprint 7, Front, para 5 RF: 025, 026, 031, 033, 035). Las RF 025/026 (catálogos propios) son del spec 19 y la 035 (series) del spec 10. Este spec toma la parte de parámetros de D-05; el plan no la desglosa.
- Tres áreas: (a) DDL `cfg` + función `cfg.valor` + migración reversible, (b) lib `libs/plataforma/parametros` (dominio, casos de uso, caché Redis, API HTTP, `ParametroPort`), (c) pantalla de parámetros en `admin-cliente` (árbol de herencia, restablecer).
- Fuera de alcance: TR-RF-034 historial de cambios (Should, fase R2, `plat.parametro.historial`, TR-CA-088 y 089); series (spec 10); catálogos (spec 19); auditoría persistente TR-AUD (spec 20); relay del outbox (spec 11); caché local en el agente edge TR-RF-137 (consume `parametro.cambiado`, R2+); aplicar el manifiesto completo (RF-008, spec 06). Migrar los parámetros hardcodeados de SazónPOS (spec 22, CC-05).
- PL-10: `SEG --> CFG & SEQ & CAT & AUD`. Etiqueta `comp:cfg` puede importar `kernel` y `seg` (spec 01, sección de reglas `comp`). No puede importar `comp:aud`.
- Constitución aplicable (CLAUDE.md): reglas 1, 3, 4, 5, 6, 7, 8, 10; DoD completo.
- Hito/sprint del plan: sprint 6 (2027-01-11 a 2027-01-24, 20 h de capacidad: D-01 5 + D-02 4 + D-03 7 + D-04 4 = 20 h) y sprint 7 (D-05 6 h, D-06 3, E-01 5, E-02 6 = 20 h). Sin holgura en ambos.

## 2. RF
| ID | Nombre | Permiso | Prioridad | Fase | Historia |
|---|---|---|---|---|---|
| TR-RF-030 | Registrar definiciones de parámetros | plat.parametro.definir | Must | MVP | D-01 |
| TR-RF-031 | Configurar valor de parámetro por alcance | plat.parametro.editar | Must | MVP | D-01 (back) y D-05 (front) |
| TR-RF-032 | Resolver valor efectivo de parámetro | plat.parametro.leer | Must | MVP | D-01 |
| TR-RF-033 | Ver herencia y restablecer parámetro | plat.parametro.editar | Should | MVP | D-05 |

Todos: MOD-04 Parámetros jerárquicos (TR-CFG), proceso TR-P03 (Gestión de catálogos y parámetros), sin IA. Componente en hoja Componentes: TR-CFG, "Provee", API interna: `ParametroPort.valor(codigo, contexto)` con origen; API de valores por alcance e historial; evento `parametro.cambiado`. Los 9 productos son consumidores (hoja Consumidores): puerto con caché Redis, parámetros declarados en el manifiesto del producto.

**TR-RF-030** (APP-03; actores: planificador de tareas, administrador de plataforma; RNF 120 y 027; regla TR-RN-015)
- Precondición: se aplica el manifiesto del producto.
- Flujo: 1) el proceso de manifiesto envía las definiciones; 2) valida el código (`producto.ambito.nombre`) y que el valor por defecto corresponda al tipo; 3) inserta las nuevas y actualiza descripción o defecto de las existentes; 4) las definiciones retiradas se marcan obsoletas conservando valores.
- Datos: `codigo` (texto 3-80); `producto_codigo` (5); `descripcion` (texto 3-250); `tipo` (TEXTO|NUMERO|BOOLEANO|JSON); `valor_defecto` (JSON); `alcance_maximo` (TENANT|EMPRESA|SUCURSAL); `esquema` (JSON Schema opcional).
- Salida: definiciones vigentes en `cfg.parametro_def`.

**TR-RF-031** (APP-02; actor: administrador del cliente; RNF 027 y 013; reglas TR-RN-014 y TR-RN-015)
- Precondición: la definición existe y el actor tiene alcance sobre la entidad elegida.
- Flujo: 1) busca el parámetro por producto o texto; 2) elige alcance y entidad e ingresa el valor; 3) el sistema valida TR-RN-014 y TR-RN-015; 4) guarda con usuario y fecha, invalida la caché y publica `parametro.cambiado`.
- Datos: `codigo`; `alcance` (TENANT|EMPRESA|SUCURSAL); `empresa_id`, `sucursal_id` (según alcance); `valor` (JSON del tipo definido).
- Salida: valor guardado y vigente en <= 5 s.

**TR-RF-032** (APP-03; actor: módulo de producto consumidor; RNF 101 y 001; regla TR-RN-014)
- Precondición: el módulo tiene contexto de tenant y, opcionalmente, empresa y sucursal.
- Flujo: 1) el módulo invoca el puerto con código y contexto; 2) busca en caché; si no existe ejecuta `cfg.valor`; 3) devuelve valor y origen (SUCURSAL, EMPRESA, TENANT o DEFECTO).
- Datos: `codigo`; `tenant_id`, `empresa_id`, `sucursal_id` (uuid); respuesta `valor` (JSON) y `origen` (texto).

**TR-RF-033** (APP-02; actor: administrador del cliente; RNF 027 y 020; regla TR-RN-014)
- Precondición: existe al menos un valor configurado del parámetro.
- Flujo: 1) abre el parámetro y ve la tabla defecto, tenant, empresa y sucursales; 2) selecciona un valor de nivel y elige restablecer; 3) el sistema pide confirmación, elimina el valor, invalida la caché y registra la auditoría.
- Datos: `codigo`; `niveles[]` (alcance, entidad, valor, modificado_por, modificado_en).
- Salida: el parámetro vuelve a heredar del nivel superior.

## 3. Criterios GWT
- **TR-CA-078** (Positivo, TR-RF-030, "Nuevo parámetro de propina"): DADO QUE el manifiesto REST 1.5.0 declara rest.propina.porcentaje NUMERO con defecto 10 | CUANDO se aplica el manifiesto | ENTONCES la definición queda registrada con alcance máximo SUCURSAL
- **TR-CA-079** (Negativo, TR-RF-030, "Defecto incompatible con el tipo"): DADO QUE el manifiesto declara plat.sesion.minutos_inactividad NUMERO con defecto «treinta» | CUANDO se aplica el manifiesto | ENTONCES el sistema rechaza la definición indicando el tipo esperado
- **TR-CA-080** (Positivo, TR-RF-031, "Propina distinta en una sucursal"): DADO QUE rest.propina.porcentaje vale 10 a nivel de tenant | CUANDO fija 0 para la sucursal «Food court Jockey» | ENTONCES esa sucursal resuelve 0 y las demás siguen con 10
- **TR-CA-081** (Negativo, TR-RF-031, "Alcance más específico que el permitido"): DADO QUE plat.factura.moneda_defecto tiene alcance máximo EMPRESA | CUANDO intenta fijar un valor a nivel de sucursal | ENTONCES el sistema rechaza con «Este parámetro se configura como máximo a nivel de empresa»
- **TR-CA-082** (Negativo, TR-RF-031, "Valor fuera de rango"): DADO QUE el esquema de rest.propina.porcentaje admite de 0 a 20 | CUANDO ingresa 25 | ENTONCES el sistema rechaza con «El valor debe estar entre 0 y 20»
- **TR-CA-083** (Positivo, TR-RF-032, "Herencia desde empresa"): DADO QUE rest.propina.porcentaje vale 12 en la empresa y no tiene valor en la sucursal «Cayma» | CUANDO se resuelve para «Cayma» | ENTONCES el puerto devuelve 12 con origen EMPRESA
- **TR-CA-084** (Borde, TR-RF-032, "Sin valores configurados"): DADO QUE el tenant no configuró plat.sesion.minutos_inactividad | CUANDO se resuelve el parámetro | ENTONCES el puerto devuelve el valor por defecto 30 con origen DEFECTO
- **TR-CA-085** (Negativo, TR-RF-032, "Código inexistente"): DADO QUE no existe el parámetro rest.mesa.color | CUANDO un módulo lo solicita | ENTONCES el puerto lanza el error PARAMETRO_NO_DEFINIDO
- **TR-CA-086** (Positivo, TR-RF-033, "Restablecer valor de sucursal"): DADO QUE la sucursal «Food court Jockey» tiene propina 0 y el tenant 10 | CUANDO restablece el valor de la sucursal | ENTONCES la sucursal resuelve 10 con origen TENANT
- **TR-CA-087** (Borde, TR-RF-033, "Restablecer valor de tenant sin otros niveles"): DADO QUE solo existe el valor del tenant | CUANDO lo restablece | ENTONCES el parámetro resuelve el valor por defecto con origen DEFECTO

10 criterios; estado de prueba en el SRS: Pendiente. Sin GWT para caché/invalidación (<= 5 s), `parametro.cambiado` ni aislamiento entre tenants: se agregan en el spec con IDs propios del spec o se cubren como pruebas de RNF.

## 4. Reglas y RNF
En el SRS los RNF se llaman `TR-RNF-xxx`.
| ID | Texto corto |
|---|---|
| TR-RN-014 | Valor efectivo de lo más específico a lo más general: sucursal -> empresa -> tenant -> defecto; no se admite valor en un alcance más específico que el alcance máximo. Fuente: `transversal/sql/03_cfg (cfg.valor)`. |
| TR-RN-015 | El valor debe corresponder a su tipo (TEXTO, NUMERO, BOOLEANO, JSON) y, si existe, a su esquema y rango. Fuente: `transversal/sql/03_cfg`. |
| TR-RN-001 | Toda entidad lleva tenant_id; ninguna consulta cruza tenants (aplica a ambas tablas `cfg`). |
| TR-RNF-027 | Configuración por tenant (marca, parámetros, catálogos, plantillas) sin cambios de código; 0 despliegues para configurar un cliente. Propio de este spec. |
| TR-RNF-101 | Caché Redis con invalidación; p95 < 20 ms con caché; invalidación efectiva <= 5 s. En el SRS está definido para permisos (alcance MOD-02), pero RF-032 lo enlaza para parámetros: se adopta como criterio. |
| TR-RNF-001 | Operaciones de mostrador p95 < 800 ms: la resolución de parámetros no debe degradarla. |
| TR-RNF-120 | Manifiesto versionado, aplicación idempotente (0 cambios al repetir, < 30 s); RF-030 lo enlaza para las definiciones. |
| TR-RNF-013 | Auditoría inmutable de operaciones críticas (RF-031 la enlaza; la persistencia es del spec 20). |
| TR-RNF-020 | Usuario operativo cumple tareas principales tras < 1 h de capacitación (RF-033, UI). |
| TR-RNF-010 | Aislamiento por tenant, doble barrera: contexto y RLS; 0 accesos cruzados en pruebas. |
| TR-RNF-119 | Ningún producto accede directamente a tablas de un esquema transversal: solo por `ParametroPort`. |
| TR-RNF-024 | Límites de módulos verificados por Nx en CI. |

Heredados por CLAUDE.md y relevantes: 008 (idempotencia de operaciones que cambian estado), 012 (validación de entradas en servidor), 025 (cobertura de dominio >= 70 %), 026 (logs sin datos personales), 106 (outbox).

## 5. Historias del backlog (3_plan.json)
| ID | Sprint | Horas | Descripción | rf |
|---|---|---|---|---|
| D-01 | 6 | 5 | Parámetros: definiciones, valor por alcance y resolución efectiva con caché | TR-RF-030, 031, 032 (Back, TR-CFG, R1) |
| D-05 | 7 | 6 | Parámetros (herencia y restablecer), series y catálogos propios | TR-RF-025, 026, 031, 033, 035 (Front, Admin cliente, R1) |

Relacionadas: D-02 (SEQ, spec 10), D-03/D-04/D-06 (CAT, spec 19), S-02/S-03 (spec 07, dependencia), E-02 (outbox relay, spec 11), E-01 (AUD, spec 20), U-02 (shell, spec 15), A-04 (shared/auth, spec 13), C-02 (CC-05 parámetros en SazónPOS, spec 22).

## 6. Tablas SQL, eventos, puertos y permisos
- **Esquema `cfg`** (nombre confirmado por SRS: `cfg.parametro_def`, `cfg.valor`; PL-03 lista `org · seg · cfg · cat · seq · aud · sync`). Archivo previsto: `db/01c_cfg.sql` (estructura_backend.txt y docx) con su inverso en `db/rollback/`. **No existe DDL en `codigo/`** (solo `01a_org.sql` y `01b_seg.sql`). Columnas deducibles solo de RF-030/031/033:
  - `cfg.parametro_def`: codigo (3-80), producto_codigo (5), descripcion (3-250), tipo, valor_defecto jsonb, alcance_maximo, esquema jsonb nulo, obsoleto (inferido de RF-030 paso 4).
  - `cfg.parametro_valor` (nombre propio): tenant_id, codigo, alcance, empresa_id, sucursal_id, valor jsonb, modificado_por, modificado_en. Unicidad por (tenant, codigo, alcance, entidad).
  - Función `cfg.valor(codigo, tenant, empresa, sucursal)` devuelve valor y origen (TR-RN-014).
- **Definiciones globales vs. valores por tenant**: `parametro_def` es global por producto (sin tenant_id); `parametro_valor` lleva tenant_id con RLS `current_setting('app.tenant_id', true)::uuid`, como `01a_org.sql` (con `ENABLE ROW LEVEL SECURITY`, sin `FORCE`). Las FK compuestas `(tenant_id, id)` de `org.empresa`/`org.sucursal` habilitan la FK de valor a entidad del mismo tenant (patrón de `01a_org.sql`).
- **Data API**: el esquema `cfg` nuevo necesita `REVOKE ALL ... FROM anon, authenticated` como `seg` y `org` en `supabase/migrations/20261102000000_seg_supabase_auth.sql` (regla 8).
- **Eventos**: `parametro.cambiado` (RF-031; tipo en `event_type`, agregado = parámetro; payload con codigo, alcance, entidad, valor nuevo). El restablecer (RF-033) no publica evento según el SRS; consumidor conocido: caché edge (RF-137, R2). Publicación vía `OutboxPublisher` de kernel-infra (spec 02) con `ValidadorEsquemaEvento`.
- **Puertos**: `ParametroPort.valor(codigo, contexto)` -> `{valor, origen}` y error `PARAMETRO_NO_DEFINIDO` (SRS). Internos previstos: repositorio de definiciones, repositorio de valores, caché de parámetros (patrón de `CachePermisos`), puerto de auditoría (no se puede importar `comp:aud`).
- **Permisos**: `plat.parametro.definir` (RF-030, llamada interna del proceso de manifiesto), `plat.parametro.editar` (RF-031, 033), `plat.parametro.leer` (RF-032, llamada interna). `plat.parametro.historial` es de RF-034 (R2). Ninguno aparece en `codigo/` ni en el manifiesto del código base; deben sembrarse en el manifiesto de plataforma (spec 06/07).
- **HTTP** (bajo `/v1`, OpenAPI, regla 5): rutas no definidas en ningún documento; solo se sabe de "API de valores por alcance e historial" (hoja Componentes). Endpoints mínimos probables: listar parámetros con valores por nivel, fijar valor, restablecer valor.
- **Estructura**: back `libs/plataforma/parametros/` (TR-CFG, `domain · application · infrastructure · interface · test`); front `libs/plataforma/admin-cliente/src/lib/parametros/` ("árbol de herencia · restablecer valor"). `data-access` front: cliente HTTP generado desde OpenAPI + stores con signals.

## 7. Código base relacionado
Raíz docs: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`. Estado real del repo (`portfolio/`): existen `libs/plataforma/kernel` (clock, domain-errors, id-generator, result) y `kernel-infra` (stub), `libs/shared/contracts` y `util`, `apps/api` mínimo, `db/rollback/.gitkeep`, `supabase/config.toml`. Los specs 01 y 02 existen; el resto de kernel (UoW, ALS, outbox) lo entrega el spec 02.
- **Falta (se escribe desde cero)**: toda la lib `parametros`; `01c_cfg.sql` y rollback; `cfg.valor`; la pantalla Angular; `ParametroPort`. `codigo/` no trae nada de CFG (grep de `cfg`/`parametro` solo da coincidencias ajenas).
- **Conservar / tomar como referencia**:
  - `codigo/libs/plataforma/seguridad/src/application/ports/permisos.port.ts` y `infrastructure/cache-permisos.redis.ts` / `cache-permisos.memoria.ts`: patrón de puerto de caché con adaptador Redis y en memoria; aquí la clave sería `cfg:{tenant}:{codigo}:{empresa}:{sucursal}` con invalidación por tenant+código. Nota del contexto 06: el índice `perm-idx:{tenant}` evita `KEYS/SCAN`.
  - `codigo/libs/plataforma/seguridad/src/interface/decoradores.ts` (`@Permiso`, `@UsuarioActual`) y `permiso.guard.ts`: para proteger los endpoints; lo entrega el spec 07.
  - `codigo/libs/plataforma/seguridad/src/domain/errores.ts`: errores como clases; `PARAMETRO_NO_DEFINIDO` sigue ese estilo (kernel aporta `domain-errors.ts`).
  - `codigo/db/01a_org.sql`: patrón de esquema, FK compuestas por tenant y RLS por `app.tenant_id`.
  - `codigo/supabase/tests/` + `correr_pruebas.sh`: patrón de pruebas SQL contra PostgreSQL local (`db/pruebas/` en la estructura).
  - `codigo/libs/shared/auth` (Angular): `signal/computed/inject`; sirve de convención para el front, que usa Angular 21.
- **Cambiar**: el código de seguridad no usa kernel (sin ALS/UoW/outbox); el nuevo módulo sí. `eslint.boundaries.snippet.js` incluye scopes de otro proyecto (`psi`, `nucleo`); usar las reglas `comp:*` del spec 01.
- **Dependencias del front no construidas aún**: `shell` (spec 15), `shared/auth` y `*siPermiso` (spec 13), `ui` y `data-access`. Con la dependencia declarada (solo 07) el front de este spec no tiene dónde montarse (ver pregunta 1).

## 8. Diagramas relevantes (`1_Mermaid/`)
- PL-10 Dependencias entre componentes (`SEG --> CFG & SEQ & CAT & AUD`; EVT, OBS aparte).
- PL-05 Secuencia solicitud autorizada (guard -> permisos -> `SET LOCAL app.tenant_id` -> transacción + outbox): modelo de cada caso de uso de escritura.
- PL-03 Autenticación y autorización (PostgreSQL con esquema `cfg`).
- PL-08 Integración SazónPOS (el backend de SazónPOS "lee seg/org/cfg/cat/seq"; escribe `sync.outbox`). Condiciona RNF-119: lectura directa en R1 vs. `ParametroPort`.
- PL-01 Hoja de ruta (R1 incluye TR-CFG) y PL-02 Cronograma (sprint 6 "Datos de referencia", sprint 7 "Administración de datos").

## 9. Ambigüedades y preguntas candidatas (Fase 2)
Ambigüedades:
- Presupuesto: no hay desglose de D-05; 8-9 h del roadmap = 5 (D-01) + 3-4 (parte de D-05). Si la UI completa (árbol de herencia, búsqueda, confirmación, formularios por tipo, validación de esquema) cuesta más, el spec se pasa de 10 h. Sprint 6 y 7 del plan van al 100 % de capacidad.
- El front depende de shell/auth-cliente (specs 13 y 15), que no son dependencia de 09 en el roadmap (Ola 5 con 10, 14, 20).
- RF-030 se dispara "al aplicar el manifiesto" (RF-008, spec 06), pero el manifiesto del código base solo trae permisos, opciones y roles; no hay ni formato ni hook para parámetros.
- RF-031/033 piden auditoría; TR-AUD llega en el spec 20 (dependiente de 07 y 11). Hasta entonces no hay dónde escribir.
- RF-033 dice "registra la auditoría" y no publica evento; RF-031 sí publica `parametro.cambiado`. ¿Restablecer debe invalidar a los consumidores (edge, otros)? Sin evento no hay aviso.
- RF-031 dice "efecto inmediato en los productos" y la salida "vigente en <= 5 s": ¿invalidación síncrona al guardar, o por evento en el outbox?
- RF-031: "el actor tiene alcance sobre la entidad elegida" depende de `seg.asignacion` (alcance TENANT/EMPRESA/SUCURSAL/UNIDAD): ¿un administrador de sucursal puede editar parámetros de su sucursal?
- Códigos: RF-030 pide formato `producto.ambito.nombre` pero los ejemplos usan `plat.sesion.minutos_inactividad`, `rest.propina.porcentaje` (con `plat` en lugar de `producto_codigo` de 5 letras) y `producto_codigo` es de 5 caracteres. Hay que decidir la regla de validación (regex) y la relación con `producto_codigo`.
- Alcance UNIDAD: no existe en `alcance_maximo` (TENANT|EMPRESA|SUCURSAL).
- Sensibilidad de `plat.parametro.editar` (aal2) no definida en el SRS.

Preguntas candidatas, con recomendación:
1. ¿Se incluye la UI (parte de D-05) en este spec o se difiere a una iteración posterior de admin-cliente? Recomendación: back completo (D-01) más UI mínima solo si 13 y 15 ya están implementados; si no, entregar la API con OpenAPI y dejar la pantalla como tarea condicionada, o mover la dependencia de 09 a 15. Decidir antes de aprobar para no pasar de 10 h.
2. ¿Dónde viven las definiciones: tabla global `cfg.parametro_def` (sin tenant) y valores por tenant? Recomendación: sí, definiciones globales por producto y valores con tenant_id y RLS; la función `cfg.valor` en SQL (TR-RN-014) y el mismo cálculo en el dominio para validar sin consulta.
3. ¿Cómo se registran las definiciones (RF-030) sin el manifiesto completo del spec 06? Recomendación: caso de uso `RegistrarDefinicionesUseCase` idempotente (diff, obsoletos, validación de tipo y esquema) invocable por el futuro `aplicar-manifiesto`; en este spec se prueba con definiciones de prueba (TR-CA-078/079) y las semillas de `plat.*` se cargan por migración o script.
4. ¿Qué librería valida el JSON Schema opcional (TR-CA-082) y cuánto soporta? Recomendación: usar una librería existente (Ajv) acotada a `minimum`/`maximum`/`enum`/`pattern`; mensajes de error en español como pide el SRS; confirmar la versión con la documentación vigente (ctx7).
5. ¿Auditoría (RF-031/033) antes del spec 20? Recomendación: puerto `AuditoriaPort` con adaptador nulo/log estructurado en este spec (comp:cfg no puede importar comp:aud) y registro de pendiente en el spec 20; `parametro.cambiado` por outbox sí es obligatorio (regla 4).
6. ¿Estrategia de caché e invalidación? Recomendación: caché Redis con TTL corto (60 s, como permisos) más invalidación explícita por tenant+código al guardar/restablecer en la misma request (cumple <= 5 s); índice por tenant sin `KEYS/SCAN`; si Redis cae, resolver contra la BD (degrada, no falla). Prueba de integración con Redis del docker-compose.
7. ¿Quién puede editar y a qué nivel? Recomendación: `@Permiso('plat.parametro.editar')` más verificación de alcance de la asignación del usuario sobre la empresa/sucursal elegida, reutilizando lo del spec 07; sin aal2 (no es acción sensible en el SRS), anotar la decisión.
8. ¿Restablecer (RF-033) publica evento? Recomendación: sí, `parametro.cambiado` con valor efectivo nuevo y marca de restablecido, para que caché edge y consumidores se invaliden; el SRS no lo prohíbe y evita incoherencias.
9. ¿Los consumidores (SazónPOS) leen `cfg` por SQL o por `ParametroPort`? Recomendación: solo por puerto en el código de plataforma (TR-RNF-119); lo de PL-08 (lectura directa) se resuelve en el spec 22; aquí exponer `ParametroPort` y una lectura HTTP interna.
