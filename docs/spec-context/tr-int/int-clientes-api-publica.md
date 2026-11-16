# Contexto para int-clientes-api-publica

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores), `plan.md` (R4), `3_plan.json`, `docs/ops/supabase-ambientes.md`, specs 05, 07, 18b, 21.

## 1. Alcance y dependencias
- Componente TR-INT (MOD-20), proceso TR-P12. Clientes OAuth2 `client_credentials` por tenant y la API pública `/v1` con alcances, límite por plan, paginación por cursor y cabeceras de deprecación.
- Release: plan **R4 (backlog 2028)**: «TR-INT (API pública y webhooks salientes)». SRS: Must/R2.
- Historia: ninguna. Horas estimadas: 16-18 h.
- Dependencias: SEG (05 verificador JWKS, 07 `@Permiso` y contexto de tenant), ORG (plan de la suscripción, spec 03/12), AUD (20a, cada operación de cliente auditada), OBS (21, `trace_id` en errores), Redis (límite por minuto, como el bloqueo de 18b).
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| A | int-clientes-api | 130 (+ emisión de token) | 8-9 | 07, 12, 20a, 17c (UI) |
| B | int-api-publica-limites | 131 | 8-9 | A, 21 |

- A, áreas: (a) agregado `ClienteApi` (alcances, IPs CIDR, secreto con hash, rotación, revocación); (b) endpoint de token `client_credentials` que emite JWT propio; (c) UI en `admin-cliente`.
- B, áreas: (a) guard de cliente de API (token, alcance, IP) que arma el contexto de tenant; (b) límite por plan en Redis con 429 + `Retry-After` y `X-Idempotency-Key` en escrituras; (c) convención de paginación por cursor y cabeceras `Deprecation`/`Sunset` + contrato OpenAPI en CI.
- Fuera de alcance: endpoints de negocio de cada producto (`/v1/eco/pedidos` es de ECO; aquí solo la infraestructura y una ruta de plataforma de ejemplo), webhooks (`int-webhooks-salientes.md`), sincronización por cursor (`int-sincronizacion-cursor.md`), portal de desarrolladores, cliente GitHub de la hoja Componentes (sin RF en MOD-20).
- Constitución: 1, 2, 3, 5 (alcances con formato `producto.recurso.accion`; endpoints con OpenAPI bajo `/v1`), 6, 8, 9 (secreto de firma del token solo por entorno), 10; código limpio; diseño UI (pantalla tipo lista + panel lateral) en A.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-130 | Registrar clientes de API | plat.integracion.cliente | APP-02 | TR-RN-044, 009 | TR-RNF-113, 022 | Administrador del cliente |
| TR-RF-131 | Exponer API pública versionada con límites | alcance OAuth2 de la operación | APP-03 | TR-RN-044 | TR-RNF-022, 118, 015 | Sistema institucional o integrador |

- **130** precondición: el plan incluye la API pública. Flujo: registra nombre y alcances → genera `client_id` y secreto (se muestra una vez) → restringir IP, rotar o revocar → cada operación se audita. Datos: nombre (3-120), alcances[] (p. ej. `eco.pedidos.leer`), ips_permitidas[] (CIDR), client_id (generado), secreto (hash). Relacionados: TR-INT, TR-SEG, TR-AUD.
- **131** precondición: el integrador obtuvo token con client_credentials. Flujo: pide token y llama → la pasarela valida token, alcance e IP y aplica el límite del plan → ejecuta con contexto de tenant del cliente → responde paginado o error estándar, con `Deprecation`/`Sunset` si aplica. Datos: `Authorization: Bearer`, `X-Idempotency-Key` (escrituras), `limit` (1-100), `cursor` (opaco), error (codigo, mensaje, trace_id). Relacionados: TR-INT, TR-SEG, TR-OBS.

## 3. Criterios GWT
- **TR-CA-315** (130, Positivo, «Integración con ERP»): tenant de ECO con API en el plan | registra «ERP contable» con `eco.pedidos.leer` | se genera client_id y el secreto se muestra una sola vez.
- **TR-CA-316** (130, Negativo, «Alcance de producto no contratado»): el tenant no tiene CLI | intenta `cli.citas.leer` | no se muestra ni se acepta.
- **TR-CA-317** (131, Positivo, «Consulta paginada»): token con `eco.pedidos.leer` | `GET /v1/eco/pedidos?limit=50` | 50 pedidos del tenant y cursor siguiente.
- **TR-CA-318** (131, Negativo, «Exceso del límite»): BASICO permite 60/min | solicitud 61 | 429 con `Retry-After`.
- **TR-CA-319** (131, Negativo, «Alcance insuficiente»): token solo `eco.pedidos.leer` | `POST /v1/eco/pedidos` | 403 con el alcance faltante.

Faltan y se proponen: IP fuera de las permitidas (403 `IP_NO_PERMITIDA`); secreto rotado: el anterior deja de emitir tokens (o convive N minutos, P3); cliente revocado no obtiene token y sus tokens vigentes se rechazan; token de cliente del tenant A no lee datos de B (RNF-010); `X-Idempotency-Key` repetida devuelve la misma respuesta sin duplicar; endpoint deprecado devuelve `Deprecation` y `Sunset` ≥ 6 meses (RNF-118); el secreto nunca aparece en logs ni en la auditoría.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-044 | API pública con OAuth2 client_credentials, alcances por tenant y producto; límite según plan; versión retirada anunciada con ≥ 6 meses. |
| TR-RN-009 | Permisos sensibles con MFA ≤ 15 min y auditados (registrar, rotar y revocar clientes deberían ser sensibles). |
| TR-RNF-113 | Secretos del tenant cifrados con clave por tenant en gestor de secretos y rotables sin interrupción; 0 en texto plano. |
| TR-RNF-022 | API REST con OpenAPI 3, versionada `/v1`, contrato verificado en CI. |
| TR-RNF-118 | Cabeceras `Deprecation` y `Sunset` con ≥ 6 meses. |
| TR-RNF-015 | Límite de tasa por IP y usuario en endpoints públicos y de autenticación; 429. |

Heredados por CLAUDE.md: 001/002/003, 008, 010, 011, 012, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog
Sin historia (R4). Relacionadas: spec 18b (límite de fuerza bruta en Redis, `trust proxy` pendiente), spec 21 (`trace_id`), spec 17c (CORS por `ORIGENES_PERMITIDOS`).

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta: `db/04b_int.sql` (prefijo 04 = R4, a confirmar).
- `int.cliente_api` (id, tenant_id, nombre, client_id UNIQUE, secreto_hash (argon2id o SHA-256 con sal, P2), secreto_anterior_hash NULL + vence_en, alcances text[], ips_permitidas cidr[], estado ACTIVO|REVOCADO, creado_por, version). RLS `ENABLE + FORCE` por `app.tenant_id`; el endpoint de token busca por `client_id` con función `SECURITY DEFINER` (como `seg.accesos_soporte_de_agente`).
- `int.idempotencia` (tenant_id, cliente_id, clave, hash_solicitud, respuesta jsonb, creada_en; TTL 24 h) o en Redis (P5).
- `int.alcance` catálogo: derivado de los permisos del manifiesto de cada producto marcados como «públicos», filtrado por productos contratados (TR-CA-316).
- **Eventos**: `integracion.cliente_registrado`, `integracion.cliente_revocado`, `integracion.secreto_rotado` (para auditoría por outbox, como ORG). Nombres propuestos.
- **Puertos**: `EmisorTokenCliente` (firma JWT ES256 con llave propia de la API, distinta de la de Supabase), `VerificadorTokenCliente` (JWKS propio en `/.well-known/jwks.json` o verificación local), `LimitadorSolicitudes` (Redis, ventana por minuto), `ProductosContratados` (lee la suscripción).
- **Permisos**: `plat.integracion.cliente` (sensible: MFA). Los alcances del token (`eco.pedidos.leer`) no son permisos de usuario: `@Permiso` debe aceptar también un principal de cliente de API (P1).
- **Límites por plan**: `org.suscripcion.plan` ∈ BASICO|PRO|EMPRESA; TR-CA-318 fija BASICO = 60/min. Los demás valores no están en el SRS.

## 7. Código base relacionado
- **Se reutiliza**: `seguridad` (`AutenticacionGuard` con JWKS solo ES256 del spec 05, `Principal`, `@Permiso`, `@Publico`; `ContadorIntentos` en Redis del 18b como patrón del limitador); `kernel-infra` (`AlsTenantContext`, `HttpExceptionFilter` con forma de error, `traceIdActivo`); `auditoria` (`@Auditable`); `observabilidad` (`CAMPOS_SENSIBLES` debe incluir `secreto`, `client_secret`); `shared/ui` (`vit-tabla`, `PanelLateralService`, `AvisosService`, `vit-destructivo` para revocar).
- **Ojo**: el `AutenticacionGuard` actual exige claims de Supabase (`session_id`, `aal`, `role = authenticated`): un token de cliente necesita un guard o una rama propia.
- **Falta**: lib `integracion`, migración, emisor de tokens, gestor de secretos (RNF-113 no tiene implementación en el repo; hoy los secretos van por entorno), convención de paginación por cursor (las listas actuales usan `pagina`/`tamano`, p. ej. `libs/plataforma/auditoria/src/domain/filtro-auditoria.ts`).

## 8. Diagramas relevantes
- `01-analysis/.../3_Integracion_BD_Institucional/INT-03_Secuencia_de_sincronizacion_por_cursor_nube_SQL_Server.mmd` (token client_credentials con `scope sync:read` ante el IdP).
- `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/1_Mermaid/PL-05_Secuencia_solicitud_autorizada_en_la_API.mmd` (guard + permiso + transacción).
- `.../PL-03_Autenticacion_con_Supabase_Auth_y_autorizacion_propia.mmd`.

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- INT-03 dibuja un «Proveedor de identidad» que emite el token; Supabase Auth no ofrece `client_credentials` para máquinas de un tenant.
- La API pública «de cada producto» mezcla rutas de producto con infraestructura de plataforma.
- RNF-113 pide gestor de secretos con clave por tenant; no existe en el repo.
- Límites de PRO y EMPRESA no están definidos.

Preguntas, con recomendación:
1. ¿Quién emite el token? Recomendación: la API NestJS (`POST /v1/oauth/token`, `grant_type=client_credentials`), JWT ES256 de 15 min con `tenant_id`, `client_id` y `scope`; llave propia por entorno y JWKS publicado. `AutenticacionGuard` distingue por `iss`.
2. ¿Hash del secreto? Recomendación: secreto aleatorio de 32 bytes, guardado como SHA-256 con sal por cliente (es de alta entropía; argon2 no aporta y cuesta CPU en cada token).
3. ¿Rotación sin interrupción? Recomendación: el secreto anterior sigue válido 24 h tras rotar (`secreto_anterior_hash`, `vence_en`), auditado.
4. ¿Alcances vs permisos? Recomendación: el manifiesto del producto marca qué permisos son publicables como alcance; `@Permiso('eco.pedidos.leer')` acepta un principal de cliente cuyo `scope` lo incluya, sin sucursal salvo que el alcance la lleve.
5. ¿Idempotencia en Redis o tabla? Recomendación: tabla `int.idempotencia` con TTL por tarea diaria; la respuesta debe sobrevivir a reinicios de Redis.
6. ¿Límites por plan? Recomendación: parámetros CFG por plan (`plat.api.solicitudes_por_minuto`), BASICO 60, PRO 300, EMPRESA 1 200 como propuesta a confirmar.
7. ¿Cursor? Recomendación: cursor opaco base64url de `(orden, id)`, firmado o validado; convención en `libs/shared/contracts` para que todos los productos la sigan.
