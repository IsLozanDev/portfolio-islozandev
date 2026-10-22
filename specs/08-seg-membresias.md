# SPEC 08 — Membresías: invitar, aceptar, suspender, reactivar, finalizar y revocar

> **Status:** Aprobado
> **Depends on:** SPEC 02, SPEC 04, SPEC 05, SPEC 06
> **Date:** 2026-10-22
> **Objective:** Agregar a `libs/plataforma/seguridad` el ciclo de vida de la membresía (invitación de un solo uso de 72 h con correo de Supabase, aceptación con el mismo usuario, suspensión, reactivación, finalización y revocación de asignaciones con motivo), expuesto en `/v1/seg` con `@Permiso`, OpenAPI y límite de tasa en lo público.

## Por qué existe este spec

Fila 08 de `docs/roadmap-specs.md` (S-04). El número 07 queda vacío: el spec 06 absorbió las filas 06 y 07. Contexto de apoyo: `docs/spec-context/08-seg-membresias.md`. Su sección 9 (ambigüedades y preguntas) queda resuelta por las Decisiones de este spec.

El spec 06 dejó roles, perfiles, asignaciones, permisos efectivos y `PermisoGuard`. La membresía solo se lee (`MembresiasLectura`). Nadie puede entrar a un tenant ni salir de él por la API.

Supabase limita el enlace de invitación a 24 h (`otp_expiry`, máximo recomendado 86400 s; verificado con context7) y `inviteUserByEmail` falla si el correo ya existe. Por eso la vigencia de 72 h la controla un token propio, no el enlace de Supabase.

RF cubiertos:

- **TR-RF-009** invitar usuario al tenant.
- **TR-RF-010** aceptar invitación y vincular identidad (parte back; la pantalla es del spec 14).
- **TR-RF-014** revocar acceso y suspender membresía.

Criterios del SRS: TR-CA-025 a 030, 039 y 040.

Reglas: **TR-RN-006** (límite de usuarios del plan), **TR-RN-008** (asignación coherente; se reutiliza `Asignacion.otorgar`), **TR-RN-009** (revocar es sensible), **TR-RN-010** (al menos un propietario activo). TR-RN-011 es del spec 18.

RNF propios:

- **TR-RNF-009**: identidad solo en Supabase; el backend no maneja contraseñas.
- **TR-RNF-013**: cada cambio deja fila en `seg.evento_seguridad` con actor y motivo.
- **TR-RNF-014**: el token pierde el tenant en el siguiente refresh (≤ 900 s); los permisos se pierden al commit.
- **TR-RNF-015**: límite de tasa en las rutas públicas de invitación (pendiente del spec 05).
- **TR-RNF-021**: confirmación explícita y motivo obligatorio en suspender, finalizar y revocar.

RNF heredados: 008, 010, 011 (secret key solo en `apps/api`), 012, 024/119, 025, 026 (logs sin correo ni token), 101, 106.

Historias del backlog: **S-04**. Estimado: 11-13 h (el plan dice 4 h; el roadmap, 8 h). Decisión del usuario: un solo spec.

## Alcance

**In:**

- **Migración** `db/01b_seg_membresias.sql`, su inverso `db/rollback/01b_seg_membresias.sql` y prueba `db/tests/01b_seg_membresias.test.sql`. Corre después de `01b_seg_autorizacion.sql` por orden de nombre.
- **Dominio** en `libs/plataforma/seguridad/src/domain/`: `membresia.ts` (agregado), `invitacion.ts`, `revocar` en `asignacion.ts`, eventos nuevos en `eventos.ts` y errores nuevos en `errores.ts`.
- **Casos de uso** en `application/`: `InvitarUsuario`, `ConsultarInvitacion`, `AceptarInvitacion`, `SuspenderMembresia`, `ReactivarMembresia`, `FinalizarMembresia` y `RevocarAsignacion`. Cada uno con `UnitOfWork`, `TenantContext` y outbox, como los del spec 06.
- **Puertos** nuevos en `application/ports/` y adaptadores en `infrastructure/typeorm/` y `infrastructure/supabase/`.
- **Adaptador** `infrastructure/supabase/supabase-admin.proveedor.ts` con `@supabase/supabase-js` y la secret key.
- **Interfaz**: `interface/invitaciones.controller.ts` y `interface/membresias.controller.ts`, con DTO y OpenAPI.
- **Límite de tasa** con `@nestjs/throttler` en memoria, solo en las rutas de invitación sin `@Permiso`.
- **Manifiesto PLAT** `1.1.0`: permisos `plat.usuario.invitar` y `plat.asignacion.revocar`, opción de menú «Usuarios» y ambos en `PLAT_ADMIN_SEGURIDAD`.
- **Dependencias**: `@supabase/supabase-js` `2.118.0` y `@nestjs/throttler` `6.7.1`.
- **`apps/api`**: `SUPABASE_SECRET_KEY`, `SEG_URL_INVITACION` y `SEG_INVITACION_HORAS` en `config/env.ts` y `.env.example`.
- **`supabase/config.toml`**: `otp_expiry = 86400` y la URL de invitación local en `additional_redirect_urls`.
- **Pruebas**: dominio (Jest), integración con PostgreSQL 16 y Redis 7 reales y proveedor de identidad falso, HTTP con supertest.
- **Nube, dev (manual)**: migración, manifiesto, redirect URL y prueba de humo con un correo real.

**Out of scope (para otros specs):**

- Pantalla «aceptar invitación» y el `refreshSession()` posterior (spec 14). Aquí solo el contrato back.
- UI de usuarios: invitar, revocar, listar miembros (spec 16).
- Listado de miembros e invitaciones del tenant (`GET`), reenvío como acción aparte (se reenvía invitando otra vez).
- Alta de tenant con invitación al propietario (spec 12). Este spec no marca `es_propietario`.
- Correo propio por TR-NOT o Resend (R2). Aquí el correo lo envía Supabase.
- Cierre explícito de sesiones en Supabase (ver Decisiones).
- Bitácora de soporte y TR-RN-011 (spec 18). Auditoría TR-AUD (spec 20).
- Handlers por evento del outbox (spec 11). La caché se invalida por la versión de seguridad del spec 06.
- Throttler compartido en Redis (cuando haya más de una instancia).
- Migración SazónPOS que crea membresías por script (spec 23).
- Proyecto prod (plan de migración a producción).

## Base de código reutilizada

Fuente: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/codigo/`.

**Se conserva:**

- `db/01b_seg.sql`: tablas `seg.usuario`, `seg.membresia`, `seg.asignacion` y `seg.evento_seguridad` (ya aplicadas en el spec 04).
- `supabase/migrations/20261102000000_seg_supabase_auth.sql`: `trg_auth_usuario_creado` crea `seg.usuario` al invitar. El hook ya excluye membresías no `ACTIVO` y usa `tenant_preferido`.
- PL-06: secuencia invitar (Admin API) → membresía `INVITADO` + asignación → correo de Supabase → aceptar → `ACTIVO` + `tenant_preferido` → refresh.
- Del spec 06: `Asignacion.otorgar`, `cubre`, `CatalogoPermisos.sensible`, `UbicacionesOrg`, `ProductosContratados`, `BitacoraSeguridad` y los triggers de `seg.version_seguridad` sobre `membresia` y `asignacion`.

**Cambia:**

- Se agrega el estado `FINALIZADO` y la versión al agregado `Membresia`.
- La invitación es un token propio de 72 h guardado como hash, no el enlace de Supabase.
- La asignación se revoca con columnas propias. `vigente_hasta = ayer` violaría `ck_asig_vigencia` si empezó hoy.
- `seg.asignaciones_aplicables` y `seg.sucursales_accesibles` excluyen asignaciones revocadas.
- `MembresiasLectura` (spec 06) queda y su `EstadoMembresia` suma `FINALIZADO`.
- Nombres de eventos con la convención de `org` (`membresia.invitada`), no `seg.membresia.invitada` de PL-06.

**No existe en el código base** y se escribe desde cero: agregado `Membresia`, invitación, los 7 casos de uso, el adaptador de Supabase Admin, los controladores, el throttler y las pruebas.

## Modelo de datos

### Migración `db/01b_seg_membresias.sql`

```sql
ALTER TABLE seg.membresia
  DROP CONSTRAINT membresia_estado_check,   -- nombre real se verifica al implementar
  ADD CONSTRAINT ck_membresia_estado CHECK (estado IN ('INVITADO', 'ACTIVO', 'SUSPENDIDO', 'FINALIZADO')),
  ADD COLUMN version      bigint       NOT NULL DEFAULT 0,
  ADD COLUMN motivo       varchar(300) NULL,          -- último motivo de suspender/reactivar/finalizar
  ADD COLUMN cambiado_por uuid         NULL REFERENCES seg.usuario (id),
  ADD COLUMN cambiado_en  timestamptz  NULL;

ALTER TABLE seg.asignacion
  ADD COLUMN revocada_en       timestamptz  NULL,
  ADD COLUMN revocada_por      uuid         NULL REFERENCES seg.usuario (id),
  ADD COLUMN motivo_revocacion varchar(300) NULL,
  ADD CONSTRAINT ck_asig_revocacion CHECK (
    (revocada_en IS NULL AND revocada_por IS NULL AND motivo_revocacion IS NULL)
    OR (revocada_en IS NOT NULL AND motivo_revocacion IS NOT NULL));

CREATE TABLE seg.invitacion (
  id           uuid        PRIMARY KEY,
  tenant_id    uuid        NOT NULL,
  membresia_id uuid        NOT NULL,
  token_hash   char(64)    NOT NULL UNIQUE,          -- sha256 hex del token; el token no se guarda
  expira_en    timestamptz NOT NULL,
  usada_en     timestamptz NULL,
  anulada_en   timestamptz NULL,
  creada_por   uuid        NOT NULL REFERENCES seg.usuario (id),
  creada_en    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, membresia_id) REFERENCES seg.membresia (tenant_id, id),
  CONSTRAINT ck_invitacion_uso CHECK (usada_en IS NULL OR anulada_en IS NULL)
);
CREATE UNIQUE INDEX ux_invitacion_pendiente ON seg.invitacion (membresia_id)
  WHERE usada_en IS NULL AND anulada_en IS NULL;   -- una sola pendiente por membresía
-- RLS ENABLE + FORCE con tenant_id = app.tenant_id; trigger seg.sin_borrado().

-- Única lectura antes de conocer el tenant. Devuelve solo la fila del hash, sin datos personales.
CREATE FUNCTION seg.invitacion_por_token(p_hash char(64))
  RETURNS TABLE (invitacion_id uuid, tenant_id uuid, membresia_id uuid, usuario_id uuid,
                 tenant_nombre varchar, expira_en timestamptz, usada_en timestamptz, anulada_en timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';
```

- `CREATE OR REPLACE` de `seg.asignaciones_aplicables` y `seg.sucursales_accesibles` con `AND a.revocada_en IS NULL`.
- El trigger de versión del spec 06 sobre `seg.asignacion` ya sube `vt` al revocar (es un cambio). Sobre `seg.membresia` sube con `estado` o `hasta`; no con `version`, `motivo`, `cambiado_*`.
- El inverso convierte `FINALIZADO` en `SUSPENDIDO` con `hasta` puesto, restaura el CHECK y las funciones del spec 06, y borra columnas, tabla y función.

### Dominio

```ts
// domain/membresia.ts
export type EstadoMembresia = 'INVITADO' | 'ACTIVO' | 'SUSPENDIDO' | 'FINALIZADO';

export class Membresia extends AggregateRoot {
  static invitar(d: { id; usuarioId; tenantId; invitadoPor }): Membresia; // INVITADO
  reinvitar(por: string, ahora: Date): void;      // INVITADO -> INVITADO; FINALIZADO -> INVITADO (hasta = null)
  aceptar(ahora: Date): void;                     // INVITADO -> ACTIVO, desde = ahora
  suspender(motivo: Motivo, por: string, ahora: Date): void;   // ACTIVO -> SUSPENDIDO
  reactivar(motivo: Motivo, por: string, ahora: Date): void;   // SUSPENDIDO -> ACTIVO
  finalizar(motivo: Motivo, por: string, ahora: Date): void;   // INVITADO|ACTIVO|SUSPENDIDO -> FINALIZADO, hasta = ahora
}

// Motivo: texto recortado de 4 a 300 caracteres (TR-RF-014 dice 5; ver Decisiones).

// domain/invitacion.ts
export class Invitacion {
  static emitir(d: { id; tenantId; membresiaId; tokenHash; creadaPor; ahora: Date; horas: number }): Invitacion;
  estado(ahora: Date): 'VIGENTE' | 'EXPIRADA' | 'USADA' | 'ANULADA';
  usar(ahora: Date): void;     // exige VIGENTE
  anular(ahora: Date): void;   // al reinvitar o finalizar
}

// domain/asignacion.ts (se agrega)
revocar(motivo: Motivo, por: string, ahora: Date): void; // ya revocada -> AsignacionYaRevocadaError
```

El token es de 32 bytes aleatorios en base64url (`node:crypto`, en `application/`). Solo viaja en el `redirectTo` del correo. La base guarda su sha256.

Errores de dominio nuevos:

| Clase | `code` | HTTP | Mensaje (SRS cuando existe) |
| --- | --- | --- | --- |
| `AlcanceSuperiorError` | `ALCANCE_SUPERIOR` | 403 | «No puede otorgar un alcance mayor al suyo» (TR-CA-026) |
| `LimiteUsuariosError(producto, limite)` | `LIMITE_USUARIOS` | 409 | El plan de `<producto>` permite `<limite>` usuarios |
| `MembresiaExistenteError(estado)` | `MEMBRESIA_EXISTENTE` | 409 | El usuario ya es miembro (`ACTIVO` o `SUSPENDIDO`) |
| `InvitacionNoEncontradaError` | `INVITACION_NO_ENCONTRADA` | 404 | La invitación no existe |
| `InvitacionExpiradaError` | `INVITACION_EXPIRADA` | 410 | «La invitación expiró; solicite una nueva al administrador» (TR-CA-029) |
| `InvitacionNoDisponibleError(estado)` | `INVITACION_NO_DISPONIBLE` | 409 | La invitación ya se usó o fue anulada |
| `InvitacionOtroCorreoError` | `INVITACION_OTRO_CORREO` | 403 | «Esta invitación pertenece a otro correo» (TR-CA-030) |
| `TransicionMembresiaError(de, accion)` | `TRANSICION_INVALIDA` | 409 | No se puede `<accion>` una membresía `<de>` |
| `PropietarioUnicoError` | `PROPIETARIO_UNICO` | 409 | «El tenant debe tener al menos un propietario activo» (TR-CA-040) |
| `AsignacionYaRevocadaError` | `ASIGNACION_YA_REVOCADA` | 409 | La asignación ya estaba revocada |
| `MotivoInvalidoError` | `MOTIVO_INVALIDO` | 400 | El motivo debe tener entre 4 y 300 caracteres |
| `ConfirmacionRequeridaError` | `CONFIRMACION_REQUERIDA` | 400 | La acción exige `confirmar: true` (TR-RNF-021) |

`AlcanceSuperiorError` reemplaza a `OtorganteSinAlcanceError` solo en `InvitarUsuario`. `OtorgarAsignacion` no cambia.

### Puertos (`application/ports/`)

```ts
RepositorioMembresias  { buscar(id), deUsuario(usuarioId), guardar(m),
                         propietariosActivosParaActualizar(): Promise<string[]> } // SELECT ... FOR UPDATE
RepositorioInvitaciones { pendienteDe(membresiaId), guardar(i), porToken(hash): InvitacionResuelta | null }
UsuariosIdentidad      { porCorreo(correo): { id, nombre, tipo } | null; marcarInterno(id) }  // seg.usuario
LimitesPlan            { limite(producto): number | null;
                         usados(producto, ahora): number } // ACTIVO + INVITADO con invitación vigente,
                                                           // con asignación vigente no revocada del producto
ProveedorIdentidad     { invitar(correo, nombre, redirectTo): Promise<{ usuarioId }>;   // inviteUserByEmail
                         enviarEnlace(correo, redirectTo): Promise<void> }              // magic link, sin crear usuario
```

- `porToken` llama a `seg.invitacion_por_token`; es la única lectura sin tenant en contexto.
- `ProveedorIdentidad` va en `infrastructure/supabase/supabase-admin.proveedor.ts`. Un fallo de Supabase da `IdentidadNoDisponibleError` (503) y no deja nada escrito en la base.
- `ProveedorIdentidadFalso` en `test/support/` registra llamadas y crea la fila en `auth.users` simulada (inserta `seg.usuario` directo).
- `BitacoraSeguridad.registrar` acepta además `ASIGNACION_REVOCADA`.

### Casos de uso: puntos no obvios

**`InvitarUsuario(comando)`** — comando: `{ correo, nombre, rolId | perfilId, alcance, empresaId, sucursalId, unidadId, vigenteHasta?, otorgante: { usuarioId, mfaVigente } }`.

1. Normaliza el correo (`lower`, `trim`) y valida nombre (3-150).
2. Valida la asignación con `Asignacion.otorgar` (TR-RN-008) y resuelve el `Ambito` con `UbicacionesOrg`.
3. Otorgante: propietario pasa; si no, `cubre(otorgante, destino)` o `AlcanceSuperiorError` (TR-CA-026). Rol con permiso sensible y `!mfaVigente`: `MfaRequeridaError`.
4. Límite (TR-RN-006): por cada producto del rol o de los roles del perfil, salvo `PLAT`, `usados + 1 > limite` lanza `LimiteUsuariosError`. `null` es sin límite. Si el usuario ya cuenta para ese producto, no suma.
5. Membresía existente del usuario en el tenant: `INVITADO` reinvita (anula la invitación pendiente), `FINALIZADO` reinvita, `ACTIVO` o `SUSPENDIDO` lanza `MembresiaExistenteError`.
6. Identidad, **antes** de abrir la transacción:
   - Correo sin `seg.usuario`: `ProveedorIdentidad.invitar` (crea `auth.users`; el trigger crea `seg.usuario`). Luego, en la transacción, `marcarInterno`.
   - Correo existente: no se crea usuario (TR-CA-027). El correo sale en el paso 8.
7. Transacción: membresía, asignación, invitación (`expira_en = ahora + SEG_INVITACION_HORAS`), eventos `membresia.invitada` y `asignacion.otorgada` en el outbox.
8. Después del commit, para usuario existente: `ProveedorIdentidad.enviarEnlace`. Si falla, la invitación queda y la respuesta lo indica (`correo_enviado: false`); se reenvía invitando otra vez.
9. `redirectTo = ${SEG_URL_INVITACION}?token=<token>`.

**`ConsultarInvitacion(token)`**: devuelve `{ estado, tenant_nombre, expira_en }`. No devuelve el correo. `EXPIRADA` da `InvitacionExpiradaError` (410) con el mensaje de TR-CA-029.

**`AceptarInvitacion({ token, principal })`**:

1. `porToken`; no existe → 404. Fija `TenantContext` con el tenant de la invitación.
2. Estado `EXPIRADA` → 410; `USADA` o `ANULADA` → 409.
3. `principal.usuarioId !== membresia.usuarioId` → `InvitacionOtroCorreoError` y nada cambia (TR-CA-030).
4. Transacción: `invitacion.usar`, `membresia.aceptar`, `seg.usuario.tenant_preferido = tenant`, bitácora `ASIGNACION_OTORGADA` (`detalle.origen = 'INVITACION'`), evento `membresia.aceptada`.
5. Respuesta `{ tenant_id, membresia_id, refrescar_sesion: true }`. El cliente hace `refreshSession()` y el hook pone `tenant_id`.

**`SuspenderMembresia` / `FinalizarMembresia` / `ReactivarMembresia({ membresiaId, motivo, confirmar, actor })`**:

1. `confirmar !== true` → `ConfirmacionRequeridaError`. Motivo de 4 a 300.
2. Alcance del actor: propietario pasa; si no, debe `cubrir` cada asignación vigente de la membresía destino.
3. TR-RN-010: si el destino es propietario `ACTIVO` y la acción lo saca de `ACTIVO`, `propietariosActivosParaActualizar()` bloquea las filas; si queda en 0, `PropietarioUnicoError`. Aplica también a uno mismo (TR-CA-040).
4. Finalizar revoca en la misma transacción las asignaciones no revocadas (motivo de la finalización) y anula la invitación pendiente. Así un reingreso no revive accesos viejos.
5. Bitácora: `ASIGNACION_REVOCADA` con `{ accion, motivo, membresia_id }` para suspender y finalizar; `ASIGNACION_OTORGADA` con `{ accion: 'REACTIVAR', motivo }` para reactivar.

**`RevocarAsignacion({ asignacionId, motivo, confirmar, actor })`**: mismos pasos 1 y 2 sobre esa asignación; `revocar`; bitácora `ASIGNACION_REVOCADA`; evento `asignacion.revocada`. No toca la membresía.

El efecto sobre el usuario (TR-CA-039): el commit sube `vt`, toda ruta con `@Permiso` le responde 403 desde la siguiente petición. En el siguiente refresh (≤ 900 s) el hook ya no le pone ese `tenant_id`. Sus otros tenants no se tocan.

### Eventos (outbox, `schema_version = 1`, esquemas en `infrastructure/event-schemas.ts`)

| `event_type` | `aggregate_type` | Payload |
| --- | --- | --- |
| `membresia.invitada` | `membresia` | `usuario_id`, `invitado_por`, `reinvitacion` (bool), `expira_en` |
| `membresia.aceptada` | `membresia` | `usuario_id` |
| `membresia.suspendida` | `membresia` | `usuario_id`, `motivo`, `por` |
| `membresia.reactivada` | `membresia` | `usuario_id`, `motivo`, `por` |
| `membresia.finalizada` | `membresia` | `usuario_id`, `motivo`, `por`, `asignaciones_revocadas[]` |
| `asignacion.revocada` | `asignacion` | `membresia_id`, `motivo`, `por` |
| `asignacion.otorgada` | `asignacion` | sin cambios (spec 06) |

Ningún payload lleva correo ni nombre (TR-RNF-026).

### Permisos (manifiesto PLAT `1.1.0` y `PERMISOS_SEG`)

| Código | `alcance_minimo` | `sensible` | Rutas |
| --- | --- | --- | --- |
| `plat.usuario.invitar` | `SUCURSAL` | no | `POST /v1/seg/invitaciones` (MFA solo si el rol invitado trae un permiso sensible) |
| `plat.asignacion.revocar` | `SUCURSAL` | **sí** | suspender, reactivar, finalizar, revocar |

- Opción `plat.seguridad.usuarios` («Usuarios», `/admin/usuarios`, icono `person_add`, permisos `plat.usuario.invitar`).
- `PLAT_ADMIN_SEGURIDAD` suma ambos permisos.
- `publico.invitacion.aceptar` del SRS no se declara: no cumple `producto.recurso.accion` y las rutas de aceptar no llevan `@Permiso`.

### HTTP

| Método y ruta | Guardas | Cuerpo | Éxito |
| --- | --- | --- | --- |
| `POST /v1/seg/invitaciones` | `@Permiso('plat.usuario.invitar')` | `{ correo, nombre, rol_id?, perfil_id?, alcance, empresa_id?, sucursal_id?, unidad_id?, vigente_hasta? }` | 201 `{ membresia_id, invitacion_id, expira_en, usuario_nuevo, correo_enviado }` |
| `GET /v1/seg/invitaciones/{token}` | `@Publico`, throttler | — | 200 `{ estado: 'VIGENTE', tenant_nombre, expira_en }` |
| `POST /v1/seg/invitaciones/aceptar` | autenticado sin tenant, throttler | `{ token }` | 200 `{ tenant_id, membresia_id, refrescar_sesion: true }` |
| `POST /v1/seg/membresias/{id}/suspender` | `@Permiso('plat.asignacion.revocar')` | `{ motivo, confirmar: true }` | 200 `{ estado: 'SUSPENDIDO' }` |
| `POST /v1/seg/membresias/{id}/reactivar` | ídem | `{ motivo, confirmar: true }` | 200 `{ estado: 'ACTIVO' }` |
| `POST /v1/seg/membresias/{id}/finalizar` | ídem | `{ motivo, confirmar: true }` | 200 `{ estado: 'FINALIZADO', asignaciones_revocadas }` |
| `POST /v1/seg/asignaciones/{id}/revocar` | ídem | `{ motivo, confirmar: true }` | 200 `{ revocada_en }` |

- Errores con `{ codigo, mensaje }` según la tabla de errores. Un `id` de otro tenant da 404 (no se distingue de inexistente).
- Throttler: 10 peticiones por minuto por IP en las dos rutas de aceptar; 429 `{ codigo: 'DEMASIADAS_SOLICITUDES' }` con `Retry-After`. El token nunca va al log (la ruta se registra como `/v1/seg/invitaciones/:token`).
- OpenAPI: `@ApiBearerAuth()` salvo el `GET`, DTO de entrada con `class-validator` y de salida, y los códigos de error por ruta.

### Configuración

| Variable | Tipo | Uso |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` | cadena, requerida | Cliente Admin. Solo `apps/api`; nunca en el repo (regla 9) |
| `SEG_URL_INVITACION` | url, requerida | Página de aceptación (spec 14). Local: `http://127.0.0.1:4200/auth/invitacion` |
| `SEG_INVITACION_HORAS` | entero, por defecto 72 | Vigencia del token propio |

## Plan de implementación

1. **Migración.**
   - `db/01b_seg_membresias.sql`, su inverso y `db/tests/01b_seg_membresias.test.sql` (rol `seg_test_app`).
   - Casos: `FINALIZADO` aceptado; `ck_asig_revocacion`; una sola invitación pendiente por membresía; asignación revocada fuera de `permisos_efectivos` y `sucursales_accesibles`; revocar sube `vt`; `invitacion_por_token` devuelve la fila del hash sin `app.tenant_id` y 0 filas con otro hash; RLS de `seg.invitacion` entre dos tenants; sin borrado.
   - Verificar: `pnpm db:up && pnpm db:down && pnpm db:up` y `pnpm nx test migrar`.
2. **Dominio: membresía, invitación y revocación.**
   - `membresia.ts`, `invitacion.ts`, `revocar` en `asignacion.ts`, eventos y errores.
   - Pruebas: todas las transiciones válidas e inválidas; motivo de 3 y 301 caracteres; invitación a las 71 h (`VIGENTE`) y a las 80 h (`EXPIRADA`, TR-CA-029); usar dos veces; revocar dos veces.
   - Verificar: `pnpm nx test seguridad` y cobertura de `src/domain/**` ≥ 70 %.
3. **Repositorios.**
   - Adaptadores TypeORM de `RepositorioMembresias` (bloqueo optimista por `version` y `FOR UPDATE` de propietarios), `RepositorioInvitaciones`, `UsuariosIdentidad` y `LimitesPlan`. `MembresiasLectura` suma `FINALIZADO`.
   - Pruebas contra PostgreSQL temporal: `usados` cuenta `ACTIVO` + `INVITADO` vigente y no cuenta `INVITADO` vencido, `SUSPENDIDO`, `FINALIZADO` ni asignaciones revocadas.
   - Verificar: `pnpm nx test seguridad`.
4. **Proveedor de identidad.**
   - `@supabase/supabase-js@2.118.0`, puerto `ProveedorIdentidad`, `supabase-admin.proveedor.ts` (cliente con `autoRefreshToken: false`, `persistSession: false`) y `ProveedorIdentidadFalso`.
   - API de `inviteUserByEmail` y del magic link sin crear usuario (`shouldCreateUser: false`) consultada con context7 al implementar.
   - Prueba del adaptador contra el Supabase local (`supabase start`, Inbucket): invitar un correo nuevo crea `auth.users` y `seg.usuario`; un correo existente recibe el enlace y no se duplica.
   - Verificar: `pnpm nx test seguridad`.
5. **`InvitarUsuario`.**
   - Caso de uso, esquemas de eventos y `SUPABASE_SECRET_KEY`, `SEG_URL_INVITACION`, `SEG_INVITACION_HORAS` en `env.ts` y `.env.example`.
   - Pruebas con el proveedor falso: TR-CA-025 (límite 10 con 6 activos: `INVITADO`, invitación de 72 h y una llamada a `invitar`); TR-CA-026; TR-CA-027 (segunda membresía, un solo `seg.usuario`, llamada a `enviarEnlace`); límite alcanzado; reinvitar `INVITADO` anula el token anterior; reinvitar `FINALIZADO`; `ACTIVO` da `MEMBRESIA_EXISTENTE`; rol sensible sin MFA; Supabase caído no escribe nada; eventos en el outbox en la misma transacción.
   - Verificar: `pnpm nx test seguridad`.
6. **`ConsultarInvitacion` y `AceptarInvitacion`.**
   - Pruebas: TR-CA-028 (queda `ACTIVO`, `tenant_preferido` fijado y `mi-contexto` con el token refrescado da el menú del perfil «Cajero»); TR-CA-029 (80 h); TR-CA-030 (otro usuario, nada cambia); token usado; token anulado; bitácora `ASIGNACION_OTORGADA`.
   - Verificar: `pnpm nx test seguridad`.
7. **Suspender, reactivar, finalizar y revocar.**
   - Los cuatro casos de uso.
   - Pruebas: TR-CA-039 (Pedro con «Cese»: tras finalizar, `@Permiso` responde 403 en la siguiente petición y el hook no le pone el tenant); TR-CA-040 (Ana, única propietaria, se suspende a sí misma); dos propietarios en paralelo que se suspenden mutuamente: uno falla; sin `confirmar`; reactivar devuelve los permisos; finalizar revoca asignaciones y un reingreso no las revive; revocar una asignación deja las demás; actor sin alcance sobre la asignación.
   - Verificar: `pnpm nx test seguridad`.
8. **Controladores, throttler y manifiesto.**
   - `invitaciones.controller.ts`, `membresias.controller.ts`, DTO, `@nestjs/throttler@6.7.1` en `SeguridadModule`, manifiesto PLAT `1.1.0` y `PERMISOS_SEG`.
   - Pruebas supertest: cada fila de la tabla HTTP; 11.ª petición en un minuto da 429; `suspender` con MFA de 40 min da 401 `MFA_REQUERIDA`; `id` de otro tenant da 404; aplicar el manifiesto dos veces da 0 cambios la segunda.
   - Verificar: `pnpm nx run-many -t lint test build` con código 0 y las rutas en `/v1/docs`.
9. **Supabase local y nube, dev (manual).**
   - `supabase/config.toml`: `otp_expiry = 86400` y la URL de invitación en `additional_redirect_urls`.
   - Dev: `pnpm db:up:remoto`, `pnpm manifiesto:aplicar:remoto` del PLAT `1.1.0`, `SEG_URL_INVITACION` en la allowlist de redirect y Email OTP Expiration en 86400 en el panel. El usuario entrega `SUPABASE_SECRET_KEY` para `.env`.
   - Prueba de humo con la API local contra dev: invitar un correo real del usuario, recibir el correo, abrir el enlace, tomar `token` de la URL y el `access_token`, `POST /v1/seg/invitaciones/aceptar`, refrescar y ver `tenant_id` en el token y la membresía `ACTIVO`. Luego finalizar con motivo y comprobar 403. Borrar los datos de prueba.
   - Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**Invitar (TR-RF-009, TR-RN-006, TR-RN-008):**

- [ ] Con límite 10 y 6 activos, invitar a rosa.huaman@gmail.com con «Cajero» en «Miraflores» crea la membresía `INVITADO`, una invitación que expira en 72 h y llama una vez a `ProveedorIdentidad.invitar` (TR-CA-025).
- [ ] Un actor con alcance `SUCURSAL` en «Miraflores» que invita con alcance `TENANT` recibe 403 «No puede otorgar un alcance mayor al suyo» y no se escribe nada (TR-CA-026).
- [ ] Invitar a carlos.rojas@outlook.com, activo en «gym-norte», al tenant «gym-sur» crea una segunda membresía, no crea otro `seg.usuario` y envía el enlace sin crear usuario (TR-CA-027).
- [ ] Con 10 de 10 usuarios del producto, invitar responde 409 `LIMITE_USUARIOS`. Un `INVITADO` con invitación vencida no cuenta.
- [ ] Reinvitar un `INVITADO` deja una sola invitación pendiente; el token anterior responde 409.
- [ ] Invitar a un `ACTIVO` responde 409 `MEMBRESIA_EXISTENTE`.
- [ ] Un usuario nuevo creado por invitación queda con `seg.usuario.tipo = 'INTERNO'`. Uno existente conserva su tipo.
- [ ] Si Supabase falla, la respuesta es 503 y no hay membresía, asignación, invitación ni evento.
- [ ] `membresia.invitada` y `asignacion.otorgada` entran al outbox en la misma transacción.

**Aceptar (TR-RF-010):**

- [ ] rosa.huaman@gmail.com acepta con su token y su sesión: la membresía queda `ACTIVO`, `tenant_preferido` es el tenant y, tras refrescar, `mi-contexto` devuelve el menú del perfil «Cajero» (TR-CA-028).
- [ ] Con una invitación emitida hace 80 h, `GET` y `POST aceptar` responden 410 «La invitación expiró; solicite una nueva al administrador» (TR-CA-029).
- [ ] Con la sesión de rosa.h@hotmail.com, aceptar responde 403 «Esta invitación pertenece a otro correo» y la membresía sigue `INVITADO` (TR-CA-030).
- [ ] Aceptar dos veces el mismo token responde 409 la segunda vez.
- [ ] La aceptación deja `ASIGNACION_OTORGADA` en `seg.evento_seguridad` y `membresia.aceptada` en el outbox.
- [ ] La 11.ª petición en un minuto desde la misma IP a una ruta de aceptar responde 429.
- [ ] Ningún log contiene el token ni el correo.

**Revocar, suspender y finalizar (TR-RF-014, TR-RN-010, TR-RNF-021):**

- [ ] Finalizar la membresía `ACTIVO` de Pedro Salazar con motivo «Cese» deja `FINALIZADO` con `hasta`, revoca sus asignaciones, su siguiente petición con `@Permiso` responde 403 y el hook no le pone ese `tenant_id` (TR-CA-039).
- [ ] Ana Torres, única propietaria, al suspenderse a sí misma recibe 409 «El tenant debe tener al menos un propietario activo» (TR-CA-040).
- [ ] Dos propietarios que se suspenden mutuamente en paralelo dejan al menos uno `ACTIVO`.
- [ ] Sin `confirmar: true` o con motivo de menos de 4 caracteres, la acción responde 400 y no cambia nada.
- [ ] Reactivar un `SUSPENDIDO` le devuelve los permisos en la siguiente resolución.
- [ ] Revocar una asignación quita solo sus permisos y deja `ASIGNACION_REVOCADA` con motivo y actor.
- [ ] Suspender con MFA de hace 40 min responde 401 `MFA_REQUERIDA`.
- [ ] Finalizar en el tenant A no cambia la membresía ni los permisos del mismo usuario en el tenant B.

**Migraciones, límites y calidad:**

- [ ] `pnpm db:up && pnpm db:down && pnpm db:up` termina con 0 y `db:down` deja `seg` como lo dejó el spec 06.
- [ ] Desde el tenant A, con `seg_test_app`, no se lee ninguna fila de `seg.invitacion` de B.
- [ ] `src/domain` no importa `@nestjs/*`, `typeorm`, `ioredis`, `jose` ni `@supabase/*`, y `@supabase/supabase-js` solo aparece en `infrastructure/supabase/`.
- [ ] Cobertura de líneas de `src/domain/**` ≥ 70 %.
- [ ] Las 7 rutas figuran en `/v1/docs` con sus códigos de error.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.

**Nube (verificación manual, evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] En dev, `01b_seg_membresias.sql` está aplicada y el manifiesto PLAT `1.1.0` figura en `seg.manifiesto_aplicado`.
- [ ] En dev, un correo real recibe la invitación, la acepta y el token refrescado trae `tenant_id`.
- [ ] En dev, tras finalizar esa membresía, la API responde 403 y los datos de prueba se borran.
- [ ] Las horas reales de S-04 quedan registradas en el plan.

## Decisiones

- **Sí:** número 08 y el 07 vacío. Decisión del usuario: coincide con el roadmap y con `docs/spec-context/08`.
- **Sí:** token propio de 72 h (hash en `seg.invitacion`) en el `redirectTo`, con el correo de Supabase. Decisión del usuario. Supabase no pasa de 24 h razonables y no invita correos existentes.
- **Sí:** `inviteUserByEmail` para correos nuevos y magic link sin crear usuario para existentes. Cubre TR-CA-027 sin correo propio.
- **No:** Resend o TR-NOT ahora. Es R2; el puerto queda listo para cambiar el envío.
- **Sí:** si vence el enlace de Supabase pero no el token, el invitado ingresa normal y acepta. El token manda los 72 h.
- **Sí:** estado `FINALIZADO` con `motivo`, `cambiado_por`, `cambiado_en`; suspender es reversible y finalizar es terminal para esa etapa. Decisión del usuario.
- **Sí:** revocar una asignación con `revocada_en` y motivo. `vigente_hasta = ayer` rompe `ck_asig_vigencia` si empezó hoy y perdería la fecha original.
- **Sí:** finalizar revoca todas las asignaciones de la membresía. Un reingreso no debe revivir accesos viejos.
- **Sí:** reinvitar según estado (`INVITADO` reenvía, `FINALIZADO` reingresa, `ACTIVO`/`SUSPENDIDO` rechaza). Decisión del usuario. `UNIQUE(usuario_id, tenant_id)` se mantiene.
- **No:** cerrar sesiones en Supabase. Decisión del usuario. `auth.admin.signOut` pide el JWT del usuario, y cerrar todo lo sacaría de sus otros tenants. El efecto lo dan la versión de seguridad (al commit) y el hook (al refresh, ≤ 900 s). Desviación del SRS (RF-014 paso 4) documentada.
- **Sí:** endpoints de las 7 operaciones con OpenAPI en este spec. Decisión del usuario. El spec 16 solo consume.
- **Sí:** límite por producto: `ACTIVO` + `INVITADO` vigente con asignación vigente del producto contra `limite_usuarios`; `PLAT` y `NULL` sin límite. Decisión del usuario. No hay GWT en el SRS; lo cubre un criterio propio.
- **Sí:** `plat.usuario.invitar` no sensible y `plat.asignacion.revocar` sensible para suspender, reactivar, finalizar y revocar. Decisión del usuario. Invitar con un rol sensible exige MFA en el caso de uso, como `OtorgarAsignacion`.
- **No:** declarar `publico.invitacion.aceptar`. No cumple el formato; el `GET` es `@Publico` y el `POST` solo autenticado.
- **Sí:** `POST aceptar` autenticado y sin tenant, comparando `sub` con `membresia.usuario_id`. La invitación nació ligada al usuario de ese correo; otro correo es otro `sub` (TR-CA-030). Supabase confirma el correo al usar el enlace.
- **Sí:** `seg.invitacion_por_token` `SECURITY DEFINER` como única lectura sin tenant. El invitado no tiene `tenant_id` en el token; la función solo devuelve la fila del hash.
- **Sí:** throttler de `@nestjs/throttler` en memoria, 10/min por IP, solo en rutas de aceptar. Decisión del usuario. Una instancia en R1.
- **Sí:** bitácora con los tipos del SQL: `ASIGNACION_OTORGADA` al aceptar y reactivar, `ASIGNACION_REVOCADA` al suspender, finalizar y revocar, con `accion` y `motivo` en `detalle`. Al invitar no se escribe `ASIGNACION_OTORGADA`: el acceso empieza al aceptar (SRS RF-010).
- **Sí:** TR-RN-010 en el caso de uso con `SELECT ... FOR UPDATE` de propietarios activos, sin trigger. Cubre la carrera de dos propietarios.
- **Sí:** el actor de suspender, reactivar o finalizar debe cubrir todas las asignaciones vigentes del destino, salvo que sea propietario. Un admin de sucursal no saca a alguien con alcance de empresa.
- **Sí:** Supabase se llama antes de la transacción al crear usuario y después del commit al enviar el enlace. Un `auth.users` huérfano por un fallo posterior se reutiliza en el siguiente intento.
- **Sí:** `seg.usuario.tipo = 'INTERNO'` lo fija el caso de uso solo para usuarios creados por la invitación. El hook lee `seg.usuario.tipo`; no hace falta `app_metadata`.
- **Sí:** `otp_expiry = 86400`. Más tiempo para el enlace de Supabase sin pasar el máximo recomendado.
- **Sí:** motivo de 4 a 300 caracteres, no de 5. Decisión del usuario al implementar el paso 2: TR-CA-039 usa «Cese» (4) y el SRS choca con su propio TR-RF-014.
- **Sí:** sin Supabase ni PostgreSQL locales. Decisión del usuario al implementar el paso 2 (memoria de la laptop). Las pruebas de integración solo corren con `TEST_DATABASE_URL` (CI con PostgreSQL 16); en local se saltan. Cada migración se aplica y verifica en dev con `db:up:remoto` y el MCP. El adaptador del paso 4 se prueba contra un Auth simulado por HTTP (supabase-js real, sin red); el envío real de correos se prueba en dev en el paso 9.
- **Sí:** un solo spec de 11-13 h. Decisión del usuario; mismo criterio que el 06.
- **Sí:** prueba de humo en dev con correo real. Decisión del usuario. La secret key se pide al implementar el paso 9.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El SMTP por defecto de Supabase tiene un límite muy bajo de correos por hora | Suficiente para dev. Para staging y prod, SMTP propio en el panel (Resend ya elegido); queda anotado en `docs/ops/supabase-ambientes.md`. |
| El JWT de un usuario finalizado sigue válido hasta 900 s en rutas sin `@Permiso` | Toda ruta de negocio lleva `@Permiso` (regla 5). Las excepciones (`mi-contexto`) no devuelven permisos sin membresía `ACTIVO`. |
| `inviteUserByEmail` crea el usuario y la transacción falla después | Reintentar invitando reutiliza el `seg.usuario` existente; el correo sale por magic link. |
| El token viaja en la URL y puede quedar en logs o historial | 32 bytes aleatorios, un solo uso, 72 h, solo el hash en la base y la ruta registrada sin el token. |
| Detrás de un proxy el throttler ve una sola IP | Configurar `trust proxy` en `apps/api` al desplegar staging (spec 21). |
| El nombre del CHECK de `estado` en `seg.membresia` es autogenerado | Se lee de `pg_constraint` al escribir la migración; la prueba de `db:down` lo cubre. |
| La API de `@supabase/supabase-js` 2.118 difiere de lo supuesto | Se consulta con context7 en el paso 4. El adaptador queda detrás de `ProveedorIdentidad`. |

## Lo que **no** está en este spec

- Pantalla de aceptar invitación y refresco de sesión en Angular (spec 14).
- UI de usuarios, listado de miembros e invitaciones (spec 16).
- Alta de tenant con propietario (spec 12).
- Correo propio por TR-NOT o Resend (R2).
- Cierre de sesiones en Supabase.
- Soporte y TR-RN-011 (spec 18), auditoría TR-AUD (spec 20), handlers del outbox (spec 11).
- Throttler en Redis y `trust proxy` (spec 21).
- Prod (plan de migración a producción).

Cada uno entra en su propio spec cuando su sprint lo pida.
