# Supabase: ambientes y checklist (SPEC 02 · F-04)

Un proyecto Supabase por ambiente. Solo `dev` y `prod`; `staging` entra con el spec 21. Este documento guarda datos no secretos y la evidencia de cada paso manual. **Ninguna clave, contraseña ni API key va aquí ni en el repo** (regla 9 de `CLAUDE.md`); viven en `.env` (local) y en el panel de Supabase.

## Ambientes

| Ambiente | `project_ref` | URL | Estado |
| --- | --- | --- | --- |
| dev | `ebkwqvuynccawujsaedh` | `https://ebkwqvuynccawujsaedh.supabase.co` | Creado |
| prod | _(pendiente)_ | _(pendiente)_ | Por crear (plan Pro y respaldos: P-01, sprint 11) |

## Conexiones (dev)

Host del pooler: `aws-1-us-west-2.pooler.supabase.com`, usuario `postgres.<project_ref>`, base `postgres`.

| Uso | Variable | Conexión |
| --- | --- | --- |
| Aplicación (`apps/api`) | `DATABASE_URL` | Transaction pooler, puerto 6543. `set_config('app.tenant_id', ..., true)` vive dentro de la transacción, que es la unidad que el pooler asigna a una conexión. |
| Migraciones (`pnpm db:up:remoto`, `db:down:remoto`) | `DATABASE_MIGRATION_URL` | Directa (`db.<project_ref>.supabase.co:5432`, solo IPv6 salvo add-on IPv4) o session pooler, puerto 5432. En modo transacción fallan los DDL con `PREPARE` y los bloqueos de sesión. |

Dev corre PostgreSQL 17; compose y CI usan 16 (regla 6). Una migración que dependa de algo exclusivo de 17 solo se vería en dev.

## Checklist por ambiente

Marcar cada paso al terminarlo y llenar la evidencia. Los pasos de panel no se pueden automatizar ni correr en CI sin credenciales.

### 1. Claves de firma JWT asimétricas (ES256)

- [ ] Panel: *Project Settings → JWT Keys*: migrar a claves asimétricas, crear una clave ECC (P-256) y rotar para que sea la activa; revocar la clave heredada cuando no queden sesiones.
- [x] (dev) `curl {SUPABASE_URL}/auth/v1/.well-known/jwks.json` devuelve una clave con `kty = EC`, `crv = P-256` y `alg = ES256`.

### 2. Data API sin esquemas de plataforma

- [ ] Panel: *Project Settings → Data API → Exposed schemas*: dejar solo `public` (o ninguno). Ni `seg`, `org`, `sync` ni los siguientes.
- [x] (dev) `curl -H "apikey: {PUBLISHABLE_KEY}" -H "Accept-Profile: sync" {SUPABASE_URL}/rest/v1/outbox?limit=1` responde `406 PGRST106` ("Only the following schemas are exposed: public, graphql_public"). El `GET /rest/v1/` solo admite secret key, por eso no sirve para esta prueba.
- [x] (dev) Tras aplicar la migración: `has_schema_privilege('anon', 'sync', 'USAGE')` y `has_schema_privilege('authenticated', 'sync', 'USAGE')` devuelven `false` (consulta de solo lectura por el MCP).

### 3. SMTP propio con Resend

- [ ] Panel: *Authentication → Emails → SMTP Settings*: host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = API key de Resend (rotada, nunca la pegada en un chat), remitente y nombre.
- [ ] Remitente: `onboarding@resend.dev` solo entrega a la dirección de la cuenta propietaria de Resend. Para invitar a otras personas hay que verificar un dominio en Resend y cambiar el remitente.

### 4. Plantillas de correo en español

- [ ] Panel: *Authentication → Emails → Templates*: pegar el contenido de `supabase/templates/invite.html`, `recovery.html` y `confirmation.html` con los asuntos de `supabase/config.toml`.
- [ ] Una invitación enviada desde *Authentication → Users → Invite user* llega por Resend con la plantilla en español.

### 5. Migración del outbox

- [x] (dev) `pnpm db:up:remoto` imprime el host de destino y aplica `01e_sync_outbox.sql`.
- [x] (dev) Por el MCP: `list_tables` de `sync` muestra `outbox` con RLS activa y `get_advisors` no reporta tablas sin RLS.
- [x] (dev) `pnpm db:down:remoto` y luego `pnpm db:up:remoto` terminan con 0 (solo en dev).

### 6. Login de prueba (hito H0, solo dev)

- [ ] Crear un usuario de prueba en *Authentication → Users → Add user* con clave y correo confirmado.
- [ ] `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` con la publishable key devuelve un `access_token`.
- [ ] La cabecera del token (`node -e "console.log(JSON.parse(Buffer.from(process.argv[1].split('.')[0],'base64url')))" <token>`) dice `alg: ES256` y su `kid` aparece en el JWKS.

### 7. Rol de conexión de la aplicación

- [ ] (dev: la conexión `postgres` tiene `BYPASSRLS = true`, ver evidencia) Anotar con qué rol se conecta la aplicación y si tiene `BYPASSRLS`. En Supabase el rol `postgres` es dueño de las tablas; `FORCE ROW LEVEL SECURITY` no lo frena si tiene ese atributo. La corrección (rol de aplicación sin `BYPASSRLS`) se cierra en el spec 03 junto con `01a_org.sql`.

### 8. Secretos

- [ ] `git grep -nE "sb_secret|re_[A-Za-z0-9]{8}|eyJ[A-Za-z0-9_-]{10}"` no devuelve resultados.
- [ ] `.env` está en `.gitignore` y `.env.example` no trae valores secretos.
- [ ] La contraseña de la base y la API key de Resend que circularon en el chat se rotaron.

## Evidencia

| Fecha | Ambiente | Paso | Resultado |
| --- | --- | --- | --- |
| 2026-10-19 | dev | MCP de Supabase autenticado, `get_project_url` | Devuelve `https://ebkwqvuynccawujsaedh.supabase.co` |
| 2026-10-19 | dev | MCP `list_tables` (`public`, `seg`, `org`, `sync`) y `list_migrations` | Sin tablas ni migraciones |
| 2026-10-19 | dev | Conexión por `DATABASE_MIGRATION_URL` (session pooler 5432) | Conecta como `postgres`, PostgreSQL 17.11 |

| 2026-10-19 | dev | JWKS | Una clave `EC` / `P-256` / `ES256`, `kid` `29aacbfd-3ac6-4313-a565-f091e014d5ef` |
| 2026-10-19 | dev | Data API | `Accept-Profile: sync` responde 406 `PGRST106`; esquemas expuestos: `public`, `graphql_public` |
| 2026-10-19 | dev | `pnpm db:up:remoto`, luego `db:down:remoto` y `db:up:remoto` | Aplica y revierte `01e_sync_outbox.sql`; `sync.outbox` con RLS activa y forzada, 2 políticas, 1 trigger, 0 filas |
| 2026-10-19 | dev | `has_schema_privilege` / `has_table_privilege` sobre `sync` | `anon` y `authenticated`: `false` en `USAGE`, `SELECT` e `INSERT` |
| 2026-10-19 | dev | Advisors de seguridad (MCP) | Sin avisos (un `function_search_path_mutable` inicial se corrigió con `SET search_path = ''`) |
| 2026-10-19 | dev | Rol de conexión | `postgres` con `BYPASSRLS = true`: la RLS no lo frena; pendiente el rol de aplicación (spec 03) |

_Las filas de los pasos 1 a 8 que faltan se agregan al ejecutarlos, con fecha, ambiente y resultado._
