# Hoja de ruta de specs

Un spec es un archivo `specs/NN-slug.md`: un componente TR o un slice de uno. Objetivo en una frase, tres áreas como máximo, cabe en 10 h. La numeración real la asigna `/spec`; esta lista fija el orden y el contenido.

Estado: todos pendientes. Actualizar esta tabla cuando un spec pase a Aprobado o Implementado.

## R0 y R1 (sprints 0 a 12): 23 specs

| NN | Slug | Cubre (historias del plan) | Depende de |
|---|---|---|---|
| 01 | fundaciones-monorepo | F-02, F-03, F-05: Nx, pnpm, CI, docker-compose, Husky. Reglas de límites: etiquetas por componente (`comp:*`), ESLint por capa dentro de cada lib (domain no importa infrastructure), matriz de dependencias entre componentes según PL-10 | — |
| 02 | supabase-y-kernel | F-04, F-06: proyectos Supabase, kernel, kernel-infra (UnidadDeTrabajo, ContextoTenant, outbox, Resultado) | 01 |
| 03 | org-dominio-y-alta-tenant | O-01, O-02, O-03 (RF 001-007) | 02 |
| 04 | seg-autenticacion-back | A-01, A-02, A-03, A-05 (RF 010, 017): JWKS, hook de token, espejo auth.users, MFA | 02 |
| 05 | auth-cliente-angular | A-04: shared/auth (verificar APIs contra Angular 21) | 04 |
| 06 | seg-autorizacion | S-01, S-02, S-03, S-05 (RF 008, 011, 013, 015, 016): dominio, permisos efectivos, guard, aislamiento entre tenants | 03, 04 |
| 07 | seg-membresias | S-04 (RF 009, 010, 014) | 06 |
| 08 | shell-y-ui | U-01, U-02: sistema de diseño, shell, menú dinámico | 05, 06 |
| 09 | admin-usuarios-roles | U-03, U-04 (RF 011, 012, 013) | 07, 08 |
| 10 | consola-y-admin-org | O-04, U-05, U-06: plataforma-consola, empresas, sucursales, plataforma-admin | 03, 08 |
| 11 | seg-bitacora-soporte | S-06 (RF 019, 020) | 07 |
| 12 | cfg-parametros | D-01 y parte de D-05 (RF 030-033) | 06 |
| 13 | seq-correlativos | D-02 y parte de D-05 (RF 035-037) | 06 |
| 14 | cat-catalogos | D-03, D-04, D-06 (RF 022-029) | 06 |
| 15 | evt-outbox-relay | E-02 (RF 092, 093, 095) | 02 |
| 16 | aud-auditoria | E-01 (RF 084-086) | 06, 15 |
| 17 | obs-y-staging | E-03, E-04: OpenTelemetry, Sentry, staging | 15 |
| 18 | sazonpos-org-seq-cfg | C-01, C-02: CC-01, CC-03, CC-05 | 03, 12, 13 |
| 19 | sazonpos-auth | C-03: CC-10, migración a Supabase Auth | 04, 07 |
| 20 | sazonpos-permisos-sombra | C-04, Q-02, P-03: CC-02 | 06, 19 |
| 21 | sazonpos-catalogos-eventos | C-05, C-06, C-08: CC-04, CC-07 | 14, 15, 16 |
| 22 | sazonpos-shell | C-07: CC-08 | 08, 20 |
| 23 | e2e-uat-produccion-r1 | Q-01, Q-03, P-01, Q-04, P-02, P-04: E2E, UAT, producción, simulacros | todos |

## R2 y R3 (indicativo, se afinan al llegar): unos 14 specs

R2: personas-identidad, archivos, fe-emisor-boleta-factura, fe-notas-contingencia, notificaciones-correo, recordatorios-preferencias, sazonpos-personas-fe, arco-incidentes.
R3: pagos, reportes, cms, portal-cliente, soporte, obs-negocio-whatsapp.

Total estimado: unos 37 specs (23 en R0/R1).

## Reglas de esta hoja

- TR-SEG y TR-ORG se dividen en varios specs (03, 04, 06, 07, 11) porque concentran el riesgo y el mayor número de RF.
- El código de `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/codigo/` es base probada, no se copia a ciegas.
- Si cambia el plan (regla del 70 %), se actualiza esta tabla.
