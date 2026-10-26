# Contexto para el spec 17b · consola-plataforma

Paquete de contexto (no es el spec). Fuentes: `docs/roadmap-specs.md`, specs `03`, `12`, `13`, `14` y `15` (este último en implementación), `docs/spec-context/13-auth-cliente-angular.md`, `15-shell-y-ui.md`, `17a-org-http.md` y `20-aud-auditoria.md`, SRS xlsx (hojas Aplicaciones, Actores, Reglas de negocio, RF, Criterios GWT, RNF, Componentes), plan docx (secciones 6.1, 7 y 12), `3_plan.json`, `2_Estructura/estructura_frontend.txt`, `1_Mermaid/PL-04` y `PL-08`, y el código actual de `apps/` y `libs/`. Ruta base del plan: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.

## 1. Alcance y límites con otros specs

- Roadmap: spec 17b `consola-plataforma`, cubre **O-04** (RF 001, 006): app `plataforma-consola`, solo front. 7 h; depende de **15** y **17a**. Ola 6: después del 17a, en paralelo con el 16a (solo comparten `plat.manifiesto.json`, y con D4 ni eso).
- La estructura (`estructura_frontend.txt`, PL-08, plan 6.1) separa dos apps:
  - `apps/plataforma-consola` (`consola.<dominio>`): equipo de plataforma, `/tenants`, `/catalogos`, `/eventos`, `/salud`, MFA obligatoria. **La crea este spec.**
  - `apps/plataforma-admin` (`admin.<dominio>`): administración del cliente; monta `libs/plataforma/admin-cliente`; SazónPOS la abre con la misma cookie (ADR-31). Es del 16a/16b/17c.
- Límite con el **17a**: el 17a deja la API (lista, detalle y estado de tenants; permisos y opciones de menú en el manifiesto). Este spec no escribe backend.
- Límite con el **12**: el 12 dejó `POST /v1/org/tenants`. Dejó a la consola el asistente de alta y la prueba cronometrada de TR-RNF-029.
- Límite con el **13/14/15**: `shared/auth` (`aal2Guard`, `permisoGuard`, `*siPermiso`, `dominioCookie`), `shared/auth-ui` (páginas `/auth`) y `shared/ui` + `shared/shell` (layout, menú, `vit-tabla`, `vit-filtros`, `AvisosService.confirmarDestructiva`) se consumen sin cambios. La opción `longitudMinimaMotivo` la agrega el 16a; aquí se usa el default 10.
- Límite con el **17c**: U-06 (sesión compartida) es del 17c y se prueba entre `consola.` y `admin.`; necesita que esta app exista.
- Límite con el **19b** (consola de catálogos, D-06): también vive en `plataforma-consola`; depende de este spec.
- Fuera de alcance: backend (17a), suscripción editable (RF-005), catálogos globales (19b), eventos fallidos (`GET /v1/evt/fallidos` existe, sin historia de UI en R1), salud (21), visor de auditoría (ver 17c), padrón RUC y advertencia NO HABIDO (TR-IDN, R2), selector de tenant.

## 2. Requisitos funcionales

Aplicación SRS: **APP-01** «Consola de plataforma» (Angular · app Nx `plataforma-consola`; usuarios: administrador de plataforma ACT-01 y agente de soporte ACT-02; 23 RF en total, la mayoría R2/R3). Plan 6.1, R1: «Tenants (alta, estado, suscripción), catálogos globales, eventos fallidos».

| ID | Nombre | Permiso | Prioridad | Fase | Backend |
|---|---|---|---|---|---|
| TR-RF-001 | Dar de alta un tenant con asistente | plat.tenant.crear | Must | MVP | Spec 12: `POST /v1/org/tenants` |
| TR-RF-006 | Cambiar estado del tenant | plat.tenant.cambiar_estado | Must | MVP | Spec 17a: `POST /v1/org/tenants/:id/estado` |

**TR-RF-001** (administrador de plataforma con MFA vigente; producto existente). Flujo: 1 captura código, nombre, producto, plan y modalidad; 2 captura RUC, razón social y correo del propietario; 3 valida RUC (RN-002) y consulta el padrón (TR-IDN, R2: no hay); 4 crea tenant, suscripción, empresa y sucursal principal 0000 en una transacción; 5 siembra; 6 invita al propietario y publica `tenant.creado`. Datos: `codigo` 3-30, minúsculas y guiones, único; `nombre` 3-150; `producto_codigo`; plan `BASICO|PRO|EMPRESA`; modalidad `PRUEBA|ACTIVO`; `ruc` 11 dígitos; `correo_propietario`. Salida: tenant `PRUEBA` o `ACTIVO`, asistente en menos de 15 min. Reglas 001, 002, 003, 005. RNF 029, 010, 008. Pasos 4 a 6 ya los hace el 12 en una llamada; la UI es un asistente de dos pasos sobre un solo `POST`.

**TR-RF-006** (administrador de plataforma, MFA vigente). Flujo: elige estado y motivo; confirmación explícita; valida la transición (RN-005); aplica, cierra sesiones si `SUSPENDIDO` o `BAJA`, audita y notifica al propietario. Datos: `estado_nuevo` `ACTIVO|SUSPENDIDO|BAJA`; `motivo` 10-500 obligatorio; `fecha_efectiva` (por defecto ahora). Reglas 005, 009. RNF 021, 013. En la UI: diálogo con `confirmarDestructiva` (default 10, coincide con el back).

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

Notas: el RUC 20601234561 de CA-001 no pasa módulo 11; los specs 03 y 12 usan 20601234565. CA-003 en la UI se cumple con `validarRuc` de `libs/shared/util` (spec 03) antes de avanzar de paso. CA-016: «Deuda de 60 días» tiene 16 caracteres, pasa el mínimo de 10; «solo consultar y pagar» es del guard (spec 07, pendiente) y el correo es R2; la UI solo cubre el cambio y el mensaje. CA-017: la UI no ofrece destinos desde BAJA; el rechazo por HTTP lo prueba el 17a.

### GWT faltantes a proponer

- Lista: DADO QUE existen «polleria-dona-rosa» (PRUEBA) y «gym-fuerza-total» (SUSPENDIDO) · CUANDO el operador filtra por SUSPENDIDO · ENTONCES ve solo «gym-fuerza-total» con su estado y sus suscripciones.
- Acceso sin MFA: DADO QUE el operador ingresó con aal1 · CUANDO abre la consola · ENTONCES se le pide el segundo factor antes de ver cualquier pantalla.
- No operador: DADO QUE el propietario de «polleria-dona-rosa» se asignó `PLAT_ADMIN_TENANTS` · CUANDO consulta la lista de tenants · ENTONCES la consola muestra la página 403 y la API responde `OPERADOR_REQUERIDO`.
- Alta sin correo: DADO QUE el propietario ya tenía cuenta y falla el envío del enlace · CUANDO termina el asistente · ENTONCES el tenant queda creado y la consola avisa que el correo no se envió.
- Step-up a mitad del asistente: DADO QUE el MFA del operador venció mientras llenaba el asistente · CUANDO confirma el alta · ENTONCES se le pide el segundo factor y, al volver, el formulario conserva los datos.
- Destinos de estado: DADO QUE el tenant está en BAJA · CUANDO el operador abre el cambio de estado · ENTONCES no se ofrece ningún destino.
- Motivo corto: con «Deuda» (5 caracteres) el diálogo no habilita confirmar (default 10, igual que ORG).
- Cronometrada (RNF-029): un operador entrenado completa el alta en menos de 15 min.

## 4. Reglas de negocio

- **TR-RN-002** RUC módulo 11 (`validarRuc` en cliente; el servidor repite).
- **TR-RN-005** la UI solo ofrece los destinos válidos desde el estado actual (matriz del 03; el front la repite porque no puede importar `org`).
- **TR-RN-009** `plat.tenant.crear` y `plat.tenant.cambiar_estado` son sensibles; la consola entera va detrás de `aal2Guard`.
- Operador vs. cliente (D2): la consola se muestra por permiso (`plat.tenant.consultar`); la API decide con `OPERADOR_REQUERIDO` y la consola lo muestra como 403.

## 5. RNF

- **TR-RNF-029** alta de cliente en < 15 min con asistente; prueba cronometrada.
- **TR-RNF-021** suspender y dar de baja usan `confirmarDestructiva` del 15 con motivo (default 10).
- **TR-RNF-008** la UI evita doble envío (botón deshabilitado mientras viaja la petición); el alta choca por `codigo` (409).
- **TR-RNF-014** inactividad 30 min (`plat.sesion.minutos_inactividad`, `inactividadMinutos` del 13).
- **TR-RNF-018** responsiva 360/768/1280 px, español de Perú.
- **TR-RNF-019** axe-core sin `critical`/`serious` (criterio propio, como el 15).
- Plan (tabla de autenticación): «Exige aal2 en permisos sensibles **y en la consola**».

## 6. Horas

| ID | Sprint | Horas | Tipo | Componente | RF | Descripción |
|---|---|---|---|---|---|---|
| **O-04** | 2 | 5 | Front | Consola | TR-RF-001, 006 | plataforma-consola: base con MFA obligatorio; tenants (lista, alta, estado) |

Estimación (roadmap: 7 h):

| Pieza | h |
|---|---|
| App `plataforma-consola` (copia de la configuración de `plataforma-admin`, `aal2Guard`, `rutasDelShell`, puerto 4201, proxy) | 1 |
| Lib `consola-tenants`: lista con filtros y paginación, detalle, asistente de alta (2 pasos), diálogo de cambio de estado | 4 |
| Menú por app (filtrar opciones `/consola`, P2) | 0,5 |
| Verificación en navegador y prueba cronometrada | 0,5-1 |
| **Total** | **6-6,5** |

## 7. Estructura, endpoints y límites Nx

### Endpoints que consume

| Pantalla | Endpoint | Dueño |
|---|---|---|
| Arranque, menú | `GET /v1/seg/mi-contexto` | 06. Trae `aal`, `mfa_vigente`, `tipo_usuario`, `permisos`, `menu`; no trae el código del tenant activo ni un indicador de operador (D2: no hace falta) |
| Asistente de alta | `POST /v1/org/tenants` | 12. Errores `SOLICITUD_INVALIDA`, `RUC_INVALIDO`, `OPERADOR_REQUERIDO`, `TENANT_DUPLICADO`, `IDENTIDAD_NO_DISPONIBLE`, `MFA_REQUERIDA`; respuesta con `correo_enviado` y `usuario_nuevo` |
| Lista | `GET /v1/org/tenants?q=&estado=&producto=&pagina=&tamano=` | 17a |
| Detalle | `GET /v1/org/tenants/:id` | 17a |
| Cambio de estado | `POST /v1/org/tenants/:id/estado` `{ estado, motivo }` | 17a |
| Productos y planes | — | Constantes repetidas en el front (no hay endpoint) |

### Libs y límites Nx

```
apps/plataforma-consola/        scope:app, type:app (como plataforma-admin del 14)
  src/app/app.routes.ts         /auth (shared/auth-ui) · rutasDelShell([...]) · /tenants lazy · aal2Guard
libs/plataforma/consola-tenants/  scope:plataforma, type:feature
  pages/ lista · detalle · alta (asistente) · components/ cambio-estado (diálogo) · services/ (HttpClient) · models/
```

- `type:feature` puede usar `shared/ui`, `shared/auth` (data-access) y `shared/util` (`validarRuc`). No puede importar `libs/plataforma/org` (`type:backend`): los tipos del DTO se repiten en `models/` o van a `libs/shared/contracts` (existe, vacía; P4).
- `libs/plataforma/data-access` no existe; no crearlo aquí.
- Las apps usan la etiqueta `scope:app` (spec 14), no `scope:plataforma` como dice `estructura_frontend.txt`.
- Conflictos: ninguno con 16a (otra app, otra lib). `apps/api` no se toca.

## 8. Diagramas

- **PL-08**: consola y admin en subdominios hermanos, misma cookie.
- **PL-04**: ingreso con MFA; la consola exige aal2 en todo.

## 9. Decisiones tomadas

- **D1. Longitud del motivo** (decisión del usuario): ORG valida 10-500; la consola usa `confirmarDestructiva` con el default 10, sin `longitudMinimaMotivo`.
- **D2. Operador vs. cliente** (decisión del usuario): por permiso (`plat.tenant.consultar` para mostrar la consola) y `OPERADOR_REQUERIDO` en la API, no por `tipo_usuario`. Sin cambio en `mi-contexto`.
- **D3. App separada** `plataforma-consola`, como el plan y PL-08: `aal2Guard` global, otro subdominio, sin choque con 16a/16b/17c.
- **D4. División** (roadmap): solo front; el back está en el 17a, incluidas las opciones de menú.

## 10. Brechas restantes

1. El menú no distingue app (`seg.opcion` es por producto): opciones de admin aparecen en la consola y viceversa. Filtrar por prefijo `/consola` en cada app toca `shared/shell` o la app; no tocar `shared/shell` mientras el 15 esté en implementación.
2. El spec 14 leyó `plataforma-admin` como la consola («Ampliar `plataforma-admin` como consola: spec 17 (U-06)»); el plan dice dos apps. No se corrige el 14; se anota.
3. Las URLs de retorno de Supabase dev están registradas para `127.0.0.1:4200`; la consola (4201) necesita alta en el panel (manual, como en el 14).
4. CA-016 promete correo y «solo consultar y pagar»: R2 y spec 07; la UI no puede cumplirlo entero.
5. CA-001 usa un RUC que no pasa módulo 11.
6. El plan R1 pone «suscripción» en la consola; O-04 no la incluye. Solo lectura en el detalle.
7. Step-up a mitad del asistente: el 13 navega a `/auth/mfa` sin reintento; conservar el formulario exige borrador o chequear `mfa_vigente` antes de confirmar.

## 11. Preguntas candidatas para la Fase 2 de /spec

- **P1. ¿Step-up en el asistente?** (Chequear `mfa_vigente` antes de confirmar y mandar primero a MFA; borrador en memoria del servicio si cabe.)
- **P2. ¿Menú por app?** (Opciones de consola con prefijo `/consola`; filtrar en la app, sin tocar `shared/shell` antes de que cierre el 15; rutas ajenas caen en la 404 del 15.)
- **P3. ¿Suscripción en la consola?** (Solo lectura en el detalle; edición en un spec aparte de unas 3 h.)
- **P4. ¿Tipos del DTO?** (Revisar `libs/shared/contracts` al redactar; si no aplica, interfaces locales en `models/`.)
- **P5. ¿Pruebas y evidencia?** (Vitest de páginas y diálogo; Playwright en 360/768/1280 contra Supabase dev con operador, no operador y sin MFA; axe-core; prueba cronometrada; los datos de prueba se borran.)
