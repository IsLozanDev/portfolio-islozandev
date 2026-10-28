# SPEC 16a — Usuarios y asignaciones: lectura de miembros, otorgar por HTTP y UI de administración del cliente

> **Status:** Aprobado
> **Depends on:** SPEC 06, SPEC 08, SPEC 15, SPEC 17a
> **Date:** 2026-10-28
> **Objective:** Exponer la lista y el detalle de miembros, los roles y perfiles asignables y `POST /v1/seg/asignaciones`, y construir en la nueva lib `libs/plataforma/admin-cliente` las pantallas para invitar, asignar, suspender, reactivar, finalizar y revocar (U-03).

## Por qué existe este spec

Fila 16a de `docs/roadmap-specs.md`. Contexto: `docs/spec-context/16a-usuarios-asignaciones.md`. Historia **U-03** (sprint 4). El plan le da 6 h de front y supone la API hecha. No lo está.

Lo que hay en el código hoy (revisado al redactar):

- `OtorgarAsignacion` (spec 06) existe y está probado, pero **no está registrado** en `SeguridadModule` ni tiene controlador.
- El 08 dejó `POST /v1/seg/invitaciones`, `POST /v1/seg/membresias/:id/{suspender,reactivar,finalizar}` y `POST /v1/seg/asignaciones/:id/revocar`. Todas con `MembresiasFiltro` (`{ codigo, mensaje }`). Se consumen sin cambios.
- Los puertos de `repositorios.ts` no tienen ningún listado. `seguridad` no tiene entidades TypeORM: sus lecturas (`infrastructure/typeorm/lecturas.ts`) son SQL del 08.
- El 17a dejó `GET /v1/org/empresas`, `/empresas/:id/sucursales` y `/unidades` con `plat.organizacion.consultar`, y ese permiso ya está en `PLAT_ADMIN_SEGURIDAD` (brecha B2 cerrada). El manifiesto PLAT es `1.6.0` y ya declara `/admin/usuarios` y `/admin/asignaciones`.
- `AvisosService.confirmarDestructiva` (spec 15) fija el motivo en 10 caracteres (`LONGITUD_MINIMA_MOTIVO`) y el texto «al menos 10 caracteres». SEG valida 4-300.
- `mi-contexto` ya trae `mfa_vigente` (`ContextoUsuario.mfaVigente`).
- No existen `libs/plataforma/admin-cliente` ni `MatDialog` ni un `DateAdapter` en el front.

RF cubiertos:

- **TR-RF-009** invitar usuario (UI sobre la ruta del 08).
- **TR-RF-013** asignar rol o perfil con alcance y vigencia (HTTP nuevo y UI).
- **TR-RF-014** revocar asignación y suspender, reactivar o finalizar membresía (UI sobre las rutas del 08).

Criterios del SRS: **TR-CA-025 a 027** y **TR-CA-036 a 040**, cerrados por HTTP y por UI. Los propuestos de la sección 3 del contexto entran como criterios propios.

Reglas: **TR-RN-006** a **010**.

RNF propios:

- **TR-RNF-021**: confirmación y motivo en suspender, reactivar, finalizar y revocar.
- **TR-RNF-018**: usable a 360, 768 y 1280 px, textos en español de Perú.
- **TR-RNF-122**: sin colores fijos, solo tokens de `shared/ui`. Las rutas se exportan para que otro backoffice las monte.
- **TR-RNF-101**: la UI no cachea permisos del actor fuera de `mi-contexto`.
- **TR-RNF-014**: tras finalizar, la UI no promete sesión invalidada al instante.
- **TR-RNF-010**: las lecturas nuevas solo devuelven filas del tenant del token.
- **TR-RNF-026/012**: ningún log incluye correo ni token. Los textos de la API se muestran como texto plano.

RNF heredados: 008, 011, 013, 024/119, 025, 101, 106.

Estimado: 9-10 h. El roadmap da 9. Si se pasa, se recorta primero «Reenviar invitación» (pasa al 16b).

## Alcance

**In:**

- **Back, `libs/plataforma/seguridad`:**
  - Entidades TypeORM de solo lectura en `infrastructure/typeorm/entidades-lectura.ts` (`ENTIDADES_SEG_LECTURA`) y entidades de org para los nombres de ubicación en `infrastructure/typeorm/entidades-org.ts`, como `correlativos`.
  - Puerto `LecturaMiembros` (`application/ports/lectura-miembros.ts`) con su adaptador TypeORM (`infrastructure/typeorm/lectura-miembros.typeorm.ts`) y los casos de uso `ListarMiembros`, `ConsultarMiembro` y `ListarAsignables`.
  - Controladores `interface/miembros.controller.ts` y `interface/asignaciones.controller.ts`, con sus DTO y zod en `interface/miembros.http.ts`.
  - Registro en `SeguridadModule` de `OtorgarAsignacion`, de las lecturas y de los dos controladores.
  - `ENTIDADES_SEG_LECTURA` en el `DataSource` de `apps/api/src/main.ts`.
- **Front, `libs/shared/ui`:** opción `longitudMinimaMotivo` en `confirmarDestructiva`, con 10 por defecto.
- **Front, `libs/plataforma/admin-cliente`** (nueva, `type:feature`, `scope:plataforma`): clientes HTTP, modelos, componentes, páginas y `ADMIN_CLIENTE_ROUTES`.
- **Front, `apps/plataforma-admin`:** monta `ADMIN_CLIENTE_ROUTES` bajo `admin` dentro de `rutasDelShell`.
- **Pruebas:** dominio y aplicación (Jest), integración y HTTP con supertest, Vitest con `TestBed` zoneless y `HttpTestingController`, y verificación en navegador con el MCP `playwright` contra Supabase dev.

**Out of scope (para otros specs):**

- Aceptar invitación (spec 14, RF-010).
- Gestión de roles y perfiles y catálogo de permisos en árbol (16b).
- UI de empresas, sucursales y unidades (17c). Back de org (17a, hecho).
- Consola de plataforma (17b), bitácora y soporte (18), auditoría TR-AUD (20).
- Cambios al manifiesto PLAT. Se queda en `1.6.0`.
- Filtrar la lista de miembros o el selector de alcance por el alcance del actor.
- Cierre explícito de sesiones en Supabase al finalizar (lo dejó fuera el 08).
- Montaje en SazónPOS (26). E2E multinavegador y axe en CI (27).
- Migraciones SQL. Este spec no crea tablas, funciones ni índices.

## Base de código reutilizada

**Se conserva:**

- Spec 06: `OtorgarAsignacion`, `Asignacion.otorgar` (TR-RN-008), `cubre`, errores `ASIGNACION_ROL_O_PERFIL`, `VIGENCIA_INVALIDA`, `ALCANCE_INCOHERENTE`, `ALCANCE_INSUFICIENTE`, `OTORGANTE_SIN_ALCANCE`, `MEMBRESIA_NO_ASIGNABLE` y sus mensajes.
- Spec 08: rutas de invitar, membresías y revocar; `MembresiasFiltro`, `validar` y `exigirUuid` de `membresias.http.ts`; motivo 4-300 (`domain/texto.ts`).
- Spec 13: `SesionService`, `permisoGuard`, `*siPermiso`, interceptor con step-up y `OMITIR_AVISO_ERROR`.
- Spec 15: `vit-tabla`, `vit-filtros`, `vit-acciones-formulario`, `mensajeValidacion`, `vit-cargando`, `vit-estado-vacio`, `AvisosService`, `erroresHttpInterceptor` y `rutasDelShell`.
- Spec 17a: lecturas de organización y patrón de paginación (`{ items, total }`, `tamano` 20 por defecto, 100 máximo).

**Cambia:**

- `libs/shared/ui/src/lib/models/aviso.ts`: `OpcionesConfirmacionDestructiva` suma `longitudMinimaMotivo?: number`.
- `libs/shared/ui/src/lib/services/avisos.service.ts`: el validador del motivo usa la longitud de la opción. `LONGITUD_MINIMA_MOTIVO` queda como valor por defecto.
- `libs/shared/ui/src/lib/models/mensajes-ui.ts`: `motivoMuyCorto` pasa a función de la longitud («Ingrese un motivo de al menos N caracteres.»).
- `libs/plataforma/seguridad/src/seguridad.module.ts`: registra `OtorgarAsignacion`, las lecturas y los controladores nuevos.
- `apps/plataforma-admin/src/app/app.routes.ts`: suma la ruta `admin`.

## Modelo de datos

No hay tablas nuevas. Las lecturas usan `seg.membresia`, `seg.usuario`, `seg.asignacion`, `seg.invitacion`, `seg.rol`, `seg.rol_permiso`, `seg.permiso`, `seg.perfil`, `seg.perfil_rol`, y `org.empresa`, `org.sucursal` y `org.unidad_operativa` para los nombres.

### Puerto de lectura (`application/ports/lectura-miembros.ts`)

```ts
type OrdenMiembros = 'nombre' | 'correo' | 'estado';
type EstadoAsignacion = 'VIGENTE' | 'FUTURA' | 'VENCIDA' | 'REVOCADA';

interface FiltroMiembros {
  estado?: EstadoMembresia;
  busqueda?: string;            // ILIKE sobre nombre o correo
  orden: OrdenMiembros;          // defecto 'nombre'
  direccion: 'asc' | 'desc';    // defecto 'asc'
  pagina: number;                // >= 1
  tamano: number;                // 1..100, defecto 20
}

interface MiembroListado {
  membresiaId: string; usuarioId: string; nombre: string; correo: string;
  estado: EstadoMembresia; esPropietario: boolean;
  asignacionesVigentes: number;           // no revocadas y vigentes hoy (America/Lima)
  invitacionExpiraEn: Date | null;        // solo si hay invitación pendiente (ni usada ni anulada)
}

interface AsignacionDelMiembro {
  id: string;
  rol: { id: string; nombre: string } | null;
  perfil: { id: string; nombre: string } | null;
  alcance: Alcance;
  empresa: { id: string; nombre: string } | null;   // razon_social
  sucursal: { id: string; nombre: string } | null;
  unidad: { id: string; nombre: string } | null;
  vigenteDesde: Fecha; vigenteHasta: Fecha | null;
  estado: EstadoAsignacion;
  revocadaEn: Date | null; motivoRevocacion: string | null;
}

interface MiembroDetalle extends MiembroListado {
  desde: Date; hasta: Date | null;
  asignaciones: AsignacionDelMiembro[];   // todas; orden: estado (VIGENTE, FUTURA, VENCIDA, REVOCADA), luego vigenteDesde desc
}

interface Asignable { id: string; codigo: string; nombre: string; sensible: boolean }
interface RolAsignable extends Asignable { productoCodigo: string }

interface LecturaMiembros {
  listar(filtro: FiltroMiembros, hoy: Fecha): Promise<Listado<MiembroListado>>;
  detalle(membresiaId: string, hoy: Fecha): Promise<MiembroDetalle | null>;
  asignables(productos: readonly string[]): Promise<{ roles: RolAsignable[]; perfiles: Asignable[] }>;
}
```

- El estado de cada asignación se calcula con `hoy` de `fechaLocal` (America/Lima), la misma función de `OtorgarAsignacion`.
- `asignables`: roles activos del tenant o predefinidos de productos contratados (`ProductosContratados`). Perfiles del tenant o predefinidos con al menos un rol activo de un producto contratado. `sensible` es true si algún permiso del rol (o de los roles del perfil) es sensible. Orden por `nombre`.
- Adaptador con `QueryBuilder` sobre el `EntityManager` de la transacción activa (regla 11). Sin SQL crudo. `getManyAndCount` para la lista; el conteo de asignaciones vigentes con subconsulta del `QueryBuilder`.
- `ConsultarMiembro` lanza `NotFoundError` «La membresía no existe» si `detalle` devuelve null. Una membresía de otro tenant da 404.
- `seg.usuario` es global y sin RLS: el aislamiento lo da el join desde `seg.membresia`, que sí tiene RLS. Nunca se lee `seg.usuario` sin ese join.

### HTTP

Todos bajo `/v1/seg`, con `@ApiBearerAuth()`, `X-Sucursal-Id`, OpenAPI con cada código de error, `MembresiasFiltro` y respuestas de error `{ codigo, mensaje }`.

| Método y ruta | Permiso | Caso de uso | Éxito |
| --- | --- | --- | --- |
| `GET /miembros?estado=&busqueda=&orden=&direccion=&pagina=&tamano=` | `plat.usuario.invitar` | `ListarMiembros` | 200 `{ items: [{ membresia_id, usuario_id, nombre, correo, estado, es_propietario, asignaciones_vigentes, invitacion_expira_en }], total }` |
| `GET /miembros/:membresiaId` | `plat.usuario.invitar` | `ConsultarMiembro` | 200 `{ ...fila de la lista, desde, hasta, asignaciones: [{ id, rol, perfil, alcance, empresa, sucursal, unidad, vigente_desde, vigente_hasta, estado, revocada_en, motivo_revocacion }] }` |
| `GET /asignables` | `plat.usuario.invitar` | `ListarAsignables` | 200 `{ roles: [{ id, codigo, nombre, producto_codigo, sensible }], perfiles: [{ id, codigo, nombre, sensible }] }` |
| `POST /asignaciones` | `plat.asignacion.otorgar` (sensible) | `OtorgarAsignacion` | 201 `{ asignacion_id }` |

Cuerpo de `POST /asignaciones` (zod en `miembros.http.ts`):

```ts
{ membresia_id: uuid, rol_id: uuid | null, perfil_id: uuid | null,
  alcance: 'TENANT' | 'EMPRESA' | 'SUCURSAL' | 'UNIDAD',
  empresa_id: uuid | null, sucursal_id: uuid | null, unidad_id: uuid | null,
  vigente_desde: 'YYYY-MM-DD' | null, vigente_hasta: 'YYYY-MM-DD' | null }
```

- Zod valida forma. TR-RN-008 la valida el dominio con sus mensajes.
- `otorgante.mfaVigente` sale de `mfaVigente(principal, ahora, MFA_MAX_EDAD_SEG)`, como en invitar.

Errores nuevos por HTTP (los demás ya los mapea `MembresiasFiltro`):

| `codigo` | HTTP | Cuándo |
| --- | --- | --- |
| `SOLICITUD_INVALIDA` | 400 | zod: `tamano` > 100, `orden` desconocido, fecha mal formada, id no UUID |
| `ASIGNACION_ROL_O_PERFIL` | 400 | Rol y perfil a la vez, o ninguno (TR-CA-037) |
| `VIGENCIA_INVALIDA` | 400 | Hasta anterior a desde (TR-CA-038) |
| `ALCANCE_INCOHERENTE` · `ALCANCE_INSUFICIENTE` | 400 | TR-RN-008 |
| `MFA_REQUERIDA` | 401 | Sin aal2 o MFA de más de 15 min |
| `SIN_PERMISO` · `OTORGANTE_SIN_ALCANCE` | 403 | Sin permiso, u otorgante que no cubre el destino |
| `NO_ENCONTRADO` | 404 | Membresía, rol, perfil o ubicación inexistente o de otro tenant |
| `MEMBRESIA_NO_ASIGNABLE` · `CONFLICTO` | 409 | Membresía SUSPENDIDO o FINALIZADO; rol inactivo |

### Front, `libs/plataforma/admin-cliente`

Estructura (sección «Estructura de libs Angular» de `CLAUDE.md`):

```
libs/plataforma/admin-cliente/src/
  index.ts                                   exporta ADMIN_CLIENTE_ROUTES
  lib/admin-cliente.routes.ts
  lib/models/miembro.ts                      DTO, modelo y mapeo snake_case → camelCase
  lib/models/asignacion.ts                   ídem, y FormularioAsignacion
  lib/models/asignable.ts
  lib/models/ubicacion.ts                    empresas, sucursales y unidades del 17a
  lib/models/mensajes-admin.ts               textos y mapa codigo → texto
  lib/services/miembros.cliente.ts           GET miembros y detalle
  lib/services/asignaciones.cliente.ts       GET asignables, POST asignaciones, POST revocar
  lib/services/membresias.cliente.ts         suspender, reactivar, finalizar
  lib/services/invitaciones.cliente.ts       POST invitaciones
  lib/services/organizacion.cliente.ts       GET de org del 17a
  lib/services/accion-sensible.service.ts    exige MFA vigente antes de abrir una acción sensible
  lib/components/selector-alcance/           alcance + empresa/sucursal/unidad en cascada
  lib/components/form-asignacion/            rol o perfil excluyentes, selector-alcance y vigencias
  lib/pages/usuarios-lista/
  lib/pages/usuarios-invitar/
  lib/pages/usuario-detalle/
  lib/pages/asignacion-nueva/
```

Rutas (`ADMIN_CLIENTE_ROUTES`, montadas en `apps/plataforma-admin` como `{ path: 'admin', loadChildren }` dentro de `rutasDelShell`):

| Ruta | Página | `permisoGuard` |
| --- | --- | --- |
| `/admin/usuarios` | `UsuariosListaPage` | `plat.usuario.invitar` |
| `/admin/usuarios/invitar` | `UsuariosInvitarPage` | `plat.usuario.invitar` |
| `/admin/usuarios/:membresiaId` | `UsuarioDetallePage` | `plat.usuario.invitar` |
| `/admin/usuarios/:membresiaId/asignar` | `AsignacionNuevaPage` | `plat.asignacion.otorgar` |
| `/admin/asignaciones` | `redirectTo: 'usuarios'` | `plat.asignacion.otorgar` |

Comportamiento:

- **Lista:** `vit-filtros` con estado y búsqueda; `vit-tabla` con paginación y orden del servidor (nombre, correo, estado). Columnas: nombre, correo, estado, propietario, asignaciones vigentes, invitación vence. Botón «Invitar usuario» con `*siPermiso="'plat.usuario.invitar'"`. La fila abre el detalle.
- **Invitar:** nombre, correo y `form-asignacion` sin `vigente_desde` (la API de invitar no lo recibe). Si el rol o perfil elegido es `sensible`, pasa por `AccionSensibleService` antes de enviar. Éxito: toast y navegación al detalle. `correo_enviado: false`: aviso de advertencia «Invitación creada; el correo no se envió. Reenvíe invitando otra vez».
- **Detalle:** cabecera con nombre, correo, estado y propietario. Tabla de asignaciones con su estado. Acciones según estado y permiso (`*siPermiso`):
  - ACTIVO: Suspender, Finalizar, Asignar.
  - SUSPENDIDO: Reactivar, Finalizar.
  - INVITADO: Asignar, Finalizar, Reenviar invitación.
  - FINALIZADO: Reenviar invitación.
  - Asignación VIGENTE o FUTURA: Revocar.
- **Reenviar invitación:** navega a invitar con nombre y correo en el `state` de la navegación, nunca en la URL.
- **Asignar:** `form-asignacion` completo con `vigente_desde` (por defecto hoy) y `vigente_hasta`. Éxito: vuelve al detalle con toast.
- **Suspender, reactivar, finalizar y revocar:** `confirmarDestructiva({ pedirMotivo: true, longitudMinimaMotivo: 4 })` y envío con `confirmar: true`. Al terminar se recarga el detalle.
- **`form-asignacion`:** rol y perfil en un único selector agrupado («Roles», «Perfiles»), así no se pueden elegir ambos. Validación local de vigencia con «La vigencia hasta no puede ser anterior a la vigencia desde». Fechas con `MatDatepicker` y `provideNativeDateAdapter()`, locale `es-PE`, enviadas como `YYYY-MM-DD`.
- **`selector-alcance`:** alcance TENANT, EMPRESA, SUCURSAL o UNIDAD. Según el alcance pide empresa, luego sucursal, luego unidad, con las listas del 17a (`tamano` 100). No filtra por el alcance del actor: el back decide.
- **`AccionSensibleService.exigirMfa()`:** si `SesionService` dice `mfaVigente = false`, muestra un aviso y navega a `/auth/mfa?returnUrl=<url actual>`; devuelve false. Si llega igual `MFA_REQUERIDA`, actúa el interceptor del 13.
- **Errores:** cada página pide con `OMITIR_AVISO_ERROR` los códigos que muestra en el formulario (`ASIGNACION_ROL_O_PERFIL`, `VIGENCIA_INVALIDA`, `ALCANCE_*`, `OTORGANTE_SIN_ALCANCE`, `ALCANCE_SUPERIOR`, `LIMITE_USUARIOS`, `MEMBRESIA_EXISTENTE`, `MEMBRESIA_NO_ASIGNABLE`, `PROPIETARIO_UNICO`). Muestra el `mensaje` de la API como texto plano. El resto lo avisa `erroresHttpInterceptor`.

## Plan de implementación

1. **`longitudMinimaMotivo` en `shared/ui`.**
   - Opción en `OpcionesConfirmacionDestructiva`, validador con la longitud recibida y `motivoMuyCorto(longitud)`.
   - Pruebas: con 4, «Cese» confirma y «Ces» muestra el error; sin la opción, 9 caracteres siguen rechazados. Las pruebas del 15 pasan sin cambios de expectativa.
   - Verificar: `pnpm nx test ui`.
2. **Entidades de lectura y `LecturaMiembros`.**
   - `entidades-lectura.ts`, `entidades-org.ts`, puerto, adaptador y `ENTIDADES_SEG_LECTURA` en `main.ts`.
   - Pruebas de integración: paginación y `total`; filtro por estado; búsqueda por parte del nombre y del correo sin distinguir mayúsculas; orden por cada campo y dirección; `asignaciones_vigentes` cuenta solo vigentes hoy y no revocadas; `invitacion_expira_en` solo con invitación pendiente; estados VIGENTE, FUTURA, VENCIDA y REVOCADA en el detalle; con el tenant A no aparece nada de B (0 filas cruzadas); `asignables` excluye roles inactivos y de productos no contratados y marca `sensible`.
   - Verificar: `pnpm nx test seguridad` (PGlite en local, PostgreSQL 16 en CI).
3. **Casos de uso de lectura y controlador de miembros.**
   - `ListarMiembros`, `ConsultarMiembro`, `ListarAsignables`, `miembros.http.ts` y `miembros.controller.ts`. Registro en `SeguridadModule`.
   - Pruebas supertest: sin `plat.usuario.invitar` las tres rutas dan 403; `tamano=101` da 400; membresía de otro tenant da 404; mapeo snake_case.
   - Verificar: `pnpm nx test seguridad` y las rutas en `/v1/docs`.
4. **`POST /v1/seg/asignaciones`.**
   - `asignaciones.controller.ts` y registro de `OtorgarAsignacion` en `SeguridadModule`.
   - Pruebas supertest: TR-CA-036 (Cajero en CAJA-02 del 2026-10-15 al 2026-10-31: `ResolverPermisos` da los permisos solo en esa unidad y solo en ese rango), TR-CA-037, TR-CA-038, sin MFA 401 `MFA_REQUERIDA`, otorgante de SUCURSAL sobre otra sucursal 403 `OTORGANTE_SIN_ALCANCE`, membresía SUSPENDIDO 409, `ASIGNACION_OTORGADA` en `seg.evento_seguridad` y evento en el outbox.
   - Verificar: `pnpm nx test seguridad` y `/v1/docs`.
5. **Lib `admin-cliente` y montaje.**
   - Generador Nx con tags `type:feature` y `scope:plataforma`, alias `@vitrina/plataforma/admin-cliente`, `index.ts`, `admin-cliente.routes.ts` con la redirección de `/admin/asignaciones` y una página de lista vacía. Montaje en `apps/plataforma-admin`.
   - Verificar: `pnpm nx run-many -t lint test build -p admin-cliente plataforma-admin`. `/admin/usuarios` abre y sin permiso va a `/403`.
6. **Modelos, clientes y `AccionSensibleService`.**
   - Clientes HTTP con mapeo, mensajes y servicio de step-up.
   - Pruebas con `HttpTestingController`: URL, parámetros, cuerpo en snake_case y mapeo de respuesta; `exigirMfa` navega a `/auth/mfa?returnUrl` cuando `mfaVigente` es false y no navega cuando es true.
   - Verificar: `pnpm nx test admin-cliente`.
7. **Lista de usuarios.**
   - `UsuariosListaPage` con filtros, tabla y botón invitar.
   - Pruebas: cambiar filtro o búsqueda pide `pagina=1`; cambiar página u orden pide los parámetros; estado vacío; sin `plat.usuario.invitar` no hay botón.
   - Verificar: `pnpm nx test admin-cliente`.
8. **`selector-alcance` y `form-asignacion`.**
   - Componentes con cascada de org y validaciones locales.
   - Pruebas: con UNIDAD pide empresa, sucursal y unidad, y las listas se piden en cascada; rol y perfil no pueden quedar ambos; hasta < desde muestra el mensaje de TR-CA-038 y deja el formulario inválido.
   - Verificar: `pnpm nx test admin-cliente`.
9. **Invitar.**
   - `UsuariosInvitarPage`, con lectura del `state` para reenviar.
   - Pruebas: éxito navega al detalle; `correo_enviado: false` muestra la advertencia; `LIMITE_USUARIOS`, `ALCANCE_SUPERIOR` y `MEMBRESIA_EXISTENTE` muestran el `mensaje` en el formulario sin navegar; rol sensible sin MFA vigente no envía y lleva a `/auth/mfa`.
   - Verificar: `pnpm nx test admin-cliente`.
10. **Detalle y acciones.**
    - `UsuarioDetallePage` con asignaciones y las cinco acciones.
    - Pruebas: acciones visibles por estado y permiso; finalizar con «Cese» envía `{ motivo: 'Cese', confirmar: true }`; `PROPIETARIO_UNICO` muestra «El tenant debe tener al menos un propietario activo»; sin MFA vigente la confirmación no se abre; revocar una asignación recarga el detalle.
    - Verificar: `pnpm nx test admin-cliente`.
11. **Asignar.**
    - `AsignacionNuevaPage`.
    - Pruebas: envía `vigente_desde` de hoy por defecto; éxito vuelve al detalle; `OTORGANTE_SIN_ALCANCE` se muestra en el formulario.
    - Verificar: `pnpm nx test admin-cliente`.
12. **Verificación en navegador (MCP `playwright`, Supabase dev).**
    - `nx serve api` y `nx serve plataforma-admin` contra dev, con un tenant de prueba que tenga una sucursal «Miraflores» y una unidad «CAJA-02».
    - Recorrido: invitar a un correo de prueba con «Cajero» en «Miraflores»; aceptar desde la pantalla del 14; asignar «Cajero» en «CAJA-02» con vigencia; revocar esa asignación; suspender y reactivar; finalizar con «Cese»; intentar suspender a la única propietaria. Consola sin errores. Capturas de lista, invitar, detalle y asignar a 360, 768 y 1280 px.
    - Los datos de prueba se borran al final. Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**API (supertest):**

- [ ] `GET /v1/seg/miembros` responde `{ items, total }` con `tamano` 20 por defecto, rechaza `tamano=101` con 400 y filtra por `estado` y por `busqueda` sobre nombre o correo.
- [ ] Con dos tenants, la lista y el detalle solo devuelven membresías del tenant del token. Una membresía de otro tenant en la URL responde 404.
- [ ] `asignaciones_vigentes` cuenta solo las no revocadas y vigentes hoy en America/Lima. `invitacion_expira_en` es null si no hay invitación pendiente.
- [ ] El detalle marca cada asignación como VIGENTE, FUTURA, VENCIDA o REVOCADA y trae los nombres de rol o perfil y de su ubicación.
- [ ] `GET /v1/seg/asignables` no trae roles inactivos ni de productos sin suscripción vigente, y marca `sensible` en los que tienen un permiso sensible.
- [ ] Sin `plat.usuario.invitar`, las tres lecturas responden 403. Sin `plat.asignacion.otorgar`, `POST /asignaciones` responde 403.
- [ ] TR-CA-036: asignar «Cajero» a Luis Paredes en «CAJA-02» del 2026-10-15 al 2026-10-31 responde 201, y los permisos efectivos de caja existen solo en «CAJA-02» y solo en ese rango.
- [ ] TR-CA-037: rol y perfil a la vez responde 400 `ASIGNACION_ROL_O_PERFIL` con «Seleccione un rol o un perfil, no ambos».
- [ ] TR-CA-038: hasta 2026-10-19 con desde 2026-10-20 responde 400 `VIGENCIA_INVALIDA` con «La vigencia hasta no puede ser anterior a la vigencia desde».
- [ ] `POST /asignaciones` con aal1 o MFA de más de 15 min responde 401 `MFA_REQUERIDA`.
- [ ] Un otorgante de alcance SUCURSAL en «Miraflores» que asigna en otra sucursal recibe 403 `OTORGANTE_SIN_ALCANCE`.
- [ ] Asignar a una membresía SUSPENDIDO responde 409 `MEMBRESIA_NO_ASIGNABLE`.
- [ ] Una asignación otorgada deja `ASIGNACION_OTORGADA` en `seg.evento_seguridad` y su evento en el outbox en la misma transacción.
- [ ] Las cuatro rutas nuevas figuran en `/v1/docs` con su permiso y sus códigos de error.

**`shared/ui`:**

- [ ] `confirmarDestructiva` con `longitudMinimaMotivo: 4` acepta «Cese» y no habilita confirmar con «Ces».
- [ ] `confirmarDestructiva` sin `longitudMinimaMotivo` sigue exigiendo 10 caracteres y las pruebas del 15 pasan.

**UI (Vitest):**

- [ ] La lista pide la página, el orden, el estado y la búsqueda al servidor, y vuelve a la página 1 al cambiar un filtro.
- [ ] TR-CA-025: invitar a rosa.huaman@gmail.com con «Cajero» en «Miraflores» envía el cuerpo esperado y lleva al detalle con estado INVITADO.
- [ ] TR-CA-026: la respuesta `ALCANCE_SUPERIOR` muestra «No puede otorgar un alcance mayor al suyo» en el formulario y no navega.
- [ ] Con `LIMITE_USUARIOS`, la UI muestra «El plan de <producto> permite <n> usuarios» y no navega.
- [ ] Con `correo_enviado: false`, la UI muestra «Invitación creada; el correo no se envió. Reenvíe invitando otra vez».
- [ ] Con `MEMBRESIA_EXISTENTE`, la UI muestra «El usuario ya es miembro del tenant (…)».
- [ ] «Reenviar invitación» abre invitar con nombre y correo cargados, y el correo no aparece en la URL.
- [ ] TR-CA-037 en UI: el formulario no permite tener un rol y un perfil seleccionados a la vez.
- [ ] TR-CA-038 en UI: hasta anterior a desde muestra el mensaje y «Guardar» no envía la petición.
- [ ] El selector de alcance UNIDAD pide empresa, sucursal y unidad en cascada con las rutas del 17a.
- [ ] TR-CA-039: finalizar con «Cese» envía `{ motivo: 'Cese', confirmar: true }` y el detalle muestra FINALIZADO.
- [ ] TR-CA-040: la respuesta `PROPIETARIO_UNICO` muestra «El tenant debe tener al menos un propietario activo».
- [ ] Suspender pasa a SUSPENDIDO y reactivar vuelve a ACTIVO, cada uno con motivo.
- [ ] Revocar una asignación envía solo esa asignación y el detalle conserva las demás sin cambio.
- [ ] Con `mfaVigente = false`, otorgar, suspender, reactivar, finalizar, revocar e invitar con un rol sensible navegan a `/auth/mfa?returnUrl=<ruta actual>` sin enviar nada.
- [ ] Un actor sin `plat.asignacion.revocar` no ve suspender, reactivar, finalizar ni revocar. Uno sin `plat.asignacion.otorgar` no ve «Asignar» y `/admin/usuarios/:id/asignar` lo lleva a `/403`.
- [ ] `/admin/asignaciones` redirige a `/admin/usuarios`.

**Navegador (MCP `playwright`, Supabase dev):**

- [ ] El recorrido del paso 12 termina sin errores en la consola.
- [ ] Hay capturas de lista, invitar, detalle y asignar a 360, 768 y 1280 px, sin scroll horizontal de página.
- [ ] Tras finalizar, la persona finalizada no puede volver a entrar al tenant después del refresh del token (TR-RNF-014).
- [ ] Los datos de prueba se borran y la evidencia queda en `docs/ops/supabase-ambientes.md`.

**Límites y calidad:**

- [ ] `admin-cliente` tiene tags `type:feature` y `scope:plataforma`, exporta solo `ADMIN_CLIENTE_ROUTES` por ruta explícita e importa solo de `shared/*`. Nx en CI.
- [ ] `seguridad/src/domain` no importa `@nestjs/*` ni `typeorm`. Las lecturas nuevas no tienen SQL crudo.
- [ ] Los componentes nuevos no tienen `template` ni `styles` inline ni colores fijos: solo tokens de `shared/ui` y utilidades de Tailwind.
- [ ] Ningún log del back ni del front incluye correo ni token.
- [ ] Cobertura de líneas de `src/domain/**` de `seguridad` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.
- [ ] Las horas reales quedan registradas en el plan.

## Decisiones

- **Sí:** la lista de miembros devuelve todo el tenant (decisión del usuario). Es coherente con las listas del 17a. Las acciones las sigue validando el back por alcance.
- **No:** filtrar la lista por el alcance del actor. Pide resolver ámbitos en la lectura y deja casos raros (invitados sin asignación, propietario).
- **Sí:** el selector de alcance ofrece todo el tenant y el back decide (`OTORGANTE_SIN_ALCANCE`, `ALCANCE_SUPERIOR`). Consecuencia de la decisión anterior y del 17a. `mi-contexto` no trae el alcance del actor.
- **Sí:** `GET /v1/seg/asignables` con `plat.usuario.invitar` (decisión del usuario, cierra B11). El 16b crea sus rutas de gestión de roles y perfiles con su propio permiso sin chocar.
- **No:** `GET /v1/seg/roles` y `/perfiles` con `plat.usuario.invitar`. La misma ruta quedaría con dos usos y `@Permiso` admite un solo código.
- **Sí:** lecturas, lista, detalle y asignables con `plat.usuario.invitar`, sin tocar el manifiesto (D3 del contexto). Evita chocar con 17b en `plat.manifiesto.json`.
- **No:** `plat.usuario.consultar` nuevo. Pide versión nueva del manifiesto.
- **Sí:** chequear `mfaVigente` antes de abrir una acción sensible (decisión del usuario, B4). Si llega igual `MFA_REQUERIDA`, se acepta perder el formulario.
- **Sí:** entidades TypeORM de solo lectura y puerto `LecturaMiembros` con `QueryBuilder` (decisión del usuario, regla 11). Mismo patrón que `LecturaOrganizacion` del 17a.
- **No:** SQL crudo como en `lecturas.ts` del 08. No hay razón técnica que lo justifique.
- **Sí:** nombres de empresa, sucursal y unidad en el detalle, con entidades de org dentro de `seguridad` (PL-10 deja a seg depender de org). La UI no tiene que pedir todas las listas de org para pintar un detalle.
- **Sí:** el estado de cada asignación (VIGENTE, FUTURA, VENCIDA, REVOCADA) lo calcula el back con la fecha de Perú. Una sola regla de fechas, la de `OtorgarAsignacion`.
- **Sí:** invitar y asignar como páginas de ruta (decisión del usuario). Sobreviven al `returnUrl` del step-up y no suman `MatDialog`.
- **No:** diálogos `MatDialog`. El `returnUrl` no puede reabrirlos.
- **Sí:** `MatDatepicker` con `provideNativeDateAdapter()` y locale `es-PE` (decisión del usuario). Sin dependencias nuevas.
- **No:** `input type=date` ni adaptadores date-fns o luxon.
- **Sí:** columnas de la lista: nombre, correo, estado, propietario, asignaciones vigentes e invitación vence (decisión del usuario). El detalle trae todo.
- **Sí:** rol y perfil en un solo selector agrupado. Hace imposible TR-CA-037 en UI; la API cubre el rechazo.
- **Sí:** reenviar invitación con nombre y correo en el `state` de la navegación. El correo no queda en la URL ni en logs de acceso.
- **Sí:** `longitudMinimaMotivo` con 10 por defecto y 4 en SEG (D1). SEG valida 4-300 y TR-CA-039 usa «Cese».
- **Sí:** `/admin/asignaciones` redirige a `/admin/usuarios` (D5). Quitar la opción del manifiesto pide versión nueva.
- **Sí:** clientes HTTP a mano en `admin-cliente/services` (D4). Sin `libs/plataforma/data-access`.
- **Sí:** controladores nuevos en `libs/plataforma/seguridad/src/interface`, junto a los del 08. seg sí puede depender de su propio `@Permiso`.
- **Sí:** verificación en navegador contra Supabase dev con datos de prueba (decisión del usuario), como el 17a.
- **No:** migraciones. Las lecturas no necesitan funciones ni índices nuevos con los volúmenes de R1.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un actor con `plat.asignacion.otorgar` pero sin `plat.usuario.invitar` no puede leer el detalle ni los asignables | Ningún rol predefinido de PLAT tiene uno sin el otro. Si el 16b permite crearlos, el 16b lo valida o suma un permiso de lectura. |
| Un actor sin `plat.organizacion.consultar` no llena el selector de alcance | `PLAT_ADMIN_SEGURIDAD` y `PLAT_PROPIETARIO` lo tienen (17a). Sin él, el selector muestra el error del interceptor y solo deja alcance TENANT. |
| El `mfaVigente` de `mi-contexto` vence entre la carga y el envío | Llega `MFA_REQUERIDA` y el interceptor del 13 lleva a `/auth/mfa`. Se pierde un formulario corto (aceptado). |
| `ILIKE` sobre `seg.usuario` sin índice se vuelve lento | En R1 un tenant tiene decenas de miembros. Si el RNF-001 se mide fuera, se agrega un índice `pg_trgm` en su propio spec. |
| Leer `seg.usuario` (global, sin RLS) expone usuarios de otros tenants | Solo se lee con join desde `seg.membresia`. La prueba de aislamiento del paso 2 lo cubre. |
| `provideNativeDateAdapter` interpreta fechas en la zona del navegador | El formulario envía la fecha calendario elegida como `YYYY-MM-DD`, sin pasar por UTC. Prueba con un navegador en otra zona. |
| 16b y 17c trabajan sobre `admin-cliente` | Arrancan tras el merge del 16a y solo suman carpetas y entradas de rutas. |

## Lo que **no** está en este spec

- Aceptar invitación (14) y gestión de roles, perfiles y catálogo de permisos (16b).
- UI de organización (17c), consola (17b), bitácora (18) y auditoría (20).
- Cambios al manifiesto PLAT y migraciones SQL.
- Filtrado por alcance del actor en la lista y en el selector.
- Cierre explícito de sesiones en Supabase, montaje en SazónPOS (26), E2E y axe en CI (27).

Cada uno entra en su propio spec cuando su sprint lo pida.
