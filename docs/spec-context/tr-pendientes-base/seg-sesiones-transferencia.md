# Contexto para seg-sesiones-transferencia

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx (hojas RF, Criterios GWT, Reglas de negocio, RNF), `plan.md` (R4: «gestión de sesiones activas y transferencia de propiedad del tenant»), `3_plan.json`, specs 05, 08, 13, 16a, 18b, `docs/ops/supabase-ambientes.md`, `db/01b_seg.sql`.

## 1. Alcance y dependencias
- Componente TR-SEG (MOD-02), procesos TR-P02 (018) y TR-P01/TR-P02 (021). Dos capacidades sueltas de SEG que el plan dejó para R4: ver y cerrar sesiones activas, y transferir la propiedad del tenant con MFA de ambas partes.
- Release: plan **R4 (backlog 2028)**. SRS: 018 Should/R2, 021 Could/R2.
- Historia: ninguna. Horas estimadas: 12-14 h.
- Dependencias: 05 (verificador, `Principal.sesionId` con claim `session_id`), 08 (membresías, `es_propietario`, regla del último propietario con `FOR UPDATE`), 18b (ingreso por la API, `RegistroSesiones` en Redis con `SET NX` de `session_id`), 16a (UI de usuarios), 20a (auditoría), TR-NOT (R2) para notificar en 021.
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| A | seg-sesiones-activas | 018 (+ brecha de inactividad en servidor) | 7-8 | 05, 18b, 16a |
| B | seg-transferir-propiedad | 021 | 5-6 | 08, 16a, 20a; TR-NOT (R2) o aviso en pantalla |

- A, áreas: (a) registro de sesiones (dispositivo, IP, inicio, último uso, última sucursal) al ver cada `session_id`; (b) cierre remoto: revoca tokens de renovación en Supabase y corta el acceso en la siguiente petición; (c) UI en `admin-cliente` (detalle de usuario) y «mis sesiones».
- B, áreas: (a) agregado `TransferenciaPropiedad` (PENDIENTE → ACEPTADA | RECHAZADA | VENCIDA) con MFA del propietario; (b) aceptación con MFA del destinatario y cambio de `es_propietario` en la misma tx; (c) UI de iniciar y aceptar.
- Fuera de alcance: bloqueo de cuenta por intentos (ya en 18b), hook de Supabase que bloquee GoTrue directo (18b lo dejó fuera), cambio de tenant activo (`PUT /v1/seg/mi-tenant`, ver README), cierre de sesiones de todos los tenants del usuario.
- Constitución: 1, 2 (Supabase solo en `infrastructure/supabase`), 3, 4, 5 (ambos permisos sensibles con aal2), 6, 8, 9 (secret key solo en `apps/api`), 11; código limpio; diseño UI (pantalla tipo lista; confirmación con `AvisosService` y `vit-destructivo` para cerrar sesión).

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-018 | Gestionar sesiones activas | plat.sesion.gestionar | APP-02 | — | TR-RNF-014, 013 | Administrador del cliente, Usuario operativo |
| TR-RF-021 | Transferir propiedad del tenant | plat.tenant.transferir | APP-02 | TR-RN-010, 009 | TR-RNF-009, 021 | Administrador del cliente |

- **018** precondición: el IdP expone la gestión de sesiones. Flujo: 1) abre la lista filtrada por usuario o sucursal; 2) consulta al IdP y enriquece con la última sucursal; 3) selecciona y cierra; 4) revoca tokens de renovación y registra el evento. Datos: usuario, dispositivo, ip (inet), inicio, ultimo_uso, sucursal. Salida: sesión cerrada y usuario obligado a autenticarse. El usuario ve y cierra las propias. Relacionados: TR-SEG, TR-AUD.
- **021** precondición: destinatario miembro ACTIVO. Flujo: 1) el propietario elige al nuevo y confirma con MFA; 2) se notifica al destinatario, que acepta con MFA; 3) se marca al destinatario como propietario y, si se indicó, se retira la marca al anterior; 4) se audita y se notifica a ambos. Datos: nuevo_propietario_id, conservar_propiedad_actual (booleano), motivo (5-300). Relacionados: TR-SEG, TR-AUD, TR-NOT.

## 3. Criterios GWT
- **TR-CA-049** (018, Positivo, «Cierre remoto por pérdida de celular»): Diego tiene sesión en un celular perdido | el admin la cierra | se revoca el token de renovación y el celular pierde acceso en su siguiente solicitud.
- **TR-CA-050** (018, Negativo, «Sesiones de otro tenant»): usuario en tenants A y B | el admin de A abre sus sesiones | solo ve las sesiones con contexto de A.
- **TR-CA-056** (021, Positivo): Ana propietaria, Luis miembro activo | Ana transfiere y Luis acepta con MFA | Luis queda propietario y el cambio auditado.
- **TR-CA-057** (021, Negativo): membresía de Pedro SUSPENDIDA | Ana intenta transferirle | «El destinatario debe tener membresía activa».

Faltan y se proponen: cerrar sesión sin MFA vigente pide step-up (401 del 05); el usuario cierra una propia sin permiso de admin; transferencia sin aceptar en 72 h queda VENCIDA; con `conservar_propiedad_actual = falso`, si el destinatario deja de estar ACTIVO antes de aceptar, se rechaza (RN-010 nunca deja 0 propietarios); solo un propietario puede iniciar; una sola transferencia PENDIENTE por tenant; inactividad en servidor (RNF-014): una sesión sin uso más allá de `plat.sesion.minutos_inactividad` se rechaza.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-010 | Todo tenant tiene al menos un propietario con membresía ACTIVA; no se puede suspender, revocar ni dar de baja al último. |
| TR-RN-009 | Permisos sensibles (otorgar roles, etc.) exigen MFA ≤ 15 min y quedan auditados. |
| TR-RNF-014 | Expiración por inactividad configurable (30 min en backoffice) y tokens cortos con renovación. |
| TR-RNF-013 | Operación crítica y acceso sensible en auditoría inmutable. |
| TR-RNF-009 | OIDC centralizado; bloqueo tras 5 intentos; MFA para sensibles. |
| TR-RNF-021 | Confirmación explícita y motivo en acciones destructivas o irreversibles. |

Heredados por CLAUDE.md: 001/002/003, 008, 010, 011, 012, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog
Sin historia (R4). Relacionadas: A-05 (spec 05: descartó revocar por `session_id`), S-04 (spec 08: «No: cerrar sesiones en Supabase. Decisión del usuario. `auth.admin.signOut` pide el JWT del usuario, y cerrar todo lo sacaría de sus otros tenants»), S-06 (18b: `LOGIN` por `session_id`; dejó fuera «Sesiones activas y cierre remoto (TR-RF-018, R2)»), U-03 (16a: «Cierre explícito de sesiones en Supabase al finalizar»).

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta: `db/01<letra>_seg_sesiones.sql` (siguiente letra libre al implementar; `01j` a `01m` quedan para PER, IDN, ARC y FE).
- `seg.sesion` (session_id uuid PK, usuario_id, tenant_id, dispositivo (user-agent resumido), ip inet, iniciada_en, ultimo_uso, sucursal_id NULL, cerrada_en NULL, cerrada_por NULL). RLS por `app.tenant_id` (TR-CA-050: la misma sesión de Supabase vista en A y en B son dos filas, una por tenant del token). `ultimo_uso` se actualiza con muestreo (p. ej. cada 5 min por Redis), no en cada petición.
- `seg.transferencia_propiedad` (id, tenant_id, propietario_id, destinatario_id, conservar_propiedad boolean, motivo varchar(300), estado, iniciada_en, vence_en, resuelta_en, version). Índice único parcial `(tenant_id) WHERE estado = 'PENDIENTE'`.
- `seg.membresia.es_propietario` ya existe (`db/01b_seg.sql`, línea 107). `seg.usuario.ultimo_acceso` ya existe (línea 97).
- **Eventos**: `sesion.cerrada`, `propiedad.transferencia_iniciada`, `propiedad.transferida` (a `EVENTOS_AUDITADOS` de AUD y a TR-NOT). `seg.evento_seguridad` (bitácora del 18) puede sumar el tipo `SESION_CERRADA`.
- **Puertos**: `CierreSesiones` (infra Supabase: revocar refresh tokens de un `session_id`; opción SQL `DELETE FROM auth.sessions WHERE id = …` con la conexión de servicio o endpoint admin, confirmar con `ctx7`); `SesionesRevocadas` (Redis: `SET seg:sesion_revocada:<id> EX 900`, el `AutenticacionGuard` lo consulta, P1); `RegistroSesiones` del 18b se amplía para guardar los metadatos.
- **Permisos**: `plat.sesion.gestionar` (sensible) y `plat.tenant.transferir` (sensible). Las propias: sin permiso extra (el principal sobre su `session_id`). Hoy existe `plat.sesion.contexto` en el manifiesto (otra cosa).

## 7. Código base relacionado
- **Ya existe**: `Principal` con `sesionId`, `amr`, `aal` (spec 05); `RegistroSesiones` (`esNueva(sesionId)` con `SET NX`, 18b) y `ContadorIntentos` en Redis; `registrar-inicio-sesion.ts` y `verificar-mfa.ts` en `libs/plataforma/seguridad/src/application/`; `membresia.casos-de-uso.ts` con la regla del último propietario (`propietariosActivosParaActualizar` con `FOR UPDATE`, `PropietarioUnicoError`); parámetro `plat.sesion.minutos_inactividad` (CFG, manifiesto); inactividad en el cliente (spec 13) con `motivo=inactividad` en `/auth/ingresar` (spec 14); UI de detalle de usuario (`libs/plataforma/admin-cliente/src/lib/pages/usuario-detalle/`).
- **Falta**: tabla de sesiones, lista negra de `session_id`, adaptador de cierre en Supabase, agregado de transferencia, UI.

## 8. Diagramas relevantes
- `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/1_Mermaid/PL-04_Secuencia_ingreso_con_MFA_y_token_con_tenant_activo.mmd`.
- `.../PL-05_Secuencia_solicitud_autorizada_en_la_API.mmd` (dónde mirar la lista negra).
- `.../PL-03_Autenticacion_con_Supabase_Auth_y_autorizacion_propia.mmd`.
- `01-analysis/.../8_Diseno_Piloto/2_Plataforma_Transversal/T-03_Modelo_de_dominio_Seguridad.mmd` y `T-S2_Secuencia_Inicio_de_sesion_sucursal_activa_y_autorizacion.mmd`.

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- «El IdP expone la gestión de sesiones»: Supabase Auth guarda `auth.sessions` pero la Admin API `signOut` pide el JWT del usuario (spec 08).
- «Pierde acceso en su siguiente solicitud» contradice la decisión del 05 (sin chequeo por petición; se mitiga con tokens de 900 s).
- Una sesión de Supabase sirve a varios tenants; cerrarla en A también saca al usuario de B.
- La brecha de inactividad en servidor (RNF-014) figura en `docs/ops/supabase-ambientes.md` como plan Pro de Supabase.

Preguntas, con recomendación:
1. ¿Corte inmediato? Recomendación: lista negra en Redis por `session_id` con TTL igual a la vida del token (900 s), un `GET` por petición en `AutenticacionGuard`; si Redis falla, se deja pasar con log `warn` (mismo criterio que 18b). Más el borrado de refresh tokens en Supabase.
2. ¿Cerrar en A saca de B? Recomendación: sí, es la misma sesión de Supabase; avisarlo en la confirmación. Alternativa sin efecto en B: solo lista negra por `(session_id, tenant_id)` sin tocar Supabase; elegir una al redactar.
3. ¿Inactividad en servidor? Recomendación: entra en A: `ultimo_uso` por sesión en Redis y rechazo (401 `SESION_INACTIVA`) si supera `plat.sesion.minutos_inactividad`; cierra la brecha sin plan Pro.
4. ¿Transferencia sin TR-NOT? Recomendación: aviso dentro de la app (banner en el shell para el destinatario con transferencia pendiente) hasta que exista TR-NOT; vence a las 72 h.
5. ¿Prioridad? Recomendación: A antes que B; A cierra además la brecha de RNF-014 y el pendiente de «cierre explícito de sesiones» de 08/16a/18.
