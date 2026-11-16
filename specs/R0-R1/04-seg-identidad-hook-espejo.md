# SPEC 04 — Identidad: esquema seg, espejo de auth.users y hook de token

> **Status:** Implementado
> **Depends on:** SPEC 02, SPEC 03
> **Date:** 2026-10-19
> **Objective:** Crear el esquema `seg` corregido y la migración de Supabase que replica `auth.users` en `seg.usuario` y agrega `tenant_id` y `tipo_usuario` al token con el hook de Supabase Auth, en dev.

## Por qué existe este spec

Fila 04 de `docs/roadmap-specs.md` (versión 2): A-02 (3 h) y A-03 (3 h), más la creación de `seg` (unas 2-3 h), en total unas 8-9 h. El verificador JWKS, el guard, `@Publico` y la exigencia de aal2 con 15 min (A-01, A-05, TR-RF-017) son el spec 05. Contexto de apoyo: `docs/spec-context/04-seg-autenticacion-back.md`, escrito antes de la partición. Sus secciones 1 y 9 quedan superadas por este spec.

PL-10 pone `K → ORG → SEG`. El hook necesita `seg.usuario`, `seg.membresia` y `org.tenant`, y el spec 06 (que traía `01b_seg.sql`) depende de este. Por eso `01b_seg.sql` se adelanta aquí. Decisión del usuario.

Cubre la **parte de identidad de TR-RF-010**: el `sub` del IdP es `seg.usuario.id`, el correo queda normalizado y el token lleva el tenant de una membresía activa. La invitación, su vigencia y la activación de la membresía son del spec 08. A-02 figura en el plan con TR-RF-015, pero aquí no se cubre ningún criterio de ese RF (spec 07).

Criterios del SRS: este spec **no cierra** TR-CA-028, 029 ni 030 (necesitan invitación, asignación y menú; se cierran en el 08). Prueba solo la parte de token: con una membresía `ACTIVO` el token trae su `tenant_id`.

RNF propios: **TR-RNF-010** (aislamiento: RLS forzada en `seg`), **TR-RNF-011** (la secret key no aparece; las funciones son `SECURITY DEFINER` con `search_path` vacío), **TR-RNF-009** (parte: autenticación solo en el IdP y registro abierto cerrado).
RNF heredados: 012, 024/119, 026 (el hook no registra el correo).

Historias del backlog: **A-02** y **A-03**.

## Alcance

**In:**

- **Migración** `db/01b_seg.sql` con su inverso `db/rollback/01b_seg.sql`: las 13 tablas de `codigo/db/01b_seg.sql` con las correcciones de "Base de código reutilizada". Prueba SQL `db/tests/01b_seg.test.sql`.
- **Migración de Supabase** `supabase/migrations/20261102000000_seg_supabase_auth.sql` con su inverso `supabase/migrations/rollback/20261102000000_seg_supabase_auth.sql`: espejo `auth.users → seg.usuario` (alta y cambio de correo), `seg.tenant_para_token`, `seg.custom_access_token_hook`, `GRANT` y `REVOKE`.
- **Simulación de Supabase para CI** en `tools/migrar/test/fixtures/simular-supabase.sql`: roles `anon`, `authenticated` y `supabase_auth_admin`, y `auth.users` con las columnas que usa el espejo (`email` nulo, `phone`, `is_anonymous NOT NULL`, `raw_app_meta_data`, `raw_user_meta_data`).
- **Prueba SQL** `supabase/tests/seg_supabase_auth.test.sql`. La ejecuta `tools/migrar/test/db-esquemas.test.mjs`, que se extiende para aplicar `db/`, la simulación y `supabase/migrations`, y para bajarlos.
- **Scripts** `db:up:supabase`, `db:down:supabase`, `db:up:supabase:remoto`, `db:down:supabase:remoto` en `package.json` (runner `tools/migrar` con `supabase/migrations`).
- **`supabase/config.toml`**: `enable_signup = false`, `[auth.hook.custom_access_token]` activado con `pg-functions://postgres/seg/custom_access_token_hook` y `[db.migrations] enabled = false`.
- **Runner `tools/migrar`**: `bajar` revierte solo las migraciones de la carpeta indicada (`db/` y `supabase/migrations` comparten la tabla de registro), con su prueba.
- **Nube (manual, dev)**: aplicar `01b_seg.sql` y la migración de Supabase, activar el hook y desactivar el registro abierto en el panel, y hacer una prueba de humo con un token real. Evidencia en `docs/ops/supabase-ambientes.md`.
- Actualizar `docs/roadmap-specs.md`: la fila 06 deja de corregir `01b_seg.sql`; las funciones de permisos pasan a la 07.

**Out of scope (para otros specs):**

- Verificador JWKS, `AutenticacionGuard`, `@Publico`, aal2, antigüedad de 15 min, 401 step-up y `ultimo_acceso` (spec 05, A-01, A-05, TR-RF-017).
- Lib `libs/plataforma/seguridad` y cualquier código TypeScript. Nace en el spec 05.
- Funciones `seg.permisos_efectivos`, `seg.menu_usuario` y `seg.sucursales_accesibles` (spec 07, S-02). Se reescriben con `SECURITY DEFINER` y `search_path` fijo.
- Dominio de permiso, rol, perfil, asignación y manifiesto. Columnas `version` en esas tablas (spec 06).
- Invitar, aceptar, revocar y suspender membresías; vigencia de la invitación; `tenant_preferido` al aceptar; evento `ASIGNACION_OTORGADA` (spec 08, TR-RF-010 completo, TR-CA-028 a 030).
- Claim de versión de permisos en el token (descartado, ver Decisiones).
- Replicar el borrado de `auth.users` en `seg.usuario`. La baja de usuario es del spec 08.
- Bloqueo tras 5 intentos, expiración por inactividad y límites de tasa de Auth (TR-RNF-009, 014 y 015): configuración del panel, se revisa con el spec 05.
- MFA TOTP en el panel y en `config.toml` (spec 05 y spec 14).
- Registro de eventos en `seg.evento_seguridad` (la tabla se crea; la escriben los specs 05, 07 y 18).
- Proyecto prod: migraciones y configuración del panel van al plan de migración a producción.

## Base de código reutilizada

Fuente: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/codigo/`.

**Se conserva de `db/01b_seg.sql`:**

- Esquema `seg` y las 13 tablas: `producto`, `modulo`, `opcion`, `permiso`, `opcion_permiso`, `rol`, `rol_permiso`, `perfil`, `perfil_rol`, `usuario`, `membresia`, `asignacion`, `evento_seguridad`.
- `permiso.sensible`, `alcance_minimo`, `ux_rol_codigo` y `ux_perfil_codigo` (`tenant_id` nulo = predefinido).
- `ck_asig_rol_o_perfil` y `ck_asig_alcance` (TR-RN-008), `ix_asignacion_membresia`.
- `UNIQUE (usuario_id, tenant_id)` en membresía y los estados `INVITADO|ACTIVO|SUSPENDIDO`, `ACTIVO|BLOQUEADO|BAJA`, `INTERNO|EXTERNO|SOPORTE`.

**Cambia en `db/01b_seg.sql`:**

- Archivo reversible con su inverso en `db/rollback/`. La cabecera dice PostgreSQL 16 y Supabase Auth (sin Keycloak).
- Se quitan las tres funciones de permisos (ver "Out of scope").
- `seg.usuario`: `email varchar(255)` (el largo de `auth.users`) con `CHECK (email = lower(email))`; `tipo` y `estado` sin default (el espejo siempre los fija); columnas `tenant_preferido uuid NULL REFERENCES org.tenant (id)` y `creado_en timestamptz NOT NULL DEFAULT now()`, que la migración base agregaba con `ALTER`.
- `seg.membresia`: `UNIQUE (tenant_id, id)` para FK compuestas; `CHECK (hasta IS NULL OR hasta > desde)`.
- `seg.asignacion`: columna nueva `tenant_id uuid NOT NULL` y FK compuestas `(tenant_id, membresia_id)` a `seg.membresia`, `(tenant_id, empresa_id)` a `org.empresa`, `(tenant_id, sucursal_id)` a `org.sucursal` y `(tenant_id, unidad_id)` a `org.unidad_operativa`, en lugar de las FK simples. `CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)` (TR-RN-008, `hasta` no anterior a `desde`).
- `seg.evento_seguridad.tenant_id` con FK a `org.tenant`.
- Trigger por sentencia `seg.sin_borrado` en `rol`, `perfil`, `membresia` y `asignacion` (`DELETE`) y en `evento_seguridad` (`UPDATE` y `DELETE`): sin política de `DELETE` la sentencia afectaría 0 filas sin error. Mismo patrón que `org.sin_borrado`.
- Ids sin default en SQL (los generará `IdGenerator`, UUID v7), salvo `evento_seguridad.id`, que sigue `bigserial`.
- RLS (`ENABLE` y `FORCE`) y políticas por operación con `current_setting('app.tenant_id', true)::uuid`:

  | Tabla | `SELECT` | `INSERT` / `UPDATE` | `DELETE` |
  | --- | --- | --- | --- |
  | `membresia`, `asignacion` | `tenant_id = app` | `tenant_id = app` | no |
  | `rol`, `perfil` | `tenant_id IS NULL OR tenant_id = app` | `tenant_id = app` | no |
  | `rol_permiso`, `perfil_rol` | `EXISTS` sobre el rol o perfil visible | `EXISTS` sobre un rol o perfil del tenant | sí, mismo `EXISTS` |
  | `evento_seguridad` | `tenant_id = app` | `INSERT` con `tenant_id = app`; sin `UPDATE` | no |

- Sin RLS, por no ser datos de un tenant: el catálogo (`producto`, `modulo`, `opcion`, `permiso`, `opcion_permiso`) y `usuario` (identidad global; un usuario tiene varias membresías).
- `REVOKE ALL` sobre esquema, tablas, secuencias y funciones de `seg` a `anon, authenticated`, en el bloque `DO` que comprueba que existan (patrón de `01a_org.sql`).

**Se conserva de `supabase/migrations/20261102000000_seg_supabase_auth.sql`:**

- `seg.tenant_para_token` y `seg.custom_access_token_hook` sin cambios de lógica: tenant preferido si su membresía y su tenant siguen activos, si no la membresía activa más reciente; tenant en `PRUEBA` o `ACTIVO`; membresía `ACTIVO` y `hasta` futuro o nulo; usuario no `ACTIVO` recibe `tenant_id` nulo; tipo por defecto `EXTERNO`.
- Funciones `SECURITY DEFINER` con `search_path = ''`.
- `tipo` solo desde `raw_app_meta_data`; `raw_user_meta_data` solo da el nombre.
- `ON CONFLICT (id) DO NOTHING` en el alta (reimportar con el mismo UUID, CC-10).
- `GRANT` del hook y de `tenant_para_token` solo a `supabase_auth_admin`; `REVOKE` a `PUBLIC, anon, authenticated`.

**Cambia en la migración de Supabase:**

- Sin el `ALTER TABLE seg.usuario` (las columnas nacen en `01b_seg.sql`) ni el `REVOKE` de esquemas (lo hacen `01a` y `01b`).
- Función auxiliar `seg.fn_auth_espejar_usuario(id, email, app_meta, user_meta)` con el alta, que usan los dos triggers; `EXECUTE` revocado a `PUBLIC, anon, authenticated`.
- `fn_auth_usuario_creado`: si `NEW.is_anonymous` o `NEW.email IS NULL`, no crea fila. Si el correo ya existe en `seg.usuario` con otro id, lanza `unique_violation` (23505) con el mensaje `seg.usuario: el correo ya pertenece a otro usuario` y el alta en Auth se revierte.
- `fn_auth_usuario_correo`: si el correo nuevo es nulo, no toca la fila. Si no existe fila (usuario creado sin correo que luego lo agrega), la crea con las mismas reglas del alta. El correo duplicado falla igual que en el alta.
- Inverso: `DROP TRIGGER` de los dos triggers en `auth.users`, `DROP FUNCTION` de las cinco funciones y `REVOKE USAGE ON SCHEMA seg FROM supabase_auth_admin`.

**De `supabase/tests/99_pruebas_auth.sql`** se conservan los casos 1.1 a 6.1, reescritos en `supabase/tests/seg_supabase_auth.test.sql` con el patrón de `db/tests/01a_org.test.sql` (bloques `DO` que lanzan excepción). `correr_pruebas.sh` no se usa: el orden lo da `db-esquemas.test.mjs`.

## Modelo de datos

### `seg.usuario` (identidad, global)

```sql
CREATE TABLE seg.usuario (
  id               uuid         PRIMARY KEY,                -- = auth.users.id (sub)
  email            varchar(255) NOT NULL UNIQUE CHECK (email = lower(email)),
  nombre           varchar(150) NOT NULL,
  tipo             varchar(10)  NOT NULL CHECK (tipo IN ('INTERNO', 'EXTERNO', 'SOPORTE')),
  estado           varchar(12)  NOT NULL CHECK (estado IN ('ACTIVO', 'BLOQUEADO', 'BAJA')),
  ultimo_acceso    timestamptz  NULL,                       -- lo escribe el spec 05
  tenant_preferido uuid         NULL REFERENCES org.tenant (id),
  creado_en        timestamptz  NOT NULL DEFAULT now()
);
```

### `seg.membresia` y `seg.asignacion` (por tenant)

```sql
CREATE TABLE seg.membresia (
  id             uuid        PRIMARY KEY,
  usuario_id     uuid        NOT NULL REFERENCES seg.usuario (id),
  tenant_id      uuid        NOT NULL REFERENCES org.tenant (id),
  estado         varchar(12) NOT NULL DEFAULT 'INVITADO' CHECK (estado IN ('INVITADO', 'ACTIVO', 'SUSPENDIDO')),
  es_propietario boolean     NOT NULL DEFAULT false,
  invitado_por   uuid        NULL REFERENCES seg.usuario (id),
  desde          timestamptz NOT NULL DEFAULT now(),
  hasta          timestamptz NULL CHECK (hasta IS NULL OR hasta > desde),
  UNIQUE (usuario_id, tenant_id),
  UNIQUE (tenant_id, id)
);

-- asignacion: columnas de 01b + tenant_id NOT NULL;
--   FOREIGN KEY (tenant_id, membresia_id) REFERENCES seg.membresia (tenant_id, id) ON DELETE CASCADE
--   FOREIGN KEY (tenant_id, empresa_id)   REFERENCES org.empresa (tenant_id, id)
--   FOREIGN KEY (tenant_id, sucursal_id)  REFERENCES org.sucursal (tenant_id, id)
--   FOREIGN KEY (tenant_id, unidad_id)    REFERENCES org.unidad_operativa (tenant_id, id)
--   CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
```

El resto de las tablas conserva las columnas de `01b` (ver "Base de código reutilizada").

Rollback de `db/01b_seg.sql`: `DROP SCHEMA seg CASCADE`. El de Supabase va antes: `db:down:supabase` y luego `db:down`.

### Token emitido por Supabase Auth

Claims que agrega el hook, en el primer nivel (ADR-32):

| Claim | Valor |
| --- | --- |
| `tenant_id` | uuid de `seg.tenant_para_token(sub)`, o `null` si el usuario no está `ACTIVO`, no tiene membresía `ACTIVO` vigente o su tenant no está en `PRUEBA`/`ACTIVO` |
| `tipo_usuario` | `seg.usuario.tipo`, o `EXTERNO` si no hay fila |

Los demás claims de Supabase (`sub`, `aal`, `amr`, `session_id`, `role`, `exp`, ...) quedan intactos.

### Eventos y permisos

Sin eventos de dominio: el espejo y el hook corren dentro de Supabase Auth, sin `TenantContext` ni outbox. Sin permisos ni endpoints.

## Plan de implementación

1. **`db/01b_seg.sql`**, su inverso y `db/tests/01b_seg.test.sql`, con un rol sin `BYPASSRLS` (`seg_test_app`): aislamiento entre dos tenants en `membresia`, `asignacion`, `rol`, `perfil`, `rol_permiso`, `perfil_rol` y `evento_seguridad`; rol predefinido visible desde ambos tenants y no editable; `DELETE` falla en `membresia` y `asignacion`; asignación con membresía, sucursal o unidad de otro tenant falla por FK; `ck_asig_rol_o_perfil`, `ck_asig_alcance` y vigencia invertida fallan; correo en mayúsculas falla. Agregar el caso a `db-esquemas.test.mjs` y `seg_test_app` al borrado de roles. Verificar: `pnpm db:up && pnpm db:down && pnpm db:up` y `pnpm nx test migrar`.
2. **Simulación y espejo**: `tools/migrar/test/fixtures/simular-supabase.sql`; migración de Supabase con las dos funciones del espejo, los triggers y su inverso; `db-esquemas.test.mjs` aplica `db/`, la simulación y `supabase/migrations`. Pruebas de los casos 1 y 2 y de los nuevos (anónimo, sin correo, correo duplicado en alta y en cambio, alta posterior del correo). Verificar: `pnpm nx test migrar`.
3. **Hook y privilegios**: `seg.tenant_para_token`, `seg.custom_access_token_hook`, `GRANT` y `REVOKE`. Pruebas de los casos 3 a 6 (sin membresías, preferido, más reciente, suspendido, vencido, usuario bloqueado, privilegios, ejecución como `supabase_auth_admin`). Verificar: `pnpm nx test migrar`.
4. **Ida y vuelta y scripts**: la prueba baja `supabase/migrations` y `db/`, y vuelve a subir ambos; scripts `db:*:supabase` en `package.json`. Verificar: `pnpm nx test migrar` y `pnpm nx run-many -t lint test build` con código 0.
5. **`supabase/config.toml`**: `enable_signup = false` en `[auth]`, bloque `[auth.hook.custom_access_token]` y `[db.migrations] enabled = false` (con volumen nuevo el CLI aplicaba `supabase/migrations` y fallaba sin `seg`; ver Riesgos). Verificar: `pnpm supabase:start` levanta sin errores.
6. **Nube, dev (manual)**: `pnpm db:up:remoto` (aplica `01b_seg.sql`) y `pnpm db:up:supabase:remoto`; en el panel, Authentication → Hooks → Custom Access Token con `seg.custom_access_token_hook` y registro abierto desactivado. Prueba de humo: crear un usuario desde el panel, comprobar su fila en `seg.usuario`, iniciar sesión y decodificar el token (`tipo_usuario = EXTERNO`, `tenant_id = null`); insertar con la conexión de migración una membresía `ACTIVO` en un tenant `ACTIVO`, refrescar la sesión y ver ese `tenant_id`; borrar los datos de prueba. Evidencia en `docs/ops/supabase-ambientes.md`.
7. **Roadmap**: actualizar `docs/roadmap-specs.md` (filas 04, 06 y 07). Prod queda para el plan de migración a producción.

## Criterios de aceptación

**Esquema seg (TR-RNF-010, TR-RN-008):**

- [ ] Con un rol sin `BYPASSRLS`, desde el tenant A no se lee ni se escribe ninguna fila del tenant B en `membresia`, `asignacion`, `rol`, `perfil`, `rol_permiso`, `perfil_rol` y `evento_seguridad`.
- [ ] Un rol con `tenant_id` nulo se lee desde cualquier tenant y no se puede modificar con el rol de la aplicación.
- [ ] `DELETE` sobre `membresia` y `asignacion` falla para el rol de la aplicación.
- [ ] Una asignación cuya membresía, empresa, sucursal o unidad es de otro tenant falla por FK.
- [ ] Una asignación con rol y perfil, sin ninguno, con alcance incoherente o con `vigente_hasta < vigente_desde` falla.
- [ ] `anon` y `authenticated` no tienen `USAGE` sobre `seg` ni sobre `org` en dev (`has_schema_privilege`).
- [ ] `db/01b_seg.sql` no define `permisos_efectivos`, `menu_usuario` ni `sucursales_accesibles`.

**Espejo `auth.users → seg.usuario` (A-03, TR-RF-010 parte identidad):**

- [ ] Un alta en `auth.users` con correo `Rosa.Huaman@Gmail.com` crea `seg.usuario` con el mismo `id`, correo en minúsculas, `estado = ACTIVO` y nombre de `raw_user_meta_data.nombre` o, si falta, la parte local del correo.
- [ ] `raw_user_meta_data.tipo_usuario = 'SOPORTE'` no eleva el tipo: queda `EXTERNO`. `raw_app_meta_data.tipo_usuario = 'INTERNO'` sí lo fija.
- [ ] Un alta con `is_anonymous = true` o sin correo no crea fila y el alta en Auth no falla.
- [ ] Un alta con un correo que ya tiene otro usuario en `seg.usuario` falla con SQLSTATE 23505 y no deja fila en `auth.users`.
- [ ] Reinsertar en `seg.usuario` el mismo id (reimportación) no falla ni cambia la fila.
- [ ] Cambiar el correo en `auth.users` lo actualiza en `seg.usuario`; cambiarlo a uno de otro usuario falla con 23505; agregar correo a un usuario que no tenía crea su fila.

**Hook de token (A-02):**

- [ ] Sin membresías, el hook devuelve los claims de entrada intactos más `tenant_id = null` y `tipo_usuario`.
- [ ] Con membresías activas en A (antigua) y B (reciente), devuelve B; con `tenant_preferido = A`, devuelve A.
- [ ] No devuelve un tenant `SUSPENDIDO` o `BAJA`, una membresía `INVITADO` o `SUSPENDIDO`, ni una membresía con `hasta` pasado.
- [ ] Un usuario `BLOQUEADO` o `BAJA` recibe `tenant_id = null`.
- [ ] Ejecutado como `supabase_auth_admin`, el hook funciona; `anon`, `authenticated` y `PUBLIC` no pueden ejecutar el hook ni `tenant_para_token`.
- [ ] El token no lleva otros claims nuevos (ni permisos ni versión de permisos).

**Migraciones (regla 6):**

- [ ] `pnpm db:up && pnpm db:down && pnpm db:up` termina con 0 contra PostgreSQL 16 y `db:down` deja la base sin `seg`.
- [ ] `pnpm nx test migrar` aplica `db/`, la simulación y `supabase/migrations`, corre las dos pruebas SQL, baja todo, vuelve a subir y termina en verde en CI.
- [ ] Bajar la migración de Supabase deja `auth.users` sin los triggers `trg_auth_usuario_creado` y `trg_auth_usuario_correo`.

**Nube (verificación manual, evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] En dev, un token real decodificado trae `tipo_usuario` y `tenant_id = null`; tras crear una membresía `ACTIVO` y refrescar la sesión, trae ese `tenant_id`.
- [ ] En dev el hook está activado en el panel y el registro abierto está desactivado (un `signUp` con la publishable key responde con error).
- [ ] En dev el MCP confirma las funciones, los triggers en `auth.users` y la RLS activa en las tablas de `seg` con `tenant_id`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.
- [ ] Las horas reales de A-02 y A-03 quedan registradas en el plan.

## Decisiones

- **Sí:** solo la fila 04 del roadmap (A-02, A-03). Decisión del usuario. Con el spec 05 suma 14 h, sobre el tope de 10.
- **Sí:** `01b_seg.sql` completo en este spec. Decisión del usuario. El hook necesita `seg.usuario` y `seg.membresia`, y el 06 depende de este; adelantar la tabla evita una dependencia circular.
- **Sí:** tablas corregidas y sin las funciones de permisos. Decisión del usuario. Las funciones no son `SECURITY DEFINER` ni fijan `search_path`, y su dueño natural es el spec 07 (S-02). El 06 agrega lo que su dominio necesite con una migración nueva.
- **Sí:** `tenant_id` en `seg.asignacion` con FK compuestas. Decisión del usuario. Mismo patrón que `org` en el spec 03: la base impide asignar recursos de otro tenant y la RLS no necesita joins.
- **Sí:** `rol_permiso` y `perfil_rol` con políticas `EXISTS` y `DELETE` permitido. Editar los permisos de un rol quita filas; las demás tablas no borran.
- **Sí:** catálogo y `seg.usuario` sin RLS. No son datos de un tenant; `REVOKE` a `anon` y `authenticated` los deja fuera de la Data API (regla 8).
- **No:** `version` en rol, perfil, membresía y asignación. Las agrega el spec que define cada agregado (06 y 08).
- **Sí:** el token solo lleva `tenant_id` y `tipo_usuario`. Decisión del usuario, ADR-32. El texto de A-02 ("versión de permisos") queda corregido: la invalidación va por evento y caché (spec 07).
- **Sí:** el hook y las migraciones de Supabase en `supabase/migrations`, con inverso en `supabase/migrations/rollback/` y aplicadas por `tools/migrar`. Decisión del usuario. Cumple la regla 6 y reutiliza el runner que exige el inverso.
- **Sí:** las columnas `tenant_preferido` y `creado_en` nacen en `01b_seg.sql`. Con el esquema propio, el `ALTER` de la migración base sobra y el inverso de Supabase queda limpio.
- **Sí:** anónimos y usuarios sin correo no crean fila; el correo duplicado aborta el alta en Auth. Decisión del usuario. Un usuario sin espejo es peor que un alta rechazada con un error claro.
- **Sí:** el cambio de correo crea la fila si no existía. Cubre al usuario que se dio de alta sin correo y lo agrega después.
- **No:** replicar el borrado de `auth.users`. La baja es un estado (`BAJA`) que gestiona el spec 08; borrar perdería la trazabilidad.
- **Sí:** registro abierto desactivado. Decisión del usuario. Las altas llegan por la Admin API (invitación, specs 08 y 12) o por la migración CC-10.
- **Sí:** sin código TypeScript. Decisión del usuario. La lib `seguridad` nace en el 05 con el verificador; `ultimo_acceso` lo escribe el 05.
- **Sí:** pruebas en PostgreSQL 16 con `auth.users` simulado en CI, más humo manual en dev. Decisión del usuario. `supabase start` en CI es lento; la simulación incluye `is_anonymous` y el correo nulo, que la simulación base no tenía.
- **Sí:** solo dev. Decisión del usuario al implementar: el proyecto prod no existe y su creación, migraciones y configuración van a un plan de migración a producción. Reemplaza la decisión inicial de cubrir dev y prod.
- **Sí:** `bajar` del runner acotado a su carpeta. Agregado al implementar el paso 2: `db/` y `supabase/migrations` comparten `migraciones._migraciones` y `bajar` exigía inverso para todo lo registrado.
- **Sí:** `seg.fn_auth_espejar_usuario` como función auxiliar. Agregada en el paso 2 para no duplicar el alta en los dos triggers.
- **Sí:** trigger `seg.sin_borrado`. Agregado en el paso 1 para que el criterio "DELETE falla" se cumpla; sin él el borrado afecta 0 filas sin error. Efecto lateral: el `ON DELETE CASCADE` de membresía a asignación también queda bloqueado.
- **Sí:** `[db.migrations] enabled = false` en `config.toml`. Confirmado en el paso 5 con un volumen nuevo: el CLI aplicaba la migración y fallaba con `schema "seg" does not exist`.
- **Sí:** funciones con dueño `postgres`. En Supabase ese rol tiene `BYPASSRLS` (comprobado con el MCP en dev), así que el hook lee membresías con RLS forzada sin `app.tenant_id`.
- **Sí:** sin eventos de outbox. El espejo y el hook corren en transacciones de Supabase Auth, fuera del UoW y sin tenant; `ASIGNACION_OTORGADA` es del spec 08.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Supabase CLI aplica `supabase/migrations` al hacer `supabase start` y falla porque la base local no tiene `org` ni `seg` | Ocurrió con volumen nuevo (paso 5). `[db.migrations] enabled = false` en `config.toml`; las migraciones las aplica siempre `tools/migrar`. |
| `postgres` pierde `BYPASSRLS` en un cambio de Supabase y el hook devuelve siempre `tenant_id = null` | La prueba de humo de dev lo detecta. Alternativa preparada: política de `SELECT` en `membresia` para el dueño de las funciones. |
| El trigger que aborta por correo duplicado bloquea la migración masiva CC-10 si hay correos repetidos | La migración de SazónPOS (spec 23) depura duplicados antes; el error identifica la causa. |
| `auth.users` simulado difiere del real y una prueba pasa en CI pero falla en Supabase | La simulación copia el nombre, tipo y nulabilidad de las columnas usadas (consultados en dev); el humo de dev lo confirma. |
| Bajar `db/` sin bajar antes `supabase/migrations` deja triggers rotos en `auth.users` y bloquea el login | `DROP SCHEMA seg CASCADE` arrastra los triggers que dependen de sus funciones; además el orden se documenta en `docs/ops/supabase-ambientes.md` y lo cubre la prueba de ida y vuelta. |
| Al activar el hook, un error en la función bloquea todos los logins | Se activa después de las pruebas SQL y del humo en dev; desactivarlo en el panel es inmediato. |
| Adelantar `01b_seg.sql` hace que el 06 tenga que cambiar tablas ya aplicadas | Las correcciones de este spec son las que el 06 iba a hacer; el resto entra como migración nueva. Se anota en el roadmap. |

## Lo que **no** está en este spec

- Verificador JWKS, guards, `@Publico`, MFA y `ultimo_acceso` (spec 05).
- Funciones de permisos efectivos, menú y sucursales accesibles (spec 07).
- Dominio de permisos, roles, perfiles y asignaciones (spec 06).
- Invitación, aceptación y ciclo de vida de membresías, TR-CA-028 a 030 (spec 08).
- Bitácora de seguridad en uso (specs 05, 07 y 18).
- Bloqueo por intentos, inactividad y límites de tasa de Auth (se revisan con el spec 05).
- Migraciones y configuración de Auth en prod (plan de migración a producción).

Cada uno entra en su propio spec cuando su sprint lo pida.
