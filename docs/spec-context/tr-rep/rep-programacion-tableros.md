# Contexto para rep-programacion-tableros

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes), `3_plan.json`, `plan.md` (6.1 Pantallas por release), `1_Mermaid/PL-10`, código de `libs/plataforma/*`.

## 1. Alcance y dependencias
- **Sin historia en el plan.** `3_plan.json` solo trae R3-04 (RF 096, 097) para TR-REP. RF 098 es Should y fase SRS **R2**; RF 099 es Should y fase SRS **MVP**. Como manda el plan, ninguno de los dos está planificado: entran solo si el usuario los agrega al backlog (R3 con holgura o después de H5).
- Módulo MOD-14 (TR-REP), proceso TR-P13 (098 también TR-P06 notificaciones). Lib: la misma `libs/plataforma/reportes` de `rep-definiciones-ejecucion-exportacion.md`.
- Dependencias: 098 → motor de reportes (parte a y b del paquete anterior), TR-NOT (R2-09, correo), TR-ARC (archivo o enlace). 099 → motor de reportes, TR-SEG (roles, permisos por widget), TR-OBS negocio (`obs.metrica_minuto` como fuente de widgets KPI, ver `tr-obs-negocio/`).
- Partición propuesta (unas 18 h en total):

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | rep-programacion-envios | 098 (back + panel lateral en admin-cliente) | 6-7 | rep-definiciones-motor, rep-exportacion-asincrona, TR-NOT, TR-ARC |
| b | rep-tableros-back | 099: tableros y widgets del manifiesto, asignación por rol, cálculo con alcance y periodo | 5-6 | rep-definiciones-motor, 16b (roles) |
| c | rep-tableros-ui | 099: página de tablero en admin-cliente con KPI, línea, barra y tabla | 6 | b, 15/15b/15c/15d, 17c |

- Fuera de alcance: envío por WhatsApp (R3-11 es otro canal), tableros técnicos (Grafana, spec 21), copiloto analítico (TR-IA, R4).
- Constitución: reglas 1-8, 10, 11; diseño UI (pantalla tipo lista/formulario; los gráficos no tienen pantalla tipo: diseñarlos primero en el canvas).

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-098 | Programar envío de reportes | plat.reporte.programar | APP-02 | TR-RN-007, 047 | TR-RNF-125, 124 | Administrador del cliente |
| TR-RF-099 | Configurar tableros por rol | plat.tablero.ver | APP-02 | TR-RN-007 | TR-RNF-002, 020 | Administrador del cliente, Usuario operativo |

- **098** precondición: el usuario y cada destinatario tienen el permiso del reporte. Flujo: define reporte, filtros relativos, frecuencia, hora y destinatarios; se valida el permiso de cada destinatario; el planificador ejecuta a la hora y envía archivo o enlace; historial por ejecución. Datos: `reporte`, `filtros_relativos` (JSON: ayer, semana pasada, mes anterior), `frecuencia` (DIARIA|SEMANAL|MENSUAL), `hora` (HH:MM, America/Lima), `destinatarios[]` (usuarios), `formato`. Relacionados: TR-REP, TR-NOT.
- **099** precondición: el producto declaró tableros y widgets en su manifiesto. Flujo: el administrador asigna tableros a roles; el usuario abre su tablero al ingresar; se calculan widgets con alcance y periodo; el usuario cambia periodo o sucursal dentro de su alcance. Datos: `tablero`, `widgets[]` (tipo KPI|LINEA|BARRA|TABLA, consulta, permiso), `periodo` (HOY|7D|30D|MES), `sucursal`. Relacionados: TR-REP, TR-SEG, TR-OBS.
- El SRS no da permiso para *asignar* tableros a roles (solo `plat.tablero.ver`): ver pregunta 2.

## 3. Criterios GWT
| ID | RF | Tipo | Escenario |
|---|---|---|---|
| TR-CA-240 | 098 | Positivo | Dueño programa ventas del día anterior a las 07:00 → recibe el correo con el Excel de ayer |
| TR-CA-241 | 098 | Negativo | Diego sin permiso del reporte como destinatario → «Diego no tiene permiso para este reporte» |
| TR-CA-242 | 099 | Positivo | Dueño con alcance TENANT abre el tablero de gestión → ventas, ticket promedio y comprobantes de todas las sucursales |
| TR-CA-243 | 099 | Negativo | Cajero sin `rest.reporte.margen` → el widget de margen no se muestra |

Faltan (proponer): destinatario que pierde el permiso después de programado (se omite y queda en el historial); programación en hora de Lima con cambio de mes; reporte programado con datos personales (exige permiso de exportación al programador y a cada destinatario); usuario con alcance SUCURSAL solo ve su sucursal en el tablero; cambio de periodo HOY/7D/30D/MES; tablero sin asignación muestra estado vacío.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-007 | Permisos por alcance; los widgets se filtran por permiso y alcance. |
| TR-RN-047 | Exportación con datos personales: permiso específico, auditada, archivo 72 h (aplica al envío programado). |
| TR-RNF-125 | Síncrono ≤ 10 000 filas < 10 s; asíncrono ≤ 1 000 000 filas < 5 min. |
| TR-RNF-124 | Notificaciones: 95 % entregadas al proveedor < 30 s; failover de canal < 2 min. |
| TR-RNF-002 | Consultas p95 < 1,5 s con 100 000 registros por tenant (cálculo de widgets). |
| TR-RNF-020 | Usuario operativo aprende las tareas principales en < 1 h. |

Heredados por CLAUDE.md: 001/003, 008 (una ejecución programada no se envía dos veces), 010, 011, 012, 013, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
Sin historia. Ninguna fila de `3_plan.json` cita TR-RF-098 ni 099. Relacionadas: R3-04 (motor, prerequisito), R2-09 y R2-10 (TR-NOT correo y recordatorios programados: patrón de tarea periódica), R3-10 (indicadores de negocio, fuente de widgets). `plan.md` 6.1 lista «reportes» en admin-cliente R3 sin distinguir tableros.

## 6. Tablas SQL, eventos, puertos y permisos
- **Propuesto** (esquema `rep`, RLS por tenant): `rep.programacion` (`id`, `tenant_id`, `reporte_codigo`, `filtros_relativos` jsonb, `frecuencia`, `hora`, `dia` (semana o mes), `formato`, `creada_por`, `activa`, `proxima_en`, `version`); `rep.programacion_destinatario` (`programacion_id`, `usuario_id`); el historial reutiliza `rep.ejecucion` con `programacion_id`.
- Tableros: `rep.tablero` y `rep.widget` globales desde el manifiesto (`codigo`, `producto_codigo`, `tipo`, `vista` o `indicador`, `permiso`, `orden`); `rep.tablero_rol` por tenant (`tenant_id`, `rol_id`, `tablero_codigo`, `predeterminado`).
- **Eventos**: el SRS no los define. Propuestos: `rep.programacion.ejecutada` (consumido por TR-NOT para el correo), idempotente por `programacion_id` + fecha programada.
- **Puertos**: `PlanificadorProgramaciones` (worker, tarea cada minuto que toma `proxima_en <= now()` con `FOR UPDATE SKIP LOCKED`), `VerificadorPermisoUsuario` (seg: permiso efectivo de otro usuario del tenant), `ResolverFiltrosRelativos` (dominio puro, fechas en America/Lima), `CalculadorWidget`.
- **Permisos**: `plat.reporte.programar`, `plat.tablero.ver` (SRS). Faltan en el SRS: gestionar asignación tablero-rol (propuesta `plat.tablero.asignar`).
- **Manifiesto**: `CLAVES_RAIZ` de `seguridad/src/domain/manifiesto.ts` no tiene `tableros`; hoy un manifiesto con esa clave se rechaza. Agregarla.
- **Nx**: mismo `comp:rep`; si los widgets KPI leen `obs.metrica_minuto`, `comp:rep` necesita `obs` en la matriz o un puerto que apps/api cablea.
- **Migración**: `db/01?_rep_programacion.sql` y `db/01?_rep_tableros.sql` (siguiente letra libre, después de `01?_rep.sql`).

## 7. Código base relacionado
- Tareas periódicas del worker: `apps/worker/src/vencimientos/tarea-vencimientos.ts` (spec 12) y `apps/worker/src/soporte/tarea-vencimiento-soporte.ts` (spec 18), BullMQ.
- Fechas en Lima: `fechaLima` en los escritores XLSX (18b, 20b); `db/01i_seg_vigencia_peru.sql` y commits recientes «Fecha de Perú» para vigencias.
- Roles: `libs/plataforma/admin-cliente` (roles, 16b), `vit-tabla`, `PanelLateralService`, `vit-chip-estado`.
- Correo: solo Supabase Auth y Resend para invitaciones (`InvitarPropietario.notificar`); no hay TR-NOT genérico.
- Gráficos: el repo no tiene librería de gráficos (ni ECharts ni Chart.js en `package.json`).
- Falta: todo lo de este paquete.

## 8. Diagramas relevantes
- `1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd` (sin REP).
- `01-analysis/.../5_Componentes_Transversales/TR-01_Mapa_de_componentes_transversales_de_la_plataforma.mmd`.
- `01-analysis/.../6_Plataforma_Operacion/OP-02_Arquitectura_de_observabilidad_comprar_el_motor_construir_la_capa_de_n.mmd` (métricas por minuto como fuente de tableros).
- Canvas «Vitrina · Diseño UI» (no tiene pantalla tipo de tablero).

## 9. Ambigüedades y preguntas candidatas
1. ¿Entran 098 y 099 en R3? Recomendación: no en R3-04; dejarlos como backlog después de H5, salvo pedido explícito. 099 primero (es MVP en el SRS) si se adelanta uno.
2. ¿Quién asigna tableros? Recomendación: permiso nuevo `plat.tablero.asignar` (TENANT) en `PLAT_PROPIETARIO`.
3. ¿Archivo o enlace en el correo? Recomendación: enlace firmado de TR-ARC (72 h) siempre; adjunto solo si el archivo pesa < 5 MB y no tiene datos personales.
4. ¿Revalidar permisos en cada ejecución? Recomendación: sí; el destinatario que lo perdió se omite y queda en el historial; si nadie queda, la programación se pausa.
5. ¿Widgets desde vistas o desde `obs`? Recomendación: KPI y LINEA de indicadores de negocio leen `obs.metrica_minuto` (agregado, sin PII); TABLA y BARRA usan vistas de reporte.
6. ¿Librería de gráficos? Recomendación: decidir en el canvas antes del spec c; preferir SVG propio o una librería ligera; colores solo por tokens.
7. ¿Frecuencia y zona? Recomendación: `hora` en America/Lima sin horario de verano; `proxima_en` en UTC calculada en dominio.
