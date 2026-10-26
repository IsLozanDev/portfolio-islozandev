# Contexto para el spec 17a · consola-plataforma

Paquete de contexto (no es el spec). Fuentes: `docs/roadmap-specs.md`, specs `03`, `12`, `13`, `14` y `15` (este último en implementación), `docs/spec-context/03-org-dominio-y-alta-tenant.md`, `13-auth-cliente-angular.md`, `15-shell-y-ui.md` y `20-aud-auditoria.md`, SRS xlsx (hojas Aplicaciones, Actores, Reglas de negocio, RF, Criterios GWT, RNF, Componentes), plan docx (secciones 6.1, 7 y 12), `3_plan.json`, `2_Estructura/estructura_frontend.txt`, `1_Mermaid/PL-04` y `PL-08`, y el código actual de `apps/` y `libs/`. Ruta base del plan: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.

## 1. Alcance y límites con otros specs

- Roadmap: el spec 17 `consola-y-admin-org` (O-04, U-05, U-06 = 11 h) pasa el tope de 10 h y se parte. Encargo: **17a = O-04 + U-06** (5 + 2 = 7 h según el plan), depende de **12** y **15**. **17b = U-05** (ver `17b-admin-org-cliente.md`).
- **La división pedida no es la que sugiere el plan.** En `3_plan.json`, U-06 tiene componente «Admin cliente» y va en el sprint 5 junto con U-05; O-04 es componente «Consola» y va en el sprint 2. La estructura (`estructura_frontend.txt`, PL-08, plan 6.1) separa dos apps:
  - `apps/plataforma-consola` (`consola.<dominio>`): equipo de plataforma, `/tenants`, `/catalogos`, `/eventos`, `/salud`, MFA obligatoria.
  - `apps/plataforma-admin` (`admin.<dominio>`): administración del cliente; monta `libs/plataforma/admin-cliente`; SazónPOS la abre con la misma cookie (ADR-31).
  - U-06 («App plataforma-admin autónoma (para SazónPOS) con sesión compartida») es la app del **cliente**, no la consola. El spec 14 la leyó como consola («Ampliar `plataforma-admin` como consola: spec 17 (U-06)»); esa lectura contradice el plan.
- **Horas reales** (sección 7): con los endpoints que faltan, la división pedida da 17a ≈ 10-11 h y 17b ≈ 7 h. Propuesta (P1): **17a = O-04 + backend de consola** (≈ 8-9 h, app nueva `plataforma-consola`) y **17b = U-05 + U-06 + controladores de org** (≈ 9 h, todo en `plataforma-admin`). Ambas caben en 10 h y siguen el plan. Si se adopta, la sección 6 (U-06) de este paquete pasa al 17b.
- Límite con el **12**: el 12 dejó `POST /v1/org/tenants` (alta transaccional, operador `plataforma`, `OPERADOR_REQUERIDO`), la tarea diaria y el CLI del operador. Dejó explícitamente al 17: el asistente de alta, la prueba cronometrada de TR-RNF-029 y el listado de tenants («Vista entre tenants para el operador: consola, spec 17»).
- Límite con el **03**: dejó `CambiarEstadoTenant` y `GestionarSuscripcion` sin HTTP («Controladores `/v1/org/*` ... la consola es el spec 17»).
- Límite con el **13/14/15**: `shared/auth` (`aal2Guard`, `permisoGuard`, `*siPermiso`, `dominioCookie`), `shared/auth-ui` (páginas `/auth`) y `shared/ui` + `shared/shell` (layout, menú, `vit-tabla`, `vit-filtros`, `AvisosService.confirmarDestructiva`) se consumen sin cambios. El 15 está en implementación: no tocar sus libs desde el 17a.
- Límite con el **16** (admin-usuarios-roles, U-03 y U-04, app `plataforma-admin`, lib `admin-cliente`): ver sección 8.
- Límite con el **19b** (consola de catálogos, D-06): también vive en `plataforma-consola`. Si el 17a crea la app, el 19b depende del 17a.
- Fuera de alcance: suscripción editable (RF-005, sin historia de UI; ver brechas), catálogos globales (19b), eventos fallidos (`GET /v1/evt/fallidos` existe, sin historia de UI en R1), salud (spec 21), visor de auditoría (decisión en sección 9), padrón RUC y advertencia NO HABIDO (TR-IDN, R2), selector de tenant (`PUT /v1/seg/mi-tenant` no existe).

## 2. Requisitos funcionales

Aplicación SRS: **APP-01** «Consola de plataforma» (Angular · app Nx `plataforma-consola`; usuarios: administrador de plataforma ACT-01 y agente de soporte ACT-02; 23 RF en total, la mayoría R2/R3). Plan 6.1, R1: «Tenants (alta, estado, suscripción), catálogos globales, eventos fallidos».

| ID | Nombre | Permiso | Prioridad | Fase | Backend |
|---|---|---|---|---|---|
| TR-RF-001 | Dar de alta un tenant con asistente | plat.tenant.crear | Must | MVP | Spec 12: `POST /v1/org/tenants` |
| TR-RF-006 | Cambiar estado del tenant | plat.tenant.cambiar_estado | Must | MVP | Spec 03: `CambiarEstadoTenant` sin HTTP |
| TR-RF-005 | Gestionar suscripción de producto | plat.suscripcion.gestionar | Must | MVP | Spec 03: `GestionarSuscripcion` sin HTTP. **No está en O-04** |

U-06 no tiene RF (`rf: "—"`). Su base es ADR-31 (no ADR-29, como cita el spec 13): «la app plataforma-admin comparte sesión por cookie de dominio».

**TR-RF-001** (administrador de plataforma con MFA vigente; producto existente). Flujo: 1 captura código, nombre, producto, plan y modalidad; 2 captura RUC, razón social y correo del propietario; 3 valida RUC (RN-002) y consulta el padrón (TR-IDN, R2: no hay); 4 crea tenant, suscripción, empresa y sucursal principal 0000 en una transacción; 5 siembra; 6 invita al propietario y publica `tenant.creado`. Datos: `codigo` 3-30, minúsculas y guiones, único; `nombre` 3-150; `producto_codigo`; plan `BASICO|PRO|EMPRESA`; modalidad `PRUEBA|ACTIVO`; `ruc` 11 dígitos; `correo_propietario`. Salida: tenant `PRUEBA` o `ACTIVO`, asistente en menos de 15 min. Reglas 001, 002, 003, 005. RNF 029, 010, 008. Pasos 4 a 6 ya los hace el 12 en una llamada; la UI es un asistente de dos pasos sobre un solo `POST`.

**TR-RF-006** (administrador de plataforma, MFA vigente). Flujo: elige estado y motivo; confirmación explícita; valida la transición (RN-005); aplica, cierra sesiones si `SUSPENDIDO` o `BAJA`, audita y notifica al propietario. Datos: `estado_nuevo` `ACTIVO|SUSPENDIDO|BAJA`; `motivo` 10-500 obligatorio; `fecha_efectiva` (por defecto ahora). Reglas 005, 009. RNF 021, 013. El 03 implementó matriz, motivo, historial (`org.tenant_estado_historial`) y eventos; el cierre de sesiones lo da el hook (no entrega tenants `SUSPENDIDO`/`BAJA` al refrescar) y el correo es TR-NOT (R2).

## 3. Criterios GWT (tal cual)

**TR-CA-001** · TR-RF-001 · Alta completa en modalidad prueba · Positivo
DADO QUE el administrador de plataforma tiene el permiso plat.tenant.crear y no existe el código «polleria-dona-rosa» · CUANDO completa el asistente con producto REST, plan BASICO, modalidad PRUEBA y RUC 20601234561 · ENTONCES se crea el tenant «polleria-dona-rosa» en estado PRUEBA con su sucursal principal 0000 y se envía la invitación al propietario

**TR-CA-002** · TR-RF-001 · Código de tenant duplicado · Negativo
DADO QUE existe el tenant con código «polleria-dona-rosa» · CUANDO intenta crear otro tenant con el mismo código · ENTONCES el sistema rechaza el alta con el mensaje «El código de tenant ya existe» y no crea ningún registro

**TR-CA-003** · TR-RF-001 · RUC con dígito verificador inválido · Negativo
DADO QUE el administrador está en el paso de empresa del asistente · CUANDO ingresa el RUC 20601234560 · ENTONCES el sistema muestra «RUC inválido» y no permite avanzar al siguiente paso

**TR-CA-016** · TR-RF-006 · Suspensión por deuda · Positivo
DADO QUE el tenant «gym-fuerza-total» está ACTIVO con 2 facturas vencidas · CUANDO el administrador lo suspende con motivo «Deuda de 60 días» · ENTONCES el tenant queda SUSPENDIDO, sus usuarios solo pueden consultar y pagar, y el propietario recibe el aviso por correo

**TR-CA-017** · TR-RF-006 · Transición no permitida · Negativo
DADO QUE el tenant está en BAJA · CUANDO intenta reactivarlo a ACTIVO · ENTONCES el sistema rechaza con «Un tenant dado de baja no puede reactivarse; cree uno nuevo o restaure desde respaldo»

**TR-CA-018** · TR-RF-006 · Motivo vacío · Negativo
DADO QUE el actor elige SUSPENDIDO · CUANDO confirma sin ingresar motivo · ENTONCES el sistema exige el motivo y no cambia el estado

Notas: el RUC 20601234561 de CA-001 no pasa módulo 11; los specs 03 y 12 usan 20601234565. CA-003 en la UI se cumple con `validarRuc` de `libs/shared/util` (spec 03) antes de avanzar de paso. CA-016: «solo consultar y pagar» es del guard (spec 07, pendiente) y el correo es R2; la UI solo cubre el cambio y el mensaje. Los GWT de RF-005 (013 a 015) no aplican si la suscripción queda fuera.

No hay GWT para el listado de tenants, la consola con MFA, el acceso de un no operador ni la sesión compartida (U-06). Ver sección 10.

## 4. Reglas de negocio

- **TR-RN-001** jerarquía tenant → empresa → sucursal → unidad; ninguna consulta cruza tenants. El listado del operador es la excepción controlada (función `SECURITY DEFINER`, como `org.tenant_por_codigo` del 12).
- **TR-RN-002** RUC módulo 11 (validación en cliente con `validarRuc` y en servidor).
- **TR-RN-003** sucursal principal 0000 (la crea el alta).
- **TR-RN-005** estados `PRUEBA → ACTIVO → SUSPENDIDO → BAJA`; matriz del spec 03: `PRUEBA → ACTIVO|SUSPENDIDO|BAJA`, `ACTIVO → SUSPENDIDO|BAJA`, `SUSPENDIDO → ACTIVO|BAJA`, `BAJA` terminal. La UI solo ofrece los destinos válidos desde el estado actual (`TRANSICIONES` exportado por `org`).
- **TR-RN-007** los permisos PLAT no dependen de suscripción: el operador no tiene suscripción (spec 12).
- **TR-RN-009** `plat.tenant.crear` es sensible (aal2 y MFA ≤ 15 min). RF-006 exige MFA vigente: `plat.tenant.cambiar_estado` debe declararse sensible.
- Spec 12: el actor debe estar en el tenant operador (`ORG_TENANT_OPERADOR`, por defecto `plataforma`); el permiso solo no basta, porque los roles predefinidos son globales y un propietario de cliente puede asignarse `PLAT_ADMIN_TENANTS`.

## 5. RNF

- **TR-RNF-029** alta de cliente en < 15 min con asistente; prueba cronometrada. El 12 la dejó para la consola.
- **TR-RNF-021** confirmación explícita y motivo obligatorio en acciones destructivas: suspender y dar de baja usan `confirmarDestructiva` del 15.
- **TR-RNF-008** idempotencia: el alta choca por `codigo` (409); repetir el mismo estado es no-op (spec 03). La UI evita doble envío (botón deshabilitado mientras viaja la petición).
- **TR-RNF-010** el listado entre tenants devuelve solo datos de cabecera (código, nombre, estado, suscripciones), nunca datos de negocio del cliente.
- **TR-RNF-013** el cambio de estado queda en el historial del 03; la auditoría completa es del spec 20.
- **TR-RNF-014** inactividad 30 min (parámetro `plat.sesion.minutos_inactividad`, `inactividadMinutos` del 13).
- **TR-RNF-018** responsiva 360/768/1280 px, español de Perú (mismo criterio que el 15).
- **TR-RNF-019** axe-core sin `critical`/`serious` (criterio propio, como el 15).
- Plan (tabla de autenticación): «Exige aal2 en permisos sensibles **y en la consola**». La app entera va detrás de `aal2Guard`.

## 6. U-06: app autónoma con sesión compartida

- SRS: APP-02 es una **librería** embebible (`plataforma-admin-cliente`, rutas lazy en `<cod>-backoffice`); no prevé app propia. El plan agrega la app porque SazónPOS (otro repositorio, Angular de otra versión) no puede embeber la lib (ADR-31, PL-08: «menú Administración (misma cookie .dominio.pe)»).
- Ya existe: `apps/plataforma-admin` (spec 14, tags `scope:app`, `type:app`, puerto 4200, proxy `/v1` → 3000), `ConfigAuth.dominioCookie?` y cookie `@supabase/ssr` con `domain` solo si se configura (spec 13). `environment.ts` de dev no define `dominioCookie`; `environment.prod.ts` está vacío.
- Trabajo de U-06 (2 h): `dominioCookie` por ambiente (`.<dominio>` en staging y prod, sin valor en local); URLs de retorno de Supabase por subdominio (`/auth/callback`, `/auth/nueva-clave`); CORS de `apps/api` para `admin.` y `consola.`; entrada profunda desde otra app (`/admin/usuarios?returnUrl=`) y enlace de vuelta al origen con lista blanca de orígenes; salir en una app cierra la otra (misma cookie).
- Verificación: SazónPOS no usa Supabase Auth hasta el spec 23 (CC-10). La sesión compartida solo se puede probar entre dos apps de Vitrina en subdominios hermanos (consola y admin), con un dominio local que acepte cookies de dominio padre (archivo hosts con `*.vitrina.test`; `localhost` no sirve). Esto ata U-06 a que exista `plataforma-consola`, lo que justifica la división pedida; con la propuesta P1, el 17b va después del 17a y prueba igual.
- Riesgo: la cookie no es `httpOnly` (cliente de navegador). Con `domain=.<dominio>`, cualquier subdominio con XSS lee la sesión. Los sitios públicos de tenants (CMS, R3) no deben vivir bajo el mismo dominio padre.

## 7. Horas del plan

| ID | Sprint | Horas | Tipo | Componente | RF | Descripción |
|---|---|---|---|---|---|---|
| **O-04** | 2 | 5 | Front | Consola | TR-RF-001, 006 | plataforma-consola: base con MFA obligatorio; tenants (lista, alta, estado) |
| **U-06** | 5 | 2 | Front | Admin cliente | — | App plataforma-admin autónoma (para SazónPOS) con sesión compartida |

Plan: 7 h, ambas «Front». Faltan las piezas de backend que nadie dejó (sección 8). Estimación:

| Pieza | h |
|---|---|
| App `plataforma-consola` (copia de la configuración de `plataforma-admin`, `aal2Guard`, `rutasDelShell`, puerto 4201, proxy) | 1 |
| Lib `consola-tenants`: lista con filtros y paginación, detalle, asistente de alta (2 pasos), diálogo de cambio de estado | 4 |
| Backend consola: función `SECURITY DEFINER` de listado y detalle, `GET` lista y detalle, `POST` estado, manifiesto PLAT con permiso y opciones | 3-3,5 |
| U-06 (sesión compartida, CORS, retorno) | 2 |
| Verificación en navegador y prueba cronometrada | 0,5-1 |
| **Total** | **10,5-11,5** |

Con U-06 fuera (P1), 17a ≈ 8,5-9,5 h. La suscripción editable (RF-005) sumaría unas 2-3 h más; no cabe.

## 8. Estructura, endpoints y límites Nx

### Endpoints que consume la consola

| Pantalla | Endpoint | Estado | Nota |
|---|---|---|---|
| Arranque, menú | `GET /v1/seg/mi-contexto` | Existe | Trae `aal`, `mfa_vigente`, `tipo_usuario`, `permisos`, `menu`. **No trae el código del tenant activo** ni un indicador de operador |
| Asistente de alta | `POST /v1/org/tenants` | Existe (12) | Errores `SOLICITUD_INVALIDA`, `RUC_INVALIDO`, `OPERADOR_REQUERIDO`, `TENANT_DUPLICADO`, `IDENTIDAD_NO_DISPONIBLE`, `MFA_REQUERIDA`. Respuesta con `correo_enviado` y `usuario_nuevo` |
| Lista de tenants | `GET /v1/org/tenants?q=&estado=&producto=&pagina=&tamano=` | **Falta** | RLS de `org.tenant` es por `id`: hace falta una función `SECURITY DEFINER` (dueño `org_lector`, patrón del 12) llamada solo tras la comprobación de operador |
| Detalle | `GET /v1/org/tenants/:id` | **Falta** | Cabecera, suscripciones, empresa principal; historial de estados opcional (`org.tenant_estado_historial`) |
| Cambio de estado | `POST /v1/org/tenants/:id/estado` `{ estado, motivo }` | **Falta** | `CambiarEstadoTenant` dentro de `TenantContext.run({ tenantId: id })` en `apps/api` (como el orquestador del 12), con comprobación de operador. Mismo riesgo del 12: no reutilizar la transacción abierta por `PermisoGuard` con el tenant del operador |
| Suscripción | `PUT /v1/org/tenants/:id/suscripciones/:producto` | Falta, fuera | RF-005 sin historia de UI |
| Productos y planes | — | Constantes | `PRODUCTOS` y `PLANES` exportados por `org`; el front los repite como enum del DTO (no hay endpoint de productos) |

### Permisos y operador

- En el manifiesto PLAT `1.5.0` solo está `plat.tenant.crear`. `plat.tenant.cambiar_estado` y `plat.suscripcion.gestionar` existen solo como constantes en `PERMISOS_ORG` (el comentario del archivo dice que están en el manifiesto: no lo están). Falta también un permiso de lectura (`plat.tenant.consultar`, propuesto) para la lista y el detalle.
- `PLAT_ADMIN_TENANTS` tiene hoy `plat.tenant.crear` y `plat.sesion.contexto`; debe sumar los nuevos. `PLAT_PROPIETARIO` no debe tenerlos.
- `tipo_usuario` no distingue operador de cliente: el operador y los propietarios invitados son `INTERNO`. El operador se reconoce por el tenant activo (`plataforma`), que `mi-contexto` no expone. Opciones (P3): (a) la consola se muestra por permiso (`plat.tenant.consultar`) y la API responde 403 `OPERADOR_REQUERIDO` al resto; (b) `mi-contexto` agrega `es_operador`. Recomendación: (a), sin tocar `mi-contexto`; la API decide.
- Un operador que también es miembro de un tenant cliente entra con el `tenant_preferido` y no puede cambiar (no hay `mi-tenant`). Riesgo aceptado en dev; el operador usa un correo propio.
- Menú: `seg.opcion` es por producto, no por app. El operador (que tiene `PLAT_PROPIETARIO` + `PLAT_ADMIN_TENANTS`) verá en la consola las opciones `/admin/*` y en `plataforma-admin` la opción de tenants. El 15 manda las rutas no registradas a la 404 (decisión del usuario). Propuesta (P4): opciones de consola con prefijo `/consola` en un módulo `consola` del manifiesto y, si molesta, filtrar por prefijo en cada app cuando el 15 esté cerrado (no tocar `shared/shell` antes).

### Libs y límites Nx

```
apps/plataforma-consola/        scope:app, type:app (como plataforma-admin del 14)
  src/app/app.routes.ts         /auth (shared/auth-ui) · rutasDelShell([...]) · /tenants lazy · aal2Guard
libs/plataforma/consola-tenants/  scope:plataforma, type:feature
  lista/ · detalle/ · alta/ (asistente) · estado/ (diálogo) · data-access local (HttpClient)
apps/api/src/org/               consola-tenants.controller.ts · consulta-tenants.ts (orquestación, como alta-tenant.ts)
db/01a_org_consola.sql          función de listado/detalle SECURITY DEFINER + inverso + prueba SQL
libs/plataforma/seguridad/manifiesto/plat.manifiesto.json   1.6.0: permisos, rol, módulo y opciones de consola
```

- `type:feature` puede usar `shared/ui`, `shared/auth` (data-access) y `shared/util` (`validarRuc`). No puede importar `libs/plataforma/org` (es `type:backend`): los tipos del DTO se repiten en el front o van a `libs/shared/contracts` si ese es el patrón vigente (existe la carpeta; verificar al redactar).
- `libs/plataforma/data-access` (cliente HTTP generado desde OpenAPI) no existe; no crearlo aquí. Servicio HTTP simple dentro de la lib de feature.
- Las apps usan la etiqueta `scope:app` (spec 14), no `scope:plataforma` como dice `estructura_frontend.txt`.

### Paralelo con el spec 16

El 16 trabaja en `apps/plataforma-admin`, crea `libs/plataforma/admin-cliente` y controladores de `seguridad` (roles, perfiles, asignaciones). Con la propuesta P1, el 17a no comparte ninguna lib ni app con el 16. Archivos compartidos:
- `plat.manifiesto.json`: los dos suben versión y agregan permisos u opciones. Conflicto seguro de merge; acordar versiones (16 = `1.6.0`, 17a = `1.7.0`, o al revés) y resolver a mano.
- `apps/api/src/app.module.ts`: si el controlador de consola se registra ahí. Conflicto trivial.
- Con la división pedida (U-06 en 17a), el 17a además edita `apps/plataforma-admin` (`environments`, `app.config.ts`), que el 16 también toca (`app.routes.ts`): conflicto bajo pero real.

## 9. Visor de auditoría

**No entra.** Motivos: E-01 (spec 20) no tiene historia de UI («visor Angular: spec 17 / U-06 si aplica», dice su paquete); U-06 no es un visor; el backend de auditoría (spec 20) no está implementado; y RF-086 (consulta de auditoría) es de APP-02 con alcance por sucursal (TR-CA-214), no de la consola. El plan pone en la consola solo «integridad de auditoría», que es R2/R3. El detalle del tenant puede mostrar el historial de estados del 03, que no es el visor. El visor queda para un spec posterior al 20, en `admin-cliente`.

## 10. Brechas y decisiones pendientes

Brechas:
1. Backend de consola inexistente: lista, detalle y cambio de estado (sección 8). Ningún spec los dejó.
2. Permisos `plat.tenant.cambiar_estado`, `plat.suscripcion.gestionar` y uno de lectura no están en el manifiesto; `PERMISOS_ORG` dice lo contrario.
3. El plan R1 pone «suscripción» en la consola; O-04 no la incluye y RF-005 no tiene historia de UI.
4. No hay forma de saber en el cliente si el usuario es operador; `tipo_usuario` no sirve.
5. El menú no distingue app; opciones de admin aparecen en la consola y viceversa.
6. El 14 dejó dicho que la consola amplía `plataforma-admin`; el plan dice dos apps.
7. U-06 no se puede probar con SazónPOS hasta el spec 23; solo entre apps de Vitrina con hosts locales.
8. Las URLs de retorno de Supabase dev están registradas para `127.0.0.1:4200`; una segunda app (4201) y los subdominios locales necesitan alta en el panel (manual, como en el 14).
9. CA-016 promete correo y «solo consultar y pagar»: R2 y spec 07; la UI no puede cumplirlo entero.

GWT a proponer:
- Lista: DADO QUE existen «polleria-dona-rosa» (PRUEBA) y «gym-fuerza-total» (SUSPENDIDO) · CUANDO el operador filtra por SUSPENDIDO · ENTONCES ve solo «gym-fuerza-total» con su estado y sus suscripciones.
- Acceso sin MFA: DADO QUE el operador ingresó con aal1 · CUANDO abre la consola · ENTONCES se le pide el segundo factor antes de ver cualquier pantalla.
- No operador: DADO QUE el propietario de «polleria-dona-rosa» se asignó `PLAT_ADMIN_TENANTS` · CUANDO consulta la lista de tenants · ENTONCES la consola muestra la página 403 y la API responde `OPERADOR_REQUERIDO`.
- Alta sin correo: DADO QUE el propietario ya tenía cuenta y falla el envío del enlace · CUANDO termina el asistente · ENTONCES el tenant queda creado y la consola avisa que el correo no se envió.
- Step-up a mitad del asistente: DADO QUE el MFA del operador venció mientras llenaba el asistente · CUANDO confirma el alta · ENTONCES se le pide el segundo factor y, al volver, el formulario conserva los datos.
- Destinos de estado: DADO QUE el tenant está en BAJA · CUANDO el operador abre el cambio de estado · ENTONCES no se ofrece ningún destino.
- Cronometrada (RNF-029): un operador entrenado completa el alta en menos de 15 min.
- U-06: DADO QUE Carmen ingresó en `consola.vitrina.test` · CUANDO abre `admin.vitrina.test` · ENTONCES entra sin volver a autenticarse; y al salir en una, la otra pide ingresar.

Preguntas candidatas para la Fase 2 de /spec (recomendación entre paréntesis):
- **P1. ¿Se reparte U-06?** (Sí: 17a = O-04 + backend de consola; 17b = U-05 + U-06 + controladores de org. Sigue el plan, deja el 17a sin archivos de `plataforma-admin` y ambos caben en 10 h. Alternativa más limpia, ver 17b sección 7: un spec de backend «org-http» (endpoints de consola y de cliente, ≈ 7 h, en paralelo con el 16) y 17a/17b solo front.)
- **P2. ¿App separada `plataforma-consola` o consola dentro de `plataforma-admin`?** (Separada, como el plan y PL-08: `aal2Guard` global, otro subdominio y sin choque con el 16. Cuesta 1 h porque auth, auth-ui, shell y ui ya existen.)
- **P3. ¿Cómo se reconoce al operador en el cliente?** (Por permiso de lectura de tenants; la API decide con `OPERADOR_REQUERIDO`. Sin cambio en `mi-contexto`.)
- **P4. ¿Menú por app?** (Opciones de consola con prefijo `/consola` en un módulo propio; rutas ajenas caen en la 404 del 15. Filtrar por prefijo, después del 15.)
- **P5. ¿Lista y detalle entre tenants cómo?** (Función `SECURITY DEFINER` dueña `org_lector` que devuelve solo cabecera y suscripciones, paginada, llamada desde `apps/api` tras la comprobación de operador. Mismo patrón que `org.tenant_por_codigo`.)
- **P6. ¿`plat.tenant.cambiar_estado` sensible?** (Sí: RF-006 exige MFA vigente.)
- **P7. ¿Suscripción en la consola?** (Solo lectura en el detalle. Edición en un spec aparte de unas 3 h.)
- **P8. ¿Historial de estados en el detalle?** (Sí, solo lectura, si la función de detalle lo devuelve sin costo extra; si no, fuera.)
- **P9. ¿Tipos del DTO?** (Revisar `libs/shared/contracts` al redactar; si no aplica, interfaces locales en la lib de feature.)
- **P10. ¿Pruebas y evidencia?** (Supertest de los tres endpoints con operador, no operador y sin MFA; prueba SQL de la función con dos tenants; componentes con Vitest; Playwright en 360/768/1280 contra Supabase dev, axe-core y la prueba cronometrada; los datos de prueba se borran.)
