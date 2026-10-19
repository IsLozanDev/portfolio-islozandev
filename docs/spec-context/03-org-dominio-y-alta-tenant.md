# Contexto para spec 03 · org-dominio-y-alta-tenant (TR-ORG)

Paquete de contexto (no es el spec). Fuentes: CLAUDE.md, docs/roadmap-specs.md, SRS (hojas RF, Criterios GWT, Reglas de negocio, RNF, Procesos, Componentes), plan .docx, 3_plan.json, PL-06/PL-10, codigo/db. Todo ID citado existe en las fuentes salvo donde se indica.

## 1. Alcance y dependencias

- Roadmap: spec 03 cubre O-01, O-02, O-03 (RF 001-007). Depende de 02 (supabase-y-kernel: kernel, kernel-infra con UnidadDeTrabajo, ContextoTenant, outbox, Resultado). Lo consumen 06 (autorización), 10 (consola y admin org: O-04, U-05, U-06) y 18.
- Fuera de alcance (otros specs): O-04 (consola, spec 10); invitación general de usuarios, membresías y permisos (04, 06, 07); parámetros (12), series (13), catálogos (14), auditoría (16), relay del outbox (15).
- Tensión de orden: PL-10 dibuja `K --> ORG --> SEG` (SEG depende de ORG), pero el alta (RF-001) necesita sembrar roles, crear la membresía del propietario e invitar vía Admin API (SEG, specs 04/07) y sembrar parámetros/series (CFG/SEQ, specs 12/13). Ver sección 9.
- Plan: todo TR-ORG está en R1, sprint 2 (16/11 al 29/11/2026), junto con O-04. Horas del spec: 6+5+4 = 15 h; el roadmap pide "cabe en 10 h", así que excede el tope (ver sección 9).
- Las 3 historias son Back; no hay front en este spec.
- Versiones: `01a_org.sql` declara PostgreSQL 15+ y CLAUDE.md fija PostgreSQL 16. El código base de `libs/shared/auth` usa Angular 22 según LEEME.md, pero no entra en este spec. No hay código NestJS de org en el código base.

## 2. RF

| ID | Nombre | Permiso | Prioridad | Fase | App |
|---|---|---|---|---|---|
| TR-RF-001 | Dar de alta un tenant con asistente | plat.tenant.crear | Must | MVP | APP-01 Consola |
| TR-RF-002 | Registrar empresa del tenant | plat.empresa.crear | Must | MVP | APP-02 Admin cliente |
| TR-RF-003 | Registrar sucursal (establecimiento) | plat.sucursal.gestionar | Must | MVP | APP-02 |
| TR-RF-004 | Registrar unidad operativa | plat.unidad.gestionar | Must | MVP | APP-02 |
| TR-RF-005 | Gestionar suscripción de producto | plat.suscripcion.gestionar | Must | MVP | APP-01 |
| TR-RF-006 | Cambiar estado del tenant | plat.tenant.cambiar_estado | Must | MVP | APP-01 |
| TR-RF-007 | Controlar vencimiento de prueba y suscripción | plat.sistema.job | Must | MVP | APP-03 API |

Todos con 3 criterios (21 GWT). Procesos: RF-001/003/004 TR-P01; RF-002 TR-P01 y TR-P10; RF-005/006/007 TR-P01 y TR-P05.

### Flujo básico y datos/validaciones (resumen)

**TR-RF-001** (admin de plataforma con MFA vigente; el producto debe existir en seg.producto). Reglas 001, 002, 003, 005. RNF 029, 010, 008. Componentes: ORG, SEG, IDN, CFG, SEQ, NOT, EVT.
1. Captura codigo, nombre, producto, plan, modalidad. 2. Captura RUC, razón social, correo del propietario. 3. Valida RUC (RN-002) y consulta el padrón vía TR-IDN. 4. Crea tenant, suscripción, empresa y sucursal principal (establecimiento 0000) en una transacción. 5. Siembra parámetros por defecto, series iniciales y roles predefinidos del producto. 6. Invita al propietario por correo y publica `tenant.creado`.
Datos: codigo (3-30, único, minúsculas y guiones); nombre (3-150); producto_codigo (catálogo de productos); plan BASICO|PRO|EMPRESA; modalidad PRUEBA|ACTIVO; ruc 11 dígitos; correo_propietario válido. Salida: tenant PRUEBA o ACTIVO, asistente < 15 min.

**TR-RF-002** (admin del cliente, alcance TENANT; tenant ACTIVO o PRUEBA). Reglas 001, 002, 003, 019. RNF 010, 007. Componentes: ORG, IDN, CAT, EVT.
Flujo: ingresa RUC; valida formato y consulta padrón (TR-IDN); muestra razón social, estado y condición; completa nombre comercial; crea empresa y sucursal principal 0000; publica `empresa.creada`.
Datos: ruc (11, único por tenant); razon_social 1-200 (del padrón); nombre_comercial 0-150; direccion_fiscal 0-250; ubigeo 6 dígitos (catálogo UBIGEO).

**TR-RF-003** (admin del cliente; empresa activa; suscripción sin tope de sucursales alcanzado). Reglas 001, 003, 006. RNF 010, 027. Componentes: ORG, CAT, EVT.
Flujo: elige empresa y nueva sucursal; ingresa código, nombre, establecimiento SUNAT, dirección y ubigeo; valida unicidad de código, formato y límite del plan; guarda y publica `sucursal.creada`. La descripción dice "registrar, editar e inactivar".
Datos: codigo 1-20 único por empresa; nombre 3-150; codigo_establecimiento_sunat 4 dígitos opcional; direccion 0-250; ubigeo catálogo; telefono 0-30; zona_horaria IANA (default America/Lima); es_principal.

**TR-RF-004** (admin del cliente). Reglas 004, 001. RNF 010, 027. Componentes: ORG, CAT.
Flujo: elige sucursal y tipo (catálogo TIPO_UNIDAD); ingresa código, nombre, padre opcional, atributos; valida pertenencia (RN-004) y unicidad por empresa+tipo+código; guarda y publica `unidad.creada`.
Datos: tipo obligatorio; codigo 1-20; nombre 3-150; sucursal_id obligatorio salvo ALMACEN; padre_id opcional; atributos JSON (impresora, capacidad, piso).

**TR-RF-005** (admin de plataforma; tenant no en BAJA). Regla 006. RNF 101, 027. Componentes: ORG, SEG, EVT.
Flujo: abre tenant y producto; define edición, plan, límites y vigencia; valida que los límites no sean menores al uso actual; guarda, invalida la caché de permisos y publica `suscripcion.cambiada`.
Datos: producto_codigo (REST|PSI|COL|LIB|GYM|CLI|DOC|ECO|LEX); edicion 0-30; plan BASICO|PRO|EMPRESA; estado PRUEBA|ACTIVA|VENCIDA|CANCELADA; limite_sucursales y limite_usuarios entero >=1 o vacío; vigente_hasta fecha.

**TR-RF-006** (admin de plataforma, MFA vigente). Reglas 005, 009. RNF 021, 013. Componentes: ORG, SEG, AUD, NOT.
Flujo: elige estado y motivo; confirmación explícita; valida transición (RN-005); aplica estado, cierra sesiones si SUSPENDIDO o BAJA, audita y notifica al propietario.
Datos: estado_nuevo ACTIVO|SUSPENDIDO|BAJA; motivo 10-500 obligatorio; fecha_efectiva (default ahora).

**TR-RF-007** (actor: planificador; permiso plat.sistema.job). Reglas 005, 006. RNF 005, 008. Componentes: ORG, NOT, CFG, EVT.
Flujo: job diario a las 06:00 hora de Lima; avisa a 7, 3 y 1 días del vencimiento; pasa a VENCIDA y publica `suscripcion.vencida`; si terminó la gracia (`plat.suscripcion.dias_gracia`, NUMERO, default 5) suspende el tenant.
Datos: dias_gracia; fecha_ejecucion; resultados (tenant, producto, acción).

## 3. Criterios GWT (texto tal cual)

- **TR-CA-001** (RF-001, Positivo) Alta completa en modalidad prueba. DADO QUE el administrador de plataforma tiene el permiso plat.tenant.crear y no existe el código «polleria-dona-rosa» · CUANDO completa el asistente con producto REST, plan BASICO, modalidad PRUEBA y RUC 20601234561 · ENTONCES se crea el tenant «polleria-dona-rosa» en estado PRUEBA con su sucursal principal 0000 y se envía la invitación al propietario
- **TR-CA-002** (RF-001, Negativo) Código de tenant duplicado. DADO QUE existe el tenant con código «polleria-dona-rosa» · CUANDO intenta crear otro tenant con el mismo código · ENTONCES el sistema rechaza el alta con el mensaje «El código de tenant ya existe» y no crea ningún registro
- **TR-CA-003** (RF-001, Negativo) RUC con dígito verificador inválido. DADO QUE el administrador está en el paso de empresa del asistente · CUANDO ingresa el RUC 20601234560 · ENTONCES el sistema muestra «RUC inválido» y no permite avanzar al siguiente paso
- **TR-CA-004** (RF-002, Positivo) Registro con datos del padrón. DADO QUE el administrador del cliente tiene alcance TENANT en «grupo-sabores» · CUANDO registra la empresa con RUC 20512345678 · ENTONCES la empresa queda activa con la razón social devuelta por el padrón y su sucursal principal 0000
- **TR-CA-005** (RF-002, Negativo) RUC ya registrado en el tenant. DADO QUE la empresa con RUC 20512345678 ya existe en el tenant · CUANDO intenta registrarla nuevamente · ENTONCES el sistema rechaza la operación con «La empresa ya está registrada en este tenant»
- **TR-CA-006** (RF-002, Borde) Contribuyente no habido. DADO QUE el padrón devuelve condición NO HABIDO para el RUC 20498765432 · CUANDO el actor confirma el registro · ENTONCES el sistema registra la empresa y muestra la advertencia «Contribuyente NO HABIDO: no podrá emitir comprobantes hasta regularizar»
- **TR-CA-007** (RF-003, Positivo) Nueva sucursal en Arequipa. DADO QUE la empresa «Sabores del Sur SAC» tiene 1 sucursal y su plan permite 3 · CUANDO registra la sucursal «Cayma» con establecimiento 0002 y ubigeo 040103 · ENTONCES la sucursal «Cayma» queda activa y aparece en el selector de sucursales
- **TR-CA-008** (RF-003, Negativo) Límite de sucursales del plan. DADO QUE la suscripción REST del tenant tiene limite_sucursales = 2 y ya existen 2 sucursales activas · CUANDO intenta registrar una tercera sucursal · ENTONCES el sistema rechaza con «Su plan permite 2 sucursales; amplíe su plan»
- **TR-CA-009** (RF-003, Borde) Segunda sucursal principal. DADO QUE la empresa ya tiene la sucursal principal «Centro» · CUANDO marca como principal la sucursal «Cayma» · ENTONCES el sistema traslada la marca de principal a «Cayma» y la retira de «Centro» en la misma operación
- **TR-CA-010** (RF-004, Positivo) Caja en sucursal. DADO QUE la sucursal «Cayma» existe · CUANDO registra la unidad tipo CAJA con código «CAJA-01» · ENTONCES la unidad «CAJA-01» queda activa en la sucursal «Cayma»
- **TR-CA-011** (RF-004, Negativo) Consultorio sin sucursal. DADO QUE el actor no selecciona sucursal · CUANDO intenta registrar una unidad tipo CONSULTORIO · ENTONCES el sistema rechaza con «Solo los almacenes pueden registrarse sin sucursal»
- **TR-CA-012** (RF-004, Borde) Almacén central de empresa. DADO QUE la empresa «Librería Amauta EIRL» existe · CUANDO registra una unidad tipo ALMACEN sin sucursal · ENTONCES el almacén queda registrado a nivel de empresa y visible para todas sus sucursales
- **TR-CA-013** (RF-005, Positivo) Ampliación de plan. DADO QUE el tenant «clinica-san-pablo» tiene CLI en plan BASICO · CUANDO cambia el plan a PRO con límite de 5 sucursales · ENTONCES la suscripción queda en PRO y el límite de sucursales es 5
- **TR-CA-014** (RF-005, Negativo) Límite menor que el uso actual. DADO QUE el tenant tiene 12 usuarios activos en GYM · CUANDO intenta fijar limite_usuarios = 10 · ENTONCES el sistema rechaza con «Hay 12 usuarios activos; el límite no puede ser menor»
- **TR-CA-015** (RF-005, Positivo) Nuevo producto contratado. DADO QUE el tenant «estudio-quispe» tiene LEX activo · CUANDO agrega la suscripción DOC en plan BASICO · ENTONCES los roles predefinidos de DOC quedan disponibles para asignar en el tenant
- **TR-CA-016** (RF-006, Positivo) Suspensión por deuda. DADO QUE el tenant «gym-fuerza-total» está ACTIVO con 2 facturas vencidas · CUANDO el administrador lo suspende con motivo «Deuda de 60 días» · ENTONCES el tenant queda SUSPENDIDO, sus usuarios solo pueden consultar y pagar, y el propietario recibe el aviso por correo
- **TR-CA-017** (RF-006, Negativo) Transición no permitida. DADO QUE el tenant está en BAJA · CUANDO intenta reactivarlo a ACTIVO · ENTONCES el sistema rechaza con «Un tenant dado de baja no puede reactivarse; cree uno nuevo o restaure desde respaldo»
- **TR-CA-018** (RF-006, Negativo) Motivo vacío. DADO QUE el actor elige SUSPENDIDO · CUANDO confirma sin ingresar motivo · ENTONCES el sistema exige el motivo y no cambia el estado
- **TR-CA-019** (RF-007, Positivo) Aviso 3 días antes. DADO QUE la suscripción PSI del tenant «psico-andina» vence el 13/10/2026 · CUANDO el job se ejecuta el 10/10/2026 · ENTONCES el propietario recibe el aviso «Su suscripción vence en 3 días»
- **TR-CA-020** (RF-007, Borde) Fin del periodo de gracia. DADO QUE la suscripción venció hace 5 días y el parámetro dias_gracia es 5 · CUANDO el job se ejecuta · ENTONCES el tenant pasa a SUSPENDIDO y se publica tenant.suspendido
- **TR-CA-021** (RF-007, Negativo) Ejecución repetida el mismo día. DADO QUE el job ya envió los avisos del 10/10/2026 · CUANDO se reejecuta manualmente ese día · ENTONCES no se envían avisos duplicados

Estado de prueba de todos: Pendiente. Ningún GWT cubre TR-RN-010 (último propietario) ni la propagación de RF-005 a permisos/caché.

## 4. Reglas TR-RN y RNF aplicables

| ID | Texto corto |
|---|---|
| TR-RN-001 | Jerarquía tenant → empresa (RUC) → sucursal → unidad; todo con tenant_id; ninguna consulta cruza tenants. |
| TR-RN-002 | RUC de 11 dígitos, inicia con 10/15/17/20, dígito verificador módulo 11 SUNAT; DNI 8 dígitos. |
| TR-RN-003 | Una sola sucursal principal por empresa; establecimiento SUNAT de 4 dígitos; domicilio fiscal = 0000. |
| TR-RN-004 | Unidad pertenece a una sucursal, salvo ALMACEN (puede ser de la empresa). |
| TR-RN-005 | Estados PRUEBA → ACTIVO → SUSPENDIDO → BAJA. SUSPENDIDO: solo lectura, pago de deuda, exportación y soporte. BAJA conserva datos 90 días. |
| TR-RN-006 | Producto sin suscripción vigente (ACTIVA o PRUEBA) no otorga permisos; no se exceden límites de sucursales ni usuarios. |
| TR-RN-010 | Todo tenant tiene al menos un propietario ACTIVO; no se puede suspender, revocar ni dar de baja al último. |
| TR-RN-019 | Factura exige RUC; advertir si el padrón da estado distinto de ACTIVO o condición NO HABIDO. Fuente: "Reglamento de Comprobantes de Pago (verificar)". |
| TR-RN-009 | Citada por RF-006, fuera de tu lista: permisos sensibles exigen MFA con antigüedad máx. 15 min y auditoría. |

| RNF | Texto corto |
|---|---|
| TR-RNF-010 | Aislamiento por tenant con doble barrera (contexto de aplicación + RLS); 0 accesos cruzados en pruebas. |
| TR-RNF-029 | Alta de cliente (tenant, empresa, sucursal, administrador) en < 15 min con asistente; prueba cronometrada. |
| TR-RNF-008 | Operaciones que cambian estado son idempotentes ante reintentos con clave de idempotencia; 0 duplicados. |

Citados por los RF (no pedidos): RNF-005 (disponibilidad API >= 99,5 %), 007 (integraciones externas con timeout, reintento y circuit breaker), 013 (auditoría inmutable), 021 (confirmación y motivo en acciones destructivas), 027 (configuración por tenant sin cambios de código), 101 (caché de permisos, invalidación <= 5 s). CLAUDE.md hereda además 001-003, 011, 012, 024/119, 025, 026, 106, 112.

## 5. Historias (3_plan.json, sprint 2, release R1)

| ID | Horas | Tipo | Descripción | RF |
|---|---|---|---|---|
| O-01 | 6 | Back | Dominio org: tenant, empresa, sucursal, unidad y suscripción con migraciones | TR-RF-002, 003, 004 |
| O-02 | 5 | Back | Alta de tenant transaccional con siembra e invitación al propietario (Admin API de Supabase) | TR-RF-001 |
| O-03 | 4 | Back | Suscripción, cambio de estado y vencimiento de prueba (tarea diaria) | TR-RF-005, 006, 007 |

Total 15 h. O-04 (5 h, consola; RF 001 y 006) completa las 20 h del sprint 2 y va en el spec 10. Hito H1 (sprint 5, 10/01/2027): "Alta de tenant, usuarios, roles y permisos funcionando de punta a punta en dev".

## 6. Tablas SQL, eventos, puertos y permisos

**Tablas** (esquema `org`, en 01a_org.sql): tenant, suscripcion (PK tenant_id + producto_codigo), empresa, sucursal, unidad_operativa. Relacionadas fuera del spec: `seg.producto` (01b_seg.sql, incluye PLAT), `seg.usuario`, `seg.membresia` (INVITADO|ACTIVO|SUSPENDIDO, es_propietario), `seg.rol` (tenant_id NULL = predefinido), `auth.users` (trigger crea seg.usuario).
No existe tabla de: idempotencia (RNF-008), historial de estado/motivo del tenant (RF-006), avisos enviados (RF-007/CA-021), outbox (spec 02), catálogos TIPO_UNIDAD y UBIGEO (spec 14).

**Eventos citados en el SRS**: tenant.creado, empresa.creada, sucursal.creada, unidad.creada, suscripcion.cambiada, suscripcion.vencida, tenant.suspendido. Consumidor previsto: `tenant-creado.consumer` en seguridad (siembra roles del producto, estructura_backend.txt). No hay evento citado para reactivación ni baja: hueco.

**Puertos**: la estructura solo nombra la lib `libs/plataforma/org` ("tenant · empresa · sucursal · unidad · suscripción · alta de tenant"); no hay puertos de org definidos. Citados en otros sitios: `proveedor-identidad (Admin API)` en seguridad/application/ports; TR-IDN (padrón RUC, R2); TR-NOT (correo, R2); TR-CFG (dias_gracia); TR-SEQ (series). Hoja Componentes: API `/v1/org/*` y `OrgContextService` (tenant/empresa/sucursal del request).

**Permisos**: plat.tenant.crear, plat.empresa.crear, plat.sucursal.gestionar, plat.unidad.gestionar, plat.suscripcion.gestionar, plat.tenant.cambiar_estado, plat.sistema.job. RF-001 y RF-006 exigen MFA vigente en precondiciones. No hay filas seg.permiso sembradas con estos códigos en el código base (solo se usa `plat.tenant.crear` en el test de seguridad).

## 7. Código base relacionado

Ruta base: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/codigo/`.

| Archivo | Conservar | Cambiar o falta |
|---|---|---|
| `db/01a_org.sql` | Esquema org y jerarquía con FK compuestas (tenant_id, id); CHECK de RUC `^(10\|15\|17\|20)\d{9}$`; `ux_sucursal_principal`; `ck_unidad_sin_sucursal` (RN-004); UNIQUE (empresa_id, tipo, codigo); RLS por `app.tenant_id` en empresa, sucursal, unidad y suscripción | Convertir a migración reversible con script inverso. Faltan: RLS en `org.tenant`; FORCE RLS y rol de la app; CHECK de plan (BASICO\|PRO\|EMPRESA); `tenant.estado` default 'ACTIVO' (el alta puede ser PRUEBA); FK de `suscripcion.producto_codigo` a `seg.producto` (seg depende de org, a decidir); motivo y fecha de cambio de estado, fecha de baja (retención 90 días); límites >= 1; consistencia empresa/sucursal de `padre_id`; ids sin default (UUID v7 del kernel); 0000 no forzado en la principal. Cabecera dice PostgreSQL 15+, el proyecto usa 16. |
| `db/01b_seg.sql` | Solo referencia: `seg.producto`, `seg.membresia.es_propietario`, rol predefinido tenant_id NULL, `seg.permisos_efectivos` ya lee `org.suscripcion` (RN-006) | No es de este spec. No habilita RLS en tablas seg; revisar en specs 04/06. |
| `supabase/migrations/20261102000000_seg_supabase_auth.sql` | Trigger auth.users → seg.usuario con `raw_app_meta_data.tipo_usuario`; el hook de token solo toma tenants en PRUEBA o ACTIVO | Es del spec 04. Relevante: SUSPENDIDO/BAJA dejan de recibir tenant en el token; "cerrar sesiones" de RF-006 se coordina con esto. |
| `libs/plataforma/seguridad/` (`permiso.guard.ts`, `decoradores.ts`, caché de permisos, módulo) | Patrón hexagonal a replicar en `libs/plataforma/org` | No hay código de org: faltan agregados, casos de uso, repositorios, controladores `/v1/org/*` y job. La invalidación de caché (RF-005) pasa por la caché de seguridad. |
| `libs/shared/auth` | No aplica (frontend) | Usa Angular 22 según LEEME.md; atañe al spec 05, no a este. |

Falta por completo: validador RUC módulo 11 (la estructura prevé `libs/shared/util`), adaptador Admin API de Supabase (`inviteUserByEmail`), asistente de alta transaccional, job diario, siembras, pruebas.

## 8. Diagramas

- **PL-06** (invitación de un usuario al tenant): API → Admin API `inviteUserByEmail(correo, app_metadata.tipo_usuario = INTERNO)` → INSERT auth.users → trigger → seg.usuario → membresía INVITADO + asignación con vigencia + evento `seg.membresia.invitada` → el invitado define clave y `POST /v1/seg/invitaciones/aceptar` → ACTIVO. Si el correo ya existe en Supabase solo se agrega la membresía. Ojo: PL-06 modela al administrador del cliente con `plat.usuario.invitar`; el alta usa al administrador de plataforma y un propietario (`es_propietario`), caso no dibujado.
- **PL-10** (dependencias): `K → ORG → SEG`, `K → EVT`, `SEG → CFG, SEQ, CAT, AUD`, `EVT → AUD`, `EVT → NOT`, `CAT → PER → IDN` (R2). Implicación: ORG solo depende de kernel; sus llamadas a CFG, SEQ, IDN, NOT y AUD van contra la flecha y deben ser puertos o eventos.
- No existe diagrama específico del alta de tenant ni del job de vencimientos. PL-03/04/05 dan contexto de token (`tenant_id`, `tipo_usuario`) y no se leyeron en detalle.

## 9. Ambigüedades y preguntas candidatas (Fase 2 de /spec)

Ambigüedades:
1. RF-001 pasos 3, 5 y 6 dependen de TR-IDN (R2), TR-CFG y TR-SEQ (specs 12/13) y TR-NOT (R2), inexistentes al implementar el spec 03. RF-007 también necesita TR-NOT y `dias_gracia` (CFG). RF-002 y CA-006 asumen padrón.
2. "Establecimiento 0000": RF-001/002 lo asignan a la sucursal principal; RN-003 lo llama "domicilio fiscal". Equivalentes, pero no se fuerza en SQL.
3. Estados: RN-005 es lineal, pero RF-006 permite reactivar y CA-017 prohíbe BAJA→ACTIVO. Falta la matriz de transiciones completa; PRUEBA→ACTIVO no tiene RF claro (RF-006 solo ofrece ACTIVO|SUSPENDIDO|BAJA como destino).
4. Estado del tenant (PRUEBA|ACTIVO|SUSPENDIDO|BAJA) vs estado de suscripción (PRUEBA|ACTIVA|VENCIDA|CANCELADA): relación no definida.
5. TR-RN-010 (último propietario) no tiene GWT; aplica a RF-006.
6. CA-009 mueve la marca de principal; RN-003 exige exactamente una. No se define qué pasa al inactivar la principal.
7. CA-015 implica sembrar roles al agregar producto (RF-005), pero el flujo de RF-005 no lo dice.
8. RF-007: no hay tabla de avisos para idempotencia (CA-021); no se define duración por defecto de la prueba ni quién fija `vigente_hasta` en el alta.
9. RF-005 permite editar `estado` de la suscripción a mano, solapado con RF-007.
10. Idempotencia del alta (RNF-008): no se especifica la clave.
11. 15 h exceden las 10 h del roadmap. RF-002/003/004 son de APP-02 (UI en specs 09/10); aquí solo API.

Preguntas candidatas y recomendación:
1. ¿Cómo se respeta el tope de 10 h? Recomendación: partir en 03 = O-01 + O-03 (10 h) y diferir O-02 (5 h) a un 03b tras spec 04, o documentar el exceso si el usuario prefiere un solo spec.
2. ¿Cómo se resuelven padrón (TR-IDN) y correo (TR-NOT) en R1? Recomendación: puertos `PadronRucPort` y `NotificadorPort` con adaptadores stub; RUC solo por módulo 11 y razón social manual; CA-006 queda diferido a R2.
3. ¿Quién ejecuta la invitación del propietario (Admin API)? Recomendación: puerto en org (`InvitadorPropietarioPort`) con adaptador Supabase en `infrastructure/supabase`; la membresía real la completa spec 04/07; en el spec 03, fake en pruebas. Correo ya existente: solo membresía (PL-06).
4. ¿Qué siembra entra al alta? Recomendación: org solo publica `tenant.creado` en el outbox; roles los siembra el consumer de seg, CFG/SEQ en sus specs; org no escribe tablas ajenas.
5. ¿Matriz de transiciones y conversión PRUEBA→ACTIVO? Recomendación: PRUEBA→ACTIVO|SUSPENDIDO|BAJA; ACTIVO→SUSPENDIDO|BAJA; SUSPENDIDO→ACTIVO|BAJA; BAJA terminal; conversión vía RF-005 o RF-006; añadir eventos de reactivación y baja.
6. ¿Cómo corre el job de RF-007 y su idempotencia? Recomendación: BullMQ repeatable en `apps/worker`, 06:00 America/Lima; tabla `org.aviso_vencimiento` con UNIQUE (tenant, producto, días, fecha) para CA-021; `dias_gracia` por puerto de parámetros con fallback 5 hasta el spec 12.
7. ¿RLS en `org.tenant` y cómo opera el alta sin contexto de tenant? Recomendación: RLS por `id = app.tenant_id`; alta y job con conexión de servicio que fija `SET LOCAL app.tenant_id` del nuevo tenant dentro de la transacción; pruebas de aislamiento (RNF-010).
8. ¿Dónde vive la regla del último propietario (RN-010)? Recomendación: en spec 07 (membresías); RF-006 verifica por puerto que quede propietario ACTIVO antes de SUSPENDER/BAJA y se anota como fuera de alcance de la lógica de membresías.
