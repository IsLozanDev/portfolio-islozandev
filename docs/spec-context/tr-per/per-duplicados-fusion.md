# Contexto para per-duplicados-fusion

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (RF, Criterios GWT, Reglas de negocio, RNF, Componentes), `3_plan.json` (R2-12), plan (sec. 7, CC-06), diagramas T-05, CC-D02, CC-D09, PL-10, código real en `libs/`. Rutas P y D como en `per-registro-roles-contactos.md`.

## 1. Alcance y dependencias
- TR-RF-042 es Should y fase R2 en el SRS. El plan lo une a SazónPOS: R2-12 "CC-06 Personas por tenant con fusión de duplicados" (sprint 16, 8 h, tipo SazónPOS, rf "CC-06, TR-RF-042"). No hay historia de plataforma propia.
- Lib `libs/plataforma/personas` (back) y pantalla en `libs/plataforma/admin-cliente` (APP-02, actor administrador del cliente).
- Dependencias: `per-registro-y-roles` y `per-contactos-direcciones` (las fichas a comparar), 20a (auditoría), 11 (outbox/relay, consumidores), 16a/17c (admin-cliente), 15b/15c/15d (diseño UI). La reasignación en los productos depende de cada consumidor; en R2 el único es SazónPOS (CC-06).
- Partición propuesta (la parte SazónPOS de R2-12 no es de plataforma):

| Spec | Slug | RF | h | Áreas | Depende de |
|---|---|---|---|---|---|
| A | per-duplicados-fusion | 042 back | 7 | (a) detección de candidatos con puntaje; (b) fusión transaccional con alias de la absorbida + `persona.fusionada`; (c) HTTP | per-registro-y-roles, per-contactos-direcciones, 20a, 11 |
| B | per-fusion-ui | 042 UI | 6 | lista de pares candidatos (`vit-tabla`), comparación lado a lado con elección de campos en panel lateral, confirmación con motivo (`AvisosService`, `vit-destructivo`) | A, 17c, 15b/15c/15d |
| — | (SazónPOS CC-06) | — | resto de R2-12 | consumidor de `persona.fusionada` que reasigna referencias en SazónPOS | A; fuera de este repo |

- Fuera de alcance: migración de clientes de SazónPOS a `per` (CC-06), deshacer una fusión, detección por IA o fonética avanzada, fusión entre tenants (prohibida por TR-RN-001).
- Constitución aplicable: reglas 1-6, 8, 10, 11; código limpio; estructura de libs Angular y diseño UI (B); DoD.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-042 | Detectar y fusionar personas duplicadas | plat.persona.fusionar | APP-02 | TR-RN-013, 034 | TR-RNF-021, 013 | Administrador del cliente |

- Should, R2, proceso TR-P10, componentes TR-PER, TR-EVT, TR-AUD.
- Precondición: al menos dos personas candidatas.
- Flujo: 1) propone pares con puntaje de similitud (mismo documento con distinto tipo, mismo nombre y celular); 2) el actor revisa y elige la ficha que se conserva y los campos de cada una; 3) confirma con motivo; 4) publica `persona.fusionada`; cada producto reasigna referencias y la absorbida queda como alias.
- Datos: `persona_conservada_id`, `persona_absorbida_id`, `campos_elegidos` (JSON), `motivo` (5-300).
- Salida: una sola ficha vigente con referencias reasignadas.

## 3. Criterios GWT
| ID | Tipo | Escenario |
|---|---|---|
| TR-CA-107 | Positivo | «Juana Quispe Mamani» DNI 45781236 y «Juana Quispe» sin documento con celular 987654321; se fusiona conservando la del DNI: una ficha y las citas de ambas bajo ella |
| TR-CA-108 | Negativo | DNI distintos 45781236 y 45781237: bloquea con «Las personas tienen documentos distintos» |

Estado SRS: Pendiente. TR-CA-107 habla de "citas" (producto agenda, no SazónPOS): en plataforma se prueba con un consumidor de prueba de `persona.fusionada` que reasigna referencias por `event_id` (idempotente). Faltan y se proponen: motivo de menos de 5 caracteres rechazado; fusionar consigo misma rechazado; absorbida ya fusionada -> rechazo; roles y contactos de la absorbida pasan a la conservada sin duplicar principales; búsqueda por documento de la absorbida resuelve a la conservada (alias); auditoría con antes/después; UI en claro, oscuro y 600 px.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-013 | Lo referenciado no se elimina: se inactiva o cierra; código único por tenant (base de "absorbida queda como alias"). |
| TR-RN-034 | `persona.fusionada` en el outbox en la misma tx; consumidores idempotentes por `event_id`. |
| TR-RN-001 | Fusión solo dentro del tenant. |
| TR-RNF-021 | Confirmación explícita y motivo obligatorio en acciones irreversibles. |
| TR-RNF-013 | Fusión auditada con antes y después. |

Heredados por CLAUDE.md: 001/002/003, 008, 010, 011, 012, 024/119, 025, 026, 101, 106, 112.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | RF | Tipo | Release |
|---|---|---|---|---|---|---|
| R2-12 | 16 | 8 | SazónPOS | CC-06, TR-RF-042 | SazónPOS | R2 |

Sprint 16 (2027-05-31 a 2027-06-13): "Notificaciones, administración de FE y personas en SazónPOS", 18/20 h. Plan sec. 7: CC-06 "Personas por tenant con fusión de duplicados", S16, 8 h. CC-D02: "persona única por restaurante" -> "persona por tenant + identidad DNI/RUC". Las 8 h cubren CC-06 entero; la parte de plataforma (A + B, unas 13 h) no tiene horas asignadas.

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta: `db/01j_per_fusion.sql` (+ rollback y test).
- Cambios propuestos:
  - `per.persona`: `fusionada_en_id` (uuid nulo, FK a `per.persona`), `fusionada_en` (timestamptz). La absorbida queda inactiva y apunta a la conservada (alias, T-05 no lo modela).
  - `per.fusion`: `id`, `tenant_id`, `persona_conservada_id`, `persona_absorbida_id`, `campos_elegidos` jsonb, `motivo`, `fusionado_por`, `fusionado_en`. Registro histórico (la auditoría guarda antes/después).
  - Candidatos: consulta calculada (vista o función) con puntaje; sin tabla, salvo que se quiera descartar pares ("no son la misma persona", P4). Extensión `pg_trgm` posible para similitud de nombres (verificar en Supabase).
  - RLS por `app.tenant_id`; REVOKE a `anon, authenticated`.
- Evento: `persona.fusionada` (SRS) con `persona_conservada_id`, `persona_absorbida_id`, `tenant_id`. Esquema registrado como los de CAT.
- Puertos: `PersonaPort.buscar` resuelve alias a la conservada. Consume `AuditoriaPort.registrar`.
- Permiso: `plat.persona.fusionar` (SRS). Por ser irreversible, candidato a `sensible: true` en el manifiesto (aal2, TR-RN-009 menciona anular y otorgar roles, no fusionar: P3).
- Endpoints propuestos: `GET /v1/personas/duplicados?pagina`, `GET /v1/personas/duplicados/{a}/{b}` (comparación), `POST /v1/personas/fusiones`.
- Menú: nueva opción en `plat.manifiesto.json` bajo un módulo "Personas" en admin-cliente.

## 7. Código base relacionado
- `libs/plataforma/auditoria`: `AuditoriaPort`, `calcularCambios` (diferencias antes/después reutilizables para la comparación).
- `libs/plataforma/eventos`: `SuscribirEvento` para el consumidor de prueba; `kernel-infra/OutboxPublisher`.
- `libs/plataforma/catalogos`: patrón de `VerificadorReferencias` (los productos registran su verificador); análogo posible para "reasignar referencias" síncronas, aunque el RF pide evento.
- `libs/plataforma/admin-cliente`: páginas con `vit-tabla`, `PanelLateralService`, `AvisosService` (patrón de 16a/17c/19e).
- `libs/shared/ui`: `vit-tabla`, `vit-chip-estado`, `vit-estado-vacio`, `vit-acciones-formulario`, clase `vit-destructivo`.
- Nada en `codigo/` de P. Lib `personas` no existe todavía.

## 8. Diagramas relevantes
- D/`8_Diseno_Piloto/2_Plataforma_Transversal/T-05_Modelo_de_dominio_Personas_e_identidad.mmd`
- D/`7_Control_Cambios_SazonPOS/CC-D02_Situacion_actual_y_situacion_objetivo.mmd`
- D/`7_Control_Cambios_SazonPOS/CC-D09_Dependencias_entre_solicitudes_de_cambio.mmd` y `CC-D10_Cronograma_propuesto.mmd` (CC-06)
- P/`1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd`
- Canvas «Vitrina · Diseño UI» (CLAUDE.md): pantalla tipo lista + detalle; la comparación lado a lado no existe como pantalla tipo (P6).

## 9. Ambigüedades y preguntas candidatas
1. ¿R2-12 incluye la parte de plataforma? Recomendación: separar A y B como specs de plataforma (unas 13 h) antes de CC-06; las 8 h de R2-12 quedan para SazónPOS. Ajustar el sprint 16 o mover 042 (Should) si no cabe.
2. Algoritmo de puntaje. Recomendación: reglas fijas y explicables: mismo número con distinto tipo (100), mismo celular + nombre normalizado igual (80), mismo celular + similitud de nombre >= 0,8 con `pg_trgm` (60); umbral mínimo 60. Sin IA.
3. ¿`plat.persona.fusionar` sensible (aal2)? Recomendación: sí; es irreversible y toca datos personales.
4. Pares descartados. Recomendación: tabla `per.par_descartado` para no volver a proponer un par revisado; si no cabe, fuera de alcance.
5. ¿Qué pasa con roles, contactos, direcciones y consentimientos de la absorbida? Recomendación: roles y contactos se mueven sin duplicar (principal según `campos_elegidos`); consentimientos se conservan como historial bajo la conservada sin cambiar decisiones (Ley 29733: no se infiere consentimiento).
6. Pantalla de comparación sin pantalla tipo. Recomendación: diseñarla primero en el canvas (regla de CLAUDE.md) como variante de detalle con dos columnas y radio por campo; a 600 px, una columna con selector.
7. Consumidor que falla al reasignar. Recomendación: confiar en reintentos y cola de fallidos del relay (spec 11); la absorbida como alias resuelve lecturas mientras tanto.
