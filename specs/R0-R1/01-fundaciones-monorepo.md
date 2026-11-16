# SPEC 01 — Monorepo Nx, CI, entorno local y reglas de límites

> **Status:** Implementado
> **Depends on:** ninguna
> **Date:** 2026-10-19
> **Objective:** Dejar creado el monorepo Nx + pnpm con CI en GitHub Actions, entorno local reproducible y reglas de límites por scope, tipo, componente y capa verificadas automáticamente.

## Por qué existe este spec

Cubre las historias F-02, F-03 y F-05 del Sprint 0 (R0), 7 h en el plan; el resto hasta 10 h cubre la api mínima y el runner de migraciones. Es el prerrequisito de todo lo demás (PL-10: kernel, ORG, SEG, ...). Las reglas de arquitectura 1, 2, 6, 7 y 8 de `CLAUDE.md` se vuelven aquí reglas ejecutables en vez de convención.

RNF heredados que toca: RNF-024 y RNF-119 (límites de módulos), RNF-011 (secretos solo por entorno), RNF-025 (cobertura de dominio, el umbral se configura aquí y se aplica en cada spec).

## Alcance

**In:**

- Workspace Nx + pnpm, Node 24 LTS, TypeScript 5.9 ESM: `package.json`, `pnpm-workspace.yaml`, `nx.json`, `tsconfig.base.json`, `.nvmrc`, `.editorconfig`, `.gitignore`.
- Proyectos mínimos con tags:
  - `apps/api` (NestJS 12): `main.ts`, `app.module.ts`, `GET /v1/salud`, OpenAPI en `/v1/docs`, validación de variables con zod en `src/config/`.
  - `libs/shared/contracts` y `libs/shared/util` (vacías con `index.ts`).
  - `libs/plataforma/kernel` (`type:domain`) y `libs/plataforma/kernel-infra` (`type:backend`), solo `index.ts` y la estructura de carpetas. El contenido real es otro spec.
- Reglas `@nx/enforce-module-boundaries` por `scope:*`, `type:*` y `comp:*`.
- Reglas ESLint por ruta para las capas internas de cada lib TR.
- Prueba automática de las reglas con fixtures que violan cada una (`tools/boundaries-test/`).
- Husky + commitlint (Conventional Commits) y lint-staged.
- CI `.github/workflows/ci.yml`: `nx affected` lint, test y build con caché; job de migraciones contra PostgreSQL 16.
- Entorno local: `docker-compose.yml` (PostgreSQL 16 + Redis 7), Supabase CLI (`supabase/config.toml` inicial), `.env.example` sin secretos.
- Runner de migraciones `tools/migrar/`: aplica `db/*.sql` en orden, aplica `db/rollback/*.sql` en orden inverso, comandos `pnpm db:up` y `pnpm db:down`.

**Out of scope (para otros specs):**

- Contenido del kernel (AggregateRoot, UnitOfWork, outbox): spec 02 `supabase-y-kernel` (F-06).
- `apps/worker`, generador Nx `modulo-hexagonal` y frontends Angular (`apps/plataforma-*`, `libs/shared/auth`, `ui`, `shell`): llegan cuando su sprint lo pida. Las reglas `type:feature`, `type:ui`, `type:data-access` quedan declaradas desde ya.
- `deploy-staging.yml` y `deploy-prod.yml`, Dockerfile de `apps/api`, OpenTelemetry (`tracing.ts`).
- Proyectos Supabase dev/prod, claves ES256, SMTP (F-04, es de operación).
- Parche CC-00 de SazónPOS (F-01).
- Tags `comp:*` de componentes R2/R3 (PER, IDN, ARC, FE, NOT, PAG, CMS, POR, SOP): se agregan con cada lib nueva.
- Primera migración real de esquema. El runner se prueba con fixtures.
- Cache remota Nx Cloud.

## Base de código reutilizada

Fuente: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/` (`2_Estructura/` y `codigo/`).

**Se conserva:**

- `2_Estructura/eslint.boundaries.snippet.js`: base de las reglas `scope` y `type` (se amplía con `scope:app` y `comp:*`).
- Versiones de `codigo/libs/plataforma/seguridad/package.json`: NestJS `^12.2.0`, TypeScript `~5.9.3`, `@types/node ^24`, `supertest ^7`.
- Opciones de `codigo/libs/plataforma/seguridad/tsconfig.json`: `module`/`moduleResolution` `nodenext`, `strict`, `experimentalDecorators`, `emitDecoratorMetadata`. Pasan a `tsconfig.base.json`.
- Patrón de `codigo/supabase/correr_pruebas.sh`: base temporal, `psql -v ON_ERROR_STOP=1`, scripts en orden. Inspira el runner `tools/migrar/` y el job `migraciones`.

**Cambia:**

- La prueba de `seguridad` corre con `tsc && node dist/...` sin runner. Aquí `apps/api` usa Jest + Supertest, como pide el árbol de `estructura_backend.txt` (`api-e2e`).
- `correr_pruebas.sh` es bash y apunta a PostgreSQL 15+. Aquí el runner es Node (desarrollo en Windows) y la base es PostgreSQL 16.

**No corresponde todavía** (cada spec declara su parte cuando llegue):

- `libs/plataforma/seguridad/**`, `db/01b_seg.sql`, `supabase/migrations/20261102000000_seg_supabase_auth.sql` y `supabase/tests/`: specs 04 y 06.
- `db/01a_org.sql`: spec 03.
- `libs/shared/auth/**`: spec 05, verificando APIs contra Angular 21.

## Modelo de datos

Este spec no introduce estructuras de datos de negocio. Define convenciones de etiquetas, que son el contrato de las reglas.

**Tags por proyecto** (en cada `project.json`):

| Proyecto | Tags |
| --- | --- |
| `apps/api` | `scope:app`, `type:app` |
| `libs/plataforma/kernel` | `scope:plataforma`, `type:domain`, `comp:kernel` |
| `libs/plataforma/kernel-infra` | `scope:plataforma`, `type:backend`, `comp:kernel` |
| `libs/plataforma/<tr>` | `scope:plataforma`, `type:backend`, `comp:<tr>` |
| `libs/shared/contracts`, `libs/shared/util` | `scope:shared`, `type:util` |

**Reglas `scope` y `type`:** las del snippet `docs/.../2_Estructura/eslint.boundaries.snippet.js`, más `scope:app` que puede depender de todo scope. El scope `psi` y `nucleo` del snippet se conservan porque el plan los menciona, aunque no hay libs todavía.

**Reglas `comp` (PL-10, solo R0/R1).** Cada componente puede importar de sí mismo, de `comp:kernel` y de los predecesores directos del grafo:

| Origen | Puede importar |
| --- | --- |
| `comp:kernel` | `comp:kernel` |
| `comp:org` | `kernel` |
| `comp:seg` | `kernel`, `org` |
| `comp:evt` | `kernel` |
| `comp:cfg`, `comp:seq`, `comp:cat` | `kernel`, `seg` |
| `comp:aud` | `kernel`, `seg`, `evt` |
| `comp:obs` | `kernel`, `evt` |

Solo vía el `index.ts` de la lib (Nx lo impone por alias de path `@vitrina/plataforma/<nombre>`). Un componente que necesite una dependencia transitiva la declara en este spec o en el suyo, no se abre por defecto.

**Reglas de capa** (ESLint `no-restricted-imports` por ruta, dentro de `libs/plataforma/*/src/`):

| Carpeta | No puede importar |
| --- | --- |
| `domain/**` | `application`, `infrastructure`, `interface`, `@nestjs/*`, `typeorm`, `@supabase/*` |
| `application/**` | `infrastructure`, `interface`, `typeorm`, `@supabase/*` |
| `infrastructure/**` | `interface` |
| fuera de `infrastructure/supabase/**` | `@supabase/*` |

Excepción: `libs/plataforma/kernel` es entero `type:domain`, aplica la regla de `domain/**` a todo su `src/`.

**Scripts raíz** (`package.json`): `lint`, `test`, `build` (envuelven `nx`), `db:up`, `db:down`, `dev:infra` (`docker compose up -d`), `supabase:start`, `supabase:stop`.

**Variables en `.env.example`:** `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`. La secret key de Supabase no aparece; la regla 9 la limita a `apps/api` y scripts de migración y se agrega cuando se use.

## Plan de implementación

1. Inicializar el workspace Nx con pnpm: `package.json` (campo `packageManager`, `engines.node >=24`), `pnpm-workspace.yaml`, `nx.json`, `tsconfig.base.json`, `.nvmrc`, `.gitignore`. Verificar: `pnpm install` y `pnpm nx graph --file=out.json` sin error.
2. Crear `libs/shared/contracts` y `libs/shared/util` con `index.ts`, tags y alias de path. Verificar: `pnpm nx lint shared-util`.
3. Crear `libs/plataforma/kernel` y `kernel-infra` con tags y carpetas vacías. Verificar: `pnpm nx build kernel` y `lint`.
4. Configurar `eslint.config.mjs` con las reglas `scope`, `type` y `comp` (tabla del modelo). Verificar: `pnpm nx run-many -t lint`.
5. Agregar reglas de capa por ruta en `eslint.config.mjs`. Verificar: `pnpm nx lint kernel`.
6. Crear `tools/boundaries-test/` con un fixture por regla violada y un test Jest que ejecuta la API de ESLint y comprueba que cada fixture falla con el id de regla esperado. Verificar: `pnpm nx test boundaries-test`.
7. Crear `apps/api` con `main.ts`, `app.module.ts`, `config/` (zod), `GET /v1/salud` y OpenAPI en `/v1/docs`; Jest + Supertest para `/v1/salud`. Verificar: `pnpm nx serve api` y `curl localhost:3000/v1/salud` devuelve 200.
8. Husky, commitlint (`@commitlint/config-conventional`) y lint-staged. Verificar: un commit con mensaje inválido es rechazado en un repo de prueba; sin commitear en este repo.
9. `docker-compose.yml` (PostgreSQL 16, Redis 7, healthchecks, volumen con nombre), `.env.example`, `supabase/config.toml` inicial (`supabase init`) y scripts `dev:infra`, `supabase:start`. Verificar: `pnpm dev:infra` deja ambos servicios `healthy`.
10. Runner `tools/migrar/` con `db:up` y `db:down` (tabla `_migraciones` para registrar lo aplicado, transacción por archivo, falla si falta el script inverso de un archivo). Prueba de integración con fixtures contra el PostgreSQL de compose: up, down, up. Verificar: `pnpm db:up && pnpm db:down` sobre `db/` vacío sale con 0.
11. `.github/workflows/ci.yml`: Node 24 y pnpm con caché de store, `actions/cache` para `.nx/cache`, `nx affected -t lint test build`, job `migraciones` con service container `postgres:16` que corre up, down, up. Verificar: PR de prueba en GitHub con los dos jobs verdes y uno con una violación de límite en rojo.

## Criterios de aceptación

- [ ] `pnpm install --frozen-lockfile` en un clon limpio termina sin error con Node 24.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0.
- [ ] `GET /v1/salud` responde 200 y `/v1/docs` publica el OpenAPI de `apps/api`.
- [ ] Un import de `scope:plataforma` hacia un proyecto `scope:app` o de producto falla en lint.
- [ ] Un import de `scope:shared` hacia fuera de shared falla en lint.
- [ ] Un import de `comp:cfg` hacia `comp:aud` falla en lint; un import de `comp:aud` hacia `comp:evt` pasa.
- [ ] Un import profundo a `libs/plataforma/<tr>/src/...` fuera del `index.ts` falla en lint.
- [ ] `domain/` importando `@nestjs/common`, `typeorm` o `@supabase/supabase-js` falla en lint.
- [ ] `application/` importando `infrastructure/` falla en lint.
- [ ] `@supabase/*` importado fuera de `infrastructure/supabase/` falla en lint.
- [ ] El test de `tools/boundaries-test` pasa solo si cada fixture falla con la regla esperada.
- [ ] Un mensaje de commit que no sigue Conventional Commits es rechazado por el hook.
- [ ] `pnpm dev:infra` levanta PostgreSQL 16 y Redis 7 con estado `healthy`.
- [ ] `pnpm db:up` y `pnpm db:down` aplican y revierten en orden inverso los fixtures de la prueba; falta del script inverso hace fallar el runner.
- [ ] En un PR de GitHub, `ci.yml` ejecuta `nx affected`, y el job `migraciones` corre up, down, up contra `postgres:16`.
- [ ] La segunda ejecución de CI sobre el mismo código reporta aciertos de caché de Nx.
- [ ] `.env.example` no contiene ningún valor secreto y `.env` está en `.gitignore`.
- [ ] Las horas reales quedan registradas en el plan (DoD).

## Decisiones

- **Sí:** capas como carpetas dentro de una lib por componente, validadas con reglas ESLint por ruta. Respeta la regla 1 de la constitución; Nx solo ve proyectos, no carpetas.
- **No:** una lib Nx por capa (`seguridad-domain`, ...). Multiplica proyectos y rompe "una lib por componente".
- **Sí:** tag `comp:<nombre>` con las dependencias directas de PL-10. Hace explícito y verificable el orden de construcción.
- **No:** abrir dependencias transitivas por defecto. Se declaran donde se necesiten, así el grafo no crece sin que alguien lo decida.
- **Sí:** `kernel` y `kernel-infra` comparten `comp:kernel` pero distinto `type`. Dominio puro y adaptadores quedan separados como pide la regla 2.
- **Sí:** `actions/cache` para la caché de Nx. Un solo desarrollador, no justifica Nx Cloud ni una cuenta más.
- **No:** Nx Cloud. Se reevalúa si el tiempo de CI supera los 10 minutos.
- **Sí:** el job de migraciones usa `postgres:16` plano, no Supabase. Lo exige la regla 6 de `CLAUDE.md` y el `LEEME.md` del plan; las migraciones de `supabase/migrations` se prueban con Supabase CLI en el spec de SEG.
- **Sí:** runner de migraciones propio y mínimo, con el script inverso obligatorio. Evita adoptar un ORM o herramienta de migraciones antes de tener la primera migración.
- **Sí:** Angular 21, no 22. Decisión vigente del proyecto sobre lo que dicen los documentos; no afecta a este spec porque no hay frontends, queda registrado para el spec del primer frontend.
- **Sí:** fixtures que violan reglas, probadas en Jest. Una regla de límites que nadie prueba se desactiva sin que nadie lo note.
- **Sí:** `apps/api` mínima en este spec. Da algo que construir, levantar y probar en CI desde el primer día.
- **No:** generador `modulo-hexagonal` ahora. Con el kernel y SEG como primeras libs el generador se escribe con casos reales.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| NestJS 12 o Angular 21 con Node 24 y TypeScript 5.9 ESM traen incompatibilidades de herramientas (Jest, decoradores) | Paso 7 las detecta pronto. Si Jest con ESM falla, se decide la alternativa en ese paso y se anota en Decisiones. |
| El plan dice Angular 22 y el workspace pide 21 | Fuera de este spec; se fija al crear el primer frontend. |
| Reglas de capa por ruta no cubren imports relativos con rutas largas | Los fixtures de capa usan imports relativos y por alias; cualquier hueco se cierra con otro fixture. |
| Supabase CLI local usa su propio PostgreSQL, distinto del de compose | `db/` se prueba siempre contra el PG16 de compose y CI; Supabase CLI solo para `supabase/migrations`. |
| Windows como entorno de desarrollo con scripts que asumen bash | Scripts en Node (`tools/migrar`) y comandos de `package.json` sin sintaxis de shell específica. |
| El hook de commitlint bloquea el primer commit si el mensaje no cumple | Documentado en el `README` raíz creado en el paso 1 con el formato esperado. |

## Lo que **no** está en este spec

- Contenido del kernel, outbox, unidad de trabajo, contexto de tenant.
- Frontends Angular, `apps/worker`, generador `modulo-hexagonal`.
- Despliegue a staging y producción, Dockerfile, OpenTelemetry.
- Proyectos Supabase en la nube, claves, SMTP, hook de token.
- Primera migración de esquema real (`01a_org.sql` y siguientes).
- Reglas y tags de componentes R2 y R3.
- Nx Cloud.

Cada uno entra en su propio spec cuando su sprint lo pida.
