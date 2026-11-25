# SPEC 45 — Notificaciones: recordatorios programados por referencia, con cancelación, reprogramación y revalidación a la hora del envío

> **Status:** Implementado
> **Depends on:** SPEC 42, SPEC 11, SPEC 21
> **Date:** 2026-11-24
> **Objective:** Agregar a `NotificacionPort` las operaciones `programar` y `cancelar`, que guardan en `ntf.programacion` un envío futuro por referencia del producto, lo disparan desde una cola BullMQ diferida del worker y a la hora llaman a `enviar`, que revalida bajas, contactos inválidos y consentimiento.

## Por qué existe este spec

Fila 45 de `docs/roadmap-specs.md` (R2-10: TR-RF-076). Contexto: `docs/spec-context/tr-not/not-recordatorios-preferencias.md`, parte a. Lo consumen los productos (citas, vencimientos de pago) y, más adelante, ARCO (64) y PAG (77).

Lo que hay en el código hoy (revisado al redactar):

- `notificaciones` (42 y 43): `NOTIFICACION_PORT.enviar` con `claveIdempotencia`; `ntf.mensaje.programado_para` y el consumidor `EncolarEnvio` que agrega a `not-envios` con `delay` (solo para promocionales fuera de la ventana de 08:00 a 20:00, TR-CA-189).
- Patrón de evento interno por outbox → cola con `jobId` (`not.mensaje.solicitado` → `not-envios`; `fe.prueba.solicitada` → `fe-pruebas`).
- Patrón de función de barrido entre tenants con `SECURITY DEFINER` (`arc.versiones_pendientes_vencidas`, `ntf.mensaje_por_id_externo`).
- Tareas periódicas del worker en `apps/worker/src/vencimientos/` y `soporte/tarea-vencimiento-soporte.ts`.
- No hay programaciones, ni `programar` ni `cancelar` en el puerto.
- Última letra de migración: `01r`. El 44 (en paralelo) usa `01s`; este, `01t`; el 51, `01u`.

## Alcance

**Entra:**

- Tabla `ntf.programacion`, fuente de verdad del recordatorio; BullMQ solo dispara.
- `NotificacionPort.programar(comando)`: plantilla, destinatario, variables, finalidad, `enviarEn` (futura), `referencia { tipo, id }`. Se une a la transacción del llamador.
- Reprogramar = `programar` con la misma referencia y plantilla mientras haya una viva: actualiza fecha, destinatario y variables (un solo trabajo vivo por referencia y plantilla).
- `NotificacionPort.cancelar(referencia, plantilla?)`: cancela las programaciones vivas de la referencia (todas o la de esa plantilla).
- Evento interno `not.programacion.registrada` por outbox; su consumidor agrega a la cola `not-programaciones` con `delay` hasta `enviarEn`.
- Ejecución a la hora: relee la programación; si sigue viva y la versión coincide, llama a `enviar` con `claveIdempotencia` = id de la programación; deja `ENVIADA` o `DESCARTADA` con el motivo que devolvió `enviar`.
- Barrido cada 15 min en el worker: programaciones `PROGRAMADA` con `enviar_en` vencida hace más de 5 min se vuelven a encolar (Redis perdió el trabajo o el worker estuvo caído).
- CLI `pnpm notificaciones:programar` para el humo.
- Migración `db/01t_not_programacion.sql` con inverso y prueba SQL.

**No entra (specs futuros):**

- Endpoint HTTP de programación para productos externos (SazónPOS): llega con su integración.
- Preferencias, bajas y enlace firmado (TR-RF-077, spec 46).
- Revalidar el origen del recordatorio (si la cita sigue confirmada): el producto cancela por referencia.
- Recordatorios recurrentes o reglas tipo «T-24 h y T-2 h» dentro de NOT: el producto programa cada uno.
- WhatsApp y SMS (spec 104).
- Consulta de programaciones por API y UI.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `EnviarNotificacion` (42) | La ejecución lo llama tal cual: renderiza con la plantilla vigente a la hora y aplica TR-RN-025. |
| `not.mensaje.solicitado` → `not-envios` (42) | Molde del evento interno y de la cola `not-programaciones`. |
| `ntf.mensaje_por_id_externo` (42) | Molde de la función `SECURITY DEFINER` del barrido. |
| `apps/worker/src/vencimientos/` | Molde de la tarea periódica del barrido. |
| `kernel-infra` (`UnitOfWork`, `OutboxPublisher`, `Clock`, `uuidV7`) | Transacción del llamador, evento interno, hora. |

## Modelo de datos

### Migración `db/01t_not_programacion.sql` (+ `db/rollback/01t_not_programacion.sql`, `db/tests/01t_not_programacion.test.sql`)

```sql
CREATE TABLE ntf.programacion (
  id                uuid PRIMARY KEY,
  tenant_id         uuid         NOT NULL,
  referencia_tipo   varchar(40)  NOT NULL CHECK (referencia_tipo ~ '^[a-z][a-z0-9_.]{1,39}$'),
  referencia_id     varchar(100) NOT NULL,
  plantilla_codigo  varchar(60)  NOT NULL,
  destinatario      jsonb        NOT NULL,                    -- { personaId } | { correo }; no va a logs
  variables         jsonb        NOT NULL DEFAULT '{}',
  finalidad         varchar(14)  NOT NULL CHECK (finalidad IN ('TRANSACCIONAL','PROMOCIONAL')),
  enviar_en         timestamptz  NOT NULL,
  estado            varchar(12)  NOT NULL CHECK (estado IN ('PROGRAMADA','ENVIADA','CANCELADA','DESCARTADA')),
  motivo            varchar(40),                              -- estado del mensaje si DESCARTADA
  mensaje_id        uuid REFERENCES ntf.mensaje(id),
  version           integer      NOT NULL DEFAULT 1,
  creado_por        uuid,
  creado_en         timestamptz  NOT NULL DEFAULT now(),
  modificado_en     timestamptz
);
CREATE UNIQUE INDEX uq_programacion_viva
  ON ntf.programacion (tenant_id, referencia_tipo, referencia_id, plantilla_codigo)
  WHERE estado = 'PROGRAMADA';
CREATE INDEX ix_programacion_pendiente ON ntf.programacion (enviar_en) WHERE estado = 'PROGRAMADA';

-- Barrido entre tenants: solo ids, tenant y versión.
CREATE FUNCTION ntf.programaciones_atrasadas(p_antes timestamptz, p_limite integer)
  RETURNS TABLE (id uuid, tenant_id uuid, version integer) SECURITY DEFINER SET search_path = ntf, pg_temp ...;
```

- RLS `ENABLE + FORCE` por `app.tenant_id`; `REVOKE` a `anon, authenticated` (regla 8). La función, con dueño `org_lector` como `ntf.mensaje_por_id_externo`.
- Inverso: borra función y tabla. Se niega si hay programaciones `PROGRAMADA`.
- Prueba SQL: dos vivas con la misma referencia y plantilla fallan; viva + cancelada conviven; aislamiento con dos `app.tenant_id`; la función solo devuelve atrasadas.

### Dominio (`libs/plataforma/notificaciones/src/domain/`)

- `programacion.ts`: agregado `Programacion` con `programar(datos, ahora)` (exige `enviarEn > ahora` → `FechaEnvioNoFuturaError` «La fecha de envío debe ser futura», TR-CA-192; y `enviarEn <= ahora + HORIZONTE_MAXIMO_DIAS (366)` → `FechaEnvioFueraDeHorizonteError`), `reprogramar(datos, ahora)` (suma `version`), `cancelar()`, `marcarEnviada(mensajeId)`, `descartar(motivo, mensajeId?)`. Transiciones solo desde `PROGRAMADA`.
- `referencia-programacion.ts`: `ReferenciaProgramacion { tipo; id }` con validación de formato.
- `errores.ts` suma `FechaEnvioNoFuturaError` (`FECHA_ENVIO_NO_FUTURA`), `FechaEnvioFueraDeHorizonteError`, `ReferenciaInvalidaError`.
- `eventos-not.ts` suma el interno `not.programacion.registrada` (`{ programacionId, version, enviarEn }`, sin destinatario).

### Puerto (`application/ports/notificacion.port.ts`, se amplía)

```ts
export interface ProgramarNotificacionComando extends Omit<EnviarNotificacionComando, 'claveIdempotencia'> {
  enviarEn: Date;
  referencia: { tipo: string; id: string };
}

export interface NotificacionProgramada {
  programacionId: string;
  enviarEn: Date;
  /** true si ya había una viva con la misma referencia y plantilla y se actualizó. */
  reprogramada: boolean;
}

export interface NotificacionPort {
  enviar(comando: EnviarNotificacionComando): Promise<NotificacionRegistrada>;          // 42, sin cambios
  /** TR-RF-076. Valida la plantilla al programar; se une a la transacción del llamador. */
  programar(comando: ProgramarNotificacionComando): Promise<NotificacionProgramada>;
  /** Devuelve cuántas canceló (0 si no había vivas). */
  cancelar(referencia: { tipo: string; id: string }, plantilla?: string): Promise<number>;
}
```

`ColaProgramaciones.encolar({ tenantId, programacionId, version, enviarEn })` con `jobId = ${programacionId}-${version}`.

### Casos de uso (`application/programaciones/`)

- `ProgramarNotificacion`: valida canal y que la plantilla exista (`vigente`); busca la viva por referencia y plantilla; si existe → `reprogramar`, si no → nueva. Guarda y publica `not.programacion.registrada` en la transacción del llamador.
- `CancelarProgramaciones`: cancela las vivas de la referencia (y plantilla si viene). Sin evento: la ejecución ve el estado y termina.
- `EncolarProgramacion` (consumidor del evento en el worker): idempotente por `event_id` y `jobId`.
- `EjecutarProgramacion` (procesador de `not-programaciones`, con el contexto del tenant, en una transacción): relee; si no está `PROGRAMADA` o la `version` no coincide → termina sin efecto (trabajo viejo de una reprogramación o cancelada). Llama a `EnviarNotificacion` con `claveIdempotencia = programacion.id`; `ENCOLADO` → `marcarEnviada`; `OMITIDO_SIN_CONSENTIMIENTO` o `DESCARTADO` → `descartar(estado)`. La ventana de promocionales la resuelve `enviar` (corre a las 08:00).
- `BarrerProgramacionesAtrasadas` (tarea cada 15 min): `ntf.programaciones_atrasadas(ahora − 5 min, 500)` → encola cada una con su `jobId` (repetido no duplica).

### Composición

- `NotificacionesModule.register()` provee `programar` y `cancelar` en el mismo `NOTIFICACION_PORT`; `registerWorker()` suma el consumidor, el procesador y el barrido.
- `apps/worker/src/notificaciones/`: cola `not-programaciones` con cierre ordenado y tarea del barrido.
- `apps/worker/src/cli/programar-notificacion.ts` y `pnpm notificaciones:programar` (`--en 2m`, `--referencia`, `--cancelar`).
- `src/index.ts`: tipos nuevos del puerto y errores, por ruta explícita.

## Plan de implementación

1. **Migración.** `01t_not_programacion.sql`, inverso y prueba SQL.
2. **Dominio.** `Programacion`, referencia, errores y evento, con pruebas: fecha pasada (TR-CA-192), horizonte, reprogramar suma versión, transiciones inválidas.
3. **Programar y cancelar.** Casos de uso, repositorio TypeORM y puerto; integración: misma referencia dos veces deja una viva y `reprogramada = true`; cancelar sin vivas devuelve 0; aislamiento.
4. **Cola y ejecución.** Evento interno, consumidor, cola `not-programaciones`, `EjecutarProgramacion`. Pruebas: a la hora envía (TR-CA-190); cancelada no envía (TR-CA-191); trabajo de una versión vieja no envía; contacto inválido después de programar → `DESCARTADA`.
5. **Barrido y CLI.** Función de barrido, tarea y CLI.
6. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` en dev; humo con el worker local: programar `PRUEBA_CORREO` a 2 min y recibirlo; programar otra y cancelarla (no llega); reprogramar y ver un solo envío; detener el worker, dejar vencer una y verla salir con el barrido al arrancar; `npx nx run-many -t lint test -p notificaciones worker migrar`.

## Criterios de aceptación

- [ ] TR-CA-190 (adaptado a `PRUEBA_CORREO`): programación a una hora futura → a esa hora (± 30 s, TR-RNF-124) se crea el mensaje y queda `ENVIADA` con su `mensaje_id`.
- [ ] TR-CA-191: `cancelar` de la referencia antes de la hora → `CANCELADA`, no se crea mensaje.
- [ ] TR-CA-192: `enviarEn` igual o anterior a ahora → `FechaEnvioNoFuturaError` «La fecha de envío debe ser futura»; no se guarda nada.
- [ ] Reprogramar con la misma referencia y plantilla deja una sola programación viva y un solo envío, a la hora nueva (TR-RNF-008).
- [ ] A la hora se respeta lo que cambió después de programar: contacto inválido o falta de consentimiento promocional → `DESCARTADA` con el motivo, sin mensaje entregado.
- [ ] PROMOCIONAL que vence a las 21:30 de Lima → el mensaje sale a las 08:00 del día siguiente (TR-CA-189, lo resuelve `enviar`).
- [ ] Trabajo perdido en Redis o worker caído a la hora → el barrido lo encola en ≤ 20 min y se envía una sola vez (TR-RNF-005).
- [ ] La misma ejecución repetida no duplica el mensaje (`claveIdempotencia` = id de la programación).
- [ ] Plantilla inexistente al programar → `PlantillaNoEncontradaError`; canal distinto de CORREO → `CanalNoHabilitadoError`.
- [ ] Aislamiento (TR-RNF-010): un tenant no cancela ni ve programaciones de otro; prueba SQL con dos `app.tenant_id`.
- [ ] Logs sin destinatario ni variables (TR-RNF-026).
- [ ] Migración `01t_not_programacion` reversible y probada en CI contra PostgreSQL 16.
- [ ] Cobertura de dominio de `notificaciones` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM; el único SQL nuevo es la función del barrido (cruza tenants, por eso `SECURITY DEFINER`).
- [ ] `npx nx run-many -t lint test -p notificaciones worker migrar` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** tabla `ntf.programacion` como fuente de verdad, BullMQ diferido como disparador y barrido. Decisión del usuario. Redis puede perder un trabajo; la base no.
- **No:** reusar `ntf.mensaje` con `programado_para`. Renderizaría al programar con la plantilla de ese momento y mezclaría cancelaciones con estados de entrega.
- **Sí:** solo puerto en proceso, sin HTTP. Decisión del usuario. Igual que `enviar`; la entrada HTTP llega con la integración del producto externo.
- **Sí:** a la hora se llama a `enviar`, que revalida bajas, contactos inválidos y consentimiento y renderiza con la plantilla vigente. Reutiliza TR-RN-025 sin duplicarla.
- **No:** revalidar el origen (cita confirmada). NOT no conoce los productos; el producto cancela por referencia.
- **Sí:** reprogramar con `programar` y la misma referencia; `version` en el `jobId` invalida el trabajo viejo sin borrarlo de Redis.
- **Sí:** cancelar sin evento ni borrado del trabajo; la ejecución lo descarta al ver el estado. Menos piezas y sin carrera con Redis.
- **Sí:** horizonte máximo de 366 días. Evita trabajos diferidos indefinidos en Redis.
- **Sí:** migración `01t` (el 44 usa `01s` y el 51 `01u`, en paralelo).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El 44 trabaja en paralelo sobre `notificaciones.module.ts`, `index.ts` y el módulo del worker | Líneas contiguas; el segundo PR se rebasa sobre el primero. Letras distintas. |
| Muchos trabajos diferidos en Redis | Horizonte de 366 días; un trabajo por programación viva. Redis persistente en staging (spec 21). |
| Barrido y trabajo diferido disparan a la vez | Mismo `jobId` y `claveIdempotencia`: uno solo llega a enviar. |
| Reloj del worker adelantado o atrasado | La hora sale de `Clock` y el retardo se calcula al encolar; el barrido corrige atrasos. |

## Lo que **no** entra en este spec

- HTTP de programación y UI.
- Preferencias, bajas y enlace firmado (spec 46).
- Recordatorios recurrentes y revalidación del origen.
- WhatsApp y SMS (spec 104).

Cada uno, si llega, va en su propio spec.
