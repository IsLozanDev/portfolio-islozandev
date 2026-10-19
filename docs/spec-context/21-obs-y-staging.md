# Contexto para SPEC 21 · obs-y-staging

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx, plan docx, `3_plan.json`, `2_Estructura/estructura_backend.txt`, PL-01/02/09/10, `codigo/`, estado actual del repo (`specs/01`, `specs/02`, `apps/api`, `.github/workflows/ci.yml`).

## 1. Alcance y dependencias
- Roadmap: spec 21 `obs-y-staging` cubre E-03 y E-04, 8 h, depende de 11 (`evt-outbox-relay`, que crea el worker). Ola 6 (junto a 12, 15, 18, 19).
- Plan: ambas historias en sprint 8 (08/02/2027 a 21/02/2027), release R1. Sprint 8 = 18 h de 20 de capacidad, compartido con la integración SazónPOS (CC-01, CC-03, CC-05 = spec 22). Hito **H2** "Plataforma R1 en staging" (21/02/2027): "api, worker y frontends desplegados en staging con observabilidad" (3_plan.json, PL-02).
- Tres áreas posibles: (a) observabilidad base (OpenTelemetry, Sentry, logs estructurados, interceptor de contexto), (b) imagen/contenedores y pipeline `deploy-staging.yml`, (c) ambiente staging (proyecto Supabase, secretos, dominios).
- Fuera de alcance: observabilidad de negocio TR-OBS (indicadores por minuto, reglas de alerta, salud por tenant: RF-106 a 110) que el plan ubica en R3 (PL-01: "TR-OBS negocio"; sprint 24; roadmap "obs-negocio-whatsapp"); plan Pro, respaldos y runbook de producción (P-01, sprint 11); migración de datos y corte (P-02); E2E (Q-01).
- Nota: el SRS marca RF-106 a 110 como "MVP". Manda el plan: en R1 solo hay "TR-OBS base" = E-03.
- PL-10: `EVT --> OBS --> SOP` (OBS depende de EVT; de ahí la dependencia del spec 11).
- Constitución aplicable (CLAUDE.md): reglas 3 (contexto de tenant), 9 (secretos solo por entorno), 6 (migraciones reversibles, relevantes al desplegar a staging); DoD "probada en staging" empieza a ser verificable con este spec.

## 2. RF relacionados
E-03 tiene `rf = TR-RNF` (genérico) y E-04 no tiene RF (campo vacío). El spec no cubre ningún RF; los GWT existentes son de TR-OBS de negocio (R3).

| ID | Nombre | Permiso | Prioridad | Fase SRS | Relación |
|---|---|---|---|---|---|
| TR-RF-106 | Registrar indicadores de negocio por minuto | plat.sistema.job | Must | MVP (plan: R3) | No entra; define el contrato futuro de `libs/plataforma/observabilidad` |
| TR-RF-107 | Configurar reglas de alerta | plat.alerta.regla | Must | MVP (plan: R3) | No entra |
| TR-RF-108 | Evaluar reglas y gestionar alertas | plat.sistema.job | Must | MVP (plan: R3) | No entra |
| TR-RF-109 | Ver salud por tenant y sucursal | plat.salud.ver | Must | MVP (plan: R3) | No entra |
| TR-RF-110 | Reconocer alerta y ver alertas del tenant | plat.alerta.reconocer | Should | MVP (plan: R3) | No entra |
| TR-RF-093 | Despachar eventos a suscriptores internos | plat.sistema.job | Must | MVP | Del spec 11; el worker que se despliega aquí lo corre; TR-RNF-106 se observa con las métricas del relay |
| TR-RF-095 | Reprocesar eventos fallidos | plat.evento.reprocesar | Must | MVP | Del spec 11; candidato a alerta técnica (cola de fallidos) |

Módulo MOD-16 Observabilidad (TR-OBS), APP-01 consola; 5 RF. Procesos TR-P09 (monitoreo y alertas). Reglas del módulo: TR-RN-040 (una alerta abierta por regla y sucursal; línea base para CAIDA_PCT), solo aplica a R3.

## 3. Criterios GWT
No hay GWT para E-03 ni E-04 (son historias Ops sin RF). Los criterios del spec serán de verificación operativa (ver sección 9).
GWT existentes de TR-OBS de negocio, para referencia futura (R3, no entran): TR-CA-259, TR-CA-260 (RF-106); TR-CA-261, TR-CA-262 (RF-107); TR-CA-263, TR-CA-264, TR-CA-265 (RF-108); TR-CA-266, TR-CA-267 (RF-109); TR-CA-268, TR-CA-269 (RF-110).

## 4. Reglas y RNF
En el SRS los RNF se llaman `TR-RNF-xxx`.
| ID | Texto corto | Uso en este spec |
|---|---|---|
| TR-RNF-026 | Logs estructurados con trace_id, tenant y sucursal, sin datos personales; trazas distribuidas OpenTelemetry. Umbral: 100 % de solicitudes trazadas o muestreadas. Verificación: revisión de telemetría | Propio, núcleo de E-03 |
| TR-RNF-111 | Números de documento en logs y bitácoras con hash SHA-256 con sal de plataforma, nunca en claro. 0 DNI/RUC en claro (escaneo semanal con regex) | Propio; define cómo se tratan los identificadores en logs |
| TR-RNF-001 | p95 < 800 ms en mostrador, medido en trazas OpenTelemetry (prueba k6) | Las trazas de E-03 son el instrumento de medida |
| TR-RNF-005 | Disponibilidad API >= 99,5 % mensual; monitoreo sintético cada minuto | Referencia; monitoreo sintético de `/v1/salud` posible en staging |
| TR-RNF-011 | TLS 1.2+ y secretos en gestor de secretos; 100 % endpoints con TLS | Propio de E-04 (dominios, secretos) |
| TR-RNF-113 | 0 secretos en texto plano en BD o repo; escaneo de secretos en CI | Aplica al pipeline de despliegue |
| TR-RNF-028 | Contenedores, API sin estado, escalado 1 a 3 instancias sin errores | Propio de E-04 (api y worker en contenedor) |
| TR-RNF-006 | Respaldo diario, RPO <= 24 h, RTO <= 4 h | Solo prod Pro (P-01); no staging |
| TR-RNF-024 y 119 | Límites de módulos, 0 violaciones | `observabilidad` es lib TR con `index.ts` |
| TR-RNF-126 | Observabilidad de negocio sin datos personales, 13 meses | R3 |
| TR-RNF-127 | Evaluador de alertas cada minuto, sin duplicados | R3 |
| TR-RNF-106 | Despacho outbox, retraso p95 < 5 s | Candidato a métrica técnica del relay |
Heredados: 008, 010, 012, 025 (cobertura dominio >= 70 %), 101.
Regla relacionada: TR-RN-034 (outbox en la misma tx; consumidor idempotente por event_id) y TR-RN-035 (margen de 5 s), del relay (spec 11).

## 5. Historias del backlog (3_plan.json)
| ID | Sprint | Horas | Descripción | Tipo | Componente | Release |
|---|---|---|---|---|---|---|
| E-03 | 8 | 4 | Observabilidad base: OpenTelemetry a Grafana Cloud, Sentry y logs con tenant/sucursal | Ops | TR-OBS | R1 |
| E-04 | 8 | 4 | Staging: api y worker en contenedor, frontends en Vercel, dominios y secretos | Ops | Monorepo | R1 |

Relacionadas: F-04 (Supabase dev/prod, 3 h, spec 02), F-05 (docker-compose, Supabase CLI, migraciones, spec 01), E-02 (relay del outbox, 6 h, sprint 7, spec 11), P-01 (Pro, respaldos, runbook, **alertas**, 5 h, sprint 11), P-02 (pase a producción), Q-01 (E2E, sprint 10). Hitos: H0 (01/11/2026), H2 (21/02/2027), H3 (06/04/2027, producción R1). Tarea de sprint 8 en el docx: "UAT con el cliente piloto en staging" aparece en backlog R1 como parte del ensayo de migración (riesgo "Migración de autenticación de SazónPOS": "ensayo completo en staging").

## 6. Ambientes, costos y diagrama (PL-09)
- PL-09: Local (docker-compose PG16 + Redis, Supabase CLI) -> PR (lint, test, build, boundaries con `nx affected`) -> "merge a main" -> **Staging** (Supabase dev/staging Free; api + worker; Vercel preview) -> "tag vX.Y.Z + aprobación manual" -> Producción (Supabase Pro, respaldos; api + worker; Vercel). Reversión: migración reversible + runbook.
- Docx sección 10: "Tres ambientes con un proyecto Supabase cada uno. Staging se despliega al integrar a main y producción con una etiqueta de versión y aprobación manual." Tabla: Staging = proyecto Free, contenedor (Railway, Render o Fly.io), Vercel (preview), "copia anonimizada para ensayos".
- Docx 3.1 de F-04: "Tres proyectos: desarrollo (Free), staging (Free) y producción (Pro, con respaldos diarios)". Costos 10.3: Supabase Pro USD 25 por proyecto; Free "2 proyectos, se pausan tras 1 semana sin uso"; contenedores "variable, confirmar al contratar"; Redis "gestionado o en el mismo proveedor de contenedores"; Grafana Cloud + Sentry USD 0 mientras se respeten cuotas. Precios de Supabase: confirmar en supabase.com/pricing.
- Discrepancia ya registrada: F-04 (backlog) dice dev y prod; docx y PL-09 dicen tres. `specs/02` (Aprobado) difiere staging a este spec: "El docx lo cita; entra con E-04 (spec 21)".
- CLAUDE.md: "Supabase: un proyecto por ambiente" (coherente con tres proyectos si hay tres ambientes). Credenciales las entrega el usuario cuando se pidan; nunca en el repo.

## 7. Estructura prevista y estado del repo
Del árbol (`estructura_backend.txt`):
- `apps/api/src/tracing.ts`: "OpenTelemetry SDK (exporta a Grafana Cloud por OTLP)"; `main.ts` hace `import './tracing'` primero; `src/config/` zod por ambiente; `Dockerfile` imagen distroless, usuario sin privilegios.
- `apps/worker/src/main.ts`: NestJS 12, BullMQ sobre Redis (relay, notificaciones, vencimientos, FE).
- `libs/plataforma/observabilidad/` (TR-OBS): "interceptor de contexto · métricas · (R3) indicadores de negocio".
- `.github/workflows/`: `ci.yml` · `deploy-staging.yml` · `deploy-prod.yml` (tag + aprobación).
- `supabase/`: `config.toml`, `migrations/`, `templates/`, `seed.sql`; `db/` con `rollback/` y `pruebas/`; `.env.example` sin secretos.
Estado actual (verificado en el repo):
- Existe `.github/workflows/ci.yml` (jobs `nx` con `nx affected -t lint test build` y `migraciones` contra PG16). No existe `deploy-staging.yml`.
- `apps/api`: `main.ts`, `app.setup.ts` (prefijo `v1`, Swagger `v1/docs`), `config/env.ts` (zod: solo `NODE_ENV`, `PORT`), `salud/salud.controller.ts` (`GET /v1/salud`). Sin Dockerfile, sin `tracing.ts`, sin logger estructurado. Sin `apps/worker` (lo crea el spec 11).
- `libs/plataforma/kernel` con nombres en inglés (`clock.port.ts`, `domain-errors.ts`, `id-generator.port.ts`, `result.ts`); `kernel-infra` solo `index.ts` (el contenido, incluido el ALS de contexto de tenant, es del spec 02). No existe `libs/plataforma/observabilidad`.
- `docker-compose.yml` local con `postgres:16` y `redis:7` (healthchecks). `supabase/config.toml` existe.
- No existe ninguna app frontend todavía (aparecen con los specs 15 a 17).
- `specs/02` ya prevé `docs/ops/supabase-ambientes.md` (checklist manual y evidencia por ambiente) y `DATABASE_MIGRATION_URL`; pooler transaccional 6543 para la app y conexión directa/session pooler para migraciones.

## 8. Tablas, puertos, eventos y permisos
- Tablas: ninguna propia. Staging aplica `db/` y `supabase/migrations` existentes. `obs.*` (series por minuto, reglas, alertas, `obs.v_salud_sucursal`) es de R3 y no entra.
- Puertos/contratos: ninguno de dominio. Si se crea `libs/plataforma/observabilidad`, expone solo `index.ts`: interceptor/middleware de contexto (trace_id, tenant_id, sucursal_id desde el ALS de kernel-infra) y fábrica del logger. Regla 10 de CLAUDE.md: Grafana y Sentry detrás de adaptador, no importados desde dominio.
- Eventos: ninguno. Permisos: ninguno (RF-109 `plat.salud.ver` es R3). `GET /v1/salud` ya existe y sirve de sonda.
- Variables de entorno nuevas probables (a validar en zod `config/env.ts`): endpoint y cabeceras OTLP, `SENTRY_DSN`, `APP_ENV`/`NODE_ENV`, `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `REDIS_URL`, URL y claves Supabase (publishable en frontends; secret key solo en `apps/api` y migraciones, regla 9). Nunca en el repo; GitHub Environments para secretos de despliegue.

## 9. Código base relacionado
Raíz: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.
- **Falta en `codigo/`**: no hay `tracing.ts`, Dockerfile, workflows ni libs de observabilidad (solo `db/01a_org.sql`, `01b_seg.sql`, `libs/plataforma/seguridad`, `libs/shared/auth`, `supabase/`). Todo se escribe desde cero a partir de la descripción del árbol y el docx.
- **Referencia**: `seguridad/src/infrastructure/supabase-jwks.verificador.ts` y errores de dominio: lo que se loguea no debe incluir token ni claims personales. Convención de paquetes `@vitrina/plataforma-*`, ESM con imports `.js`.
- **Cambia respecto a la base**: nada que reutilizar en logging; ni `seguridad` ni los SQL tienen instrumentación.
- Versiones: NestJS 12, Node 24 LTS (imagen de contenedor "versión LTS vigente", docx línea sobre contenedores).

## 10. Diagramas relevantes (`1_Mermaid/`)
PL-09 (ambientes y flujo de entrega, el principal), PL-02 (S08 "Observabilidad · staging · CC-01 CC-03 CC-05"; H2), PL-01 (R1 incluye "TR-OBS base"; R3 "TR-OBS negocio"), PL-10 (EVT --> OBS --> SOP), PL-08 (worker y outbox, SazónPOS consume staging para el ensayo).

## 11. Ambigüedades y preguntas candidatas (Fase 2)
Ambigüedades:
- E-03 y E-04 no traen RF ni GWT; los criterios deberán ser verificaciones operativas, no del SRS.
- "Frontends en Vercel" pero no hay frontends hasta los specs 15 a 17 (el spec 21 de la ola 6 corre en paralelo con 15).
- "Alertas" y "métricas" aparecen en el encargo, pero el plan solo menciona alertas en P-01 (producción) y métricas de negocio en R3.
- Free de Supabase: 2 proyectos y pausa tras 1 semana sin uso; con prod Pro, hay que confirmar si dev y staging siguen gratis.
- Hosting del contenedor y de Redis sin elegir ("Railway, Render o Fly.io").
- Nombres: el kernel real está en inglés; el árbol del plan en español. Seguir lo que ya tiene el repo.

Preguntas candidatas, con recomendación:
1. ¿Qué herramientas? Recomendación: las del plan. OpenTelemetry SDK Node (auto-instrumentación HTTP/pg/ioredis) con OTLP a Grafana Cloud; Sentry para errores (`@sentry/nestjs`); logger JSON (pino vía `nestjs-pino`) con `trace_id` inyectado. Muestreo configurable por variable (por ejemplo 10 % en staging) para cuidar las cuotas gratuitas. Todo detrás de `tracing.ts`/adaptador, desactivable si falta la variable (local y CI no exportan).
2. ¿Hosting de staging para api, worker y Redis? Recomendación: Railway (un solo proveedor para api, worker y Redis, despliega imágenes Docker, el docx permite elegir); alternativa Render o Fly.io. Confirmar precio al contratar; fijar la decisión en el spec y no en el código (el contenedor es portable).
3. ¿Dos o tres proyectos Supabase? Recomendación: tres, uno por ambiente (dev, staging, prod), como dice CLAUDE.md, el docx 3.1 y PL-09. Staging aísla migraciones y el ensayo de CC-10 sin tocar dev. Mantener dev y staging en Free (pausan a la semana: documentar cómo reactivar o un ping periódico) y confirmar en supabase.com/pricing el costo adicional de tener prod Pro. El spec 02 ya difirió staging a este spec; aquí se crea con el mismo checklist ES256, Data API sin esquemas de plataforma y SMTP, y se agrega a `docs/ops/supabase-ambientes.md`.
4. ¿Cómo se garantiza "sin datos personales" en logs (TR-RNF-026, TR-RNF-111)? Recomendación: lista blanca de campos de contexto (trace_id, tenant_id, sucursal_id, usuario_id uuid, método, ruta, estado, duración), redacción (`redact`) de `authorization`, cookies, body y query; documentos de identidad solo como hash SHA-256 con sal de plataforma; prueba automática que emite logs con DNI/correo de ejemplo y verifica que no salen en claro. El escaneo semanal por regex de TR-RNF-111 queda como script reutilizable, no como job programado aquí.
5. ¿De dónde sale el contexto tenant/sucursal del log y la traza? Recomendación: del `ContextoTenant` en ALS de kernel-infra (spec 02); un interceptor lo copia a atributos del span y al logger; sucursal opcional hasta que exista `X-Sucursal-Id` (spec 07). `libs/plataforma/observabilidad` tendría solo ese interceptor y la fábrica del logger; las métricas de negocio quedan para R3.
6. ¿Entran métricas y alertas? Recomendación: sí solo técnicas y mínimas: métricas OTel de HTTP y de BullMQ/outbox (profundidad de cola, edad del evento más antiguo, relacionado con TR-RNF-106), y una alerta de ejemplo en Grafana (error rate o salud caída) verificada en staging. Las reglas de producción son de P-01; TR-RF-106 a 110 quedan en R3.
7. ¿Qué se despliega como "frontends en Vercel" si aún no existen? Recomendación: dejar el proyecto Vercel, el dominio y el workflow listos con las variables (publishable key, URL de API) y desplegar la primera app cuando exista (spec 15); cerrar H2 con las apps que haya. Declararlo en el spec como parte no verificable hasta entonces.
8. ¿Cómo se despliega a staging y qué pasa con las migraciones? Recomendación: `deploy-staging.yml` en push a `main`: build de imágenes (api y worker, distroless, usuario sin privilegios), publica en el registro, despliega, corre migraciones de `db/` y `supabase/migrations` con `DATABASE_MIGRATION_URL` (cada una con su rollback verificado en CI) y consulta `/v1/salud`. Secretos en GitHub Environments y variables del proveedor. `deploy-prod.yml` queda para P-01.
9. ¿Datos de staging: seed o copia anonimizada? Recomendación: `seed.sql` con tenant demo y usuarios de prueba ahora; la copia anonimizada de usuarios de SazónPOS se difiere al ensayo de migración (spec 23 / CC-10).
