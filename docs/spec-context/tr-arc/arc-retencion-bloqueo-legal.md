# Contexto para arc-retencion-bloqueo-legal

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (RF, Criterios GWT, Reglas de negocio, RNF, Matriz Proceso-RF), `3_plan.json`, specs 18, 18b, 20b y 20c (decisiones sobre TR-RN-047), diagramas T-07, PL-10, código real en `libs/` y `apps/`. Rutas P y D como en `arc-subida-versiones-url-firmada.md`.

## 1. Alcance y dependencias
- TR-RF-083 es Should y fase R2 en el SRS. No tiene historia en `3_plan.json` (R2-03 cubre 080-082). Este paquete además recoge la expiración de 72 h de TR-RN-047 que los specs 18, 18b, 20b y 20c dejaron pendiente porque "depende de TR-ARC (R2)".
- Lib `libs/plataforma/archivos` (la crea `arc-carga-descarga`). Tarea en `apps/worker`. UI: consola (APP-01) para políticas; bloqueo legal en consola y, para el admin del cliente, en `admin-cliente` (actores del RF).
- Dependencias: `arc-carga-descarga` (archivos, `AlmacenArchivos.borrar`), `arc-versiones` (qué versiones se borran), 20a (auditoría), 09 (TR-CFG si la retención se parametriza), worker (patrón de tareas programadas), 17b/17c (apps).
- Partición propuesta:

| Spec | Slug | RF | h | Áreas | Depende de |
|---|---|---|---|---|---|
| A | arc-retencion-bloqueo-legal | 083 back | 7 | (a) DDL políticas por categoría + bloqueo legal con motivo; (b) tarea diaria que borra de Storage lo vencido sin bloqueo y conserva metadatos y hash; (c) HTTP de políticas y de bloqueo | arc-carga-descarga, arc-versiones, 20a |
| B | arc-retencion-ui | UI de 083 | 6 | consola: políticas por categoría; consola y admin: aplicar o retirar bloqueo legal con motivo (`vit-destructivo` al retirar) | A, 17b, 17c, 15b/15c/15d |
| C (opcional) | arc-exportaciones-72h | TR-RN-047 | 6 | exportaciones de bitácora (18b) y auditoría (20b) como archivo de categoría EXPORTACION que expira a las 72 h y se descarga con URL firmada | A, 18b, 20b |

- Fuera de alcance: copias de seguridad (TR-RNF-006, 30 días: un archivo borrado vive en respaldos hasta 30 días, P5); retención de datos de tablas (auditoría 5 años, TR-RN-028, es de AUD); ARCO/cancelación (R2-17, RF-090); reportes programados (TR-REP, R3).
- Constitución aplicable: reglas 1-6, 8-11; código limpio; estructura de libs Angular y diseño UI (B); verificación con Playwright (B); DoD.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-083 | Aplicar retención y bloqueo legal de archivos | plat.archivo.retencion | APP-01 Consola | TR-RN-028, 047 | TR-RNF-011, 006 | Admin de plataforma, admin del cliente, planificador de tareas |

- Should, R2, procesos TR-P11 y TR-P04, componentes TR-ARC, TR-AUD.
- Precondición: existen políticas de retención por categoría.
- Flujo: 1) el administrador define la retención por categoría; 2) el planificador identifica archivos con retención vencida y sin bloqueo; 3) los elimina del almacenamiento conservando metadatos y hash; 4) un administrador aplica o retira el bloqueo legal con motivo.
- Datos: `categoria`, `retencion_anios` (p. ej. CPE_XML 5, "verificar plazo tributario vigente"), `bloqueo_legal`, `motivo_bloqueo`.
- Salida: archivos eliminados según política y bloqueados preservados.

## 3. Criterios GWT
| ID | Tipo | Escenario |
|---|---|---|
| TR-CA-207 | Positivo | ADJUNTO_SOPORTE con retención de 2 años; el job encuentra adjuntos de octubre de 2024: los elimina del almacenamiento y conserva metadatos |
| TR-CA-208 | Negativo | Adjunto vencido con bloqueo legal por proceso judicial: no se elimina |

Estado SRS: Pendiente. No hay GWT para TR-RN-047 (expiración 72 h). Faltan y se proponen: retirar bloqueo exige motivo y queda auditado (TR-RNF-021, 013); descarga de un archivo eliminado por retención -> 410 con metadatos visibles; categoría sin política -> no se borra nada (retención indefinida); la tarea es idempotente y un fallo de Storage en un archivo no frena el resto (patrón `VencerAccesosSoporte` del spec 18); bloqueo aplicado por el admin del cliente solo sobre su tenant; si entra C: exportación disponible 72 h y luego 410.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-028 | Auditoría inmutable, 5 años (la eliminación por retención y el bloqueo quedan auditados; los metadatos y hash se conservan). |
| TR-RN-047 | Exportaciones con datos personales: permiso de exportación, auditadas y archivos que expiran a las 72 h. |
| TR-RNF-011 | Cifrado en reposo de archivos y secretos en gestor. |
| TR-RNF-006 | Respaldo diario con retención de 30 días; RPO <= 24 h, RTO <= 4 h. |
| TR-RNF-021 | Confirmación y motivo en acciones irreversibles (borrado, retirar bloqueo). |

Heredados por CLAUDE.md: 001/002/003, 008, 010, 012, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
Sin historia para RF-083. R2-03 (sprint 13, 6 h, TR-ARC) cubre 080-082. Relacionadas: R2-05 (CPE_XML/CDR de FE, plazo tributario), R2-17 (ARCO e incidentes, sprint 18), R3-04 (TR-REP exportación, sprint 20). Specs implementados que dejaron TR-RN-047 a medias: 18 ("dependen de TR-REP y TR-ARC"), 18b ("exportación al vuelo... sin archivo guardado, la expiración a 72 h no aplica"), 20b ("No: archivo guardado con expiración de 72 h: depende de TR-ARC (R2). Desviación anotada"), 20c.

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta: `db/01l_arc_retencion.sql` (+ rollback y test), después de `01l_arc.sql`.
- Cambios propuestos:
  - `arc.politica_retencion`: `categoria` PK (FK a `arc.categoria`), `retencion_anios` (nulo = indefinida), `retencion_horas` (para EXPORTACION, 72), `actualizado_por`, `actualizado_en`, `version`. Global de plataforma (P1).
  - `arc.archivo`: `bloqueo_legal` bool, `motivo_bloqueo`, `bloqueado_por`, `bloqueado_en`, `eliminado_en` (los metadatos y hashes de `arc.version_archivo` quedan; estado nuevo `ELIMINADO_POR_RETENCION`).
  - Índice parcial para la tarea: `(categoria, creado_en) WHERE NOT bloqueo_legal AND eliminado_en IS NULL`.
  - La tarea recorre todos los tenants: lectura con función `SECURITY DEFINER` o conexión de plataforma, y borrado tenant por tenant con `SET LOCAL app.tenant_id` (patrón de `VerificarTodosLosTenants` de 20b).
- Eventos propuestos (sin eventos en el SRS para 083): `archivo.eliminado_por_retencion`, `archivo.bloqueo_legal_aplicado`, `archivo.bloqueo_legal_retirado`. Auditoría con `AuditoriaPort.registrar` en bloqueo y retiro.
- Puertos: `ArchivoPort.retencion` (hoja Componentes); `AlmacenArchivos.borrar(ruta)`; `Clock` del kernel para la fecha de corte (fecha de Perú, como el fix reciente de vigencias `01i_seg_vigencia_peru.sql`).
- Permisos: `plat.archivo.retencion` (SRS) para políticas y bloqueo. Proponer separar `plat.archivo.bloqueo_legal` (no está en el SRS) para que el admin del cliente bloquee sin poder cambiar políticas globales.
- Tarea: worker, `upsertJobScheduler` con `tz` America/Lima (patrón `apps/worker/src/vencimientos/tarea-vencimientos.ts`) + CLI manual como `apps/worker/src/cli/ejecutar-vencimientos.ts`.
- Endpoints propuestos: `GET|PUT /v1/archivos/politicas[/{categoria}]`, `POST /v1/archivos/{id}/bloqueo-legal`, `DELETE /v1/archivos/{id}/bloqueo-legal` (con motivo en el cuerpo).

## 7. Código base relacionado
- `apps/worker/src/vencimientos/`, `apps/worker/src/auditoria/tarea-verificacion.ts`, `apps/worker/src/soporte/`: tareas programadas con BullMQ, zona Lima, procesamiento por tenant que no se frena ante un fallo.
- `libs/plataforma/auditoria`: `VerificarTodosLosTenants` (recorrido por tenant), `AuditoriaPort`.
- Exportaciones actuales al vuelo (`exceljs` en streaming, tope 10 000 filas, auditadas antes del primer byte): back en `libs/plataforma/auditoria/src/interface/auditoria.controller.ts` + `infrastructure/xlsx/escritor-auditoria.xlsx.ts` (20b) y `libs/plataforma/seguridad/src/infrastructure/xlsx/escritor-bitacora.xlsx.ts` (18b); front en `libs/plataforma/admin-cliente/src/lib/services/auditoria.cliente.ts`, `bitacora.cliente.ts` y `utils/descarga.ts`.
- `libs/plataforma/parametros` (`PARAMETRO_PORT`) si la retención se parametriza.
- `libs/shared/ui`: `AvisosService` (confirmación con motivo), clase `vit-destructivo`, `vit-tabla`, `PanelLateralService`.
- `codigo/` de P: nada.

## 8. Diagramas relevantes
- D/`8_Diseno_Piloto/2_Plataforma_Transversal/T-07_Modelo_de_dominio_Notificaciones_archivos_auditoria_y_eventos.mmd`
- P/`1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd`
- P/`1_Mermaid/PL-09_Ambientes_y_flujo_de_entrega.mmd` (respaldos y ambientes)
- Canvas «Vitrina · Diseño UI»: pantallas tipo lista, formulario (panel lateral) y confirmación.

## 9. Ambigüedades y preguntas candidatas
1. ¿Política global o por tenant? El RF lista al admin del cliente como actor. Recomendación: políticas globales de plataforma por categoría (normativa); el admin del cliente solo aplica o retira bloqueo legal sobre sus archivos.
2. Plazo de CPE_XML: el SRS dice 5 años "verificar plazo tributario vigente". Recomendación: no fijar el número en código; sembrar CPE_XML como retención indefinida hasta que el usuario confirme el plazo con su contador, y editarlo desde la consola.
3. ¿Se borran todas las versiones o solo las no vigentes? Recomendación: la retención cuenta desde la fecha de la versión; se borran del Storage todas las versiones vencidas, conservando filas y hashes.
4. TR-RN-047 (72 h): ¿pasar 18b/20b a archivo guardado o mantener la exportación al vuelo? Recomendación: mantener al vuelo (no hay archivo que expire, desviación ya aceptada en 18b y 20b) y no hacer C salvo que TR-REP (R3) necesite exportaciones asíncronas; si se hace, categoría EXPORTACION con `retencion_horas = 72` y la misma tarea con frecuencia horaria.
5. Archivos borrados siguen en respaldos 30 días (TR-RNF-006). Recomendación: documentarlo en la política de privacidad; no hay forma de purgar respaldos de Supabase por archivo.
6. ¿Qué ve el usuario al pedir un archivo eliminado? Recomendación: 410 `ARCHIVO_ELIMINADO_POR_RETENCION` con nombre, hash y fecha; la UI lo muestra con `vit-chip-estado` neutro.
7. ¿El bloqueo legal impide también versiones nuevas o borrados manuales? Recomendación: impide cualquier borrado (retención, ARCO, manual); versiones nuevas sí se permiten.
