# SPEC 05 — Autenticación en la API: verificador JWKS, guard global y MFA reciente

> **Status:** Implementado
> **Depends on:** SPEC 02, SPEC 04
> **Date:** 2026-10-19
> **Objective:** Crear la lib `libs/plataforma/seguridad` que verifica el JWT de Supabase por JWKS en un guard global de `apps/api`, con `@Publico` y `@RequiereMfa()`, este último con aal2 y MFA de 15 minutos como máximo y 401 step-up.

## Por qué existe este spec

Fila 05 de `docs/roadmap-specs.md`: A-01 (4 h) y A-05 (4 h, solo la parte de backend), más `ultimo_acceso`, `GET /v1/seg/sesion` y la revisión de Auth en el panel. Total: unas 9-10 h. Contexto de apoyo: `docs/spec-context/04-seg-autenticacion-back.md`. Sus secciones 1 y 9 quedan superadas por los specs 04 y 05.

El spec 04 dejó en dev el hook (`tenant_id`, `tipo_usuario`) y el espejo `seg.usuario`. Falta que la API confíe en el token. Hoy `apps/api` no tiene código de autenticación ni guards.

Cubre **TR-RF-017** del lado del backend: el guard detecta la acción que exige MFA y lee `aal` y `amr`. Si el MFA tiene más de 15 minutos, responde 401 con el desafío step-up. Enrolar y desafiar el factor es del cliente (specs 13 y 14). La marca "sensible" desde `seg.permiso.sensible` es del spec 07.

A-01 figura en el plan con TR-RF-010. Aquí solo se cubre su parte de autenticación: el `sub` del token es el usuario. La aceptación de invitación es del spec 08.

Criterios del SRS: **TR-CA-048** se cubre en su parte de backend. Un endpoint con `@RequiereMfa()` y MFA de hace 40 minutos responde 401 `MFA_REQUERIDA` y no ejecuta la acción; el reintento con MFA reciente sí la ejecuta. **TR-CA-047** queda parcial: la acción se ejecuta con MFA de hace 5 minutos y el principal lleva `mfaVigente = true`. El registro de auditoría `mfa = verdadero` es del spec 20.

Formato real de los claims de Supabase, verificado con la documentación de `supabase/auth` (context7):

- `aal` vale `aal1` o `aal2`.
- `amr` es un arreglo de `{ method, timestamp, provider? }`. `timestamp` va en segundos epoch y `method` vale, por ejemplo, `password`, `otp`, `totp`, `phone`, `webauthn` u `oauth`.
- No existe `auth_time`. La regla de 15 min se calcula con el `timestamp` de `amr`.

Reglas: **TR-RN-009** (MFA ≤ 15 min para lo sensible; la auditoría queda para el 20).

RNF propios:

- **TR-RNF-009**, en parte: autenticación solo en el IdP y MFA exigible. El bloqueo tras 5 intentos queda documentado como brecha.
- **TR-RNF-014**, en parte: tokens de 900 s con renovación. La inactividad la cubre el cliente (spec 13).
- **TR-RNF-026**: los logs del guard no llevan correo ni token.

RNF heredados: 001 (sin llamada remota por petición), 011 (solo llave pública), 012, 024/119 y 025.

Historias del backlog: **A-01** y **A-05** (parte backend).

## Alcance

**In:**

- **Lib `libs/plataforma/seguridad`**, con etiquetas `scope:plataforma, type:backend, comp:seg`, alias `@vitrina/plataforma/seguridad`, Jest con la misma configuración que `org` y cobertura de `src/domain/**` ≥ 70 %. Capas:
  - `domain/`: `principal.ts` (`Principal`, `mfaVigente`) y `errores.ts` (`TokenInvalidoError`, `MfaRequeridaError`, `AutenticacionNoDisponibleError`).
  - `application/ports/`: `verificador-token.port.ts` (`VerificadorToken`, `VERIFICADOR_TOKEN`) y `registro-acceso.port.ts` (`RegistroAcceso`, `REGISTRO_ACCESO`).
  - `infrastructure/supabase/supabase-jwks.verificador.ts`: `jose` con `createRemoteJWKSet` y `jwtVerify`.
  - `infrastructure/typeorm/registro-acceso.typeorm.ts`: actualiza `seg.usuario.ultimo_acceso`.
  - `src/seguridad.module.ts`, fuera de las capas: `SeguridadModule.register(opciones)`. Registra `APP_GUARD` en orden `AutenticacionGuard` → `MfaGuard`.
  - `interface/`: `decoradores.ts` (`@Publico`, `@RequiereMfa`, `@PrincipalActual`), `autenticacion.guard.ts`, `mfa.guard.ts` y `sesion.controller.ts` (`GET /v1/seg/sesion`).
- **Dependencia** `jose` `6.2.12` en `package.json` (hoy solo es transitiva del CLI de Supabase).
- **`apps/api`**:
  - `config/env.ts` agrega `SUPABASE_URL` (url, requerida) y `SEG_MFA_MAX_EDAD_SEG` (entero, por defecto 900).
  - `app.module.ts` importa `SeguridadModule`.
  - `SaludController` lleva `@Publico()`.
  - `app.setup.ts` agrega `addBearerAuth()` a Swagger.
  - `.env.example` documenta las dos variables.
- **`supabase/config.toml`**: `jwt_expiry = 900` y `[auth.mfa.totp]` con `enroll_enabled = true` y `verify_enabled = true`.
- **Nube (manual, dev)**:
  - En el panel: JWT expiry en 900 s, MFA TOTP habilitado y revisión de los rate limits de Auth.
  - Prueba de humo con token real y TOTP contra `GET /v1/seg/sesion` en la API local.
  - Evidencia y brechas de RNF-009/014 en `docs/ops/supabase-ambientes.md`.
- Actualizar `docs/roadmap-specs.md`, fila 05.

**Out of scope (para otros specs):**

- `@Permiso`, permisos efectivos, `X-Sucursal-Id`, `PermisoGuard`, 403 `SIN_PERMISO` y el evento `ACCESO_DENEGADO` (spec 07).
- Derivar `@RequiereMfa` de `seg.permiso.sensible` en el manifiesto (spec 07, que pone la misma metadata `REQUIERE_MFA`).
- Fijar el tenant del token en `TenantContext` por petición (spec 07, junto con `X-Sucursal-Id`).
- Enrolar, desafiar y verificar TOTP en el cliente, la redirección step-up y el reintento (specs 13 y 14).
- Auditoría con indicador `mfa = verdadero` (spec 20). Registro en `seg.evento_seguridad` (specs 07 y 18).
- Revocación por `session_id` (consultar `auth.sessions` en cada petición). Descartada, ver Decisiones.
- Bloqueo propio tras 5 intentos e inactividad de sesión en el servidor. Quedan como brecha documentada.
- Límite de tasa en endpoints públicos de NestJS (TR-RNF-015). Lo agrega el spec 08 con el primer endpoint público (aceptar invitación).
- `GET /v1/seg/mi-contexto` con permisos y menú (spec 07). Reemplaza a `GET /v1/seg/sesion`.
- Proyecto prod (plan de migración a producción).

## Base de código reutilizada

Fuente: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/codigo/libs/plataforma/seguridad/`.

**Se conserva:**

- `supabase-jwks.verificador.ts`:
  - `createRemoteJWKSet` con `cacheMaxAge` de 10 min y `cooldownDuration` de 30 s.
  - `jwtVerify` con `issuer`, `audience: 'authenticated'` y `clockTolerance` de 5 s.
  - `requiredClaims` `sub`, `exp`, `iat`, `session_id` y `aal`.
  - Rechazo de `role !== 'authenticated'` y de `is_anonymous`.
  - Mapeo defensivo de `tipo_usuario`: un valor inválido pasa a `EXTERNO`.
- `autenticacion.guard.ts`: omite las rutas con `@Publico`, exige `Bearer` y deja el principal en `req.principal`.
- `decoradores.ts`: `@Publico` y `@UsuarioActual`, este último renombrado a `@PrincipalActual`.
- `principal.ts` y `errores.ts`: dominio sin NestJS.
- `seguridad.module.ts`: módulo dinámico con `useFactory` y `APP_GUARD`.
- `seguridad.integracion.spec.ts`: la técnica del JWKS HTTP local y los casos 01 a 10, 15, 16 y 18, adaptados a Jest.

**Cambia:**

- El verificador pasa a `infrastructure/supabase/` y acepta solo `algorithms: ['ES256']`. El proyecto firma con ES256 y RS256 queda fuera.
- El verificador lee `amr` y descarta los elementos que no son `{ method: string, timestamp: number }`. El claim puede venir como cadenas sueltas.
- Si el JWKS no responde y no hay llave en caché, el verificador lanza `AutenticacionNoDisponibleError` (503), no 401.
- `Principal` pierde `email` (no se usa y evita datos personales en memoria y logs) y gana `amr: EntradaAmr[]`.
- 401 uniforme `{ codigo: 'TOKEN_INVALIDO' }` con `WWW-Authenticate: Bearer error="invalid_token"`. El motivo va solo al log.
- La exigencia de MFA sale de `permiso.guard.ts` y pasa a `MfaGuard` con `@RequiereMfa()`. Exige `aal2` y la antigüedad del factor, y responde 401 step-up, no 403.
- `PermisoGuard`, `permisos.port.ts`, las cachés, `permisos.sql.repositorio.ts` y `resolver-permisos.use-case.ts` no entran (spec 07).
- `package.json` y `tsconfig.json` propios se reemplazan por `project.json`, `tsconfig.json`, `tsconfig.spec.json` y `jest.config.mjs` del monorepo, con el patrón de `org`.
- Las pruebas corren con el runner de Nx (`pnpm nx test seguridad`), no con `tsc && node`.

## Modelo de datos

No hay tablas ni migraciones nuevas. Usa `seg.usuario.ultimo_acceso` (spec 04).

### Dominio

```ts
// domain/principal.ts
export type TipoUsuario = 'INTERNO' | 'EXTERNO' | 'SOPORTE';
export type Aal = 'aal1' | 'aal2';
export interface EntradaAmr { method: string; timestamp: number } // timestamp en segundos epoch

export interface Principal {
  usuarioId: string;        // sub = seg.usuario.id
  tenantId: string | null;  // claim tenant_id del hook (spec 04)
  tipo: TipoUsuario;        // claim tipo_usuario
  aal: Aal;
  sesionId: string;         // session_id
  amr: EntradaAmr[];
}

export const METODOS_MFA = ['totp', 'phone', 'webauthn'] as const;

// true si aal = aal2 y la entrada de amr con método MFA más reciente
// tiene una antigüedad <= maxEdadSeg respecto de `ahora`.
export function mfaVigente(p: Principal, ahora: Date, maxEdadSeg: number): boolean;
export function mfaEn(p: Principal): Date | null; // timestamp del factor MFA más reciente
```

Errores de dominio (heredan de `DomainError` del kernel):

| Clase | `code` | HTTP |
| --- | --- | --- |
| `TokenInvalidoError(motivo)` | `TOKEN_INVALIDO` | 401 |
| `MfaRequeridaError(maxEdadSeg)` | `MFA_REQUERIDA` | 401 |
| `AutenticacionNoDisponibleError` | `AUTENTICACION_NO_DISPONIBLE` | 503 |

`motivo` (`expirado`, `firma`, `algoritmo`, `claim <nombre>`, `rol`, `formato`, `sin_bearer`) solo va al log.

### Puertos

```ts
export interface VerificadorToken { verificar(token: string): Promise<Principal> }
export const VERIFICADOR_TOKEN = Symbol('VERIFICADOR_TOKEN');

export interface RegistroAcceso { marcar(usuarioId: string): Promise<void> }
export const REGISTRO_ACCESO = Symbol('REGISTRO_ACCESO');
```

### Opciones del módulo

```ts
interface SeguridadOpciones {
  supabaseUrl: string;     // emisor = `${supabaseUrl}/auth/v1`; JWKS = `${emisor}/.well-known/jwks.json`
  mfaMaxEdadSeg: number;   // SEG_MFA_MAX_EDAD_SEG, por defecto 900
  jwksUrl?: string;        // solo pruebas
}
```

### Metadata de Nest

- `PUBLICO = 'seg:publico'` y `REQUIERE_MFA = 'seg:requiere-mfa'`, exportadas en `index.ts` para que el spec 07 las reutilice.

### `ultimo_acceso`

`RegistroAccesoTypeorm.marcar(usuarioId)`:

- Guarda en memoria la última marca por usuario y no consulta la base si pasaron menos de 15 min.
- Si pasaron más, ejecuta `UPDATE seg.usuario SET ultimo_acceso = now() WHERE id = $1 AND (ultimo_acceso IS NULL OR ultimo_acceso < now() - interval '15 minutes')`.
- Usa el `DataSource` de kernel-infra, fuera de `UnitOfWork`: no es un caso de uso y no emite eventos.
- El guard la llama sin esperar el resultado. Si falla, solo escribe un log de advertencia.

### Respuestas HTTP

| Caso | Estado | Cuerpo | `WWW-Authenticate` |
| --- | --- | --- | --- |
| Sin `Authorization`, con otro esquema o con token inválido | 401 | `{ "codigo": "TOKEN_INVALIDO" }` | `Bearer error="invalid_token"` |
| `@RequiereMfa()` con `aal1` o MFA de más de `mfaMaxEdadSeg` | 401 | `{ "codigo": "MFA_REQUERIDA", "max_edad": 900 }` | `Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=900` (RFC 9470) |
| JWKS caído y sin llave en caché | 503 | `{ "codigo": "AUTENTICACION_NO_DISPONIBLE" }` | — |

### `GET /v1/seg/sesion`

Requiere token y no exige MFA ni permiso. OpenAPI con `@ApiBearerAuth()` y DTO de respuesta:

```json
{
  "usuario_id": "uuid",
  "tenant_id": "uuid | null",
  "tipo_usuario": "EXTERNO",
  "aal": "aal1",
  "mfa_vigente": false,
  "mfa_en": "2026-11-03T14:00:00Z | null"
}
```

### Eventos y permisos

Sin eventos de outbox: autenticar no cambia estado de dominio y `ultimo_acceso` es un dato técnico. Sin permisos `producto.recurso.accion`: `@Permiso` nace en el spec 07 y `GET /v1/seg/sesion` solo exige autenticación.

### Log del guard

En cada rechazo: nivel `warn`, `evento: 'auth.rechazo'`, `codigo`, `motivo`, `ruta` y `metodo`, más `usuario_id` si el token era válido. Nunca lleva el token, el correo ni la IP completa.

## Plan de implementación

1. **Esqueleto y dominio.**
   - Crear la lib con `project.json` (etiquetas `scope:plataforma, type:backend, comp:seg`), `tsconfig.json`, `tsconfig.spec.json`, `jest.config.mjs`, `jest.resolver.cjs` y `src/index.ts`. Agregar el alias en `tsconfig.base.json` y `jose@6.2.12` en `package.json`.
   - `domain/principal.ts` y `domain/errores.ts`, con pruebas unitarias de `mfaVigente` y `mfaEn`: aal1, aal2 sin entrada MFA, totp a 5 y a 40 min, varios factores (gana el más reciente), `password` reciente sin MFA, límite exacto de 900 s.
   - Verificar: `pnpm nx test seguridad` y `pnpm nx lint seguridad`.
2. **Verificador JWKS.**
   - Puerto `VerificadorToken` e `infrastructure/supabase/supabase-jwks.verificador.ts`.
   - Pruebas con un servidor JWKS HTTP local y llaves ES256 de `jose`: token válido con `amr`; expirado; `iss` o `aud` ajenos; firmado con RS256 o HS256; `kid` desconocido; rotación (llave nueva publicada tras arrancar); `role = anon`; `is_anonymous`; sin `session_id`; `tipo_usuario` inválido; `amr` con cadenas sueltas; JWKS apagado sin caché (`AutenticacionNoDisponibleError`).
   - Verificar: `pnpm nx test seguridad`.
3. **Guards, decoradores y módulo.**
   - `decoradores.ts`, `AutenticacionGuard`, `MfaGuard` y `SeguridadModule.register`. `RegistroAcceso` va con un doble en memoria en este paso.
   - Pruebas Nest con supertest y controladores de prueba: ruta `@Publico` sin token da 200; ruta protegida sin token, con `Basic` o con token malo da 401 uniforme con su header; con token válido da 200 y el principal llega a `@PrincipalActual`; ruta `@RequiereMfa` con aal1, con MFA a 40 min y a 5 min (TR-CA-048 y TR-CA-047, parte backend); el 401 step-up trae el header RFC 9470; JWKS caído da 503; el log de rechazo no contiene el token.
   - Verificar: `pnpm nx test seguridad`.
4. **`ultimo_acceso`.**
   - `RegistroAccesoTypeorm` y cableado en el módulo.
   - Prueba contra PostgreSQL temporal (patrón `test/support/temp-db.ts` de `org`, con `db/` aplicado): la primera marca escribe `ultimo_acceso`; una segunda marca inmediata no hace consulta (memoria) ni cambia el valor; con `ultimo_acceso` de hace 20 min sí lo actualiza; un usuario inexistente no falla.
   - Verificar: `pnpm nx test seguridad`.
5. **Cableado en `apps/api`.**
   - `env.ts` con `SUPABASE_URL` y `SEG_MFA_MAX_EDAD_SEG`; `SeguridadModule.register` en `AppModule`; `@Publico()` en `SaludController`; `addBearerAuth()`; `SesionController`; `.env.example`.
   - Pruebas en `apps/api/test`: `GET /v1/salud` sigue en 200 sin token y `GET /v1/seg/sesion` sin token da 401. Con un token del JWKS local da 200 y el cuerpo del DTO.
   - Verificar: `pnpm nx run-many -t lint test build` con código 0.
6. **`supabase/config.toml`.**
   - `jwt_expiry = 900` y TOTP con `enroll_enabled` y `verify_enabled` en `true`.
   - Verificar: `pnpm supabase:start` levanta sin errores.
7. **Nube, dev (manual).**
   - En el panel: JWT expiry en 900 s, MFA TOTP habilitado y anotar los rate limits de Auth vigentes. Si el plan Free no permite algún ajuste, se anota.
   - Prueba de humo con `pnpm nx serve api` contra dev y el usuario de prueba del spec 04:
     1. Login con contraseña por la API de Auth (curl). `GET /v1/seg/sesion` debe dar 200 con `aal1` y `mfa_vigente: false`.
     2. Enrolar TOTP (`POST /auth/v1/factors`), luego `challenge` y `verify` con el código del autenticador. El nuevo token debe dar `aal2`, `mfa_vigente: true` y el `mfa_en` correcto.
     3. Un token alterado debe dar 401 `TOKEN_INVALIDO`.
     4. Desenrolar el factor y dejar el usuario como estaba.
   - Evidencia y la tabla de brechas (RNF-009, bloqueo por intentos; RNF-014, inactividad) en `docs/ops/supabase-ambientes.md`.
8. **Roadmap.** Fila 05 de `docs/roadmap-specs.md` y horas reales de A-01 y A-05 en el plan.

## Criterios de aceptación

**Verificador (A-01):**

- [ ] Un token ES256 firmado por la llave del JWKS, con `iss = {SUPABASE_URL}/auth/v1`, `aud = authenticated` y los claims requeridos, produce un `Principal` con `usuarioId = sub`, `tenantId`, `tipo`, `aal`, `sesionId` y `amr`.
- [ ] Se rechazan: token expirado (más de 5 s), `iss` o `aud` distintos, firma con RS256 o HS256, `alg: none`, `kid` desconocido sin rotación, `role` distinto de `authenticated`, `is_anonymous = true` y token sin `session_id` o sin `aal`.
- [ ] Una llave nueva publicada en el JWKS después de arrancar se acepta sin reiniciar la API.
- [ ] Con el JWKS apagado y sin llave en caché, la respuesta es 503 `AUTENTICACION_NO_DISPONIBLE`, no 401 ni 500.
- [ ] Verificar un token no llama al JWKS mientras la llave está en caché (el servidor de prueba cuenta una sola petición para N tokens).
- [ ] `tipo_usuario` ausente o inválido produce `tipo = EXTERNO`. `tenant_id` ausente produce `tenantId = null`.

**Guard global:**

- [ ] Toda ruta de `apps/api` sin `@Publico()` exige token. `GET /v1/salud` responde 200 sin token.
- [ ] Sin `Authorization`, con esquema distinto de `Bearer` o con token inválido, la respuesta es 401 con cuerpo `{ "codigo": "TOKEN_INVALIDO" }` y `WWW-Authenticate: Bearer error="invalid_token"`. El cuerpo no indica el motivo.
- [ ] El log de cada rechazo trae `codigo` y `motivo` y no contiene el token ni un correo.
- [ ] `GET /v1/seg/sesion` con token válido devuelve `usuario_id`, `tenant_id`, `tipo_usuario`, `aal`, `mfa_vigente` y `mfa_en`, y figura en `/v1/docs` con bearer auth.

**MFA reciente (A-05, TR-RF-017, TR-RN-009):**

- [ ] Ruta con `@RequiereMfa()` y token `aal2` con `amr` `totp` de hace 5 min: responde 200 y `mfaVigente` es `true` (TR-CA-047, parte backend).
- [ ] Ruta con `@RequiereMfa()` y `totp` de hace 40 min: responde 401 `{ "codigo": "MFA_REQUERIDA", "max_edad": 900 }`, trae `WWW-Authenticate` con `error="insufficient_user_authentication"` y el handler no se ejecuta (TR-CA-048, parte backend).
- [ ] Ruta con `@RequiereMfa()` y token `aal1`: responde 401 `MFA_REQUERIDA`.
- [ ] Con `SEG_MFA_MAX_EDAD_SEG=60`, un MFA de hace 2 min se rechaza.
- [ ] Una ruta sin `@RequiereMfa()` acepta tokens `aal1`.
- [ ] `REQUIERE_MFA` y `PUBLICO` se exportan desde `@vitrina/plataforma/seguridad`.

**`ultimo_acceso`:**

- [ ] Una petición autenticada deja `seg.usuario.ultimo_acceso` con la hora de la petición en PostgreSQL 16.
- [ ] Dos peticiones del mismo usuario en menos de 15 min hacen una sola escritura.
- [ ] Si la escritura falla, la petición responde igual (200) y queda un log de advertencia.

**Límites y calidad:**

- [ ] `libs/plataforma/seguridad/src/domain` no importa `@nestjs/*`, `jose`, `typeorm` ni `@supabase/*` (lint en verde).
- [ ] Cobertura de líneas de `src/domain/**` ≥ 70 %.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.

**Nube (verificación manual, evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] En dev, un token real de login con contraseña da 200 en `GET /v1/seg/sesion` con `aal: aal1` y `mfa_vigente: false`.
- [ ] En dev, tras `challenge` y `verify` de TOTP, el token nuevo da `aal: aal2`, `mfa_vigente: true` y `mfa_en` de ese momento.
- [ ] En dev el JWT expiry es 900 s (`exp - iat = 900` en un token real) y MFA TOTP está habilitado.
- [ ] `supabase-ambientes.md` lista los rate limits de Auth vigentes y las brechas de RNF-009 (bloqueo por intentos) y RNF-014 (inactividad), con su motivo.
- [ ] Las horas reales de A-01 y A-05 quedan registradas en el plan.

## Decisiones

- **Sí:** `@RequiereMfa()` con metadata `REQUIERE_MFA` y `MfaGuard` global. Decisión del usuario. El 05 se prueba solo; el spec 07 hace que `@Permiso` de un permiso sensible ponga la misma metadata.
- **No:** adelantar `@Permiso(codigo, { mfa })`. Acoplaba este spec al 07.
- **Sí:** MFA vigente = `aal2` y una entrada de `amr` con método `totp`, `phone` o `webauthn` de 900 s como máximo, configurable con `SEG_MFA_MAX_EDAD_SEG`. Decisión del usuario. Supabase no emite `auth_time`; `amr[].timestamp` es la hora del factor.
- **No:** solo `aal2`, como el código base. No cumple los 15 min de TR-RN-009.
- **Sí:** 401 uniforme `TOKEN_INVALIDO` y 401 step-up `MFA_REQUERIDA` con `WWW-Authenticate` según RFC 9470. Decisión del usuario. No revela el motivo del rechazo y cumple el SRS (401 con desafío), a diferencia del 403 del código base.
- **Sí:** 503 si el JWKS no responde y no hay llave en caché. Un 401 haría que el cliente cierre la sesión por una caída de Supabase. Decisión de redacción, a confirmar al revisar el spec.
- **Sí:** solo ES256. El proyecto dev firma con ES256 (`supabase-ambientes.md`); aceptar RS256 abría un algoritmo sin uso.
- **Sí:** `Principal` sin `email`. Nada lo usa en el 05 y así no aparece en logs (RNF-026).
- **Sí:** `ultimo_acceso` con una marca cada 15 min por usuario, sin esperar el resultado. Decisión del usuario. Cierra lo que el 04 dejó al 05 sin una escritura por petición (RNF-001).
- **Sí:** `ultimo_acceso` fuera de `UnitOfWork` y sin evento. No es un caso de uso de dominio; la regla 4 aplica a casos de uso que cambian estado de negocio.
- **Sí:** `GET /v1/seg/sesion`. Decisión del usuario. Sirve para la prueba de humo con token real; el spec 07 lo reemplaza por `/v1/seg/mi-contexto`.
- **Sí:** `GET /v1/seg/sesion` sin `@Permiso`. `@Permiso` aún no existe y el endpoint solo devuelve datos del propio token. Excepción temporal a la regla 5.
- **No:** revocar por `session_id`. Exige una consulta por petición. Se mitiga con tokens de 900 s.
- **Sí:** `jwt_expiry = 900` en dev y en `config.toml`. Decisión del usuario (RNF-014). supabase-js renueva solo.
- **Sí:** bloqueo tras 5 intentos e inactividad de 30 min quedan como brecha documentada. Decisión del usuario. Supabase Auth no los ofrece tal cual y el timebox de sesión es de plan Pro. Un bloqueo propio sería otro spec.
- **No:** registrar rechazos en `seg.evento_seguridad`. Decisión del usuario. Un token inválido no trae tenant, y la tabla exige `tenant_id`. `ACCESO_DENEGADO` es del 07 y la auditoría MFA del 20.
- **Sí:** pruebas con JWKS HTTP local, PostgreSQL 16 real para `ultimo_acceso` y humo manual en dev con TOTP. Decisión del usuario.
- **Sí:** el módulo Nest en `src/seguridad.module.ts`, fuera de las capas, como en el código base. Decisión del usuario al implementar el paso 3: la regla de capas impide que `infrastructure/` importe los guards de `interface/`, así que el módulo de `org` (en `infrastructure/`) no sirve de patrón. Los guards y decoradores van en `interface/` porque el dominio no puede importar `@nestjs/*`.
- **No:** fijar `TenantContext` desde el token en este spec. Va con `X-Sucursal-Id` en el 07, que ya define el alcance por petición.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Supabase cambia el formato de `amr` (por ejemplo, a cadenas) y nadie cumple la regla MFA | El verificador descarta lo que no es `{method, timestamp}`. La prueba de humo en dev lo detecta. El efecto es fallar cerrado (401 step-up), nunca abierto. |
| El reloj del servidor va adelantado y un MFA reciente parece vencido | `clockTolerance` de 5 s en `exp`. Los 900 s de margen absorben desfases chicos. El reloj del contenedor se sincroniza por NTP (spec 21). |
| Supabase rota la llave de firma y la API rechaza tokens nuevos | `createRemoteJWKSet` vuelve a pedir el JWKS ante un `kid` desconocido (cooldown 30 s). Lo cubre la prueba de rotación. |
| Con el guard global, una ruta pública futura queda cerrada por olvido, o una protegida se abre por error con `@Publico` | El fallo por omisión es cerrado. `@Publico` es explícito y visible en la revisión del diff. |
| La marca en memoria de `ultimo_acceso` crece sin límite | Una entrada por usuario activo (decenas o cientos en R1). Se reinicia con el proceso. Si crece, se pasa a un LRU. |
| El plan Free no permite fijar el JWT expiry en 900 s | Se anota en `supabase-ambientes.md` y se mantiene el valor posible. El guard no depende del valor. |
| La llave legacy HS256 sigue activa en el panel | El verificador solo acepta ES256, así que un token HS256 se rechaza aunque Supabase lo emita. Revocar la llave legacy queda anotado en `supabase-ambientes.md`. |

## Lo que **no** está en este spec

- `@Permiso`, permisos efectivos, `X-Sucursal-Id` y `TenantContext` por petición (spec 07).
- `sensible` desde el manifiesto (spec 07).
- Enrolar, desafiar y step-up en el cliente (specs 13 y 14).
- Auditoría con `mfa = verdadero` (spec 20) y `seg.evento_seguridad` (specs 07 y 18).
- Revocación por `session_id`, bloqueo propio por intentos e inactividad en el servidor.
- Límite de tasa en endpoints públicos (spec 08).
- Prod (plan de migración a producción).

Cada uno entra en su propio spec cuando su sprint lo pida.
