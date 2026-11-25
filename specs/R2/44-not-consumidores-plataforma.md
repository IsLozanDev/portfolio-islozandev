# SPEC 44 — Notificaciones: correos de los eventos de plataforma ya publicados (vencimiento, suspensión, soporte e integridad)

> **Status:** Aprobado
> **Depends on:** SPEC 42, SPEC 43, SPEC 11, SPEC 12, SPEC 18, SPEC 20b
> **Date:** 2026-11-24
> **Objective:** Enviar con `NotificacionPort.enviar` un correo transaccional a los propietarios del tenant cuando se publican `suscripcion.por_vencer`, `tenant.suspendido` y `soporte.solicitado`, y a la dirección de operación de la plataforma cuando se publica `aud.integridad.rota`, con plantillas base nuevas y un envío por destinatario sin duplicados.

## Por qué existe este spec

Fila 44 de `docs/roadmap-specs.md` (R2-09, parte c). Contexto: `docs/spec-context/tr-not/not-correo-plantillas-estados.md` §1 (parte c) y §6 (eventos que consume NOT). Los specs 03, 12, 18 y 20b publican estos eventos y dejan el aviso «TR-NOT, R2»; ninguno manda correo hoy.

Lo que hay en el código hoy (revisado al redactar):

- `notificaciones` (specs 42 y 43): `NOTIFICACION_PORT.enviar({ plantilla, destinatario, variables, finalidad, claveIdempotencia })`, que toma el tenant del `TenantContext` y se une a la transacción del llamador. Destinatario por `personaId` o por `correo`. Única plantilla base: `PRUEBA_CORREO`.
- `eventos`: `@SuscribirEvento`, consumo idempotente por `event_id`; el relay arma el `TenantContext` del consumidor con el `tenant_id` del evento.
- Cargas (sin destinatario):
  - `suscripcion.por_vencer` (`org`): `{ producto_codigo, vigente_hasta, dias_antes: 7|3|1 }`.
  - `tenant.suspendido` (`org`): `{ estado_anterior, motivo, fecha_efectiva }`.
  - `soporte.solicitado` (`seguridad`): `{ acceso_id, tenant_id, agente_id, ticket, modo, horas_solicitadas }`.
  - `aud.integridad.rota` (`auditoria`): `{ numero_roto, motivo, modo, ... }`, sin datos personales.
- `seg.usuario.email` existe; el rol `PLAT_PROPIETARIO` se asigna al propietario en el alta del tenant (spec 12). `seguridad` no expone una lectura de propietarios con su correo.
- Matriz de límites: `comp:not` ya puede importar `seg`, `org`, `evt` y `aud`.
- Última letra de migración: `01r`. Este spec usa `01s`; el 45 (en paralelo) `01t` y el 51 `01u`.

## Alcance

**Entra:**

- Cuatro plantillas base nuevas en CORREO, idioma `es`, con variables declaradas y `ejemplo` (se personalizan con la API del 43 sin cambios):
  - `SUSCRIPCION_POR_VENCER`: `tenant`, `producto`, `vigente_hasta`, `dias`.
  - `TENANT_SUSPENDIDO`: `tenant`, `motivo`, `fecha_efectiva`.
  - `SOPORTE_SOLICITADO`: `tenant`, `ticket`, `modo`, `horas`.
  - `INTEGRIDAD_ROTA`: `tenant_id`, `numero_roto`, `motivo`, `modo`.
- Lectura de propietarios en `seguridad`: puerto `PROPIETARIOS_TENANT` con `listar()` → usuarios con membresía activa y asignación vigente del rol `PLAT_PROPIETARIO` en el tenant del contexto, con su correo.
- Consumidores en el worker (`@SuscribirEvento`) de los cuatro eventos, en `libs/plataforma/notificaciones/src/interface/avisos-plataforma.consumidor.ts`, con un caso de uso por evento.
- Un mensaje por destinatario con `claveIdempotencia` determinista a partir de `event_id` y del destinatario: el evento repetido no duplica correos.
- `aud.integridad.rota` va a la dirección `NOT_CORREO_OPERACION` (variable de entorno nueva). Sin variable, se registra un log de advertencia y no se envía.
- Nombre del tenant para la variable `tenant` leído de ORG.
- Migración `db/01s_not_avisos_plataforma.sql` con inverso y prueba SQL (solo semilla).

**No entra (specs futuros):**

- Otros eventos (`suscripcion.vencida`, `tenant.reactivado`, `tenant.dado_de_baja`, `soporte.aprobado` y siguientes, `fe.certificado.por_vencer`): cada uno se agrega como consumidor nuevo cuando se pida.
- Correo al tenant afectado por la rotura de integridad (va solo a operación).
- Preferencias, bajas y recordatorios (specs 45 y 46).
- Correo del comprobante electrónico (spec 59) y del incidente de datos (spec 63).
- Dominio de envío verificado en Resend (requisito de staging, ver Riesgos).
- UI y menú de plantillas (spec 47).

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `NOTIFICACION_PORT.enviar` (42) | Única vía de envío; sin cambios. |
| Plantillas base y API del 43 | Las bases nuevas se personalizan con la API existente. |
| `eventos` (`@SuscribirEvento`, `TenantContext` del evento) | Consumidores idempotentes por `event_id`. |
| `seguridad` (membresías, asignaciones, `seg.usuario`) | Lectura nueva `PROPIETARIOS_TENANT`, con TypeORM. |
| `org` (lectura del tenant) | Nombre comercial del tenant para `tenant`. |
| `kernel-infra` (`TypeOrmUnitOfWork`) | Transacción del consumidor en la que se registran los mensajes. |

## Modelo de datos

### Migración `db/01s_not_avisos_plataforma.sql` (+ `db/rollback/01s_not_avisos_plataforma.sql`, `db/tests/01s_not_avisos_plataforma.test.sql`)

- Solo `INSERT` en `ntf.plantilla` de las cuatro bases (`tenant_id NULL`, `version 1`, `activa`), con asunto, cuerpo HTML sencillo (que pase el saneador del 43) y `variables` con `ejemplo`. Mismo formato que la semilla de `PRUEBA_CORREO` en `01o_not.sql`.
- Inverso: borra las cuatro bases. Se niega si alguna tiene personalizaciones (`plantilla_base_id`) o mensajes (`ntf.mensaje.plantilla_id`).
- Prueba SQL: las cuatro existen, son visibles desde cualquier `app.tenant_id` y un tenant no puede modificarlas.

### Dominio (`libs/plataforma/notificaciones/src/domain/`)

- `avisos-plataforma.ts`: `CODIGOS_AVISO = { suscripcionPorVencer: 'SUSCRIPCION_POR_VENCER', tenantSuspendido: 'TENANT_SUSPENDIDO', soporteSolicitado: 'SOPORTE_SOLICITADO', integridadRota: 'INTEGRIDAD_ROTA' }`; funciones puras que pasan cada carga a las variables de su plantilla (fechas en formato `dd/mm/aaaa`, constantes con nombre).
- `clave-aviso.ts`: `claveDeAviso(eventId, destino)` → UUID determinista (SHA-256 de `eventId` + destino, formato UUID v8). Con pruebas: misma entrada, misma clave; destino distinto, clave distinta.

### Puertos

```ts
// libs/plataforma/seguridad/src/application/ports/propietarios-tenant.ts
export const PROPIETARIOS_TENANT = Symbol('PropietariosTenant');
export interface PropietarioTenant { usuarioId: string; correo: string; }
export interface PropietariosTenant {
  /** Tenant del contexto. Membresía ACTIVA y asignación vigente de PLAT_PROPIETARIO. Ordenados por correo. */
  listar(): Promise<PropietarioTenant[]>;
}

// libs/plataforma/notificaciones/src/application/ports/nombre-tenant.ts
export interface NombreTenant { /** Nombre comercial o razón social; null si no existe. */ obtener(): Promise<string | null>; }
```

### Casos de uso (`application/avisos/`)

Los cuatro siguen el mismo molde, en una transacción del `UnitOfWork` con el contexto del tenant del evento:

1. Resolver destinatarios: `PROPIETARIOS_TENANT.listar()` (o `[NOT_CORREO_OPERACION]` para integridad).
2. Armar variables con la función pura del dominio y el nombre del tenant.
3. Por cada destinatario, `enviar({ plantilla, destinatario: { correo }, variables, finalidad: 'TRANSACCIONAL', claveIdempotencia: claveDeAviso(eventId, correo) })`.

- `AvisarSuscripcionPorVencer`, `AvisarTenantSuspendido`, `AvisarSoporteSolicitado`, `AvisarIntegridadRota`.
- Sin destinatarios (tenant sin propietario activo o sin `NOT_CORREO_OPERACION`): log de advertencia con `event_id` y tenant, sin error (el evento se da por consumido).
- `AvisarIntegridadRota`: el mensaje queda con el `tenant_id` del evento (la columna es obligatoria); el destinatario es la dirección de operación.
- Logs sin correos (TR-RNF-026): solo cantidad de destinatarios y estados.

### Composición

- `NotificacionesModule.registerWorker()` suma el consumidor y los casos de uso; `PROPIETARIOS_TENANT` lo provee `SeguridadModule` (adaptador TypeORM en `seguridad/infrastructure/typeorm`).
- `camposEntornoNotificaciones` suma `NOT_CORREO_OPERACION` (opcional, correo válido). `.env.example` y `docs/ops/supabase-ambientes.md` (sección NOT).
- `src/index.ts` de `seguridad`: `PROPIETARIOS_TENANT` y sus tipos, por ruta explícita.

## Plan de implementación

1. **Migración.** `01s_not_avisos_plataforma.sql`, inverso y prueba SQL.
2. **Dominio.** `avisos-plataforma.ts` y `clave-aviso.ts` con pruebas (mapeo de cada carga, fechas, clave determinista).
3. **Propietarios.** Puerto y adaptador en `seguridad` con prueba de integración: propietario activo sí; suspendido, finalizado o con asignación vencida no; otro tenant no.
4. **Casos de uso y consumidores.** Los cuatro casos de uso con pruebas sobre dobles: un correo por propietario, evento repetido sin duplicar, sin destinatarios sin error.
5. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` en dev; humo con el worker local: publicar `suscripcion.por_vencer` y `aud.integridad.rota` de un tenant de dev (CLI o tarea diaria) y ver los mensajes `ENVIADO` en `ntf.mensaje` y el correo en la cuenta de Resend; `npx nx run-many -t lint test -p notificaciones seguridad worker migrar`.

## Criterios de aceptación

- [ ] `suscripcion.por_vencer` con `dias_antes = 3` en un tenant con dos propietarios activos → dos mensajes `ENCOLADO` con la plantilla `SUSCRIPCION_POR_VENCER`, variables `producto`, `vigente_hasta` (dd/mm/aaaa) y `dias = 3`.
- [ ] `tenant.suspendido` y `soporte.solicitado` → un mensaje por propietario con su plantilla y variables.
- [ ] `aud.integridad.rota` → un mensaje a `NOT_CORREO_OPERACION`; ningún propietario del tenant lo recibe. Sin la variable → log de advertencia y ningún mensaje.
- [ ] El mismo evento entregado dos veces (mismo `event_id`) no crea mensajes nuevos (TR-RNF-008).
- [ ] Un propietario con membresía suspendida o con la asignación de `PLAT_PROPIETARIO` vencida no recibe el correo.
- [ ] Tenant sin propietarios activos → log de advertencia, el evento se consume y no hay error en el relay.
- [ ] La personalización del tenant (API del 43) de una de las cuatro plantillas se usa en el siguiente aviso de ese tenant.
- [ ] Aislamiento (TR-RNF-010): los propietarios leídos son solo los del tenant del evento.
- [ ] Logs y cargas de los eventos sin correos de destinatarios (TR-RNF-026).
- [ ] Migración `01s_not_avisos_plataforma` reversible y probada en CI contra PostgreSQL 16.
- [ ] Cobertura de dominio de `notificaciones` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM, sin SQL crudo nuevo.
- [ ] `npx nx run-many -t lint test -p notificaciones seguridad worker migrar` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** destinatarios del tenant = propietarios (membresía activa y `PLAT_PROPIETARIO` vigente). Decisión del usuario. Son quienes pagan la suscripción y aprueban el soporte.
- **No:** correo de contacto de la empresa. Puede no existir y no es una persona con cuenta.
- **Sí:** `aud.integridad.rota` solo a la dirección de operación (`NOT_CORREO_OPERACION`). Decisión del usuario. Es un aviso de seguridad de plataforma; el tenant se entera por el incidente (spec 63) si corresponde.
- **Sí:** destinatario por `correo`, no por `personaId`. Los propietarios son usuarios de SEG y no siempre tienen ficha en TR-PER.
- **Sí:** clave de idempotencia determinista por `event_id` y destino. La idempotencia por `event_id` del consumidor no cubre un reintento a mitad de la lista; la clave por destino sí.
- **Sí:** finalidad TRANSACCIONAL. Son avisos de servicio; respetan contactos inválidos (TR-RN-025).
- **Sí:** lectura de propietarios como puerto de `seguridad`. NOT ya depende de SEG y la consulta es de SEG.
- **Sí:** migración `01s` (el 45 usa `01t` y el 51 `01u`, en paralelo).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Remitente `onboarding@resend.dev` solo entrega al dueño de la cuenta | El humo usa el correo del dueño como propietario o como `NOT_CORREO_OPERACION`; el dominio verificado es requisito de staging (anotado en specs 14, 21 y 42). |
| El 45 trabaja en paralelo sobre `notificaciones.module.ts`, `index.ts`, `entorno-notificaciones.ts` y el módulo del worker | Cambios en líneas contiguas; el segundo PR se rebasa sobre el primero. Letras `01s` y `01t` distintas. |
| Una base nueva que luego cambie de variables rompe personalizaciones (riesgo del 43) | Las cuatro bases nacen aquí con sus variables finales; un cambio posterior revisa las personalizaciones en su spec. |
| Muchos propietarios en un tenant | Un mensaje por propietario en la misma transacción; el número es bajo (alta de tenant crea uno). |

## Lo que **no** entra en este spec

- Otros eventos de plataforma y productos.
- Aviso de integridad al tenant afectado.
- Recordatorios, preferencias y bajas (specs 45 y 46).
- UI de plantillas (spec 47).

Cada uno, si llega, va en su propio spec.
