# SPEC 18b — Seguridad: bitácora de ingresos (LOGIN y LOGIN_FALLIDO con bloqueo en Redis) y exportación XLSX auditada

> **Status:** Aprobado
> **Depends on:** SPEC 05, SPEC 06, SPEC 13, SPEC 14, SPEC 18
> **Date:** 2026-11-04
> **Objective:** Llevar a la bitácora de seguridad el `LOGIN` de cada sesión y cada intento fallido de contraseña o MFA (con motivo y bloqueo de fuerza bruta en Redis), pasando el ingreso por la API, y permitir exportarla a XLSX al vuelo con un permiso propio y auditado.

## Por qué existe este spec

El spec 18 dejó fuera dos cosas que esta fila retoma: el productor de `LOGIN` y de los intentos fallidos, y la exportación a Excel (TR-RF-019, TR-RN-047). Ver «Out of scope» y Decisiones del spec 18.

Lo que hay en el código hoy (revisado al redactar):

- El navegador ingresa directo contra Supabase: `SesionService.ingresarConClave` llama a `signInWithPassword` y `MfaService.verificarTotp` a `mfa.challengeAndVerify` (`libs/shared/auth`). La API no ve los fallos, así que no puede registrarlos ni bloquear.
- `AutenticacionGuard` verifica el JWT y llama a `RegistroAcceso.marcar` sin esperar. `Principal` ya trae `sesionId` (claim `session_id`), `amr` y `aal`.
- `seg.evento_seguridad` tiene RLS por tenant (insert con `tenant_id = app.tenant_id`) y `ck_evento_seguridad_tipo` con `LOGIN`, `ACCESO_DENEGADO`, `ASIGNACION_OTORGADA`, `ASIGNACION_REVOCADA` y `ACCESO_SOPORTE` (`db/01b_seg_soporte.sql`). `tenant_id` admite `NULL`, pero la RLS impide insertarlo desde el rol de la aplicación.
- `OrigenPeticion` (spec 18) da la IP de la petición; `LecturaBitacora` arma el `resumen` por tipo en `lectura-bitacora.typeorm.ts`.
- Redis 7 ya está en la API (`crearClienteRedis`, `CachePermisosRedis`, sin cola offline y con timeout corto).
- El manifiesto PLAT está en `1.7.0`. `api` solo tiene `SUPABASE_URL` y `SUPABASE_SECRET_KEY`.
- El front mapea errores de Supabase a `CodigoErrorAuth` en `libs/shared/auth/src/lib/models/errores.ts`; los mensajes no revelan si la cuenta existe.

RF y reglas:

- **TR-RF-019** consultar bitácora: tipos `LOGIN` (productor nuevo) y exportación a Excel.
- **TR-RN-047** exportación con datos personales: permiso específico y auditada. La expiración del archivo a 72 h no aplica: no se guarda archivo (ver Decisiones).
- **TR-RN-009**: `plat.seguridad.bitacora_exportar` es sensible (aal2).
- **TR-RN-007**: permiso PLAT, sin suscripción.
- El SRS no define umbrales de bloqueo por intentos de ingreso: se fijan en este spec.

RNF propios:

- **TR-RNF-013**: cada sesión nueva, cada fallo, cada bloqueo y cada exportación deja fila en `seg.evento_seguridad`.
- **TR-RNF-026**: ni la clave, ni el código MFA, ni el correo en claro llegan a logs, a Redis ni al outbox. El cuerpo de `/auth/*` nunca se loguea.
- **TR-RNF-001**: detectar la sesión nueva no agrega latencia a la petición (fuera del camino, como `RegistroAcceso`).
- **TR-RNF-002**: la exportación de 10 000 filas termina en < 10 s.

RNF heredados: 008, 010, 011, 012, 024/119, 025, 101, 106.

Estimado: 10-12 h.

## Alcance

**In:**

- **Migración** `db/01b_seg_tipos_ingreso.sql`, su inverso en `db/rollback/` y su prueba en `db/tests/`. Corre después de `01b_seg_soporte.sql` por orden de nombre.
- **Dominio** en `libs/plataforma/seguridad/src/domain/`: `intentos-ingreso.ts` (umbrales, motivos, ventanas y `enmascararCorreo`), tipos nuevos en el catálogo de eventos de seguridad, errores nuevos y `bitacora_exportar` en `PERMISOS_VETADOS_SOPORTE`.
- **Casos de uso** en `application/`: `IngresarConClave`, `VerificarMfa`, `RegistrarInicioSesion` y `ExportarBitacora`.
- **Puertos y adaptadores**: `ProveedorIngreso` (GoTrue, en `infrastructure/supabase/`), `ContadorIntentos` y `RegistroSesiones` (en `infrastructure/redis/`), `BitacoraIngreso` (funciones `SECURITY DEFINER`, en `infrastructure/typeorm/`) y `LecturaBitacora.recorrer`.
- **Interfaz**: `interface/ingreso.controller.ts` (`/v1/seg/auth/*`), `interface/ingreso.http.ts` y `GET /v1/seg/bitacora/exportar` en `bitacora.controller.ts`. `AutenticacionGuard` llama a `RegistrarInicioSesion`.
- **Configuración**: `SUPABASE_PUBLISHABLE_KEY` en `apps/api/src/config/env.ts` y `.env.example`. Dependencia `exceljs` 4.4.0.
- **Manifiesto PLAT `1.8.0`**: permiso `plat.seguridad.bitacora_exportar` en `PLAT_PROPIETARIO` y `PLAT_ADMIN_SEGURIDAD`.
- **Front, `libs/shared/auth`**: `ingresarConClave` y `verificarTotp` por la API con `setSession`; código `INGRESO_BLOQUEADO` con los minutos restantes.
- **Front, `libs/plataforma/admin-cliente`**: botón «Exportar» en `bitacora-lista`, tipos nuevos en el filtro y etiquetas legibles de `LOGIN`, `LOGIN_FALLIDO` y `EXPORTACION` en lista y detalle, con el motivo visible.
- **Pruebas**: dominio y aplicación (Jest), integración con PostgreSQL 16 y Redis 7, HTTP con supertest (GoTrue con doble), Vitest con `TestBed` zoneless y navegador con el MCP `playwright`.
- **Nube, dev (manual)**: migración, manifiesto `1.8.0`, `SUPABASE_PUBLISHABLE_KEY`, revisión de los límites de Auth de Supabase y humo con un usuario real.

**Out of scope (para otros specs):**

- Hook «Password Verification Attempt» de Supabase para bloquear también el acceso directo a GoTrue (requiere plan Team).
- Fallos de ingreso por Google/OAuth, enlace mágico o recuperación de clave: no pasan por la API. Su `LOGIN` sí se registra (primera petición de la sesión).
- Ingreso por SMS o WebAuthn (no hay factor configurado).
- Desbloqueo manual por el administrador o pantalla de bloqueos activos.
- Avisos al usuario o al administrador por bloqueo (TR-NOT, R2).
- Umbrales por tenant como parámetros CFG.
- Exportación a CSV, reportes programados y archivos con expiración (TR-REP, TR-ARC).
- Exportar otras listas (usuarios, asignaciones).
- Sesiones activas y cierre remoto (TR-RF-018, R2).
- `trust proxy` para la IP real detrás de un balanceador (spec de despliegue).

## Base de código reutilizada

**Se conserva:**

- Spec 05: `AutenticacionGuard`, `Principal` (`sesionId`, `amr`, `aal`), `@Publico`, `MfaGuard`.
- Spec 06: `PermisoGuard`, `CatalogoPermisos.sensible`, `crearClienteRedis`.
- Spec 14: pantallas `ingresar` y `mfa` de `auth-ui`; solo cambia el servicio que llaman.
- Spec 18: `seg.evento_seguridad`, `FiltroBitacora` y su validación (rango ≤ 92 días), `LecturaBitacora`, `OrigenPeticion`, `bitacora-lista` y `bitacora-detalle`, `PERMISOS_VETADOS_SOPORTE`, patrón de evento escrito antes de responder y falla cerrado (`AUDITORIA_NO_DISPONIBLE`).

**Cambia:**

- `TIPOS_EVENTO_SEGURIDAD` (back) y `TIPOS_EVENTO` (front) suman `LOGIN_FALLIDO` y `EXPORTACION`.
- `AutenticacionGuard` recibe `RegistrarInicioSesion` y lo llama sin esperar, después de `registroAcceso.marcar`.
- `SesionService.ingresarConClave` y `MfaService.verificarTotp` dejan de llamar a Supabase para el ingreso: llaman a la API y hacen `supabase.auth.setSession` con lo que devuelve.
- `LecturaBitacora` suma `recorrer` y el `resumen` de los tres tipos nuevos.

**No existe** y se escribe desde cero: los cuatro casos de uso, los adaptadores de GoTrue y Redis, las funciones de base de datos y el controlador de ingreso.

## Modelo de datos

### Migración `db/01b_seg_tipos_ingreso.sql`

```sql
-- 1. Catálogo de tipos.
ALTER TABLE seg.evento_seguridad DROP CONSTRAINT ck_evento_seguridad_tipo;
ALTER TABLE seg.evento_seguridad
  ADD CONSTRAINT ck_evento_seguridad_tipo CHECK (tipo IN
    ('LOGIN', 'LOGIN_FALLIDO', 'ACCESO_DENEGADO', 'ASIGNACION_OTORGADA', 'ASIGNACION_REVOCADA',
     'ACCESO_SOPORTE', 'EXPORTACION'));

-- 2. Usuario y tenant de un correo, con el mismo orden que el hook (tenant_preferido, luego desde DESC).
--    Solo membresías ACTIVO y vigentes. Sin fila si el correo no existe.
CREATE FUNCTION seg.usuario_para_ingreso(p_correo text)
  RETURNS TABLE (usuario_id uuid, tenant_id uuid)
  LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '';

-- 3. Escritura de LOGIN y LOGIN_FALLIDO sin contexto de tenant (antes del token o con tenant_id NULL).
--    Rechaza cualquier otro tipo.
CREATE FUNCTION seg.registrar_evento_ingreso(p_tipo varchar, p_tenant uuid, p_usuario uuid,
                                             p_detalle jsonb, p_ip inet)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '';
```

- Mismo dueño que las funciones `SECURITY DEFINER` de los specs 12 y 18; `EXECUTE` solo al rol de la aplicación.
- La prueba SQL cubre: el CHECK con los dos tipos nuevos, `usuario_para_ingreso` con correo inexistente, con membresía `FINALIZADO` y con dos membresías (gana `tenant_preferido`), `registrar_evento_ingreso` con `p_tenant` NULL y con un tipo no permitido (falla), y que la fila con `tenant_id` NULL no se ve con `app.tenant_id` de ningún tenant.
- El inverso borra las funciones y vuelve al CHECK del spec 18. Si ya hay filas `LOGIN_FALLIDO` o `EXPORTACION`, el inverso falla con mensaje claro (la tabla no admite `DELETE`); se documenta en la prueba de ida y vuelta, que corre sin esas filas.

### Dominio (`domain/intentos-ingreso.ts`)

```ts
export type EtapaIngreso = 'CLAVE' | 'MFA';
export type MotivoFalloIngreso =
  | 'CREDENCIALES'            // invalid_credentials, user_not_found
  | 'CORREO_NO_CONFIRMADO'    // email_not_confirmed
  | 'USUARIO_SUSPENDIDO'      // user_banned
  | 'CODIGO_MFA'              // mfa_verification_failed, mfa_challenge_expired
  | 'BLOQUEO_INGRESO'         // se activó el bloqueo por correo+IP o por IP
  | 'BLOQUEO_MFA';            // se activó el bloqueo de MFA del usuario

export const MOTIVOS_QUE_CUENTAN: readonly MotivoFalloIngreso[] = ['CREDENCIALES', 'CODIGO_MFA'];

export const VENTANA_INTENTOS_SEG = 15 * 60;
export const DURACION_BLOQUEO_SEG = 15 * 60;
export const UMBRAL_FALLOS_CORREO_IP = 5;
export const UMBRAL_FALLOS_IP = 20;
export const UMBRAL_FALLOS_MFA = 5;

/** «da****@gmail.com»: dos primeras letras del local y el dominio completo. */
export function enmascararCorreo(correo: string): string;
```

Errores de dominio nuevos:

| Clase | `code` | HTTP | Mensaje |
| --- | --- | --- | --- |
| `CredencialesInvalidasError` | `CREDENCIALES_INVALIDAS` | 401 | Correo o contraseña incorrectos |
| `IngresoBloqueadoError(segundos)` | `INGRESO_BLOQUEADO` | 429 | Demasiados intentos. Vuelva a intentarlo en N minutos (cabecera `Retry-After`, cuerpo con `reintentarEnSeg`) |
| `CodigoMfaInvalidoError` | `CODIGO_MFA_INVALIDO` | 400 | El código no es válido o ya expiró |
| `ProveedorIngresoNoDisponibleError` | `INGRESO_NO_DISPONIBLE` | 503 | No se pudo iniciar sesión; intente de nuevo |
| `ExportacionDemasiadoGrandeError(filas)` | `EXPORTACION_DEMASIADO_GRANDE` | 422 | La exportación tiene N filas; el máximo es 10 000. Acote el rango o los filtros |

`CORREO_NO_CONFIRMADO` y `USUARIO_SUSPENDIDO` responden `CREDENCIALES_INVALIDAS` (no se revela si la cuenta existe); el motivo real solo queda en la bitácora. Un 429 de GoTrue responde `INGRESO_BLOQUEADO` con `Retry-After` de GoTrue o 60 s.

### Bitácora (`seg.evento_seguridad`)

| `tipo` | Tenant | `usuario_id` | `detalle` |
| --- | --- | --- | --- |
| `LOGIN` | `tenant_id` del token (NULL si no trae) | del token | `sesion_id`, `metodo` (último `amr`: `password`, `oauth`, `otp`, `totp`…), `aal`, `agente` (User-Agent, 200 caracteres como máximo) |
| `LOGIN_FALLIDO`, etapa `CLAVE` | `usuario_para_ingreso(correo)` o NULL | el del correo o NULL | `etapa`, `motivo`, `correo` enmascarado (solo si el usuario no existe), `agente`; con `BLOQUEO_INGRESO` además `alcance` (`CORREO_IP` o `IP`) y `hasta` |
| `LOGIN_FALLIDO`, etapa `MFA` | del token aal1 | del token | `etapa`, `motivo`, `factor` (`totp`), `agente`; con `BLOQUEO_MFA` además `hasta` |
| `EXPORTACION` | del token | quien exporta | `recurso: 'bitacora'`, `filtros` (`desde`, `hasta`, `tipo`, `usuario` si viene), `filas` |

`ip` siempre con la IP de la petición. `LOGIN` y `LOGIN_FALLIDO` se escriben con `seg.registrar_evento_ingreso`; `EXPORTACION` con `BitacoraSeguridad.registrar` en el tenant del contexto. Los intentos rechazados mientras dura un bloqueo no escriben fila: solo log `seg.ingreso.bloqueado` con `alcance`, sin correo ni IP en claro.

El `resumen` de la lista: `LOGIN` → método; `LOGIN_FALLIDO` → motivo; `EXPORTACION` → número de filas. El front lo muestra con etiquetas:

| Código | Etiqueta |
| --- | --- |
| `password` / `oauth` / `otp` / `totp` | Contraseña / Proveedor externo / Enlace por correo / Código de verificación |
| `CREDENCIALES` | Contraseña incorrecta o correo inexistente |
| `CORREO_NO_CONFIRMADO` | Correo sin confirmar |
| `USUARIO_SUSPENDIDO` | Usuario suspendido |
| `CODIGO_MFA` | Código de verificación incorrecto |
| `BLOQUEO_INGRESO` | Bloqueo por intentos fallidos (correo e IP, o IP) |
| `BLOQUEO_MFA` | Bloqueo del código de verificación |

### Redis

| Clave | Valor | TTL |
| --- | --- | --- |
| `seg:sesion:<sesion_id>` | `1` (`SET NX`) | 30 días |
| `seg:ingreso:fallos:<sha256(correo normalizado)>:<ip>` | contador (`INCR`, `EXPIRE` al crearse) | 15 min |
| `seg:ingreso:fallos-ip:<ip>` | contador | 15 min |
| `seg:mfa:fallos:<usuario_id>` | contador | 15 min |
| `seg:ingreso:bloqueo:<sha256(correo)>:<ip>`, `seg:ingreso:bloqueo-ip:<ip>`, `seg:mfa:bloqueo:<usuario_id>` | `hasta` en epoch | 15 min |

- Correo normalizado: recortado y en minúsculas. Nunca en claro en Redis.
- Ventana fija: el contador vence a los 15 min de su primer fallo.
- Un ingreso exitoso borra `fallos:<correo>:<ip>`; no borra el de IP. Un MFA exitoso borra `seg:mfa:fallos:<usuario>`.
- Al bloquear se borra el contador que llegó al umbral.

### Puertos (`application/ports/`)

```ts
// proveedor-ingreso.port.ts
interface SesionEmitida { accessToken: string; refreshToken: string; expiraEn: number; tipoToken: 'bearer' }
type ResultadoIngreso =
  | { exito: true; sesion: SesionEmitida; usuarioId: string }
  | { exito: false; motivo: MotivoFalloIngreso | 'LIMITE_PROVEEDOR'; reintentarEnSeg?: number };
interface ProveedorIngreso {
  conClave(correo: string, clave: string, ip: string): Promise<ResultadoIngreso>;
  verificarMfa(accessToken: string, factorId: string, codigo: string, ip: string): Promise<ResultadoIngreso>;
}

// contador-intentos.port.ts
interface ContadorIntentos {
  bloqueoVigente(claves: ClaveBloqueo[]): Promise<number | null>;       // segundos restantes del mayor
  registrarFallo(clave: ClaveBloqueo, umbral: number): Promise<{ bloqueadoHasta: Date | null }>;
  limpiar(clave: ClaveBloqueo): Promise<void>;
}
type ClaveBloqueo =
  | { alcance: 'CORREO_IP'; correo: string; ip: string }
  | { alcance: 'IP'; ip: string }
  | { alcance: 'MFA'; usuarioId: string };

// registro-sesiones.port.ts
interface RegistroSesiones { esNueva(sesionId: string): Promise<boolean> }   // SET NX

// bitacora-ingreso.port.ts
interface BitacoraIngreso {
  usuarioPorCorreo(correo: string): Promise<{ usuarioId: string; tenantId: string | null } | null>;
  registrar(evento: { tipo: 'LOGIN' | 'LOGIN_FALLIDO'; tenantId: string | null; usuarioId: string | null;
                      detalle: Record<string, unknown>; ip: string | null }): Promise<void>;
}

// lectura-bitacora.ts (se agrega)
interface LecturaBitacora {
  contar(filtro: FiltroExportacion): Promise<number>;
  recorrer(filtro: FiltroExportacion, alLote: (eventos: EventoBitacora[]) => Promise<void>): Promise<void>;
      // keyset por (ocurrido_en DESC, id DESC), lotes de 1 000
}
```

- `ProveedorIngresoGotrue` (`infrastructure/supabase/proveedor-ingreso.gotrue.ts`) usa `fetch` a `SUPABASE_URL/auth/v1/token?grant_type=password` y a `/auth/v1/factors/:id/challenge` y `/verify` con `apikey: SUPABASE_PUBLISHABLE_KEY` y `X-Forwarded-For` con la IP del cliente. Timeout 5 s. Traduce los `error_code` de GoTrue a `MotivoFalloIngreso`.
- `ContadorIntentosRedis` y `RegistroSesionesRedis` usan `crearClienteRedis`. Si Redis falla: `bloqueoVigente` devuelve `null`, `registrarFallo` no bloquea, `esNueva` devuelve `false`. Cada caso con log `warn` (falla abierto).
- `BitacoraIngresoTypeorm` llama a las dos funciones con SQL crudo en un método del adaptador (funciones de base de datos, regla 11).
- `contar` y `recorrer` son TypeORM sobre `EventoSeguridadEntidad`, con el mismo `WHERE` que `listar` (se extrae a un método compartido del adaptador).

### Casos de uso

**`IngresarConClave({ correo, clave, ip, agente })`** (público):

1. Valida formato (correo 3-254, clave 1-72); si falla, 400 sin contar ni registrar.
2. `bloqueoVigente([CORREO_IP, IP])`: si hay, 429 `INGRESO_BLOQUEADO` sin llamar a GoTrue ni escribir fila.
3. `proveedor.conClave`. Si falla por red o 5xx: 503 `INGRESO_NO_DISPONIBLE`, sin contar.
4. Éxito: `limpiar(CORREO_IP)` y devuelve la sesión. El `LOGIN` lo escribe la primera petición autenticada.
5. Fallo: `usuarioPorCorreo` y `LOGIN_FALLIDO` con su motivo. Si el motivo está en `MOTIVOS_QUE_CUENTAN`, `registrarFallo` en `CORREO_IP` y en `IP`; si alguno bloquea, otro `LOGIN_FALLIDO` con `BLOQUEO_INGRESO`, `alcance` y `hasta`, y responde 429. Si no, 401.
6. Si escribir en la bitácora falla, se loguea y se responde igual (el ingreso no depende de la bitácora; ver Decisiones).

**`VerificarMfa({ principal, accessToken, factorId, codigo, ip, agente })`** (autenticado, aal1 o aal2):

1. `bloqueoVigente([MFA])`: 429 si hay.
2. `proveedor.verificarMfa`. Éxito: `limpiar(MFA)` y devuelve la sesión aal2.
3. Fallo `CODIGO_MFA`: `LOGIN_FALLIDO` en el tenant del token, `registrarFallo(MFA, 5)`; si bloquea, `LOGIN_FALLIDO` con `BLOQUEO_MFA` y 429. Si no, 400 `CODIGO_MFA_INVALIDO`.
4. Sirve también para confirmar el enrolamiento (es la misma llamada a GoTrue).

**`RegistrarInicioSesion(principal, ip, agente)`**: lo llama `AutenticacionGuard` sin esperar. Si `esNueva(principal.sesionId)`, escribe `LOGIN`. Un error se loguea (`seg.login.error`, solo el nombre del error) y no afecta a la petición. Si la escritura falla después del `SET NX`, el `LOGIN` de esa sesión se pierde (ver Riesgos).

**`ExportarBitacora(filtro, usuarioId)`** (`plat.seguridad.bitacora_exportar`, aal2):

1. Valida el filtro como `ConsultarBitacora` (rango obligatorio ≤ 92 días; sin `pagina` ni `tamano`).
2. `contar`: si pasa de `MAXIMO_FILAS_EXPORTACION = 10_000`, 422 `EXPORTACION_DEMASIADO_GRANDE` sin escribir fila.
3. Escribe `EXPORTACION` en su propia transacción **antes** de enviar el primer byte. Si falla: 503 `AUDITORIA_NO_DISPONIBLE` (falla cerrado, como el spec 18).
4. `recorrer` y escribe cada lote con `exceljs.stream.xlsx.WorkbookWriter` sobre la respuesta. Un error a mitad del envío corta la conexión y se loguea; la fila `EXPORTACION` queda (se intentó exportar).

Hoja «Bitácora», encabezado fijo y en negrita, filtro automático. Columnas: Fecha (America/Lima, `dd/mm/yyyy hh:mm:ss`), Tipo (etiqueta), Usuario, Correo, Resumen (etiqueta del método o del motivo cuando aplica), IP. Sin el JSON de `detalle`. Las etiquetas viven en una constante del back (`ETIQUETAS_BITACORA`) con los mismos textos que el front.

### HTTP

| Método y ruta | Permiso | Cuerpo o query | Respuesta |
| --- | --- | --- | --- |
| `POST /v1/seg/auth/ingresar` | `@Publico` | `{ correo, clave }` | 200 `SesionEmitida`; 401, 429, 503 |
| `POST /v1/seg/auth/mfa/verificar` | autenticado, sin `@Permiso` | `{ factorId, codigo }` (6 dígitos) | 200 `SesionEmitida`; 400, 429, 503 |
| `GET /v1/seg/bitacora/exportar` | `plat.seguridad.bitacora_exportar` (aal2) | `desde`, `hasta`, `tipo?`, `usuario?` | 200 XLSX, `Content-Disposition: attachment; filename="bitacora-AAAAMMDD-AAAAMMDD.xlsx"`; 400, 422, 503 |

- OpenAPI en los tres. El cuerpo de `/auth/*` se excluye del log de peticiones y de cualquier interceptor que lo serialice.
- `SesionEmitida` en snake_case hacia el front (`access_token`, `refresh_token`, `expires_in`, `token_type`), que es lo que recibe `setSession`.
- `SoporteInterceptor`: `/auth/*` no tiene `@Permiso`; con sesión de soporte vigente, `mfa/verificar` es `POST` y se marca con `@EscrituraPermitidaEnSoporte()` como `salir`.

### Manifiesto PLAT `1.8.0`

| Código | Descripción | `alcance_minimo` | `sensible` |
| --- | --- | --- | --- |
| `plat.seguridad.bitacora_exportar` | Exportar la bitácora de seguridad a Excel | `TENANT` | sí |

`PLAT_PROPIETARIO` y `PLAT_ADMIN_SEGURIDAD` lo suman. Sin opción de menú nueva. `PERMISOS_VETADOS_SOPORTE` lo suma.

### Front

```ts
// libs/shared/auth — models/errores.ts
type CodigoErrorAuth = ... | 'INGRESO_BLOQUEADO';
// ErrorAuth suma `reintentarEnSeg?: number`; el mensaje se arma con los minutos redondeados hacia arriba:
// «Demasiados intentos. Vuelva a intentarlo en N minutos.»
// Los códigos de la API (`CREDENCIALES_INVALIDAS`, `CODIGO_MFA_INVALIDO`, `INGRESO_BLOQUEADO`, `INGRESO_NO_DISPONIBLE`)
// se mapean igual que los de Supabase; `INGRESO_NO_DISPONIBLE` → `SIN_CONEXION`.

// libs/shared/auth — config: RUTA_INGRESAR = '/seg/auth/ingresar', RUTA_VERIFICAR_MFA = '/seg/auth/mfa/verificar'
```

- `SesionService.ingresarConClave` hace `POST` a la API (sin Bearer ni aviso global de error) y `supabase.auth.setSession`. `MfaService.verificarTotp` igual con el Bearer actual y luego `intentarCargarContexto`, como hoy.
- `admin-cliente`: `TIPOS_EVENTO` suma los dos tipos; `mensajes-bitacora.ts` suma las etiquetas de la tabla anterior; `BitacoraCliente.exportar(filtro)` pide `responseType: 'blob'` y descarga con el nombre de `Content-Disposition`.
- **Pantalla tipo**: lista (`bitacora-lista`) y detalle (`bitacora-detalle`), ya existentes. Cambios: botón «Exportar» (ícono `download`, botón de texto en la cabecera de la lista) con `*siPermiso="'plat.seguridad.bitacora_exportar'"`, deshabilitado y con `vit-cargando` mientras descarga; usa los filtros aplicados. Con 422 o 503, `AvisosService` muestra el mensaje de la API. Sin aal2, el flujo de MFA existente del interceptor.
- En el detalle de `LOGIN` y `LOGIN_FALLIDO`: filas «Método», «Etapa», «Motivo» (etiqueta, siempre visible y destacada cuando es un bloqueo, con `vit-chip-estado` de tono advertencia), «Bloqueado hasta», «Correo intentado» (enmascarado) y «Navegador» (User-Agent). En `EXPORTACION`: rango, filtros y filas. Lo demás, como el spec 18.
- La lista muestra el motivo en la columna «Resumen» con su etiqueta.
- Pantallas de `/auth`: sin cambio visual; solo el mensaje nuevo.
- Se verifica en claro y oscuro y a 600 px.

## Plan de implementación

1. **Migración.** `01b_seg_tipos_ingreso.sql`, inverso y prueba SQL; agregar a `tools/migrar/test/db-esquemas.test.mjs`. Verificar: prueba SQL y de ida y vuelta en PGlite.
2. **Dominio.** `intentos-ingreso.ts`, tipos y errores nuevos, `PERMISOS_VETADOS_SOPORTE`. Verificar: `nx test plataforma-seguridad` (dominio).
3. **Adaptadores Redis y base.** `ContadorIntentosRedis`, `RegistroSesionesRedis`, `BitacoraIngresoTypeorm`. Verificar: integración con Redis 7 y PGlite (incluido Redis caído).
4. **Adaptador GoTrue.** `ProveedorIngresoGotrue` con traducción de errores y timeout; `SUPABASE_PUBLISHABLE_KEY` en `env.ts`. Verificar: pruebas con servidor HTTP falso.
5. **Ingreso.** `IngresarConClave`, `VerificarMfa`, `ingreso.controller.ts`, OpenAPI y exclusión del cuerpo en logs. Verificar: Jest de aplicación y supertest (bloqueo por correo+IP, por IP, MFA, Redis caído, 503).
6. **LOGIN.** `RegistrarInicioSesion` en `AutenticacionGuard`. Verificar: supertest con dos peticiones de la misma sesión (una fila) y una de otra sesión (dos filas).
7. **Exportación.** `contar`, `recorrer`, `ExportarBitacora`, endpoint y `exceljs`; resumen de los tipos nuevos en `listar`. Verificar: supertest que abre el XLSX con `exceljs` y compara filas; 422 con 10 001; 503 si falla la escritura de `EXPORTACION`; tiempo con 10 000 filas.
8. **Manifiesto `1.8.0`.** Permiso, roles y veto. Verificar: `manifiesto-plat.spec.ts` y `manifiesto-soporte.spec.ts`.
9. **Front `shared/auth`.** Ingreso y MFA por la API, `INGRESO_BLOQUEADO`. Verificar: `nx test shared-auth`.
10. **Front `admin-cliente`.** Exportar, tipos, etiquetas, detalle. Verificar: `nx test plataforma-admin-cliente`.
11. **Navegador.** MCP `playwright` con la app levantada: ingreso correcto, cinco claves erróneas y el mensaje de bloqueo, MFA erróneo, bitácora con `LOGIN` y `LOGIN_FALLIDO` y su motivo, exportación descargada; claro, oscuro y 600 px; consola sin errores.
12. **Nube, dev.** Migración, manifiesto, variable, revisión de los límites de Auth en el panel de Supabase y humo con un usuario real. `nx affected -t lint test build` verde.

## Criterios de aceptación

- [ ] **Dado** un usuario con sesión nueva, **cuando** hace su primera petición a la API, **entonces** hay una fila `LOGIN` en su tenant con `sesion_id`, `metodo`, `aal`, `agente` e IP; la segunda petición de la misma sesión no agrega otra.
- [ ] **Dado** un ingreso con Google, **cuando** el front llama a `mi-contexto`, **entonces** hay `LOGIN` con `metodo: 'oauth'`.
- [ ] **Dado** un correo existente y una clave incorrecta, **cuando** se llama a `POST /v1/seg/auth/ingresar`, **entonces** responde 401 `CREDENCIALES_INVALIDAS` y hay `LOGIN_FALLIDO` con `etapa: 'CLAVE'`, `motivo: 'CREDENCIALES'`, el `usuario_id` y el tenant que elegiría el hook.
- [ ] **Dado** un correo inexistente, **cuando** falla el ingreso, **entonces** la fila `LOGIN_FALLIDO` tiene `tenant_id` y `usuario_id` NULL y el correo enmascarado, y no aparece en la bitácora de ningún tenant.
- [ ] **Dado** un correo sin confirmar, **cuando** ingresa con la clave correcta, **entonces** responde 401 `CREDENCIALES_INVALIDAS`, el motivo en la bitácora es `CORREO_NO_CONFIRMADO` y no suma al contador.
- [ ] **Dado** 4 fallos de `CREDENCIALES` del mismo correo e IP en 15 min, **cuando** ocurre el quinto, **entonces** responde 429 `INGRESO_BLOQUEADO` con `Retry-After` ≈ 900, hay un `LOGIN_FALLIDO` con `motivo: 'BLOQUEO_INGRESO'`, `alcance: 'CORREO_IP'` y `hasta`, y el sexto intento (aun con la clave correcta) da 429 sin llamar a GoTrue ni escribir fila.
- [ ] **Dado** el mismo correo bloqueado desde una IP, **cuando** ingresa desde otra IP con la clave correcta, **entonces** entra.
- [ ] **Dado** 20 fallos desde una IP con correos distintos, **entonces** esa IP queda bloqueada 15 min con `alcance: 'IP'`.
- [ ] **Dado** un ingreso exitoso tras 3 fallos, **entonces** el contador de correo+IP vuelve a cero.
- [ ] **Dado** un token aal1, **cuando** envía 5 códigos MFA incorrectos, **entonces** los 4 primeros dan 400 `CODIGO_MFA_INVALIDO` con `LOGIN_FALLIDO` `etapa: 'MFA'` en su tenant, y el quinto da 429 con `motivo: 'BLOQUEO_MFA'`.
- [ ] **Dado** un código MFA correcto, **cuando** se llama a `mfa/verificar`, **entonces** devuelve una sesión aal2 y el front queda con `mfaVigente`.
- [ ] **Dado** Redis caído, **cuando** alguien ingresa, **entonces** entra (o recibe 401) sin bloqueo, el `LOGIN_FALLIDO` se escribe igual y hay log `warn`.
- [ ] **Dado** GoTrue sin respuesta en 5 s, **entonces** `ingresar` responde 503 `INGRESO_NO_DISPONIBLE` y no cuenta fallo.
- [ ] Ningún log, clave de Redis ni fila de la bitácora contiene la clave, el código MFA ni el correo en claro (prueba que inspecciona logs capturados y claves de Redis).
- [ ] **Dado** un administrador con `plat.seguridad.bitacora_exportar` y aal2, **cuando** exporta un rango con 3 eventos, **entonces** recibe un XLSX con encabezado y 3 filas en el orden de la lista, y hay una fila `EXPORTACION` con filtros y `filas: 3`.
- [ ] **Dado** el mismo usuario en aal1, **entonces** la exportación responde 403 de MFA y no hay fila `EXPORTACION`.
- [ ] **Dado** un usuario con `plat.seguridad.bitacora` pero sin `bitacora_exportar`, **entonces** responde 403 y el botón «Exportar» no aparece.
- [ ] **Dado** un filtro con 10 001 eventos, **entonces** responde 422 `EXPORTACION_DEMASIADO_GRANDE` y no hay fila `EXPORTACION`.
- [ ] **Dado** que la escritura de `EXPORTACION` falla, **entonces** responde 503 `AUDITORIA_NO_DISPONIBLE` sin enviar archivo.
- [ ] La exportación de 10 000 filas termina en < 10 s en la prueba de integración.
- [ ] **Dado** un agente con sesión de soporte vigente, **cuando** intenta exportar, **entonces** responde 403 `SOPORTE_PERMISO_VETADO`.
- [ ] En la bitácora, la lista muestra el motivo de `LOGIN_FALLIDO` con su etiqueta y el detalle muestra método, etapa, motivo, bloqueo, correo enmascarado y navegador.
- [ ] La pantalla de ingreso muestra «Demasiados intentos. Vuelva a intentarlo en N minutos.» ante el bloqueo.
- [ ] Verificado con el MCP `playwright` en claro, oscuro y 600 px, consola sin errores, con capturas de ingreso bloqueado, lista, detalle y exportación.
- [ ] Migración reversible y probada en CI contra PostgreSQL 16; manifiesto `1.8.0` aplicado en dev.
- [ ] El código nuevo sigue «Código limpio» de `CLAUDE.md`; pasado por `code-simplifier`.
- [ ] Cobertura de dominio ≥ 70 %; `nx affected -t lint test build` verde.

## Decisiones

- **Sí:** `LOGIN` en la primera petición de cada sesión con `SET NX` de `session_id` en Redis (30 días). Cubre contraseña, Google y enlaces sin tocar esos flujos. **No:** tabla `seg.sesion_vista` (escritura extra y limpieza) ni registrar solo en `mi-contexto` (depende del cliente).
- **Sí:** ingreso por contraseña y MFA a través de la API, como proxy a GoTrue, devolviendo la sesión para `setSession`. **No:** front directo con reporte del fallo; no es confiable ni permite bloquear.
- **Sí:** `LOGIN_FALLIDO` en el tenant que elegiría el hook, o con tenant NULL si el correo no existe; correo enmascarado solo en ese caso. **No:** todo al tenant operador (el cliente no vería los ataques a sus usuarios) ni una fila por cada membresía.
- **Sí:** bloqueo por correo+IP (5 en 15 min) y por IP (20 en 15 min), 15 min de bloqueo, ventana fija. **No:** bloqueo solo por correo; permite bloquear a la víctima a propósito.
- **Sí:** MFA con contador propio por usuario (5 en 15 min). El token ya identifica al usuario.
- **Sí:** solo cuentan `CREDENCIALES` y `CODIGO_MFA`. Correo sin confirmar o usuario suspendido se registran con su motivo, pero no son adivinanza de clave.
- **Sí:** el motivo de cada fallo queda en la bitácora y se muestra con etiqueta en lista, detalle y exportación (pedido del usuario). Hacia quien ingresa, el mensaje es genérico.
- **Sí:** una fila al activarse el bloqueo; los intentos durante el bloqueo solo van al log. **No:** una fila por intento bloqueado; un ataque llenaría la tabla.
- **Sí:** Redis caído falla abierto. GoTrue conserva sus límites. **No:** falla cerrado; nadie podría ingresar con contraseña.
- **Sí:** la escritura de `LOGIN` y `LOGIN_FALLIDO` no bloquea el ingreso si falla. **No:** falla cerrado como `ACCESO_SOPORTE`; dejaría sin servicio a todos por un problema de la bitácora.
- **Sí:** aceptar que GoTrue directo con la publishable key salta el bloqueo; queda en Riesgos. El refuerzo es el hook de Supabase (plan Team), en otro spec.
- **Sí:** funciones `SECURITY DEFINER` para escribir sin contexto de tenant y para resolver el tenant de un correo. **No:** relajar la RLS de `seg.evento_seguridad`.
- **Sí:** exportación al vuelo con `exceljs` en streaming, tope de 10 000 filas y 422 si se pasa. Sin archivo guardado, la expiración a 72 h de TR-RN-047 no aplica. **No:** sin tope (respuestas enormes con el evento `PETICION`), ni columna con el JSON del detalle.
- **Sí:** tipo `EXPORTACION` escrito antes del primer byte y falla cerrado; `plat.seguridad.bitacora_exportar` sensible (aal2) en `PLAT_PROPIETARIO` y `PLAT_ADMIN_SEGURIDAD`. **No:** esperar a TR-AUD.
- **Sí:** `bitacora_exportar` en `PERMISOS_VETADOS_SOPORTE`: un agente de soporte no saca datos personales del cliente en un archivo.
- **Sí (paso 2, decisión del usuario):** el permiso `plat.seguridad.bitacora_exportar` y la versión `1.8.0` del manifiesto se declaran en el paso 2, junto con el veto. `manifiesto-soporte.spec.ts` exige que todo permiso vetado exista en el manifiesto. Los roles siguen en el paso 8.
- **Sí (paso 2):** el mensaje de bloqueo usa el singular con 1 minuto («en 1 minuto»).
- **Sí (paso 4):** `mfa_verification_rejected` (demasiados intentos en GoTrue) y `mfa_factor_not_found` cuentan como `CODIGO_MFA`. Un 4xx de GoTrue con un `error_code` que no está en la tabla cuenta como fallo de la etapa (`CREDENCIALES` o `CODIGO_MFA`): nunca abre el paso ni se presenta como caída del proveedor. 5xx, red, timeout, JSON roto o un 200 sin tokens son `INGRESO_NO_DISPONIBLE`.
- **Sí (paso 10):** el paso por MFA antes de exportar lo hace la página, no el interceptor de auth. La respuesta es un Blob, también en el error, y el interceptor no lee su `codigo`. Sin `mfaVigente`, o ante un 401 `MFA_REQUERIDA`, la página lleva a `/auth/mfa` con `returnUrl` a la misma bitácora. Los errores de la exportación (422, 503) se leen del Blob y se muestran con `AvisosService`, sin el aviso global.
- **Sí (paso 10):** el detalle de `LOGIN_FALLIDO` suma «Alcance del bloqueo» (correo e IP, o IP). Sin esa fila, la etiqueta del motivo no dice cuál de los dos bloqueos fue.
- **Sí:** migración con nombre `01b_seg_tipos_ingreso.sql` para correr después de `01b_seg_soporte.sql` (`migrar.mjs` ordena por nombre).
- **Sí:** `SUPABASE_PUBLISHABLE_KEY` en la API para el grant de contraseña. **No:** usar la secret key en un flujo que actúa por el usuario.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| GoTrue limita `/token` por IP y ahora todos los ingresos salen de la IP de la API | Se envía `X-Forwarded-For`; en el paso 12 se verifica en dev si GoTrue lo respeta. Si no, se suben los límites de Auth en el panel, porque el bloqueo de Redis los reemplaza. Se documenta en `docs/ops/supabase-ambientes.md`. |
| Un atacante usa GoTrue directo con la publishable key y salta el bloqueo | Quedan los límites de Supabase. Refuerzo con el hook «Password Verification Attempt» en otro spec. |
| La clave pasa por la API y podría terminar en un log | Exclusión explícita del cuerpo de `/auth/*` y prueba que inspecciona los logs capturados. |
| `SET NX` hecho y escritura de `LOGIN` fallida: se pierde el evento de esa sesión | Log `seg.login.error`. Aceptado: borrar la clave al fallar podría duplicar `LOGIN` con peticiones simultáneas. |
| Una sesión que dura más de 30 días genera un segundo `LOGIN` | Aceptado y documentado; 30 días cubre la vida normal de un refresh. |
| Detrás de un proxy, la IP es la del proxy y el bloqueo por IP bloquearía a todos | `trust proxy` es del spec de despliegue; hoy no hay proxy. Se anota en el runbook. |
| Muchos usuarios detrás de una misma IP (NAT de una empresa) | Umbral por IP alto (20) y por correo+IP bajo (5). Se ajustan las constantes si aparece. |
| El inverso de la migración falla si ya hay filas de los tipos nuevos | Mensaje claro; la tabla es de solo inserción por diseño. |

## Lo que **no** está en este spec

- Hook de Supabase para bloquear el acceso directo a GoTrue.
- Fallos de ingreso por Google, enlace o recuperación de clave.
- Desbloqueo manual y pantalla de bloqueos.
- Avisos por bloqueo (TR-NOT).
- Umbrales por tenant (CFG).
- CSV, reportes programados y archivos con expiración (TR-REP, TR-ARC).
- Sesiones activas y cierre remoto.
- `trust proxy`.

Cada uno, si llega, va en su propio spec.
