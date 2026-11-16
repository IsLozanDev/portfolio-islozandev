# Contexto para por-registro-ingreso-otp

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (Actores, Procesos, Reglas de negocio, RF, Criterios GWT, RNF, Componentes, Consumidores), `plan.md` (sección 3 Supabase Auth, ADR-29, ADR-32, anexo A), `componentes.md` 4.8 (tipos de usuario), `3_plan.json`, PL-03, PL-04, PL-10, T-08, A-05, `specs/04`, `05`, `13`, `14`, `18b`, código real del repo, doc de Supabase Auth (ctx7, configuración SMS OTP).

## 1. Alcance y dependencias
- Historia R3-07 (sprint 22, R3, 10 h, Full): "Portal del cliente final: registro, ingreso con OTP, perfil, consentimientos" (RF 125, 126, 127, 129). Este paquete cubre RF-125 y RF-126; perfil y consentimientos en `por-perfil-consentimientos.md`.
- PL-10: `CMS --> POR` y `PER --> POR`. Dependencias reales: TR-SEG (specs 04, 05, 18b: hook, espejo, verificador, ingreso por la API con bloqueo en Redis), TR-CMS parte A (resolver tenant por host del sitio) y parte C (app SSR donde se monta el portal), TR-PER (R2-01: buscar o crear persona y registrar consentimiento), TR-NOT (R2-09 correo de bienvenida; SMS sin historia; WhatsApp R3-11 en sprint 24, después de R3-07).
- Encaje con la autenticación (clave del paquete):
  - ADR-29: Supabase Auth autentica también al cliente final (mismo IdP, `componentes.md` 4.8: "Autorregistro en el portal ... mismo IdP"); TR-SEG no le da roles: el acceso es "solo a sus propios datos mediante su vínculo con Personas; sin backoffice".
  - ADR-32: el token sigue con `tenant_id` y `tipo_usuario`. El cliente final es `tipo_usuario = EXTERNO`, que el espejo ya asigna por defecto (`seg.fn_auth_espejar_usuario`) y el verificador ya mapea (spec 05).
  - Hoy el hook saca `tenant_id` de `seg.membresia`; un cliente final no tiene membresía, así que su token llega con `tenant_id = null`. Una misma cuenta puede ser cliente de varios tenants (TR-CA-312). Ver P1.
- Partición propuesta (estimación 14 h frente a la parte proporcional del plan, ~5 h):

| Parte | Slug | Alcance | h | Depende de |
|---|---|---|---|---|
| H1 | por-cuentas-registro-otp | Esquema `por`, `CuentaCliente`, ajustes de espejo y hook, registro por la API (correo, Google, celular), OTP por la API con intentos, `CuentaClienteGuard` | 9 | 05, 18b, CMS A, TR-PER |
| H2 | por-portal-acceso-ui | Lib `plataforma/portal-cuenta`: páginas registrarse, ingresar con OTP (cuenta regresiva), callback Google, aceptación de política; montada en la app SSR | 5 | H1, CMS C |

- Áreas de H1: (a) dominio y DDL `por.cuenta_cliente` + cambios en Supabase (espejo de usuarios sin correo, tipo EXTERNO por app_metadata); (b) casos de uso `RegistrarCliente`, `SolicitarOtp`, `VerificarOtp` con puertos; (c) HTTP `/v1/portal/*` y guard por cuenta + host.
- Fuera de alcance: perfil, consentimientos, ARCO desde el portal (`por-perfil-consentimientos.md`); mis transacciones (`por-mis-transacciones.md`); identidad portable y "mis autorizaciones" (RF-051, R4); MFA del cliente final; recuperación de clave propia (la da Supabase).
- Constitución: reglas 1-11 (la regla 2: Supabase solo en `infrastructure/supabase` y `supabase/`); estructura de libs Angular; verificación Playwright; DoD.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-125 | Registrar cliente final en el portal | publico.portal.registro | APP-05 | TR-RN-043, 030 | TR-RNF-009, 016, 019 | Cliente final / titular de datos, Proveedor de identidad OIDC |
| TR-RF-126 | Ingresar al portal con OTP | publico.portal.otp | APP-05 | TR-RN-043 | TR-RNF-015, 009 | Cliente final / titular de datos, Proveedor de mensajería |

Ambos Must, fase SRS MVP (plan R3), módulo MOD-19, IA No. Procesos: 125 TR-P07 y TR-P10; 126 TR-P07.
- **125** precondición: el tenant tiene el portal habilitado en su producto. Flujo: 1) elige método (CORREO|GOOGLE|OTP_CELULAR); 2) acepta la política vigente y, opcional, otras finalidades; 3) el IdP crea la cuenta EXTERNO "en el realm de clientes"; 4) se busca la persona por documento, correo o celular y se vincula, o se crea; 5) bienvenida. Datos: `metodo`, `correo`, `celular` (9 dígitos), `tipo_documento`, `numero` (opcionales, para vincular), `acepta_privacidad` (obligatorio, versión). Salida: cuenta de cliente externo vinculada a su persona. Componentes: TR-POR, TR-SEG, TR-PER.
- **126** precondición: el celular está asociado a una cuenta del portal. Flujo: ingresa celular; se genera OTP, se envía (SMS o WhatsApp) con límite de tasa; ingresa el código; si es correcto, el IdP emite la sesión. Datos: `celular`, `codigo` (6 dígitos), `intentos` (máx. 3), `expira_en` (5 min), `reenvio_disponible_en` (60 s). Componentes: TR-POR, TR-SEG, TR-NOT.
- Interfaz (hoja Componentes): TR-POR provee la librería Angular `portal-shell` (registro, OTP, perfil, consentimientos, mis transacciones, mis autorizaciones). Consumidores: "Librería portal-shell montada en `<cod>-web`"; el plan la llama `portal-cuenta`.

## 3. Criterios GWT
- **TR-CA-304** (125, Positivo, "Registro con Google"): Carlos Rojas sin cuenta se registra con Google aceptando la política -> cuenta creada y vinculada a su ficha existente por correo.
- **TR-CA-305** (125, Negativo, "Sin aceptar la política"): registro con correo sin aceptar -> no se crea la cuenta.
- **TR-CA-306** (126, Positivo, "Ingreso correcto"): socio con celular 987654321 ingresa el código dentro de 5 min -> accede al portal.
- **TR-CA-307** (126, Negativo, "Tercer intento fallido"): tras 2 fallos, un tercer código incorrecto -> el código se invalida y debe pedir uno nuevo.
- **TR-CA-308** (126, Borde, "Reenvío antes de 60 segundos"): código enviado hace 30 s -> el botón muestra la cuenta regresiva y no se envía otro.

Estado: Pendiente. Faltan (proponer): código vencido a los 5 min; celular sin cuenta (respuesta que no revela si existe); cuenta de un tenant que entra al portal de otro tenant (debe registrarse ahí, TR-RNF-010); `raw_user_meta_data.tipo_usuario = INTERNO` no eleva el tipo (ya probado en spec 04, reafirmar para el registro); usuario INTERNO que también es cliente; límite de tasa por IP en solicitar OTP (TR-RNF-015, 429); registro con documento que vincula persona existente.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-043 | Registro exige aceptar la política vigente; OTP 6 dígitos, vigencia 5 min, máx. 3 intentos; reenvío bloqueado 60 s. |
| TR-RN-030 | Consentimiento libre, previo, expreso, informado, por finalidad; versión del texto, fecha y canal; revocable. |
| TR-RNF-009 | Autenticación OIDC centralizada; contraseñas en el IdP; bloqueo tras 5 intentos; MFA para permisos sensibles. |
| TR-RNF-015 | Límite de tasa por IP y por usuario en endpoints públicos y de autenticación (429). |
| TR-RNF-016 | Ley 29733 y D.S. 016-2024-JUS. |
| TR-RNF-019 | Portales WCAG 2.1 AA (axe-core en CI). |
| TR-RNF-010 | Aislamiento por tenant: la cuenta de cliente es por tenant. |
| TR-RNF-026 | Ni el código OTP, ni el celular, ni el correo en claro en logs, Redis u outbox (mismo criterio que 18b). |

Heredados por CLAUDE.md: 001/002/003, 008, 011, 012, 013/112, 024/119, 025, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | RF | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-07 | 22 | 10 | TR-POR | Portal del cliente final: registro, ingreso con OTP, perfil, consentimientos | TR-RF-125, 126, 127, 129 | Full | R3 |

Relacionadas: R2-01 (personas y consentimientos), R2-09 (correo), R3-11 (WhatsApp, sprint 24), R3-05/06 (CMS), A-01..S-02 de R0 (verificador, guards). Sprint 22: 23/08/2027-05/09/2027.

## 6. Tablas SQL, eventos, puertos y permisos
- **Esquema `por`** (nuevo; `db/01<letra>_por.sql` + rollback + test, letra siguiente a las de CMS): `por.cuenta_cliente` (id, tenant_id, usuario_id -> seg.usuario, persona_id -> TR-PER, sitio_id -> cms.sitio, estado ACTIVA|BLOQUEADA|BAJA, metodo_registro, politica_version, registrada_en; UNIQUE `(tenant_id, usuario_id)`). Es el agregado `CuentaCliente` de T-08. RLS por tenant; REVOKE a `anon, authenticated`.
- **Cambios en Supabase** (`supabase/migrations/<fecha>_por_clientes.sql` + rollback): hoy `seg.fn_auth_usuario_creado` no espeja usuarios sin correo y `seg.usuario.email` es NOT NULL; un registro solo con celular no tendría `seg.usuario`. Opciones en P2. El hook no cambia si se adopta P1 (tenant por host).
- **OTP**: estado del código en Redis (`ContadorIntentos` por celular hasheado, ventana de reenvío), no en tabla.
- **Eventos**: SRS no define eventos de TR-POR. Propuesto `cuenta_cliente.registrada` (para bienvenida por TR-NOT y para el producto). TR-PER publica `persona.registrada` y el consentimiento.
- **Puertos** (lib `libs/plataforma/portal`, comp:por; `estructura_backend.txt`: `portal/ (R3) TR-POR`): `ProveedorIdentidadClientes` (crear usuario con Admin API y `app_metadata.tipo_usuario = EXTERNO`, enviar y verificar OTP de teléfono, en `infrastructure/supabase`), `PersonasPort` (TR-PER), `ResolutorSitio` (CMS: host -> tenant, sitio), `PoliticaPrivacidadPort` (versión vigente, TR-PER/consentimientos), `NotificacionesPort` (bienvenida).
- **Permisos**: `publico.portal.registro`, `publico.portal.otp` (SRS). El manifiesto de plataforma solo tiene códigos `plat.*`; el guard `@Permiso` resuelve permisos por rol y sucursal, que un cliente final no tiene (ver P4).
- **Endpoints** propuestos: `POST /v1/portal/registro`, `POST /v1/portal/otp/solicitar`, `POST /v1/portal/otp/verificar` (`@Publico`, límite de tasa, devuelven sesión como `POST /v1/seg/auth/ingresar` de 18b); `GET /v1/portal/mi-cuenta` con `CuentaClienteGuard`.
- **Etiquetas Nx**: back `scope:plataforma, type:backend, comp:por`; front `libs/plataforma/portal-cuenta` `type:feature`.

## 7. Código base relacionado
- **Existe y se reutiliza**: `supabase/migrations/20261102000000_seg_supabase_auth.sql` (espejo, `tenant_para_token`, hook; tipo solo desde `raw_app_meta_data`, por defecto EXTERNO); `db/01b_seg.sql` (`seg.usuario.tipo` INTERNO|EXTERNO|SOPORTE); `libs/plataforma/seguridad` (`Principal`, `TipoUsuario`, `Publico`, `AutenticacionGuard`, `SupabaseJwksVerificador`); internos de seguridad no exportados por `index.ts`: `ProveedorIngreso` (GoTrue), `ContadorIntentos` (Redis), controlador `seg/auth/ingresar` (spec 18b) — patrón directo para OTP por la API; `libs/shared/auth` (`SesionService.establecerSesion`, `anonimoGuard`, `autenticadoGuard`, `CONFIG_AUTH`, `ProveedorExterno`); `libs/shared/auth-ui` (pantallas de ingreso de backoffice, referencia, no se reutilizan tal cual).
- **Código base del plan**: `docs/.../codigo/supabase/migrations/20261102000000_seg_supabase_auth.sql`, `codigo/supabase/tests/99_pruebas_auth.sql` (patrón de pruebas del hook, incluida la 1.2 de tipo manipulado).
- **Falta**: esquema `por`, lib `portal`, `portal-cuenta`, proveedor SMS en Supabase, TR-PER, TR-NOT, CMS.

## 8. Diagramas relevantes
- `1_Mermaid/PL-03_Autenticacion_con_Supabase_Auth_y_autorizacion_propia.mmd`, `PL-04_Secuencia_ingreso_con_MFA_y_token_con_tenant_activo.mmd`, `PL-10_...mmd`.
- `.../2_Plataforma_Transversal/T-08_...CMS_y_portal_del_cliente.mmd` (CuentaCliente -> Usuario externo, Persona, Sitio).
- `.../2_Plataforma_Transversal/T-05_Modelo_de_dominio_Personas_e_identidad.mmd`.
- `.../5_Componentes_Transversales/TR-07_Registro_del_cliente_tenant_e_invitacion_de_usuarios.mmd`.
- `.../1_Arquitectura/A-05_...mmd` (`psi-web` monta `portal-cuenta`).

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- El SRS habla de "realm de clientes" (Keycloak); con Supabase hay un solo `auth.users` por ambiente para internos y clientes de todos los tenants.
- `enable_signup = false` (spec 04) impide el registro con Google desde el navegador: Supabase no crea usuarios nuevos por OAuth con el registro cerrado.
- Supabase SMS OTP trae longitud 6, vigencia configurable y espera de reenvío de 60 s por defecto, pero no un tope de 3 intentos por código (solo límite de verificaciones por IP).
- El plan dice "MFA por SMS no es necesario y agregaría costo de mensajería": el OTP por SMS sí trae ese costo. WhatsApp llega en R3-11, después de R3-07.
- Diseño UI de CLAUDE.md es para backoffice; el portal vive en el sitio con la marca del tenant.

Preguntas, con recomendación:
1. ¿De dónde sale el tenant del cliente final? Recomendación: no tocar el hook (ADR-32 intacto; EXTERNO llega con `tenant_id = null`). El tenant se resuelve por el host del sitio (CMS A) en cada solicitud a `/v1/portal/*` y `CuentaClienteGuard` exige `por.cuenta_cliente` ACTIVA para `(tenant, sub)`; fija `app.tenant_id` para RLS. Cumple TR-CA-312 sin cambiar de tenant en el token.
2. ¿Clientes solo con celular? Recomendación: permitir `seg.usuario.email` NULL para EXTERNO (CHECK: INTERNO y SOPORTE exigen correo) y espejar usuarios con teléfono; añadir `telefono` único. Alternativa más simple: exigir correo en todo registro y usar el celular solo como segundo identificador de ingreso.
3. ¿Registro cómo? Recomendación: por la API con la Admin API (correo y celular; `app_metadata.tipo_usuario = EXTERNO`), registro abierto sigue cerrado. Para Google: callback a la API que, si el usuario no existe, lo crea con Admin API y vincula identidad; si no es viable, abrir el registro y apoyarse en que un EXTERNO sin `cuenta_cliente` no accede a nada. Verificar con la doc vigente de Supabase (hooks de creación de usuario) al redactar.
4. ¿Cómo se autoriza al cliente final si no tiene roles? Recomendación: `publico.*` no se asigna por rol; se declara con un decorador propio (`@PermisoPortal('publico.portal.perfil')`) que exige `tipo = EXTERNO` (o cuenta de cliente) y lo documenta en OpenAPI. Mantiene la regla 5 sin meter clientes en `seg.asignacion`.
5. ¿OTP de quién? Recomendación: OTP de teléfono de Supabase (`signInWithOtp`/`verifyOtp`) invocado desde la API, con vigencia 300 s y reenvío 60 s en la configuración del proyecto, y el tope de 3 intentos contado en Redis por la API (como el bloqueo de 18b). Canal SMS con el proveedor que configure Supabase (Twilio); WhatsApp cuando exista R3-11 o vía hook de envío propio.
6. ¿Cuenta INTERNO que también es cliente? Recomendación: se acepta; el guard del portal mira la cuenta de cliente, no el tipo. El tipo no cambia.
7. ¿Google OAuth en dominios propios? Recomendación: callback siempre en un dominio de la plataforma (`cuenta.<dominio-producto>`) y redirección al sitio; así la lista de URLs de retorno de Supabase no crece por tenant.
8. ¿Sesión en dominio propio? Recomendación: la app SSR reenvía `/v1` a la API (mismo origen, como `vercel.json` actual); la sesión del portal no comparte cookie con el backoffice.
