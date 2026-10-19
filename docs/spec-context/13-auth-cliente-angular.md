# Contexto para los specs 13 y 14 · auth-cliente-angular y auth-ui-minima (antes "spec 05")

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx, plan docx, `3_plan.json`, `codigo/`. Ruta base del código: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.

## 1. Alcance y dependencias

- Roadmap: spec 05 `auth-cliente-angular`, cubre **A-04** (shared/auth: verificar APIs contra Angular 21). Depende del **04** (seg-autenticacion-back: A-01, A-02, A-03, A-05). Lo consumen 08 (shell-y-ui) y luego 09/10/22.
- Historia A-04 (sprint 1, 6 h, Front, R1): cliente Supabase, ingreso con correo, Google y Microsoft, recuperación, sesión en cookie de dominio. El MFA TOTP de cliente (enrolar/desafiar/verificar) está en `sesion.service.ts`, pero en el backlog su historia es A-05 (Full, 4 h, TR-RF-017), que el roadmap asigna al spec 04. El encargo pide el MFA de cliente aquí: la parte cliente de A-05 queda en este spec, la parte backend en el 04.
- **auth-ui (páginas /auth)**: `estructura_frontend.txt` lista `libs/shared/auth-ui` (type:feature: ingresar, callback OAuth, mfa enrolar/verificar, recuperar y nueva clave, aceptar invitación). **No hay historia en el backlog para auth-ui** (A-04 solo menciona shared/auth; U-01/U-02 son ui y shell). El roadmap tampoco lo nombra en el 08 (U-01, U-02). Recomendación: las rutas `/auth/*` son requisito de los guards (`/auth/ingresar`, `/auth/mfa`) y de los `redirectTo` (`/auth/callback`, `/auth/nueva-clave`), así que el 05 debe incluir un auth-ui mínimo (ingresar, callback, mfa, recuperar/nueva clave); "aceptar invitación" va al 07 (S-04); sistema de diseño y shell al 08. Decisión abierta (P1). Ojo: auth-ui depende de `shared/ui` (U-01, sprint 4) si se quiere usar el sistema de diseño.
- Límites Nx: `scope:shared` no importa fuera de shared; `type:data-access` (auth) no importa `feature`.

## 2. Requisitos funcionales

| ID | Nombre | Permiso | Prioridad | Fase |
|---|---|---|---|---|
| TR-RF-010 | Aceptar invitación y vincular identidad | publico.invitacion.aceptar | Must | MVP |
| TR-RF-016 | Seleccionar empresa y sucursal de trabajo | plat.sesion.contexto | Must | MVP |
| TR-RF-017 | Exigir MFA para permisos sensibles | plat.mfa.elevar | Must | MVP |

Los tres son MOD-02 TR-SEG, proceso TR-P02. APP-05 (libs Angular y shell) para 010 y 016; APP-03 (API) para 017.

**Importante**: el SRS no tiene ningún RF de "ingreso con correo/Google/Microsoft", "recuperación de clave" ni "sesión en cookie". Esas capacidades solo existen en el plan (ADR-29) y en el código; el SRS asume un IdP OIDC genérico. Los RF se cubren en su parte de interfaz:

**TR-RF-010** (interfaz: abrir enlace, autenticarse en el IdP, mostrar errores). Precondición: invitación vigente y no usada. Flujo: 1 el invitado abre el enlace; 2 el shell redirige al IdP; 3 el IdP devuelve token con sub y correo verificado; 4 se verifica que el correo coincida con la invitación y se activa membresía y asignación; 5 evento ASIGNACION_OTORGADA. Datos: token_invitacion (cadena de un solo uso), sub (uuid), correo_verificado (bool). Regla TR-RN-008. RNF 009, 014. Backlog: A-01, A-03 y A-04 declaran TR-RF-010; la aceptación real es S-04 (spec 07).

**TR-RF-016** (interfaz: selector). Precondición: autenticado con al menos una membresía ACTIVA. Flujo: 1 el shell obtiene sucursales con `seg.sucursales_accesibles`; 2 si hay una sola, la selecciona; 3 si varias, selector con la última usada preseleccionada; 4 al confirmar fija el contexto y carga el menú. Datos: tenant_id, empresa_id, sucursal_id (uuid); ultima_seleccion (por usuario). Regla TR-RN-007. RNF 101, 018, 020. Backlog: U-02 (spec 08), no A-04; aquí solo la lógica de sesión (`cargarContexto`, `seleccionarSucursal`, guard).

**TR-RF-017** (interfaz: step-up). Precondición: permiso con sensible = true. Flujo: 1 el guard detecta permiso sensible; 2 verifica claim amr/auth_time; 3 si supera 15 min responde 401 con desafío step-up; 4 el shell redirige al IdP al segundo factor y reintenta con el nuevo token; 5 se audita con indicador MFA. Datos: permiso, auth_time (epoch), amr (otp o webauthn). Regla TR-RN-009. RNF 009, 013. Backlog: A-05.

## 3. Criterios GWT (tal cual)

**TR-CA-028** · TR-RF-010 · Aceptación exitosa · Positivo
DADO QUE rosa.huaman@gmail.com tiene una invitación vigente · CUANDO acepta e inicia sesión en el IdP con ese correo · ENTONCES su membresía queda ACTIVA y ve el menú del perfil «Cajero»

**TR-CA-029** · TR-RF-010 · Invitación vencida · Negativo
DADO QUE la invitación fue emitida hace 80 horas · CUANDO el invitado abre el enlace · ENTONCES el sistema muestra «La invitación expiró; solicite una nueva al administrador»

**TR-CA-030** · TR-RF-010 · Correo distinto · Negativo
DADO QUE la invitación es para rosa.huaman@gmail.com · CUANDO el invitado inicia sesión con rosa.h@hotmail.com · ENTONCES el sistema no activa la membresía y muestra «Esta invitación pertenece a otro correo»

**TR-CA-044** · TR-RF-016 · Usuario con una sola sucursal · Positivo
DADO QUE Rosa solo tiene acceso a la sucursal «Miraflores» · CUANDO inicia sesión · ENTONCES ingresa directamente a «Miraflores» sin ver el selector

**TR-CA-045** · TR-RF-016 · Cambio de sucursal en sesión · Positivo
DADO QUE Carmen tiene acceso a «Miraflores» y «Surco» · CUANDO cambia a «Surco» desde el encabezado · ENTONCES el menú y los datos se recargan con el contexto de «Surco» sin pedir nueva autenticación

**TR-CA-046** · TR-RF-016 · Sin sucursales accesibles · Negativo
DADO QUE todas las asignaciones de Jorge vencieron · CUANDO inicia sesión · ENTONCES el shell muestra «No tiene accesos vigentes; contacte a su administrador»

**TR-CA-047** · TR-RF-017 · Anulación con MFA reciente · Positivo
DADO QUE la cajera completó MFA hace 5 minutos y tiene el permiso sensible rest.venta.anular · CUANDO anula una venta · ENTONCES la anulación se ejecuta y la auditoría registra mfa = verdadero

**TR-CA-048** · TR-RF-017 · MFA vencido · Negativo
DADO QUE el último MFA del usuario fue hace 40 minutos · CUANDO intenta exportar la lista de pacientes · ENTONCES el sistema solicita el segundo factor y no ejecuta la exportación hasta completarlo

Total 8 GWT. Aplicables a la interfaz de este spec: 044, 045, 046, 048 (047 es sobre todo backend). 028-030 dependen de S-04 (spec 07). No existen GWT para ingreso, OAuth, recuperación, cookie ni enrolamiento TOTP: habrá que proponerlos en el spec.

## 4. Reglas TR-RN y RNF

TR-RN (las referenciadas por los RF):
- **TR-RN-007**: permisos `producto.recurso.accion`, evaluados por alcance TENANT/EMPRESA/SUCURSAL/UNIDAD; los PLAT no dependen de suscripción.
- **TR-RN-008**: asignación con rol o perfil (no ambos ni ninguno), alcance coherente, vigencia hasta >= desde.
- **TR-RN-009**: permisos sensibles exigen MFA con antigüedad máxima 15 min y quedan auditados.

RNF pedidos (todos existen en el SRS):
- **TR-RNF-009** Autenticidad: OIDC centralizado, contraseñas gestionadas por el IdP, bloqueo tras 5 intentos fallidos, MFA obligatorio para sensibles. Verif.: revisión de configuración + prueba.
- **TR-RNF-014** Confidencialidad: sesión con expiración por inactividad configurable (30 min por defecto en backoffice) y tokens de corta duración con renovación.
- **TR-RNF-018** Operabilidad: interfaz responsiva escritorio/tableta/móvil (>= 360 px) en español de Perú.
- **TR-RNF-019** Accesibilidad: portales públicos WCAG 2.1 AA, 0 errores críticos (axe-core en CI + revisión manual).
- **TR-RNF-023** Coexistencia: dos últimas versiones de Chrome, Edge, Firefox, Safari y Android gama media (e2e multinavegador). Su "N.° RF" es 0 (no enlazado a ningún RF).

Relacionados vía los RF: TR-RNF-101 (caché de permisos, backend), 020 (aprendizaje), 013 (auditoría inmutable). Heredados según CLAUDE.md: 010, 011, 012, 026, etc.

Nota: RNF-014 pide expiración por inactividad; el código base no implementa temporizador de inactividad.

## 5. Historias del backlog (3_plan.json)

| ID | Sprint | Horas | Tipo | RF | Descripción |
|---|---|---|---|---|---|
| **A-04** | 1 | 6 | Front | TR-RF-010 | shared/auth: cliente Supabase, ingreso con correo, Google y Microsoft, recuperación, sesión en cookie de dominio |
| A-05 | 1 | 4 | Full | TR-RF-017 | MFA TOTP: enrolar, desafiar y exigir aal2 en el backend (cliente: aquí; backend: spec 04) |
| A-01 | 1 | 4 | Back | TR-RF-010 | Verificador JWT por JWKS, guard global, @Publico (spec 04) |
| A-02 | 1 | 3 | Back | TR-RF-015 | Hook de token tenant_id/tipo_usuario/versión de permisos (spec 04) |
| A-03 | 1 | 3 | Back | TR-RF-010 | Sincronizar auth.users con seg.usuario (spec 04) |
| U-02 | 4 | 5 | Front | TR-RF-015, 016 | shared/shell: layout, menú dinámico, selector empresa/sucursal, *siPermiso (spec 08) |
| U-01 | 4 | 3 | Front | — | shared/ui: sistema de diseño (spec 08) |
| S-04 | 3 | 4 | Back | TR-RF-009, 010, 014 | Invitar, aceptar, revocar, suspender membresía (spec 07) |
| U-06 | 5 | 2 | Front | — | App plataforma-admin autónoma con sesión compartida (spec 10) |

Sprint 1: 20/20 h (hito S01 "Autenticación con Supabase Auth y MFA"). Las 6 h de A-04 no incluyen auth-ui, UI de MFA ni pruebas: riesgo de pasar las 10 h del spec.

## 6. Tablas SQL, eventos, puertos y permisos

Lado cliente no se toca ninguna tabla (regla 8: frontends solo hablan con la API; el cliente Supabase solo para Auth). Tablas que alimentan lo que consume el cliente (de los specs 04/06): `auth.users` (Supabase), `seg.usuario` (id=sub, email, nombre, tipo, estado, ultimo_acceso, tenant_preferido), `seg.membresia`, `seg.asignacion`, `seg.evento_seguridad` (tipos comentados: LOGIN, ACCESO_DENEGADO, ASIGNACION_OTORGADA, ASIGNACION_REVOCADA, ACCESO_SOPORTE), `org.tenant/empresa/sucursal/unidad_operativa`.
Funciones SQL: `seg.custom_access_token_hook` (agrega `tenant_id`, `tipo_usuario`), `seg.tenant_para_token`, `seg.sucursales_accesibles(usuario, tenant)`, `seg.menu_usuario`, `seg.permisos_efectivos`.
Eventos: ASIGNACION_OTORGADA (RF-010, backend). El cliente no escribe en outbox. El código base no tiene tipo de evento de MFA ni de step-up.
Puertos: ninguno en el cliente (en backend `VerificadorToken`, `PermisosPort`). El cliente usa `HttpClient` y `SupabaseCliente` directo, sin puerto.
Endpoints consumidos (base `apiUrl` = `https://api.<dominio>/v1`): `GET /seg/mi-contexto?sucursalId=`, `PUT /seg/mi-tenant {tenantId}`. **No existen en el código base** (grep sin resultados fuera del cliente; PL-04 solo menciona mi-contexto). Hay que acordarlos con 04/06 (P5). La cabecera `X-Sucursal-Id` la exige `PermisoGuard` (errores SIN_SUCURSAL, SUCURSAL_NO_ASIGNADA, MFA_REQUERIDA, SIN_TENANT, SIN_PERMISO).
Permisos: RF-010 `publico.invitacion.aceptar`; RF-016 `plat.sesion.contexto`; RF-017 `plat.mfa.elevar`. No verifiqué que existan en el seed de `seg.permiso` (spec 06).
Config externa: `supabase/config.toml` (MFA TOTP, OAuth Google/Microsoft, hook), plantillas de correo en español; URLs de retorno OAuth por ambiente (`/auth/callback`, `/auth/nueva-clave`) registradas en Supabase. Son de los specs 02/04.

## 7. Código base relacionado

Ruta: `codigo/libs/shared/auth/src/`. Solo `index.ts` + `lib/*`; no hay `package.json`, `project.json`, `tsconfig`, tests ni README en esta lib (a diferencia de `seguridad`). El plan dice "verificado con TypeScript estricto contra Angular 22.2 y supabase-js 2.118"; `@supabase/ssr` 0.12.

| Archivo | Qué hace | Conservar | Cambiar o falta |
|---|---|---|---|
| `index.ts` | exporta config, supabase.cliente, sesion.service, auth.interceptor, guards, si-permiso.directive | Sí | Falta `provideAuth()` si se crea |
| `lib/config.ts` | `ConfigAuth` + token `CONFIG_AUTH` (supabaseUrl, publishable key, apiUrl, dominioCookie?) | Sí | Sin proveedor de configuración ni valores por ambiente |
| `lib/supabase.cliente.ts` | `createBrowserClient` (`@supabase/ssr`), PKCE, cookie `{domain, sameSite lax, secure, path}`; expone solo `.auth` | Sí (núcleo) | `secure:true` exige HTTPS (probar en localhost); sin `dominioCookie` la sesión no se comparte entre apps; sin inactividad (RNF-014) |
| `lib/sesion.service.ts` | signals `sesion/contexto/sucursalId`, `autenticado`, `permisos`; `ingresarConClave`, `ingresarConProveedor('google'\|'azure')`, `recuperarClave`, `requiereMfa`, `enrolarTotp`, `verificarTotp`, `cambiarTenant`, `cargarContexto`, `seleccionarSucursal`, `salir` | Sí, base | `getSession()` es asíncrono en el constructor: el guard puede correr antes (carrera al recargar); falta `actualizarClave` (`auth.updateUser` tras `/auth/nueva-clave`); sin listar/desenrolar factores; `sucursalId` solo en memoria (RF-016 pide recordar la última); sin manejo de 401 step-up (RF-017); sin caso "sin sucursales" (GWT 046); `onAuthStateChange` no limpia contexto en SIGNED_OUT; `cambiarTenant` llama a endpoint inexistente; usa `location` (sin SSR) |
| `lib/auth.interceptor.ts` | Bearer + X-Sucursal-Id solo si `req.url.startsWith(apiUrl)` | Sí | No reintenta ni interpreta 401 MFA_REQUERIDA; `startsWith` frágil con `apiUrl` sin barra final |
| `lib/guards.ts` | `autenticadoGuard` (login, mfa, contexto, sucursal) y `permisoGuard(permiso)` (CanMatchFn) | Sí | Rutas fijas `/auth/ingresar`, `/auth/mfa`, `/seleccionar-sucursal` (esta última es del shell, spec 08); sin `returnUrl`; sin guard solo-anónimo ni guard aal2 (consola exige MFA); `permisoGuard` devuelve false sin ir a 403; con 0 sucursales redirige al selector en vez de mostrar GWT 046 |
| `lib/si-permiso.directive.ts` | `*siPermiso` con `input.required`, `effect`, `ViewContainerRef` | Sí | Solo una cadena (sin OR/lista); duplicada en el plan: U-02 (shell) también la lista (P4) |

Faltan por completo: `project.json` con tags Nx (`scope:shared`, `type:data-access`), tests, `libs/shared/auth-ui`, rutas `/auth/*`, textos de error en español de Perú (genéricos, sin revelar si la cuenta existe).

**Verificación de APIs Angular** (proyecto en 21; código verificado por el plan en 22.2). Contrastado con Context7 (`/websites/angular_dev`) y conocimiento previo:
- `input.required<T>()`, `effect()` en constructor, `inject()`, `signal/computed`, `TemplateRef/ViewContainerRef`, `@Directive`: estables desde Angular 19. Deben existir en 21.
- `HttpInterceptorFn` + `provideHttpClient(withInterceptors([...]))`, `HttpClient`: OK.
- `CanActivateFn` devolviendo `UrlTree`/Promise y `CanMatchFn`: OK; la doc actual muestra `CanMatchFn` con tercer parámetro `currentSnapshot`, el código de 0 argumentos sigue siendo compatible.
- Zoneless: `signal.set` desde promesas y callbacks de Supabase notifica al scheduler; no requiere `NgZone`.
- No detecté en el código ninguna API exclusiva de 22 (no hay `resource`, `httpResource`, Signal Forms, `linkedSignal`). No pude confirmar API por API contra la doc de 21 (el índice de Context7 solo lista ramas 22.0.x); recomendación: compilar la lib con Angular 21 como criterio de aceptación.
- Fuera de Angular, sin verificar: `@supabase/ssr` 0.12 (`createBrowserClient`, `cookieOptions`, `auth.flowType`, `detectSessionInUrl`), supabase-js 2.118 (`mfa.*`), proveedor `'azure'`. Angular Material para auth-ui debe ser 21.

## 8. Diagramas

- **PL-03** Autenticación con Supabase Auth y autorización propia (flowchart): frontends -> Supabase Auth (login, OAuth, MFA TOTP, refresh) -> hook de token -> JWT; Bearer + X-Sucursal-Id hacia AutenticacionGuard y PermisoGuard. Rotulado "Angular 22".
- **PL-04** Secuencia de ingreso con MFA y token con tenant activo: `signInWithPassword/signInWithOAuth` (PKCE) -> hook -> token aal1 + refresh en cookie del dominio -> `mfa.getAuthenticatorAssuranceLevel()` -> si nextLevel = aal2, pide código de 6 dígitos, `mfa.challenge + mfa.verify` -> token aal2 -> `GET /v1/seg/mi-contexto` -> selector de sucursal (si más de una) y menú. Es el flujo de `sesion.service.ts`.
- Colaterales: PL-05 (solicitud autorizada), PL-06 (invitación, afecta RF-010/spec 07), PL-07 (migración CC-10), PL-10 (dependencias).

## 9. Ambigüedades y preguntas candidatas para la Fase 2 de /spec

Ambigüedades:
1. El SRS no define RF para ingreso, OAuth, recuperación ni cookie de dominio; A-04 está atada a TR-RF-010 ("aceptar invitación").
2. El MFA TOTP de cliente es parte de A-05 (spec 04 en el roadmap); el encargo lo incluye aquí.
3. `auth-ui` no tiene historia ni spec asignado.
4. `*siPermiso` figura en shared/auth (código) y en U-02/shell (plan).
5. `/seg/mi-contexto` y `/seg/mi-tenant` no existen ni están asignados a un spec.
6. RF-017 habla de `auth_time` <= 15 min; el guard backend de ejemplo solo verifica `aal2` (sin recencia) y el cliente no maneja el desafío step-up.
7. RNF-014 (inactividad 30 min) y RF-016 ("recordar última selección") sin implementación.
8. Docs y código dicen Angular 22; el proyecto va en 21.

Preguntas (recomendación entre paréntesis):
- **P1. ¿auth-ui entra en este spec?** (Sí, versión mínima: ingresar, callback, mfa enrolar/verificar, recuperar y nueva clave, con Angular Material directo; invitación al 07. Si no cabe en 10 h, partir en lib y auth-ui.)
- **P2. ¿Alcance del MFA de cliente?** (Enrolar TOTP, verificar al ingresar y step-up ante 401 MFA_REQUERIDA; la recencia de 15 min y el backend, en el 04.)
- **P3. ¿Cómo se cubre el step-up de RF-017 con Supabase?** El JWT trae `amr[].timestamp`, no un `auth_time` explícito. (El cliente, ante 401 MFA_REQUERIDA, lleva a `/auth/mfa?returnUrl=`; el spec 04 define la recencia y se documenta el límite.)
- **P4. ¿Quién es dueño de `*siPermiso` y `permisoGuard`?** (Quedan en shared/auth como en el código; U-02 solo los usa.)
- **P5. ¿Contrato de `/seg/mi-contexto` y `/seg/mi-tenant`?** (Fijar el DTO `ContextoUsuario` aquí como contrato; endpoints reales en 06/07 con `seg.sucursales_accesibles` y `seg.menu_usuario`; en este spec se prueba con mock HTTP.)
- **P6. ¿Dónde se persiste la última sucursal (RF-016)?** (`localStorage` por usuario en el MVP; persistencia en servidor al llegar 06/08.)
- **P7. ¿Estrategia de pruebas y evidencia?** (Unidad de `SesionService`, guards, interceptor y directiva con TestBed y cliente Supabase simulado; GWT 044-046 y 048 como pruebas de componente; una prueba manual contra el Supabase de staging, declarando que no se corrió en CI.)
- **P8. ¿Se abstrae Supabase detrás de un puerto en el front?** (No; `SupabaseCliente` ya es el único punto de contacto. Mantener simple.)
- Menores: RNF-014 inactividad (diferir a la configuración del proyecto Supabase y declararlo fuera de alcance); RNF-019/023 aplican a auth-ui (axe-core y matriz de navegadores; el e2e completo queda en el 23).
