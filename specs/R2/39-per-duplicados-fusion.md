# SPEC 39 — Personas: detección de duplicados con puntaje, descartes y fusión con alias

> **Status:** Aprobado
> **Depends on:** SPEC 31, SPEC 32, SPEC 37, SPEC 38, SPEC 20a, SPEC 11
> **Date:** 2026-11-24
> **Objective:** Ampliar `libs/plataforma/personas` para proponer pares de personas posiblemente duplicadas del tenant con un puntaje de reglas fijas, descartar los pares revisados y fusionar dos fichas en una transacción que mueve roles, contactos y direcciones a la conservada, deja la absorbida como alias inactivo, audita antes y después y publica `persona.fusionada` por outbox.

## Por qué existe este spec

Fila 39 de `docs/roadmap-specs.md` (TR-RF-042 back). Contexto: `docs/spec-context/tr-per/per-duplicados-fusion.md`, partición A. La UI es el spec 40 y el consumidor que reasigna referencias en SazónPOS es CC-06 (R2-12), fuera de este repo. Cubre TR-CA-107 y 108 y los criterios que el contexto propone en su sec. 3.

El roadmap da 7 h. Con los descartes, el movimiento de roles, contactos y direcciones y la resolución de alias, el estimado es 9-10 h. Si se pasa de 10 h se recorta el `DELETE` del descarte (quitar un descarte), que pasa al spec 40.

Lo que hay en el código hoy (revisado al redactar):

- `db/01l_per.sql` (31): `per.persona` con documento obligatorio y único `(tenant_id, tipo_documento, numero_documento)`, `activo` y `version`; `per.persona_rol` (PK `persona_id, producto_codigo, rol`) y `per.contacto`. Sin `DELETE` en persona y roles.
- `db/01l_per_contactos.sql` (32): `per.direccion`; `DELETE` en contactos y direcciones; únicos `uq_contacto_principal`, `uq_contacto_valor` y `uq_direccion_principal`.
- `db/01l_per_consentimientos.sql` (37): `per.consentimiento` con trigger de solo revocación (no deja cambiar `persona_id`).
- `db/01l_per_busqueda.sql` (38): columnas generadas `busqueda_texto` (nombre normalizado) y `busqueda_fonetica`, `pg_trgm` en `extensions`, índices GIN por tenant e índice `ix_contacto_valor_prefijo`.
- Dominio: `Persona` (roles, contactos, direcciones, `cambiarDatosBasicos`, reglas de principal y de celular principal obligatorio), `PersonaDuplicadaError(personaId)`, `VersionObsoletaPersonaError`. `PersonaPort` con `buscarPorDocumento`, `obtener`, `registrar`, `asignarRol`, `agregarContacto`, `agregarDireccion`. `ConsultaPersonas.buscar` no filtra por `activo`.
- `PERMISOS_PER`: `leer`, `registrar`, `rol`, `editar`, `consentimiento`, `textoFinalidad`. `EVENTOS_PER`: `registrada`, `rolAsignado`, `actualizada`, `consentimientoRevocado`.
- `eslint.config.mjs`: `comp('per', 'kernel', 'seg', 'org', 'cat', 'idn', 'arc', 'aud')`: PER ya puede usar `AuditoriaPort`.
- `not.mensaje.persona_id` (spec 42) guarda la persona destinataria; no la toca este spec.
- `plat.manifiesto.json` en 1.27.0.

## Alcance

**Entra:**

- Detección de pares candidatos del tenant con puntaje y motivos (reglas fijas, sin IA), calculada al vuelo y paginada. Solo personas activas sin fusionar, del mismo tipo de persona, sin bloqueo y sin descarte.
- Descarte de un par («no son la misma persona») en `per.par_descartado`, y quitar el descarte.
- Comparación de un par: las dos fichas completas, puntaje, motivos y bloqueo si lo hay.
- Fusión transaccional (TR-RF-042): elige conservada y absorbida, datos básicos campo por campo y el principal de cada tipo de contacto y de dirección; motivo de 5 a 300 caracteres; bloqueo optimista con la versión de las dos fichas.
- Roles, contactos y direcciones de la absorbida pasan a la conservada sin duplicar. Los consentimientos se quedan en la absorbida y se leen desde la conservada.
- La absorbida queda inactiva con `fusionada_en_id` (alias). Lecturas por id o documento de la absorbida resuelven a la conservada; escrituras sobre la absorbida se rechazan. Si la conservada se absorbe después en otra, sus alias se re-apuntan.
- Registro histórico en `per.fusion`; auditoría con antes y después por `AuditoriaPort` en la transacción; evento `persona.fusionada` por outbox con esquema.
- Permiso `plat.persona.fusionar`, sensible (aal2).
- Migración `db/01l_per_fusion.sql` con inverso y prueba SQL.
- Consumidor de prueba de `persona.fusionada` (solo en `test/`), idempotente por `event_id`, para probar TR-CA-107.

**No entra (specs futuros):**

- UI de duplicados, comparación y fusión → spec 40.
- Reasignar referencias en SazónPOS (citas, ventas, clientes) → CC-06 (R2-12), al final del bloque transversal.
- Que TR-NOT reasigne `not.mensaje.persona_id`: los mensajes son historial de envíos y el alias resuelve lecturas.
- Persona sin documento (TR-CA-107 la menciona): el documento sigue obligatorio (spec 31).
- Elegir el documento de la absorbida para la conservada.
- Deshacer una fusión.
- Detección por IA o fonética avanzada; tabla precalculada de candidatos o tarea en el worker.
- Fusión entre tenants (TR-RN-001) o de más de dos fichas a la vez.
- `GET` del historial de fusiones: se ve en el visor de auditoría (spec 20c).
- Asignar `plat.persona.fusionar` a roles predefinidos.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `Persona`, `Contacto`, `Direccion`, `denominarNatural`, `denominarJuridica` | La fusión aplica las mismas reglas de denominación, principales y celular principal. `Persona` gana `absorber` y `marcarFusionada`. |
| `RepositorioPersonasTypeOrm.guardar` | Ya sincroniza contactos y direcciones por id y escribe la denominación con `WHERE version`. Se amplía para mover filas de otra persona (cambio de `persona_id`), roles y las columnas de alias. |
| `ConsultaPersonasTypeOrm` | Suma el filtro `activo AND fusionada_en_id IS NULL`. |
| `busqueda_texto`, `busqueda_fonetica`, `pg_trgm` (38) | Base de las reglas de nombre. |
| `RepositorioConsentimientos.decisionesDe` (37) | Pasa a leer también las decisiones de los alias de la persona. |
| `AuditoriaPort.registrar` | Auditoría de fusión y descarte con antes/después. |
| `registrarEsquemasPer` | Esquema de `persona.fusionada`. |
| `PersonasFiltro`, `validar`, `personas.http.ts` | Validación zod y mapeo de errores de las rutas nuevas. |

## Modelo de datos

### Migración `db/01l_per_fusion.sql` (+ `db/rollback/01l_per_fusion.sql`, `db/tests/01l_per_fusion.test.sql`)

```sql
ALTER TABLE per.persona
  ADD COLUMN fusionada_en_id uuid REFERENCES per.persona(id),
  ADD COLUMN fusionada_en    timestamptz,
  ADD CONSTRAINT ck_persona_fusion_completa CHECK ((fusionada_en_id IS NULL) = (fusionada_en IS NULL)),
  ADD CONSTRAINT ck_persona_fusion_no_propia CHECK (fusionada_en_id IS NULL OR fusionada_en_id <> id),
  ADD CONSTRAINT ck_persona_fusion_inactiva CHECK (fusionada_en_id IS NULL OR NOT activo);
CREATE INDEX ix_persona_fusionada_en ON per.persona (fusionada_en_id) WHERE fusionada_en_id IS NOT NULL;

CREATE TABLE per.fusion (
  id                     uuid PRIMARY KEY,
  tenant_id              uuid NOT NULL,
  persona_conservada_id  uuid NOT NULL REFERENCES per.persona(id),
  persona_absorbida_id   uuid NOT NULL REFERENCES per.persona(id),
  campos_elegidos        jsonb NOT NULL,
  motivo                 varchar(300) NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 5 AND 300),
  fusionado_por          uuid NOT NULL,
  fusionado_en           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_fusion_absorbida UNIQUE (persona_absorbida_id),
  CONSTRAINT ck_fusion_distintas CHECK (persona_conservada_id <> persona_absorbida_id)
);
CREATE INDEX ix_fusion_conservada ON per.fusion (persona_conservada_id);

-- Par guardado en orden (menor, mayor) para que (a, b) y (b, a) sean el mismo.
CREATE TABLE per.par_descartado (
  tenant_id        uuid NOT NULL,
  persona_menor_id uuid NOT NULL REFERENCES per.persona(id),
  persona_mayor_id uuid NOT NULL REFERENCES per.persona(id),
  descartado_por   uuid NOT NULL,
  descartado_en    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, persona_menor_id, persona_mayor_id),
  CONSTRAINT ck_par_descartado_orden CHECK (persona_menor_id < persona_mayor_id)
);
```

- RLS `ENABLE + FORCE` en `per.fusion` y `per.par_descartado` con el filtro `NULLIF(current_setting('app.tenant_id', true), '')::uuid` (patrón de `01l_per.sql`).
- `per.fusion`: políticas de `SELECT` e `INSERT`. Sin `UPDATE` ni `DELETE`: el registro es histórico.
- `per.par_descartado`: `SELECT`, `INSERT` y `DELETE`.
- `per.persona_rol`, `per.contacto` y `per.direccion` no cambian: mover una fila es `UPDATE persona_id` con las políticas que ya tienen.
- Privilegios al `current_user`: `SELECT, INSERT` en `per.fusion`; `SELECT, INSERT, DELETE` en `per.par_descartado`. `REVOKE ALL ... FROM PUBLIC` y de `anon` y `authenticated` si existen (regla 8).
- Inverso: borra las dos tablas, el índice y las columnas y restricciones de `per.persona`. Se niega si `per.fusion` tiene filas o alguna persona tiene `fusionada_en_id`: quitar las columnas haría visibles como independientes fichas ya fusionadas.
- Orden: después de `01l_per_contactos.sql` por nombre (`fusion` > `contactos`).

### Reglas de puntaje (`domain/duplicados.ts`)

Un par entra si cumple al menos una regla; su puntaje es el mayor de las que cumple y `motivos` lista todas. Constantes con nombre en el dominio; la consulta las recibe como parámetros.

| Motivo | Regla | Puntaje |
| --- | --- | --- |
| `MISMO_NUMERO_OTRO_TIPO` | Mismo `numero_documento` con distinto `tipo_documento` | 100 |
| `CELULAR_Y_NOMBRE_IGUAL` | Comparten un contacto `CELULAR` con el mismo valor y `busqueda_texto` es igual | 80 |
| `CELULAR_Y_NOMBRE_PARECIDO` | Comparten un `CELULAR` y además: `similarity(busqueda_texto) >= 0,8`, o misma `busqueda_fonetica`, o todas las palabras del nombre más corto están en el otro | 60 |

- `PUNTAJE_MINIMO = 60`. `SIMILITUD_NOMBRE_MINIMA = 0.8`.
- Solo pares de personas activas, sin `fusionada_en_id`, del mismo `tipo_persona` y del tenant.
- Se excluyen los pares bloqueados (mismo tipo de documento con distinto número) y los descartados.
- Orden: puntaje descendente, luego fecha de alta más reciente de cualquiera de las dos.
- Cada par se devuelve una sola vez, con `persona_a_id < persona_b_id`.

### Bloqueos de fusión (`domain/fusion.ts`)

| Error | Código | Cuándo |
| --- | --- | --- |
| `MismaPersonaError` (ValidationError) | `MISMA_PERSONA` | conservada = absorbida |
| `DocumentosDistintosError` (ConflictError) | `DOCUMENTOS_DISTINTOS`, «Las personas tienen documentos distintos» | mismo tipo de documento con distinto número (TR-CA-108) |
| `TipoPersonaDistintoError` (ConflictError) | `TIPO_PERSONA_DISTINTO` | una NATURAL y otra JURIDICA |
| `PersonaYaFusionadaError` (ConflictError) | `PERSONA_FUSIONADA`, lleva `conservadaId` | alguna de las dos tiene `fusionada_en_id` |
| `MotivoFusionInvalidoError` (ValidationError) | `MOTIVO_INVALIDO` | motivo recortado fuera de 5-300 |
| `CampoElegidoInvalidoError` (ValidationError) | `CAMPO_ELEGIDO_INVALIDO` | un id de principal que no es de ninguna de las dos fichas, o de otro tipo, o un campo que no aplica al tipo de persona |

### Dominio (`libs/plataforma/personas/src/domain/`)

- `duplicados.ts`: `MOTIVOS_DUPLICADO`, `PUNTAJES_DUPLICADO`, `PUNTAJE_MINIMO`, `SIMILITUD_NOMBRE_MINIMA`; `ParPersonas.de(a, b)` ordena los ids (`menor`, `mayor`) y rechaza `a = b`.
- `fusion.ts`:
  - `CamposElegidos`:
    ```ts
    type Origen = 'CONSERVADA' | 'ABSORBIDA';
    interface CamposElegidos {
      datosBasicos: Partial<Record<'nombres' | 'apellidoPaterno' | 'apellidoMaterno' | 'razonSocial', Origen>>;
      /** Id del contacto o dirección que queda como principal; puede ser de cualquiera de las dos fichas. */
      principales: Partial<Record<TipoContacto | 'DIRECCION', string>>;
    }
    ```
    Un campo o principal que no llega toma el valor de la conservada; si la conservada no tiene principal de ese tipo, se mantiene el de la absorbida.
  - `exigirFusionable(conservada, absorbida)`: aplica los bloqueos de la tabla.
- `persona.ts`, métodos nuevos:
  - `absorber(absorbida, campos, ahora)`: valida con `exigirFusionable` y `CamposElegidos`; aplica los datos básicos con las reglas de `denominarNatural` / `denominarJuridica`; toma los roles de la absorbida que la conservada no tiene (mismo producto y rol: se queda el `desde` más antiguo en la conservada); toma los contactos cuyo tipo y valor no tenga ya la conservada y las direcciones cuyo texto normalizado y ubigeo no tenga ya; deja un solo principal por tipo y una dirección principal según `principales`; exige celular principal (`CelularPrincipalObligatorioError`). Publica un solo `persona.fusionada`. Devuelve qué movió (`ResultadoAbsorcion`: ids de roles, contactos y direcciones movidos y los que quedaron en la absorbida por duplicados).
  - `marcarFusionada(conservadaId, ahora)`: `activo = false`, `fusionadaEnId`, `fusionadaEn`; sube la versión sin publicar evento. Una persona marcada rechaza cualquier método que la modifique con `PersonaYaFusionadaError`.
  - Getters `fusionadaEnId` y `fusionadaEn`.
- `errores.ts`: los seis errores de la tabla de bloqueos. Ningún mensaje lleva nombres, documento ni contactos.
- `eventos-per.ts`: `EVENTOS_PER.fusionada = 'persona.fusionada'`; `PersonaFusionada { persona_conservada_id, persona_absorbida_id, fusion_id }`. Agregado `persona`, `aggregate_id` = conservada.
- `permisos-per.ts`: `fusionar: 'plat.persona.fusionar'`.

### Puertos (`application/ports/`)

```ts
// consulta-duplicados.ts
export interface ParCandidato {
  personaA: PersonaListada;          // sin `coincidencia`
  personaB: PersonaListada;
  puntaje: number;
  motivos: MotivoDuplicado[];
}
export interface PaginaDuplicados { items: ParCandidato[]; total: number }
export interface ConsultaDuplicados {
  buscar(criterios: { pagina: number; tamano: number; puntajeMinimo: number }): Promise<PaginaDuplicados>;
  /** Puntaje y motivos del par aunque esté bajo el umbral, bloqueado o descartado; null si no cumple ninguna regla. */
  evaluar(par: ParPersonas): Promise<{ puntaje: number; motivos: MotivoDuplicado[] } | null>;
}

// repositorio-fusiones.ts
export interface RepositorioFusiones {
  registrar(fusion: RegistroFusion): Promise<void>;
  /** Re-apunta a `nuevaConservadaId` los alias de `anteriorConservadaId`. Devuelve cuántos. */
  reapuntarAlias(anteriorConservadaId: string, nuevaConservadaId: string): Promise<number>;
  descartar(par: ParPersonas, usuarioId: string): Promise<void>;   // idempotente
  quitarDescarte(par: ParPersonas): Promise<boolean>;
  estaDescartado(par: ParPersonas): Promise<boolean>;
}
```

- `RepositorioPersonas.obtener` sigue devolviendo la ficha pedida (también una absorbida); `guardar` pasa a escribir los movimientos de `ResultadoAbsorcion` y las columnas de alias.
- `PersonaPort.buscarPorDocumento` y `obtener` resuelven el alias: con el documento o el id de una absorbida devuelven la conservada.
- `PersonaDetalle` suma `resueltaDesde: string | null` (id de la absorbida pedida; nulo si se pidió la conservada) y `alias: string[]` (ids absorbidos en ella).

### Casos de uso (`application/duplicados/`)

- `ListarDuplicados`: `ConsultaDuplicados.buscar` con `PUNTAJE_MINIMO`; `tamano` de 1 a 50 (por defecto 20).
- `CompararPar`: carga las dos personas (`PersonaNoEncontradaError` si alguna no es del tenant) sin resolver alias (se compara lo pedido), `evaluar`, `estaDescartado` y el bloqueo que devolvería `exigirFusionable` (código o nulo).
- `DescartarPar` / `QuitarDescarte`: en una transacción, ambas personas del tenant; audita `plat.persona.duplicado.descartar` / `plat.persona.duplicado.quitar_descarte` con `entidadTipo: 'persona'`, `entidadId` = menor y `despues: { persona_menor_id, persona_mayor_id }`.
- `FusionarPersonas`: comando `{ conservadaId, absorbidaId, versionConservada, versionAbsorbida, camposElegidos, motivo }`. En una transacción:
  1. Carga las dos (`PersonaNoEncontradaError`); compara versiones (`VersionObsoletaPersonaError`).
  2. `conservada.absorber(absorbida, campos, ahora)` y `absorbida.marcarFusionada(conservada.id, ahora)`.
  3. Guarda la absorbida primero (libera principales y mueve filas), luego la conservada.
  4. `reapuntarAlias(absorbida.id, conservada.id)`.
  5. `RepositorioFusiones.registrar` (`per.fusion`).
  6. `AuditoriaPort.registrar({ accion: 'plat.persona.fusionar', entidadTipo: 'persona', entidadId: conservada.id, antes: { conservada, absorbida }, despues: { conservada, absorbida_id, fusionada_en_id }, motivo })`, con los detalles sin contactos completos: nombres, documento enmascarado (`****1236`), ids de roles, contactos y direcciones.
  7. Publica `persona.fusionada`.
  Devuelve el detalle de la conservada. Todo o nada.
- Las ediciones existentes (`modificarPersona`, `AsignarRol`, consentimientos) rechazan una absorbida con `PersonaYaFusionadaError` (409, con `conservadaId`).
- `RegistrarPersona` con el documento de una absorbida: `PersonaDuplicadaError(conservadaId)`.
- `ObtenerPersona` y `ServicioPersonas.buscarPorDocumento` resuelven el alias (un salto: los alias se re-apuntan al fusionar).
- `ConsultarConsentimientos` de la conservada: vigentes solo de la conservada; el historial suma las decisiones de sus alias, marcadas con `persona_id` de origen.

### HTTP (`interface/duplicados.controller.ts`, `fusiones.controller.ts`, DTO y OpenAPI)

| Método y ruta | Permiso | Respuesta |
| --- | --- | --- |
| `GET /v1/personas/duplicados?pagina=&tamano=` | `plat.persona.leer` | 200 `{ items: [{ persona_a, persona_b, puntaje, motivos }], total, pagina, tamano }` |
| `GET /v1/personas/duplicados/{a}/{b}` | `plat.persona.leer` | 200 `{ persona_a, persona_b, puntaje, motivos, descartado, bloqueo }` con las dos fichas completas (`PersonaDetalleDto`, con `version`) |
| `POST /v1/personas/duplicados/descartes` | `plat.persona.fusionar` | 204. Cuerpo `{ persona_a_id, persona_b_id }` |
| `DELETE /v1/personas/duplicados/descartes/{a}/{b}` | `plat.persona.fusionar` | 204; 404 `DESCARTE_NO_ENCONTRADO` si no estaba |
| `POST /v1/personas/fusiones` | `plat.persona.fusionar` (sensible, aal2) | 201 persona conservada |

- Cuerpo de `POST /v1/personas/fusiones`:
  ```json
  {
    "persona_conservada_id": "uuid", "persona_absorbida_id": "uuid",
    "version_conservada": 3, "version_absorbida": 1,
    "campos_elegidos": {
      "datos_basicos": { "nombres": "CONSERVADA", "apellido_materno": "ABSORBIDA" },
      "principales": { "CELULAR": "uuid-contacto", "CORREO": "uuid-contacto", "DIRECCION": "uuid-direccion" }
    },
    "motivo": "Misma clienta registrada con pasaporte"
  }
  ```
- `GET /v1/personas/{id}` de una absorbida: 200 con la conservada y `resuelta_desde`. `PATCH`, contactos, direcciones, roles y consentimientos sobre una absorbida: 409 `PERSONA_FUSIONADA` con `persona_conservada_id`.
- El listado `GET /v1/personas` (38) excluye las absorbidas.
- Errores: 404 `NO_ENCONTRADA`, 409 y 422 de la tabla de bloqueos, 409 `VERSION_OBSOLETA`, 401 step-up sin aal2. OpenAPI completo bajo `/v1`.

### Eventos

| Evento | Payload |
| --- | --- |
| `persona.fusionada` | `{ persona_conservada_id, persona_absorbida_id, fusion_id }` |

En el SRS. `schema_version` 1, `additionalProperties: false`, sin nombres, documento ni contactos. Los consumidores reasignan sus referencias de la absorbida a la conservada y deben ser idempotentes por `event_id` (TR-RN-034). No se agrega a `EVENTOS_AUDITADOS`: la fusión ya se audita en la transacción.

### SQL crudo (regla 11)

`ConsultaDuplicadosTypeOrm` usa una consulta SQL encapsulada en un método del adaptador: autounión de `per.persona` con `per.contacto`, `extensions.similarity` y comparación de conjuntos de palabras (`string_to_array ... <@`), que el `QueryBuilder` no expresa bien. Parámetros con nombre; sin concatenar valores. El resto de la persistencia (fusión, descartes, movimientos) usa `getRepository` y `QueryBuilder` sobre el `EntityManager` de la transacción.

### Composición

- `PersonasModule.register`: casos de uso, los dos controladores, `ConsultaDuplicadosTypeOrm` y `RepositorioFusionesTypeOrm`.
- `src/index.ts`: `PersonaFusionada`, `EVENTOS_PER.fusionada`, errores nuevos y `MOTIVOS_DUPLICADO`, por ruta explícita.
- `ENTIDADES_PER` suma `FusionEntidad` y `ParDescartadoEntidad`; `PersonaEntidad` suma `fusionadaEnId` y `fusionadaEn`.
- `plat.manifiesto.json`: `plat.persona.fusionar` («Descartar duplicados y fusionar personas del tenant»), alcance `TENANT`, `sensible: true`, sin rol predefinido. Sube a la siguiente versión menor libre al implementar (1.28.0 si nadie la tomó); se actualizan las pruebas que fijan la versión.
- Consumidor de prueba en `libs/plataforma/personas/test/`: `@SuscribirEvento('persona.fusionada')` que reasigna en una tabla en memoria las «citas» de la absorbida a la conservada y guarda los `event_id` vistos.

## Plan de implementación

1. **Migración.** `db/01l_per_fusion.sql`, inverso y prueba SQL: CHECK de alias (completo, no propio, inactiva), `uq_fusion_absorbida`, orden del par descartado, RLS con dos `app.tenant_id`, `per.fusion` sin `UPDATE` ni `DELETE`, inverso que se niega con fusiones. Ida y vuelta en `tools/migrar/test/db-esquemas.test.mjs`.
2. **Dominio.** `duplicados.ts`, `fusion.ts`, `Persona.absorber` y `marcarFusionada`, errores, evento y permiso, con pruebas: bloqueos, campos elegidos, roles con `desde` más antiguo, contactos y direcciones sin duplicar, un principal por tipo, celular principal obligatorio, persona marcada que rechaza cambios.
3. **Consulta de duplicados.** `ConsultaDuplicadosTypeOrm` con las tres reglas, exclusiones (inactivas, bloqueadas, descartadas, otro tipo de persona, otro tenant) y paginado. Integración contra base temporal (PGlite) con los datos de TR-CA-107 y 108.
4. **Fusión y alias.** `RepositorioPersonasTypeOrm` (movimientos y alias), `RepositorioFusionesTypeOrm`, `FusionarPersonas`, `DescartarPar`, `QuitarDescarte`, `CompararPar`; resolución de alias en `ObtenerPersona`, `buscarPorDocumento`, `RegistrarPersona`, listado y consentimientos; rechazo de escrituras sobre absorbidas. Integración: fusión todo o nada, re-apuntar alias, auditoría con antes/después, evento con esquema, consumidor de prueba idempotente.
5. **HTTP y composición.** Controladores, DTO, OpenAPI, `PersonasModule`, manifiesto. Prueba e2e de las cinco rutas, incluido 401 step-up sin aal2.
6. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` en Supabase dev; `npx nx run-many -t lint test -p personas api auditoria seguridad migrar`.

## Criterios de aceptación

- [ ] TR-CA-107 (adaptado, documento obligatorio): «Juana Quispe Mamani» DNI 45781236 y «Juana Quispe» PASAPORTE con el mismo celular 987654321 aparecen como par con puntaje 60 y motivo `CELULAR_Y_NOMBRE_PARECIDO`; al fusionar conservando la del DNI queda una ficha activa con los roles, contactos y direcciones de ambas, la otra inactiva con `fusionada_en_id`, y el consumidor de prueba deja las citas de ambas bajo la conservada.
- [ ] TR-CA-108: fusionar DNI 45781236 con DNI 45781237 → 409 `DOCUMENTOS_DISTINTOS` «Las personas tienen documentos distintos»; el par no aparece en la lista; no cambia nada.
- [ ] Mismo número con distinto tipo → par con puntaje 100 y motivo `MISMO_NUMERO_OTRO_TIPO`; mismo celular y nombre normalizado igual → 80.
- [ ] La lista excluye personas inactivas o fusionadas, pares NATURAL-JURIDICA, pares descartados y pares de otro tenant; viene ordenada por puntaje y paginada con `total`.
- [ ] Descartar un par lo saca de la lista (también pedido como `(b, a)`); descartar dos veces responde 204; quitar el descarte lo devuelve; quitar uno inexistente → 404 `DESCARTE_NO_ENCONTRADO`. Descartar y quitar quedan auditados.
- [ ] `GET /v1/personas/duplicados/{a}/{b}` devuelve las dos fichas con `version`, puntaje, motivos, `descartado` y `bloqueo` (código o nulo), aunque el par esté descartado o bloqueado.
- [ ] Fusionar consigo misma → 422 `MISMA_PERSONA`; NATURAL con JURIDICA → 409 `TIPO_PERSONA_DISTINTO`; con una absorbida (como conservada o absorbida) → 409 `PERSONA_FUSIONADA`; motivo de menos de 5 o más de 300 caracteres → 422 `MOTIVO_INVALIDO`; principal que no es de ninguna de las dos → 422 `CAMPO_ELEGIDO_INVALIDO`; versión distinta → 409 `VERSION_OBSOLETA`. En todos los casos no se guarda nada.
- [ ] Datos básicos: cada campo toma el origen elegido; uno no elegido queda como en la conservada. El documento de la conservada no cambia.
- [ ] Roles iguales en producto y rol no se duplican y la conservada queda con el `desde` más antiguo; contactos de igual tipo y valor y direcciones de igual texto y ubigeo no se duplican; queda un principal por tipo y una dirección principal según `principales`, y siempre un celular principal.
- [ ] Los consentimientos de la absorbida siguen en ella sin cambios; el historial de consentimientos de la conservada los incluye con su `persona_id` de origen; los vigentes de la conservada no cambian.
- [ ] `GET /v1/personas/{absorbida}` devuelve la conservada con `resuelta_desde`; `PersonaPort.buscarPorDocumento` con el documento de la absorbida devuelve la conservada; registrar ese documento → 409 `PERSONA_DUPLICADA` con el id de la conservada; editar, agregar contactos o direcciones, asignar rol o consentir sobre la absorbida → 409 `PERSONA_FUSIONADA`; el listado y la búsqueda no la muestran.
- [ ] Si A se fusionó en B y luego B en C, A y B apuntan a C, y leer A devuelve C.
- [ ] Una fila en `per.fusion` por fusión con `campos_elegidos`, `motivo`, `fusionado_por` y `fusionado_en`; una segunda fusión de la misma absorbida falla por `uq_fusion_absorbida`.
- [ ] La fusión deja fila en `aud` con acción `plat.persona.fusionar`, `antes` (las dos fichas), `despues` y motivo, sin contactos completos ni el número de documento sin enmascarar.
- [ ] `persona.fusionada` se publica en la misma transacción con su esquema y sin datos personales; el consumidor de prueba procesa dos veces el mismo `event_id` sin duplicar la reasignación.
- [ ] Un fallo a mitad de la fusión (forzado en la prueba de integración) no deja filas movidas, alias, `per.fusion`, auditoría ni evento.
- [ ] Aislamiento: personas del tenant B pedidas desde A → 404 en comparar, descartar y fusionar; la prueba SQL con dos `app.tenant_id` no ve fusiones ni descartes ajenos.
- [ ] Sin `plat.persona.leer` → 403 en lista y comparación; sin `plat.persona.fusionar` → 403 en descartes y fusión; con el permiso pero sin aal2 → 401 step-up en `POST /v1/personas/fusiones`. Rutas en OpenAPI bajo `/v1`.
- [ ] `plat.persona.fusionar` está en el manifiesto con alcance `TENANT`, `sensible: true`, sin rol predefinido.
- [ ] Ningún log de PER contiene nombres, documentos ni contactos (TR-RNF-026).
- [ ] Migración `01l_per_fusion` reversible y probada en CI contra PostgreSQL 16, con el inverso que se niega si hay fusiones.
- [ ] Cobertura de dominio de `personas` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM salvo la consulta de candidatos, encapsulada y justificada.
- [ ] `npx nx run-many -t lint test -p personas api auditoria seguridad migrar` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** el documento sigue obligatorio. Decisión del usuario. TR-CA-107 se prueba con DNI y PASAPORTE en vez de una ficha sin documento.
- **No:** persona sin documento en este spec. Decisión del usuario. Cambia el registro del 31 y la UI del 38.
- **Sí:** candidatos al vuelo con reglas fijas y explicables (100, 80, 60) sobre las columnas de búsqueda del 38. Decisión del usuario.
- **Sí:** la regla 60 suma «todas las palabras del nombre más corto están en el otro». Sin ella, TR-CA-107 («Juana Quispe Mamani» frente a «Juana Quispe») queda bajo `similarity` 0,8 y el par no aparece. Ajuste al redactar sobre lo acordado (umbral 0,8 sin cambiar).
- **No:** tabla precalculada ni tarea en el worker. Decisión del usuario. Se agrega si la consulta mide lenta en un tenant real.
- **Sí:** SQL crudo encapsulado para la consulta de candidatos (autounión, `similarity`, conjuntos de palabras). Regla 11: agregación compleja que el `QueryBuilder` no expresa bien.
- **Sí:** los pares bloqueados no se proponen. Un par que no se puede fusionar solo llena la lista; la comparación sí informa el bloqueo.
- **Sí:** `per.par_descartado` con par ordenado y quitar descarte. Decisión del usuario.
- **Sí:** `plat.persona.fusionar` sensible (aal2) para fusionar y descartar; consultar con `plat.persona.leer`. Decisión del usuario. Es irreversible y toca datos personales.
- **Sí:** bloquea mismo tipo de documento con distinto número, NATURAL con JURIDICA, misma ficha y fichas ya fusionadas. Decisión del usuario. DNI con PASAPORTE sí se fusiona.
- **Sí:** roles, contactos y direcciones se mueven a la conservada sin duplicar; los duplicados quedan en la absorbida. Decisión del usuario. Roles y personas no admiten `DELETE` (spec 31) y lo que queda en la absorbida es historial.
- **Sí:** los consentimientos se quedan en la absorbida y se leen en el historial de la conservada. Decisión del usuario. El trigger del 37 no deja mover `persona_id` y la Ley 29733 no permite inferir consentimiento.
- **Sí:** `campos_elegidos` cubre datos básicos campo por campo y el principal de cada tipo; el documento es siempre el de la conservada. Decisión del usuario. El único por documento impide moverlo.
- **Sí:** la absorbida queda inactiva con `fusionada_en_id`; lecturas resuelven a la conservada y escrituras se rechazan con 409. Decisión del usuario.
- **Sí:** al absorber una conservada, sus alias se re-apuntan en la misma transacción. La resolución es de un salto y no hay cadenas.
- **Sí:** bloqueo optimista con la versión de las dos fichas. Una ficha editada mientras el administrador comparaba cambiaría lo que eligió.
- **Sí:** `per.fusion` como registro histórico de solo inserción, además de la auditoría. Da `fusion_id` al evento y la consulta de alias sin leer `aud`.
- **Sí:** auditoría con `AuditoriaPort` en la transacción, no por consumidor de AUD. TR-RNF-013 pide antes y después, que el evento no lleva.
- **No:** que TR-NOT consuma `persona.fusionada`. Decisión del usuario. Los mensajes son historial de envíos.
- **Sí:** TR-CA-107 se prueba con un consumidor de prueba en `test/`. El consumidor real es SazónPOS (CC-06).
- **No:** `GET` del historial de fusiones. Decisión del usuario. Se ve en el visor de auditoría.
- **Sí:** un spec de 9-10 h, por encima de las 7 h del roadmap. Decisión del usuario. Si se pasa, el `DELETE` del descarte va al 40.
- **Sí:** migración `01l_per_fusion` (letra `l` de PER, tras `01l_per_contactos.sql`). El paquete proponía `01j`, que ya es de IDN.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La autounión es lenta en un tenant con muchas personas | Solo pares que comparten documento o celular (índices `ix_persona_documento_prefijo` e `ix_contacto_valor_prefijo`); la similitud se calcula solo sobre esos. Se mide en la prueba de integración con 10 000 personas; si pasa de TR-RNF-001 se abre spec de tabla precalculada. |
| Un consumidor de producto falla al reasignar | Reintentos y cola de fallidos del relay (spec 11); mientras tanto el alias resuelve lecturas por id y documento. |
| Fusión equivocada sin vuelta atrás | aal2, motivo, comparación previa con versiones, auditoría con antes y después y `per.fusion` para reconstruir a mano. |
| Familias que comparten celular aparecen como duplicados | Puntaje 60 y descarte persistente; los de distinto DNI no se proponen. |
| Escrituras concurrentes sobre las dos fichas | `WHERE version` en las dos; la segunda responde 409 `VERSION_OBSOLETA`. |

## Lo que **no** entra en este spec

- UI de duplicados y fusión (spec 40).
- Reasignación en SazónPOS (CC-06) y en TR-NOT.
- Persona sin documento, cambiar el documento al fusionar, deshacer una fusión.
- Tabla precalculada de candidatos, IA o fonética avanzada.
- Historial de fusiones por API y roles predefinidos con `plat.persona.fusionar`.

Cada uno, si llega, va en su propio spec.
