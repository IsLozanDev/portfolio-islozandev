# SPEC 13 — Auth cliente Angular: sesión Supabase, contexto, interceptor, guards y `*siPermiso`

> **Status:** Aprobado
> **Depends on:** SPEC 05, SPEC 06
> **Date:** 2026-10-26
> **Objective:** Crear `libs/shared/auth`, la primera lib Angular 21 del monorepo, que autentica contra Supabase Auth con sesión en cookie, carga el contexto de `GET /v1/seg/mi-contexto` y lo expone con signals, guards, interceptor y `*siPermiso`, incluidos MFA TOTP, step-up ante `MFA_REQUERIDA` y cierre por inactividad.

## Por qué existe este spec

Fila 13 de `docs/roadmap-specs.md` (A-04). Contexto: `docs/spec-context/13-auth-cliente-angular.md`. Las páginas `/auth/*` son el spec 14. El shell y el selector de sucursal son el spec 15.

El roadmap pone la dependencia en "07". En los archivos, ese contenido quedó en `specs/06-seg-autorizacion.md` (`mi-contexto`, `@Permiso`, `X-Sucursal-Id`). El step-up lo define `specs/05-seg-verificador-guard-mfa.md`.

Hallazgos que cambian el paquete de contexto:

- `GET /v1/seg/mi-contexto` ya existe (`MiContextoDto`). Trae `sucursales`, `sucursal_actual`, `requiere_seleccion`, `sin_accesos`, `permisos`, `menu`, `aal`, `mfa_vigente` y `mfa_en`. La sucursal llega en el header `X-Sucursal-Id`, no por query, y **el servidor recuerda la última**. Las preguntas P5 y P6 del paquete quedan resueltas por el backend.
- `PUT /v1/seg/mi-tenant` no existe y el token no tiene tenant preferido. `cambiarTenant` sale.
- El step-up responde 401 `{ "codigo": "MFA_REQUERIDA", "max_edad": 900 }` con `WWW-Authenticate: Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=900`.
- El workspace no tiene Angular: ni dependencias, ni `@nx/angular`, ni apps. Este spec las introduce.

RF cubiertos (parte cliente):

- **TR-RF-016**: lógica de sesión del contexto (cargar, sucursal única, sin accesos, cambio de sucursal). El selector visual es del spec 15.
- **TR-RF-017**: el cliente lleva a `/auth/mfa` ante `MFA_REQUERIDA`; enrolar y verificar TOTP. La recencia de 15 min la valida la API (spec 05).
- **TR-RF-010**: solo la autenticación del invitado en el IdP. Aceptar la invitación es del spec 08 y su pantalla de otro spec.

Criterios del SRS: **TR-CA-044, 045, 046 y 048** (como pruebas de la lib). El resto (ingreso, OAuth, recuperación, enrolamiento, inactividad, interceptor) son propios: el SRS no los tiene.

Reglas: **TR-RN-007** (permisos `producto.recurso.accion`), **TR-RN-009** (MFA para sensibles).

RNF propios:

- **TR-RNF-009**: contraseñas y MFA en Supabase; la lib nunca guarda la clave.
- **TR-RNF-014**: cierre por inactividad configurable (30 min por defecto) y renovación de token por supabase-js.
- **TR-RNF-012**: mensajes genéricos que no revelan si la cuenta existe; el token solo viaja a `apiUrl`.

RNF heredados: 011 (solo la publishable key en el cliente), 024/119 (límites Nx), 025 (cobertura >= 70 % en la lib), 026 (sin correo ni token en logs de consola).

RNF que no aplican aquí: 018, 019 y 023 son de pantallas (spec 14).

Historias del backlog: **A-04** completa y la parte cliente de **A-05**. Estimado: 8-9 h (el roadmap dice 6; suman la instalación de Angular y la inactividad).

## Alcance

**In:**

- **Workspace**: Angular 21 (`@angular/core`, `common`, `router`, `platform-browser`, `compiler`, `compiler-cli`, `@angular/build`), `@nx/angular@23.3.0`, `ng-packagr` 21, `@supabase/ssr@0.12.7`, Vitest para Angular. Sin Angular Material ni Tailwind (no hay pantallas).
- **Lib `libs/shared/auth`** (`shared-auth`, alias `@vitrina/shared/auth`, tags `scope:shared` y `type:data-access`), construible con `ng-packagr-lite` y con Vitest:
  - `config/config.ts`: `ConfigAuth`, `CONFIG_AUTH`, valores por defecto de rutas e inactividad.
  - `config/provide-auth.ts`: `provideAuth(config)`, que registra la configuración, inicia la sesión antes del primer ruteo e inicia la vigilancia de inactividad.
  - `services/supabase.cliente.ts`: `createBrowserClient` con PKCE y cookie.
  - `services/sesion.service.ts`: estado con signals, ingreso, recuperación, nueva clave, callback, contexto, sucursal y salida.
  - `services/mfa.service.ts`: estado AAL, enrolar y verificar TOTP.
  - `services/inactividad.service.ts`: cierre de sesión tras N minutos sin actividad.
  - `interceptors/auth.interceptor.ts`: Bearer y `X-Sucursal-Id` hacia `apiUrl`; 401 `MFA_REQUERIDA` y `TOKEN_INVALIDO`.
  - `guards/autenticado.guard.ts`, `guards/anonimo.guard.ts`, `guards/aal2.guard.ts`, `guards/permiso.guard.ts` (`permisoGuard(permiso | permisos)`).
  - `directives/si-permiso.directive.ts`: `*siPermiso` con cadena o lista (OR).
  - `models/errores.ts`: `ErrorAuth` y mensajes en español de Perú.
  - `models/mi-contexto.ts`: tipo de la respuesta de la API y su mapeo a `ContextoUsuario`.
  - `utils/navegacion.ts`: rutas con `returnUrl`, compartidas por guards e interceptor.
  - Pruebas junto a cada archivo; dobles y arneses en `src/testing/`.

**Out of scope (for future specs):**

- Páginas `/auth/*` (ingresar, callback, MFA, recuperar, nueva clave): spec 14.
- Selector de sucursal, layout, menú y página "sin accesos": spec 15.
- Cambio de tenant (`cambiarTenant`, `PUT /v1/seg/mi-tenant`, cambios al hook): spec propio cuando haya usuarios multi-tenant.
- Desenrolar factores MFA por el usuario.
- Aceptar invitación en UI (TR-CA-028 a 030).
- Reintento automático de la petición tras el step-up.
- URLs de retorno registradas en Supabase y plantillas de correo: spec 14, cuando haya app y URL.
- Tailwind 4 y su verificación con Angular 21: primer spec que cree una app (14 o 15).
- Verificación con Playwright: no hay app que levantar.
- `angular-eslint` (la lib no tiene plantillas).

## Base de código reutilizada

Base: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/codigo/libs/shared/auth/src/`.

| Archivo | Se conserva | Cambia |
| --- | --- | --- |
| `config.ts` | `ConfigAuth`, `CONFIG_AUTH` | Suma `rutas` e `inactividadMinutos`; nuevo `provideAuth` |
| `supabase.cliente.ts` | `createBrowserClient`, PKCE, cookie `sameSite: 'lax'`, `path: '/'` | `secure` según el protocolo de la página; `domain` solo si viene `dominioCookie` |
| `sesion.service.ts` | Signals `sesion`, `contexto`, `autenticado`, `permisos`; `ingresarConClave`, `ingresarConProveedor`, `recuperarClave`, `cargarContexto`, `seleccionarSucursal`, `salir` | Sin carrera al recargar (`iniciar()` en el inicializador); sucursal por header `X-Sucursal-Id` y desde `sucursal_actual`; `ContextoUsuario` alineado a `MiContextoDto`; `SIGNED_OUT` limpia el contexto; suma `actualizarClave` y `completarCallback`; sin `location` (usa `DOCUMENT`); sale `cambiarTenant`; el MFA pasa a `mfa.service.ts` |
| `auth.interceptor.ts` | Bearer y `X-Sucursal-Id` | Comparación de URL robusta; no pisa un `X-Sucursal-Id` explícito; maneja 401 |
| `guards.ts` | `autenticadoGuard`, `permisoGuard` | Espera la sesión; `returnUrl`; `sin_accesos`; rutas desde la configuración; `permisoGuard` va a la ruta 403; nuevos `anonimoGuard` y `aal2Guard` |
| `si-permiso.directive.ts` | `input.required`, `effect`, `ViewContainerRef` | Acepta `string \| readonly string[]` |

## Modelo de datos

La lib no crea tablas ni eventos y no escribe en el outbox. Solo habla con Supabase Auth y con la API (regla 8).

### Configuración

```ts
export interface RutasAuth {
  ingresar: string;            // '/auth/ingresar'
  mfa: string;                 // '/auth/mfa'
  callback: string;            // '/auth/callback'
  nuevaClave: string;          // '/auth/nueva-clave'
  seleccionarSucursal: string; // '/seleccionar-sucursal'
  sinAccesos: string;          // '/sin-accesos'
  prohibido: string;           // '/403'
  inicio: string;              // '/'
}

export interface ConfigAuth {
  supabaseUrl: string;
  supabasePublishableKey: string;
  apiUrl: string;                 // 'https://api.<dominio>/v1', sin barra final
  dominioCookie?: string;         // '.<dominio>' para compartir sesión entre apps (U-06)
  inactividadMinutos?: number;    // 30 por defecto (TR-RNF-014)
  rutas?: Partial<RutasAuth>;
}
```

`provideAuth(config)` devuelve `EnvironmentProviders` con la configuración completa (valores por defecto aplicados) y un `provideAppInitializer` que espera `SesionService.iniciar()`.

### Contexto

```ts
// Respuesta tal cual de GET /v1/seg/mi-contexto (MiContextoDto, spec 06)
export interface MiContextoRespuesta {
  usuario_id: string; tenant_id: string; tipo_usuario: 'INTERNO' | 'EXTERNO' | 'SOPORTE';
  aal: 'aal1' | 'aal2'; mfa_vigente: boolean; mfa_en: string | null;
  sucursales: { id: string; empresa_id: string; codigo: string; nombre: string }[];
  sucursal_actual: string | null; requiere_seleccion: boolean; sin_accesos: boolean;
  permisos: string[];
  menu: { codigo: string; padre: string | null; nombre: string; ruta: string | null; icono: string | null; orden: number }[];
}

// Lo que expone la lib (camelCase), mapeado en mi-contexto.ts
export interface ContextoUsuario {
  usuarioId: string; tenantId: string; tipoUsuario: MiContextoRespuesta['tipo_usuario'];
  aal: 'aal1' | 'aal2'; mfaVigente: boolean; mfaEn: Date | null;
  sucursales: { id: string; empresaId: string; codigo: string; nombre: string }[];
  sucursalActual: string | null; requiereSeleccion: boolean; sinAccesos: boolean;
  permisos: readonly string[];
  menu: { codigo: string; padre: string | null; nombre: string; ruta: string | null; icono: string | null; orden: number }[];
}
```

### Estado público de `SesionService`

| Miembro | Tipo | Nota |
| --- | --- | --- |
| `sesion` | `Signal<Session \| null>` | Solo lectura hacia fuera |
| `contexto` | `Signal<ContextoUsuario \| null>` | |
| `autenticado` | `Signal<boolean>` | `sesion() !== null` |
| `sucursalId` | `Signal<string \| null>` | `contexto()?.sucursalActual` |
| `permisos` | `Signal<ReadonlySet<string>>` | |
| `iniciar()` | `Promise<void>` | Idempotente; lee la sesión de la cookie y, si hay, carga el contexto |
| `tiene(permiso \| permisos)` | `boolean` | OR sobre la lista |
| `token()` | `string \| null` | |
| `ingresarConClave(correo, clave)` | `Promise<void>` | |
| `ingresarConProveedor('google' \| 'azure')` | `Promise<void>` | `redirectTo` = origen + `rutas.callback` |
| `completarCallback()` | `Promise<void>` | Espera el intercambio PKCE; lanza `ErrorAuth` si la URL trae `error` |
| `recuperarClave(correo)` | `Promise<void>` | `redirectTo` = origen + `rutas.nuevaClave` |
| `actualizarClave(nueva)` | `Promise<void>` | `auth.updateUser({ password })` |
| `cargarContexto(sucursalId?)` | `Promise<ContextoUsuario>` | Envía `X-Sucursal-Id` solo si viene |
| `seleccionarSucursal(id)` | `Promise<void>` | `cargarContexto(id)`; sin reautenticar |
| `salir()` | `Promise<void>` | `signOut({ scope: 'local' })` y limpia el contexto |

### `MfaService`

| Miembro | Nota |
| --- | --- |
| `estado()` | `{ nivelActual, nivelSiguiente, factorTotpId: string \| null }` con `getAuthenticatorAssuranceLevel` y `listFactors` (solo factores `verified`) |
| `requiereVerificacion()` | `nivelSiguiente === 'aal2' && nivelActual !== 'aal2'` |
| `enrolarTotp()` | Borra antes los factores TOTP `unverified` del usuario; devuelve `{ factorId, qr, secreto }` |
| `verificarTotp(factorId, codigo)` | `challengeAndVerify` (el token nuevo ya es aal2, sin `refreshSession`) y recarga el contexto |

### Errores (`errores.ts`)

`ErrorAuth extends Error` con `codigo`:

| Código | Cuándo | Mensaje (`MENSAJES_AUTH`) |
| --- | --- | --- |
| `CREDENCIALES_INVALIDAS` | Clave o correo incorrectos, correo no confirmado | «Correo o contraseña incorrectos.» |
| `DEMASIADOS_INTENTOS` | 429 o límite de Supabase | «Demasiados intentos. Espere unos minutos e inténtelo de nuevo.» |
| `CODIGO_MFA_INVALIDO` | `verify` falla | «El código no es válido o ya expiró.» |
| `CLAVE_DEBIL` | `updateUser` rechaza la clave | «La contraseña no cumple los requisitos de seguridad.» |
| `ENLACE_INVALIDO` | Callback con `error` o enlace vencido | «El enlace no es válido o ya expiró. Solicite uno nuevo.» |
| `SIN_CONEXION` | Error de red | «No se pudo conectar. Revise su conexión.» |
| `DESCONOCIDO` | Cualquier otro | «Ocurrió un error. Inténtelo de nuevo.» |

`recuperarClave` resuelve igual exista o no la cuenta. Solo propaga `DEMASIADOS_INTENTOS` y `SIN_CONEXION`.

### Interceptor

- Una petición es "de la API" si su URL es `apiUrl` o empieza por `apiUrl + '/'`. Solo a esas se agregan `Authorization: Bearer` y `X-Sucursal-Id` (si hay sucursal y la petición no lo trae ya).
- 401 con `codigo = MFA_REQUERIDA`: navega a `rutas.mfa?returnUrl=<url actual>` y propaga el error. No reintenta.
- 401 con `codigo = TOKEN_INVALIDO`: `salir()` y navega a `rutas.ingresar?returnUrl=<url actual>`.

### Guards

| Guard | Tipo | Comportamiento |
| --- | --- | --- |
| `autenticadoGuard` | `CanActivateFn` | Espera `iniciar()`. Sin sesión → `ingresar?returnUrl`. `requiereVerificacion()` → `mfa?returnUrl`. Sin contexto → `cargarContexto()`. `sinAccesos` → `rutas.sinAccesos`. `requiereSeleccion` → `seleccionarSucursal?returnUrl`. Si no, `true` |
| `anonimoGuard` | `CanActivateFn` | Con sesión → `rutas.inicio`. Para las páginas de ingreso |
| `aal2Guard` | `CanActivateFn` | `nivelActual !== 'aal2'` → `mfa?returnUrl`. La recencia de 15 min la valida la API |
| `permisoGuard(p)` | `CanMatchFn` | `tiene(p)` o `UrlTree` a `rutas.prohibido` |

### Inactividad

- Escucha `pointerdown`, `keydown` y `visibilitychange` en `document`, con un límite de una escritura cada 30 s.
- La última actividad se guarda en `localStorage` (`vitrina.auth.ultima-actividad`), porque la cookie es compartida y otra pestaña puede estar activa.
- Un temporizador revisa cada minuto. Si pasaron `inactividadMinutos` desde la última actividad de cualquier pestaña: `salir()` y navega a `rutas.ingresar?motivo=inactividad`.
- Solo corre con sesión. Se detiene en `SIGNED_OUT`.

## Plan de implementación

1. **Angular en el workspace.** Instalar Angular 21.2.x, `@angular/build`, `@nx/angular@23.3.0`, `ng-packagr` 21, `@supabase/ssr@0.12.7` y Vitest para Angular. Fijar el executor de pruebas (`@nx/angular` con `unitTestRunner` Vitest). Verificar: `pnpm install` sin advertencias de peer de Angular; `nx affected -t lint,test,build` del backend sigue verde.
2. **Esqueleto de la lib.** Generar `libs/shared/auth` (construible, standalone, sin zone.js) con tags `scope:shared`, `type:data-access` y alias `@vitrina/shared/auth`. `config.ts`, `errores.ts`, `mi-contexto.ts` con sus pruebas. Verificar: `nx build shared-auth` y `nx test shared-auth`.
3. **Cliente Supabase y `SesionService` (sesión).** `supabase.cliente.ts`, `iniciar`, signals, `onAuthStateChange` (incluye `SIGNED_OUT`), `ingresarConClave`, `ingresarConProveedor`, `completarCallback`, `recuperarClave`, `actualizarClave`, `salir`. Pruebas con un doble del cliente Supabase.
4. **Contexto y sucursal.** `cargarContexto`, `seleccionarSucursal`, `tiene`. Pruebas con `HttpTestingController` (GWT 044, 045, 046).
5. **`provideAuth` e interceptor.** Inicializador, Bearer, `X-Sucursal-Id`, 401 `MFA_REQUERIDA` y `TOKEN_INVALIDO`. Pruebas (GWT 048).
6. **Guards y `*siPermiso`.** Los cuatro guards y la directiva con cadena o lista. Pruebas con `RouterTestingHarness`.
7. **`MfaService`.** Estado, enrolar (limpiando `unverified`) y verificar. Pruebas.
8. **`InactividadService`.** Temporizador, almacenamiento compartido y registro desde `provideAuth`. Pruebas con temporizadores falsos.
9. **Cierre.** `index.ts` solo con la API pública, cobertura, `code-simplifier` sobre los archivos nuevos.

## Criterios de aceptación

Workspace y lib:

- [ ] `pnpm install` deja Angular 21.2.x (no 22) y `@supabase/ssr` 0.12.x; `@nx/angular` 23.3.0.
- [ ] `nx build shared-auth` compila con el compilador de Angular 21 en modo estricto.
- [ ] `nx test shared-auth` pasa con Vitest y sin `zone.js` en el entorno de pruebas.
- [ ] Cobertura de líneas de la lib >= 70 %.
- [ ] `nx lint shared-auth` pasa; la lib solo importa `scope:shared` y `type:data-access`/`type:util`.
- [ ] `index.ts` exporta solo `provideAuth`, `ConfigAuth`, `RutasAuth`, `CONFIG_AUTH`, `SesionService`, `MfaService`, `ContextoUsuario`, `ErrorAuth`, `MENSAJES_AUTH`, los cuatro guards, `authInterceptor` y `SiPermisoDirective`.
- [ ] `nx affected -t lint,test,build` verde, incluido el backend.

Sesión:

- [ ] Con una sesión válida en la cookie, `autenticadoGuard` en la primera navegación no redirige a `ingresar` (sin carrera al recargar).
- [ ] `ingresarConClave` con clave errónea lanza `ErrorAuth` `CREDENCIALES_INVALIDAS`, con el mismo mensaje que para un correo inexistente.
- [ ] `ingresarConProveedor('google')` y `('azure')` llaman a `signInWithOAuth` con `redirectTo` = origen + `/auth/callback`.
- [ ] `recuperarClave` resuelve sin error para un correo inexistente y usa `redirectTo` = origen + `/auth/nueva-clave`.
- [ ] `actualizarClave` llama a `updateUser({ password })`; un rechazo por clave débil da `CLAVE_DEBIL`.
- [ ] `completarCallback` con `?error=...` en la URL lanza `ENLACE_INVALIDO`.
- [ ] Un evento `SIGNED_OUT` (p. ej. desde otra pestaña) deja `sesion` y `contexto` en `null`.
- [ ] La cookie lleva `secure` solo en `https:` y `domain` solo si se configura `dominioCookie`.

Contexto (TR-RF-016):

- [ ] **TR-CA-044**: con una sola sucursal accesible, `autenticadoGuard` devuelve `true` sin pasar por `/seleccionar-sucursal` y `sucursalId()` es esa sucursal.
- [ ] **TR-CA-045**: `seleccionarSucursal(surco)` envía `GET /v1/seg/mi-contexto` con `X-Sucursal-Id: <surco>`, actualiza `permisos` y `menu`, y no llama a ningún método de ingreso de Supabase.
- [ ] **TR-CA-046**: con `sin_accesos = true`, `autenticadoGuard` redirige a `/sin-accesos`.
- [ ] Con `requiere_seleccion = true`, `autenticadoGuard` redirige a `/seleccionar-sucursal?returnUrl=...`.

Interceptor:

- [ ] Una petición a `apiUrl + '/seg/mi-contexto'` lleva `Authorization: Bearer <token>`; una a otro origen, o a `apiUrl` seguido de otro texto sin `/` (p. ej. `https://api.x/v1x`), no lo lleva.
- [ ] Un `X-Sucursal-Id` puesto por quien llama no se reemplaza.
- [ ] **TR-CA-048**: un 401 `MFA_REQUERIDA` navega a `/auth/mfa?returnUrl=<url actual>`, propaga el error y no repite la petición.
- [ ] Un 401 `TOKEN_INVALIDO` cierra la sesión y navega a `/auth/ingresar?returnUrl=<url actual>`.

MFA (TR-RF-017):

- [ ] Sesión aal1 con factor TOTP verificado: `requiereVerificacion()` es `true` y `autenticadoGuard` redirige a `/auth/mfa?returnUrl=...`.
- [ ] `enrolarTotp` borra antes los TOTP `unverified` y devuelve `factorId`, `qr` y `secreto`.
- [ ] `verificarTotp` con código erróneo lanza `CODIGO_MFA_INVALIDO`; con código bueno recarga el contexto.
- [ ] `aal2Guard` con sesión aal1 redirige a `/auth/mfa?returnUrl=...`.

Permisos:

- [ ] `*siPermiso="'rest.caja.abrir'"` muestra el contenido solo si el permiso está; con `['a.b.c', 'x.y.z']` lo muestra si está cualquiera; se actualiza al cambiar el contexto.
- [ ] `permisoGuard('a.b.c')` sin el permiso devuelve un `UrlTree` a `/403`.

Inactividad (TR-RNF-014):

- [ ] Tras 30 min sin actividad en ninguna pestaña se llama a `salir()` y se navega a `/auth/ingresar?motivo=inactividad`.
- [ ] Si otra pestaña registró actividad hace menos de 30 min, no se cierra la sesión.
- [ ] `inactividadMinutos: 5` en la configuración cambia el plazo.

Código limpio:

- [ ] El código nuevo sigue la sección "Código limpio" de `CLAUDE.md` (nombres en español sin abreviaturas, funciones con verbo, sin cadenas mágicas, early return).
- [ ] La salida de `code-simplifier` se revisó y aplicó.
- [ ] Ningún `console.*` imprime correo, token ni código MFA.

Verificación declarada:

- [ ] El cierre del spec dice explícitamente que no hubo verificación en navegador ni contra Supabase real: no hay app. La prueba real va en el spec 14.

## Decisiones

- **Sí:** `@nx/angular` + Vitest. Vitest es el runner por defecto de Angular 21 y funciona sin zone.js. El backend sigue con Jest.
- **No:** Jest con `jest-preset-angular`. Más consistente con el repo, pero va contra el default de Angular 21.
- **No:** lib sin plugin Nx. Habría que armar ngc y pruebas a mano.
- **Sí:** solo lib con pruebas. El login real y Playwright van en el 14, el primero con pantallas.
- **No:** app de humo. Horas en algo que se tira.
- **Sí:** cookie con `@supabase/ssr` y `dominioCookie` opcional (ADR-29, U-06). `secure` según protocolo para que funcione en `http://localhost`.
- **No:** `localStorage` de supabase-js. Rompe la sesión compartida entre apps.
- **Sí:** ante `MFA_REQUERIDA`, redirigir a `/auth/mfa?returnUrl` sin reintento. Repetir un `POST` a ciegas es riesgoso y acopla la lib a la UI.
- **No:** diálogo con reintento automático. Mejor UX, más complejidad; se puede revisar después.
- **Sí:** `cambiarTenant` fuera. Necesita backend (hook y endpoint) que no existe.
- **Sí:** cierre por inactividad en la lib, con última actividad compartida en `localStorage`. La cookie es común a todas las pestañas: sin eso, una pestaña ociosa cerraría la sesión de una activa.
- **No:** dejar la inactividad como brecha. RNF-014 lo pide y cuesta poco en el cliente.
- **Sí:** MFA con enrolar, verificar y estado; limpiar factores `unverified` antes de enrolar. Un enrolamiento abandonado deja un factor pendiente que bloquea el siguiente.
- **No:** desenrolar. Necesita reglas propias (aal2, roles que exigen MFA).
- **Sí:** `*siPermiso` y `permisoGuard` en `shared/auth` con cadena o lista OR. El shell (spec 15) solo los usa.
- **Sí:** la sucursal la recuerda el servidor (`mi-contexto` guarda la última). Nada en `localStorage`.
- **Sí:** `X-Sucursal-Id` como header en `mi-contexto`, como define el spec 06 (el código base usaba `?sucursalId=`).
- **Sí:** `iniciar()` en `provideAppInitializer` y también esperado por los guards. Corrige la carrera de `getSession()` en el constructor.
- **Sí:** rutas configurables con valores por defecto. El 14 y el 15 las pueden cambiar sin tocar la lib.
- **Sí:** `DOCUMENT` en vez de `location`. Deja la lib lista para pruebas y SSR.
- **No:** puerto sobre Supabase en el front. `SupabaseCliente` ya es el único punto de contacto (P8 del contexto).
- **No:** `angular-eslint` aquí. La lib no tiene plantillas; entra con la primera app.
- **Sí:** `src/lib/` por tipo de artefacto (`config/`, `models/`, `services/`, `guards/`, `interceptors/`, `directives/`, `utils/`), un guard por archivo y pruebas junto a su archivo. Decisión del usuario durante la implementación; queda como regla en `CLAUDE.md` ("Estructura de libs Angular") para las libs siguientes.
- **No:** `src/lib/` plano como en `estructura_frontend.txt`, ni agrupar por funcionalidad. Plano mezcla tipos; por funcionalidad reparte piezas chicas en libs data-access.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `@nx/angular` 23.3 instala por defecto Angular 22 | Fijar versiones `~21.2` en `package.json` antes de generar; criterio de aceptación sobre la versión instalada |
| Instalar Angular rompe el build o las pruebas del backend (ESM, `tsconfig.base`) | Paso 1 verifica `nx affected` del backend antes de crear la lib |
| `@supabase/ssr` o `mfa.challengeAndVerify` difieren de lo que asume el código base | Consultar la doc vigente (ctx7) al implementar los pasos 3 y 7; las pruebas usan un doble con la forma real de la API |
| La prueba con dobles no detecta errores reales de Supabase (cookie, PKCE, OAuth) | Declararlo en el cierre; el spec 14 prueba contra Supabase dev con Playwright |
| El reloj de inactividad se congela con la pestaña en segundo plano | La comparación usa la marca de tiempo guardada, no un contador; `visibilitychange` revisa al volver |
| El estimado pasa las 10 h | Si el paso 1 se alarga, la inactividad (paso 8) se mueve a un spec aparte |

## Lo que **no** está en este spec

- Páginas `/auth/*` (spec 14).
- Selector de sucursal, shell, menú y página "sin accesos" (spec 15).
- Cambio de tenant y `PUT /v1/seg/mi-tenant`.
- Desenrolar factores MFA.
- Aceptar invitación en UI.
- Reintento automático tras el step-up.
- Tailwind, Angular Material, Playwright y prueba contra Supabase real.

Cada uno, si llega, va en su propio spec.
