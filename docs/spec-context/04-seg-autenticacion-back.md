# Contexto para el spec 04 · seg-autenticacion-back

Paquete de contexto (no es el spec). Fuentes leídas: CLAUDE.md, `docs/roadmap-specs.md`, SRS xlsx, plan docx, `3_plan.json`, PL-03..PL-06, `codigo/`. Rutas de código relativas a `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/` (abreviado `PLAN/`).

IDs reales en el SRS: `TR-RF-nnn`, `TR-CA-nnn`, `TR-RN-nnn`, `TR-RNF-nnn`. Las abreviaturas del encargo (RNF-009, etc.) son `TR-RNF-009`, etc.

## 1. Alcance y dependencias

- Roadmap: spec 04 `seg-autenticacion-back`, historias A-01, A-02, A-03, A-05 (RF 010, 017): JWKS, hook de token, espejo auth.users, MFA. Depende de 02 (supabase-y-kernel: proyectos Supabase con ES256, Data API sin esquemas de plataforma, SMTP; kernel con UnidadDeTrabajo, ContextoTenant, outbox, Resultado).
- Lo consume: 05 (auth-cliente-angular, A-04), 06 (seg-autorizacion), 07 (seg-membresias), 19 (sazonpos-auth).
- Total historias: 4 + 3 + 3 + 4 = 14 h (el techo es 10 h por spec, ver pregunta 1).
- Decisiones: ADR-29 (Supabase autentica, TR-SEG autoriza; verificación detrás del puerto `VerificadorToken`), ADR-32 (el token solo lleva `tenant_id` y `tipo_usuario`).
- Hueco de dependencias: la migración exige `org.tenant` y `seg.usuario`/`seg.membresia` (de `db/01a_org.sql` y `db/01b_seg.sql`). El roadmap pone el dominio org en el spec 03 y el dominio seg en el 06, pero 04 solo depende de 02.
- Solape: el roadmap asigna RF-010 también al spec 07 (S-04: invitar, aceptar, revocar). Aquí A-03 cubre solo el vínculo de identidad.
- Sprint del plan: S01 (R1), 2026-11-02 a 2026-11-15, 20 h de capacidad. A-04 (6 h, front) completa el sprint.

## 2. RF

| ID | Nombre | Permiso | Prioridad | Fase | Módulo / App |
|---|---|---|---|---|---|
| TR-RF-010 | Aceptar invitación y vincular identidad | `publico.invitacion.aceptar` | Must | MVP | MOD-02 / APP-05 (shell Angular) |
| TR-RF-017 | Exigir MFA para permisos sensibles | `plat.mfa.elevar` | Must | MVP | MOD-02 / APP-03 (API) |

Por el plan, ambos caen en R1, sprint 1. El SRS dice MVP; manda el plan.

**No existe en el SRS un RF de verificación de JWT/JWKS ni de hook de token.** A-01 y A-02 son historias técnicas del plan: A-01 apunta a TR-RF-010; A-02 apunta a TR-RF-015 (Calcular permisos efectivos y menú, Must MVP, permiso `plat.permiso.consultar`, RNF 001/010/101, GWT CA-041..043). TR-RF-015 pertenece al spec 06 (S-02). Aquí no se cubren sus GWT. TR-RF-016 (S-03) tampoco entra.

### TR-RF-010 Aceptar invitación y vincular identidad
- Descripción: el invitado acepta autenticándose en el IdP (OIDC) y su `sub` queda vinculado a su usuario, activando la membresía.
- Actores: usuario operativo, IdP. Precondición: invitación vigente y no usada. Proceso TR-P02. Componentes TR-SEG, TR-AUD. Reglas: TR-RN-008. RNF: TR-RNF-009, TR-RNF-014. Salida: membresía ACTIVA y usuario con acceso al producto.
- Flujo básico: (1) el invitado abre el enlace; (2) el shell redirige al IdP para iniciar sesión o crear la cuenta; (3) el IdP devuelve token con `sub` y correo verificado; (4) el sistema verifica que el correo coincida con la invitación y activa la membresía y su asignación; (5) registra el evento `ASIGNACION_OTORGADA`.
- Datos/validaciones: `token_invitacion` (cadena de un solo uso); `sub` (uuid del IdP); `correo_verificado` (booleano).

### TR-RF-017 Exigir MFA para permisos sensibles
- Descripción: exigir MFA reciente (máximo 15 minutos) antes de ejecutar acciones con permiso sensible; solicitar la elevación al IdP si no está vigente.
- Precondición: el permiso tiene `sensible = true` en el manifiesto. Regla: TR-RN-009. RNF: TR-RNF-009, TR-RNF-013. Componentes TR-SEG, TR-AUD. Salida: acción ejecutada con MFA vigente o rechazada con desafío.
- Flujo básico: (1) el guard detecta que la acción requiere un permiso sensible; (2) verifica el claim de hora de MFA (`amr`/`auth_time`) del token; (3) si supera 15 minutos responde 401 con el desafío step-up; (4) el shell redirige al IdP para el segundo factor y reintenta con el nuevo token; (5) la acción se audita con indicador de MFA.
- Datos/validaciones: `permiso` (código sensible); `auth_time` (epoch del IdP); `amr` (incluye `otp` o `webauthn`).

Contexto de ejemplo del SRS (no cargarlo al spec): sensibles = anular, reembolsar, exportar datos personales, cambiar series, otorgar roles (TR-RN-009).

## 3. Criterios GWT (texto tal cual del SRS)

**TR-CA-028 · Aceptación exitosa · Positivo · RF TR-RF-010**
- DADO QUE rosa.huaman@gmail.com tiene una invitación vigente
- CUANDO acepta e inicia sesión en el IdP con ese correo
- ENTONCES su membresía queda ACTIVA y ve el menú del perfil «Cajero»

**TR-CA-029 · Invitación vencida · Negativo · RF TR-RF-010**
- DADO QUE la invitación fue emitida hace 80 horas
- CUANDO el invitado abre el enlace
- ENTONCES el sistema muestra «La invitación expiró; solicite una nueva al administrador»

**TR-CA-030 · Correo distinto · Negativo · RF TR-RF-010**
- DADO QUE la invitación es para rosa.huaman@gmail.com
- CUANDO el invitado inicia sesión con rosa.h@hotmail.com
- ENTONCES el sistema no activa la membresía y muestra «Esta invitación pertenece a otro correo»

**TR-CA-047 · Anulación con MFA reciente · Positivo · RF TR-RF-017**
- DADO QUE la cajera completó MFA hace 5 minutos y tiene el permiso sensible rest.venta.anular
- CUANDO anula una venta
- ENTONCES la anulación se ejecuta y la auditoría registra mfa = verdadero

**TR-CA-048 · MFA vencido · Negativo · RF TR-RF-017**
- DADO QUE el último MFA del usuario fue hace 40 minutos
- CUANDO intenta exportar la lista de pacientes
- ENTONCES el sistema solicita el segundo factor y no ejecuta la exportación hasta completarlo

Estado de prueba en el SRS: todos "Pendiente". Observaciones: vacías.

Dependencias de los GWT: CA-028 (menú del perfil «Cajero») necesita permisos efectivos, roles y asignación (spec 06) y la invitación (spec 07). CA-029 necesita una regla de vigencia de invitación que el SRS no define. CA-047 necesita la bitácora/auditoría (specs 11/16) para el "mfa = verdadero". CA-048 necesita el catálogo `seg.permiso.sensible` (spec 06). Sin esos specs, 04 solo puede probar la parte de token/guard con dobles.

## 4. Reglas TR-RN y RNF

| ID | Texto corto | Aplica |
|---|---|---|
| TR-RN-009 | Permisos sensibles (anular, reembolsar, exportar datos personales, cambiar series, otorgar roles) exigen MFA con antigüedad máxima de 15 min y quedan auditados | RF-017 |
| TR-RN-008 | Asignación con rol o perfil (nunca ambos ni ninguno), alcance coherente, `hasta` no anterior a `desde` | RF-010 (referenciada por el RF; SQL ya existe en `ck_asig_rol_o_perfil`, `ck_asig_alcance`) |
| TR-RNF-009 | Autenticación OIDC centralizada; contraseñas en el IdP; bloqueo tras 5 intentos fallidos; MFA obligatorio para permisos sensibles | RF-010, RF-017 |
| TR-RNF-013 | Toda operación crítica y acceso a datos sensibles en auditoría inmutable (usuario, fecha, origen, contexto) | RF-017 (heredado también por todos los specs) |
| TR-RNF-014 | Sesiones con expiración por inactividad configurable (30 min por defecto en backoffice) y tokens de corta duración con renovación | RF-010 |
| TR-RNF-015 | Límite de tasa por IP y por usuario en endpoints públicos y de autenticación; 429 al superar el umbral | Pedido en el encargo. El SRS no la liga a RF-010 ni RF-017 (la liga a RF-049, 062, 124, 126, 131) |
| TR-RNF-101 | Permisos efectivos y menú con caché Redis; p95 < 20 ms con caché; invalidación ≤ 5 s tras el cambio | Pedido en el encargo. El SRS la liga a RF-005, 011, 012, 013, 015, 016, 032; no a RF-010/017. La caché ya está en la lib; el peso es del spec 06 |

Heredadas siempre (CLAUDE.md): RNF-001/002/003, 008, 010, 011, 012, 013 y 112, 024 y 119, 025 (dominio >= 70 %), 026, 101, 106. Relevantes aquí: 010 (aislamiento; RLS en seg), 011 (secretos: la secret key de Supabase solo en `apps/api`), 026 (logs sin datos personales; ojo con el correo del token).
TR-RN-010 (último propietario) no es de este spec (spec 07).

## 5. Historias del backlog (3_plan.json, sprint 1, R1)

| ID | Componente | RF | Tipo | h | Descripción |
|---|---|---|---|---|---|
| A-01 | TR-SEG | TR-RF-010 | Back | 4 | Verificador de JWT por JWKS (jose), guard global de autenticación y decorador @Publico |
| A-02 | TR-SEG | TR-RF-015 | Back | 3 | Hook de token personalizado: tenant_id, tipo de usuario y versión de permisos (SQL + pruebas) |
| A-03 | TR-SEG | TR-RF-010 | Back | 3 | Sincronizar auth.users con seg.usuario y vincular identidad |
| A-05 | TR-SEG | TR-RF-017 | Full | 4 | MFA TOTP: enrolar, desafiar y exigir aal2 en el backend |

Total 14 h. A-04 (shared/auth, 6 h, TR-RF-010) va al spec 05. A-05 es "Full": enrolar y desafiar son del cliente (supabase-js `mfa.*`, spec 05); aquí solo "exigir aal2 en el backend".
Riesgos del plan relevantes: dependencia de Supabase (mitigación: autenticación detrás de un puerto); capacidad de un solo desarrollador.

## 6. Tablas SQL, eventos, puertos, permisos

**Tablas/funciones (existentes en `PLAN/codigo/`)**
- `auth.users` (Supabase, solo lectura/trigger). `seg.usuario` (id = sub, email unique, nombre, tipo INTERNO|EXTERNO|SOPORTE, estado ACTIVO|BLOQUEADO|BAJA, ultimo_acceso; la migración agrega `tenant_preferido`, `creado_en`).
- `seg.membresia` (usuario, tenant, estado INVITADO|ACTIVO|SUSPENDIDO, es_propietario, invitado_por, desde, hasta; unique usuario+tenant). `seg.asignacion` (rol xor perfil, alcance, vigencia). `seg.permiso` (campo `sensible`). `seg.evento_seguridad` (tipos comentados: LOGIN, ACCESO_DENEGADO, ASIGNACION_OTORGADA, ASIGNACION_REVOCADA, ACCESO_SOPORTE). `org.tenant` (estado PRUEBA|ACTIVO|SUSPENDIDO|BAJA), `org.suscripcion`.
- Funciones: `seg.fn_auth_usuario_creado`, `seg.fn_auth_usuario_correo`, `seg.tenant_para_token`, `seg.custom_access_token_hook` (todas SECURITY DEFINER, search_path vacío); triggers `trg_auth_usuario_creado` (AFTER INSERT) y `trg_auth_usuario_correo` (AFTER UPDATE OF email) en `auth.users`.
- Privilegios: hook y `tenant_para_token` ejecutables solo por `supabase_auth_admin`; `REVOKE` a anon/authenticated sobre `seg` y `org` (Data API cerrada, regla 8).
- Falta: tabla o campo de invitación (token de un solo uso, vencimiento, correo invitado); `tenant_id` en `seg.evento_seguridad` sin FK ni RLS; `01b_seg.sql` no define RLS sobre tablas seg (solo `01a_org.sql` tiene políticas `app.tenant_id`).

**Eventos**
- SRS: `ASIGNACION_OTORGADA` (RF-010 paso 5). PL-06: `seg.membresia.invitada`. PL-05: `seg.asignacion.*` invalida la caché (consumidor `invalidar-cache-permisos.handler`). Estructura: `domain/eventos/` = membresia-invitada · asignacion-otorgada · rol-permisos-cambiados. Ninguno está implementado en `codigo/`. No existe en las fuentes un evento específico de MFA ni de login.
- Todo evento va por outbox en la misma transacción (regla 4, kernel del spec 02).

**Puertos**
- Existentes: `VerificadorToken` (`verificar(token): Promise<Principal>`, símbolo `VERIFICADOR_TOKEN`), `PermisosRepositorio`, `CachePermisos` (`permisos.port.ts`, no revisado a fondo).
- Previstos en la estructura y sin código: `proveedor-identidad` (Admin API: `inviteUserByEmail`, secret key solo en servidor), `membresia.repositorio`.

**Permisos**
- `publico.invitacion.aceptar` (RF-010) y `plat.mfa.elevar` (RF-017). En PL-06 el endpoint es `POST /v1/seg/invitaciones/aceptar`. `@Permiso(codigo, { mfa: true })` es el mecanismo actual para exigir aal2; el SRS lo quiere derivado de `sensible = true` en el manifiesto.
- Los permisos de ejemplo del código (`plat.usuario.invitar`, `plat.rol.editar`, `plat.tenant.crear`) no aparecen todos en el SRS: el SRS usa `plat.usuario.invitar`, `plat.rol.gestionar`, `plat.asignacion.otorgar`, `plat.tenant.crear`. Hay `plat.rol.asignar` en el anexo A.3 del plan y no en el SRS.

## 7. Código base relacionado

Rutas bajo `PLAN/codigo/`.

| Archivo | Qué hace | Conservar | Cambiar / falta |
|---|---|---|---|
| `supabase/migrations/20261102000000_seg_supabase_auth.sql` | tenant_preferido, espejo de auth.users, `tenant_para_token`, hook, GRANT/REVOKE | Hook, `tenant_para_token`, espejo, privilegios, regla de `tipo` solo desde `raw_app_meta_data`, SECURITY DEFINER con `search_path=''` | (a) Sin script inverso (regla 6): crear rollback en `db/rollback/` o equivalente. (b) A-02 pide "versión de permisos" en el token; el hook NO la agrega y ADR-32 dice que el token solo lleva tenant_id y tipo. (c) `fn_auth_usuario_creado` hace INSERT con `email NOT NULL`/`UNIQUE`: un usuario de `auth.users` sin correo (anónimo, teléfono) o con correo duplicado en seg haría fallar el alta en Auth. (d) Un correo que cambia a uno ya existente rompe `fn_auth_usuario_correo`. (e) No vincula invitación: solo crea `seg.usuario`; la activación de membresía no está. (f) `ultimo_acceso` nunca se actualiza. (g) Debe ir en `supabase/migrations` (regla 6). (h) Depende de 01a/01b, que el script asume ya aplicados |
| `supabase/tests/99_pruebas_auth.sql` | 16 pruebas SQL (1.1 a 6.1) con tabla temporal de resultados | Estructura de pruebas y casos: tipo no elevable, correo, tenant preferido/suspendido/vencido/bloqueado, privilegios, ejecución como `supabase_auth_admin` | No prueba: ON DELETE/anónimo sin correo, correo duplicado, idempotencia de reaplicar la migración, rollback. Usa `\o /dev/null`, `psql` y bash |
| `supabase/tests/00_simular_supabase_SOLO_PRUEBAS.sql` | Simula roles y `auth.users` mínimo | Solo para CI sin Supabase; nunca en Supabase | `auth.users` simulado tiene pocas columnas (email nullable, sin los NOT NULL reales): el riesgo (c) no se vería. Valorar probar también con `supabase start` (local) |
| `supabase/correr_pruebas.sh` | Orquesta DB temporal y scripts | Orden: 00 → 01a → 01b → migraciones → 99 | Es bash con `psql`; README dice "PostgreSQL 15+" y la regla 6 pide PostgreSQL 16 en CI. Falta integrarlo a CI (spec 01) |
| `db/01b_seg.sql` | Esquema seg completo (catálogo, roles, usuario, membresía, asignación, evento_seguridad, `permisos_efectivos`, `menu_usuario`, `sucursales_accesibles`) | Es la base de datos de seg; aquí solo se usa usuario, membresía, evento_seguridad, permiso | Cabecera dice "Keycloak o Supabase Auth"; sin rollback; sin RLS; `permisos_efectivos` y demás no son SECURITY DEFINER ni tienen `search_path` fijo. Qué parte entra en 04 y qué en 06 está por decidir |
| `db/01a_org.sql` | Esquema org con RLS (`app.tenant_id`) | Prerrequisito | Dominio org es del spec 03 |
| `libs/plataforma/seguridad/src/infrastructure/supabase-jwks.verificador.ts` | `jose` `createRemoteJWKSet` (caché 10 min, cooldown 30 s) + `jwtVerify` (iss, aud `authenticated`, ES256/RS256, tolerancia 5 s, claims requeridos sub/exp/iat/session_id/aal), rechaza role≠authenticated y anónimos; mapea a `Principal` | Casi todo: algoritmos, claims, mapeo defensivo de `tipo_usuario` (valor inválido pasa a EXTERNO) y `aal` | (a) Mueve a `infrastructure/supabase/` como dice la estructura. (b) No lee `amr`/`auth_time`: sin eso RF-017 (15 min) no es posible; `Principal` no tiene campo. (c) No revisa `session_id` contra revocación (sesión cerrada sigue valiendo hasta exp). (d) Permite RS256 aunque el proyecto usa ES256 (decisión: acotar). (e) Ninguna métrica/log |
| `.../interface/autenticacion.guard.ts` | Guard global: omite `@Publico`, exige `Bearer`, pone `req.principal`, 401 con mensaje del motivo | Lógica base | Mensaje 401 expone el motivo (`Token inválido: firma`), valorar respuesta uniforme. No registra intentos fallidos (RNF-009/015). Sin rate limit. Depende de Express (`req.headers`) en capa interface (aceptable) |
| `.../interface/decoradores.ts` | `@Publico`, `@Permiso(codigo, {mfa})`, `@UsuarioActual` | Los tres | `mfa` se declara a mano por endpoint, no desde `seg.permiso.sensible`. Falta decorador/metadata de OpenAPI (regla 5) y el `@Permiso` ya es del spec 06 |
| `.../interface/permiso.guard.ts` | Tenant, `X-Sucursal-Id`, aal2 si `mfa`, permisos efectivos, 403 con `codigo` | Fuera de alcance de 04, pero hoy implementa el "exigir aal2" de A-05 | Para RF-017: solo mira `aal === 'aal2'`, no antigüedad; responde 403 `MFA_REQUERIDA`, el SRS dice 401 con desafío step-up; no audita con indicador MFA; chequea MFA antes de resolver permisos (sin sucursal ya devuelve SIN_SUCURSAL primero) |
| `.../domain/principal.ts` / `errores.ts` | `Principal` (usuarioId, tenantId, tipo, aal, sesionId, email), `tieneMfa`; errores `TokenInvalidoError`, `AccesoDenegadoError` | Dominio sin NestJS | Añadir `authTime`/`mfaEn` (o `amr`) y un código de error de step-up |
| `.../test/seguridad.integracion.spec.ts` | 18 pruebas con JWKS local (http) y Nest + supertest; `PermisosRepositorio` y caché en memoria | Casos 01-10, 15, 16, 18 (el 17 es de spec 06) y la técnica del JWKS local | Corre con `tsc` + `node` propio, no con el runner de Nx/CI. No hay pruebas con PostgreSQL ni con el hook real; faltan: aal2 expirado (>15 min), `amr`, `auth_time`, rotación de `kid`, caída del JWKS |
| `.../seguridad.module.ts`, `index.ts` | Módulo dinámico con `APP_GUARD` en orden Autenticación → Permiso | Cableado con `useFactory` | `index.ts` exporta `PermisosSqlRepositorio` y `CachePermisosRedis` desde el barrel (regla 1 ok). Falta `PermisoGuard` en el barrel. El guard de permiso se registra con el segundo parámetro por defecto (no cablea `registrar` hacia `seg.evento_seguridad`) |
| `.../package.json`, `tsconfig.json` | npm, ESM, jose 6.2.12, Nest ^12.2.0, TS ~5.9.3 | Versiones | Proyecto usa pnpm + Nx: convertir a `project.json` con etiquetas `scope:plataforma`, `type:backend`. `rootDir: "."` mezcla src y test |

**Versiones**: la lib backend usa NestJS 12.2 y TS 5.9, de acuerdo con el proyecto (NestJS 12). La lib `libs/shared/auth` (spec 05, no spec 04) dice verificar contra Angular 22.2; el proyecto usa Angular 21: no hay código Angular en el alcance de 04. El LEEME y el plan hablan de Angular 22 en PL-03 y PL-04 (subgrafo "Frontends Angular 22").

Archivos del código base **no** incluidos en 04: `permisos.sql.repositorio.ts`, `cache-permisos.*.ts`, `resolver-permisos.use-case.ts` (spec 06); `libs/shared/auth/*` (spec 05).

## 8. Diagramas relevantes

- **PL-03** (arquitectura): Supabase Auth (login, OAuth, MFA TOTP) → hook `seg.custom_access_token_hook` (+tenant_id, tipo_usuario) → JWT; `AutenticacionGuard` verifica firma, iss, aud, exp con JWKS (caché 10 min) → `PermisoGuard` → `ResolverPermisosUseCase` (Redis). SazónPOS usa el mismo JWKS.
- **PL-04** (secuencia ingreso con MFA): `signInWithPassword/OAuth` → Auth invoca hook → token aal1 → si `nextLevel = aal2`, `mfa.challenge` + `mfa.verify` → Auth invoca hook de nuevo → token aal2 → `GET /v1/seg/mi-contexto`. Nota: `/v1/seg/mi-contexto` es del spec 06 (`obtener-mi-contexto`).
- **PL-05** (solicitud autorizada): `jwtVerify(ES256, iss, aud, exp)` → 401 si falla; `PermisoGuard` valida tenant, `X-Sucursal-Id` y MFA si el permiso es sensible; 403 `SIN_PERMISO` registra `ACCESO_DENEGADO`; RLS con `SET LOCAL app.tenant_id`; la caché es del spec 06.
- **PL-06** (invitación): relevante para A-03 y RF-010: invitación por Admin API, trigger → `seg.usuario`, membresía INVITADO, `POST /v1/seg/invitaciones/aceptar` → ACTIVO + `tenant_preferido`, `refreshSession()` para que el token traiga `tenant_id`. Si el correo ya existe, solo se agrega la membresía.
- PL-10 (orden de construcción): K → ORG → SEG → CFG/SEQ/CAT/AUD. PL-07 (migración de usuarios SazónPOS, CC-10) no aplica a 04, pero fija que el espejo debe aceptar usuarios importados con el mismo UUID y hash bcrypt (impacta el trigger de A-03: el INSERT masivo en `auth.users` dispara `fn_auth_usuario_creado`).

## 9. Ambigüedades y preguntas candidatas (Fase 2 de /spec)

**Ambigüedades detectadas**
1. A-02 dice "versión de permisos" en el token; ADR-32 y el hook entregado dicen solo `tenant_id` y `tipo_usuario`.
2. A-02 está mapeada a TR-RF-015 y A-01 a TR-RF-010, pero ninguna tiene un RF propio de verificación/hook en el SRS.
3. RF-010 está en A-03 (spec 04) y en S-04 (spec 07); los GWT CA-028..030 dependen de la invitación, el menú y la vigencia de la invitación.
4. El SRS no define cuánto dura una invitación (CA-029 usa 80 h como vencida) ni dónde se guarda `token_invitacion`; Supabase maneja su propio enlace.
5. RF-017 pide 401 con desafío step-up y verificación de `amr`/`auth_time` ≤ 15 min; el código entrega 403 `MFA_REQUERIDA` con solo `aal2`.
6. El SRS dice IdP OIDC genérico (`sub`, `auth_time`, `amr`); el plan usa Supabase (`aal`, `session_id`). El mapeo de `amr` de Supabase está sin verificar (usar `ctx7` sobre la doc de Supabase Auth al redactar el spec).
7. RNF-014 (inactividad 30 min) y RNF-009 (bloqueo tras 5 intentos) son configuración de Supabase Auth; algunas opciones de sesión pueden depender del plan (dev y staging están en Free según el plan). Verificar.
8. RNF-015 y RNF-101 no están ligados a RF-010/017 en el SRS.
9. Quién crea las tablas base `org`/`seg` antes de la migración (specs 03 y 06 vs. 04).

**Preguntas candidatas y recomendación**

1. **Tamaño**: las cuatro historias suman 14 h frente al techo de 10 h. ¿Se divide (por ejemplo 04a A-01+A-02, 04b A-03+A-05) o se acepta 14 h? Recomendación: mantener un spec pero con A-05 limitado a "exigir aal2/antigüedad en backend" (enrolar y desafiar quedan en spec 05); si aun así excede, partir en dos. Decidir con el usuario.
2. **Prerrequisito de esquema**: ¿04 aplica `db/01a_org.sql` y `db/01b_seg.sql` tal cual (con rollback) o espera a 03/06? Recomendación: 04 no define dominio; usa `01a`/`01b` como migraciones base ya existentes en `db/` (con script inverso) y declara explícitamente que 03 y 06 las extienden. Pedir al usuario que confirme el orden de implementación real (03 antes de 04).
3. **Hook**: ¿se agrega "versión de permisos" al token (A-02) o se mantiene el hook como está (ADR-32)? Recomendación: no agregarla; actualizar el texto de A-02 y dejar la invalidación por evento (PL-05). Menos claims y sin refrescar tokens al cambiar permisos.
4. **MFA**: ¿se verifica la antigüedad (≤ 15 min con `amr[].timestamp`/`auth_time`) y se responde 401 con desafío step-up, o solo `aal2` y 403 como hoy? Recomendación: cumplir el SRS: 401 con `WWW-Authenticate`/cuerpo `{codigo:'MFA_REQUERIDA', max_age:900}`, ventana configurable por parámetro (default 15 min), y `Principal.mfaEn`. Validar el formato real de `amr` con la doc de Supabase antes de fijar el contrato.
5. **Fuente de "sensible"**: ¿`@Permiso(..., {mfa:true})` por endpoint o `seg.permiso.sensible` (manifiesto)? Recomendación: en 04 mantener el flag del decorador como mecanismo y definir el puerto `CatalogoPermisosSensibles`; el cableado a `seg.permiso.sensible` se hace en spec 06 con el manifiesto.
6. **Alcance de RF-010 en 04**: ¿qué parte entra aquí? Recomendación: 04 solo vincula identidad (trigger, `sub` = `seg.usuario.id`, correo normalizado, política de correo ausente/duplicado) y deja el caso de uso `aceptar-invitacion` (membresía ACTIVO, evento, `tenant_preferido`, vigencia) a 07; CA-028..030 se cierran en 07 y aquí se prueban solo los fragmentos de identidad/token. Alternativa: pasar CA-028..030 enteros a 07.
7. **Fallos del trigger**: ¿cómo se comporta el espejo con usuarios sin correo (anónimos/teléfono) o correo duplicado? Recomendación: ignorar anónimos (`is_anonymous`) y sin correo, y para duplicados fallar de forma controlada (no bloquear el alta en Auth sin registro) con evento en `seg.evento_seguridad`; agregar pruebas SQL. Confirmar con el usuario si se permite registro abierto en Supabase o solo por invitación (recomendado: deshabilitar signup abierto).
8. **Pruebas y CI**: ¿cómo corren? Recomendación: SQL con PostgreSQL 16 en CI (migrar `correr_pruebas.sh` a un target Nx); integración Nest con el runner del monorepo (Vitest/Jest, el que defina el spec 01) en vez de `tsc && node`; añadir un caso de integración con un token real del hook en Supabase dev como prueba de humo manual en staging.
9. **Rate limit y auditoría (RNF-015, RNF-013)**: ¿entran en 04? Recomendación: RNF-015 con límite en NestJS solo para los endpoints públicos que cree 07 (aceptar invitación); el límite de Auth lo da Supabase; no implementarlo aquí. La auditoría de MFA (`mfa = verdadero`) se emite como evento por outbox y la consume AUD (spec 16); 04 deja el evento.
