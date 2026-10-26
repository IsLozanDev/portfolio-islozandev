# SPEC 14 — Auth UI mínima: páginas `/auth` y primera app Angular (`plataforma-admin`)

> **Status:** Aprobado
> **Depends on:** SPEC 13, SPEC 08, SPEC 06
> **Date:** 2026-10-26
> **Objective:** Crear `libs/shared/auth-ui` con las páginas `/auth` (ingresar, callback OAuth, recuperar, nueva clave, MFA e invitación) montadas en una primera app `apps/plataforma-admin` con Angular Material y Tailwind 4, verificadas en navegador contra Supabase dev.

## Por qué existe este spec

Fila 14 de `docs/roadmap-specs.md`. Contexto: `docs/spec-context/13-auth-cliente-angular.md` (sección 1, P1). Es la continuación del spec 13: la lib `shared/auth` ya tiene sesión, MFA, guards e interceptor, pero no hay pantallas ni app que las sirva.

Hallazgos que cambian el paquete de contexto:

- El spec 08 dejó aquí la pantalla «aceptar invitación» y el `refreshSession()` posterior. Contrato: `GET /v1/seg/invitaciones/{token}` y `POST /v1/seg/invitaciones/aceptar`. `SEG_URL_INVITACION` ya apunta a `http://127.0.0.1:4200/auth/invitacion`.
- El invitado nuevo llega por `inviteUserByEmail`; el que ya tenía cuenta, por `signInWithOtp` (enlace mágico). Las plantillas usan `{{ .ConfirmationURL }}`, que entrega la sesión en el fragmento (`#access_token`, flujo implícito). El cliente del spec 13 es PKCE y ese formato no le sirve. Se cambian las plantillas a `token_hash` + `verifyOtp`.
- Google y Microsoft no están habilitados en Supabase dev: no hay apps de proveedor. Este spec habilita Google; Microsoft queda pendiente.
- La API no tiene CORS. En local se usa el proxy del servidor de desarrollo de Angular.
- Es la primera app Angular del monorepo: aquí se verifica Tailwind 4 con Angular 21 (nota de `CLAUDE.md`).

RF cubiertos (parte de interfaz):

- **TR-RF-010**: autenticación del invitado y pantalla de aceptación. Criterios **TR-CA-028, 029 y 030**.
- **TR-RF-017**: pantalla de segundo factor (enrolar y verificar TOTP) para el ingreso y el step-up. Criterio **TR-CA-048** (la parte de UI).
- **TR-RF-016**: solo la página «sin accesos» de **TR-CA-046** como página mínima. El selector real es del spec 15.

El SRS no tiene RF ni GWT de ingreso, OAuth, recuperación ni enrolamiento: los criterios de esas páginas son propios de este spec.

Reglas: **TR-RN-009** (MFA para sensibles).

RNF propios:

- **TR-RNF-009**: la clave solo viaja a Supabase; ninguna página la guarda ni la registra.
- **TR-RNF-012**: mensajes genéricos (recuperar no revela si la cuenta existe); `returnUrl` solo acepta rutas internas (sin redirección abierta).
- **TR-RNF-014**: la página de ingreso informa el cierre por inactividad.
- **TR-RNF-018**: responsiva desde 360 px, textos en español de Perú.
- **TR-RNF-019**: 0 violaciones `critical` o `serious` de axe-core en cada página `/auth`.
- **TR-RNF-023**: se verifica en Chromium; la matriz multinavegador es del spec 27.

RNF heredados: 011 (solo la publishable key en la app), 024/119 (límites Nx), 025 (cobertura >= 70 % en `auth-ui`), 026 (sin correo, token ni código en la consola).

Historias del backlog: ninguna (el plan no tiene historia para `auth-ui`; el roadmap la agrega). Estimado: 12-13 h (incluye habilitar Google). Supera el tope de 10 h por decisión del usuario.

## Alcance

**In:**

- **Workspace**: Angular Material y CDK 21.2.x, `tailwindcss` 4.3.x, `@tailwindcss/postcss`, `postcss`, `axe-core` (solo para la verificación manual).
- **App `apps/plataforma-admin`** (tags `scope:app`, `type:app`), standalone, zoneless, sin SSR, Vitest:
  - `src/app/app.config.ts`: `provideRouter`, `provideHttpClient(withInterceptors([authInterceptor]))`, `provideAuth(environment.auth)`.
  - `src/app/app.routes.ts`: `/auth` (lazy desde `auth-ui`), `''` (inicio), `seleccionar-sucursal`, `sin-accesos`, `403`.
  - `src/environments/environment.ts` (dev, versionado) y `environment.prod.ts` con `fileReplacements`.
  - `proxy.conf.json`: `/v1` hacia `http://127.0.0.1:3000`. `nx serve` en `127.0.0.1:4200`.
  - Estilos: `src/styles.scss` (tema de Material) y `src/tailwind.css` (`@import "tailwindcss";` y `@theme` mínimo), `.postcssrc.json`.
  - Páginas mínimas en `src/app/pages/`: `inicio`, `seleccionar-sucursal`, `sin-accesos`, `prohibido`. El spec 15 las reemplaza por el shell.
- **Estructura de componentes** (app y `auth-ui`): cada componente o página en archivos separados, `<nombre>.page.ts` + `.page.html` + `.page.css` (o `.component.*`), con `templateUrl` y `styleUrl`; sin `template` ni `styles` inline. El `.css` solo si hay estilos propios. Generadores de `nx.json` con `style: css`, `inlineTemplate: false` e `inlineStyle: false`. Regla en `CLAUDE.md` ("Estructura de libs Angular").
- **Lib `libs/shared/auth-ui`** (`shared-auth-ui`, alias `@vitrina/shared/auth-ui`, tags `scope:shared` y `type:feature`):
  - `auth-ui.routes.ts`: `AUTH_UI_ROUTES`.
  - `pages/ingresar`, `pages/callback`, `pages/recuperar`, `pages/nueva-clave`, `pages/mfa`, `pages/invitacion`.
  - `services/invitacion.cliente.ts`: llamadas a la API de invitaciones.
  - `models/invitacion.ts`: DTO, códigos de error y mensajes.
  - `utils/ruta-retorno.ts`: lectura segura de `returnUrl`.
- **Cambios en `libs/shared/auth`**: `SesionService.verificarEnlace`, `SesionService.refrescarSesion` y `sesionGuard`.
- **Supabase**: plantillas `invite.html`, `recovery.html` y nueva `magic-link.html` con `token_hash`; `supabase/config.toml` (`site_url`, `additional_redirect_urls`, plantilla `magic_link`); sección 12 en `docs/ops/supabase-ambientes.md`.
- **Google OAuth en dev**: cliente OAuth en Google Cloud (lo crea el usuario) y proveedor habilitado en el panel de Supabase dev.
- **Verificación** con el MCP `playwright` contra Supabase dev y la API local.

**Out of scope (for future specs):**

- Shell, layout, menú, selector de sucursal real y sistema de diseño (U-01, U-02): spec 15.
- Microsoft (Azure/Entra ID): el botón y el código quedan; la app de proveedor y su habilitación en Supabase, pendientes.
- CORS en la API y URLs de producción: spec 21 (staging) o el plan de producción.
- axe-core en CI y matriz multinavegador: spec 27.
- Desenrolar factores, cambio de tenant, reintento automático tras el step-up (fuera desde el spec 13).
- Ampliar `plataforma-admin` como consola: spec 17 (U-06).
- Registro de usuarios abierto (signup sigue desactivado).

## Base de código reutilizada

- `libs/shared/auth` (spec 13): se usa tal cual salvo los tres agregados de la sección de modelo.
- `estructura_frontend.txt` lista `libs/shared/auth-ui` con ingresar, callback, MFA, recuperar, nueva clave y aceptar invitación. Se conserva el nombre y las páginas; la estructura interna sigue "Estructura de libs Angular" de `CLAUDE.md`.
- No hay código base de páginas en `docs/.../codigo/`.

## Modelo de datos

No hay tablas, migraciones ni eventos nuevos. Solo habla con Supabase Auth y con la API (regla 8).

### Agregados en `libs/shared/auth`

| Miembro | Tipo | Nota |
| --- | --- | --- |
| `SesionService.verificarEnlace(tokenHash, tipo)` | `Promise<void>` | `tipo: 'invite' \| 'email' \| 'recovery'`. Llama a `auth.verifyOtp({ token_hash, type })`. Error → `ErrorAuth` `ENLACE_INVALIDO` |
| `SesionService.refrescarSesion()` | `Promise<void>` | `auth.refreshSession()` y `cargarContexto()`. Lo usa la invitación para que el hook ponga `tenant_id` |
| `sesionGuard` | `CanActivateFn` | Espera `iniciar()`. Sin sesión → `ingresar?returnUrl`. No mira MFA ni contexto (para `/auth/mfa`, `/seleccionar-sucursal` y `/sin-accesos`, donde `autenticadoGuard` haría un ciclo) |

`index.ts` de `shared/auth` suma `sesionGuard`. `CONFIG_AUTH` ya es público: `auth-ui` lee de ahí `apiUrl` y `rutas`.

### Rutas de `AUTH_UI_ROUTES` (bajo `/auth`)

| Ruta | Página | Guard | Parámetros |
| --- | --- | --- | --- |
| `ingresar` | `IngresarPage` | `anonimoGuard` | `returnUrl`, `motivo=inactividad` |
| `callback` | `CallbackPage` | — | `code` o `error` (OAuth PKCE), `returnUrl` |
| `recuperar` | `RecuperarPage` | `anonimoGuard` | — |
| `nueva-clave` | `NuevaClavePage` | — | `token_hash`, `type=recovery` |
| `mfa` | `MfaPage` | `sesionGuard` | `returnUrl` |
| `invitacion` | `InvitacionPage` | — | `token`; `token_hash` y `type` si llega desde el correo |

Coinciden con `RUTAS_AUTH_POR_DEFECTO` del spec 13, así que la app no configura `rutas`.

### Comportamiento de las páginas

- **Ingresar**: correo y clave (`ingresarConClave`), botones «Continuar con Google» y «Continuar con Microsoft» (`ingresarConProveedor('google' | 'azure')`), enlace a recuperar. Con `motivo=inactividad` muestra «Su sesión se cerró por inactividad. Ingrese de nuevo.». Al ingresar: si `requiereVerificacion()`, va a `mfa?returnUrl`; si no, a `returnUrl` o `rutas.inicio`. Botón deshabilitado y con indicador mientras espera.
- **Callback**: `completarCallback()`. Éxito: mismo destino que ingresar. Error: mensaje de `ENLACE_INVALIDO` y enlace a ingresar.
- **Recuperar**: correo (`recuperarClave`). Siempre muestra «Si el correo está registrado, le enviamos un enlace para elegir una clave nueva.». Solo muestra error en `DEMASIADOS_INTENTOS` y `SIN_CONEXION`.
- **Nueva clave**: `verificarEnlace(token_hash, 'recovery')` al entrar; luego clave y confirmación (deben coincidir, mínimo 8 caracteres), `actualizarClave`, y va a `rutas.inicio` (o a `mfa` si `requiereVerificacion()`). Enlace inválido: mensaje y enlace a recuperar.
- **MFA**: `MfaService.estado()`. Con factor TOTP verificado: campo de 6 dígitos (`inputmode="numeric"`, `autocomplete="one-time-code"`) y `verificarTotp`. Sin factor: QR, secreto copiable y el mismo campo para confirmar el enrolamiento. Éxito: `returnUrl` o `rutas.inicio`. Botón «Salir» (`salir()`).
- **Invitación**: ver la sección siguiente.

### Invitación

```ts
// models/invitacion.ts
export interface EstadoInvitacion { estado: 'VIGENTE'; tenantNombre: string; expiraEn: Date }
export interface InvitacionAceptada { tenantId: string; membresiaId: string; refrescarSesion: boolean }
```

`InvitacionCliente` (`services/invitacion.cliente.ts`):

- `consultar(token)`: `GET {apiUrl}/seg/invitaciones/{token}`.
- `aceptar(token)`: `POST {apiUrl}/seg/invitaciones/aceptar` con `{ token }`.
- Mapea la respuesta snake_case a camelCase y los errores a `ErrorInvitacion` con `codigo`.

| HTTP / código de la API | Mensaje |
| --- | --- |
| 404 `INVITACION_NO_ENCONTRADA` | «La invitación no existe o el enlace está incompleto.» |
| 410 `INVITACION_EXPIRADA` | «La invitación expiró; solicite una nueva al administrador» (TR-CA-029) |
| 409 `INVITACION_NO_DISPONIBLE` | «Esta invitación ya se usó o fue anulada.» |
| 403 `INVITACION_OTRO_CORREO` | «Esta invitación pertenece a otro correo» (TR-CA-030) |
| 429 `DEMASIADAS_SOLICITUDES` | «Demasiados intentos. Espere unos minutos e inténtelo de nuevo.» |
| Otro | «Ocurrió un error. Inténtelo de nuevo.» |

Flujo de `InvitacionPage`:

1. Sin `token` en la URL: mensaje de 404.
2. `consultar(token)`. Error: su mensaje y fin.
3. Con `token_hash` y `type` en la URL: `verificarEnlace(token_hash, type)` y quita esos dos parámetros de la URL (`replaceUrl`).
4. Sin sesión: muestra la empresa (`tenantNombre`) y un botón a `ingresar?returnUrl=/auth/invitacion?token=<token>`.
5. Con sesión y `type = invite` (usuario nuevo): pide clave y confirmación; `actualizarClave` y sigue.
6. Con sesión: botón «Aceptar invitación a <tenantNombre>». `aceptar(token)`, luego `refrescarSesion()` y navega a `rutas.inicio`.

### Enlaces de correo

| Plantilla | Origen | Enlace |
| --- | --- | --- |
| `invite.html` | `inviteUserByEmail` | `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite` |
| `magic-link.html` | `signInWithOtp` (invitado con cuenta) | `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` |
| `recovery.html` | `recuperarClave` | `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery` |

`&` en invitación porque `SEG_URL_INVITACION` ya trae `?token=`; `?` en recuperación porque `redirectTo` es `origen + /auth/nueva-clave`. Hoy el enlace mágico solo lo usa la invitación. Si otro flujo lo usa, la plantilla se revisa.

### `returnUrl`

`utils/ruta-retorno.ts`: `rutaDeRetorno(valor, porDefecto)` devuelve `valor` solo si empieza por `/`, no por `//` ni `/\`, y no contiene `:` antes del primer `/`. En otro caso, `porDefecto`. Todas las páginas lo usan antes de navegar.

### Configuración de la app

```ts
// apps/plataforma-admin/src/environments/environment.ts
export const environment = {
  auth: {
    supabaseUrl: 'https://ebkwqvuynccawujsaedh.supabase.co',
    supabasePublishableKey: '<publishable key de dev>',
    apiUrl: '/v1',            // proxy local hacia 127.0.0.1:3000
  } satisfies ConfigAuth,
};
```

Solo la publishable key (es pública por diseño). `environment.prod.ts` queda con valores vacíos y un comentario de que se llena en el plan de producción.

### Supabase (`supabase/config.toml`)

- `site_url = "http://127.0.0.1:4200"`.
- `additional_redirect_urls = ["http://127.0.0.1:4200/**"]`.
- `[auth.email.template.magic_link]` con `subject = "Tu enlace de acceso a Vitrina"` y `content_path = "./supabase/templates/magic-link.html"`.
- `[auth.external.google]` con `enabled = true`, `client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"` y `secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"`. Azure sigue desactivado.

### Google en dev

- Google Cloud Console (usuario): pantalla de consentimiento en modo prueba con los correos de prueba; cliente OAuth tipo «Aplicación web» con la URI de redirección `https://ebkwqvuynccawujsaedh.supabase.co/auth/v1/callback`.
- Panel de Supabase: *Authentication → Sign In / Providers → Google*, con client ID y secret. El secret solo vive en el panel y en `.env` local; nunca en el repo.
- El registro abierto sigue desactivado: Google solo ingresa a correos ya existentes en Supabase, cuya identidad se vincula sola por correo verificado. Un correo desconocido da el error genérico en `/auth/callback`.

En el proyecto dev los mismos valores se cargan a mano en el panel (sección 12 de `docs/ops/supabase-ambientes.md`).

## Plan de implementación

1. **App y estilos.** Instalar Material y CDK 21.2.x, Tailwind 4.3.x, `@tailwindcss/postcss` y `postcss` (consultar la doc vigente con ctx7). Generar `apps/plataforma-admin` con `@nx/angular` (standalone, sin zone.js, sin SSR, Vitest), tags, `environments`, `proxy.conf.json`, `styles.scss` con el tema de Material y `tailwind.css`. Página `inicio` provisional. Verificar: `nx build plataforma-admin`, `nx serve` muestra un botón de Material con clases de Tailwind aplicadas, y el backend sigue verde.
2. **Agregados en `shared/auth`.** `verificarEnlace`, `refrescarSesion`, `sesionGuard` y sus pruebas; exportar `sesionGuard`. Verificar: `nx test shared-auth`.
3. **Lib `auth-ui`.** Generar `libs/shared/auth-ui` (tags, alias, Vitest), `auth-ui.routes.ts`, `utils/ruta-retorno.ts` con pruebas. Montar `/auth` en `app.routes.ts` y la configuración en `app.config.ts`. Verificar: `nx lint shared-auth-ui` y `/auth/ingresar` carga en `nx serve`.
4. **Ingresar y callback.** Páginas, mensajes y pruebas de componente con `SesionService` y `MfaService` simulados.
5. **Recuperar y nueva clave.** Páginas y pruebas.
6. **MFA.** Página con verificar y enrolar; pruebas de los dos estados.
7. **Páginas mínimas de la app.** `inicio` (nombre o correo del usuario, sucursal actual y «Salir»), `seleccionar-sucursal` (lista simple con `seleccionarSucursal` y `returnUrl`), `sin-accesos` (texto de TR-CA-046) y `prohibido`. Guards: `autenticadoGuard` en inicio, `sesionGuard` en las otras tres.
8. **Plantillas y configuración de Supabase.** Cambiar `invite.html` y `recovery.html`, crear `magic-link.html`, actualizar `config.toml` (incluido Google) y agregar la sección 12 a `docs/ops/supabase-ambientes.md` (incluye los pasos de Google Cloud). El usuario aplica el panel: URL del sitio, URLs de retorno, las tres plantillas, el proveedor Google y un usuario de prueba.
9. **Invitación.** `models/invitacion.ts`, `InvitacionCliente` con `HttpTestingController`, `InvitacionPage` con sus seis casos. Pruebas de TR-CA-029 y 030 con respuestas simuladas.
10. **Cierre.** `index.ts` de `auth-ui` solo con `AUTH_UI_ROUTES`; cobertura; `code-simplifier` sobre los archivos nuevos; columna Estado del roadmap.

## Criterios de aceptación

Workspace y build:

- [ ] `pnpm install` deja `@angular/material` 21.2.x y `tailwindcss` 4.3.x; ninguna dependencia de Angular en 22.
- [ ] `nx build plataforma-admin` compila con Angular 21 en modo estricto, sin `tailwind.config.js`.
- [ ] En el CSS generado hay utilidades de Tailwind usadas en las plantillas y el tema de Material.
- [ ] `nx test shared-auth-ui`, `nx test shared-auth` y `nx test plataforma-admin` pasan con Vitest sin zone.js.
- [ ] Cobertura de líneas de `shared-auth-ui` >= 70 %.
- [ ] `nx lint` pasa en las tres; `shared-auth-ui` solo importa `scope:shared` con `type:feature`, `type:ui`, `type:data-access` o `type:util`.
- [ ] `index.ts` de `auth-ui` exporta solo `AUTH_UI_ROUTES`; el de `auth` suma solo `sesionGuard`.
- [ ] `nx affected -t lint,test,build` verde, incluido el backend.
- [ ] `git grep` de `sb_secret` no da resultados; `environment.ts` solo tiene la publishable key.

Lib `shared/auth`:

- [ ] `verificarEnlace` llama a `verifyOtp({ token_hash, type })`; un error da `ErrorAuth` `ENLACE_INVALIDO`.
- [ ] `refrescarSesion` llama a `refreshSession()` y luego a `GET /v1/seg/mi-contexto`.
- [ ] `sesionGuard` sin sesión devuelve `UrlTree` a `/auth/ingresar?returnUrl=...`; con sesión aal1 y factor verificado devuelve `true` (no va a MFA).

Pruebas de componente (`auth-ui`):

- [ ] Ingresar: clave errónea muestra «Correo o contraseña incorrectos.»; éxito sin MFA navega a `returnUrl`; éxito con `requiereVerificacion()` navega a `/auth/mfa?returnUrl=...`.
- [ ] Ingresar: `returnUrl=https://otro.sitio` o `//otro.sitio` navega a `/`.
- [ ] Ingresar: los botones de Google y Microsoft llaman a `ingresarConProveedor('google')` y `('azure')`.
- [ ] Ingresar con `motivo=inactividad` muestra el aviso de inactividad.
- [ ] Callback con `ENLACE_INVALIDO` muestra el mensaje y el enlace a ingresar.
- [ ] Recuperar muestra el mismo texto de confirmación cuando `recuperarClave` resuelve, exista o no la cuenta.
- [ ] Nueva clave: si las claves no coinciden no llama a `actualizarClave`; `CLAVE_DEBIL` muestra su mensaje.
- [ ] MFA con factor: código erróneo muestra «El código no es válido o ya expiró.»; sin factor muestra el QR y el secreto.
- [ ] Invitación con 410 muestra «La invitación expiró; solicite una nueva al administrador» (**TR-CA-029**).
- [ ] Invitación con 403 en aceptar muestra «Esta invitación pertenece a otro correo» y no llama a `refrescarSesion` (**TR-CA-030**).
- [ ] Invitación con `type=invite` pide la clave antes de aceptar; con `type=email` no la pide.
- [ ] Invitación aceptada llama a `refrescarSesion()` y navega a `/`.

Navegador (MCP `playwright`, `nx serve plataforma-admin` y `nx serve api` contra Supabase dev):

- [ ] Ingreso con clave del usuario de prueba llega a `/` y muestra su correo; la cookie `sb-*` existe y no hay `localStorage` de supabase-js.
- [ ] Al recargar `/` la sesión sigue (sin volver a ingresar).
- [ ] Usuario con TOTP: tras la clave pide el código; con el código correcto llega a `/` (aal2).
- [ ] Usuario sin TOTP en `/auth/mfa`: muestra el QR, el enrolamiento se confirma con un código de la app autenticadora. Factor borrado al terminar.
- [ ] Recuperar con el correo de la cuenta Resend envía el correo; el enlace abre `/auth/nueva-clave`, la clave nueva sirve para ingresar.
- [ ] Usuario sin asignaciones vigentes llega a `/sin-accesos` con «No tiene accesos vigentes; contacte a su administrador» (**TR-CA-046**).
- [ ] Invitación real (spec 08) a un correo nuevo: el enlace abre `/auth/invitacion`, pide la clave, acepta, el token refrescado trae `tenant_id` y la membresía queda `ACTIVO` (**TR-CA-028**, sin el menú de perfil, que es del spec 15). Datos de prueba borrados.
- [ ] La consola del navegador no tiene errores de la app en ninguna página `/auth` ni en `/`. Los 4xx de red esperados (p. ej. el 400 de `/auth/v1/token` con clave errónea) los registra el navegador y no cuentan.
- [ ] axe-core inyectado en cada página `/auth` reporta 0 violaciones `critical` y `serious`.
- [ ] Capturas a 360 px y a 1280 px de las seis páginas `/auth` sin desborde horizontal.
- [ ] «Continuar con Google» con un correo de prueba ya existente en Supabase pasa por Google, vuelve a `/auth/callback` y llega a `/` con sesión; en `auth.identities` el usuario tiene la identidad `google`.
- [ ] «Continuar con Google» con un correo que no existe en Supabase termina en `/auth/callback` con el mensaje de error genérico y sin sesión.
- [ ] `git grep` del client secret de Google no da resultados.
- [ ] El cierre del spec dice que Microsoft no se probó contra el proveedor real.

Código limpio:

- [ ] El código nuevo sigue "Código limpio" y "Estructura de libs Angular" de `CLAUDE.md`.
- [ ] Ningún `@Component` de la app ni de `auth-ui` usa `template` ni `styles` inline: todos usan `templateUrl` (y `styleUrl` si tienen estilos), y no hay `.css` vacíos.
- [ ] La salida de `code-simplifier` se revisó y aplicó.
- [ ] Ningún `console.*` imprime correo, clave, token ni código MFA.

## Decisiones

- **Sí:** `libs/shared/auth-ui` (`type:feature`) más `apps/plataforma-admin` mínima. Decisión del usuario. El spec 17 (U-06) amplía esa app en vez de tirarla.
- **No:** app sandbox. Se descartaría después.
- **No:** solo la lib. Sin app no hay Playwright, contra la regla de verificación del frontend.
- **Sí:** la invitación entra. El spec 08 la dejó aquí y el contrato back existe.
- **Sí:** un solo spec de 11-12 h. Decisión del usuario; rompe el tope de 10 h a sabiendas.
- **No:** partir en 14 y 14b, ni dejar la invitación como válvula.
- **Sí:** Material 21 y Tailwind 4 mínimos: tema de Material, `@theme` corto. El sistema de diseño es U-01 (spec 15).
- **Sí:** componentes en archivos separados (`.ts`, `.html`, `.css`), sin plantillas ni estilos inline. Decisión del usuario durante el paso 1; queda como regla en `CLAUDE.md` para todo el front.
- **Sí:** estilos de componente en CSS, no Sass. Tailwind 4 no se procesa dentro de Sass; Sass queda solo para el tema global de Material.
- **No:** `.css` vacío por componente. Es código muerto; lo general va con utilidades de Tailwind en el `.html`.
- **Sí:** Material por Sass (`styles.scss`) y Tailwind en `tailwind.css` aparte, ambos en `styles` del proyecto. Tailwind 4 no se procesa dentro de Sass.
- **Sí:** Google real en dev. Decisión del usuario; prueba de punta a punta el PKCE y `/auth/callback`.
- **Sí:** Microsoft solo con botón y pruebas con dobles. Usa el mismo código (`'azure'`); habilitarlo es solo configuración del proveedor.
- **Sí:** Google sin registro abierto. Encaja con el modelo de invitación: solo ingresan correos que el sistema ya conoce.
- **Sí:** páginas mínimas de inicio, selector, sin accesos y 403 en la app. Los guards del spec 13 navegan ahí; el spec 15 las reemplaza.
- **Sí:** `sesionGuard` nuevo en `shared/auth`. `autenticadoGuard` en `/auth/mfa` o `/seleccionar-sucursal` redirige a sí mismo.
- **Sí:** plantillas con `token_hash` y `verifyOtp`. Patrón de Supabase para clientes PKCE; `ConfirmationURL` entrega tokens en el fragmento.
- **No:** mantener `ConfirmationURL` y probar. Riesgo alto de rehacer.
- **Sí:** el invitado nuevo se reconoce por `type=invite` del enlace. Pide clave solo a ese.
- **No:** leer `amr` del token para saberlo. El método que Supabase pone tras `verifyOtp` no es fiable para distinguir invitación de enlace mágico.
- **No:** pedir clave siempre, ni nunca.
- **Sí:** una sola página `/auth/mfa` que enrola o verifica según el estado. Coincide con `rutas.mfa` del spec 13.
- **Sí:** `environment.ts` versionado con la URL y la publishable key de dev. Son públicas; la secret key nunca entra en la app.
- **No:** `config.json` en runtime. Un paso más al arranque sin necesidad en R1.
- **Sí:** proxy de desarrollo `/v1` hacia la API local y `apiUrl = '/v1'`. Evita tocar la API.
- **No:** CORS en la API en este spec. Hace falta cuando app y API estén en dominios distintos (staging o producción).
- **Sí:** `127.0.0.1:4200`, no `localhost`. Coincide con `SEG_URL_INVITACION` y con la cookie del host.
- **Sí:** `returnUrl` validado como ruta interna. Evita redirección abierta (TR-RNF-012).
- **Sí:** presupuesto de aviso del bundle inicial en 600 kB (error en 1 MB). supabase-js entra en el arranque porque `provideAuth` lee la sesión antes del primer ruteo; con Angular y Material el inicial queda en ~521 kB (~131 kB comprimido). Decisión del usuario; se revisa si crece.
- **Sí:** axe-core manual en Playwright, con evidencia. Decisión del usuario; en CI entra con el spec 27.
- **Sí:** verificación contra Supabase dev y la API local. El usuario crea el usuario de prueba y carga las URLs de retorno y las plantillas en el panel.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `@nx/angular` 23.3 genera la app con Angular 22 o con zone.js | Versiones fijadas en `package.json` desde el spec 13; criterio sobre la versión instalada; revisar `app.config.ts` generado |
| Preflight de Tailwind pisa estilos de Material | Importar Tailwind antes del tema o usar `@layer`; revisar la captura del paso 1 |
| `verifyOtp` con `type: 'email'` o el formato de `{{ .RedirectTo }}` no es el que asume el spec | Consultar la doc vigente con ctx7 en el paso 8; probar con correos reales en dev |
| Resend con `onboarding@resend.dev` solo entrega al dueño de la cuenta | Recuperación e invitación se prueban con ese correo (y alias `+` si Resend los acepta) |
| La cookie `secure` o el host distinto (`localhost` vs `127.0.0.1`) pierde la sesión | Siempre `127.0.0.1:4200`; criterio de recarga en navegador |
| Google en modo prueba solo deja ingresar a los correos de prueba listados | Agregar ahí el correo del usuario de prueba; publicar la app de Google queda para producción |
| La vinculación automática no ocurre si el correo del usuario no está confirmado | El usuario de prueba se crea con correo confirmado; criterio sobre `auth.identities` |
| Rate limits de Auth de Supabase cortan la verificación | Pocas repeticiones; anotar los límites en la sección 12 |
| El estimado pasa de 13 h | Registrar horas reales; no se recorta alcance sin consultar |

## Lo que **no** está en este spec

- Shell, menú, selector de sucursal real y sistema de diseño (spec 15).
- Microsoft habilitado contra el proveedor real.
- CORS y URLs de producción.
- axe-core en CI y matriz multinavegador (spec 27).
- Desenrolar MFA, cambio de tenant, reintento tras step-up.
- Consola de `plataforma-admin` (spec 17).
- Registro abierto de usuarios.

Cada uno, si llega, va en su propio spec.
