# Contexto para cfg-historial-parametros

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx (hojas RF, Criterios GWT, Reglas de negocio, RNF), `3_plan.json`, specs 09, 20a, 20b, 20c, `libs/plataforma/parametros`, `libs/plataforma/auditoria`.

## 1. Alcance y dependencias
- Componentes TR-CFG (MOD-04) y TR-AUD (MOD-12), procesos TR-P03 y TR-P11. Historial de cambios de un parámetro con valor anterior, nuevo, alcance, usuario y fecha, leído de la auditoría.
- Release: SRS Should/R2. El plan no le da historia en R2 (el backlog R2 no la incluye) ni la menciona en R4: **sin dueño**. El spec 09 la dejó fuera («Historial de cambios TR-RF-034, `plat.parametro.historial`, TR-CA-088 y 089 (R2)»; «No: … tabla de historial»).
- **Qué cubre ya la auditoría**: nada para CFG. El spec 20a dejó fuera «Auditar eventos de CFG, SEQ, CAT y SEG»: `EVENTOS_AUDITADOS` (`libs/plataforma/auditoria/src/interface/auditoria.consumidor.ts`) solo lista eventos de tenant, suscripción, empresa, sucursal y unidad. Ninguna ruta de `parametros` usa `@Auditable` (el único uso es un controlador de prueba en `auditoria/test/support`). La consulta del 20b (`GET /v1/aud/eventos`) ya filtra por `entidadTipo`/`entidadId`, pero con `plat.auditoria.consultar`, no con el permiso de 034.
- Horas estimadas: 4-6 h (un spec). Depende de 09, 11, 20a, 20b; la UI depende de la pantalla de parámetros de `admin-cliente`, que **no existe** (opción de menú `/admin/parametros` en el manifiesto sin página; ver README).
- Áreas (≤ 3): (a) auditar `parametro.cambiado` (consumidor de AUD) con `entidad_tipo = 'parametro'`, `entidad_id = codigo`, antes/después; (b) endpoint de historial por código con `plat.parametro.historial` y alcance; (c) relleno opcional del histórico desde `sync.outbox` y UI si ya existe la pantalla de parámetros.
- Fuera de alcance: pantalla de parámetros completa (resto de D-05), auditar SEQ, CAT y SEG (mismo patrón, otro spec), historial de definiciones (cambios del manifiesto).
- Constitución: 1, 3, 4 (consumidor idempotente por `event_id`), 5, 7 (CFG y AUD no se importan entre sí: PL-10 los pone hermanos bajo SEG), 8, 11; código limpio.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-034 | Consultar historial de cambios de parámetros | plat.parametro.historial | APP-02 | TR-RN-028 | TR-RNF-013, 002 | Administrador del cliente, Agente de soporte (N1/N2) |

- **034** precondición: existen cambios registrados en la auditoría. Flujo: 1) abre el historial del parámetro; 2) el sistema consulta TR-AUD filtrando por entidad parámetro y código; 3) muestra antes y después en orden cronológico inverso. Datos: codigo, fecha_desde, fecha_hasta; respuesta: alcance, valor_anterior, valor_nuevo, usuario, fecha. Salida: historial visible del parámetro. Relacionados: TR-CFG, TR-AUD.

## 3. Criterios GWT
- **TR-CA-088** (Positivo, «Historial de IGV»): `plat.igv.tasa` cambió de 18 a 10 para «Pollería Don Lucho SAC» el 01/01/2026 | abre el historial | cambio con anterior 18, nuevo 10, usuario y fecha.
- **TR-CA-089** (Borde, «Parámetro sin cambios»): `plat.sesion.minutos_inactividad` nunca modificado | abre el historial | «Sin cambios; se usa el valor por defecto».

Faltan y se proponen: restablecer (`restablecido = verdadero`) aparece como cambio a «valor por defecto»; un admin con alcance de sucursal solo ve cambios de sus sucursales y del nivel tenant/empresa que lo afectan; tenant A no ve el historial de B; parámetro inexistente → 404 `PARAMETRO_NO_DEFINIDO`; evento reentregado no duplica la fila (idempotencia, ya probada en 20a); valores sensibles (si una definición se marca así) se muestran enmascarados.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-028 | Auditoría solo inserción, hash encadenado, conservación ≥ 5 años. |
| TR-RNF-013 | Toda operación crítica en auditoría inmutable con usuario, fecha, origen y contexto. |
| TR-RNF-002 | Listados paginados p95 < 1,5 s con hasta 100 000 registros por tenant (índice `evento_auditoria_tenant_fecha_ix`; puede requerir índice por `(tenant_id, entidad_tipo, entidad_id, ocurrido_en)`). |

Heredados por CLAUDE.md: 008, 010, 012, 024/119, 025, 026 (valores no van a logs), 101, 106.

## 5. Historia del backlog
Sin historia (ni en R2 ni en R4). Relacionadas: D-01 (spec 09, parámetros), E-01 (specs 20a/20b/20c, auditoría), D-05 (UI de parámetros y series, sin dueño tras 19e).

## 6. Tablas SQL, eventos, puertos y permisos
- **Sin tabla nueva**: el historial es una lectura de `aud.evento_auditoria` (`db/01g_aud.sql`). Solo una migración pequeña para el índice si la medición lo pide: `db/01<letra>_aud_indice_entidad.sql` (siguiente letra libre al implementar; `01j` a `01m` quedan para PER, IDN, ARC y FE).
- **Evento que se audita**: `parametro.cambiado` (`EVENTOS_CFG.parametroCambiado`), payload `schema_version = 1`: `codigo`, `alcance`, `empresa_id`, `sucursal_id`, `valor_anterior`, `valor`, `restablecido`, `por` (`ESQUEMAS_CFG` en `libs/plataforma/parametros/src/infrastructure/event-schemas.ts`). Trae todo lo que pide 034 sin cambiar el evento.
- **Mapeo propuesto** en el consumidor de AUD: `accion = 'plat.parametro.cambiar'` (o `restablecer`), `entidad_tipo = 'parametro'`, `entidad_id = codigo`, `antes = {valor: valor_anterior}`, `despues = {valor, alcance, empresa_id, sucursal_id}`, `sucursal_id` del payload. Hoy `AuditarEventoDePlataforma` pone `despues = payload enmascarado` y `antes = NULL`: hay que permitir un mapeo por tipo.
- **Endpoint**: `GET /v1/aud/parametros/{codigo}/historial?desde&hasta&pagina&tamano` en `auditoria` (lee su propia tabla; CFG no se toca) o en `apps/api` componiendo ambos. `@Permiso('plat.parametro.historial')`, alcance según `alcance-actor`.
- **Permisos**: `plat.parametro.historial` (nuevo en el manifiesto PLAT, hoy 1.15.0; asignar a `PLAT_PROPIETARIO` y al rol de soporte).
- **Relleno**: `sync.outbox` no se purga (specs 11 y 21 dejaron la purga fuera), así que los `parametro.cambiado` previos siguen ahí; el spec 11 dejó fuera «reentrega del histórico a consumidores nuevos». Un comando del worker puede reencolar esos eventos al consumidor de AUD (idempotente por `event_id`).

## 7. Código base relacionado
- **Ya existe**: `parametros` (`fijar-valor.ts`, `restablecer-valor.ts`, `publicar-eventos.ts`, `PERMISOS_CFG`, `GET/PUT /v1/cfg/parametros/:codigo/valores`); `auditoria` (`EVENTOS_AUDITADOS`, `AuditoriaConsumidor` con un método `@SuscribirEvento` por tipo, `FiltroAuditoria` con `entidadTipo`/`entidadId`, `calcularCambios`, `PERMISOS_AUD`, `GET /v1/aud/eventos`); `admin-cliente` (`auditoria-lista`, `auditoria-detalle` con diferencias antes/después del 20c, reutilizables para mostrar el historial).
- **Ojo**: `apps/worker/src/worker.module.ts` no llama a `registrarEsquemasCfg`; el consumidor de AUD en el worker necesita el esquema de `parametro.cambiado` si valida (hoy el relay no valida payload).
- **Falta**: tipo en `EVENTOS_AUDITADOS` + mapeo, endpoint con permiso propio, mensaje «Sin cambios; se usa el valor por defecto», UI (depende de la pantalla de parámetros).

## 8. Diagramas relevantes
- `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd` (`SEG --> CFG & AUD`, `EVT --> AUD`).
- `01-analysis/.../8_Diseno_Piloto/2_Plataforma_Transversal/T-04_Modelo_de_dominio_Catalogos_parametros_y_correlativos.mmd` (`ParametroDef`, `ParametroValor`).
- `.../T-S7_Secuencia_Relay_del_outbox_hacia_los_consumidores.mmd`.

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- Release: R2 en el SRS, sin historia en el plan; es pequeño y se apoya en piezas ya hechas.
- El actor «Agente de soporte» ve el historial de un tenant: ¿solo con acceso de soporte vigente (TR-RN-011, spec 18)?
- Sin pantalla de parámetros no hay dónde poner el historial en la UI.

Preguntas, con recomendación:
1. ¿Cuándo? Recomendación: junto con la pantalla de parámetros de `admin-cliente` (pendiente de D-05) o justo antes; el back cabe en 4 h y puede ir ya.
2. ¿Auditar por evento o con `@Auditable`? Recomendación: por evento (`parametro.cambiado` ya existe y trae `valor_anterior`), igual que ORG en el 20a; sin tocar CFG.
3. ¿Dónde vive el endpoint? Recomendación: en `auditoria` (es una vista filtrada de su tabla) con permiso `plat.parametro.historial`; CFG no importa AUD.
4. ¿Relleno del histórico? Recomendación: sí, comando de una vez en el worker que reencola los `parametro.cambiado` del outbox al consumidor de AUD; idempotente.
5. ¿Soporte? Recomendación: el agente de soporte solo con acceso de soporte APROBADO y vigente (contexto de soporte del spec 18), como el resto de lecturas de un tenant.
6. ¿Aprovechar para SEQ, CAT y SEG? Recomendación: no en este spec; dejar el mapeo por tipo listo para que sumar `serie.*`, `catalogo.*` y `asignacion.*` sea agregar entradas.
