# Hoja de ruta de specs

Un spec es un archivo `specs/NN-slug.md`: un componente TR o un slice de uno. Objetivo en una frase, tres áreas como máximo, cabe en 10 h. `/spec` asigna el número según el orden en que se guardan; esta lista fija el orden de construcción y el contenido.

Estado: todos pendientes. Actualizar la columna Estado cuando un spec pase a Aprobado o Implementado.

Versión 2: partida tras revisar los paquetes de contexto (`docs/spec-context/`). Los specs 03, 04, 06 y 07 originales superaban el tope de 10 h y el alta de tenant dependía de componentes que se construyen después.

## R0 y R1 (sprints 0 a 12): 27 specs

| NN | Slug | Cubre | h est. | Depende de | Contexto (`spec-context/NN-*.md`) |
|---|---|---|---|---|---|
| 01 | fundaciones-monorepo | F-02, F-03, F-05: Nx, pnpm, CI, docker-compose, Husky. Reglas de límites: etiquetas `comp:*`, ESLint por capa dentro de cada lib, matriz de dependencias entre componentes según PL-10. Debe dejar el generador `modulo-hexagonal`, libs en stub registradas y rangos de migraciones por componente | 7+ | — | — |
| 02 | supabase-y-kernel | F-04, F-06 (RF 092): proyectos Supabase, kernel, kernel-infra, DDL de `sync.outbox` | 8 | 01 | 02 |
| 03 | org-dominio-y-suscripcion | O-01 y parte de O-03 (RF 002-006): tenant, empresa, sucursal, unidad, suscripción, estados. Corrige `01a_org.sql` (RLS, CHECK, FK, historial) | 8-9 | 02 | 03 |
| 04 | seg-identidad-hook-espejo | A-02, A-03: hook de token (`tenant_id`, `tipo_usuario`), espejo `auth.users` a `seg.usuario`, migración con rollback. Crea `db/01b_seg.sql` corregido (tablas con RLS, sin funciones de permisos). Solo dev; prod va al plan de migración a producción | 8-9 | 02, 03 | 04 |
| 05 | seg-verificador-guard-mfa | A-01, A-05 (RF 017): lib `seguridad` con JWKS (solo ES256), `AutenticacionGuard`, `@Publico`, `@RequiereMfa` (aal2 y factor de 15 min como máximo, 401 step-up), `ultimo_acceso` y `GET /v1/seg/sesion`. Bloqueo por intentos e inactividad quedan como brecha (`docs/ops/supabase-ambientes.md`) | 9-10 | 04 | 04 |
| 06 | seg-dominio-autorizacion | S-01 (RF 008, 011, 012, 013): permiso, rol, perfil, asignación con alcance y vigencia, manifiesto. `01b_seg.sql` ya existe (spec 04): lo que falte (p. ej. `version` en los agregados) entra como migración nueva | 6-8 | 04 | 06 |
| 07 | seg-permisos-efectivos-guard | S-02, S-03, S-05 (RF 015, 016): permisos efectivos, caché Redis con invalidación, `@Permiso`, `X-Sucursal-Id`, aislamiento entre tenants. Incluye `seg.permisos_efectivos`, `seg.menu_usuario` y `seg.sucursales_accesibles` (`SECURITY DEFINER`, `search_path` fijo), que el 04 no creó. Del 05: `@Permiso` de un permiso sensible pone la metadata `REQUIERE_MFA`; `TenantContext` por petición desde el token; `/v1/seg/mi-contexto` reemplaza a `/v1/seg/sesion` | 10 | 05, 06 | 06 |
| 08 | seg-membresias | S-04 (RF 009, 010, 014): invitar, aceptar, revocar, suspender. Límite de tasa en el endpoint público de aceptar (TR-RNF-015, pendiente del 05). Estimado mayor que las 4 h del plan | 8 | 07 | 08 |
| 09 | cfg-parametros | D-01 y parte de D-05 (RF 030-033) | 8-9 | 07 | 09 |
| 10 | seq-correlativos | D-02 y parte de D-05 (RF 035-037) | 7 | 07 | 10 |
| 11 | evt-outbox-relay | E-02 (RF 093, 095): relay en el worker, suscriptores, reproceso | 6 | 02 | 11 |
| 12 | org-alta-tenant-vencimiento | O-02 y vencimiento de O-03 (RF 001, 007): alta transaccional, siembra, invitación al propietario, tarea diaria. IDN y NOT van por puertos con adaptador nulo hasta R2 | 9 | 08, 09, 10, 11 | 03 |
| 13 | auth-cliente-angular | A-04: shared/auth (cliente Supabase, sesión, interceptor, guards, `*siPermiso`). Compilar con Angular 21 | 6 | 07 | 13 |
| 14 | auth-ui-minima | Páginas `/auth`: ingresar, callback OAuth (Google real; Microsoft pendiente), MFA, recuperar, nueva clave e invitación (pantalla del spec 08). Primera app `plataforma-admin` con Material y Tailwind 4. Sin historia en el plan; se agrega | 12-13 | 13, 08 | 13 |
| 15 | shell-y-ui | U-01, U-02 (RF 015, 016 en UI) | 8 | 13 | 15 |
| 16 | admin-usuarios-roles | U-03, U-04 | 10 | 08, 15 | — |
| 17 | consola-y-admin-org | O-04, U-05, U-06 | 11 | 12, 15 | — |
| 18 | seg-bitacora-soporte | S-06 (RF 019, 020; TR-RN-011) | 4-6 | 08 | 18 |
| 19a | cat-catalogos-nucleo | D-03 (RF 022-027): modelo, caché/ETag, `CatalogoPort` | 7 | 07 | 19 |
| 19b | cat-oficiales-feriados-consola | D-04 (RF 028-029), D-06, UI de RF 025/026 (sin dueño en el plan, ~2 h extra) | 7-9 | 19a, 09, 13, 15 | 19 |
| 20 | aud-auditoria | E-01 (RF 084-086) | 5 | 07, 11 | 20 |
| 21 | obs-y-staging | E-03, E-04 | 8 | 11 | 21 |
| 22 | sazonpos-org-seq-cfg | C-01, C-02: CC-01, CC-03, CC-05 | 10 | 03, 09, 10 | — |
| 23 | sazonpos-auth | C-03: CC-10 | 8 | 05, 08 | — |
| 24 | sazonpos-permisos-sombra | C-04, Q-02, P-03: CC-02 | 13 | 07, 23 | — |
| 25 | sazonpos-catalogos-eventos | C-05, C-06, C-08: CC-04, CC-07 | 12 | 11, 19, 20 | — |
| 26 | sazonpos-shell | C-07: CC-08 | 7 | 15, 24 | — |
| 27 | e2e-uat-produccion-r1 | Q-01, Q-03, P-01, Q-04, P-02, P-04 | 29 | todos | — |

Paquetes de contexto nuevos (9, 10, 11, 15, 18, 19, 20, 21): `docs/spec-context/NN-slug.md`. Pendientes de decidir al redactar: la UI de 09 y 10 depende de 13 y 15 (hoy declaran solo 07); RF-094 (registro de esquemas) sin spec; el spec 25 depende de 19a y 19b; formato de número de SEQ (8 dígitos vs "A-001").

Persistencia con ORM (regla 11 de CLAUDE.md) desde el spec 10. Los specs 01 a 09 conservan SQL embebido en sus repositorios; migrarlos a TypeORM es un spec de refactor aparte (~6-8 h, sin número ni fecha). Los specs 10 SEQ (`FOR UPDATE`) y 20 AUD (hash encadenado) pueden justificar SQL puntual.

Los specs 16, 17, 22 a 25 y 27 superan 10 h. Al llegar a ellos se parten (por ejemplo 19: catálogos propios, tablas SUNAT y feriados; 27: E2E, UAT, producción) antes de redactar.

## Cambios respecto a la versión 1

- 03 original (15 h) pasa a 03 y 12. El alta de tenant se mueve después de membresías, CFG, SEQ y outbox, porque los usa.
- 04 original (14 h) pasa a 04 y 05.
- 05 original pasa a 13 y 14. `auth-ui` no tenía dueño.
- 06 original (16 h) pasa a 06 y 07.
- 07 original pasa a 08.
- CFG, SEQ y evt suben antes de la UI porque el alta de tenant los necesita.

## R2 y R3 (indicativo, se afinan al llegar): unos 14 specs

R2: personas-identidad, archivos, fe-emisor-boleta-factura, fe-notas-contingencia, notificaciones-correo, recordatorios-preferencias, sazonpos-personas-fe, arco-incidentes.
R3: pagos, reportes, cms, portal-cliente, soporte, obs-negocio-whatsapp.

Total estimado: unos 41 specs (27 en R0 y R1).

## Olas de implementación en paralelo (worktrees)

- Ola 1: 01, luego 02. En serie.
- Ola 2: 03 y 11.
- Ola 3: 04, luego 05 y 06 en paralelo.
- Ola 4: 07, luego 08 y 13.
- Ola 5: 09, 10, 14, 20.
- Ola 6: 12, 15, 18, 19, 21, luego 16 y 17.
- SazónPOS (22 a 26) y 27 al final.

Máximo 2 o 3 frentes a la vez: la revisión de diffs es el cuello de botella.

## Reglas de esta hoja

- TR-SEG y TR-ORG se dividen en varios specs porque concentran el riesgo y el mayor número de RF.
- El código de `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/codigo/` es base probada, no se copia a ciegas. No trae kernel, org, membresías, rol, perfil ni asignación en código.
- Si cambia el plan (regla del 70 %), se actualiza esta tabla.
