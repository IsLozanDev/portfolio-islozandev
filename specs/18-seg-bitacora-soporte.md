# SPEC 18 — Seguridad: bitácora de seguridad y acceso temporal de soporte con aprobación, banner y auditoría por petición

> **Status:** Aprobado
> **Depends on:** SPEC 06, SPEC 08, SPEC 11, SPEC 12, SPEC 15, SPEC 16a, SPEC 16b, SPEC 17a, SPEC 17b, SPEC 17c
> **Date:** 2026-11-03
> **Objective:** Permitir al administrador del cliente consultar la bitácora de seguridad de su tenant y aprobar, rechazar o revocar accesos temporales de soporte (ticket, motivo, modo, 1-4 h) que el agente solicita desde la consola, opera con banner visible y auditoría de cada petición, y que vencen solos (S-06).

## Por qué existe este spec

Fila 18 de `docs/roadmap-specs.md` (S-06). Contexto: `docs/spec-context/18-seg-bitacora-soporte.md`. Su sección 9 queda resuelta por las Decisiones de este spec.

El paquete de contexto está desactualizado en un punto. `seg.evento_seguridad` **ya tiene** RLS por tenant (`evento_seguridad_select`, `evento_seguridad_insert`) y el trigger `evento_seguridad_solo_insercion` desde el spec 04. Faltan índices y el CHECK de `tipo`.

Lo que hay en el código hoy (revisado al redactar):

- `BitacoraSeguridad.registrar(tipo, usuarioId, detalle)` en `application/ports/repositorios.ts`. `TipoEventoSeguridad` solo admite `ASIGNACION_OTORGADA`, `ASIGNACION_REVOCADA` y `ACCESO_DENEGADO`.
- `PermisoGuard` ya escribe `ACCESO_DENEGADO` con `{ permiso, ruta, metodo, sucursal_id }`. El permiso faltante de TR-CA-051 sale de `detalle.permiso`.
- `seg.membresia` tiene `UNIQUE (usuario_id, tenant_id)`. Las funciones de permisos y el hook ya excluyen membresías no `ACTIVO` o con `hasta` vencida.
- El trigger de versión de seguridad (spec 06) sube `vt` cuando cambia `estado` o `hasta` de la membresía. La caché de permisos queda invalidada por versión.
- El hook ordena las membresías por `tenant_preferido` y luego por `desde DESC`.
- `apps/worker` ya corre una tarea BullMQ (`vencimientos/tarea-vencimientos.ts`, spec 12). Sirve de patrón.
- El manifiesto PLAT está en `1.6.0`. No declara `plat.seguridad.bitacora` ni `plat.soporte.*`.
- `mi-contexto` (`ObtenerMiContexto`) no trae datos de soporte. El shell (`libs/shared/shell`) no tiene banner ni insignias en el menú.

RF cubiertos:

- **TR-RF-019** consultar bitácora de seguridad (back y UI). Sin exportación (ver Decisiones).
- **TR-RF-020** autorizar acceso temporal de soporte (back, UI del cliente, UI del agente y banner).

Criterios del SRS: **TR-CA-051 a 055**. TR-CA-055 se prueba invocando el caso de uso `RevocarAccesosPorTicket`, que TR-SOP llamará en R3.

Reglas:

- **TR-RN-011**: autorización expresa, motivo, ticket, vigencia máxima de 4 h y cada acción auditada como `ACCESO_SOPORTE`.
- **TR-RN-007**: los permisos nuevos son PLAT y no dependen de suscripción.
- **TR-RN-009**: `plat.soporte.autorizar` es sensible (aal2).
- **TR-RN-047**: queda pendiente; no hay exportación en este spec.

RNF propios:

- **TR-RNF-002**: la lista de la bitácora responde p95 < 1,5 s con 100 000 eventos por tenant (índices nuevos).
- **TR-RNF-110**: vigencia ≤ 4 h, banner en el 100 % de las pantallas del shell, 100 % de las peticiones del agente auditadas.
- **TR-RNF-013**: cada paso del ciclo de soporte y cada petición del agente deja fila en `seg.evento_seguridad`.
- **TR-RNF-010**: la bitácora solo devuelve eventos del tenant del token. El agente solo opera en el tenant aprobado.
- **TR-RNF-014**: al vencer, el agente pierde los permisos al instante y el tenant del token en el siguiente refresh.
- **TR-RNF-026**: el evento por petición no guarda cuerpo, query ni datos personales.

RNF heredados: 008, 011, 012, 024/119, 025, 101, 106. TR-RNF-112 (encadenado por hash) es del spec 20.

Estimado: 15-17 h. El plan da 4 h y el roadmap 4-6 h. **Decisión del usuario:** todo en un solo spec aunque pase de 10 h. La UI no tenía horas en el backlog; queda registrado aquí.

## Alcance

**In:**

- **Migración** `db/01b_seg_soporte.sql`, su inverso `db/rollback/01b_seg_soporte.sql` y la prueba `db/tests/01b_seg_soporte.test.sql`. Corre después de `01b_seg_membresias.sql` por orden de nombre.
- **Dominio** en `libs/plataforma/seguridad/src/domain/`: `acceso-soporte.ts` (agregado), `abrirSoporte` en `membresia.ts`, eventos nuevos en `eventos.ts` y errores nuevos en `errores.ts`.
- **Casos de uso** en `application/`: `ConsultarBitacora`, `ConsultarEventoSeguridad`, `SolicitarAccesoSoporte`, `ListarMisAccesosSoporte`, `EntrarComoSoporte`, `SalirDeSoporte`, `ListarSolicitudesSoporte`, `ContarSolicitudesPendientes`, `AprobarAccesoSoporte`, `RechazarAccesoSoporte`, `RevocarAccesoSoporte`, `RevocarAccesosPorTicket`, `VencerAccesosSoporte` y `ResolverAccesoSoporteVigente`. `ObtenerMiContexto` suma `soporte`.
- **Puertos** nuevos y adaptadores TypeORM; `VerificadorTicket` con adaptador de formato.
- **Interfaz**: `interface/bitacora.controller.ts`, `interface/soporte.controller.ts`, `interface/soporte.http.ts` (DTO y zod) y `interface/soporte.interceptor.ts` (modo, veto y auditoría por petición).
- **Worker**: `apps/worker/src/soporte/` con la tarea repetible de vencimiento cada 60 s.
- **Manifiesto PLAT `1.7.0`**: tres permisos, tres opciones de menú, rol `PLAT_AGENTE_SOPORTE` y permisos nuevos en `PLAT_PROPIETARIO` y `PLAT_ADMIN_SEGURIDAD`.
- **Front, `libs/shared/auth`**: `MiContexto.soporte`.
- **Front, `libs/shared/shell`**: componente `banner-soporte`, salida de soporte y token `INSIGNIAS_MENU` en `menu-lateral` y `riel-menu`.
- **Front, `libs/plataforma/admin-cliente`**: páginas de bitácora (lista y detalle) y de soporte (bandeja, aprobar), clientes y modelos, e insignia de pendientes.
- **Front, `libs/plataforma/consola-soporte`** (nueva, `type:feature`, `scope:plataforma`): página del agente para solicitar, ver sus accesos, entrar y salir. Se monta en `apps/plataforma-consola` bajo `consola/soporte`.
- **Pruebas**: dominio y aplicación (Jest), integración con PostgreSQL 16 y Redis 7, HTTP con supertest, Vitest con `TestBed` zoneless, y navegador con el MCP `playwright`.
- **Nube, dev (manual)**: migración, manifiesto `1.7.0` y prueba de humo con un agente y un administrador reales.

**Out of scope (para otros specs):**

- Exportación a Excel de la bitácora y TR-RN-047 (TR-REP, R3).
- Tickets reales: validar que el ticket existe, está abierto y asignado al agente, y el disparo al cerrarlo (TR-SOP, R3-08).
- Correo o aviso al administrador de una solicitud nueva (TR-NOT, R2). En este spec solo la bandeja y la insignia.
- Auditoría inmutable encadenada por hash y migrar el evento por petición a TR-AUD (spec 20).
- Productor del tipo `LOGIN`. El filtro lo acepta, pero nadie lo escribe todavía.
- Selector genérico de tenant para usuarios con varias membresías.
- Cierre explícito de sesiones en Supabase al vencer o revocar (como el 08).
- Sesiones activas (TR-RF-018) y transferir propiedad (TR-RF-021), R2.
- Banner en las apps de producto (SazónPOS, spec 26). Aquí solo el shell de plataforma.
- Throttler compartido o caché en Redis para el acceso vigente (una sola instancia hoy).

## Base de código reutilizada

**Se conserva:**

- `db/01b_seg.sql`: `seg.evento_seguridad` con su RLS y su trigger de solo inserción; `seg.usuario.tipo` y `tenant_preferido`; `seg.sin_borrado()`.
- Spec 06: `Asignacion.otorgar` (TR-RN-008), `cubre`, `PermisoGuard`, `CatalogoPermisos.sensible`, `MfaGuard`, trigger de versión de seguridad y caché de permisos por `vt`.
- Spec 08: agregado `Membresia` (`finalizar`), `Asignacion.revocar`, `Motivo`, `MembresiasFiltro`, `validar`, `exigirUuid`, `ConfirmacionRequeridaError`, `RepositorioMembresias.guardar`.
- Spec 11: outbox y `event-schemas.ts`. Los eventos nuevos no tienen consumidores.
- Spec 12: patrón de tarea BullMQ en `apps/worker` y de función `SECURITY DEFINER` para leer entre tenants.
- Spec 16a: `ENTIDADES_SEG_LECTURA`, patrón `{ items, total }` (tamaño 20, máximo 100), `selector-roles`, `vit-tabla`, `vit-filtros`, `vit-estado-vacio`, `AvisosService.confirmarDestructiva` con `longitudMinimaMotivo`.
- Spec 16b: techo PLAT de `PLAT_PROPIETARIO` al elegir el rol del agente.
- Spec 17a: chequeo de tenant operador (`OPERADOR_REQUERIDO`) y `GET /v1/org/tenants`.
- Spec 17c: sesión compartida entre `plataforma-consola` y `plataforma-admin`.

**Cambia:**

- `TipoEventoSeguridad` suma `ACCESO_SOPORTE`. `BitacoraSeguridad.registrar` acepta un tenant explícito para escribir en el tenant del cliente desde el operador (ver `SolicitarAccesoSoporte`).
- `Membresia` suma la transición `abrirSoporte`.
- `MiContexto` (back y front) suma `soporte: SesionSoporte | null`.
- `menu-lateral` y `riel-menu` del shell muestran una insignia numérica por código de opción.
- `apps/plataforma-consola/src/app/app.routes.ts` monta `CONSOLA_SOPORTE_ROUTES`.

**No existe** y se escribe desde cero: tabla y agregado de acceso de soporte, los catorce casos de uso, el interceptor, la tarea de vencimiento, los controladores, las páginas y el banner.

## Modelo de datos

### Migración `db/01b_seg_soporte.sql`

```sql
-- 1. Bitácora: catálogo de tipos e índices para TR-RNF-002.
ALTER TABLE seg.evento_seguridad
  ADD CONSTRAINT ck_evento_seguridad_tipo CHECK (tipo IN
    ('LOGIN', 'ACCESO_DENEGADO', 'ASIGNACION_OTORGADA', 'ASIGNACION_REVOCADA', 'ACCESO_SOPORTE'));
CREATE INDEX ix_evento_seguridad_fecha      ON seg.evento_seguridad (tenant_id, ocurrido_en DESC, id DESC);
CREATE INDEX ix_evento_seguridad_tipo_fecha ON seg.evento_seguridad (tenant_id, tipo, ocurrido_en DESC);
CREATE INDEX ix_evento_seguridad_usuario    ON seg.evento_seguridad (tenant_id, usuario_id, ocurrido_en DESC);

-- 2. Acceso de soporte. Vive en el tenant del cliente.
CREATE TABLE seg.acceso_soporte (
  id               uuid         PRIMARY KEY,
  tenant_id        uuid         NOT NULL REFERENCES org.tenant (id),
  agente_id        uuid         NOT NULL REFERENCES seg.usuario (id),
  ticket           char(10)     NOT NULL CHECK (ticket ~ '^SOP-[0-9]{6}$'),
  motivo           varchar(300) NOT NULL CHECK (char_length(motivo) BETWEEN 10 AND 300),
  modo             varchar(10)  NOT NULL CHECK (modo IN ('LECTURA', 'ESCRITURA')),
  horas_solicitadas smallint    NOT NULL CHECK (horas_solicitadas BETWEEN 1 AND 4),
  estado           varchar(10)  NOT NULL CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'REVOCADO', 'EXPIRADO')),
  solicitado_en    timestamptz  NOT NULL,
  caduca_en        timestamptz  NOT NULL,             -- solicitado_en + 24 h; solo aplica a PENDIENTE
  aprobado_por     uuid         NULL REFERENCES seg.usuario (id),
  horas_aprobadas  smallint     NULL CHECK (horas_aprobadas BETWEEN 1 AND 4),
  desde            timestamptz  NULL,
  hasta            timestamptz  NULL,
  membresia_id     uuid         NULL,
  asignacion_id    uuid         NULL,
  cerrado_por      uuid         NULL REFERENCES seg.usuario (id),   -- quien rechaza o revoca; NULL si expira
  cerrado_en       timestamptz  NULL,
  motivo_cierre    varchar(300) NULL,
  causa_cierre     varchar(15)  NULL CHECK (causa_cierre IN ('RECHAZO', 'ADMINISTRADOR', 'TICKET_CERRADO', 'VENCIMIENTO')),
  version          bigint       NOT NULL DEFAULT 0,
  FOREIGN KEY (tenant_id, membresia_id) REFERENCES seg.membresia (tenant_id, id),
  CONSTRAINT ck_soporte_aprobado CHECK (
    estado IN ('PENDIENTE', 'RECHAZADO')
    OR (aprobado_por IS NOT NULL AND horas_aprobadas IS NOT NULL AND desde IS NOT NULL
        AND hasta = desde + make_interval(hours => horas_aprobadas) AND membresia_id IS NOT NULL)
    OR (estado = 'EXPIRADO' AND aprobado_por IS NULL)),          -- pendiente que caducó
  CONSTRAINT ck_soporte_cierre CHECK (
    (estado IN ('PENDIENTE', 'APROBADO')) = (cerrado_en IS NULL))
);
-- Una sola solicitud abierta (PENDIENTE o APROBADO) por agente y tenant.
CREATE UNIQUE INDEX ux_soporte_abierto ON seg.acceso_soporte (tenant_id, agente_id)
  WHERE estado IN ('PENDIENTE', 'APROBADO');
CREATE INDEX ix_soporte_estado  ON seg.acceso_soporte (tenant_id, estado, solicitado_en DESC);
CREATE INDEX ix_soporte_ticket  ON seg.acceso_soporte (tenant_id, ticket) WHERE estado IN ('PENDIENTE', 'APROBADO');
CREATE INDEX ix_soporte_vence   ON seg.acceso_soporte (hasta)     WHERE estado = 'APROBADO';
CREATE INDEX ix_soporte_caduca  ON seg.acceso_soporte (caduca_en) WHERE estado = 'PENDIENTE';
-- RLS ENABLE + FORCE: select/insert/update con tenant_id = app.tenant_id (mismo DO de 01b_seg.sql).
-- Trigger seg.sin_borrado() por sentencia.

-- 3. Lecturas entre tenants (SECURITY DEFINER, SET search_path = '', sin datos personales).
CREATE FUNCTION seg.accesos_soporte_de_agente(p_agente uuid)
  RETURNS TABLE (id uuid, tenant_id uuid, tenant_nombre varchar, ticket char(10), modo varchar,
                 estado varchar, horas_solicitadas smallint, solicitado_en timestamptz,
                 desde timestamptz, hasta timestamptz, motivo_cierre varchar, causa_cierre varchar)
  LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '';   -- últimos 50, solicitado_en DESC

CREATE FUNCTION seg.accesos_soporte_por_vencer(p_ahora timestamptz)
  RETURNS TABLE (id uuid, tenant_id uuid)
  LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '';   -- APROBADO con hasta <= p_ahora
                                                                      -- y PENDIENTE con caduca_en <= p_ahora
```

- El dueño de las dos funciones es el mismo de las funciones `SECURITY DEFINER` del spec 12. `EXECUTE` solo al rol de la aplicación.
- La prueba SQL cubre: CHECK de tipo, RLS de `acceso_soporte` entre dos tenants, `ux_soporte_abierto`, `ck_soporte_aprobado` con 5 h (falla), las dos funciones y el `EXPLAIN` de la consulta de la bitácora usando `ix_evento_seguridad_fecha`.
- El inverso borra funciones, tabla, índices y el CHECK. Los eventos `ACCESO_SOPORTE` quedan (la tabla no admite `DELETE`).

### Dominio

```ts
// domain/acceso-soporte.ts
export type ModoSoporte = 'LECTURA' | 'ESCRITURA';
export type EstadoSoporte = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'REVOCADO' | 'EXPIRADO';
export type CausaCierreSoporte = 'RECHAZO' | 'ADMINISTRADOR' | 'TICKET_CERRADO' | 'VENCIMIENTO';

export const HORAS_MAXIMAS_SOPORTE = 4;
export const HORAS_CADUCIDAD_SOLICITUD = 24;

// Valores: Ticket (/^SOP-\d{6}$/), MotivoSoporte (recortado, 10-300), VigenciaSoporte (entero 1-4).

export class AccesoSoporte extends AggregateRoot {
  static solicitar(datos: { id; tenantId; agenteId; ticket: Ticket; motivo: MotivoSoporte;
                            modo: ModoSoporte; horas: VigenciaSoporte; ahora: Date }): AccesoSoporte; // PENDIENTE
  aprobar(datos: { aprobadoPor; horas: VigenciaSoporte; membresiaId; asignacionId; ahora: Date }): void;
      // PENDIENTE y no caducada -> APROBADO; desde = ahora, hasta = ahora + horas
  rechazar(motivo: Motivo, por: string, ahora: Date): void;            // PENDIENTE -> RECHAZADO
  revocar(causa: 'ADMINISTRADOR' | 'TICKET_CERRADO', motivo: Motivo, por: string | null, ahora: Date): void;
      // APROBADO -> REVOCADO; PENDIENTE -> RECHAZADO si la causa es TICKET_CERRADO
  expirar(ahora: Date): void;      // APROBADO con hasta <= ahora, o PENDIENTE con caducaEn <= ahora -> EXPIRADO
  vigente(ahora: Date): boolean;   // APROBADO y ahora < hasta
}

// domain/membresia.ts (se agrega)
static abrirSoporte(datos: { id; usuarioId; tenantId; hasta: Date; ahora: Date }): Membresia; // nueva, ACTIVO
reabrirSoporte(hasta: Date, ahora: Date): void;   // FINALIZADO -> ACTIVO, desde = ahora, hasta
```

`aprobar` exige `aprobadoPor !== agenteId` (`SoporteAutoaprobacionError`). El agregado emite un evento por transición.

Errores de dominio nuevos:

| Clase | `code` | HTTP | Mensaje |
| --- | --- | --- | --- |
| `VigenciaSoporteExcedidaError` | `VIGENCIA_SOPORTE_EXCEDIDA` | 400 | «La vigencia máxima es 4 horas» (TR-CA-054) |
| `VigenciaSoporteInvalidaError` | `VIGENCIA_SOPORTE_INVALIDA` | 400 | La vigencia debe ser un número entero de horas entre 1 y 4 |
| `TicketInvalidoError` | `TICKET_INVALIDO` | 400 | El ticket debe tener el formato SOP-###### |
| `MotivoSoporteInvalidoError` | `MOTIVO_SOPORTE_INVALIDO` | 400 | El motivo debe tener entre 10 y 300 caracteres |
| `SoporteAbiertoExistenteError` | `SOPORTE_ABIERTO_EXISTENTE` | 409 | Ya tiene una solicitud pendiente o un acceso vigente en este tenant |
| `SoporteAgenteEsMiembroError` | `SOPORTE_AGENTE_ES_MIEMBRO` | 409 | El agente ya es miembro de este tenant |
| `SoporteNoEncontradoError` | `SOPORTE_NO_ENCONTRADO` | 404 | La solicitud de soporte no existe |
| `TransicionSoporteError(de, accion)` | `TRANSICION_SOPORTE_INVALIDA` | 409 | No se puede `<accion>` un acceso de soporte `<de>` |
| `SoporteAutoaprobacionError` | `SOPORTE_AUTOAPROBACION` | 403 | El agente no puede aprobar su propio acceso |
| `SoporteNoVigenteError` | `SOPORTE_NO_VIGENTE` | 409 | El acceso de soporte no está vigente |
| `SoporteSoloLecturaError` | `SOPORTE_SOLO_LECTURA` | 403 | La sesión de soporte es de solo lectura |
| `SoportePermisoVetadoError(permiso)` | `SOPORTE_PERMISO_VETADO` | 403 | Una sesión de soporte no puede usar `<permiso>` |
| `RangoBitacoraInvalidoError` | `RANGO_BITACORA_INVALIDO` | 400 | El rango debe tener fecha inicial y final, en orden, de hasta 92 días |
| `AuditoriaNoDisponibleError` | `AUDITORIA_NO_DISPONIBLE` | 503 | No se pudo registrar la acción de soporte; intente de nuevo |

### Eventos de dominio (outbox, `aggregate_type` `acceso_soporte`, `schema_version = 1`)

| `event_type` | Datos |
| --- | --- |
| `soporte.solicitado` | `acceso_id`, `tenant_id`, `agente_id`, `ticket`, `modo`, `horas_solicitadas` |
| `soporte.aprobado` | `acceso_id`, `tenant_id`, `agente_id`, `aprobado_por`, `desde`, `hasta`, `modo` |
| `soporte.rechazado` | `acceso_id`, `tenant_id`, `cerrado_por`, `causa` |
| `soporte.revocado` | `acceso_id`, `tenant_id`, `cerrado_por`, `causa` |
| `soporte.expirado` | `acceso_id`, `tenant_id`, `estado_anterior` |

Se declaran en `infrastructure/event-schemas.ts`. Sin motivo ni datos personales en el payload. Sin consumidores en este spec.

Además (decidido al implementar el paso 6):

- `membresia.soporte_abierta` (`aggregate_type` `membresia`): `usuario_id`, `hasta`. Lo emiten `Membresia.abrirSoporte` y `reabrirSoporte`. Sin evento la versión no sube y el repositorio del spec 08 no guarda la reapertura.
- `membresia.finalizada` y `asignacion.revocada` admiten `por: null` cuando cierra el sistema (vencimiento o ticket cerrado). `Membresia.finalizar` y `Asignacion.revocar` aceptan `por: string | null`.

### Bitácora (`seg.evento_seguridad`, siempre en el tenant del cliente)

Todo el ciclo usa `tipo = 'ACCESO_SOPORTE'` con `detalle.accion`:

| `accion` | `usuario_id` | `detalle` |
| --- | --- | --- |
| `SOLICITADO` | agente | `acceso_id`, `ticket`, `modo`, `horas` |
| `APROBADO` | administrador | `acceso_id`, `ticket`, `agente_id`, `horas`, `hasta` |
| `RECHAZADO`, `REVOCADO` | quien cierra, o `NULL` si es TR-SOP | `acceso_id`, `ticket`, `causa` |
| `EXPIRADO` | `NULL` | `acceso_id`, `ticket`, `estado_anterior` |
| `PETICION` | agente | `acceso_id`, `ticket`, `modo`, `metodo`, `ruta` (patrón de la ruta), `permiso`, `resultado` (`PERMITIDA`, `SOLO_LECTURA`, `VETADA`) |

El motivo no va al detalle: se lee de `seg.acceso_soporte`. `ip` se llena con la IP de la petición cuando la hay.

### Puertos (`application/ports/`)

```ts
// lectura-bitacora.ts
interface FiltroBitacora {
  desde: Fecha; hasta: Fecha;          // obligatorias, America/Lima, hasta - desde <= 92 días
  tipo?: TipoEventoSeguridad;
  usuario?: string;                    // ILIKE sobre correo o nombre de seg.usuario
  pagina: number; tamano: number;      // 1..100, defecto 20
}
interface EventoBitacora {
  id: string;                          // bigserial como texto
  tipo: TipoEventoSeguridad; ocurridoEn: Date;
  usuario: { id: string; nombre: string; correo: string } | null;
  resumen: string | null;              // permiso faltante, ticket o rol según el tipo
}
interface EventoBitacoraDetalle extends EventoBitacora { ip: string | null; detalle: Record<string, unknown> }
interface LecturaBitacora {
  listar(filtro: FiltroBitacora): Promise<Listado<EventoBitacora>>;   // ocurrido_en DESC, id DESC
  detalle(id: string): Promise<EventoBitacoraDetalle | null>;
}

// acceso-soporte.repositorio.ts
interface RepositorioAccesosSoporte {
  buscar(id: string): Promise<AccesoSoporte | null>;
  abiertoDe(agenteId: string): Promise<AccesoSoporte | null>;        // en el tenant del contexto
  abiertosPorTicket(ticket: Ticket): Promise<AccesoSoporte[]>;
  guardar(acceso: AccesoSoporte): Promise<void>;                     // bloqueo optimista por version
}

// lectura-soporte.ts
interface LecturaSoporte {
  delTenant(filtro: { estado?: EstadoSoporte; pagina; tamano }): Promise<Listado<SolicitudSoporte>>;
  pendientes(ahora: Date): Promise<number>;
  deAgente(agenteId: string): Promise<AccesoDelAgente[]>;            // seg.accesos_soporte_de_agente
  porVencer(ahora: Date): Promise<{ id: string; tenantId: string }[]>; // seg.accesos_soporte_por_vencer
  vigenteDe(usuarioId: string, tenantId: string, ahora: Date): Promise<SesionSoporte | null>;
}
interface SesionSoporte { accesoId: string; ticket: string; modo: ModoSoporte; hasta: Date }

// verificador-ticket.port.ts
interface VerificadorTicket {
  verificar(datos: { ticket: Ticket; tenantId: string; agenteId: string }): Promise<void>;
}
```

- `VerificadorTicket` en R1 es `VerificadorTicketPorFormato` (`infrastructure/verificador-ticket.formato.ts`): no hace nada más que lo que ya garantiza `Ticket`. En R3 TR-SOP pone el real (ticket abierto y asignado al agente).
- `deAgente` y `porVencer` llaman a las funciones `SECURITY DEFINER` con SQL crudo en un método del adaptador (funciones de base de datos, regla 11). Todo lo demás es TypeORM: `AccesoSoporteEntidad` y `EventoSeguridadEntidad` en `infrastructure/typeorm/`, la segunda en `ENTIDADES_SEG_LECTURA`.
- `RepositorioMembresias` suma `deUsuarioEnTenant(usuarioId)` si no existe ya un método equivalente.
- `PreferenciaTenant` (puerto nuevo o método del repositorio del 08 que ya hace `UPDATE seg.usuario SET tenant_preferido`) con `fijar(usuarioId, tenantId)`.

### Casos de uso: puntos no obvios

**`SolicitarAccesoSoporte`** (agente, token del tenant operador). Comando: `{ tenantId, ticket, motivo, modo, horas, agenteId, tenantActual }`.

1. Exige `tenantActual` = tenant operador (`OPERADOR_REQUERIDO`, como el 17a) y `tenantId` distinto del operador.
2. Valida `Ticket`, `MotivoSoporte`, `VigenciaSoporte` (más de 4: `VIGENCIA_SOPORTE_EXCEDIDA`) y llama a `VerificadorTicket`.
3. Abre la transacción **en el tenant del cliente** (`contexto.run({ tenantId })`), como el alta del spec 12.
4. Si el agente tiene membresía en ese tenant sin acceso de soporte que la referencie: `SOPORTE_AGENTE_ES_MIEMBRO`. Si `abiertoDe` devuelve algo: `SOPORTE_ABIERTO_EXISTENTE` (también lo cubre `ux_soporte_abierto`).
5. Guarda, escribe `SOLICITADO` en la bitácora del cliente y `soporte.solicitado` en el outbox.

**`AprobarAccesoSoporte`** (administrador, `plat.soporte.autorizar`, aal2). Comando: `{ accesoId, horas, rolId | perfilId, aprobadoPor }`.

1. Valida `VigenciaSoporte` antes de leer nada (TR-CA-054).
2. Carga el acceso; si está `PENDIENTE` pero `caducaEn <= ahora`, lo expira en la misma transacción y responde `TRANSICION_SOPORTE_INVALIDA`.
3. Crea la membresía con `Membresia.abrirSoporte` o reabre la fila `FINALIZADO` del agente (`UNIQUE (usuario_id, tenant_id)`). Si la fila está `ACTIVO`, `INVITADO` o `SUSPENDIDO`: `SOPORTE_AGENTE_ES_MIEMBRO`.
4. Otorga la asignación con `Asignacion.otorgar` (alcance `TENANT`, `vigente_desde` = hoy, `vigente_hasta` = la fecha Lima de `hasta`) y el techo PLAT del 16b. El otorgante es el administrador: valen sus reglas de alcance.
5. `acceso.aprobar(...)`, bitácora `APROBADO`, outbox `soporte.aprobado`. El cambio de membresía sube `vt` e invalida la caché.

**`RechazarAccesoSoporte` y `RevocarAccesoSoporte`** (`plat.soporte.autorizar`). Motivo 4-300 (`Motivo` del 08) y `confirmar: true` en revocar. Revocar finaliza la membresía (`hasta = ahora`) y revoca la asignación con el mismo motivo, en la misma transacción.

**`RevocarAccesosPorTicket(tenantId, ticket)`**: sin HTTP. Revoca con causa `TICKET_CERRADO` los accesos abiertos del ticket (los `PENDIENTE` pasan a `RECHAZADO`). Es idempotente: sin accesos abiertos no hace nada. Lo llamará TR-SOP (TR-CA-055).

**`VencerAccesosSoporte(ahora)`**: lo corre el worker. Lee `porVencer` y procesa cada acceso en su propia transacción y tenant: `expirar`, finaliza membresía y revoca asignación si estaba aprobado, bitácora `EXPIRADO`, outbox `soporte.expirado`. Un fallo en uno no detiene los demás; se registra con `acceso_id` y `tenant_id`, sin datos personales.

**`EntrarComoSoporte(accesoId, agenteId)`**: con el token del operador. Lee con `deAgente` que el acceso es del agente y está vigente (`SOPORTE_NO_VIGENTE` si no). Fija `tenant_preferido` = tenant del cliente. Responde `{ tenantId, hasta }`; el front hace `refreshSession()`.

**`SalirDeSoporte(agenteId)`**: autenticado, sin `@Permiso` (el agente no tiene `plat.soporte.solicitar` en el tenant del cliente). Fija `tenant_preferido` al tenant de la membresía del agente que no es de soporte. Es idempotente.

**`ResolverAccesoSoporteVigente(usuarioId, tenantId)`**: lo usa el interceptor y `mi-contexto`. Cachea en memoria por `usuario + tenant + vt` (60 s, como los permisos). Compara `hasta` con la hora en cada llamada, así que el corte es exacto aunque la entrada siga en caché.

### Interceptor `SoporteInterceptor` (global, después de `ContextoTenantInterceptor`)

1. Sin principal o sin tenant: sigue.
2. `ResolverAccesoSoporteVigente`. Sin acceso vigente: sigue.
3. Lee el permiso de `@Permiso` con `Reflector`. Si está en `PERMISOS_VETADOS_SOPORTE`: resultado `VETADA`, 403 `SOPORTE_PERMISO_VETADO`.
4. Si el modo es `LECTURA` y el método no es `GET`, `HEAD` ni `OPTIONS`: resultado `SOLO_LECTURA`, 403 `SOPORTE_SOLO_LECTURA`.
5. Escribe el evento `PETICION` en su propia transacción **antes** de ejecutar el controlador. Si no puede escribir: 503 `AUDITORIA_NO_DISPONIBLE` y no ejecuta (falla cerrado, TR-RNF-110).

```ts
// domain/permisos-seg.ts
export const PERMISOS_VETADOS_SOPORTE = [
  'plat.soporte.autorizar', 'plat.soporte.solicitar', 'plat.usuario.invitar',
  'plat.asignacion.otorgar', 'plat.asignacion.revocar', 'plat.rol.gestionar', 'plat.perfil.gestionar',
] as const;
```

Las denegaciones por `PermisoGuard` (falta de permiso) siguen como `ACCESO_DENEGADO`: los guards corren antes que los interceptores.

### HTTP (`/v1/seg`, OpenAPI, errores `{ codigo, mensaje }`)

| Método y ruta | Permiso | Cuerpo o query | Respuesta |
| --- | --- | --- | --- |
| `GET /bitacora` | `plat.seguridad.bitacora` | `desde`, `hasta` (`YYYY-MM-DD`), `tipo?`, `usuario?` (2-100), `pagina`, `tamano` | `{ items: EventoBitacora[], total }` |
| `GET /bitacora/:id` | `plat.seguridad.bitacora` | — | `EventoBitacoraDetalle` o 404 |
| `POST /soporte/solicitudes` | `plat.soporte.solicitar` | `{ tenantId, ticket, motivo, modo, horas }` | 201 `{ id }` |
| `GET /soporte/mis-accesos` | `plat.soporte.solicitar` | — | `AccesoDelAgente[]` |
| `POST /soporte/accesos/:id/entrar` | `plat.soporte.solicitar` | — | `{ tenantId, hasta }` |
| `POST /soporte/salir` | autenticado | — | 204 |
| `GET /soporte/solicitudes` | `plat.soporte.autorizar` | `estado?`, `pagina`, `tamano` | `{ items: SolicitudSoporte[], total }` |
| `GET /soporte/solicitudes/pendientes` | `plat.soporte.autorizar` | — | `{ total }` |
| `POST /soporte/solicitudes/:id/aprobar` | `plat.soporte.autorizar` (aal2) | `{ horas, rolId?, perfilId? }` | 200 `{ desde, hasta }` |
| `POST /soporte/solicitudes/:id/rechazar` | `plat.soporte.autorizar` (aal2) | `{ motivo }` | 204 |
| `POST /soporte/accesos/:id/revocar` | `plat.soporte.autorizar` (aal2) | `{ motivo, confirmar }` | 204 |

`SolicitudSoporte` incluye agente (nombre y correo), ticket, motivo, modo, horas solicitadas, estado, fechas y quién cerró. `GET /v1/seg/mi-contexto` suma `soporte: { accesoId, ticket, modo, hasta } | null`. Con soporte vigente, `permisos` y `menu` vienen sin los códigos de `PERMISOS_VETADOS_SOPORTE` ni las opciones que solo dependen de ellos.

### Manifiesto PLAT `1.7.0`

Permisos:

| Código | Descripción | `alcance_minimo` | `sensible` |
| --- | --- | --- | --- |
| `plat.seguridad.bitacora` | Consultar la bitácora de seguridad del tenant | `TENANT` | no |
| `plat.soporte.autorizar` | Aprobar, rechazar y revocar accesos temporales de soporte | `TENANT` | sí |
| `plat.soporte.solicitar` | Solicitar y usar accesos temporales de soporte (solo desde el tenant operador) | `TENANT` | no |

Opciones de menú:

- `plat.seguridad.bitacora` → `/admin/bitacora`, icono `history`, padre `plat.seguridad`, orden 5.
- `plat.seguridad.soporte` → `/admin/soporte`, icono `support_agent`, padre `plat.seguridad`, orden 6, permiso `plat.soporte.autorizar`.
- `plat.consola.soporte` → `/consola/soporte`, icono `support_agent`, padre `plat.consola`, orden 2, permiso `plat.soporte.solicitar`.

Roles:

- `PLAT_PROPIETARIO` suma `plat.seguridad.bitacora` y `plat.soporte.autorizar`.
- `PLAT_ADMIN_SEGURIDAD` suma `plat.seguridad.bitacora`.
- Nuevo `PLAT_AGENTE_SOPORTE`: `plat.soporte.solicitar`, `plat.tenant.consultar` y `plat.sesion.contexto` (este último, como todo rol predefinido; se agregó en el paso 10). Queda fuera del techo de `PLAT_PROPIETARIO` (16b), así que un cliente no lo puede asignar.

### Worker (`apps/worker/src/soporte/`)

- `tarea-vencimiento-soporte.ts`: cola `seg-soporte-vencimiento`, job scheduler de BullMQ cada 60 s (`SOPORTE_VENCIMIENTO_CADA_MS`, defecto 60000, en `config/env.ts` y `.env.example`). Llama a `VencerAccesosSoporte`.
- `soporte.module.ts` registrado en `worker.module.ts`.
- `cli/ejecutar-vencimiento-soporte.ts`: corre la tarea una vez (pruebas y operación manual), como el CLI del spec 12.

### Front

#### Diseño UI (sección «Diseño UI» de `CLAUDE.md`)

Cada pantalla parte de una pantalla tipo del canvas «Vitrina · Diseño UI» (página «Pantallas tipo»):

| Pantalla | Pantalla tipo | En qué cambia |
| --- | --- | --- |
| `/admin/bitacora` | Lista (`Lista.dc.html`; vacío, error y carga de `U-Estados.dc.html`) | `vit-filtros` con rango de fechas, tipo y usuario. Sin acciones masivas; la fila abre el detalle. Tipo con `vit-chip-estado` y el mapa `TONOS_TIPO_EVENTO`. |
| `/admin/bitacora/:id` | Detalle (`Detalle.dc.html`) | Solo lectura, sin acciones. Bloque «Datos del evento» como lista clave-valor. |
| `/admin/soporte` | Lista | Pestañas Pendientes, Vigentes e Historial sobre la misma `vit-tabla`. Estado con `vit-chip-estado` y `TONOS_ESTADO_SOPORTE`. Acciones de fila de 32 px: Aprobar, y Rechazar y Revocar con `vit-destructivo`. |
| `/admin/soporte/:id/aprobar` | Formulario (`Formulario.dc.html`) | Resumen de la solicitud en solo lectura arriba; campos horas (1-4) y rol o perfil (`selector-roles`). `vit-acciones-formulario`. |
| Rechazar y revocar | Confirmación destructiva (`Confirmacion.dc.html`) | `AvisosService.confirmarDestructiva` con motivo (`longitudMinimaMotivo: 4`). |
| `/consola/soporte` | Lista | «Mis accesos» del agente. Estado con `TONOS_ESTADO_SOPORTE`. Acción de fila «Entrar» solo en accesos vigentes. Botón «Solicitar acceso» en la cabecera. |
| `/consola/soporte/solicitar` | Formulario | Tenant (autocompletar), ticket, motivo, modo y horas. |
| Banner de soporte | Página «18 · Soporte» del canvas: `S-Shell.dc.html` (claro), `S-Banner-oscuro.dc.html`, `S-Banner-movil.dc.html` y `S-Banner-movil-oscuro.dc.html` | Franja de 40 px a todo el ancho, encima del menú lateral y de la barra superior, con tono de advertencia. Botón «Salir de soporte» de 32 px con borde. A 360 px el texto va en dos líneas y el botón se llama «Salir», con 44 px de alto. |
| Fin del acceso | `S-Terminado.dc.html` | Sin banner y con el aviso «El acceso de soporte terminó» abajo al centro. |
| Insignia en el menú | `S-Insignia.dc.html`, `S-Insignia-colapsado.dc.html` y `S-Insignia-oscuro.dc.html` (variantes de `Shell-Menu.dc.html`) | Píldora de 22 px con el número, a la derecha de la opción «Soporte». Con el módulo cerrado va en el módulo «Seguridad». En el riel colapsado es un punto de 18 px arriba a la derecha del ícono y se repite en el submenú. El lector de pantalla oye «Soporte, 3 solicitudes pendientes». |

Reglas que aplican a todas:

- Colores solo con tokens `--color-*` de `libs/shared/ui/src/estilos/tema.css` y el tema M3 esmeralda. Sin hex sueltos; `dark:` solo si un token no alcanza.
- `vit-tabla` compacta con `ColumnaTabla.movil` definida en cada columna que se ve en celular (fecha y tipo en la bitácora; agente y estado en soporte; tenant y estado en la consola).
- Mapas de tonos propios en `models/` de cada lib: `TONOS_TIPO_EVENTO` (`ACCESO_DENEGADO` advertencia, `ACCESO_SOPORTE` información, asignaciones neutro) y `TONOS_ESTADO_SOPORTE` (`PENDIENTE` advertencia, `APROBADO` éxito, `RECHAZADO`/`REVOCADO`/`EXPIRADO` neutro). Los valores salen de `TonoEstado`.
- Densidad media: campos de 40 px y botones de fila de 32 px, sin alturas propias por componente.
- Íconos Material Symbols Outlined (`history`, `support_agent`, `login`, `logout`). Las features no tocan el shell; el banner y la insignia son cambios de `libs/shared/shell`.
- Cada pantalla se verifica en tema claro y oscuro y a 600 px de ancho.

**`libs/shared/auth`**: `models/mi-contexto.ts` suma `soporte: SesionSoporte | null` con `hasta` como `Date`.

**`libs/shared/shell`**:

- `components/banner-soporte/`: franja fija arriba del layout, en todas las pantallas del shell, con rol `status`. Texto: «Sesión de soporte · Ticket SOP-000245 · Solo lectura · Termina a las 16:30». Botón «Salir de soporte». Colores solo con tokens de `shared/ui` (estado de advertencia). Su aspecto exacto (alto, ubicación respecto de la barra superior, versión a 360 px y oscura) sale del artboard del canvas.
- `services/sesion-soporte.service.ts`: llama a `POST /v1/seg/soporte/salir`, luego `refreshSession()` y recarga `mi-contexto`. Al llegar `hasta` hace lo mismo sin llamar a salir y muestra «El acceso de soporte terminó».
- `config/insignias-menu.ts`: token `INSIGNIAS_MENU` (`Signal<Record<string, number>>`, opcional). `menu-lateral` y `riel-menu` muestran la insignia junto a la opción cuyo código coincide, si el número es mayor que 0.

**`libs/plataforma/admin-cliente`**:

| Ruta | Página | Contenido |
| --- | --- | --- |
| `/admin/bitacora` | `pages/bitacora-lista/` | Filtros desde, hasta (por defecto últimos 7 días), tipo y usuario en la URL; `vit-tabla` con fecha, tipo, usuario y resumen; vacío: «Sin eventos para los filtros seleccionados» (TR-CA-052) |
| `/admin/bitacora/:id` | `pages/bitacora-detalle/` | Fecha, tipo, usuario, IP y el detalle como lista clave-valor en texto plano |
| `/admin/soporte` | `pages/soporte-lista/` | Pestañas Pendientes, Vigentes e Historial; acciones Aprobar, Rechazar (motivo) y Revocar (motivo y confirmación) |
| `/admin/soporte/:id/aprobar` | `pages/soporte-aprobar/` | Datos de la solicitud; horas (selector 1-4, por defecto las solicitadas); rol o perfil con `selector-roles` |

- Servicios `bitacora.cliente.ts`, `soporte.cliente.ts` y `insignias-soporte.service.ts` (provee `INSIGNIAS_MENU` con `plat.seguridad.soporte`; carga al iniciar, al volver a la pestaña y tras aprobar o rechazar).
- Modelos `evento-seguridad.ts` y `acceso-soporte.ts`; mensajes nuevos en `mensajes-admin.ts`.

**`libs/plataforma/consola-soporte`** (nueva):

- `pages/accesos-soporte/` en `/consola/soporte`: tabla «Mis accesos» con estado, ticket, tenant y fin, y botón «Solicitar acceso».
- `pages/solicitar-soporte/` en `/consola/soporte/solicitar`: tenant con autocompletar sobre `GET /v1/org/tenants`, ticket, motivo, modo y horas 1-4. Al guardar vuelve a la lista.
- Acción «Entrar» en un acceso vigente: `POST .../entrar`, `refreshSession()` y navegación a `plataforma-admin` por el enlace del 17c.
- `services/soporte-agente.cliente.ts`, `services/tenants-soporte.cliente.ts`, `models/`, `consola-soporte.routes.ts` (`CONSOLA_SOPORTE_ROUTES`).

## Plan de implementación

1. **Migración.** `db/01b_seg_soporte.sql`, su inverso y la prueba SQL. Verificar en local con PGlite: aplica, prueba verde, inverso deja el esquema como antes.
2. **Dominio.** `acceso-soporte.ts` con sus valores, `abrirSoporte` y `reabrirSoporte` en `membresia.ts`, eventos, errores y `PERMISOS_VETADOS_SOPORTE`. Pruebas Jest de cada transición, límites 1-4 y 10-300, y formato del ticket.
3. **Persistencia.** `AccesoSoporteEntidad`, `EventoSeguridadEntidad`, `RepositorioAccesosSoporte`, `LecturaSoporte`, `LecturaBitacora`, `VerificadorTicketPorFormato` y `TipoEventoSeguridad` ampliado. Pruebas de integración de cada adaptador con RLS entre dos tenants.
4. **Bitácora back.** `ConsultarBitacora`, `ConsultarEventoSeguridad` y `bitacora.controller.ts`. Pruebas HTTP de TR-CA-051 y 052, rango inválido y aislamiento.
5. **Solicitud.** `SolicitarAccesoSoporte`, `ListarMisAccesosSoporte` y sus rutas. Pruebas: operador requerido, agente miembro, solicitud duplicada, 8 h rechazado.
6. **Aprobación y cierre.** `AprobarAccesoSoporte`, `RechazarAccesoSoporte`, `RevocarAccesoSoporte`, `RevocarAccesosPorTicket`, `ListarSolicitudesSoporte`, `ContarSolicitudesPendientes` y sus rutas. Pruebas de TR-CA-053 (aprobación por 2 h), 054 y 055, autoaprobación, aal2 y reapertura de membresía `FINALIZADO`.
7. **Entrada, salida y contexto.** `EntrarComoSoporte`, `SalirDeSoporte`, `ResolverAccesoSoporteVigente` y `soporte` en `mi-contexto`. Prueba: tras entrar, el hook entrega el tenant del cliente; tras salir, el del operador.
8. **Interceptor.** `SoporteInterceptor` registrado global en `SeguridadModule`. Pruebas: evento `PETICION` por cada petición, solo lectura, permiso vetado, falla cerrado si la bitácora no escribe, usuarios normales sin cambio.
9. **Worker.** `VencerAccesosSoporte`, la tarea repetible y el CLI. Pruebas: aprobado vencido pasa a `EXPIRADO` y pierde permisos; pendiente de 24 h pasa a `EXPIRADO`; un fallo no frena el resto.
10. **Manifiesto `1.7.0`.** Permisos, opciones y roles. Prueba de aplicación del manifiesto y del techo de `PLAT_AGENTE_SOPORTE`.
11. **Shell.** `MiContexto.soporte`, `banner-soporte`, `sesion-soporte.service.ts` e `INSIGNIAS_MENU`. Pruebas Vitest del banner, de la salida y del vencimiento.
12. **Admin cliente, bitácora.** Clientes, modelos y las dos páginas de bitácora. Vitest con `HttpTestingController`.
13. **Admin cliente, soporte.** Bandeja, aprobar, rechazar, revocar e insignia. Vitest.
14. **Consola soporte.** Lib nueva con `nx g`, páginas «Mis accesos» y «Solicitar acceso», y montaje en `plataforma-consola`. Vitest.
15. **Nube dev.** Aplicar la migración y el manifiesto `1.7.0` por MCP. Sembrar un agente con `PLAT_AGENTE_SOPORTE` en el tenant operador. Prueba de humo de punta a punta.
16. **Navegador.** MCP `playwright` con las dos apps levantadas: recorrer los GWT de UI, revisar la consola sin errores y tomar capturas de las pantallas nuevas y del banner en tema claro y oscuro, a 600 y 1280 px.

## Criterios de aceptación

**SRS:**

- [ ] TR-CA-051: con 15 eventos `ACCESO_DENEGADO` en la última semana, filtrar por ese tipo y ese rango devuelve los 15, cada uno con usuario, permiso faltante (en `resumen`) y fecha.
- [ ] TR-CA-052: filtrar `ACCESO_SOPORTE` entre 2026-09-01 y 2026-09-30 sin eventos devuelve `{ items: [], total: 0 }` y la página muestra «Sin eventos para los filtros seleccionados».
- [ ] TR-CA-053: el agente solicita lectura para `SOP-000245`, el administrador aprueba por 2 h, el agente entra al tenant con el banner visible, y a las 2 h (reloj simulado) pierde los permisos y el acceso queda `EXPIRADO`.
- [ ] TR-CA-054: aprobar con `horas: 8` responde 400 `VIGENCIA_SOPORTE_EXCEDIDA` con «La vigencia máxima es 4 horas» y no cambia nada. El selector de la UI no ofrece más de 4.
- [ ] TR-CA-055: con acceso vigente por `SOP-000245`, `RevocarAccesosPorTicket(tenant, 'SOP-000245')` lo deja `REVOCADO` con causa `TICKET_CERRADO`, y la siguiente petición del agente da 403.

**Bitácora:**

- [ ] `GET /v1/seg/bitacora` nunca devuelve eventos de otro tenant (prueba con dos tenants).
- [ ] Sin `desde` o `hasta`, con `desde > hasta` o con más de 92 días: 400 `RANGO_BITACORA_INVALIDO`.
- [ ] El filtro `usuario` encuentra por parte del correo o del nombre, sin distinguir mayúsculas.
- [ ] `EXPLAIN` de la consulta con 100 000 eventos en un tenant usa `ix_evento_seguridad_fecha` o `ix_evento_seguridad_tipo_fecha`, no un barrido secuencial.
- [ ] `GET /v1/seg/bitacora/:id` devuelve la IP y el detalle; un id de otro tenant da 404.

**Ciclo de soporte:**

- [ ] Solicitar desde un tenant que no es el operador da 403 `OPERADOR_REQUERIDO`.
- [ ] Ticket `SOP-12`, motivo de 9 caracteres u horas 0 o 5 dan 400 con su código.
- [ ] Una segunda solicitud del mismo agente al mismo tenant con otra abierta da 409 `SOPORTE_ABIERTO_EXISTENTE`.
- [ ] Un agente que ya es miembro normal del tenant recibe 409 `SOPORTE_AGENTE_ES_MIEMBRO`.
- [ ] Aprobar, rechazar o revocar sin aal2 da el 401/403 de step-up del spec 05.
- [ ] Aprobar crea o reabre la membresía `ACTIVO` con `hasta = desde + horas` y una asignación de alcance `TENANT` con el rol elegido.
- [ ] Un rol fuera del techo de `PLAT_PROPIETARIO` al aprobar da el error del 16b.
- [ ] Revocar exige `confirmar: true` y motivo; deja la membresía `FINALIZADO` y la asignación revocada en la misma transacción.
- [ ] Una solicitud `PENDIENTE` con más de 24 h pasa a `EXPIRADO` en la siguiente corrida del worker, y aprobarla antes da `TRANSICION_SOPORTE_INVALIDA`.
- [ ] Cada transición deja una fila `ACCESO_SOPORTE` con su `accion` en la bitácora del cliente y un evento en `sync.outbox` en la misma transacción.
- [ ] Tras `entrar` y refrescar, el token trae el `tenant_id` del cliente; tras `salir` y refrescar, el del operador.
- [ ] Al vencer, `PermisoGuard` niega en la primera petición posterior a `hasta`, sin esperar el TTL de la caché.

**Interceptor:**

- [ ] Cada petición del agente en el tenant del cliente deja exactamente un evento `PETICION` con ticket, método, patrón de ruta, permiso y resultado, sin cuerpo ni query.
- [ ] En modo `LECTURA`, un `POST` da 403 `SOPORTE_SOLO_LECTURA`, no ejecuta el controlador y queda auditado con resultado `SOLO_LECTURA`.
- [ ] En modo `ESCRITURA`, una ruta con `plat.asignacion.otorgar` da 403 `SOPORTE_PERMISO_VETADO` aunque el rol aprobado lo tenga.
- [ ] Si la escritura en la bitácora falla, la petición responde 503 `AUDITORIA_NO_DISPONIBLE` y el controlador no corre.
- [ ] Las peticiones de usuarios sin acceso de soporte no escriben eventos `PETICION`.

**Front:**

- [ ] El banner aparece en todas las pantallas del shell mientras `mi-contexto.soporte` no es `null`, con ticket, modo y hora de fin en hora de Lima.
- [ ] Con soporte vigente, el menú del agente no muestra «Usuarios», «Roles», «Perfiles», «Asignaciones» ni «Soporte» aunque el rol aprobado los tenga.
- [ ] «Salir de soporte» devuelve al agente al tenant operador y el banner desaparece.
- [ ] Al llegar `hasta`, la app refresca la sesión sin intervención y muestra «El acceso de soporte terminó».
- [ ] La opción «Soporte» del menú muestra el número de solicitudes pendientes y se actualiza tras aprobar o rechazar.
- [ ] El agente solicita, ve el estado `PENDIENTE`, y tras la aprobación ve «Entrar» y llega a `plataforma-admin` con el banner.
- [ ] Cada página nueva coincide con su pantalla tipo del canvas en lo que la tabla «Diseño UI» no marca como cambio; el banner y la insignia coinciden con sus artboards.
- [ ] Ningún archivo nuevo de componente tiene colores hex; estados y tipos usan `vit-chip-estado` con `TONOS_ESTADO_SOPORTE` y `TONOS_TIPO_EVENTO`.
- [ ] Rechazar y Revocar usan `vit-destructivo` y `confirmarDestructiva`.
- [ ] Cada página nueva y el banner se ven bien en tema claro y oscuro, a 600 px y a 1280 px; a 600 px las tablas muestran la vista `ColumnaTabla.movil`.
- [ ] Verificación con el MCP `playwright`: GWT 051 a 054 recorridos en el navegador, consola sin errores y capturas de las páginas nuevas. Si no se pudo, se dice así en el cierre.

**Calidad:**

- [ ] La migración tiene inverso y ambos corren verdes en CI contra PostgreSQL 16.
- [ ] Cada endpoint nuevo tiene `@Permiso` (salvo `salir`) y OpenAPI.
- [ ] Cobertura del dominio de `seguridad` ≥ 70 %.
- [ ] Ningún log incluye correo, motivo ni token.
- [ ] `nx affected -t lint test build` verde; `enforce-module-boundaries` sin violaciones.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier:code-simplifier`.
- [ ] Probado en Supabase dev; horas reales registradas.

## Decisiones

- **Sí:** todo en un spec (back, UI del cliente, UI del agente y banner). Decisión del usuario, aunque pase de 10 h.
- **Sí:** puerto `VerificadorTicket` con adaptador de solo formato en R1. TR-SOP pone el real en R3 sin tocar los casos de uso.
- **No:** validar el ticket solo en el dominio sin puerto. Obligaría a cambiar el caso de uso en R3.
- **Sí:** `RevocarAccesosPorTicket` sin HTTP. TR-CA-055 se prueba llamándolo; TR-SOP lo invocará.
- **Sí:** tabla `seg.acceso_soporte` más membresía real. El hook, los permisos y la caché ya entienden membresía con `hasta`; no se duplica lógica.
- **No:** agregar un tipo SOPORTE a `seg.membresia`. Se sabe que es de soporte porque un acceso la referencia.
- **Sí:** reabrir la fila `FINALIZADO` del agente en accesos sucesivos. `UNIQUE (usuario_id, tenant_id)` no permite otra.
- **Sí:** el agente aparece en la lista de miembros del 16a mientras tiene acceso. Es visible para el cliente, como pide TR-RNF-110.
- **Sí:** dos permisos, `plat.soporte.solicitar` (operador) y `plat.soporte.autorizar` (cliente, sensible). El SRS daba uno solo a dos actores distintos.
- **Sí:** rol o perfil elegido por el administrador al aprobar, con el techo del 16b. Cubre permisos de productos, que un rol PLAT fijo no cubre.
- **Sí:** `LECTURA` se aplica por método HTTP. **No:** clasificar todo el catálogo en lectura y escritura; obliga a tocar todos los manifiestos.
- **Sí (paso 13):** las insignias del menú van en `InsigniasMenuService` del shell (en raíz, con `fijar(codigo, cantidad)`) en vez del token `INSIGNIAS_MENU`. `admin-cliente` se carga de forma diferida y la regla de Nx prohíbe importarla estática desde `app.config`; la app la arranca con un import dinámico (`iniciarInsigniasSoporte`).
- **Sí (paso 13):** aprobar elige el rol o perfil con el selector único de asignables del 16a (`/seg/asignables`), no con `selector-roles` (que es de varios roles para un perfil). La página busca la solicitud entre las pendientes: no hay `GET` por id.
- **Sí (paso 8):** `@EscrituraPermitidaEnSoporte()` en `POST /seg/soporte/salir`. Sin la marca, el bloqueo por método no dejaría salir a una sesión de solo lectura. La petición se audita igual.
- **Sí:** lista fija de permisos vetados en soporte. El agente nunca gestiona usuarios, roles ni soporte.
- **Sí:** entrar y salir con `tenant_preferido` y `refreshSession()`. **No:** selector genérico de tenant; merece su propio spec.
- **Sí:** auditar toda petición, antes del controlador y fallando cerrado. Garantiza el 100 % de TR-RNF-110 aunque el controlador falle.
- **No:** auditar solo escrituras. Ley 29733 cuenta también la lectura de datos personales.
- **Sí:** evento por petición en `seg.evento_seguridad` con `accion`. Se migra a TR-AUD en el spec 20.
- **Sí:** doble barrera de vencimiento: `ResolverAccesoSoporteVigente` y `membresia.hasta` cortan al instante; el worker cada 60 s deja el estado `EXPIRADO`, finaliza la membresía y sube `vt`.
- **No:** barrido bajo demanda sin worker. La bitácora y la bandeja mostrarían estados viejos.
- **Sí:** más de 4 h se rechaza (`VIGENCIA_SOPORTE_EXCEDIDA`), no se recorta. Coincide con `vigencia_horas (1-4)` del SRS.
- **Sí:** una solicitud pendiente caduca a las 24 h. El SRS no la define y una solicitud eterna es un riesgo.
- **Sí:** el agente propone las horas y el administrador las confirma o cambia al aprobar.
- **Sí:** bandeja e insignia en el menú, sin correo. El correo llega con TR-NOT (R2).
- **No:** exportación en este spec. RF-019 es Should; TR-RN-047 pide permiso propio, auditoría y vencimiento de archivo a 72 h, que dependen de TR-REP y TR-ARC.
- **Sí:** paginación `{ items, total }` como el 16a, con rango de fechas obligatorio de hasta 92 días para acotar el `count`. **No:** cursor sin total; rompe el patrón de `vit-tabla`.
- **Sí:** filtro de usuario por correo o nombre con `ILIKE`.
- **Sí:** la página del agente en una lib nueva `consola-soporte`. `consola-tenants` tiene otro motivo de cambio.
- **Sí:** la consola del agente en dos rutas (lista y formulario) en vez de una pantalla mixta. Así cada una calza con una pantalla tipo y no hay que diseñar una nueva.
- **Sí:** el banner de soporte y la insignia del menú, que no tenían pantalla tipo, se diseñaron en la página «18 · Soporte» del canvas, en claro, oscuro y 360 px, como pide «Diseño UI».
- **Sí (paso 6, decisión del usuario):** evento nuevo `membresia.soporte_abierta` para abrir y reabrir la membresía del agente. **No:** reusar `membresia.reactivada` (otro significado y exige motivo) ni forzar el `UPDATE` sin versión (rompe el bloqueo optimista).
- **Sí (paso 6, decisión del usuario):** `por` NULL en finalizar membresía y revocar asignación cuando cierra el sistema. **No:** atribuir el cierre al aprobador; la auditoría mentiría.
- **Sí (paso 5):** seguridad sabe cuál es el operador por la opción `tenantOperador` (por defecto `plataforma`, como `ORG_TENANT_OPERADOR`) y lee el código de su tenant con la RLS. **No:** importar `ExigirOperador` de `apps/api`.
- **Sí:** el banner va a todo el ancho y por encima del menú lateral. **No:** dentro del área de contenido; con el menú oculto o en celular se perdería de vista.
- **Sí:** con soporte vigente, `mi-contexto` quita de `permisos` y de `menu` lo que está en `PERMISOS_VETADOS_SOPORTE`. Así el agente no ve opciones que el interceptor le negaría (salió al diseñar el menú del agente).
- **No:** productor de `LOGIN` en este spec. El tipo queda en el CHECK y el filtro para cuando exista.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La consulta por petición del acceso vigente agrega latencia a todos los usuarios | Caché en memoria por `usuario + tenant + vt`; la entrada negativa también se cachea. Medir p95 en la prueba HTTP. |
| Fallar cerrado deja al agente sin servicio si la bitácora no escribe | Es intencional (TR-RNF-110). Solo afecta a sesiones de soporte; el error es 503 con mensaje claro. |
| `tenant_preferido` queda en el cliente si el agente cierra el navegador sin salir | Al vencer, el hook excluye la membresía y cae solo al operador. El agente puede usar «Salir» en cualquier momento. |
| El token del agente conserva el tenant del cliente hasta 900 s tras vencer | Los permisos se cortan al instante en backend; el banner refresca la sesión al llegar `hasta`. |
| Reloj del worker y de la API distintos | Toda comparación usa `now()` de la base o el reloj inyectado de la API; el worker solo deja el estado al día. |
| El evento `PETICION` hace crecer mucho la bitácora | Índices por tenant y fecha; rango obligatorio de 92 días. La retención se define con TR-AUD (spec 20). |
| El estimado (15-17 h) triplica el del plan y el sprint 5 no tiene holgura | Decisión del usuario. Registrar horas reales y ajustar el plan del sprint. |

## Lo que **no** está en este spec

- Exportación a Excel o CSV de la bitácora (TR-REP, R3).
- Validación real de tickets y disparo al cerrarlos (TR-SOP, R3).
- Correo al administrador por solicitud nueva (TR-NOT, R2).
- Auditoría encadenada por hash y migración a TR-AUD (spec 20).
- Productor del evento `LOGIN`.
- Selector genérico de tenant.
- Cierre explícito de sesiones en Supabase.
- Banner en apps de producto (spec 26).
- Caché o throttler compartidos en Redis.

Cada uno, si llega, va en su propio spec.
