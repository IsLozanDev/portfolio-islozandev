# SPEC 31 — Personas: registro único por documento con prellenado de identidad y rol por producto

> **Status:** Aprobado
> **Depends on:** SPEC 06, SPEC 17a, SPEC 19a, SPEC 28, SPEC 29
> **Date:** 2026-11-18
> **Objective:** Crear `libs/plataforma/personas` (TR-PER) con la persona maestra del tenant, única por tipo y número de documento, una búsqueda por documento que devuelve la persona existente o los datos de TR-IDN para prellenar, el registro con celular y correo principales, y la asignación de un rol por producto suscrito, todo por `/v1/personas` con eventos por outbox.

## Por qué existe este spec

Fila 31 de `docs/roadmap-specs.md` (R2-01, TR-RF-039 y 040). Contexto: `docs/spec-context/tr-per/per-registro-roles-contactos.md`, partición A. Sus ambigüedades (sec. 9) quedan resueltas en las Decisiones.

El plan da 7 h a R2-01 para cuatro RF solo de back. Este spec cubre 039 y 040 con su capa HTTP: 9-10 h. RF-041 (edición de contactos y direcciones) es el 32, RF-043 el 37 y la UI (`<ui-persona-buscador>`) el 38.

Lo que hay en el código hoy (revisado al redactar):

- No existe nada de personas: ni lib, ni esquema `per`, ni permisos. El `codigo/` del plan tampoco trae nada.
- `libs/plataforma/identidad` (specs 28 y 29): `IDENTIDAD`/`IdentidadPort` con `validar` y `consultar({ tipo: 'DNI'|'RUC', numero, motivo, productoCodigo? })`; errores `DocumentoInvalidoError`, `DocumentoNoEncontradoError`, `ProveedorNoDisponibleError`, `CuotaAgotadaError`. Motivo `REGISTRO_CLIENTE` ya existe.
- `libs/shared/util`: `validarDocumento(tipo: 'DNI'|'RUC'|'CE'|'PAS', numero)` con motivo. No hay validador de celular ni de correo.
- `libs/plataforma/org`: `PRODUCTOS`, `ProductoCodigo`, `Suscripcion` (con `vigente`), `RepositorioSuscripciones.buscar(productoCodigo)`, `SuscripcionRepositorioTypeOrm`.
- `libs/plataforma/catalogos`: `CATALOGO_PORT.validarItem(catalogo, codigo)`; `VERIFICADORES_REFERENCIAS` se compone en `apps/api` y hoy está vacío. `TIPO_DOC_IDENTIDAD` importado con códigos `DNI`, `CE`, `RUC`, `PASAPORTE`, `DOC_0`, `DOC_A`...
- `libs/plataforma/auditoria`: `EVENTOS_AUDITADOS` sin eventos de personas.
- Migraciones: la última es `db/01k_idn_cuota.sql`. Manifiesto `plat.manifiesto.json` en 1.19.0. `eslint.config.mjs` sin `comp:per`.

## Alcance

**Entra:**

- TR-RF-039: registrar persona natural o jurídica con documento, única por `(tenant, tipo_documento, numero_documento)`, con celular principal obligatorio y correo principal opcional.
- Búsqueda por documento que devuelve la persona del tenant o, si no existe y es DNI o RUC, el prellenado desde `IdentidadPort` (TR-CA-100, 101, 102), sin bloquear si IDN falla.
- TR-RF-040: asignar a una persona un rol de un producto con suscripción vigente; un rol vigente repetido es idempotente.
- Lectura de una persona por id con sus roles y contactos.
- `PersonaPort` (`buscarPorDocumento`, `obtener`, `registrar`, `asignarRol`) para consumidores en proceso.
- Eventos `persona.registrada` y `persona.rol_asignado` por outbox, con esquema y auditados.
- Validadores `validarCelular` y `validarCorreo` en `shared/util`.
- `VerificadorReferencias` de PER para `TIPO_DOC_IDENTIDAD` (un tipo usado por personas no se borra).
- Migración `db/01l_per.sql` con `per.persona`, `per.persona_rol` y `per.contacto`, su inverso y prueba SQL.
- Permisos `plat.persona.leer`, `plat.persona.registrar` y `plat.persona.rol` en el manifiesto.

**No entra (specs futuros):**

- Agregar, editar o cambiar el principal de contactos; direcciones y ubigeo; evento `persona.actualizada` (TR-RF-041) → spec 32.
- Consentimientos (TR-RF-043) → spec 37. UI `<ui-persona-buscador>` y lib `personas-ui` → spec 38.
- Duplicados y fusión (TR-RF-042) → specs 39 y 40. Persona sin documento: se decide ahí si hace falta.
- Cerrar o quitar un rol (`hasta`). La columna existe, nula; ningún caso de uso la escribe.
- Búsqueda por nombre o razón social y listado paginado → spec 38.
- `sexo`, `estado_civil`, `fecha_nacimiento` y los catálogos `SEXO` y `ESTADO_CIVIL`: con el primer producto que los pida.
- `documento_verificado` y `fuente_verificacion` del T-05: con identidad portable (R4).
- Tipos de documento distintos de DNI, CE, RUC y PASAPORTE.
- Relaciones apoderado/tutor del T-05, integración SazónPOS CC-06 (R2-12), portal del titular (R3).
- Asignar `plat.persona.*` a roles predefinidos.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `kernel` (`AggregateRoot`, `ValidationError`, `NotFoundError`, `ConflictError`, `UnitOfWork`, `TenantContext`, `IdGenerator`, `Clock`) | Sin cambios. |
| `kernel-infra` (`TypeOrmUnitOfWork`, `OutboxPublisher`, `uuidV7`) | Sin cambios. |
| `identidad` (`IDENTIDAD`, errores) | Se consume desde la búsqueda. Sin cambios. |
| `org` (`PRODUCTOS`, `ProductoCodigo`, `SuscripcionRepositorioTypeOrm`) | Se consume detrás del puerto `SuscripcionesDelTenant` de PER. Sin cambios. |
| `catalogos` (`CATALOGO_PORT`, `VerificadorReferencias`) | Se consume. Sin cambios en la lib; `apps/api` registra el verificador de PER. |
| `shared/util` (`validarDocumento`) | Se reutiliza; se agregan `celular.ts` y `correo.ts`. |
| `catalogos` / `identidad` | Referencia de estructura de lib, módulo dinámico, `event-schemas.ts`, jest y base temporal. |

## Modelo de datos

### `shared/util`

```ts
// src/celular.ts
export function validarCelular(valor: string): boolean;   // ^9\d{8}$
// src/correo.ts
export function validarCorreo(valor: string): boolean;    // forma local@dominio.tld, 3-254 caracteres
```

`validarCorreo` aplica la forma práctica de RFC 5322 (sin comentarios ni comillas), la misma que usa el resto de la plataforma.

### Migración `db/01l_per.sql` (+ `db/rollback/01l_per.sql`, `db/tests/01l_per.test.sql`)

```sql
CREATE SCHEMA per;

CREATE TABLE per.persona (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  tipo_persona      varchar(8)  NOT NULL CHECK (tipo_persona IN ('NATURAL','JURIDICA')),
  tipo_documento    varchar(20) NOT NULL CHECK (tipo_documento IN ('DNI','CE','RUC','PASAPORTE')),
  numero_documento  varchar(12) NOT NULL,
  nombres           varchar(100),
  apellido_paterno  varchar(60),
  apellido_materno  varchar(60),
  razon_social      varchar(200),
  activo            boolean NOT NULL DEFAULT true,
  version           integer NOT NULL DEFAULT 1,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_persona_documento UNIQUE (tenant_id, tipo_documento, numero_documento),
  CONSTRAINT ck_persona_natural CHECK (tipo_persona <> 'NATURAL'
    OR (nombres IS NOT NULL AND apellido_paterno IS NOT NULL AND razon_social IS NULL)),
  CONSTRAINT ck_persona_juridica CHECK (tipo_persona <> 'JURIDICA'
    OR (tipo_documento = 'RUC' AND numero_documento LIKE '20%' AND razon_social IS NOT NULL
        AND nombres IS NULL AND apellido_paterno IS NULL AND apellido_materno IS NULL))
);

CREATE TABLE per.persona_rol (
  persona_id       uuid NOT NULL REFERENCES per.persona(id),
  tenant_id        uuid NOT NULL,
  producto_codigo  varchar(5)  NOT NULL CHECK (producto_codigo IN ('REST','PSI','COL','LIB','GYM','CLI','DOC','ECO','LEX')),
  rol              varchar(12) NOT NULL CHECK (rol IN ('CLIENTE','PACIENTE','SOCIO','ADMINISTRADO','CONTRAPARTE','PROVEEDOR')),
  desde            date NOT NULL,
  hasta            date,
  PRIMARY KEY (persona_id, producto_codigo, rol)
);
CREATE INDEX ix_persona_rol_tenant_producto ON per.persona_rol (tenant_id, producto_codigo, rol);

CREATE TABLE per.contacto (
  id             uuid PRIMARY KEY,
  persona_id     uuid NOT NULL REFERENCES per.persona(id),
  tenant_id      uuid NOT NULL,
  tipo_contacto  varchar(10) NOT NULL CHECK (tipo_contacto IN ('CELULAR','FIJO','CORREO','WHATSAPP')),
  valor          varchar(254) NOT NULL,
  principal      boolean NOT NULL DEFAULT false,
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_contacto_principal ON per.contacto (persona_id, tipo_contacto) WHERE principal;
```

- Las tres tablas: RLS con `tenant_id = current_setting('app.tenant_id')::uuid` (patrón de `01a_org.sql`); `SELECT, INSERT, UPDATE` al rol de la API, sin `DELETE`.
- `REVOKE ALL ON SCHEMA per FROM anon, authenticated` (regla 8).
- La lista de `producto_codigo` es la de `PRODUCTOS` de ORG; una prueba de la lib compara ambas.
- Inverso: `DROP SCHEMA per CASCADE`.

### Dominio (`libs/plataforma/personas/src/domain/`)

- `documento-identidad.ts`: valor `DocumentoIdentidad { tipo, numero }` con `TipoDocumentoPersona = 'DNI'|'CE'|'RUC'|'PASAPORTE'`. Valida con `validarDocumento` (mapea `PASAPORTE` → `PAS`) y lanza `DocumentoInvalidoPersonaError` con el motivo. `esConsultable()` es verdadero solo para DNI y RUC.
- `persona.ts`: agregado `Persona` con `registrar(datos)` y `asignarRol(producto, rol, desde)`. Reglas:
  - NATURAL: `nombres` (1-100) y `apellido_paterno` (1-60) obligatorios; `apellido_materno` opcional (0-60); admite DNI, CE, PASAPORTE y RUC con prefijo 10, 15 o 17.
  - JURIDICA: solo RUC con prefijo 20 y `razon_social` (1-200). Otro caso → `TipoPersonaIncoherenteError`.
  - Textos recortados; vacío tras recortar cuenta como ausente.
  - `asignarRol` devuelve `false` si el rol del producto ya está vigente (no registra evento).
- `rol-persona.ts`: `ROLES_PERSONA` y `RolPersona`.
- `contacto.ts`: `Contacto { tipo, valor, principal }`. CELULAR valida con `validarCelular` (mensaje «El celular debe tener 9 dígitos e iniciar con 9»); CORREO con `validarCorreo`.
- `errores.ts`: `DocumentoInvalidoPersonaError`, `TipoPersonaIncoherenteError`, `ContactoInvalidoError` (ValidationError); `PersonaDuplicadaError` (ConflictError, lleva `personaId`); `PersonaNoEncontradaError` (NotFoundError); `ProductoNoSuscritoError` (ValidationError, «Producto no suscrito»).
- `permisos-per.ts`: `PERMISOS_PER`.

### Puertos (`application/ports/`)

```ts
export const PERSONA_PORT = Symbol('PersonaPort');

export interface PersonaPort {
  buscarPorDocumento(tipo: TipoDocumentoPersona, numero: string): Promise<PersonaResumen | null>;
  obtener(personaId: string): Promise<PersonaDetalle>;              // PersonaNoEncontradaError
  registrar(comando: RegistrarPersonaComando): Promise<PersonaDetalle>;
  asignarRol(comando: AsignarRolComando): Promise<{ asignado: boolean }>;
}

interface RepositorioPersonas {                 // TypeORM, sobre el EntityManager de la transacción
  buscarPorDocumento(tipo, numero): Promise<Persona | null>;
  obtener(personaId): Promise<Persona | null>;
  guardar(persona: Persona): Promise<void>;     // persona, roles y contactos nuevos; bloqueo optimista por version
}
interface SuscripcionesDelTenant { estaVigente(producto: ProductoCodigo): Promise<boolean> }   // sobre org
```

Toda consulta filtra por el `tenant_id` del `TenantContext` además de la RLS. Una persona de otro tenant es `PersonaNoEncontradaError`.

### Casos de uso (`application/`)

- `BuscarPersonaPorDocumento` (`buscar-persona.ts`):
  1. Valida el documento; inválido → `DocumentoInvalidoPersonaError`.
  2. Busca en el tenant (transacción corta). Si existe → `{ encontrada: true, persona }` (TR-CA-101). No consulta IDN.
  3. Si no existe y el documento es CE o PASAPORTE → `{ encontrada: false, prellenado: null }` (TR-CA-102).
  4. Si no existe, es DNI o RUC y el usuario tiene `plat.persona.registrar` → `IdentidadPort.consultar({ motivo: 'REGISTRO_CLIENTE' })` fuera de la transacción. DNI → `nombres` y `apellidos` separados en paterno y materno por el primer espacio; RUC 20 → `razon_social`; RUC 10/15/17 → `razon_social` como referencia, sin separar nombres.
  5. IDN responde `ProveedorNoDisponibleError`, `CuotaAgotadaError` o `DocumentoNoEncontradoError` → `prellenado: null` con `aviso` `IDENTIDAD_NO_DISPONIBLE`, `CUOTA_AGOTADA` o `NO_ENCONTRADO_EN_IDENTIDAD`. Nunca falla la búsqueda (TR-RNF-007).
- `RegistrarPersona` (`registrar-persona.ts`): valida que el tipo de documento esté vigente en `TIPO_DOC_IDENTIDAD` (`CatalogoPort.validarItem`), arma el agregado con el celular principal y el correo principal opcional, verifica duplicado (y traduce la violación de `uq_persona_documento` a `PersonaDuplicadaError` con el id existente), guarda y publica `persona.registrada` en la misma transacción. No consulta IDN.
- `AsignarRolPersona` (`asignar-rol.ts`): carga la persona del tenant, verifica `SuscripcionesDelTenant.estaVigente(producto)` (PRUEBA o ACTIVA, TR-RN-006), asigna con `desde = hoy` en zona `America/Lima` y publica `persona.rol_asignado` si el rol es nuevo.
- `ObtenerPersona` (`obtener-persona.ts`): persona con roles y contactos.

### Eventos (`infrastructure/event-schemas.ts`, `registrarEsquemasPer`)

| Evento | Payload |
| --- | --- |
| `persona.registrada` | `{ persona_id, tipo_persona, tipo_documento }` |
| `persona.rol_asignado` | `{ persona_id, producto_codigo, rol, desde }` |

Sin número de documento, nombres ni contactos en el payload: los consumidores leen la persona por `PersonaPort` con su tenant. `persona.rol_asignado` no está en el SRS: se documenta como añadido. Ambos se agregan a `EVENTOS_AUDITADOS` de `auditoria`.

### Infraestructura

- `typeorm/`: entidades `PersonaEntidad`, `PersonaRolEntidad`, `ContactoEntidad` (distintas del agregado) y `RepositorioPersonasTypeOrm` con `manager.getRepository` y `QueryBuilder`. `@VersionColumn` en `version`. Sin SQL crudo.
- `suscripciones-del-tenant.org.ts`: adaptador de `SuscripcionesDelTenant` sobre `SuscripcionRepositorioTypeOrm` de ORG.
- `verificador-referencias.per.ts`: `VerificadorReferencias` para `TIPO_DOC_IDENTIDAD` (existe una `per.persona` del código). Para otros catálogos responde `false`.

### HTTP (`interface/personas.controller.ts`, `personas.dto.ts`)

| Método y ruta | Permiso | Respuesta |
| --- | --- | --- |
| `GET /v1/personas/busqueda?tipo=&numero=` | `plat.persona.leer` | 200 `{ encontrada: true, persona }` o `{ encontrada: false, prellenado, aviso? }` |
| `POST /v1/personas` | `plat.persona.registrar` | 201 persona con contactos |
| `GET /v1/personas/{id}` | `plat.persona.leer` | 200 persona con roles y contactos |
| `POST /v1/personas/{id}/roles` | `plat.persona.rol` | 201 si asignó; 200 si el rol ya estaba vigente |

Cuerpo de `POST /v1/personas`: `tipo_persona`, `tipo_documento`, `numero_documento`, `nombres?`, `apellido_paterno?`, `apellido_materno?`, `razon_social?`, `celular`, `correo?`. Cuerpo de roles: `producto_codigo`, `rol`.

Errores: 422 `DOCUMENTO_INVALIDO` (con `motivo`), `TIPO_DOCUMENTO_NO_ADMITIDO`, `TIPO_PERSONA_INCOHERENTE`, `CONTACTO_INVALIDO` (con mensaje), `PRODUCTO_NO_SUSCRITO` («Producto no suscrito»); 409 `PERSONA_DUPLICADA` con `persona_id`; 404 `NO_ENCONTRADA` (también para otro tenant). OpenAPI completo.

### Composición

- `PersonasModule.register(...)` exporta `PERSONA_PORT`; `apps/api` lo registra, le inyecta `IDENTIDAD`, `CATALOGO_PORT` y el adaptador de suscripciones, y agrega el verificador de PER a `VERIFICADORES_REFERENCIAS`.
- `eslint.config.mjs`: `comp('per', 'kernel', 'seg', 'org', 'cat', 'idn')` y fixture `comp:per` en `tools/boundaries-test`.
- `plat.manifiesto.json` 1.20.0: `plat.persona.leer` («Buscar y ver personas del tenant»), `plat.persona.registrar`, `plat.persona.rol`; alcance `TENANT`, no sensibles, sin rol predefinido ni opción de menú. Las pruebas de manifiesto que fijan la versión se actualizan.

## Plan de implementación

1. **Validadores.** `shared/util/src/celular.ts` y `correo.ts` con pruebas (TR-CA-106: `51987654` falla; `987654321` pasa).
2. **Migración.** `db/01l_per.sql`, inverso y prueba SQL: único por documento, CHECK natural y jurídica (RUC 10 jurídico rechazado), un solo principal por tipo, RLS entre dos tenants, sin `DELETE`, sin acceso de `anon`/`authenticated`, ida y vuelta.
3. **Lib y dominio.** `nx g` de `libs/plataforma/personas` con tags `scope:plataforma`, `type:backend`, `comp:per`; regla de eslint y fixture de límites. `DocumentoIdentidad`, `Persona`, `Contacto`, roles y errores con pruebas.
4. **Persistencia.** Entidades y `RepositorioPersonasTypeOrm`, adaptador de suscripciones, verificador de referencias. Integración contra base temporal: guardar y leer con roles y contactos, aislamiento por tenant, conflicto de versión, duplicado traducido.
5. **Casos de uso.** `RegistrarPersona`, `AsignarRolPersona`, `ObtenerPersona` y `BuscarPersonaPorDocumento` con dobles de `IdentidadPort`, `CatalogoPort` y suscripciones; eventos en el outbox; esquemas y `EVENTOS_AUDITADOS`.
6. **HTTP y composición.** Controlador, DTO, OpenAPI, `PersonasModule`, registro en `apps/api`, manifiesto 1.20.0. Prueba e2e de los cuatro endpoints con el proveedor falso de IDN, incluidos 403, 404 de otro tenant, 409 y 422.
7. **Cierre.** `nx affected -t lint test build` verde, `code-simplifier` sobre los archivos tocados, prueba en staging de TR-CA-100 a 104 con `IDN_PROVEEDOR=falso`.

## Criterios de aceptación

- [ ] TR-CA-100: búsqueda de DNI 45781236 sin persona en el tenant → `prellenado` con nombres «Juana», paterno «Quispe», materno «Mamani»; el POST con esos datos y celular crea la persona y publica `persona.registrada`.
- [ ] TR-CA-101: búsqueda de un DNI ya registrado → `encontrada: true` con la persona, sin llamar a `IdentidadPort`; el POST del mismo documento → 409 `PERSONA_DUPLICADA` con su `persona_id`.
- [ ] TR-CA-102: búsqueda de CE 001234567 → `prellenado: null` sin llamar a `IdentidadPort`; el POST con nombres a mano crea la persona.
- [ ] TR-CA-103: Juana con rol PACIENTE en CLI recibe SOCIO en GYM del mismo tenant → una sola `per.persona`, dos filas en `per.persona_rol`, dos eventos `persona.rol_asignado`.
- [ ] TR-CA-104: tenant sin suscripción vigente de ECO → asignar CLIENTE de ECO responde 422 `PRODUCTO_NO_SUSCRITO` «Producto no suscrito»; sin fila ni evento.
- [ ] TR-CA-106: POST con celular 51987654 → 422 `CONTACTO_INVALIDO` «El celular debe tener 9 dígitos e iniciar con 9».
- [ ] IDN con proveedor caído o cuota agotada → búsqueda 200 con `prellenado: null` y `aviso` `IDENTIDAD_NO_DISPONIBLE` o `CUOTA_AGOTADA`; el registro manual sigue funcionando.
- [ ] Usuario con `plat.persona.leer` sin `plat.persona.registrar` → la búsqueda no llama a `IdentidadPort`.
- [ ] `GET /v1/personas/{id}` de una persona de otro tenant → 404; la prueba SQL con dos `app.tenant_id` no ve filas ajenas.
- [ ] `tipo_persona = JURIDICA` con RUC 10… o con DNI → 422 `TIPO_PERSONA_INCOHERENTE`; NATURAL con RUC 20… → 422.
- [ ] `tipo_documento = DOC_0` → 422 `TIPO_DOCUMENTO_NO_ADMITIDO`; DNI `4578123A` → 422 `DOCUMENTO_INVALIDO` con motivo `CARACTERES`.
- [ ] Asignar un rol ya vigente → 200, sin fila nueva ni evento.
- [ ] El payload de los eventos no contiene número de documento, nombres ni contactos; ambos eventos tienen esquema registrado y quedan en `aud`.
- [ ] Borrar el ítem `DNI` de `TIPO_DOC_IDENTIDAD` con personas que lo usan → `ItemReferenciadoError`.
- [ ] Ningún log de PER contiene el número de documento en claro (TR-RNF-026 y 111).
- [ ] Sin el permiso de cada endpoint → 403; endpoints en OpenAPI bajo `/v1`.
- [ ] `anon` y `authenticated` no tienen acceso al esquema `per`.
- [ ] Migración `01l_per` reversible y probada en CI contra PostgreSQL 16.
- [ ] `comp:per` solo importa `kernel`, `seg`, `org`, `cat`, `idn` y `scope:shared` (prueba de límites).
- [ ] Cobertura de dominio de `personas` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM sin SQL embebido.
- [ ] `nx affected -t lint test build` verde.

## Decisiones

- **Sí:** `per.contacto` nace en este spec y el registro guarda celular y correo como principales. Decisión del usuario. RF-039 los pide; el 32 suma edición, direcciones y cambio de principal sin migrar datos.
- **No:** columnas `celular` y `correo` en `per.persona`. Doble modelo que el 32 tendría que migrar.
- **Sí:** prellenado en un GET de búsqueda combinada; el POST solo persiste. Decisión del usuario. Mantiene el POST bajo TR-RNF-001 aunque el proveedor tarde 3 s.
- **No:** consultar IDN dentro del POST, ni que la UI llame aparte a `/v1/identidad` (la UI tendría que unir dos respuestas y el usuario necesitaría permisos de IDN).
- **Sí:** la búsqueda consulta IDN solo si el usuario tiene `plat.persona.registrar`. El prellenado sirve para registrar; así un perfil de solo lectura no consume cuota.
- **Sí:** fallo de IDN como `aviso` dentro de un 200, nunca como error de la búsqueda (TR-RNF-007).
- **Sí:** documento obligatorio y único completo `(tenant, tipo, numero)`. Decisión del usuario. La persona sin documento de TR-CA-107 se resuelve en el spec 39 si hace falta.
- **Sí:** `persona.rol_asignado` como evento propio. Decisión del usuario. Se documenta como añadido al SRS.
- **Sí:** payload de eventos sin datos personales; los consumidores leen por `PersonaPort`.
- **No:** `sexo` y `estado_civil` en este spec. Decisión del usuario. Sin RF que los pida.
- **Sí:** permiso nuevo `plat.persona.leer` para búsqueda y lectura; búsqueda por nombre en el 38. Decisión del usuario.
- **Sí:** `plat.persona.*` solo en el manifiesto, sin rol predefinido. Decisión del usuario. Cada producto o el tenant los incluye en sus roles (respuesta a la pregunta 2 del contexto: la API no conoce permisos de producto).
- **Sí:** JURIDICA solo con RUC prefijo 20; NATURAL con DNI, CE, PASAPORTE o RUC 10/15/17. Decisión del usuario.
- **Sí:** tipos admitidos DNI, CE, RUC y PASAPORTE; el código manda el catálogo (`PASAPORTE`, no `PAS`), con mapeo interno a `validarDocumento`. Decisión del usuario.
- **Sí:** validación en capas: tipo vigente en `TIPO_DOC_IDENTIDAD` por `CatalogoPort` y formato por `validarDocumento` (módulo 11 para RUC).
- **Sí:** POST de documento existente → 409 con `persona_id`. Decisión del usuario.
- **No:** cerrar o quitar roles. Decisión del usuario. `hasta` queda nula; asignar un rol vigente es idempotente.
- **Sí:** `apellido_materno` opcional. Extranjeros con CE o pasaporte suelen tener un solo apellido; RF-039 dice «dos apellidos» pensando en DNI.
- **Sí:** `producto_codigo` con la lista de `PRODUCTOS` de ORG (3 letras + `REST`), en un CHECK y en una prueba que las compara (pregunta 7 del contexto).
- **Sí:** PER consume `IdentidadPort` aunque PL-10 dibuje IDN después de PER. El 28 ya está implementado; se registra `comp('per', ..., 'idn')`.
- **No:** `documento_verificado` ni `fuente_verificacion`. El cliente puede declarar cualquier cosa en el POST y verificar de nuevo costaría la llamada que se evitó; se agregan con identidad portable (R4).
- **Sí:** sin `empresa_id`: la persona es del tenant y se comparte entre sus empresas (OP-04 nivel 2, Ley 29733).
- **Sí:** migración `01l_per` (`01j` y `01k` ya son de IDN).
- **Sí:** separar `apellidos` de IDN en paterno y materno por el primer espacio. Apellidos compuestos («De la Cruz») salen mal partidos y el usuario los corrige en el formulario: el prellenado es una sugerencia.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Carrera de dos registros del mismo documento | El único de base decide; la violación se traduce a 409 con el id existente. Prueba de integración con dos transacciones. |
| La lista de productos del CHECK se desalinea de `PRODUCTOS` de ORG | Prueba de la lib que compara ambas; agregar un producto obliga a una migración. |
| Partir apellidos por espacio falla con apellidos compuestos | Solo es prellenado editable; se documenta en la búsqueda. |
| El verificador de referencias hace una consulta por ítem al borrar del catálogo | El borrado es raro y sale de la consola; índice único por `(tenant_id, tipo_documento, numero_documento)` cubre el filtro por tipo. |
| `plat.persona.*` sin rol predefinido deja a los productos sin poder probar hasta configurar roles | Las pruebas e2e y staging asignan los permisos al rol de prueba; los productos los incluyen al integrarse. |

## Lo que **no** entra en este spec

- Edición de contactos, direcciones, ubigeo y `persona.actualizada` (spec 32).
- Consentimientos (spec 37), UI `<ui-persona-buscador>` (spec 38), duplicados y fusión (specs 39 y 40).
- Persona sin documento, tipos de documento fuera de DNI, CE, RUC y PASAPORTE.
- Cerrar o quitar roles, búsqueda por nombre, `sexo`, `estado_civil`, verificación de documento.
- Integración con SazónPOS y portal del titular.

Cada uno, si llega, va en su propio spec.
