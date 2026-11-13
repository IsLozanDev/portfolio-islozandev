# Staging: guía de armado, despliegue y evidencia (SPEC 21 · E-04)

Staging es una copia completa de la plataforma (base, api, worker y frontends) donde se prueba cada cambio antes de producción. Se despliega solo al integrar a `main` con el CI en verde (`.github/workflows/deploy-staging.yml`). Cierra el hito **H2** del plan («Plataforma R1 en staging con observabilidad») y hace verificable el punto «probada en staging» del DoD.

**Regla de oro:** ningún secreto (clave, token, contraseña, DSN, cadena de conexión) va en este documento, en el repo ni en un chat. Se pega directo en el panel donde se usa: GitHub, Railway o Vercel (regla 9 de `CLAUDE.md`). Aquí solo van URLs, nombres y evidencia.

## 0. Mapa: qué es cada pieza y por qué está

```
Navegador ──► Vercel (admin, consola) ──/v1──► Railway: api ──► Supabase staging (base + login)
                                                   │    └──────► Railway: Redis ◄── Railway: worker
                                                   └── trazas, métricas, logs ──► Grafana Cloud
                                                   └── errores 500 ─────────────► Sentry
GitHub Actions ──► GHCR (imágenes) ──► Railway        GitHub Environment `staging` = secretos del pipeline
```

| Pieza | Para qué | Por qué esta | Costo |
| --- | --- | --- | --- |
| **Supabase staging** | Base de datos y login (Auth) propios de staging | Las migraciones y las pruebas no tocan dev. Un proyecto por ambiente (CLAUDE.md, PL-09). | Free (se pausa tras 7 días sin uso) |
| **Railway** | Corre la **api**, el **worker** y **Redis** | Son procesos que tienen que estar siempre encendidos (api, relay del outbox, tareas programadas); Vercel no los corre. El plan dejaba elegir entre Railway, Render y Fly.io; Railway da los tres en un solo proyecto. | Por uso (confirmar al contratar) |
| **Vercel** | Publica `plataforma-admin` y `plataforma-consola` | Son archivos estáticos: los sirve con HTTPS y reenvía `/v1` a la api, así que no hace falta CORS. | Free (Hobby) |
| **GHCR** (GitHub Container Registry) | Guarda las imágenes Docker de api y worker | Viene con GitHub: no hay cuenta ni nada que crear. El pipeline sube las imágenes y Railway las baja. | Gratis para paquetes públicos |
| **Grafana Cloud** | Recibe trazas, métricas y logs (E-03) | Muestra cuánto tarda cada solicitud (p95 de TR-RNF-001), sigue una operación de punta a punta por `trace_id` y alerta si el outbox se atrasa (TR-RNF-106). Lo pide el plan. | Free dentro de la cuota |
| **Sentry** | Recibe los errores 500 y los trabajos fallidos | Avisa del error con su contexto, sin buscarlo en los logs. Lo pide el plan (E-03). | Free dentro de la cuota |
| **GitHub Environment `staging`** | Guarda los secretos que usa el pipeline | Los secretos no van en el repo; Actions los usa sin mostrarlos. | Gratis |

Región: todo lo más cerca posible de Supabase dev, que está en **`us-west-2` (Oregon)**: Supabase staging en *West US (Oregon)*, Railway en *US West*, Grafana en *US*.

## 1. Supabase staging

**Enlace:** https://supabase.com/dashboard/projects → **New project**.

1. Antes de crearlo, confirma que tu organización admite otro proyecto Free: el plan Free permite 2 proyectos activos. Si no te deja, decides entre crear otra organización o pagar staging.
2. **Name:** `vitrina-staging`. **Region:** *West US (Oregon)*. **Database password:** genera una y guárdala en tu gestor de contraseñas (no aquí).
3. *Project Settings → API Keys*: copia la **publishable key** (`sb_publishable_…`), que **me la pasas** porque es pública, y la **secret key** (`sb_secret_…`), que **no me la pasas**: va en GitHub y en Railway.
4. Botón **Connect** (arriba) → *Connection string*:
   - **Transaction pooler** (puerto **6543**) → será `DATABASE_URL` en Railway (api y worker).
   - **Session pooler** (puerto **5432**) → será `DATABASE_MIGRATION_URL` en GitHub.
   Reemplaza `[YOUR-PASSWORD]` por la contraseña del punto 2.
5. Panel, ahora (no dependen de las migraciones), como en dev (`docs/ops/supabase-ambientes.md`):
   - *Project Settings → JWT Keys*: migrar a claves asimétricas, crear una **ECC (P-256)** y rotarla para que quede activa.
   - *Project Settings → Data API → Exposed schemas*: dejar solo `public`.
   - *Authentication → Sign In / Providers*: desactivar **Allow new users to sign up**.
   - *Authentication → Emails → SMTP Settings*: los mismos datos de Resend que en dev.
   - *Authentication → Emails → Templates*: pegar `supabase/templates/invite.html`, `magic-link.html` y `recovery.html` con los asuntos de dev.
   - *Authentication → Sessions/JWT*: expiración del JWT en **900** s.
6. Después del primer despliegue (paso 9 de esta guía), cuando ya corrieron las migraciones: *Authentication → Hooks → Custom Access Token* → tipo Postgres → `seg.custom_access_token_hook` → activar.
7. *Authentication → URL Configuration* (cuando tengas las URLs de Vercel, paso 4): **Site URL** = URL de admin; en **Redirect URLs**, `https://<admin>.vercel.app/**` y `https://<consola>.vercel.app/**`.

**Me pasas:** `project_ref`, URL (`https://<ref>.supabase.co`) y publishable key.

Si se pausa por 7 días sin uso: panel → proyecto → **Restore project** (tarda unos minutos) y luego *Actions → Deploy staging → Run workflow*.

## 2. Railway

**Enlace:** https://railway.com/new → **Empty Project**. **No lo conectes al repositorio de GitHub:** si lo conectas, Railway despliega solo en cada push, sin esperar las migraciones. El orden lo controla el pipeline.

1. Renombra el proyecto a `vitrina-staging` (*Settings → General*). En *Settings*, elige la región **US West**.
2. **Redis:** **+ Create → Database → Redis**. No requiere configuración.
3. **Servicio `api`:** **+ Create → Docker Image** → `ghcr.io/islozandev/portfolio-islozandev/api:staging`.
   - Renómbralo a **`api`**: el pipeline lo redespliega por ese nombre.
   - *Settings → Networking → Generate Domain* (puerto **3000**). Esa URL (`https://….up.railway.app`) **me la pasas**.
   - *Settings → Deploy → Healthcheck Path*: `/v1/salud`.
   - *Variables*: las de la tabla «Variables de Railway» (más abajo).
   - El primer intento de despliegue va a fallar porque la imagen todavía no existe: es normal, se arregla en el paso 8.
4. **Servicio `worker`:** igual, con `ghcr.io/islozandev/portfolio-islozandev/worker:staging`, nombre **`worker`**, **sin dominio** y sin healthcheck (no tiene HTTP).
5. **Token:** *Project Settings → Tokens → Create* (ambiente `production`, el único que trae Railway) → va como secreto `RAILWAY_TOKEN` en GitHub. No me lo pases.

**Me pasas:** la URL pública de `api`.

## 3. Grafana Cloud

**Enlace:** https://grafana.com/auth/sign-up/create-user (región **US**).

1. En el portal de Grafana Cloud: tu stack → **Connections → Add new connection → OpenTelemetry (OTLP)**.
2. Genera un token. Grafana muestra las variables listas para copiar:
   - `OTEL_EXPORTER_OTLP_ENDPOINT` = `https://otlp-gateway-prod-us-….grafana.net/otlp` → **me lo pasas** (no es secreto) y va en Railway.
   - `OTEL_EXPORTER_OTLP_HEADERS` = `Authorization=Basic%20<base64>` → secreto, solo en Railway (api y worker).
   Si Grafana no arma la cabecera, en PowerShell: `[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("<instance_id>:<token>"))` y el valor queda `Authorization=Basic%20<resultado>`.
3. La alerta del outbox se crea después del primer despliegue, cuando lleguen métricas (paso 10 de esta guía).

## 4. Sentry

**Enlace:** https://sentry.io/signup/

1. Crea dos proyectos con plataforma **Node.js**: `vitrina-api` y `vitrina-worker`. Uno por servicio, para separar los errores de la api de los del worker.
2. En cada uno: *Project Settings → Client Keys (DSN)* → copia el DSN → `SENTRY_DSN` del servicio correspondiente en Railway. No me lo pases.

## 5. Vercel

**Enlace:** https://vercel.com (cuenta Hobby). Los proyectos se crean **sin Git**: el panel solo ofrece importar un repo, así que se crean con el CLI, desde PowerShell en la raíz del repo:

```powershell
npx vercel@65.12.1 login
npx vercel@65.12.1 project add vitrina-admin-staging
npx vercel@65.12.1 project add vitrina-consola-staging
```

1. **Token:** https://vercel.com/account/tokens → **Create** (alcance: tu cuenta o equipo) → secreto `VERCEL_TOKEN` en GitHub. No me lo pases.
2. **IDs** (no son secretos, van como variables en GitHub):
   - *Org/Team ID*: en una cuenta personal, *Account Settings → General → Vercel ID*; en un equipo, *Team Settings → General → Team ID* → `VERCEL_ORG_ID`.
   - *Project ID*: en cada proyecto, *Settings → General → Project ID* → `VERCEL_PROJECT_ID_ADMIN` y `VERCEL_PROJECT_ID_CONSOLA`.
3. **Dominio:** en cada proyecto, *Settings → Domains*. Por defecto es `<nombre-del-proyecto>.vercel.app`; anota el que figure.
4. *Settings → Deployment Protection*: que **no** proteja los despliegues de producción. El pipeline despliega con `--prod`, y la prueba de humo y los usuarios necesitan entrar sin login de Vercel.

**Me pasas:** las dos URLs (`https://….vercel.app`).

## 6. GitHub: Environment `staging`

**Enlace:** https://github.com/IsLozanDev/portfolio-islozandev/settings/environments → **New environment** → `staging`. En *Deployment branches and tags*: **Selected branches** → `main`. Luego agrega:

| Nombre | Tipo | Valor | Para qué |
| --- | --- | --- | --- |
| `DATABASE_MIGRATION_URL` | **Secret** | Session pooler 5432 de Supabase staging | Migraciones, manifiesto y siembra |
| `SUPABASE_SECRET_KEY` | **Secret** | `sb_secret_…` de staging | Siembra: invita al administrador |
| `RAILWAY_TOKEN` | **Secret** | Token de proyecto de Railway | Redeploy de api y worker |
| `VERCEL_TOKEN` | **Secret** | Token de Vercel | Despliegue de los frontends |
| `SUPABASE_URL` | Variable | `https://<ref>.supabase.co` | Siembra |
| `SEG_URL_INVITACION` | Variable | `https://<admin>.vercel.app/auth/invitacion` | Enlace del correo de invitación |
| `ORG_OPERADOR_RUC` | Variable | RUC de la empresa operadora (11 dígitos válidos) | Siembra del tenant operador |
| `STAGING_ADMIN_CORREO` | Variable | El correo dueño de la cuenta de Resend | Administrador de plataforma. Con `onboarding@resend.dev`, Resend solo entrega a ese correo. |
| `VERCEL_ORG_ID` | Variable | Org/Team ID de Vercel | Vercel |
| `VERCEL_PROJECT_ID_ADMIN` | Variable | Project ID de admin | Vercel |
| `VERCEL_PROJECT_ID_CONSOLA` | Variable | Project ID de consola | Vercel |
| `URL_API_STAGING` | Variable | URL de `api` en Railway (sin `/` final) | Prueba de humo |
| `URL_ADMIN_STAGING` | Variable | URL de admin en Vercel (sin `/` final) | Prueba de humo |
| `URL_CONSOLA_STAGING` | Variable | URL de consola en Vercel (sin `/` final) | Prueba de humo |

## Variables de Railway

Se cargan en *Variables* de cada servicio (botón **Raw Editor** para pegarlas juntas).

**`api` y `worker`:**

| Variable | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_ENV` | `staging` |
| `LOG_LEVEL` | `info` |
| `DATABASE_URL` | Transaction pooler **6543** de Supabase staging (secreto) |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` (referencia al Redis del proyecto; Railway completa el valor) |
| `OBS_SAL_DOCUMENTO` | Secreto aleatorio, **el mismo en los dos**. Generarlo en PowerShell: `[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Endpoint OTLP de Grafana |
| `OTEL_EXPORTER_OTLP_HEADERS` | `Authorization=Basic%20…` (secreto) |
| `OTEL_TRACES_SAMPLER` | `parentbased_traceidratio` |
| `OTEL_TRACES_SAMPLER_ARG` | `1.0` |
| `SENTRY_DSN` | DSN de `vitrina-api` en la api; DSN de `vitrina-worker` en el worker |

**Solo `api`:**

| Variable | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` de staging |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` de staging (secreto; solo la api, regla 9) |
| `SEG_URL_INVITACION` | `https://<admin>.vercel.app/auth/invitacion` |
| `PORT` | `3000`: el mismo puerto que *Networking* le asigna al dominio público |

`ORIGENES_PERMITIDOS` queda sin definir, porque los frontends llegan por el rewrite de Vercel (mismo origen). El resto (`EVT_*`, `SOPORTE_*`, `AUD_*`, `ORG_TENANT_OPERADOR`) usa los valores por defecto.

## 7. Qué me pasas (todo público)

| Dato | Ejemplo | Dónde lo pongo |
| --- | --- | --- |
| `project_ref` y URL de Supabase staging | `abcd…` / `https://abcd….supabase.co` | `environment.staging.ts` de las dos apps y `supabase-ambientes.md` |
| Publishable key de staging | `sb_publishable_…` | `environment.staging.ts` |
| URL de `api` en Railway | `https://api-production-xxxx.up.railway.app` | `vercel.json` de las dos apps |
| URL de admin y de consola en Vercel | `https://vitrina-admin-staging.vercel.app` | `environment.staging.ts` (volver a la otra app) |
| Endpoint OTLP de Grafana | `https://otlp-gateway-prod-us-….grafana.net/otlp` | Este documento |

Con esos datos reemplazo los `PENDIENTE`. Mientras quede alguno, `deploy-staging.yml` se detiene en su primer job (`revisar`) y no despliega nada.

## 8. Primer despliegue

1. Tú: commit, push y merge a `main` del spec 21 con los `PENDIENTE` ya reemplazados.
2. El CI pasa → `deploy-staging.yml` construye y sube las imágenes a GHCR (job `imagenes`).
3. Tú: https://github.com/orgs/IsLozanDev/packages → paquetes `portfolio-islozandev/api` y `/worker` → *Package settings → Change visibility* → **Public**. Railway solo baja imágenes privadas en el plan Pro; la imagen no lleva secretos (verificado en el paso 6 del spec). Si la organización no lo permite: https://github.com/organizations/IsLozanDev/settings/packages.
4. Si el primer workflow falló en `desplegar` porque Railway no podía bajar la imagen: *Actions → Deploy staging → Re-run failed jobs*.
5. Tú, en Supabase: activar el hook de token (paso 1.6) y las URLs de redirección (paso 1.7).

## 9. Después del primer despliegue (lo hago contigo)

- Alerta de Grafana: `max(vitrina_outbox_edad_pendiente_seg) > 60` durante 5 min, con aviso por correo. Se exporta a `docs/ops/grafana/alerta-outbox.json`.
- Verificación del spec 21 (paso 11) y evidencia abajo.

## Desplegar, revertir y reactivar

- **Desplegar:** merge a `main` con el CI en verde. A mano: *Actions → Deploy staging → Run workflow* sobre `main`.
- **Volver a la imagen anterior:** reetiquetar el `sha` anterior como `staging` y redesplegar, sin construir de nuevo:
  `docker buildx imagetools create -t ghcr.io/islozandev/portfolio-islozandev/api:staging ghcr.io/islozandev/portfolio-islozandev/api:<sha>` (igual con `worker`) y luego, con el token en la variable `RAILWAY_TOKEN`, `npx -y @railway/cli@5.71.0 redeploy --service api --yes` (y `worker`).
- **Revertir una migración:** con `DATABASE_MIGRATION_URL` de staging en `.env`, `pnpm db:down:supabase:remoto` (si la última fue de Supabase) o `pnpm db:down:remoto`. Revierte la última; se repite por cada una. Antes, volver a la imagen anterior.
- **Supabase pausado:** paso 1.

## Estado

| Pieza | URL | Estado |
| --- | --- | --- |
| Supabase staging | https://cswftpxqkuxgtzfmqhzl.supabase.co (ref `cswftpxqkuxgtzfmqhzl`) | Creado |
| Railway `api` | https://api-production-87e9a495.up.railway.app | Creado |
| Railway `worker` y Redis | — | Creado |
| Vercel admin | https://vitrina-admin-staging.vercel.app | Creado |
| Vercel consola | https://vitrina-consola-staging.vercel.app | Creado |
| Grafana Cloud | OTLP `https://otlp-gateway-prod-us-west-0.grafana.net/otlp` | Creado |
| Sentry | — | Por crear |
| GitHub Environment `staging` | — | Por crear |

## Evidencia

_(Se llena en el paso 11 del spec: URLs por HTTPS, humo, traza en Grafana, alerta disparada y resuelta, error en Sentry, 2 réplicas, capturas de las apps.)_
