# Contexto para sop-escalamiento-github-alertas

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Actores), `3_plan.json`, `plan.md`, diagramas T-09, OP-01, OP-03, OP-10, OP-11, OP-12, PL-10, código de `libs/plataforma/{eventos,seguridad,parametros}` y `apps/worker`.

## 1. Alcance y dependencias
- Historia **R3-09** (sprint 23, 4 h, Back, R3): «Escalamiento a N2 y vínculo con GitHub», RF 116 y 117.
- **RF 112 (ticket automático desde alerta) no tiene historia** en el plan: R3-10 cubre 106-109 y R3-08 cubre 111, 113-115. Se agrega aquí porque es SOP y depende de OBS.
- PL-10: `OBS --> SOP` y `NOT --> SOP`. RF 116 cita TR-INT (R4, fuera del plan): GitHub va detrás de un puerto dentro de SOP, sin TR-INT.
- Calendario: R3-09 (sprint 23) va antes que R3-10 (sprint 24); 112 solo puede implementarse después de `obs-evaluador-alertas`.
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | sop-problemas-github | 116, 117 (back + panel en la consola) | 7-8 | sop-tickets-nucleo, sop-bandeja-estados-back, 09 (parámetro de días), TR-NOT para avisos |
| b | sop-ticket-desde-alerta | 112 | 2-3 | sop-tickets-nucleo, obs-evaluador-alertas |

- Áreas de (a): agregado `Problema` con vínculo de tickets; puerto `GestorIssues` con adaptador GitHub y reintento; resolución en lote y cierre automático. (b) es un consumidor idempotente del evento de alerta.
- Fuera de alcance: sincronizar estado desde GitHub (webhook de issues cerrados, sin RF); Projects de GitHub (OP-01 los nombra, sin RF); base de conocimiento (118).
- Constitución: reglas 1-11, en especial 10 (GitHub detrás de puerto y adaptador) y 9 (token de GitHub solo por entorno, en `apps/api` y `apps/worker`).

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-112 | Crear ticket automático desde alerta | plat.sistema.job | APP-03 | TR-RN-036, 037 | TR-RNF-127, 008 | Planificador de tareas |
| TR-RF-116 | Escalar a N2 y vincular problema con GitHub | plat.soporte.problema | APP-01 | TR-RN-038, 039 | TR-RNF-024, 013 | Agente de soporte (N1/N2), GitHub |
| TR-RF-117 | Resolver problema y cerrar tickets vinculados | plat.soporte.problema | APP-01 | TR-RN-038 | TR-RNF-020, 005 | Agente de soporte (N1/N2), Planificador de tareas |

- **112** precondición: la regla de la alerta tiene `crea_ticket`. Flujo: el evaluador abre la alerta; invoca `sop.crear_desde_alerta(alerta_id)`; verifica que no exista ticket para esa alerta; crea INCIDENTE con título y detalle de la alerta, sin reportante, en la bandeja N1. Datos: `alerta_id` (único en ticket); severidad → impacto/urgencia (CRITICA 1/1, ALTA 1/2, MEDIA 2/2, BAJA 3/3); `canal` ALERTA. Relacionados: TR-SOP, TR-OBS.
- **116** precondición: ticket EN_ANALISIS. Flujo: N1 escala a ESCALADO_N2; N2 crea un problema o vincula a uno existente; si no tiene issue lo crea en GitHub con título, pasos y contexto técnico; el problema muestra tickets y enlace `org/repo#n`. Datos: `producto_codigo`, `titulo` (5-200), `github_issue`, `estado` (ABIERTO|EN_CURSO|RESUELTO), `tickets_vinculados[]`. Relacionados: TR-SOP, TR-INT.
- **117** precondición: el problema tiene tickets vinculados. Flujo: marca RESUELTO con versión; `sop.resolver_problema` resuelve los tickets abiertos; notifica a cada reportante con la versión; el planificador cierra los RESUELTO con 5 días sin respuesta del cliente. Datos: `problema_id`, `version_correccion` (semver), `dias_cierre_automatico` (parámetro, 5). Relacionados: TR-SOP, TR-NOT, TR-CFG.

## 3. Criterios GWT
| ID | RF | Tipo | Escenario |
|---|---|---|---|
| TR-CA-273 | 112 | Positivo | Alerta CRITICA de emisión de comprobantes → ticket P1 canal ALERTA vinculado |
| TR-CA-274 | 112 | Borde | La alerta ya generó `SOP-000310` → no crea otro y devuelve `SOP-000310` |
| TR-CA-283 | 116 | Positivo | Tres tenants con «PDF de boleta sin QR»; N2 crea el problema y lo vincula → issue en GitHub y los tres tickets muestran el problema |
| TR-CA-284 | 116 | Negativo | GitHub no responde → problema guardado sin issue, «Issue pendiente de crear» con reintento |
| TR-CA-285 | 117 | Positivo | Problema con 3 tickets abiertos resuelto con 2.3.1 → los 3 RESUELTO y aviso con la versión |
| TR-CA-286 | 117 | Borde | Un ticket vinculado ya CERRADO → solo se resuelven los abiertos |

Faltan (proponer): ticket que no está EN_ANALISIS no se escala; el issue no lleva datos personales ni nombre del tenant; reintento que finalmente crea el issue una sola vez (idempotencia por `problema_id`); cierre automático a los 5 días (con parámetro cambiado a 3); versión no semver rechazada; alerta resuelta antes de atender el ticket (qué pasa con el ticket); alerta de regla sin `crea_ticket` no crea ticket.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-036 | Prioridad por impacto + urgencia (CRITICA 1/1 → P1). |
| TR-RN-037 | Plazos por plan y prioridad (el ticket de alerta usa el plan del tenant). |
| TR-RN-038 | Transiciones permitidas (ESCALADO_N2 solo desde EN_ANALISIS; RESUELTO desde EN_ANALISIS, ESCALADO_N2, NUEVO). |
| TR-RN-039 | Contexto técnico sin DNI, contraseñas, tokens ni tarjetas (también en el issue). |
| TR-RNF-127 | Detección y ticket oportunos; 0 duplicados. |
| TR-RNF-008 | Idempotencia: un ticket por alerta. |
| TR-RNF-024 | Límites de módulos (GitHub detrás de puerto; SOP no importa OBS por código, solo consume eventos). |
| TR-RNF-005, 013, 020 | Disponibilidad, trazabilidad, aprendizaje. |

Heredados por CLAUDE.md: 001/002/003, 010, 011, 012, 025, 026, 101, 106, 119.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | RF | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-09 | 23 | 4 | TR-SOP | Escalamiento a N2 y vínculo con GitHub | TR-RF-116, 117 | Back | R3 |

RF 112: sin historia. Relacionadas: R3-08 (núcleo y bandeja), R3-10 (alertas), R2-09 (correo), R3-11 (WhatsApp).

## 6. Tablas SQL, eventos, puertos y permisos
- `sop.problema` (global, OP-12/T-09): `id`, `producto_codigo`, `titulo`, `descripcion_tecnica`, `github_issue` (`org/repo#n`, nulo), `issue_pendiente` (bool), `intentos_issue`, `estado`, `version_correccion`, `resuelto_en`, `creado_por`, `version`. Sin `tenant_id`: agrupa tickets de varios tenants.
- `sop.ticket.problema_id` (FK) y `sop.ticket.alerta_id` (UNIQUE parcial no nulo) del núcleo.
- Función `sop.resolver_problema(problema_id, version)`: cruza tenants; `SECURITY DEFINER` o recorrido por tenant con contexto (pregunta 3).
- **Eventos** consumidos: `obs.alerta.abierta` (propuesto en `tr-obs-negocio/obs-alertas-salud.md`), con `crea_ticket`. Publicados (propuestos): `sop.problema.creado`, `sop.problema.resuelto`, `sop.ticket.estado_cambiado` por cada ticket resuelto (TR-NOT avisa).
- **Puertos**: `GestorIssues` (`crearIssue({ repositorio, titulo, cuerpo }) → { numero, url }`), adaptador `GestorIssuesGitHub` (REST de GitHub con token de entorno) y nulo para pruebas; `RepositorioPorProducto` (mapa `producto_codigo → org/repo`, parámetro TR-CFG o configuración); `ProblemasRepositorio`; `Notificador`.
- **Worker**: reintento de issues pendientes (BullMQ con espera exponencial); cierre automático diario de RESUELTO sin respuesta del cliente en `dias_cierre_automatico`.
- **Permisos** (SRS): `plat.soporte.problema`, `plat.sistema.job`. Propuesto: solo en el rol N2 (ver `sop-bandeja-sla-estados.md`, pregunta 5).
- **Parámetros TR-CFG** (propuestos): `plat.soporte.dias_cierre_automatico` (5); `plat.soporte.repositorio_github` por producto.
- **Secretos**: `GITHUB_TOKEN` (fine-grained, solo issues:write del repo) en `apps/api` y `apps/worker`, en GitHub Environments y Railway; no en el repo (TR-RNF-113 / gitleaks del spec 21).
- **Nx**: `comp:sop` con `obs` en la matriz no hace falta si 112 solo consume el evento por nombre; mejor no importar `observabilidad-negocio`.
- **Migración**: `db/01?_sop_problemas.sql` (después de `01?_sop.sql`).

## 7. Código base relacionado
- `eventos`: `@SuscribirEvento('obs.alerta.abierta', { consumidor: 'sop-tickets-alerta' })`, idempotencia por `sync.evento_procesado` + UNIQUE `alerta_id` como segunda barrera (TR-CA-274 devuelve el existente).
- `seguridad`: `RevocarAccesosPorTicket` al cerrar en lote (ticket cerrado → accesos de soporte revocados, TR-CA-055).
- `parametros`: `ParametroPort` para los días de cierre.
- Reintentos con espera: `libs/plataforma/eventos/src/infrastructure/bullmq/politica-reintentos.ts`.
- Tareas periódicas: `apps/worker/src/{vencimientos,soporte}`.
- Adaptadores externos detrás de puerto: `observabilidad-arranque/src/infrastructure/sentry.ts` (Sentry), invitación Supabase (`InvitarPropietario`).
- Falta: todo `sop`, cliente GitHub (no hay `@octokit/*` en `package.json`), TR-NOT.

## 8. Diagramas relevantes
- `01-analysis/.../6_Plataforma_Operacion/OP-03_Secuencia_de_la_caida_de_pedidos_al_ticket_con_su_traza.mmd` (`sop.crear_desde_alerta` → ticket P1; nota interna + problema → GitHub #214).
- `01-analysis/.../6_Plataforma_Operacion/OP-10_Proceso_de_atencion_de_incidencias.mmd` (N2: problema, issue, corrección y resolución de tickets enlazados; alerta crea ticket).
- `01-analysis/.../6_Plataforma_Operacion/OP-11_Ciclo_de_vida_del_ticket.mmd`, `OP-12_...`, `OP-01_Mapa_de_la_plataforma_de_operacion.mmd` (problema → GitHub).
- `01-analysis/.../8_Diseno_Piloto/2_Plataforma_Transversal/T-09_...` (Problema, Ticket → Alerta).
- `1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd`.

## 9. Ambigüedades y preguntas candidatas
1. ¿112 por evento o llamada directa? El SRS dice que el evaluador «invoca `sop.crear_desde_alerta`». Recomendación: por evento `obs.alerta.abierta` (respeta OBS → SOP sin acoplar código y es idempotente); `crear_desde_alerta` queda como caso de uso de SOP.
2. ¿Qué pasa con el ticket cuando la alerta se resuelve sola? Sin RF. Recomendación: comentario automático público «La alerta se normalizó a las HH:MM»; el ticket sigue su ciclo (no se cierra solo).
3. ¿Resolver en lote cruzando tenants? Recomendación: el caso de uso recorre los tickets vinculados agrupados por tenant y abre una tx por tenant con su contexto (RLS intacta); el problema es global.
4. ¿Un repositorio por producto? Recomendación: parámetro de plataforma `producto_codigo → org/repo`; sin repositorio configurado, el problema queda con `issue_pendiente` y aviso en la consola.
5. ¿Contenido del issue? Recomendación: título, pasos, contexto técnico del primer ticket (ya limpio), números de ticket y `trace_id`; nunca nombre del tenant ni correos.
6. ¿Plazo de cierre? RF 117 dice 5 días; OP-11 dice 3. Manda el SRS: parámetro con 5 por defecto.
7. ¿4 h alcanzan? No: GitHub con reintento, lote y cierre automático suman 7-8 h. Recomendación: aceptar el desvío o dejar el cierre automático fuera.
