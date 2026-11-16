# Contexto para idn-cuota-y-consola-proveedor

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (RF, Criterios GWT, Reglas de negocio, RNF, Componentes), `3_plan.json` (R2-02), plan (sec. 6.1 "Pantallas por release": R2 consola "Proveedor DNI/RUC y cuotas"), diagramas OP-06, OP-09, PL-10, código real en `libs/` y `apps/`. Rutas P y D como en `idn-validacion-consulta-dni-ruc.md`.

## 1. Alcance y dependencias
- TR-RF-047 entra en R2-02 (sprint 13, 7 h compartidas con 044-046). La pantalla de consola "Proveedor DNI/RUC y cuotas" la nombra el plan 6.1 para R2 sin historia ni horas propias.
- Back en `libs/plataforma/identidad` (lo crea `idn-validacion-consulta`). Front: lib nueva `libs/plataforma/consola-identidad` (`type:feature`, como `consola-catalogos`, `consola-soporte`, `consola-tenants`), ruta `consola/identidad` en `apps/plataforma-consola` con `aal2Guard`. Vista del consumo para el administrador del cliente en `admin-cliente` (actor del RF).
- Dependencias: `idn-validacion-consulta` (consulta y `CuotaPort` nulo que este spec reemplaza), 17a (suscripción y plan del tenant), 09 (TR-CFG: `umbral_aviso`), 11 (outbox), worker (tareas programadas como `tarea-vencimientos.ts`), 15/15b/15c/15d y 17b (consola). TR-NOT (R2-09, sprint 15) es posterior: el aviso al 80 % solo se publica como evento.
- Partición propuesta:

| Spec | Slug | RF | h | Áreas | Depende de |
|---|---|---|---|---|---|
| A | idn-cuota | 047 back | 6 | (a) DDL `idn.cuota` + reserva atómica y `CuotaPort` real; (b) tarea mensual en el worker + aviso al umbral por evento; (c) HTTP de consumo y de proveedores (prioridad, TTL, activo) | idn-validacion-consulta, 09, 11, 17a |
| B | idn-consola-proveedor-cuotas | UI de 047 + proveedores | 8 | (a) lib `consola-identidad`: proveedores con estado del circuito; (b) cuotas por tenant (lista + detalle del periodo, ajuste de incluidas); (c) consumo del propio tenant en `admin-cliente` | A, 17b, 17c, 15b/15c/15d |

- Fuera de alcance: correo del aviso (TR-NOT, R2-09), cobro por excedente, cuotas de IA y mensajería (también TR-RNF-128, otros componentes), bitácora de consultas como pantalla (no pedida por RF; P5).
- Constitución aplicable: reglas 1-8, 9 (credenciales de proveedor no se muestran ni editan en la consola), 10, 11; código limpio; estructura de libs Angular; diseño UI; verificación con Playwright; DoD.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-047 | Controlar cuota de consultas por plan | plat.identidad.cuota | APP-01 Consola | TR-RN-031 | TR-RNF-128, 007 | Admin de plataforma, admin del cliente, planificador de tareas |

- Must, fase MVP, procesos TR-P10 y TR-P01, componentes TR-IDN, TR-NOT, TR-ORG.
- Precondición: el plan del tenant define consultas incluidas.
- Flujo: 1) al inicio del mes el planificador crea la cuota del periodo con las incluidas; 2) cada consulta al proveedor reserva una unidad de forma atómica; 3) al 80 % se notifica al administrador del cliente; 4) al 100 % las consultas devuelven `CUOTA_AGOTADA` y el producto permite ingreso manual.
- Datos: `tenant_id`, `periodo` (AAAA-MM), `incluidas`, `consumidas`, `umbral_aviso` (parámetro, 80 % por defecto).
- Salida: consumo controlado y visible por tenant.
- Pantalla (plan 6.1): "Proveedor DNI/RUC y cuotas" en `plataforma-consola`. Sin RF propio para administrar proveedores; OP-09 da los campos (`codigo, tipos_doc, prioridad, ttl_dias`).

## 3. Criterios GWT
| ID | Tipo | Escenario |
|---|---|---|
| TR-CA-120 | Positivo | 500 incluidas en 2026-10 y 399 consumidas; la consulta 400 dispara el aviso «Ha usado el 80 % de sus consultas DNI/RUC» |
| TR-CA-121 | Negativo | 500 de 500 consumidas; DNI fuera de caché: `CUOTA_AGOTADA` y el formulario habilita el ingreso manual |
| TR-CA-122 | Borde | Cuota agotada; DNI vigente en caché: datos con resultado CACHE |

Estado SRS: Pendiente. TR-CA-120 en R2 se prueba con el evento publicado (no hay correo hasta TR-NOT). TR-CA-121 "el formulario habilita el ingreso manual" es del front del producto (`<ui-persona-buscador>`). Faltan y se proponen: aviso una sola vez por periodo; reserva concurrente (50 consultas paralelas con 10 restantes -> exactamente 10 reservas); proveedor caído libera la unidad reservada; cambio de mes crea la cuota nueva sin arrastrar consumo; tenant sin cuota creada -> la crea al vuelo (P3); cambiar la prioridad de proveedores en la consola cambia el orden de respaldo; consola en claro, oscuro y 600 px.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-031 | Cuota descontada solo cuando se llama al proveedor (nunca por caché ni por formato inválido). |
| TR-RNF-128 | Consumo de IA, mensajería e identidad con límite mensual por tenant, aviso al 80 % y corte o modo degradado al 100 % según configuración. |
| TR-RNF-007 | La caída del proveedor o la cuota agotada no bloquean la operación principal (ingreso manual). |
| TR-RN-009 | La consola exige aal2 (ya aplicado a toda la consola con `aal2Guard`). |

Heredados por CLAUDE.md: 001/002/003, 008, 010, 011, 012, 013/112, 018 (UI >= 360 px), 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | RF | Tipo | Release |
|---|---|---|---|---|---|---|
| R2-02 | 13 | 7 | TR-IDN | TR-RF-044 a 047 | Back | R2 |

Pantalla de consola: plan 6.1, fila R2, columna `plataforma-consola`: "Proveedor DNI/RUC y cuotas"; sin historia front. Relacionadas: R2-09/R2-10 (TR-NOT consumirá el evento de aviso), R2-11 (otra pantalla front de R2 en admin cliente, sprint 16).

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta: `db/01k_idn_cuota.sql` (+ rollback y test), después de `01k_idn.sql`.
- Tablas:
  - `idn.cuota` (OP-09): PK `(tenant_id, periodo)`, `incluidas`, `consumidas` (CHECK `consumidas <= incluidas` o nulo = sin límite), `avisado_en` (para avisar una vez), `version`. RLS por `app.tenant_id`; la consola lee todos los tenants con función `SECURITY DEFINER` como la lista de tenants de 17a.
  - Consultas incluidas por plan: no existen en `org.suscripcion` (tiene `limite_sucursales`, `limite_usuarios`). Opciones en P1.
  - `idn.proveedor` (de `idn-validacion-consulta`): se agregan `activo` y edición de `prioridad`, `ttl_dias`, `timeout_ms` desde la consola. Credenciales siguen en entorno.
- Eventos propuestos (sin evento de cuota en el SRS): `identidad.cuota_umbral_alcanzado` (`tenant_id`, `periodo`, `incluidas`, `consumidas`, `porcentaje`) y `identidad.cuota_agotada`. TR-NOT los consumirá en R2-09/R2-10.
- Puertos: `CuotaPort.reservar(tenantId, periodo)` (SQL atómico justificado: `UPDATE ... SET consumidas = consumidas + 1 WHERE ... AND consumidas < incluidas RETURNING`) y `liberar` si el proveedor falla; `PARAMETRO_PORT` de TR-CFG para `umbral_aviso` (definición nueva `idn.cuota.umbral_aviso`, porcentaje, por defecto 80).
- Tarea mensual: worker, patrón de `apps/worker/src/vencimientos/tarea-vencimientos.ts` (`upsertJobScheduler` con `tz` America/Lima, día 1 a las 00:05) + CLI como `apps/worker/src/cli/ejecutar-vencimientos.ts`.
- Permisos: `plat.identidad.cuota` (SRS). Para editar proveedores no hay permiso en el SRS: proponer `plat.identidad.proveedor` (operador, `OPERADOR_REQUERIDO` como 17a). Opción de menú `plat.consola.identidad` en `plat.manifiesto.json`.
- Endpoints propuestos: `GET /v1/identidad/cuotas?periodo` (consola, todos los tenants), `GET /v1/identidad/cuotas/actual` (tenant propio), `PATCH /v1/identidad/cuotas/{tenantId}/{periodo}` (ajustar incluidas), `GET|PATCH /v1/identidad/proveedores[/{codigo}]`.

## 7. Código base relacionado
- `libs/plataforma/org`: `Suscripcion` (`plan` BASICO|PRO|EMPRESA, `estado`, `limiteSucursales`, `limiteUsuarios`), `PLANES`, `RepositorioSuscripciones`; patrón de tarea diaria `RevisarVencimientos`/`ProcesarVencimientosTenant`.
- `libs/plataforma/parametros`: `PARAMETRO_PORT`, `RegistrarDefiniciones` (alta de la definición del umbral).
- `apps/worker/src/vencimientos/` y `apps/worker/src/auditoria/tarea-verificacion.ts`: tareas programadas BullMQ con zona Lima.
- `apps/plataforma-consola/src/app/app.routes.ts`: rutas lazy con `aal2Guard` y `permisoGuard`; patrón para `consola/identidad`.
- `libs/plataforma/consola-catalogos`, `consola-tenants`, `consola-soporte` (`type:feature`): estructura `pages/`, `services/*.cliente.ts`, `models/`.
- `libs/shared/ui`: `vit-tabla`, `vit-filtros`, `vit-chip-estado` (`TonoEstado` para estado del circuito: abierto/cerrado), `PanelLateralService`, `vit-estado-vacio`, `vit-cargando`.
- `codigo/` de P: nada de identidad.

## 8. Diagramas relevantes
- D/`6_Plataforma_Operacion/OP-06_Secuencia_consulta_de_DNI_o_RUC_nivel_1.mmd` (rama `CUOTA_AGOTADA`, reserva antes de llamar)
- D/`6_Plataforma_Operacion/OP-09_Modelo_de_datos_del_servicio_de_identidad_schema_idn.mmd` (PROVEEDOR, CUOTA)
- D/`6_Plataforma_Operacion/OP-08_Modulo_de_identidad_en_arquitectura_hexagonal.mmd`
- P/`1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd`
- Canvas «Vitrina · Diseño UI»: pantallas tipo lista y detalle.

## 9. Ambigüedades y preguntas candidatas
1. ¿Dónde se definen las consultas incluidas por plan? Recomendación: parámetro de TR-CFG por plan (`idn.cuota.incluidas`, con valor por defecto por plan BASICO/PRO/EMPRESA) y ajuste por tenant desde la consola; sin tocar `org.suscripcion`.
2. ¿Cuota por tenant o por producto? El RF dice por tenant según su plan, pero el plan vive en la suscripción por producto. Recomendación: por tenant, tomando el plan más alto de sus suscripciones vigentes.
3. ¿Qué pasa si la tarea mensual no corrió? Recomendación: `reservar` crea la fila del periodo al vuelo (`INSERT ... ON CONFLICT DO NOTHING`); la tarea solo adelanta el trabajo.
4. TR-RNF-128 dice "corte o modo degradado según configuración". Recomendación: parámetro `idn.cuota.al_agotar` (CORTE por defecto = `CUOTA_AGOTADA`); el modo degradado (seguir consultando y facturar excedente) queda fuera.
5. ¿La consola muestra la bitácora de consultas? No hay RF. Recomendación: no; solo contadores por resultado del periodo (CACHE vs PROVEEDOR) calculados de `idn.consulta_log`.
6. Estado del circuito de cada proveedor es estado en memoria de la API. Recomendación: exponerlo en Redis (o métrica OTel ya existente) y mostrar "último error" y "abierto/cerrado"; si cuesta, solo `activo` y prioridad.
7. ¿Puede el admin del cliente ver su consumo? El RF lo lista como actor. Recomendación: tarjeta de consumo en `admin-cliente` con `plat.identidad.cuota` de alcance TENANT; edición solo operador.
