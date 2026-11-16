# SPEC 20b — Auditoría: consulta paginada con alcance, detalle con diferencias, exportación XLSX auditada y verificación diaria de integridad

> **Status:** Implementado
> **Depends on:** SPEC 06, SPEC 11, SPEC 18b, SPEC 20a
> **Date:** 2026-11-09
> **Objective:** Exponer bajo `/v1/aud` la consulta paginada de `aud.evento_auditoria` con el alcance del actor, su detalle con diferencias calculadas y la exportación XLSX auditada con aal2, y verificar cada día la cadena de hash de cada tenant de forma incremental, con un registro de resultados, un evento `aud.integridad.rota` y la consulta del último resultado.

## Por qué existe este spec

Fila 20b de `docs/roadmap-specs.md` (E-01, parte). Contexto de apoyo: `docs/spec-context/20-aud-auditoria.md`. El 20a dejó la tabla, el trigger de encadenado y `aud.calcular_hash`; este spec los lee. El visor es del 20c.

Lo que hay en el código hoy (revisado al redactar):

- El 20a (aprobado) define `aud.evento_auditoria` con `numero` por tenant, `hash_anterior`, `hash`, `aud.contenido_canonico` y `aud.calcular_hash`, RLS `ENABLE + FORCE` y el índice `(tenant_id, ocurrido_en DESC)`.
- El 18 y el 18b fijaron el patrón de lista y exportación: `{ items, total }` con `pagina` y `tamano` (1 a 100, defecto 20), rango de fechas obligatorio de hasta 92 días, filtro `usuario` por `ILIKE` sobre correo o nombre, exportación al vuelo con `exceljs.stream.xlsx.WorkbookWriter`, tope de 10 000 filas (`EXPORTACION_DEMASIADO_GRANDE`, 422) y la exportación auditada antes del primer byte (`AUDITORIA_NO_DISPONIBLE`, 503).
- `PermisoGuard` exige `X-Sucursal-Id` y verifica el permiso en esa sucursal; deja `ContextoAutorizado` con `sucursalId` y `permisos`.
- `AlcanceActor` (seguridad) responde `cubre(usuarioId, destino, ahora)`; `actorCubre` ya sabe si un miembro tiene alcance TENANT (propietario o asignación TENANT). No hay un método que lo exponga por permiso.
- `seg.sucursales_accesibles` lista sucursales con asignación, sin distinguir permiso.
- `apps/worker` programa tareas diarias con `upsertJobScheduler` (patrón de `TareaVencimientos`) y tiene CLI (`vencimientos.cli.ts`).
- `sync_lector` (spec 11) es el patrón para leer entre tenants sin `BYPASSRLS`: rol `NOLOGIN` dueño de una función `SECURITY DEFINER` con política `TO <rol> USING (true)`.
- El manifiesto PLAT está en `1.13.0`.

RF cubiertos:

- **TR-RF-086** consultar y exportar auditoría.
- **TR-RF-085** (parte): los accesos sensibles quedan disponibles para el responsable de datos (filtro por tipo y titular). La vista del titular es ARCO (R2).

Criterios del SRS: TR-CA-213, TR-CA-214. Los de exportación, detalle, verificación y manipulación son propios de este spec (el SRS no trae GWT para ellos).

Reglas: **TR-RN-028** (la cadena se verifica), **TR-RN-047** (exportación con permiso propio y auditada; la expiración de 72 h no aplica, no se guarda archivo), **TR-RN-009** (permiso sensible con aal2).

RNF propios:

- **TR-RNF-112**: detección del 100 % de las alteraciones simuladas; verificación diaria < 15 min por tenant.
- **TR-RNF-002**: lista paginada p95 < 1,5 s con 100 000 filas por tenant.
- **TR-RNF-013**: la exportación queda en la auditoría.
- **TR-RNF-026**: ningún log lleva `antes`, `despues`, `motivo`, correo ni filtros de texto.

RNF heredados: 001, 008, 010, 011, 012, 024/119, 025, 101, 106.

Historias del backlog: **E-01** (parte). Estimado: 6-7 h.

## Alcance

**In:**

- **Migración** `db/01g_aud_integridad.sql` (índices de consulta, `aud.verificacion_integridad`, rol `aud_lector`, funciones de verificación y de tenants), su inverso y su prueba. Ordena después de `01g_aud.sql`.
- **Seguridad**: puerto `DirectorioSeg` (usuarios por texto, datos de usuarios y de sucursales por ids) y `AlcanceActor.alcanzaTenant(usuarioId, permiso, ahora)`, con sus adaptadores; exportados por `index.ts`. `plat.auditoria.exportar` en `PERMISOS_VETADOS_SOPORTE`.
- **Dominio** (`libs/plataforma/auditoria/src/domain/`): `FiltroAuditoria` y su validación, `calcularCambios`, `ResultadoVerificacion`, `PERMISOS_AUD`, errores nuevos.
- **Aplicación**: `ConsultarAuditoria`, `ObtenerEventoAuditoria`, `ExportarAuditoria`, `VerificarIntegridad`, `ObtenerUltimaVerificacion`, `VerificarTodosLosTenants`; puertos `LecturaAuditoria` y `RegistroVerificaciones`.
- **Infraestructura**: adaptadores TypeORM de lectura y verificación; hoja XLSX.
- **Interfaz**: `interface/auditoria.controller.ts` con 4 rutas bajo `/v1/aud`, DTO, zod y OpenAPI; `AuditoriaModule.registrarApi` lo registra.
- **Worker**: `apps/worker/src/auditoria/tarea-verificacion.ts` (diaria) y `apps/worker/src/cli/auditoria.cli.ts` (verificación completa de un tenant).
- **Manifiesto PLAT `1.14.0`**: permisos `plat.auditoria.consultar` y `plat.auditoria.exportar`, rol `PLAT_AUDITOR`, ambos permisos en `PLAT_PROPIETARIO`.
- **Pruebas**: dominio (Jest), SQL contra PostgreSQL 16, integración con PostgreSQL 16 y Redis 7 (solo en CI), HTTP con supertest.
- **Nube, dev (manual)**: migración, manifiesto y humo de consulta, exportación y verificación.

**Out of scope (para otros specs):**

- Visor, opción de menú y pantalla de integridad (20c).
- Vista del titular de sus accesos sensibles y ARCO (R2).
- Reparar una cadena rota o marcar una rotura como atendida.
- Aviso por correo o en pantalla ante una rotura (TR-NOT, R2; el evento queda listo para él).
- Alertas y métricas de la verificación (spec 21).
- Exportación a CSV, archivo guardado con expiración a 72 h y reportes programados (TR-REP, TR-ARC).
- Vista entre tenants para operadores de plataforma.
- Firmar o anclar el punto de control fuera de la base.
- Particionado y archivado (spec posterior).

## Base de código reutilizada

**Se conserva (como patrón):**

- Spec 18: `FiltroBitacora` (rango ≤ 92 días, `usuario` 2-100 con `ILIKE`), `{ items, total }`, `bitacora.controller.ts`.
- Spec 18b: `ExportarBitacora` (contar, auditar antes del primer byte, recorrer por keyset en lotes de 1 000, `WorkbookWriter`), `exceljs` 4.4.0, `ETIQUETAS_BITACORA`, `EXPORTACION_DEMASIADO_GRANDE`.
- Spec 11: `sync_lector` y `sync.read_events` (lectura entre tenants sin `BYPASSRLS`).
- Spec 12: `TareaVencimientos` y `vencimientos.cli.ts`.
- Spec 20a: `AuditoriaPort`, `aud.calcular_hash`, `AuditoriaModule`.

**Cambia:**

- `AlcanceActor` suma `alcanzaTenant`; `index.ts` de seguridad exporta `DirectorioSeg` y su token.
- `PERMISOS_VETADOS_SOPORTE` suma `plat.auditoria.exportar`.
- `plat.manifiesto.json` pasa a `1.14.0`.
- `apps/worker/src/worker.module.ts` registra la tarea; `.env.example` suma `AUD_VERIFICACION_CRON`.

**No existe** y se escribe desde cero: lo demás de este spec.

## Modelo de datos

### Migración `db/01g_aud_integridad.sql`

```sql
-- Consulta (TR-RNF-002).
CREATE INDEX evento_auditoria_sucursal_fecha_ix ON aud.evento_auditoria (tenant_id, sucursal_id, ocurrido_en DESC);
CREATE INDEX evento_auditoria_accion_fecha_ix   ON aud.evento_auditoria (tenant_id, accion, ocurrido_en DESC);
CREATE INDEX evento_auditoria_entidad_ix        ON aud.evento_auditoria (tenant_id, entidad_tipo, entidad_id);

-- Historial de verificaciones. Una fila por corrida y tenant; solo inserción.
CREATE TABLE aud.verificacion_integridad (
  id            uuid        PRIMARY KEY,
  tenant_id     uuid        NOT NULL,
  modo          varchar(12) NOT NULL CHECK (modo IN ('INCREMENTAL', 'COMPLETA')),
  desde_numero  bigint      NOT NULL CHECK (desde_numero >= 0),   -- último número ya verificado al empezar
  hasta_numero  bigint      NOT NULL CHECK (hasta_numero >= desde_numero),
  ultimo_hash   char(64)    NOT NULL,                             -- hash de hasta_numero (64 ceros si no hay filas)
  filas         bigint      NOT NULL CHECK (filas >= 0),
  estado        varchar(6)  NOT NULL CHECK (estado IN ('OK', 'ROTA')),
  numero_roto   bigint      NULL,
  motivo        varchar(12) NULL CHECK (motivo IN ('HASH', 'ENLACE', 'HUECO', 'TRUNCADA')),
  iniciada_en   timestamptz NOT NULL,
  terminada_en  timestamptz NOT NULL,
  CONSTRAINT ck_verificacion_rota CHECK ((estado = 'ROTA') = (motivo IS NOT NULL))
);
CREATE INDEX verificacion_tenant_fecha_ix ON aud.verificacion_integridad (tenant_id, terminada_en DESC);
-- RLS ENABLE + FORCE: SELECT e INSERT con tenant_id = app.tenant_id. Trigger aud.solo_insercion del 20a.
```

**Funciones (`SET search_path = ''`):**

| Función | Qué hace |
| --- | --- |
| `aud.verificar_cadena(p_desde_numero bigint, p_hash_anterior char(64), p_limite int)` `SECURITY INVOKER`, plpgsql | Con la RLS del tenant, recorre por `numero > p_desde_numero` hasta `p_limite` filas. Por fila comprueba `numero = anterior + 1` (si no, `HUECO`), `hash_anterior = hash anterior` (si no, `ENLACE`) y `aud.calcular_hash(fila, hash_anterior) = hash` (si no, `HASH`). Se detiene en la primera falla. Devuelve `(ultimo_numero, ultimo_hash, filas, numero_roto, motivo)` |
| `aud.maximo_numero()` `SECURITY INVOKER` | `max(numero)` del tenant, o 0 |
| `aud.tenants_con_eventos()` `SECURITY DEFINER`, dueño `aud_lector` | `SELECT DISTINCT tenant_id` de `aud.evento_auditoria`. Única lectura entre tenants; solo ids |

- `aud_lector` `NOLOGIN`, dentro de `DO ... IF NOT EXISTS` (rol del clúster), con `USAGE` y `CREATE` en `aud`, `SELECT` sobre `aud.evento_auditoria` y política `FOR SELECT TO aud_lector USING (true)`. Mismo patrón que `sync_lector`.
- `EXECUTE` de `tenants_con_eventos` solo al rol de la aplicación; `REVOKE` a `PUBLIC`, `anon` y `authenticated`.
- `p_limite` entre 1 y 50 000; si no, `RAISE EXCEPTION`.
- SQL crudo justificado por la regla 11: funciones de base de datos y un recorrido que en TypeORM serían 100 000 viajes.
- El inverso borra funciones, política e índices, y `aud.verificacion_integridad` solo si está vacía (mensaje claro si no). No borra `aud_lector`.

### Dominio

```ts
export interface FiltroAuditoria {
  desde: string; hasta: string;                 // YYYY-MM-DD, Lima; obligatorio, hasta 92 días
  usuario?: string;                             // 2-100, ILIKE sobre correo o nombre
  accion?: string;                              // exacta
  entidadTipo?: string; entidadId?: string;
  sucursalId?: string;
  tipo?: 'OPERACION' | 'ACCESO_SENSIBLE';
  personaTitularId?: string;
}
export interface Paginacion { pagina: number; tamano: number }   // 1..; 1..100, defecto 20

export interface Cambio { campo: string; antes: unknown; despues: unknown }
export function calcularCambios(antes: unknown, despues: unknown): Cambio[];

export type MotivoRotura = 'HASH' | 'ENLACE' | 'HUECO' | 'TRUNCADA';

export const PERMISOS_AUD = { consultar: 'plat.auditoria.consultar', exportar: 'plat.auditoria.exportar' } as const;
export const MAXIMO_DIAS_RANGO = 92;
export const MAXIMO_FILAS_EXPORTACION = 10_000;
export const MAXIMO_CAMBIOS = 200;
export const LOTE_VERIFICACION = 10_000;
```

- `calcularCambios` aplana los dos JSON a rutas (`cliente.nombre`, `items[0].monto`) y devuelve las rutas cuyo valor difiere, incluidas las que solo están en un lado (el otro lado `null`). Los arreglos se comparan por índice. Ordena por ruta y corta en `MAXIMO_CAMBIOS`. Con `antes` nulo, todas las rutas de `despues` son cambios.
- `FiltroAuditoria`: rango obligatorio y ordenado, ≤ 92 días (`RangoInvalidoError`), uuid válidos, longitudes. Igual que `FiltroBitacora`.
- Errores nuevos: `SucursalFueraDeAlcanceError` (`SUCURSAL_FUERA_DE_ALCANCE`, 403), `EventoAuditoriaNoEncontradoError` (`EVENTO_NO_ENCONTRADO`, 404), `ExportacionDemasiadoGrandeError` (`EXPORTACION_DEMASIADO_GRANDE`, 422, reutiliza el mensaje del 18b).

### Alcance de la consulta (TR-CA-214)

1. `AlcanceActor.alcanzaTenant(usuarioId, 'plat.auditoria.consultar', ahora)`: `true` si es propietario o tiene una asignación vigente de alcance `TENANT` cuyo rol o perfil incluye el permiso.
2. Con alcance TENANT: ve todas las filas del tenant, también las sin sucursal (`tenant.creado`, `empresa.creada`). `sucursalId` del filtro es opcional.
3. Sin alcance TENANT: se fuerza `sucursal_id = contexto.sucursalId` (la de `X-Sucursal-Id`, que `PermisoGuard` validó). Un `sucursalId` distinto en el filtro responde 403 `SUCURSAL_FUERA_DE_ALCANCE`. Las filas sin sucursal no se ven.
4. El detalle aplica la misma regla: una fila fuera del alcance responde 404 (no revela que existe).
5. La exportación y la consulta del último resultado de integridad aplican la misma regla; la integridad, sin alcance TENANT, responde 403 `SUCURSAL_FUERA_DE_ALCANCE` (el resultado es de todo el tenant).

### Puertos

```ts
// seguridad: application/ports/directorio-seg.port.ts
export interface DirectorioSeg {
  buscarUsuarios(texto: string, limite: number): Promise<string[]>;                  // ids del tenant actual por ILIKE
  usuarios(ids: string[]): Promise<{ id: string; nombre: string; correo: string }[]>;
  sucursales(ids: string[]): Promise<{ id: string; codigo: string; nombre: string }[]>;
}

// auditoria: application/ports/
LecturaAuditoria {
  listar(filtro: FiltroResuelto, paginacion: Paginacion): Promise<{ items: FilaAuditoria[]; total: number }>;
  buscar(id: string, alcance: AlcanceLectura): Promise<FilaAuditoria | null>;
  contar(filtro: FiltroResuelto): Promise<number>;
  recorrer(filtro: FiltroResuelto, alLote: (filas: FilaAuditoria[]) => Promise<void>): Promise<void>;   // keyset (ocurrido_en DESC, id DESC), lotes de 1 000
}
RegistroVerificaciones {
  ultimaCorrecta(): Promise<{ hastaNumero: string; ultimoHash: string } | null>;
  ultima(): Promise<Verificacion | null>;
  guardar(verificacion: Verificacion): Promise<void>;
  verificarTramo(desdeNumero: string, hashAnterior: string, limite: number): Promise<TramoVerificado>;
  maximoNumero(): Promise<string>;
  tenantsConEventos(): Promise<string[]>;
}
```

- `FiltroResuelto` = filtro con `usuarioIds?` (de `buscarUsuarios`, hasta 500; si el texto no encuentra a nadie, la consulta devuelve vacío sin ir a la tabla) y `sucursalForzada?`.
- `DirectorioSeg` en `seguridad/infrastructure/typeorm/` con TypeORM sobre `seg.usuario`, `seg.membresia` y `org.sucursal`. AUD no une tablas de `seg` ni de `org` en su SQL.
- `LecturaAuditoria` con TypeORM y `QueryBuilder`. Lista sin `antes` ni `despues` (columnas excluidas del `SELECT`).
- `RegistroVerificaciones` con TypeORM para la tabla; `verificarTramo`, `maximoNumero` y `tenantsConEventos` llaman a las funciones (SQL crudo en métodos del adaptador).

### Casos de uso

**`ConsultarAuditoria(filtro, paginacion, actor)`**: valida, resuelve alcance y `usuarioIds`, lista por `ocurrido_en DESC, numero DESC` y completa `usuario` y `sucursal` con `DirectorioSeg` en una llamada por página.

**`ObtenerEventoAuditoria(id, actor)`**: fila completa con `antes`, `despues`, `cambios = calcularCambios(antes, despues)`, `hash_anterior` y `hash`.

**`ExportarAuditoria(filtro, actor)`** (`plat.auditoria.exportar`, aal2):

1. Valida y resuelve como la consulta (sin paginación).
2. `contar`: si pasa de 10 000, 422 sin auditar.
3. En su propia transacción, `AuditoriaPort.registrar({ accion: 'plat.auditoria.exportar', entidadTipo: 'auditoria', entidadId: 'exportacion', despues: { filtros, filas } })` **antes** del primer byte. El texto de `usuario` se guarda tal cual en `filtros` (es el criterio de la exportación) y nunca va a logs. Si falla: 503 `AUDITORIA_NO_DISPONIBLE`.
4. `recorrer` y escribe con `WorkbookWriter`. Un error a mitad corta la conexión y se loguea; la fila de auditoría queda.

Hoja «Auditoría», encabezado fijo en negrita, filtro automático. Columnas: Fecha (America/Lima, `dd/mm/yyyy hh:mm:ss`), Tipo (`Operación` / `Acceso sensible`), Acción, Entidad, Id, Usuario, Correo, Sucursal (código y nombre), Motivo, Finalidad, Ticket, Campos cambiados (rutas de `calcularCambios` separadas por coma, hasta 500 caracteres), IP, N.º. Sin el JSON de `antes` ni `despues`. Nombre: `auditoria-AAAAMMDD-AAAAMMDD.xlsx`.

**`VerificarIntegridad(tenantId, modo)`**:

1. `TenantContext.run({ tenantId })` y `UnitOfWork.run`.
2. Punto de partida: `INCREMENTAL` desde `ultimaCorrecta()` (o 0 y 64 ceros si no hay); `COMPLETA` desde 0.
3. Si `maximoNumero() < desde`: `ROTA` con motivo `TRUNCADA` y `numero_roto = desde` (faltan filas que ya se verificaron).
4. Repite `verificarTramo(desde, hash, LOTE_VERIFICACION)` hasta que no queden filas o aparezca una falla.
5. Guarda una fila en `aud.verificacion_integridad`. Si es `ROTA`: log `error` con `tenant_id`, `numero_roto` y `motivo`, y publica `aud.integridad.rota` en el outbox en la misma transacción.
6. Un tenant sin filas no guarda fila.
7. Tras una rotura, la siguiente corrida incremental parte del último `OK`, así que vuelve a reportar `ROTA` cada día hasta que se atienda (fuera de alcance).

**`VerificarTodosLosTenants()`**: `tenantsConEventos()` y `VerificarIntegridad(tenant, 'INCREMENTAL')` uno tras otro. Un tenant que falla por error técnico se loguea (`aud.verificacion.error`, solo el nombre del error) y no detiene a los demás. Log `info` final con tenants, `ok`, `rotas` y duración.

**`ObtenerUltimaVerificacion(actor)`**: última fila del tenant, o 404 `SIN_VERIFICACIONES`.

### Evento

| `event_type` | `aggregate_type` | `aggregate_id` | Payload (`schema_version` 1) |
| --- | --- | --- | --- |
| `aud.integridad.rota` | `verificacion_integridad` | id de la verificación | `{ numero_roto, motivo, modo, desde_numero }` |

Sin suscriptores en este spec (OBS y NOT lo usarán). Se registra su esquema en el validador de eventos si lo exige.

### HTTP (`interface/auditoria.controller.ts`)

Todas con `@ApiBearerAuth()`, `X-Sucursal-Id`, zod (400 `SOLICITUD_INVALIDA`) y errores `{ codigo, mensaje }`.

| Método y ruta | Permiso | Entrada | Éxito |
| --- | --- | --- | --- |
| `GET /v1/aud/eventos` | `plat.auditoria.consultar` | `desde`, `hasta`, `usuario?`, `accion?`, `entidad_tipo?`, `entidad_id?`, `sucursal_id?`, `tipo?`, `persona_titular_id?`, `pagina`, `tamano` | 200 `{ items: [{ id, numero, tipo, origen, accion, entidad_tipo, entidad_id, usuario: { id, nombre, correo } \| null, sucursal: { id, codigo, nombre } \| null, motivo, finalidad, ticket, persona_titular_id, ip, ocurrido_en }], total }` |
| `GET /v1/aud/eventos/exportar` | `plat.auditoria.exportar` (aal2) | los filtros sin `pagina` ni `tamano` | 200 XLSX con `Content-Disposition`; 400, 403, 422, 503 |
| `GET /v1/aud/eventos/:id` | `plat.auditoria.consultar` | — | 200 ítem de la lista + `antes`, `despues`, `cambios: [{ campo, antes, despues }]`, `trace_id`, `event_id`, `hash_anterior`, `hash`; 404 |
| `GET /v1/aud/integridad` | `plat.auditoria.consultar` | — | 200 `{ id, modo, desde_numero, hasta_numero, filas, estado, numero_roto, motivo, iniciada_en, terminada_en }`; 403, 404 |

- `exportar` se declara antes de `:id` para que el router no lo tome como id.
- El controlador vive en la lib: `comp:aud` puede importar `seguridad` (PL-10).

### Manifiesto PLAT `1.14.0`

| Código | Descripción | `alcance_minimo` | `sensible` |
| --- | --- | --- | --- |
| `plat.auditoria.consultar` | Consultar la auditoría y su integridad | `SUCURSAL` | no |
| `plat.auditoria.exportar` | Exportar la auditoría a Excel | `SUCURSAL` | sí |

- Rol nuevo `PLAT_AUDITOR` (responsable de datos personales) con los dos permisos y `plat.sesion.contexto`. `PLAT_PROPIETARIO` suma los dos. Sin opción de menú (la suma el 20c).
- `PERMISOS_VETADOS_SOPORTE` suma `plat.auditoria.exportar`.

### Worker

- `TareaVerificacionIntegridad` como `TareaVencimientos`: cola `aud-verificacion`, `upsertJobScheduler` con `AUD_VERIFICACION_CRON` (defecto `30 3 * * *`) y zona `America/Lima`, sin reintentos (la siguiente corrida retoma).
- CLI `auditoria:verificar --tenant <uuid> [--completa]`: corre `VerificarIntegridad` y termina con código 1 si queda `ROTA`.
- `AUD_VERIFICACION_CRON` en `apps/worker/src/config/env.ts` (zod) y `.env.example`.

## Plan de implementación

1. **Migración.**
   - `db/01g_aud_integridad.sql`, inverso y `db/tests/01g_aud_integridad.test.sql` con rol sin `BYPASSRLS`.
   - Casos: `verificar_cadena` sobre una cadena sana devuelve el último número y hash sin falla; con la conexión de migración y el trigger de solo inserción desactivado **solo dentro de la prueba**, alterar `despues` de una fila da `HASH` en esa fila, alterar `hash_anterior` da `ENLACE`, borrar una fila intermedia da `HUECO`; `verificar_cadena` del tenant A no ve filas de B; `tenants_con_eventos` lista los dos tenants y `anon`, `authenticated` y el rol de prueba sin `EXECUTE` no pueden llamarla; `aud.verificacion_integridad` rechaza `UPDATE` y `DELETE`; CHECK de `estado` y `motivo`; límite inválido lanza error; `aud_lector` es `NOLOGIN` sin `BYPASSRLS`.
   - Verificar: `pnpm nx test migrar` en CI y `db:up` / `db:down` / `db:up`. En local con PGlite (no es PostgreSQL 16).
2. **Seguridad: `DirectorioSeg` y `alcanzaTenant`.**
   - Puerto, adaptador TypeORM, `alcanzaTenant` en `AlcanceActorSeg`, exports, `PERMISOS_VETADOS_SOPORTE`.
   - Pruebas: `buscarUsuarios` por parte del correo o del nombre sin distinguir mayúsculas y solo del tenant actual; `alcanzaTenant` verdadero para propietario y para asignación TENANT con el permiso, falso para asignación SUCURSAL o para TENANT sin el permiso; asignación vencida no cuenta.
   - Verificar: `pnpm nx test seguridad`.
3. **Dominio de auditoría.**
   - `filtro-auditoria.ts`, `cambios.ts`, `verificacion.ts`, `permisos-aud.ts`, errores.
   - Pruebas: `calcularCambios` con objetos anidados, arreglos, claves que aparecen o desaparecen, `antes` nulo, tope de 200 y orden por ruta; filtro con rango de 93 días, `desde > hasta` y uuid inválido.
   - Verificar: `pnpm nx test auditoria` y cobertura de `src/domain/**` ≥ 70 %.
4. **Consulta y detalle.**
   - `ConsultarAuditoria`, `ObtenerEventoAuditoria`, `LecturaAuditoria`, controlador con 2 rutas, manifiesto `1.14.0`.
   - Integración y supertest: TR-CA-213 (7 filas `rest.venta.anular` de Rosa en octubre entre otras de otros usuarios y acciones; filtrar por `usuario=rosa` y `accion=rest.venta.anular` devuelve las 7 con motivo, y su detalle trae los montos en `despues` y en `cambios`); TR-CA-214 (supervisor con asignación SUCURSAL en «Surco» ve solo filas de Surco, no ve las sin sucursal, y pedir `sucursal_id` de otra sucursal responde 403); propietario ve todo y filtra por sucursal; detalle de una fila de otra sucursal responde 404; filtros por tipo `ACCESO_SENSIBLE` y por `persona_titular_id`; `usuario` sin coincidencias devuelve `{ items: [], total: 0 }`; sin permiso 403 `SIN_PERMISO`; rango de 93 días 400; la lista no trae `antes` ni `despues`.
   - Rendimiento: 100 000 filas sembradas en un tenant (CI); medir 20 consultas de lista con filtros típicos y reportar el p95 (objetivo < 1,5 s) en la salida de la prueba.
   - Verificar: `pnpm nx test auditoria` en CI.
5. **Exportación.**
   - `ExportarAuditoria`, hoja XLSX, ruta.
   - Supertest: con aal2 descarga un XLSX cuyas filas coinciden con la lista y con las columnas definidas (se lee con `exceljs` en la prueba); queda una fila `plat.auditoria.exportar` con filtros y número de filas; con aal1 401 step-up; más de 10 000 filas 422 sin fila de auditoría; si la auditoría falla, 503 sin archivo; supervisor de sucursal exporta solo su sucursal; agente de soporte no puede exportar.
   - Verificar: `pnpm nx test auditoria`.
6. **Verificación de integridad.**
   - `VerificarIntegridad`, `VerificarTodosLosTenants`, `ObtenerUltimaVerificacion`, `RegistroVerificaciones`, evento, ruta `/integridad`, tarea diaria y CLI en el worker.
   - Pruebas de integración (prueba de manipulación de TR-RNF-112): cadena sana da `OK`; la segunda corrida incremental solo recorre las filas nuevas (`desde_numero` = `hasta_numero` anterior); alterar `despues`, alterar `hash`, alterar `hash_anterior`, borrar una fila intermedia y borrar las últimas filas ya verificadas (con el trigger desactivado solo en la prueba) dan `ROTA` con `HASH`, `HASH`, `ENLACE`, `HUECO` y `TRUNCADA` y el número correcto, cada una con su evento `aud.integridad.rota` en `sync.outbox`; 5 de 5 alteraciones detectadas; con `ROTA`, la corrida siguiente vuelve a dar `ROTA`; un tenant que lanza error no impide verificar los demás; `COMPLETA` recorre desde 0; `GET /v1/aud/integridad` devuelve la última y responde 403 sin alcance TENANT; CLI con `--completa` sobre cadena rota termina con código 1.
   - Rendimiento: verificación completa de 100 000 filas; se reporta la duración (objetivo < 15 min por tenant).
   - Verificar: `pnpm nx run-many -t lint test build` con código 0 y las 4 rutas en `/v1/docs`.
7. **Cierre de calidad.**
   - `code-simplifier` sobre los archivos nuevos y modificados; revisar su diff.
8. **Nube, dev (manual).**
   - `pnpm db:up:remoto` y `pnpm manifiesto:aplicar:remoto` del PLAT `1.14.0`. Con el MCP: `aud_lector` es `NOLOGIN` sin `BYPASSRLS`, `aud` no está en la Data API, `get_advisors` sin alertas nuevas de RLS.
   - Humo con un usuario real del tenant de pruebas: consultar la auditoría que dejó el humo del 20a, exportarla con aal2 y ver la fila de exportación; correr `auditoria:verificar --tenant <id> --completa` y ver `OK` en `GET /v1/aud/integridad`. Las filas de humo no se borran (solo inserción).
   - Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**Consulta y detalle (TR-RF-086, TR-RNF-002):**

- [ ] Con 7 anulaciones de Rosa en octubre, filtrar por usuario «rosa» y acción `rest.venta.anular` devuelve las 7 con su motivo, y el detalle de cada una trae los montos (TR-CA-213).
- [ ] Un supervisor con alcance solo en «Surco» ve solo las filas de Surco y no ve las filas sin sucursal (TR-CA-214).
- [ ] Sin alcance TENANT, pedir `sucursal_id` de otra sucursal responde 403 `SUCURSAL_FUERA_DE_ALCANCE`, y el detalle de una fila fuera de alcance responde 404.
- [ ] Con alcance TENANT se ven todas las filas del tenant, con y sin sucursal, y `sucursal_id` filtra.
- [ ] El detalle trae `cambios` con la ruta, el valor anterior y el nuevo de cada campo que difiere.
- [ ] Los filtros `tipo` y `persona_titular_id` devuelven los accesos sensibles de un titular.
- [ ] La lista no incluye `antes` ni `despues`; incluye usuario (nombre y correo) y sucursal (código y nombre), o `null` para sistema.
- [ ] Rango mayor a 92 días o sin fechas responde 400.
- [ ] Con 100 000 filas en un tenant, el p95 de la lista se reporta en la salida de la prueba de CI; si no baja de 1,5 s, se registra como desviación.

**Exportación (TR-RN-047, TR-RN-009):**

- [ ] Con aal2 y `plat.auditoria.exportar`, el XLSX tiene las columnas definidas y las mismas filas que la lista con esos filtros.
- [ ] Cada exportación deja una fila `plat.auditoria.exportar` en `aud.evento_auditoria` con filtros y número de filas, escrita antes de enviar el archivo.
- [ ] Más de 10 000 filas responde 422 sin fila de auditoría; si la auditoría falla responde 503 sin archivo.
- [ ] Con aal1 responde 401 step-up; un agente de soporte no puede exportar.

**Integridad (TR-RNF-112, TR-RN-028):**

- [ ] Las 5 alteraciones simuladas (cambiar `despues`, cambiar `hash`, cambiar `hash_anterior`, borrar una fila intermedia, borrar filas finales ya verificadas) se detectan con el número y el motivo correctos.
- [ ] Cada rotura deja una fila `ROTA` en `aud.verificacion_integridad`, un log `error` y un evento `aud.integridad.rota` en el outbox.
- [ ] La corrida incremental solo recorre filas posteriores al último `OK`; tras una rotura, la siguiente vuelve a reportar `ROTA`.
- [ ] La tarea diaria queda programada a las 03:30 de Lima (o `AUD_VERIFICACION_CRON`) y verifica todos los tenants con filas; el error de un tenant no detiene a los demás.
- [ ] `auditoria:verificar --tenant <id> --completa` verifica desde el inicio y termina con código 1 si la cadena está rota.
- [ ] La duración de la verificación completa de 100 000 filas se reporta; si supera 15 min, se registra como desviación.
- [ ] `GET /v1/aud/integridad` devuelve el último resultado del tenant y responde 403 sin alcance TENANT.

**Aislamiento, seguridad, migraciones y calidad:**

- [ ] Desde el tenant A no se lee ninguna fila de B, ni en consulta, detalle, exportación ni verificación.
- [ ] `aud.tenants_con_eventos` es la única lectura entre tenants, devuelve solo ids, y `anon` y `authenticated` no pueden ejecutarla.
- [ ] `aud.verificacion_integridad` rechaza `UPDATE` y `DELETE`.
- [ ] Sin `plat.auditoria.consultar` las rutas responden 403; el manifiesto `1.14.0` aplicado dos veces da 0 cambios.
- [ ] Ningún log incluye `antes`, `despues`, `motivo`, correo ni el texto del filtro `usuario`.
- [ ] `db:up && db:down && db:up` termina con 0 en CI.
- [ ] `src/domain` no importa `@nestjs/*`, `typeorm` ni `exceljs`. `auditoria` no une tablas de `seg` ni de `org` en su SQL.
- [ ] Cobertura de líneas de `src/domain/**` ≥ 70 %.
- [ ] Las 4 rutas figuran en `/v1/docs` con sus códigos de error.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.

**Nube (verificación manual, evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] En dev, `01g_aud_integridad.sql` está aplicada y el manifiesto PLAT `1.14.0` figura en `seg.manifiesto_aplicado`.
- [ ] En dev, la consulta, la exportación con aal2 y la verificación completa del tenant de pruebas funcionan con un usuario real.
- [ ] Las horas reales de E-01 (parte 20b) quedan registradas en el plan.

## Decisiones

- **Sí:** alcance TENANT ve todo; sin él, solo la sucursal de `X-Sucursal-Id`. Decisión del usuario. Cumple TR-CA-214 sin resolver permisos por cada sucursal; un actor con alcance EMPRESA cambia de sucursal con el selector.
- **No:** filtrar por todas las sucursales accesibles con el permiso. Más consultas y caché por permiso y sucursal para un caso que el selector cubre.
- **Sí:** `alcanzaTenant` por permiso en `AlcanceActor`. `actorCubre` ya tenía la regla; faltaba exponerla atada al permiso para que una asignación TENANT de otro rol no abra la auditoría.
- **Sí:** filas sin sucursal solo para alcance TENANT. Son operaciones de todo el tenant (empresa, suscripción).
- **Sí:** fila fuera de alcance responde 404 en el detalle. No revela que existe.
- **Sí:** filtro `usuario` por `ILIKE` y nombres por un puerto de seguridad (`DirectorioSeg`). Decisión del usuario. Mismo filtro que la bitácora; AUD no une tablas de `seg` ni de `org`.
- **Sí:** tope de 500 ids de usuario por búsqueda. Un texto tan genérico se acota con más letras.
- **Sí:** paginación `{ items, total }` con rango obligatorio de 92 días. Mismo patrón que el 18 y `vit-tabla`.
- **Sí:** accesos sensibles con el mismo permiso y filtros `tipo` y `persona_titular_id`. Decisión del usuario. `PLAT_AUDITOR` es el responsable de datos.
- **Sí:** diferencias calculadas en el dominio del back. Decisión del usuario. El 20c y la exportación las reutilizan.
- **Sí:** XLSX sin el JSON de `antes` y `despues`, con la lista de campos cambiados. Decisión del usuario. Una celda admite 32 767 caracteres y el JSON puede llegar a 64 KB.
- **Sí:** tope de 10 000 filas, exportación al vuelo y auditada antes del primer byte. Patrón del 18b. **No:** archivo guardado con expiración de 72 h (TR-RN-047): depende de TR-ARC (R2). Desviación anotada.
- **Sí:** la exportación se audita en la propia `aud.evento_auditoria` con `AuditoriaPort`, no en `seg.evento_seguridad`. Es auditoría de negocio y queda en la cadena.
- **Sí:** `plat.auditoria.exportar` sensible y vetado en soporte. Igual que `plat.seguridad.bitacora_exportar`.
- **Sí:** `alcance_minimo` `SUCURSAL` en los dos permisos. Un supervisor de sucursal consulta y exporta lo suyo (TR-CA-214).
- **Sí:** rol nuevo `PLAT_AUDITOR`; `PLAT_PROPIETARIO` suma los dos permisos. Decisión del usuario. **No:** declarar `plat.auditoria.registrar` ni `plat.auditoria.acceso_sensible` (20a).
- **Sí:** verificación incremental con punto de control en `aud.verificacion_integridad`. Decisión del usuario. El tiempo no crece con los 5 años de retención; la completa queda en el CLI.
- **Sí:** detectar `TRUNCADA` comparando el máximo número con el último verificado. La cadena sola no ve que faltan las últimas filas.
- **Sí:** recorrido en una función plpgsql por tramos de 10 000. SQL crudo justificado: en TypeORM serían una consulta por fila.
- **Sí:** verificación con la RLS de cada tenant; solo la lista de tenants cruza, con `aud_lector` y `SECURITY DEFINER`. Patrón de `sync_lector`.
- **Sí:** rotura con fila, log `error` y evento `aud.integridad.rota`. Decisión del usuario. OBS y NOT lo consumirán.
- **Sí:** tras una rotura, se sigue reportando cada día. Atenderla (marcar, reparar) queda fuera.
- **Sí:** tarea BullMQ diaria a las 03:30 de Lima como `TareaVencimientos`, con CLI para la completa. Decisión del usuario. Hora de poca carga, distinta de las 06:00 de vencimientos.
- **Sí:** sin reintentos en la tarea. Es idempotente; la siguiente corrida retoma.
- **Sí:** controlador en la lib `auditoria`. `comp:aud` puede importar `seguridad`.
- **Sí:** pruebas de manipulación desactivando el trigger de solo inserción dentro de la prueba con la conexión de migración. Es la única forma de simular un ataque con privilegios; el trigger vuelve a activarse en la misma transacción.
- **Sí:** sin PostgreSQL ni Supabase locales. Pruebas SQL y de integración en CI; en local con PGlite, avisando que no es PostgreSQL 16.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El `count` de `total` con 100 000 filas supera 1,5 s | Rango obligatorio de 92 días e índices por sucursal y acción; se mide en CI y se reporta. Si no alcanza, se evalúa `total` estimado en un spec aparte. |
| Quien altera la cadena también altera `aud.verificacion_integridad` y el punto de control | Ambas tablas son de solo inserción. Anclar el punto de control fuera de la base queda fuera de alcance; se documenta. |
| `verificar_cadena` en un tenant grande retiene una transacción larga | Tramos de 10 000 filas; cada corrida incremental recorre solo lo del día. |
| `jsonb::text` o `sha256` se comportan distinto en PGlite | La prueba de CI con PostgreSQL 16 es la que vale. |
| El texto del filtro `usuario` guardado en la auditoría de la exportación es un dato personal | Es el criterio de la exportación (TR-RNF-013 pide el contexto). No va a logs. |
| La tarea diaria no corre si el worker está caído | Corre al día siguiente sobre lo pendiente (incremental); el CLI permite correrla a mano. Las alertas son del spec 21. |
| La exportación lee en lotes mientras entran filas nuevas | Keyset por `(ocurrido_en, id)` con el rango cerrado; filas nuevas fuera del rango no entran. |

## Lo que **no** está en este spec

- Visor, menú y pantalla de integridad (20c).
- Vista del titular y ARCO (R2).
- Atender o reparar una rotura; avisos por correo (TR-NOT).
- Alertas y métricas (spec 21).
- CSV, archivo con expiración y reportes programados (TR-REP, TR-ARC).
- Vista entre tenants para operadores.
- Particionado y archivado.
