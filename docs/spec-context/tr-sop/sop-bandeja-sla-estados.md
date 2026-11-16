# Contexto para sop-bandeja-sla-estados

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes), `3_plan.json`, `plan.md` (6.1), diagramas T-09, OP-10, OP-11, OP-12, specs 17b y 18, código de `libs/plataforma/consola-soporte`, `libs/shared/ui`, `apps/worker`.

## 1. Alcance y dependencias
- Historia **R3-08** (sprint 23, 14 h, Full, R3) cubre RF 111, 113, 114, 115. Este paquete toma 113 y 114 (trabajo del agente); `sop-widget-tickets-comentarios.md` toma 111 y 115.
- Requiere `sop-tickets-nucleo` (modelo `sop`, `politica_sla`, cálculo de vencimientos). PL-10: `NOT --> SOP` (avisos al reportante).
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | sop-bandeja-estados-back | 113, 114 (back) + cierre automático de ESPERA_CLIENTE | 6-7 | sop-tickets-nucleo, 07, 11 |
| b | sop-consola-bandeja-ui | 113, 114, 115 (UI del agente en la consola) | 7 | a, 17b, 15b/15c/15d |

- Áreas de (a): vista `sop.v_tablero_sla` y asignación; máquina de estados con pausa del SLA; tarea de cierre automático. Áreas de (b): bandeja con semáforos y filtros; detalle del ticket con conversación y nota interna; cambiar estado y asignar en panel lateral.
- Fuera de alcance: escalamiento con problema y GitHub (116, 117); ticket desde alerta (112); encuesta de 1 clic (OP-10, sin RF); métricas de cumplimiento de SLA (sin RF).
- Constitución: reglas 1-11 (la bandeja cruza tenants: rol lector `SECURITY DEFINER` o permiso de operador con RLS adecuada, ver pregunta 2); diseño UI (pantalla tipo lista + detalle; `vit-chip-estado` para estado y semáforo).

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-113 | Gestionar bandeja de tickets por SLA | plat.soporte.bandeja | APP-01 | TR-RN-037 | TR-RNF-002, 020 | Agente de soporte (N1/N2) |
| TR-RF-114 | Cambiar estado del ticket con control de SLA | plat.soporte.estado | APP-01 | TR-RN-038, 037 | TR-RNF-020, 013 | Agente de soporte (N1/N2), Usuario operativo |

- **113** precondición: rol de soporte de plataforma. Flujo: abre la bandeja; se consulta `sop.v_tablero_sla` con semáforos por plazo; filtra y toma o asigna; la asignación queda como evento del ticket. Datos: filtros producto, nivel (N1|N2), estado, prioridad, tenant; columnas numero, titulo, prioridad, estado, `primera_respuesta_vence`, `resolucion_vence`, `asignado_a`. Salida: bandeja priorizada. Relacionados: TR-SOP, TR-ORG.
- **114** precondición: ticket existe y no está CERRADO. Flujo: elige estado y comenta; se valida contra `sop.transicion`; al entrar a ESPERA_CLIENTE guarda `pausado_desde` y al salir suma la pausa al vencimiento; registra CAMBIO_ESTADO y notifica al reportante. Datos: `ticket_id`, `estado_nuevo` (EN_ANALISIS|ESPERA_CLIENTE|ESCALADO_N2|RESUELTO|CERRADO|REABIERTO), `comentario` (3-2000). Relacionados: TR-SOP, TR-NOT.

## 3. Criterios GWT
| ID | RF | Tipo | Escenario |
|---|---|---|---|
| TR-CA-275 | 113 | Positivo | P2 con primera respuesta en 20 min → primero y en ámbar con tiempo restante |
| TR-CA-276 | 113 | Negativo | Asignar a Pedro sin rol de soporte → «El usuario no es agente de soporte» |
| TR-CA-277 | 114 | Positivo | Vencía 16:00, ESPERA_CLIENTE desde 12:00, cliente responde 14:00 → EN_ANALISIS y vence 18:00 |
| TR-CA-278 | 114 | Negativo | NUEVO → CERRADO → «Transición no permitida: NUEVO → CERRADO» |
| TR-CA-279 | 114 | Positivo | RESUELTO; el cliente dice que persiste → REABIERTO |

Faltan (proponer): ticket vencido en rojo; umbral de «por vencer» (TR-CA-275 sugiere ámbar con ≤ 20 min, el SRS no fija el umbral); pausa que cruza fuera de horario LABORAL (¿se suma tiempo hábil o reloj?); cierre automático de ESPERA_CLIENTE a los 5 días (OP-11); usuario operativo intenta un estado de agente (solo REABIERTO o confirmar); bandeja filtrada por tenant; agente N1 no ve tickets N2 (si aplica).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-038 | Transiciones: NUEVO → EN_ANALISIS/RESUELTO; EN_ANALISIS → ESPERA_CLIENTE/ESCALADO_N2/RESUELTO; ESPERA_CLIENTE → EN_ANALISIS/CERRADO; ESCALADO_N2 → EN_ANALISIS/RESUELTO; RESUELTO → CERRADO/REABIERTO; REABIERTO → EN_ANALISIS (`sop.transicion`). |
| TR-RN-037 | Plazos por plan y prioridad; horario LABORAL de Lima; pausa en ESPERA_CLIENTE. |
| TR-RNF-002 | Bandeja p95 < 1,5 s con hasta 100 000 registros. |
| TR-RNF-013 | Cambios de estado trazables (evento del ticket; auditoría). |
| TR-RNF-020 | Aprendizaje < 1 h. |

Heredados por CLAUDE.md: 001/003, 008, 010, 011, 012, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | RF | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-08 | 23 | 14 | TR-SOP | Widget de soporte con contexto, bandeja por SLA, estados y comentarios | TR-RF-111, 113, 114, 115 | Full | R3 |

Relacionadas: R3-09 (escalamiento y problemas, mismo sprint), S-06 (spec 18). `plan.md` 6.1: «Soporte (bandeja por SLA)» en `plataforma-consola` R3.

## 6. Tablas SQL, eventos, puertos y permisos
- `sop.transicion` (global, sembrada con TR-RN-038): `desde`, `hasta`, `actor` (AGENTE|CLIENTE|SISTEMA). El dominio replica la tabla para validar sin BD; un test compara ambas.
- `sop.ticket` (del núcleo) usa `asignado_a`, `nivel`, `pausado_desde`, `resuelto_en`, `cerrado_en`, `version` (bloqueo optimista).
- `sop.v_tablero_sla`: tickets abiertos con `semaforo` (EN_PLAZO|POR_VENCER|VENCIDO) calculado contra el vencimiento más próximo, orden prioridad y vencimiento. Cruza tenants: función `SECURITY DEFINER` con dueño `sop_lector` (patrón `aud.tenants_con_eventos`, `sync.estado_outbox`) o endpoint de operador.
- **Eventos** (propuestos): `sop.ticket.asignado`, `sop.ticket.estado_cambiado` (`desde`, `hasta`), `sop.ticket.cerrado` (lo consume SEG: `RevocarAccesosPorTicket`).
- **Puertos**: `BandejaSla` (lectura), `DirectorioAgentes` (¿el usuario tiene rol de soporte? TR-CA-276; implementado con seg), `CalculadoraVencimientos` (núcleo), `Notificador`.
- **Permisos** (SRS): `plat.soporte.bandeja`, `plat.soporte.estado`. Agregar ambos y `plat.soporte.comentar` a `PLAT_AGENTE_SOPORTE` (hoy: `plat.soporte.solicitar`, `plat.tenant.consultar`, `plat.sesion.contexto`). El cliente usa `plat.soporte.estado` limitado a REABIERTO/CERRADO (confirmar) por regla de dominio.
- **Endpoints** (propuestos): `GET /v1/sop/bandeja`, `POST /v1/sop/tickets/{id}/asignar`, `POST /v1/sop/tickets/{id}/estado`, `GET /v1/sop/tickets/{id}` (vista de agente con notas).
- **Worker**: tarea diaria o por hora que cierra ESPERA_CLIENTE sin respuesta en N días (OP-11) y RESUELTO sin respuesta (ver `sop-escalamiento-github-alertas.md`, RF 117).
- **Migración**: `db/01?_sop_bandeja.sql` o dentro de `01?_sop.sql` si va en el mismo release.

## 7. Código base relacionado
- `libs/plataforma/consola-soporte` (spec 18): rutas `consola/soporte` con `accesos-soporte` y `solicitar-soporte`, guard `permisoGuard(PERMISO_SOLICITAR_SOPORTE)`, clientes HTTP, `tenants-soporte.cliente.ts`. Es la UI del acceso temporal (TR-SEG), no de tickets; la bandeja puede sumarse aquí como páginas `bandeja/` y `ticket/` (pregunta 1).
- `apps/plataforma-consola/src/app/app.routes.ts` monta `consola/soporte` detrás de `aal2Guard`.
- Patrón de transición con historial: `seg.acceso_soporte` (estados PENDIENTE/APROBADO/REVOCADO/..., `causa_cierre`), `Membresia.finalizar`.
- Tareas BullMQ periódicas: `apps/worker/src/soporte/tarea-vencimiento-soporte.ts` (vence accesos cada minuto).
- UI: `vit-tabla` (con `ColumnaTabla.movil`), `vit-filtros`, `vit-chip-estado` + `TonoEstado` (mapa propio de la feature), `PanelLateralService`, `insignias-menu.service.ts` (contador de tickets por vencer).
- `codigo/` del plan: nada.

## 8. Diagramas relevantes
- `01-analysis/.../6_Plataforma_Operacion/OP-11_Ciclo_de_vida_del_ticket.mmd` (estados y causas; cierre «sin respuesta en 5 días» y «pasan 3 días»).
- `01-analysis/.../6_Plataforma_Operacion/OP-10_Proceso_de_atencion_de_incidencias.mmd` (N1 funcional, N2 técnico).
- `01-analysis/.../6_Plataforma_Operacion/OP-12_...` y `8_Diseno_Piloto/2_Plataforma_Transversal/T-09_...`.

## 9. Ambigüedades y preguntas candidatas
1. ¿Lib de UI? Recomendación: ampliar `consola-soporte` con `pages/bandeja` y `pages/ticket-detalle` (mismo actor y permisos de agente); renombrar no hace falta.
2. ¿La bandeja cruza tenants con RLS? Recomendación: función `SECURITY DEFINER` de lectura con dueño `sop_lector` que solo devuelve columnas de la bandeja (sin descripción ni contexto); el detalle se abre con el `tenant_id` del ticket en contexto.
3. ¿Pausa en tiempo hábil o reloj? TR-CA-277 suma 2 h de reloj. Recomendación: sumar el tiempo hábil consumido en pausa según el horario de la política; en CONTINUO coincide con el reloj y TR-CA-277 pasa igual.
4. ¿Umbral «por vencer»? Recomendación: 25 % del plazo de la prioridad o 30 min, lo que sea menor; constante con nombre.
5. ¿Niveles N1/N2? El SRS no los liga a roles. Recomendación: dos roles, `PLAT_AGENTE_SOPORTE` (N1) y `PLAT_AGENTE_SOPORTE_N2`; N2 ve todo y N1 no recibe ESCALADO_N2.
6. ¿Plazo de cierre automático? OP-11 dice 5 días (ESPERA_CLIENTE) y 3 días (RESUELTO); RF 117 dice 5 días (RESUELTO, parámetro). Recomendación: dos parámetros TR-CFG con 5 por defecto; manda el SRS.
7. ¿Qué cambios puede hacer el cliente? Recomendación: REABIERTO desde RESUELTO y CERRADO (confirmar) desde RESUELTO; responder en ESPERA_CLIENTE mueve a EN_ANALISIS automáticamente (comentario público del reportante).
