# Contexto para rep-definiciones-ejecucion-exportacion

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores), `3_plan.json`, `plan.md`, `2_Estructura/`, `1_Mermaid/PL-10`, specs 18b, 20a, 20b y 19b, código de `libs/plataforma/*`.

## 1. Alcance y dependencias
- Historia **R3-04** (sprint 20, 8 h, Full, R3): «Definiciones de reportes, ejecución y exportación», RF 096 y 097. El sprint 20 tiene 16 h (Fiestas Patrias) y lo comparte con R3-03 (pagos, 8 h).
- Módulo MOD-14 (TR-REP), proceso TR-P13. Lib backend prevista: `libs/plataforma/reportes` (árbol del plan: `reportes/ (R3) TR-REP`). Pantalla R3 del plan: «reportes» en `plataforma-admin / admin-cliente`.
- PL-10 **no dibuja TR-REP**. Dependencias reales según la hoja RF: 096 → TR-SEG; 097 → TR-SEG, TR-ARC, TR-AUD, TR-NOT. ARC (R2-03) y NOT (R2-09) son R2: deben estar implementados antes del modo asíncrono.
- Horas reales estimadas: unas 20 h (el plan cuenta 8). Partición propuesta (≤10 h y ≤3 áreas cada una):

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | rep-definiciones-motor | 096; 097 síncrono (≤10 000 filas, en pantalla paginado) | 7 | 06/07 (permisos, alcance), 20a (`AuditoriaPort`), manifiesto (spec 06) |
| b | rep-exportacion-asincrona | 097 exportar XLSX/CSV/PDF, segundo plano >10 000 filas, permiso de exportación con datos personales, auditoría | 8 | a, 11 (worker), TR-ARC (R2-03), TR-NOT (R2-09); PDF: R2-06 si deja motor PDF |
| c | rep-ui-admin | UI de 096-097 en `admin-cliente` | 6 | a, b, 15/15b/15c/15d, 17c |

- Tres áreas de (a): definición desde el manifiesto y validación; motor de ejecución con alcance; API `/v1/rep`.
- Fuera de alcance: programación de envíos (RF 098) y tableros (RF 099), ver `rep-programacion-tableros.md`; copiloto analítico IA (TR-P13 paso IA, TR-IA en R4).
- Constitución: reglas 1, 2, 3 (RLS en las vistas), 4, 5, 6, 7, 8, 10, 11 (consulta de la vista con QueryBuilder; SQL crudo solo si la vista lo exige, con razón); DoD completo.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-096 | Registrar definiciones de reportes | plat.reporte.definir | APP-03 | TR-RN-007, 047 | TR-RNF-120, 010 | Planificador de tareas |
| TR-RF-097 | Ejecutar y exportar reporte | plat.reporte.ejecutar + permiso del reporte | APP-02 | TR-RN-007, 047 | TR-RNF-125, 002 | Administrador del cliente, Usuario operativo, Encargado de facturación |

- **096** precondición: se aplica el manifiesto del producto. Flujo: el manifiesto declara los reportes; se valida consulta de solo lectura con parámetros obligatorios de tenant y alcance; se registra o actualiza. Datos: `codigo` (p. ej. `rest.ventas_por_plato`), `nombre`, `consulta` (SQL parametrizado o vista), `filtros[]` (nombre, tipo, obligatorio), `columnas[]`, `permiso`, `datos_personales`, `formatos[]` (XLSX|PDF|CSV). Salida: reporte visible para quien tiene el permiso. Relacionados: TR-REP, TR-SEG.
- **097** precondición: el usuario tiene el permiso del reporte. Flujo: elige reporte y filtros; se suman los filtros de alcance; ≤10 000 filas estimadas se muestra, si no corre en segundo plano y avisa; al exportar con datos personales se exige el permiso de exportación y se audita. Datos: `reporte`, `filtros` (JSON), `formato`, `alcance` (calculado), `archivo_resultado` (expira a las 72 h). Relacionados: TR-REP, TR-SEG, TR-ARC, TR-AUD, TR-NOT.
- Interfaz (hoja Componentes): «API interna. Motor de reportes declarados en manifiesto (ejecutar, exportar XLSX/PDF/CSV, programar); tableros por rol». Consumidores: 9 sistemas (REST, PSI, LIB, GYM, CLI, DOC, ECO, LEX consumen; COL evalúa).

## 3. Criterios GWT
| ID | RF | Tipo | Escenario |
|---|---|---|---|
| TR-CA-235 | 096 | Positivo | Manifiesto REST declara `rest.ventas_por_plato` → aparece para quien tiene `rest.reporte.ventas` |
| TR-CA-236 | 096 | Negativo | Consulta sin `:tenant_id` → se rechaza la definición por no garantizar aislamiento |
| TR-CA-237 | 097 | Positivo | Admin ejecuta ventas por plato de septiembre (1 200 filas) y exporta XLSX → archivo con 1 200 filas y totales |
| TR-CA-238 | 097 | Borde | 250 000 filas → segundo plano y aviso cuando el archivo está listo |
| TR-CA-239 | 097 | Negativo | Reporte con datos personales sin permiso de exportación → bloquea exportar, permite ver en pantalla |

Faltan (proponer): alcance de sucursal (usuario con alcance SUCURSAL solo ve su sucursal, análogo a TR-CA-214); aplicar dos veces el mismo manifiesto = 0 cambios (TR-RNF-120); archivo vencido a las 72 h responde 410; exportación auditada con filtros y número de filas; frontera exacta 10 000 / 10 001 filas; reporte de otro producto sin suscripción no aparece. Todos en estado Pendiente en el SRS.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-007 | Permisos `producto.recurso.accion` por alcance TENANT/EMPRESA/SUCURSAL/UNIDAD; PLAT no depende de suscripción. |
| TR-RN-047 | Exportación con datos personales: permiso específico, auditada, archivo expira a las 72 h. |
| TR-RNF-120 | Manifiesto versionado aplicado idempotente en cada despliegue: 2 aplicaciones = 0 cambios, < 30 s. |
| TR-RNF-125 | Síncrono ≤ 10 000 filas en < 10 s; asíncrono hasta 1 000 000 filas en < 5 min (Should). |
| TR-RNF-002 | Listados paginados p95 < 1,5 s con hasta 100 000 registros por tenant. |
| TR-RNF-010 | Aislamiento por tenant con doble barrera: contexto + RLS. |
| TR-RNF-013 | Exportación queda en auditoría inmutable. |

Heredados por CLAUDE.md: 001/003, 008, 011, 012, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | RF | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-04 | 20 | 8 | TR-REP | Definiciones de reportes, ejecución y exportación | TR-RF-096, 097 | Full | R3 |

Relacionadas: R2-03 (TR-ARC, archivos y URL firmada), R2-09 (TR-NOT correo), R2-06 (PDF de la representación impresa), 18b y 20b (exportaciones XLSX ya hechas), R3-03 (mismo sprint).

## 6. Tablas SQL, eventos, puertos y permisos
- **Esquema `rep`** (propuesto): `rep.definicion` (global: `producto_codigo`, `codigo` PK, `nombre`, `vista`, `filtros` jsonb, `columnas` jsonb, `permiso`, `datos_personales`, `formatos` text[], `version_manifiesto`, `actualizado_en`); `rep.ejecucion` (por tenant con RLS: `id`, `tenant_id`, `usuario_id`, `reporte_codigo`, `filtros` jsonb, `formato`, `estado` PENDIENTE|EN_PROCESO|LISTO|FALLIDO|EXPIRADO, `filas`, `archivo_id` de TR-ARC, `expira_en`, `creado_en`, `version`).
- **Vistas de reporte**: cada producto las crea en su migración (esquema `rep_<producto>` o el suyo) con `security_invoker = true` para que aplique la RLS de las tablas base, y columnas obligatorias `tenant_id` y `sucursal_id`. La validación de 096 comprueba que la vista existe y expone esas columnas (traduce TR-CA-236 de «parámetro `:tenant_id`» a «columna de tenant + RLS»).
- REVOKE a `anon, authenticated` en `rep` y en los esquemas de vistas (regla 8).
- **Eventos**: el SRS no define eventos de TR-REP. Propuesto: `rep.ejecucion.lista` y `rep.ejecucion.fallida` (los consume TR-NOT para el aviso de TR-CA-238). Registrar esquemas como `registrarEsquemasAud`.
- **Puertos**: `DefinicionesReporte` (registrar desde manifiesto), `MotorReportes` (`contar`, `pagina`, `recorrer` por lotes), `EscritorExportacion` por formato (XLSX/CSV/PDF), `AlmacenArchivos` (TR-ARC), `AuditoriaPort` (20a), `AlcanceActor` (seg) para las sucursales del alcance.
- **Permisos**: `plat.reporte.definir` (sistema, sin endpoint), `plat.reporte.ejecutar`, más el permiso declarado por cada reporte (p. ej. `rest.reporte.ventas`). El SRS no da código del permiso de exportación (TR-RN-047): ver pregunta 3.
- **Endpoints** (propuestos, `/v1/rep`): `GET /reportes` (los visibles), `GET /reportes/{codigo}`, `POST /reportes/{codigo}/ejecutar` (pagina o crea ejecución), `GET /ejecuciones/{id}`, `GET /ejecuciones/{id}/archivo` (URL firmada), `GET /reportes/{codigo}/exportar?formato=` (síncrono, al vuelo).
- **Nx**: lib `libs/plataforma/reportes` con `scope:plataforma`, `type:backend`, `comp:rep`. `eslint.config.mjs` no tiene `comp('rep', ...)`: agregar `comp('rep', 'kernel', 'seg', 'aud', 'evt')` (+ `arc` cuando exista) y caso en `tools/boundaries-test`.
- **Migración**: `db/01?_rep.sql` + `db/rollback/` + `db/tests/`. Hoy la última letra es `01i`; usar la siguiente libre al implementar. El runner ordena alfabéticamente (lección del spec 21).

## 7. Código base relacionado
- **Manifiesto**: `libs/plataforma/seguridad/src/domain/manifiesto.ts` ya acepta la clave raíz `reportes` y solo valida `codigo` (1-80); no la persiste. `plat.manifiesto.json` 1.15.0 tiene `"reportes": []`. Hay que extender el validador (filtros, columnas, permiso, formatos) o delegar a un puerto de REP.
- **Exportación XLSX** (antecedente a unificar): `seguridad/src/infrastructure/xlsx/escritor-bitacora.xlsx.ts` (83 líneas) y `auditoria/src/infrastructure/xlsx/escritor-auditoria.xlsx.ts` (104 líneas) repiten `fechaLima`, anchos y `exceljs.stream.xlsx.WorkbookWriter`. Patrón común (18b, 20b): `contar`, auditar antes del primer byte (503 `AUDITORIA_NO_DISPONIBLE`), recorrer por keyset en lotes de 1 000, tope 10 000 (422 `EXPORTACION_DEMASIADO_GRANDE`). `exceljs` 4.4.0 en `package.json`.
- **Asíncrono**: `apps/worker` con BullMQ; el importador 19b (`apps/worker/src/importaciones`) da el patrón de trabajo largo con avance.
- **Alcance**: `AlcanceActor` y `DirectorioSeg` exportados por `@vitrina/plataforma/seguridad` (20b).
- **UI**: `vit-tabla`, `vit-filtros`, `vit-estado-vacio`, `vit-cargando` en `libs/shared/ui`; botón Exportar de `bitacora-lista` (18b) como patrón.
- **Falta**: lib `reportes`, esquema `rep`, motor, escritores CSV/PDF, TR-ARC y TR-NOT (R2). `codigo/` del plan no trae nada de reportes.

## 8. Diagramas relevantes
- `1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd` (sin REP: hueco a resolver).
- `1_Mermaid/PL-01_Hoja_de_ruta_de_releases.mmd`, `PL-02_Cronograma_de_sprints_e_hitos.mmd` (sprint 20).
- `01-analysis/.../5_Componentes_Transversales/TR-01_Mapa_de_componentes_transversales_de_la_plataforma.mmd` (nodo «Reportes»).
- `01-analysis/.../7_Control_Cambios_SazonPOS/CC-D07_CC_07_Eventos_de_dominio_desde_triggers.mmd` (outbox hacia «Notificaciones · reportes»).

## 9. Ambigüedades y preguntas candidatas
1. ¿SQL libre en el manifiesto o vistas? Recomendación: vistas `security_invoker` creadas por migración del producto; el manifiesto solo nombra la vista, filtros y columnas. Evita validar SQL arbitrario y deja la RLS como segunda barrera.
2. ¿Dónde vive el alcance? Recomendación: el motor añade `sucursal_id IN (:sucursales del alcance)` desde `AlcanceActor`; la RLS cubre el tenant.
3. ¿Permiso de exportación con datos personales? Recomendación: un permiso PLAT `plat.reporte.exportar_datos_personales` (sensible, aal2, vetado a soporte como `plat.auditoria.exportar`), además del permiso del reporte.
4. ¿Unificar los escritores XLSX? Recomendación: un `escribirHojaXlsx(columnas, lotes, salida)` genérico en `kernel-infra` (lo pueden importar seg, aud y rep); migrar 18b y 20b es opcional y va en la parte b si cabe.
5. ¿Asíncrono sin TR-ARC/TR-NOT? Recomendación: no adelantar R3-04 a R2; si ARC/NOT no están, la parte b solo deja la exportación síncrona con tope 10 000 (como 18b/20b) y el asíncrono espera.
6. ¿PDF? Recomendación: PDF solo si R2-06 dejó un motor PDF reutilizable; si no, XLSX y CSV y PDF a un spec aparte.
7. ¿Totales (TR-CA-237)? Recomendación: columnas con `total: SUMA` en el manifiesto; el motor los calcula sobre el mismo filtro.
8. ¿Retención de `rep.ejecucion`? Recomendación: marcar EXPIRADO a las 72 h con tarea del worker y borrar el archivo en ARC; la fila queda 13 meses.
9. Sin productos con reportes declarados en R3 (PLAT tiene `reportes: []`). Recomendación: un reporte PLAT de prueba (p. ej. usuarios por sucursal) para cubrir los GWT hasta que SazónPOS declare los suyos.
