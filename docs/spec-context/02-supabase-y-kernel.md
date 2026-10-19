# Contexto para SPEC 02 · supabase-y-kernel

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx, plan docx, `3_plan.json`, `2_Estructura/estructura_backend.txt`, `codigo/`.

## 1. Alcance y dependencias
- Roadmap: spec 02 `supabase-y-kernel` cubre F-04 y F-06 ("proyectos Supabase, kernel, kernel-infra (UnidadDeTrabajo, ContextoTenant, outbox, Resultado)"). Depende de 01 (`fundaciones-monorepo`: F-02, F-03, F-05). Lo necesitan los specs 03, 04 y 15.
- Horas: F-04 = 3 h + F-06 = 5 h = 8 h (cabe en 10 h). Sprint 0, release R0.
- Tres áreas: (a) configuración de proyectos Supabase, (b) lib `kernel` (dominio puro), (c) lib `kernel-infra` (ALS, UoW, outbox).
- Fuera de alcance (otros specs): relay/worker BullMQ, registro de esquemas, `@SuscribirEvento`, reproceso (spec 15 / E-02, RF-093/095); hook de token y espejo auth.users (spec 04); docker-compose y Supabase CLI (spec 01, F-05).
- PL-10: `kernel/kernel-infra` es la raíz (K -> ORG -> SEG, K -> EVT).
- Constitución aplicable (CLAUDE.md): reglas 2, 3, 4, 6, 8, 9, 10; DoD completo.

## 2. RF
| ID | Nombre | Permiso | Prioridad | Fase |
|---|---|---|---|---|
| TR-RF-092 | Publicar evento de dominio en el outbox | plat.evento.publicar | Must | MVP (el plan lo ubica en R0 vía F-06) |

- Módulo MOD-13 Eventos (TR-EVT), APP-03, proceso TR-P12, actor "Módulo de producto consumidor", RNF TR-RNF-106 y 117, regla TR-RN-034. Sin IA. Interfaz (hoja Componentes): `EventoPort.publicar(evento)`.
- Precondición: el módulo ejecuta un caso de uso dentro de una transacción.
- Flujo básico: 1) el caso de uso modifica el agregado e invoca publicar; 2) se valida el payload contra el esquema registrado del tipo de evento; 3) se inserta la fila en el outbox con el tenant y la sucursal del contexto; 4) al confirmar la tx el evento queda visible al despachador; si se revierte, no existe.
- Datos/validaciones: `event_id` (uuid); `tenant_id`; `sede_id` (sucursal, opcional); `aggregate_type` (texto 1-40); `aggregate_id` (uuid); `event_type` (texto 1-60, ej. ticket.atendido); `version` (bigint); `origin` (CLOUD|EDGE); `payload` (JSON); `schema_version` (smallint).
- Salida: evento persistido atómicamente con el cambio de negocio.
- F-04 no tiene RF: su campo `rf` en el plan es `TR-RNF` (genérico, sin ID concreto).

## 3. Criterios GWT (TR-RF-092)
- **TR-CA-225** (Positivo, "Evento con la venta"): DADO QUE una caja registra la venta V-001200 | CUANDO la transacción se confirma | ENTONCES existe en el outbox el evento venta.registrada con la versión del agregado
- **TR-CA-226** (Negativo, "Transacción revertida"): DADO QUE una venta falla al validar stock después de publicar | CUANDO la transacción se revierte | ENTONCES no existe ningún evento venta.registrada para esa venta
- **TR-CA-227** (Negativo, "Payload fuera de esquema"): DADO QUE el esquema de cita.creada exige fecha_hora | CUANDO un módulo publica el evento sin fecha_hora | ENTONCES el sistema lanza error de validación y la transacción no se confirma

No hay GWT para F-04 ni para reglas/RNF de infraestructura. Estado de prueba en el SRS: Pendiente.

## 4. Reglas y RNF
En el SRS los RNF se llaman `TR-RNF-xxx` (el encargo los nombra `RNF-xxx`).
| ID | Texto corto |
|---|---|
| TR-RN-001 | Toda entidad de negocio pertenece a tenant -> empresa -> sucursal -> unidad y lleva tenant_id; ninguna consulta cruza tenants. |
| TR-RN-034 | Todo evento se inserta en el outbox en la misma tx que el cambio de negocio; entrega al menos una vez; consumidor idempotente por event_id. |
| TR-RN-035 | La lectura del outbox por cursor solo devuelve eventos con antigüedad mayor al margen configurable (defecto 5 s). Origen `sync.read_events`: es del relay (spec 15), pero condiciona el diseño de la tabla. |
| TR-RNF-006 | Respaldo diario, retención 30 días, RPO <= 24 h, RTO <= 4 h; prueba de restauración mensual. En el SRS solo está enlazado a TR-RF-083; en el plan aplica a prod Pro (F-04 / P-01). |
| TR-RNF-010 | Aislamiento por tenant con doble barrera: contexto de aplicación + RLS; 0 accesos cruzados en pruebas automatizadas. |
| TR-RNF-011 | TLS 1.2+ en tránsito, cifrado en reposo, secretos en gestor de secretos; 100 % endpoints con TLS. |
| TR-RNF-106 | Despacho desde outbox al menos una vez; retraso p95 < 5 s; 0 eventos perdidos al reiniciar workers (alcance MOD-13; verificación completa en el relay). |
| TR-RNF-113 | Secretos del tenant cifrados con clave por tenant en gestor de secretos; 0 secretos en texto plano en BD o repo (escaneo en CI). |
| TR-RNF-117 | Contratos de eventos versionados (schema_version) en registro de esquemas, compatibles hacia atrás con 2 versiones previas (CI). |

Heredados por CLAUDE.md y relevantes: 008 (idempotencia), 025 (cobertura dominio >= 70 %), 026 (logs sin datos personales).

## 5. Historias del backlog (3_plan.json)
| ID | Sprint | Horas | Descripción | rf |
|---|---|---|---|---|
| F-04 | 0 | 3 | Supabase: proyectos dev y prod, claves JWT asimétricas (ES256), Data API sin esquemas de plataforma, SMTP propio | TR-RNF (tipo Ops, componente TR-SEG) |
| F-06 | 0 | 5 | kernel y kernel-infra: AggregateRoot, DomainEvent, UnitOfWork, AlsTenantContext, OutboxPublisher | TR-RF-092 (tipo Back, componente Kernel) |

Relacionadas (otros specs): F-02/F-03 (monorepo), F-05 (docker-compose + Supabase CLI + flujo de migraciones), E-02 (relay outbox, 6 h, sprint 7), P-01 (plan Pro, respaldos, 5 h, sprint 11). Hito H0: "CI verde; login de prueba contra Supabase dev" (01/11/2026).

## 6. Tablas SQL, eventos, puertos y permisos
- **Tabla outbox**: no hay DDL en `codigo/`. El plan menciona `db/01e_sync_outbox.sql` (estructura_backend.txt y docx), el SRS cita `sync.read_events` y "integracion/sql/01_outbox", y PL-08 dice "escribe sync.outbox". Ninguno de esos archivos existe en el repo de docs. Columnas deducibles solo de TR-RF-092 (sección 2); índice, cursor y secuencia no están definidos.
- **RLS existente**: `db/01a_org.sql` usa `current_setting('app.tenant_id', true)::uuid` en las políticas (con `ENABLE ROW LEVEL SECURITY`, sin `FORCE`). El UoW debe fijar ese setting con `SET LOCAL`.
- **Data API**: `supabase/migrations/20261102000000_seg_supabase_auth.sql` líneas 99-100 hacen `REVOKE ALL ON ALL TABLES` y `REVOKE USAGE ON SCHEMA` de `seg, org` a `anon, authenticated`. Un esquema `sync` nuevo necesita lo mismo (no cubierto hoy).
- **Eventos**: el kernel define `EventoDominio` sin eventos concretos. venta.registrada, cita.creada y ticket.atendido son ejemplos de los GWT.
- **Puertos** (estructura_backend.txt, `libs/plataforma/kernel/src`): `agregado.ts`, `evento-dominio.ts`, `resultado.ts`, `reloj.port.ts`, `id.port.ts`, `unidad-de-trabajo.port.ts`, `contexto-tenant.port.ts`, `errores-dominio.ts`. `EventoPort` (SRS) no figura en el árbol del kernel.
- **kernel-infra** (type:backend): `typeorm-unidad-de-trabajo.ts` (SET LOCAL app.tenant_id -> RLS), `als-contexto-tenant.ts`, `outbox.publicador.ts`, `reloj-sistema.ts`, `uuid-v7.ts`, `filtro-errores.http.ts`.
- **Permiso**: `plat.evento.publicar` (RF-092); es una llamada interna, no un endpoint.
- **F-04 (docx 3.1)**: ES256 con JWKS `/auth/v1/.well-known/jwks.json`; SMTP propio (Resend o SES) y plantillas en español; Data API sin esquemas de plataforma; publishable key en frontends, secret key solo en `apps/api` y script de migración; el docx habla de tres proyectos (dev Free, staging Free, prod Pro con respaldos diarios).
- **Etiquetas Nx** (`2_Estructura/eslint.boundaries.snippet.js`): kernel = `scope:plataforma` + `type:domain` (solo depende de domain); kernel-infra = `type:backend` (depende de backend, domain, util). El snippet incluye scopes `psi`/`nucleo` de otro proyecto; hay que adaptarlo.

## 7. Código base relacionado
Raíz: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.
- **Falta**: no existe código de kernel ni kernel-infra en `codigo/`. AggregateRoot, DomainEvent, UnitOfWork, AlsTenantContext y OutboxPublisher se escriben desde cero. Tampoco existe `codigo/db/01e_sync_outbox.sql` (solo `01a_org.sql` y `01b_seg.sql`), ni `supabase/config.toml`, `seed.sql` o `templates/` (solo descritos en el árbol).
- **Conservar / tomar como referencia**:
  - `codigo/libs/plataforma/seguridad/src/infrastructure/supabase-jwks.verificador.ts`: jose `createRemoteJWKSet`, `algorithms: ['ES256','RS256']`, exige claims `sub, exp, iat, session_id, aal`. Confirma la config ES256 de F-04 (el verificador es del spec 04).
  - `codigo/libs/plataforma/seguridad/package.json` y `tsconfig.json`: convención `@vitrina/plataforma-seguridad`, ESM, imports con `.js`, NestJS ^12.2.0, TS ~5.9.3.
  - `codigo/libs/plataforma/seguridad/src/domain/errores.ts`: errores como clases; el kernel aporta `errores-dominio.ts` común.
  - `codigo/db/01a_org.sql` (RLS por `app.tenant_id`) y `codigo/supabase/migrations/20261102000000_seg_supabase_auth.sql` (REVOKE a anon/authenticated).
  - `codigo/supabase/tests/00_simular_supabase_SOLO_PRUEBAS.sql` y `correr_pruebas.sh`: patrón de pruebas SQL contra PostgreSQL local, reutilizable para el outbox.
- **Cambiar**: `seguridad` no usa kernel (sin `AsyncLocalStorage`, UoW ni outbox); specs 04/06 deberán adaptarse. PL-05 ya asume `SET LOCAL app.tenant_id` + outbox en el caso de uso.
- **Versiones**: el backend del código base ya usa NestJS 12. `codigo/libs/shared/auth` (Angular) no aplica a este spec; usa `signal/computed/inject/input/effect`, que existen en Angular 21, y no se vio ninguna API exclusiva de Angular 22 (LEEME y docx dicen "verificado contra Angular 22.2"; revisar en spec 05).

## 8. Diagramas relevantes (`1_Mermaid/`)
- PL-10 Dependencias entre componentes (kernel como raíz).
- PL-05 Secuencia solicitud autorizada (paso `SET LOCAL app.tenant_id -> RLS · transacción + outbox`).
- PL-09 Ambientes y flujo de entrega (Supabase dev/staging Free, prod Pro; migración reversible).
- PL-03 Autenticación con Supabase Auth y autorización propia (contexto de F-04).
- PL-08 Integración SazónPOS (apps/worker, "escribe sync.outbox").
- PL-01 Hoja de ruta (R0: Supabase, kernel, kernel-infra).

## 9. Ambigüedades y preguntas candidatas (Fase 2)
Ambigüedades:
- F-04 dice dev y prod; el docx (3.1, costos, PL-09) dice dev, staging y prod. Staging reaparece en E-04 (spec 17).
- Falta el DDL del outbox: ¿`01e_sync_outbox.sql` entra en este spec o en el 15? RF-092 (publicar) es de este spec, el relay es del 15.
- La validación contra "esquema registrado" (paso 2 de RF-092, TR-CA-227) pertenece a TR-EVT; no está claro si el spec 02 incluye un registro mínimo.
- Nombres: el plan usa inglés (AggregateRoot, DomainEvent, UnitOfWork, AlsTenantContext, OutboxPublisher); el árbol, español (`agregado`, `evento-dominio`, `unidad-de-trabajo`, `als-contexto-tenant`, `outbox.publicador`). El roadmap añade "Resultado", que F-06 no menciona.
- RF-092 usa `sede_id` y `origin` CLOUD|EDGE, mientras la jerarquía dice sucursal.
- ES256 y SMTP son configuración manual en Supabase con credenciales que entrega el usuario (CLAUDE.md): la verificación no es automatizable en CI.

Preguntas candidatas, con recomendación:
1. ¿Se crea también staging? Recomendación: solo dev y prod, como F-04; staging en spec 17; anotar la discrepancia del docx.
2. ¿Quién entrega `sync.outbox`? Recomendación: este spec crea la tabla mínima (columnas de RF-092, RLS por tenant, índice para lectura por cursor, esquema fuera de la Data API, rollback y prueba SQL); `sync.read_events` y TR-RN-035 quedan al spec 15.
3. ¿Validación de payload con schema_version aquí? Recomendación: `OutboxPublisher` recibe un puerto `ValidadorEsquemaEvento` con implementación mínima en memoria; el registro completo y compatibilidad (TR-RNF-117) al spec 15. Cubre TR-CA-227 con un esquema de prueba.
4. ¿TypeORM o `pg` directo? Recomendación: TypeORM (el árbol nombra `typeorm-unidad-de-trabajo.ts`); el UoW abre tx, ejecuta `set_config('app.tenant_id', $1, true)` y expone el EntityManager vía ALS.
5. ¿Idioma de nombres? Recomendación: español como el árbol, con tabla de equivalencias con los términos del plan.
6. ¿Se incluyen `Resultado`, `errores-dominio`, `filtro-errores.http`, `uuid-v7` y `reloj-sistema`? Recomendación: sí, mínimos, porque el árbol y el roadmap los nombran; nada más.
7. ¿Cómo se prueba sin credenciales de Supabase? Recomendación: integración de kernel-infra contra PostgreSQL 16 del docker-compose (spec 01); F-04 con checklist manual y login de prueba contra el JWKS de dev (hito H0), con evidencia en el spec.
8. ¿`plat.evento.publicar` lleva `@Permiso`? Recomendación: no; es permiso lógico del puerto, sin endpoint HTTP en este spec.
