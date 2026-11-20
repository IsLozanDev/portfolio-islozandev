# SPEC 32 — Personas: contactos, direcciones con ubigeo y edición de datos básicos

> **Status:** Implementado
> **Depends on:** SPEC 31, SPEC 19a, SPEC 19b
> **Date:** 2026-11-18
> **Objective:** Ampliar `libs/plataforma/personas` para agregar, editar y borrar los contactos y las direcciones de una persona, con un principal por tipo de contacto, un celular principal siempre presente y el ubigeo validado contra el catálogo `UBIGEO`, y para editar sus nombres o razón social, todo por `/v1/personas/{id}` con `plat.persona.editar` y el evento `persona.actualizada` por outbox.

## Por qué existe este spec

Fila 32 de `docs/roadmap-specs.md` (R2-01, TR-RF-041). Contexto: `docs/spec-context/tr-per/per-registro-roles-contactos.md`, partición B. Los criterios que el contexto marca como faltantes (sec. 3) y los pendientes de la sec. 6 quedan resueltos en las Decisiones.

El roadmap da 5 h a este spec. Con la edición de datos básicos (`PATCH /v1/personas/{id}`), que el usuario sumó al alcance, pasa a unas 6 h. La UI de la ficha es el spec 38 y los consentimientos el 37.

Lo que hay en el código hoy (revisado al redactar):

- `db/01l_per.sql` (spec 31): `per.persona` (con `version`), `per.persona_rol` y `per.contacto` (`id`, `persona_id`, `tenant_id`, `tipo_contacto`, `valor`, `principal`, `creado_en`; único parcial `uq_contacto_principal`). RLS con políticas de `SELECT`, `INSERT` y `UPDATE`; sin `DELETE` (revocado y sin política). No existe `per.direccion`.
- `domain/contacto.ts`: `Contacto` inmutable con `crear` y `reconstituir`. `REGLAS_DE_FORMATO` solo tiene `CELULAR` y `CORREO`; el comentario deja FIJO y WHATSAPP para este spec.
- `domain/persona.ts`: `Persona.registrar` y `asignarRol`. No hay método que cambie contactos ni nombres. `exigirCelularPrincipal` y `exigirUnPrincipalPorTipo` solo corren al registrar. Cada evento sube `version` en 1 (`AggregateRoot.raise`).
- `RepositorioPersonasTypeOrm.guardar` solo inserta roles y contactos nuevos (cuenta cuántos había); `subirVersion` actualiza solo `version`. No actualiza ni borra contactos ni escribe nombres.
- `PersonaDetalle` y `PersonaDetalleDto` no exponen `version`. `PersonaPort` tiene `buscarPorDocumento`, `obtener`, `registrar` y `asignarRol`.
- `EVENTOS_PER`: `persona.registrada` y `persona.rol_asignado`. `PERMISOS_PER`: `leer`, `registrar`, `rol`. `VerificadorReferenciasPer` responde solo por `TIPO_DOC_IDENTIDAD`.
- `shared/util`: `validarCelular` y `validarCorreo`. Sin validador de fijo ni de WhatsApp.
- `catalogos`: `CatalogoPort.validarItem` devuelve `{ valido, motivo, atributos }`, sin el nombre del ítem. En `UBIGEO` el nombre del distrito es el `nombre` del ítem (columna `descripcion` del CSV) y `departamento` y `provincia` son atributos (`disenos-tablas.ts`). `UBIGEO` es tabla importable: no admite borrado manual (`TablaSoloImportacionError`) y la importación cierra vigencias, no borra.
- `auditoria`: `EVENTOS_AUDITADOS` y un método `@SuscribirEvento` por tipo en `interface/auditoria.consumidor.ts`, con `persona.registrada` y `persona.rol_asignado`.
- Bloqueo optimista en HTTP (catálogos y feriados): `version` en el cuerpo del `PATCH` y `?version=` en el `DELETE`, que responde 204.
- Manifiesto `plat.manifiesto.json` en 1.21.0, fijado en las pruebas de manifiesto de `archivos`, `auditoria`, `catalogos`, `identidad`, `org`, `personas` y `seguridad`. Última migración: `db/01m_arc.sql`. `tools/migrar` aplica todo archivo de `db/` que no esté en `migraciones._migraciones`, en orden de nombre.

## Alcance

**Entra:**

- TR-RF-041: agregar, editar y borrar contactos (`CELULAR`, `FIJO`, `CORREO`, `WHATSAPP`) y direcciones (`direccion`, `referencia`, `ubigeo`, `principal`) de una persona del tenant.
- Un principal por tipo de contacto y una dirección principal por persona: marcar uno desmarca el anterior en la misma transacción. La persona nunca queda sin celular principal.
- Formatos de FIJO y WHATSAPP; validadores `validarTelefonoFijo` y `validarWhatsapp` en `shared/util`.
- Ubigeo vigente en el catálogo `UBIGEO`; la dirección guarda y devuelve distrito, provincia y departamento.
- Edición de datos básicos: nombres, apellido paterno, apellido materno o razón social. Documento y tipo de persona no cambian.
- Evento `persona.actualizada` por outbox en cada cambio, con esquema y auditado.
- Bloqueo optimista con la `version` de la persona en ediciones y borrados.
- `PersonaPort` con `agregarContacto` y `agregarDireccion`; `obtener` devuelve también direcciones y `version`.
- `VerificadorReferenciasPer` ampliado a `UBIGEO`.
- Migración `db/01l_per_contactos.sql` con `per.direccion`, el único de contacto repetido y el `DELETE` de contactos y direcciones; su inverso y prueba SQL.
- Permiso `plat.persona.editar` en el manifiesto.
- `nombre` del ítem en `ResultadoValidacion` de `catalogos` (cambio aditivo).

**No entra (specs futuros):**

- Consentimientos (TR-RF-043) → spec 37. UI de contactos y direcciones en la ficha → spec 38.
- Duplicados y fusión (TR-RF-042) → specs 39 y 40.
- Verificación de contactos (`verificado` del T-05, código por SMS o correo): con TR-NOT.
- Cambiar documento, tipo de documento o tipo de persona; inactivar o borrar una persona.
- Cerrar o quitar roles; `sexo`, `estado_civil`, `fecha_nacimiento`.
- Editar o borrar por `PersonaPort`: se agrega cuando un producto lo pida.
- Normalizar teléfonos (espacios, guiones, prefijo de país) o pasar correos a minúsculas.
- Refrescar los nombres de distrito, provincia y departamento si el catálogo cambia.
- Integración con SazónPOS (R2-12).

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `kernel`, `kernel-infra` | Sin cambios. |
| `personas` (`Persona`, `Contacto`, `RepositorioPersonasTypeOrm`, `PersonasController`, `PersonasFiltro`, `validar`, `PersonasModule`) | Se amplía. Los cuatro endpoints del 31 conservan su contrato; el detalle suma `version` y `direcciones`. |
| `shared/util` (`validarCelular`, `validarCorreo`) | Se reutilizan; se agregan `telefono-fijo.ts` y `whatsapp.ts`. |
| `catalogos` (`CATALOGO_PORT`, `ValidarItem`, `VERIFICADORES_REFERENCIAS`) | `ResultadoValidacion` suma `nombre`. El resto sin cambios. |
| `auditoria` (`EVENTOS_AUDITADOS`, `AuditoriaConsumidor`) | Se agrega `persona.actualizada`. |
| `db/01l_per.sql` | No se toca. Lo nuevo va en `01l_per_contactos.sql`. |
| `catalogos` (controlador de ítems y feriados) | Referencia de cómo viaja `version` y del `DELETE` con 204. |

## Modelo de datos

### `shared/util`

```ts
// src/telefono-fijo.ts
export function validarTelefonoFijo(valor: string): boolean;   // ^\d{6,9}$
// src/whatsapp.ts
export function validarWhatsapp(valor: string): boolean;       // ^\+[1-9]\d{7,14}$ (E.164)
```

Ambos se exportan en `src/index.ts`.

### `catalogos`

`ResultadoValidacion` suma `nombre: string | null`: el nombre del ítem si es válido, nulo en otro caso. `ValidarItem` ya lo tiene en `visibles`; no cambia la caché ni la consulta.

### Migración `db/01l_per_contactos.sql` (+ `db/rollback/01l_per_contactos.sql`, `db/tests/01l_per_contactos.test.sql`)

```sql
CREATE TABLE per.direccion (
  id            uuid PRIMARY KEY,
  persona_id    uuid NOT NULL REFERENCES per.persona(id),
  tenant_id     uuid NOT NULL,
  direccion     varchar(250) NOT NULL CHECK (char_length(direccion) BETWEEN 5 AND 250),
  referencia    varchar(150),
  ubigeo        varchar(6)   NOT NULL CHECK (ubigeo ~ '^[0-9]{6}$'),
  distrito      varchar(200) NOT NULL,
  provincia     varchar(200) NOT NULL,
  departamento  varchar(200) NOT NULL,
  principal     boolean NOT NULL DEFAULT false,
  creado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_direccion_principal ON per.direccion (persona_id) WHERE principal;
CREATE INDEX ix_direccion_persona ON per.direccion (persona_id);
CREATE INDEX ix_direccion_tenant_ubigeo ON per.direccion (tenant_id, ubigeo);

CREATE UNIQUE INDEX uq_contacto_valor ON per.contacto (persona_id, tipo_contacto, valor);
```

- `per.direccion`: RLS habilitada y forzada, con políticas `direccion_select`, `direccion_insert`, `direccion_update` y `direccion_delete` por `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid` (patrón de `01l_per.sql`).
- `per.contacto`: política nueva `contacto_delete` con la misma condición.
- Privilegios al rol de la aplicación: `SELECT, INSERT, UPDATE, DELETE` sobre `per.direccion` y `DELETE` sobre `per.contacto`. `TRUNCATE` sigue revocado. `per.persona` y `per.persona_rol` siguen sin `DELETE`.
- `REVOKE ALL ON per.direccion FROM PUBLIC` y de `anon` y `authenticated` si existen (regla 8).
- `ubigeo` sin llave foránea a `cat`: se valida por `CatalogoPort` (TR-RNF-119).
- `uq_contacto_valor` no falla con los datos del 31: el registro crea a lo sumo un celular y un correo por persona.
- Inverso: borra `contacto_delete`, revoca `DELETE` de `per.contacto`, borra `uq_contacto_valor` y `per.direccion`. Deja la base como la dejó `01l_per.sql`.
- Orden: `01l_per.sql` < `01l_per_contactos.sql` < `01m_arc.sql`. `subir` aplica los archivos que no están registrados, así que entra aunque `01m_arc.sql` ya esté aplicada; `bajar` la revierte antes que `01l_per.sql`.

### Dominio (`libs/plataforma/personas/src/domain/`)

- `contacto.ts`: `REGLAS_DE_FORMATO` suma `FIJO` (`validarTelefonoFijo`, «El teléfono fijo debe tener de 6 a 9 dígitos») y `WHATSAPP` (`validarWhatsapp`, «El WhatsApp debe ir en formato internacional: + y de 8 a 15 dígitos»). `Contacto` suma `conValor(valor)` y `conPrincipal(principal)`, que devuelven otro contacto validado. El tipo no cambia.
- `direccion.ts` (nuevo): `Direccion { id, direccion, referencia, ubigeo, ubicacion, principal }` con `UbicacionUbigeo { distrito, provincia, departamento }`. `crear` recorta textos; `direccion` de 5 a 250; `referencia` de 0 a 150 (vacía es nula); `ubigeo` de 6 dígitos. Falla con `DireccionInvalidaError`.
- `persona.ts`, métodos nuevos. Cada uno publica un solo `persona.actualizada` y devuelve `false` sin publicar si no cambió nada:
  - `cambiarDatosBasicos(cambios)`: aplica sobre la denominación actual las mismas reglas de `denominarNatural` y `denominarJuridica` del registro. Un campo ausente no cambia; `apellidoMaterno: null` lo borra. `razonSocial` en una NATURAL o nombres en una JURIDICA → `TipoPersonaIncoherenteError`.
  - `agregarContacto(contacto)`: mismo tipo y valor que otro de la persona → `ContactoDuplicadoError`. Si llega principal, desmarca el principal anterior de su tipo.
  - `editarContacto(contactoId, { valor?, principal? })`: mismas reglas. Desmarcar el celular principal → `CelularPrincipalObligatorioError`.
  - `eliminarContacto(contactoId)`: el celular principal no se borra → `CelularPrincipalObligatorioError`.
  - `agregarDireccion(direccion)`, `editarDireccion(direccionId, cambios)`, `eliminarDireccion(direccionId)`: una principal por persona; marcar una desmarca la anterior. La principal se puede borrar o desmarcar.
  - Un id que no es de la persona → `ContactoNoEncontradoError` o `DireccionNoEncontradaError`.
- `errores.ts`, nuevos: `ContactoDuplicadoError` (ConflictError, `CONTACTO_DUPLICADO`, «La persona ya tiene ese contacto»); `CelularPrincipalObligatorioError` (ValidationError, `CELULAR_PRINCIPAL_OBLIGATORIO`, «La persona debe conservar un celular principal»); `DireccionInvalidaError` (ValidationError, `DIRECCION_INVALIDA`); `UbigeoNoVigenteError` (ValidationError, `UBIGEO_NO_VIGENTE`, «El ubigeo no existe o no está vigente»); `ContactoNoEncontradoError` (NotFoundError, `CONTACTO_NO_ENCONTRADO`); `DireccionNoEncontradaError` (NotFoundError, `DIRECCION_NO_ENCONTRADA`); `VersionObsoletaPersonaError` (ConflictError, `VERSION_OBSOLETA`, «La persona cambió desde que se leyó; vuelva a cargarla»). Ningún mensaje lleva el valor del contacto ni la dirección.
- `eventos-per.ts`: `EVENTOS_PER.actualizada = 'persona.actualizada'`, `CAMBIOS_PERSONA = ['DATOS_BASICOS', 'CONTACTO', 'DIRECCION']` y `PersonaActualizada { persona_id, cambio }`.
- `permisos-per.ts`: `PERMISOS_PER.editar = 'plat.persona.editar'`.

### Puertos (`application/ports/`)

```ts
export interface DireccionDetalle {
  id: string; direccion: string; referencia: string | null; ubigeo: string;
  distrito: string; provincia: string; departamento: string; principal: boolean;
}
export interface PersonaDetalle extends PersonaResumen {
  version: number;                       // nuevo
  roles: RolAsignado[];
  contactos: ContactoDetalle[];
  direcciones: DireccionDetalle[];       // nuevo
}
export interface AgregarContactoComando { personaId: string; tipo: TipoContacto; valor: string; principal?: boolean }
export interface AgregarDireccionComando {
  personaId: string; direccion: string; referencia?: string | null; ubigeo: string; principal?: boolean;
}

export interface PersonaPort {
  // ... los cuatro del spec 31
  agregarContacto(comando: AgregarContactoComando): Promise<PersonaDetalle>;
  agregarDireccion(comando: AgregarDireccionComando): Promise<PersonaDetalle>;
}
```

`RepositorioPersonas` no cambia de firma: `guardar(persona)` pasa a sincronizar contactos y direcciones (altas, cambios y bajas) y a escribir la denominación.

### Casos de uso (`application/`)

- `modificar-persona.ts`: función `modificarPersona(dependencias, personaId, versionLeida, cambio)`. Abre la transacción, carga la persona del tenant (`PersonaNoEncontradaError`), compara `versionLeida` si viene (`VersionObsoletaPersonaError`), aplica `cambio`, y si hubo cambio guarda y publica. Devuelve el detalle. La usan los siete casos de uso.
- `ActualizarDatosBasicos` (`actualizar-datos-basicos.ts`), `AgregarContacto`, `EditarContacto`, `EliminarContacto` (`agregar-contacto.ts`, `editar-contacto.ts`, `eliminar-contacto.ts`), `AgregarDireccion`, `EditarDireccion`, `EliminarDireccion` (`agregar-direccion.ts`, `editar-direccion.ts`, `eliminar-direccion.ts`).
- `ubicacion-ubigeo.ts`: `resolverUbicacion(catalogo, ubigeo)` llama a `CatalogoPort.validarItem('UBIGEO', ubigeo)`. Si no es válido, o el ítem no trae `nombre`, `provincia` o `departamento` de texto → `UbigeoNoVigenteError`. Devuelve `UbicacionUbigeo` con los textos como están en el catálogo.
- `EditarDireccion` solo resuelve el ubigeo si llega uno distinto al guardado.
- Agregar no pide `version`; editar y borrar sí.
- `ObtenerPersona` y `detalleDe` (`vista-persona.ts`) suman `version` y `direcciones`. No consultan el catálogo al leer.

### Eventos (`infrastructure/event-schemas.ts`)

| Evento | Payload |
| --- | --- |
| `persona.actualizada` | `{ persona_id, cambio }` con `cambio` en `DATOS_BASICOS`, `CONTACTO` o `DIRECCION` |

Sin nombres, contactos, direcciones ni ubigeo. Esquema en `ESQUEMAS_PER` con `additionalProperties: false`, `schema_version` 1. En `auditoria`: `'persona.actualizada'` en `EVENTOS_AUDITADOS` y método `personaActualizada` en `AuditoriaConsumidor`.

### Infraestructura

- `typeorm/entidades.ts`: `DireccionEntidad` (`per.direccion`) y `FilaDireccion`; se agrega a `ENTIDADES_PER`. `mapeo.ts`: `filaDesdeDireccion` y `direccionDesdeFila`.
- `typeorm/personas.repositorio.ts`: el estado recordado guarda los contactos y direcciones leídos, por id. `guardar` compara y escribe en este orden: actualiza la fila de la persona con su denominación y versión (`WHERE version = <leída>`), borra lo que ya no está, actualiza lo que cambió empezando por los que dejan de ser principales, e inserta lo nuevo. Todo con `getRepository` (`update`, `delete`, `insert`); sin SQL crudo.
- La violación de `uq_contacto_valor` se traduce a `ContactoDuplicadoError`.
- `verificador-referencias.per.ts`: para `UBIGEO` responde si existe una `per.direccion` del tenant con ese `ubigeo`. Para `TIPO_DOC_IDENTIDAD` sigue igual.

### HTTP (`interface/`)

`PATCH /v1/personas/{id}` va en `personas.controller.ts`. Contactos en `contactos.controller.ts` (`ContactosPersonaController`, DTO en `contactos.dto.ts`) y direcciones en `direcciones.controller.ts` (`DireccionesPersonaController`, `direcciones.dto.ts`). Los tres usan `PersonasFiltro` y `validar`.

| Método y ruta | Permiso | Respuesta |
| --- | --- | --- |
| `PATCH /v1/personas/{id}` | `plat.persona.editar` | 200 persona |
| `POST /v1/personas/{id}/contactos` | `plat.persona.editar` | 201 persona |
| `PATCH /v1/personas/{id}/contactos/{contactoId}` | `plat.persona.editar` | 200 persona |
| `DELETE /v1/personas/{id}/contactos/{contactoId}?version=` | `plat.persona.editar` | 204 |
| `POST /v1/personas/{id}/direcciones` | `plat.persona.editar` | 201 persona |
| `PATCH /v1/personas/{id}/direcciones/{direccionId}` | `plat.persona.editar` | 200 persona |
| `DELETE /v1/personas/{id}/direcciones/{direccionId}?version=` | `plat.persona.editar` | 204 |
| `GET /v1/personas/{id}` (spec 31) | `plat.persona.leer` | 200 persona, ahora con `version` y `direcciones` |

«Persona» es `PersonaDetalleDto` completo, con la `version` nueva.

Cuerpos:

- Datos básicos: `version`, `nombres?`, `apellido_paterno?`, `apellido_materno?`, `razon_social?`. Objeto estricto: `tipo_persona`, `tipo_documento` o `numero_documento` en el cuerpo → 400 `SOLICITUD_INVALIDA`.
- Contacto nuevo: `tipo`, `valor`, `principal?` (falso por defecto). Edición: `version`, `valor?`, `principal?`.
- Dirección nueva: `direccion`, `referencia?`, `ubigeo`, `principal?` (falso por defecto). Edición: `version` y cualquiera de los cuatro.
- Dirección en la respuesta: `id`, `direccion`, `referencia`, `ubigeo`, `distrito`, `provincia`, `departamento`, `principal`.

Errores: 422 `CONTACTO_INVALIDO` (con mensaje), `CELULAR_PRINCIPAL_OBLIGATORIO`, `DIRECCION_INVALIDA`, `UBIGEO_NO_VIGENTE`, `TIPO_PERSONA_INCOHERENTE`, `validation_error` (nombres); 409 `CONTACTO_DUPLICADO`, `VERSION_OBSOLETA` y `conflict` (carrera dentro de la transacción, ya existente); 404 `NO_ENCONTRADA` (también otro tenant), `CONTACTO_NO_ENCONTRADO`, `DIRECCION_NO_ENCONTRADA`. OpenAPI completo.

### Composición

- `PersonasModule`: registra los siete casos de uso y los dos controladores nuevos; `ServicioPersonas` suma `agregarContacto` y `agregarDireccion`. Sin dependencias nuevas: `catalogo` ya está en `DependenciasPersonas`.
- `apps/api`: sin cambios de cableado (`ENTIDADES_PER`, `registrarEsquemasPer` y `VerificadorReferenciasPer` ya están). `test/salud.spec.ts` suma las rutas nuevas.
- `eslint.config.mjs`: sin cambios; `comp:per` ya importa `cat`.
- `plat.manifiesto.json` 1.22.0 (la siguiente menor libre al implementar): `plat.persona.editar` («Editar datos básicos, contactos y direcciones de una persona»), alcance `TENANT`, no sensible, sin rol predefinido ni opción de menú. Las siete pruebas de manifiesto que fijan la versión se actualizan.
- `tools/migrar/test/db-esquemas.test.mjs`: entrada de `01l_per_contactos.sql` con su prueba, y su inverso antes del de `01l_per.sql` en la ida y vuelta.

## Plan de implementación

1. **Validadores y catálogo.** `telefono-fijo.ts` y `whatsapp.ts` en `shared/util` con pruebas. `nombre` en `ResultadoValidacion` y en `ValidarItem`, con su prueba; el doble de catálogo de `personas/test/support/dobles.ts` lo devuelve.
2. **Migración.** `db/01l_per_contactos.sql`, inverso y prueba SQL: una dirección principal por persona, CHECK de longitud y de ubigeo, contacto repetido rechazado, borrado de contacto y dirección propios, borrado de persona y de rol sigue negado, RLS entre dos tenants (también en el `DELETE`), sin acceso de `anon`/`authenticated`, ida y vuelta. Entrada en `db-esquemas.test.mjs`.
3. **Dominio.** Reglas de FIJO y WHATSAPP, `Direccion`, métodos nuevos de `Persona`, errores y `persona.actualizada`, con pruebas: principal por tipo, celular principal obligatorio, duplicado, sin cambios no publica, natural y jurídica.
4. **Persistencia.** `DireccionEntidad`, mapeo y `guardar` con altas, cambios y bajas. Integración contra base temporal: cambio de principal en una transacción, borrado físico, denominación y `actualizado_en`, conflicto de versión, aislamiento por tenant, verificador con `UBIGEO`.
5. **Casos de uso y eventos.** `modificarPersona`, los siete casos de uso, `resolverUbicacion`, `PersonaPort` ampliado, esquema del evento, `EVENTOS_AUDITADOS` y `AuditoriaConsumidor`. Pruebas con dobles de catálogo y outbox.
6. **HTTP y composición.** Controladores, DTO, OpenAPI, `PersonasModule`, permiso en el manifiesto 1.22.0 y pruebas de manifiesto. Prueba HTTP de los siete endpoints y del detalle, incluidos 400, 403, 404 de otro tenant, 409 y 422; `salud.spec.ts`.
7. **Cierre.** `code-simplifier` sobre los archivos tocados; `npx nx run-many -t lint test -p personas shared-util catalogos auditoria seguridad identidad org archivos api migrar` verde; migración aplicada en Supabase dev (`pnpm db:up:remoto`); prueba en Supabase dev de TR-CA-105 y 106 contra el catálogo `UBIGEO` importado.

## Criterios de aceptación

- [ ] TR-CA-105: `POST /v1/personas/{id}/direcciones` con «Av. Ejército 710», ubigeo `040103` y `principal: true` → 201; la dirección queda principal con distrito `CAYMA`, provincia `AREQUIPA` y departamento `AREQUIPA` (como están en el catálogo); `GET /v1/personas/{id}` la devuelve igual.
- [ ] TR-CA-106: agregar o editar un contacto CELULAR con valor `51987654` → 422 `CONTACTO_INVALIDO` «El celular debe tener 9 dígitos e iniciar con 9»; sin fila ni evento.
- [ ] Un segundo contacto principal del mismo tipo (al agregar o al editar) desmarca el anterior en la misma transacción; lo mismo con una segunda dirección principal. Queda un solo principal por tipo y un solo evento.
- [ ] El primer FIJO, CORREO o WHATSAPP y la primera dirección sin `principal` quedan como no principales.
- [ ] Borrar el único celular principal, o editarlo con `principal: false` → 422 `CELULAR_PRINCIPAL_OBLIGATORIO`. Tras marcar otro celular como principal, el anterior se puede borrar.
- [ ] Ubigeo `999999` (no existe) o uno con vigencia cerrada → 422 `UBIGEO_NO_VIGENTE`; ubigeo `4010` → 422 `DIRECCION_INVALIDA`.
- [ ] Dirección de 4 caracteres o de 251, o referencia de 151 → 422 `DIRECCION_INVALIDA`.
- [ ] WHATSAPP `+51987654321` y `+14155552671` se aceptan; `987654321`, `+0123456789` y `+51 987 654 321` → 422 `CONTACTO_INVALIDO`. FIJO `054234567` se acepta; `12345` y `054-234567` → 422.
- [ ] CORREO `juana@` → 422 `CONTACTO_INVALIDO` «El correo no tiene un formato válido».
- [ ] Agregar un contacto con el mismo tipo y valor de otro de la persona → 409 `CONTACTO_DUPLICADO`; el mismo valor en otro tipo (CELULAR y WHATSAPP) sí entra.
- [ ] `DELETE` de un contacto o una dirección borra la fila de `per.contacto` o `per.direccion` y responde 204; el rastro queda en `aud` por `persona.actualizada`.
- [ ] `PATCH /v1/personas/{id}` cambia nombres y apellidos de una NATURAL o la razón social de una JURIDICA; `tipo_persona`, `tipo_documento` y `numero_documento` no cambian, y enviarlos → 400 `SOLICITUD_INVALIDA`.
- [ ] `PATCH` con `razon_social` en una NATURAL, o con nombres en una JURIDICA → 422 `TIPO_PERSONA_INCOHERENTE`; con `nombres` vacío en una NATURAL → 422. `apellido_materno: null` lo borra.
- [ ] Editar o borrar con una `version` distinta de la actual → 409 `VERSION_OBSOLETA`, sin cambios ni evento. Sin `version` → 400.
- [ ] Una edición que no cambia nada → 200 con la misma `version`, sin evento.
- [ ] Cada cambio publica un `persona.actualizada` con `cambio` `DATOS_BASICOS`, `CONTACTO` o `DIRECCION`, en la misma transacción. El payload no contiene nombres, contactos, direcciones ni ubigeo; el evento tiene esquema registrado y queda en `aud`.
- [ ] Persona de otro tenant en cualquiera de los siete endpoints → 404 `NO_ENCONTRADA`; `contactoId` o `direccionId` de otra persona → 404. La prueba SQL con dos `app.tenant_id` no ve, cambia ni borra filas ajenas de `per.direccion` ni de `per.contacto`.
- [ ] `VerificadorReferenciasPer` responde verdadero para `UBIGEO` `040103` con una dirección del tenant que lo usa, y falso para otro distrito: con ese verificador, `exigirSinReferencias` de catálogos lanza `ItemReferenciadoError`.
- [ ] `PersonaPort.agregarContacto` y `agregarDireccion` aplican las mismas reglas que el HTTP; `obtener` devuelve `version` y `direcciones`.
- [ ] Sin `plat.persona.editar` → 403 en los siete endpoints; todos en OpenAPI bajo `/v1`.
- [ ] Ningún log de PER contiene nombres, valores de contacto ni direcciones (TR-RNF-026); los 400 listan campos, no valores.
- [ ] `anon` y `authenticated` no tienen acceso a `per.direccion`.
- [ ] Migración `01l_per_contactos` reversible y probada en CI contra PostgreSQL 16; `per.persona` y `per.persona_rol` siguen sin `DELETE`.
- [ ] `comp:per` solo importa `kernel`, `seg`, `org`, `cat`, `idn` y `scope:shared` (prueba de límites).
- [ ] Cobertura de dominio de `personas` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM sin SQL embebido.
- [ ] `npx nx run-many -t lint test -p personas shared-util catalogos auditoria seguridad identidad org archivos api migrar` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** borrado físico de contactos y direcciones, con `DELETE` solo sobre `per.contacto` y `per.direccion`. Decisión del usuario. Minimiza datos personales (Ley 29733); el rastro queda en AUD por `persona.actualizada`.
- **No:** sin borrado, ni baja lógica con `activo`. Decisión del usuario. Conservan datos que el titular pidió quitar.
- **Sí:** `PATCH /v1/personas/{id}` para nombres, apellidos o razón social, con `plat.persona.editar`. Decisión del usuario. El estimado sube de 5 h a unas 6 h.
- **No:** cambiar tipo o número de documento, ni `tipo_persona`. Decisión del usuario. El documento es la identidad de la persona en el tenant; corregirlo es materia de duplicados y fusión (39).
- **Sí:** la persona siempre tiene un celular principal: no se borra ni se desmarca sin marcar otro. Decisión del usuario. En los demás tipos y en direcciones el principal es opcional.
- **Sí:** WHATSAPP en E.164 (`+` y de 8 a 15 dígitos) y FIJO de 6 a 9 dígitos. Decisión del usuario. El WhatsApp internacional cubre a los extranjeros. CELULAR y CORREO siguen con los validadores del 31.
- **Sí:** el primer dígito del WhatsApp no es 0. E.164 no tiene códigos de país que empiecen en 0; lo demás es lo que fijó el usuario.
- **Sí:** marcar un principal desmarca el anterior del mismo tipo en la misma transacción (RF-041 paso 3) y sale un solo evento.
- **Sí:** el primer contacto de un tipo y la primera dirección no se marcan principales solos: el cliente lo indica. Así la regla es una sola y la API no decide por el usuario. El celular del registro ya nace principal.
- **Sí:** contacto con el mismo tipo y valor repetido en la persona → 409 `CONTACTO_DUPLICADO`, con el único `uq_contacto_valor` como segunda barrera.
- **No:** comparar correos sin distinguir mayúsculas ni normalizar teléfonos. El 31 guarda el valor como llega; cambiarlo aquí daría dos criterios para los mismos datos.
- **Sí:** el tipo de un contacto no se edita. Cambiar de tipo es borrar y agregar: cada tipo tiene su formato y su principal.
- **Sí:** un evento `persona.actualizada` por operación, con `{ persona_id, cambio }`. Sin datos personales; los consumidores leen por `PersonaPort`.
- **No:** un evento por tipo de cambio (`persona.contacto_agregado`...). El SRS define solo `persona.actualizada`; `cambio` basta para filtrar.
- **Sí:** una edición sin cambios no escribe ni publica (TR-RNF-008).
- **Sí:** `version` de la persona en el cuerpo del `PATCH` y en `?version=` del `DELETE`, como catálogos y feriados. La versión es la del agregado `Persona`: contactos y direcciones no tienen versión propia.
- **No:** `version` al agregar. Agregar no pisa nada que el cliente haya leído y un producto en proceso agrega sin leer antes; la carrera la resuelve el bloqueo del repositorio.
- **No:** cabecera `If-Match`. Ningún controlador del repo la usa.
- **Sí:** `VersionObsoletaPersonaError` (`VERSION_OBSOLETA`) para la versión que envía el cliente; el `ConflictError` genérico del repositorio (`conflict`) se conserva para la carrera dentro de la transacción. Ambos son 409; no se cambia el contrato del 31.
- **Sí:** `DELETE` responde 204 y los demás devuelven la persona completa con su `version` nueva. La UI encadena ediciones sin releer; tras un borrado relee.
- **Sí:** distrito, provincia y departamento se copian a `per.direccion` al guardar. `validarItem` carga la lista completa de `UBIGEO` por llamada y no devuelve nombre para un ítem con vigencia cerrada; copiar deja la lectura sin depender del catálogo ni de Redis.
- **No:** resolver los nombres en cada lectura. Una llamada por dirección en cada `GET` y en cada `PersonaPort.obtener`, y un distrito cerrado quedaría sin nombre.
- **Sí:** `nombre` en `ResultadoValidacion` de `catalogos`. El distrito es el nombre del ítem y el puerto no lo devolvía. Cambio aditivo; no toca la caché.
- **Sí:** los nombres se devuelven como están en el catálogo (el CSV oficial los trae en mayúsculas: `CAYMA`). Dar formato «Cayma» es de la UI (38).
- **Sí:** ubigeo validado solo al agregar o al cambiarlo. Una dirección con un distrito que luego cerró su vigencia puede seguir editando su texto.
- **Sí:** `ubigeo` sin llave foránea a `cat.item`: PER solo llega a catálogos por `CatalogoPort` (TR-RNF-119).
- **Sí:** `VerificadorReferenciasPer` responde por `UBIGEO` (pendiente de TR-CA-074). Hoy `UBIGEO` no admite borrado manual y la importación cierra vigencias, así que el verificador queda listo pero ningún flujo real llega a él.
- **Sí:** permiso `plat.persona.editar` solo en el manifiesto, `TENANT`, no sensible, sin rol predefinido. Mismo criterio del 31. La lectura sigue con `plat.persona.leer`.
- **Sí:** `PersonaPort` suma solo `agregarContacto` y `agregarDireccion`. Es lo que un producto necesita al atender (otro teléfono, dirección de entrega). Editar, borrar y datos básicos son de la ficha (38) y se agregan al puerto cuando un producto los pida.
- **Sí:** cuerpo estricto en el `PATCH` de datos básicos. Enviar el documento da 400 en vez de ignorarse en silencio.
- **Sí:** controladores aparte para contactos y direcciones. `PersonasController` ya tiene cuatro rutas; un motivo de cambio por archivo.
- **Sí:** migración `01l_per_contactos.sql`: los añadidos a un esquema llevan su letra (como `01f_cat_feriado.sql`). El runner la aplica aunque `01m_arc.sql` ya esté registrada.
- **No:** tope de contactos o direcciones por persona. Sin RF que lo pida; ver Riesgos.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Cambiar de principal viola `uq_contacto_principal` o `uq_direccion_principal` si se marca el nuevo antes de desmarcar el anterior | `guardar` escribe primero los que dejan de ser principales. Prueba de integración del cambio de principal. |
| Dos ediciones simultáneas de la misma persona | Bloqueo optimista por `version` en el `UPDATE` de la persona; la segunda recibe 409. Prueba con dos transacciones. |
| Los nombres copiados quedan viejos si INEI renombra un distrito | Cambio raro; al editar el ubigeo se vuelven a copiar. Un refresco masivo sería un spec aparte. |
| `UBIGEO` no está importado en un ambiente y toda dirección falla con `UBIGEO_NO_VIGENTE` | El cierre prueba TR-CA-105 en Supabase dev; si falta, se importa `docs/datos-oficiales/ubigeo.csv` por la consola de catálogos. |
| El verificador solo mira el tenant del contexto y un global lo borra el operador | Limitación heredada del 31. Hoy no hay borrado de `UBIGEO`; se revisa cuando exista. |
| Sumar `nombre` a `ResultadoValidacion` rompe dobles de otros consumidores | Hoy el único doble fuera de `catalogos` es el de `personas`; el compilador marca cualquier otro. |
| Persona con muchos contactos o direcciones se carga entera en cada cambio | Volumen esperado bajo (unidades). Si un producto lo dispara, se agrega un tope con constante en el dominio. |
| La versión del manifiesto choca con otro spec en curso | Se toma la siguiente menor libre al implementar y se actualizan las siete pruebas que la fijan. |

## Lo que **no** entra en este spec

- Consentimientos (spec 37), UI de la ficha y `<ui-persona-buscador>` (spec 38), duplicados y fusión (specs 39 y 40).
- Verificación de contactos, normalización de teléfonos y correos, tope de contactos por persona.
- Cambio de documento o de tipo de persona, inactivar o borrar personas, cerrar roles, `sexo`, `estado_civil`.
- Editar y borrar por `PersonaPort`, refresco de nombres de ubigeo.
- Integración con SazónPOS y portal del titular.

Cada uno, si llega, va en su propio spec.
