# SPEC 37 — Personas: consentimientos por finalidad con textos versionados, revocación y evidencia

> **Status:** Aprobado
> **Depends on:** SPEC 31, SPEC 33, SPEC 20a, SPEC 11
> **Date:** 2026-11-20
> **Objective:** Ampliar `libs/plataforma/personas` para publicar textos versionados por finalidad, registrar la decisión expresa de la persona en cada finalidad (con versión, canal y evidencia opcional validada en TR-ARC), revocarla con `consentimiento.revocado` por outbox y responder a otros componentes si hay consentimiento vigente.

## Por qué existe este spec

Fila 37 de `docs/roadmap-specs.md` (R2-01, TR-RF-043). Contexto: `docs/spec-context/tr-per/per-consentimientos.md`, partición A. Cubre TR-CA-109, 110 y 111 y los criterios que el contexto propone en su sec. 3.

El roadmap da 7 h. Con la tabla de textos y su API (el SRS la pone de precondición sin RF), la validación de la evidencia contra ARC y el puerto para TR-NOT, el estimado es 8-9 h. Si se pasa de 10 h se recorta la API de lectura de historial (`?historial=true`), que pasa al spec de UI.

Lo que hay en el código hoy (revisado al redactar):

- `db/01l_per.sql` y `db/01l_per_contactos.sql`: esquema `per` con `persona`, `persona_rol`, `contacto` y `direccion`. RLS `ENABLE + FORCE` con `NULLIF(current_setting('app.tenant_id', true), '')::uuid`, `REVOKE` a `anon` y `authenticated` si existen, privilegios al `current_user` que migra.
- `libs/plataforma/personas`: agregado `Persona` (roles, contactos, direcciones), `PersonaPort`, `PERMISOS_PER` (`leer`, `registrar`, `rol`, `editar`), `EVENTOS_PER` (`persona.registrada`, `persona.rol_asignado`, `persona.actualizada`), `DependenciasPersonas` y `PersonasModule.register({ imports })`. No hay nada de consentimientos.
- `libs/plataforma/archivos` (specs 33 y 35): `ArchivoPort.estado(archivoId)` devuelve `estado` y `categoria`; `ArchivoNoEncontradoError` para un archivo de otro tenant. Categoría `EVIDENCIA` sembrada (PDF, JPEG, PNG; 25 MB; sensible).
- `libs/plataforma/auditoria`: `AUDITORIA` / `AuditoriaPort.registrar({ accion, entidadTipo, entidadId, antes, despues, motivo })`, que exige `UnitOfWork.run` activo; `EVENTOS_AUDITADOS` y `AuditoriaConsumidor` con un método `@SuscribirEvento` por tipo.
- `eslint.config.mjs`: `comp('per', 'kernel', 'seg', 'org', 'cat', 'idn')`. PER no puede importar `comp:arc` ni `comp:aud` todavía.
- `plat.manifiesto.json` en 1.23.0.

## Alcance

**Entra:**

- TR-RF-043: registrar en lote las decisiones de una persona (una por finalidad), con `decision` ACEPTA o RECHAZA explícita, `accion_expresa: true`, `version_texto` igual a la vigente, `canal`, usuario y fecha.
- Textos por finalidad y por tenant en `per.texto_finalidad`, publicados por API con el permiso nuevo `plat.persona.texto_finalidad`. Sin siembra: una finalidad sin texto publicado no se puede registrar.
- Revocación: marca `revocado_en`, `revocado_por` y `canal_revocacion` en la fila vigente, publica `consentimiento.revocado` por outbox y queda auditada por evento.
- Evidencia opcional (`evidencia_archivo_id`) validada con `ArchivoPort.estado`: del tenant, `DISPONIBLE` y de categoría `EVIDENCIA`.
- Lectura de los consentimientos vigentes por finalidad y del historial de una persona.
- `ConsentimientoPort` para consumidores en proceso: `vigente`, `textosVigentes`, `registrar` y `revocar`.
- Migración `db/01l_per_consentimientos.sql` con inverso y prueba SQL.
- Permisos `plat.persona.consentimiento` y `plat.persona.texto_finalidad` en el manifiesto.
- Matriz de límites: `comp('per', ..., 'arc', 'aud')`.

**No entra (specs futuros):**

- UI de textos por finalidad y tabla de decisiones en la ficha de persona → `per-textos-finalidad-ui` (opcional, sin número) y spec 38.
- Revocación desde el portal del titular (TR-RF-129) → spec 92.
- Efecto en campañas (TR-RN-025: no enviar promociones sin consentimiento vigente) → TR-NOT, specs 45 y 46, que consultan `ConsentimientoPort.vigente`.
- ARCO e incidentes (TR-RF-088 a 091) → specs 63 a 68.
- Uso real de `IDENTIDAD_PORTABLE` (R4) y de `DATOS_SALUD` en productos clínicos (R3): las finalidades existen, sin reglas extra.
- Programar la vigencia futura de un texto: un texto publicado es vigente desde que se publica.
- Evento `consentimiento.registrado`.
- Asignar los permisos nuevos a roles predefinidos.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `libs/plataforma/personas` (`RepositorioPersonas.obtener`, `PersonaNoEncontradaError`) | Se usa para exigir que la persona exista en el tenant. El agregado `Persona` no cambia. |
| `DependenciasPersonas`, `PersonasModule.register` | Ganan `auditoria` (`AUDITORIA`) y `archivos` (`ARCHIVO_PORT`); `PersonasOpciones.imports` debe traer `ArchivosModule`. |
| `interface/esquemas.ts`, `personas.http.ts` | Patrón de validación con zod y de mapeo de errores para las rutas nuevas. |
| `infrastructure/event-schemas.ts` (`registrarEsquemasPer`) | Esquema de `consentimiento.revocado`. |
| `auditoria` (`EVENTOS_AUDITADOS`, `AuditoriaConsumidor`) | `consentimiento.revocado` y su método. |
| `archivos` (`ARCHIVO_PORT`, `ArchivoNoEncontradoError`) | Validación de la evidencia. |

## Modelo de datos

### Migración `db/01l_per_consentimientos.sql` (+ `db/rollback/01l_per_consentimientos.sql`, `db/tests/01l_per_consentimientos.test.sql`)

```sql
CREATE TABLE per.texto_finalidad (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  finalidad      varchar(24) NOT NULL CHECK (finalidad IN
                   ('PRESTACION','PROMOCIONES','COMPARTIR_PRODUCTOS','DATOS_SALUD','IDENTIDAD_PORTABLE')),
  version        varchar(20) NOT NULL CHECK (version ~ '^[A-Za-z0-9._-]{1,20}$'),
  texto          text NOT NULL CHECK (char_length(texto) BETWEEN 20 AND 10000),
  publicado_por  uuid NOT NULL,
  publicado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_texto_finalidad_version UNIQUE (tenant_id, finalidad, version)
);
CREATE INDEX ix_texto_finalidad_vigente ON per.texto_finalidad (tenant_id, finalidad, publicado_en DESC);

CREATE TABLE per.consentimiento (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  persona_id            uuid NOT NULL REFERENCES per.persona(id),
  finalidad             varchar(24) NOT NULL,          -- mismo CHECK que texto_finalidad
  decision              varchar(8)  NOT NULL CHECK (decision IN ('ACEPTA','RECHAZA')),
  version_texto         varchar(20) NOT NULL,
  canal                 varchar(10) NOT NULL CHECK (canal IN ('PRESENCIAL','WEB','WHATSAPP','KIOSCO')),
  accion_expresa        boolean NOT NULL CHECK (accion_expresa),
  evidencia_archivo_id  uuid,                          -- sin FK a arc (TR-RNF-119)
  registrado_por        uuid NOT NULL,
  registrado_en         timestamptz NOT NULL DEFAULT now(),
  revocado_en           timestamptz,
  revocado_por          uuid,
  canal_revocacion      varchar(10) CHECK (canal_revocacion IN ('PRESENCIAL','WEB','WHATSAPP','KIOSCO')),
  CONSTRAINT fk_consentimiento_texto FOREIGN KEY (tenant_id, finalidad, version_texto)
    REFERENCES per.texto_finalidad (tenant_id, finalidad, version),
  CONSTRAINT ck_consentimiento_revocacion CHECK (
    (revocado_en IS NULL) = (revocado_por IS NULL) AND (revocado_en IS NULL) = (canal_revocacion IS NULL)),
  CONSTRAINT ck_consentimiento_revoca_acepta CHECK (revocado_en IS NULL OR decision = 'ACEPTA')
);
CREATE INDEX ix_consentimiento_persona ON per.consentimiento (persona_id, finalidad, registrado_en DESC);
CREATE UNIQUE INDEX ux_consentimiento_aceptado_vigente ON per.consentimiento (persona_id, finalidad)
  WHERE decision = 'ACEPTA' AND revocado_en IS NULL;
```

- RLS `ENABLE + FORCE` en las dos tablas con el filtro de `app.tenant_id` (patrón de `01l_per_contactos.sql`).
- `per.texto_finalidad`: políticas de `SELECT` e `INSERT`. Sin `UPDATE` ni `DELETE`: un texto publicado no cambia.
- `per.consentimiento`: políticas de `SELECT`, `INSERT` y `UPDATE`. Sin `DELETE`. El `UPDATE` solo lo usa la revocación.
- Trigger `per.consentimiento_solo_revocacion` `BEFORE UPDATE`: falla si cambia cualquier columna distinta de `revocado_en`, `revocado_por` y `canal_revocacion`, o si `revocado_en` ya tenía valor. El historial es de solo inserción salvo la marca de revocación.
- `REVOKE ALL ... FROM PUBLIC`; `GRANT` al `current_user` (`SELECT, INSERT` en textos; `SELECT, INSERT, UPDATE` en consentimientos); `REVOKE` a `anon` y `authenticated` si existen.
- `ux_consentimiento_aceptado_vigente`: segunda barrera de «un solo ACEPTA vigente por persona y finalidad».
- `fk_consentimiento_texto`: la versión registrada existe en el tenant.
- Inverso: borra trigger, función, tablas e índices. Se niega si `per.consentimiento` tiene filas: el historial de consentimientos es prueba legal (TR-RNF-016).

### Reglas de vigencia

- Texto vigente de una finalidad: el de mayor `publicado_en` del tenant.
- Decisión vigente de una persona en una finalidad: la de mayor `registrado_en`.
- Consentimiento vigente: la decisión vigente es `ACEPTA` y no tiene `revocado_en`. No depende de que su `version_texto` siga siendo la vigente: `vigente` devuelve la versión aceptada y el producto decide si pide reconsentir.

### Dominio (`libs/plataforma/personas/src/domain/`)

- `consentimiento.ts`:
  - `FINALIDADES = ['PRESTACION','PROMOCIONES','COMPARTIR_PRODUCTOS','DATOS_SALUD','IDENTIDAD_PORTABLE']`, `DECISIONES = ['ACEPTA','RECHAZA']`, `CANALES = ['PRESENCIAL','WEB','WHATSAPP','KIOSCO']` y sus tipos.
  - `Consentimiento` (inmutable salvo revocación): `crear(...)` exige `accionExpresa === true` (`AccionExpresaRequeridaError`); `revocar(usuarioId, canal, ahora)` exige `ACEPTA` sin revocar (`SinConsentimientoVigenteError`).
  - `ConsentimientosDePersona`: decisiones de una persona por finalidad. `registrar(lote, textosVigentes)` valida el lote completo antes de crear nada: finalidad repetida (`FinalidadRepetidaError`), finalidad sin texto (`TextoNoPublicadoError`), versión distinta de la vigente (`VersionTextoNoVigenteError`, lleva la vigente). Un `RECHAZA` sobre un `ACEPTA` vigente revoca ese `ACEPTA` con el mismo canal y fecha. Devuelve las filas nuevas y las revocadas.
- `texto-finalidad.ts`: `TextoFinalidad.publicar({ finalidad, version, texto, publicadoPor })` valida formato de versión y largo del texto (`TextoFinalidadInvalidoError`).
- `errores.ts`: `AccionExpresaRequeridaError` (422 `ACCION_EXPRESA_REQUERIDA`), `FinalidadRepetidaError` (422 `FINALIDAD_REPETIDA`), `TextoNoPublicadoError` (409 `TEXTO_NO_PUBLICADO`), `VersionTextoNoVigenteError` (409 `VERSION_TEXTO_NO_VIGENTE`), `VersionTextoDuplicadaError` (409 `VERSION_TEXTO_DUPLICADA`), `SinConsentimientoVigenteError` (409 `SIN_CONSENTIMIENTO_VIGENTE`), `EvidenciaInvalidaError` (422 `EVIDENCIA_INVALIDA`, lleva `motivo`: `NO_DISPONIBLE` o `CATEGORIA`), `TextoFinalidadInvalidoError` (422 `DATOS_INVALIDOS`).
- `eventos-per.ts`: `EVENTOS_PER.consentimientoRevocado = 'consentimiento.revocado'`; `ConsentimientoRevocado { persona_id, finalidad, version_texto, canal, revocado_en }`. Sin nombres, documento ni texto.
- `permisos-per.ts`: `consentimiento: 'plat.persona.consentimiento'`, `textoFinalidad: 'plat.persona.texto_finalidad'`.

### Puertos (`application/ports/`)

```ts
export const CONSENTIMIENTO_PORT = Symbol('ConsentimientoPort');

export interface ConsentimientoVigente { finalidad: Finalidad; versionTexto: string; canal: Canal; otorgadoEn: Date }
export interface TextoVigente { finalidad: Finalidad; version: string; texto: string; publicadoEn: Date }
export interface DecisionComando { finalidad: Finalidad; decision: Decision; versionTexto: string; accionExpresa: boolean }
export interface RegistrarConsentimientosComando { personaId: string; canal: Canal; evidenciaArchivoId?: string; decisiones: DecisionComando[] }

/** TR-RF-043. Tenant y usuario salen del TenantContext; no evalúa permisos (los evalúa HTTP). */
export interface ConsentimientoPort {
  vigente(personaId: string, finalidad: Finalidad): Promise<ConsentimientoVigente | null>;
  textosVigentes(): Promise<TextoVigente[]>;
  registrar(comando: RegistrarConsentimientosComando): Promise<DecisionRegistrada[]>;
  revocar(personaId: string, finalidad: Finalidad, canal: Canal): Promise<DecisionRegistrada>;
}

export interface RepositorioConsentimientos {
  decisionesDe(personaId: string): Promise<Consentimiento[]>;          // historial, de la más reciente a la más antigua
  guardar(nuevas: Consentimiento[], revocadas: Consentimiento[]): Promise<void>;
  textosVigentes(): Promise<TextoFinalidad[]>;                        // uno por finalidad publicada
  historialTextos(finalidad: Finalidad): Promise<TextoFinalidad[]>;
  publicarTexto(texto: TextoFinalidad): Promise<void>;                 // VersionTextoDuplicadaError por uq
}
```

`DecisionRegistrada` es la vista de una fila: `id`, `finalidad`, `decision`, `versionTexto`, `canal`, `evidenciaArchivoId?`, `registradoPor`, `registradoEn`, `revocadoEn?`, `revocadoPor?`, `canalRevocacion?`.

### Casos de uso (`application/consentimientos/`)

- `RegistrarConsentimientos`: persona del tenant (`PersonaNoEncontradaError`); si hay evidencia, `ArchivoPort.estado` fuera de la transacción (`ArchivoNoEncontradoError` → 404 `EVIDENCIA_NO_ENCONTRADA`; no `DISPONIBLE` o no `EVIDENCIA` → 422 `EVIDENCIA_INVALIDA`); en una transacción lee decisiones y textos vigentes, aplica `ConsentimientosDePersona.registrar`, guarda, audita con `AuditoriaPort.registrar({ accion: 'plat.persona.consentimiento.registrar', entidadTipo: 'persona', entidadId, despues: { canal, evidencia_archivo_id, decisiones: [{ finalidad, decision, version_texto }] } })` y publica `consentimiento.revocado` por cada `ACEPTA` que un `RECHAZA` revocó. Todo o nada.
- `RevocarConsentimiento`: persona del tenant; en una transacción revoca la decisión vigente de esa finalidad y publica `consentimiento.revocado`. La auditoría la deja el consumidor de AUD (`EVENTOS_AUDITADOS`).
- `ConsultarConsentimientos`: vigente por finalidad (las 5, con `null` si no hay decisión) o historial completo.
- `PublicarTextoFinalidad`: en una transacción inserta y audita `plat.persona.texto_finalidad.publicar` (`despues`: finalidad y versión, sin el texto).
- `ConsultarTextos`: vigentes, o historial de una finalidad.
- `ServicioConsentimientos` implementa `ConsentimientoPort` sobre los casos de uso.

### HTTP (`interface/consentimientos.controller.ts`, `textos-finalidad.controller.ts`, DTO y OpenAPI)

| Método y ruta | Permiso | Respuesta |
| --- | --- | --- |
| `GET /v1/personas/{id}/consentimientos?historial=` | `plat.persona.leer` | 200 `{ persona_id, vigentes: [...] }` o `{ persona_id, historial: [...] }` |
| `POST /v1/personas/{id}/consentimientos` | `plat.persona.consentimiento` | 201 `{ persona_id, decisiones: [...] }` |
| `POST /v1/personas/{id}/consentimientos/{finalidad}/revocar` | `plat.persona.consentimiento` | 200 decisión revocada |
| `GET /v1/consentimientos/textos?finalidad=` | `plat.persona.leer` | 200 vigentes (sin `finalidad`) o historial de esa finalidad |
| `POST /v1/consentimientos/textos` | `plat.persona.texto_finalidad` | 201 texto publicado |

- Cuerpo de `POST .../consentimientos`: `{ canal, evidencia_archivo_id?, decisiones: [{ finalidad, decision, version_texto, accion_expresa }] }`, de 1 a 5 decisiones. `decision` sin valor por defecto: si falta → 422 `DATOS_INVALIDOS`; `accion_expresa` ausente o `false` → 422 `ACCION_EXPRESA_REQUERIDA`.
- Cuerpo de `POST .../revocar`: `{ canal }`.
- Cuerpo de `POST /v1/consentimientos/textos`: `{ finalidad, version, texto }`.
- Errores: 404 `NO_ENCONTRADA` (persona de otro tenant o inexistente, `PersonaNoEncontradaError`), 404 `EVIDENCIA_NO_ENCONTRADA`, 422 y 409 de la lista de dominio. OpenAPI completo bajo `/v1`.

### Eventos

| Evento | Payload |
| --- | --- |
| `consentimiento.revocado` | `{ persona_id, finalidad, version_texto, canal, revocado_en }` |

En el SRS. `VERSION_ESQUEMA_PER = 1`, agregado `persona` (el `aggregate_id` es la persona). Se agrega a `EVENTOS_AUDITADOS` con el método `consentimientoRevocado` en `AuditoriaConsumidor`.

### Composición

- `eslint.config.mjs`: `comp('per', 'kernel', 'seg', 'org', 'cat', 'idn', 'arc', 'aud')`; prueba nueva en `tools/boundaries-test`.
- `PersonasModule.register`: casos de uso nuevos, los dos controladores, `CONSENTIMIENTO_PORT` exportado. `apps/api` pasa `ArchivosModule` en `imports`.
- `src/index.ts`: `CONSENTIMIENTO_PORT`, `ConsentimientoPort` y sus tipos, `FINALIDADES`, `DECISIONES`, `CANALES`, errores nuevos y `ConsentimientoRevocado`, por ruta explícita.
- `ENTIDADES_PER` suma las entidades TypeORM de `per.texto_finalidad` y `per.consentimiento`.
- `plat.manifiesto.json`: `plat.persona.consentimiento` («Registrar y revocar consentimientos de una persona») y `plat.persona.texto_finalidad` («Publicar textos de consentimiento por finalidad»), alcance `TENANT`, no sensibles, sin rol predefinido. Sube a la siguiente versión menor libre al implementar (1.24.0 si nadie la tomó); se actualizan las pruebas que fijan la versión.

## Plan de implementación

1. **Migración.** `db/01l_per_consentimientos.sql`, inverso y prueba SQL: CHECK de finalidad, decisión, canal y `accion_expresa`; FK al texto; `ux_consentimiento_aceptado_vigente`; trigger de solo revocación (cambiar `decision` falla, revocar dos veces falla); RLS con dos `app.tenant_id`; inverso que se niega con filas. Ida y vuelta en `tools/migrar/test/db-esquemas.test.mjs`.
2. **Dominio.** `Consentimiento`, `ConsentimientosDePersona`, `TextoFinalidad`, errores, evento y permisos, con pruebas (lote todo o nada, `RECHAZA` que revoca, vigencia independiente de la versión del texto).
3. **Persistencia.** Entidades TypeORM, mapeo y `RepositorioConsentimientosTypeOrm` con `getRepository` sobre el `EntityManager` de la transacción. Integración contra base temporal: aislamiento, `uq_texto_finalidad_version`, `ux_consentimiento_aceptado_vigente`.
4. **Casos de uso y puerto.** Los cinco casos de uso, `ServicioConsentimientos`, validación de evidencia con `ArchivoPort` doble en pruebas, auditoría con `AuditoriaPort` doble, esquema del evento.
5. **HTTP y composición.** Controladores, DTO, OpenAPI, matriz de límites, `PersonasModule`, `apps/api`, manifiesto, `EVENTOS_AUDITADOS`. Prueba e2e de las cinco rutas.
6. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` en Supabase dev; `npx nx run-many -t lint test -p personas api auditoria seguridad archivos migrar boundaries-test`.

## Criterios de aceptación

- [ ] TR-CA-109: con texto `PROMOCIONES` versión `2026-03` y `PRESTACION` publicados, un lote con `PRESTACION` ACEPTA y `PROMOCIONES` RECHAZA crea dos filas con versión, canal, `registrado_por` y `registrado_en`; `GET .../consentimientos` muestra `PRESTACION` vigente y `PROMOCIONES` rechazada.
- [ ] TR-CA-110 (por API, el portal es el spec 92): revocar `PROMOCIONES` aceptado marca `revocado_en`, `revocado_por` y `canal_revocacion`, publica `consentimiento.revocado` con su esquema, deja fila en `aud` y `ConsentimientoPort.vigente` devuelve `null`.
- [ ] TR-CA-111: una decisión con `accion_expresa` ausente o `false` → 422 `ACCION_EXPRESA_REQUERIDA` y no se guarda ninguna decisión del lote; una decisión sin `decision` → 422 `DATOS_INVALIDOS`.
- [ ] `version_texto` distinta de la vigente → 409 `VERSION_TEXTO_NO_VIGENTE` con la versión vigente; finalidad sin texto publicado → 409 `TEXTO_NO_PUBLICADO`; finalidad repetida en el lote → 422 `FINALIDAD_REPETIDA`. En los tres casos no se guarda nada.
- [ ] Publicar una versión nueva del texto no cambia `vigente`: devuelve la versión aceptada antes.
- [ ] Un `RECHAZA` sobre un `ACEPTA` vigente deja la fila anterior revocada (no borrada), inserta la nueva y publica `consentimiento.revocado`.
- [ ] Revocar una finalidad sin `ACEPTA` vigente → 409 `SIN_CONSENTIMIENTO_VIGENTE`.
- [ ] El historial conserva todas las decisiones; un `UPDATE` directo que cambie `decision` o revoque dos veces falla por el trigger; no hay `DELETE`.
- [ ] Evidencia de otro tenant o inexistente → 404 `EVIDENCIA_NO_ENCONTRADA`; en `EN_ANALISIS` o `CUARENTENA` → 422 `EVIDENCIA_INVALIDA` motivo `NO_DISPONIBLE`; de categoría distinta de `EVIDENCIA` → 422 motivo `CATEGORIA`; válida → queda en `evidencia_archivo_id`.
- [ ] Publicar un texto con versión repetida → 409 `VERSION_TEXTO_DUPLICADA`; `GET /v1/consentimientos/textos` devuelve uno por finalidad publicada, el más reciente.
- [ ] Registrar y publicar texto dejan fila en `aud` con las acciones `plat.persona.consentimiento.registrar` y `plat.persona.texto_finalidad.publicar`, sin el texto completo.
- [ ] Aislamiento: persona del tenant B pedida desde A → 404 en las rutas de persona; los textos de B no se ven desde A; la prueba SQL con dos `app.tenant_id` no ve filas ajenas.
- [ ] Sin `plat.persona.consentimiento` → 403 al registrar y revocar; sin `plat.persona.texto_finalidad` → 403 al publicar; sin `plat.persona.leer` → 403 al consultar. Rutas en OpenAPI bajo `/v1`.
- [ ] `consentimiento.revocado` no lleva nombres, documento, contactos ni texto; ningún log de PER los contiene (TR-RNF-026).
- [ ] `plat.persona.consentimiento` y `plat.persona.texto_finalidad` están en el manifiesto con alcance `TENANT`, no sensibles, sin rol predefinido.
- [ ] `personas` importa `@vitrina/plataforma/archivos` y `@vitrina/plataforma/auditoria` sin error de límites; la prueba de `tools/boundaries-test` lo cubre.
- [ ] Migración `01l_per_consentimientos` reversible y probada en CI contra PostgreSQL 16, con el inverso que se niega si hay consentimientos.
- [ ] Cobertura de dominio de `personas` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM sin SQL crudo.
- [ ] `npx nx run-many -t lint test -p personas api auditoria seguridad archivos migrar boundaries-test` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** textos en `per.texto_finalidad` por tenant, publicados por API con `plat.persona.texto_finalidad`. Decisión del usuario. El SRS los pone de precondición sin RF.
- **No:** textos globales sembrados con precedencia del tenant, ni textos como parámetros de CFG. Decisión del usuario.
- **Sí:** sin siembra. Un tenant que no publicó el texto de una finalidad no puede registrarla: el texto legal es del responsable del tratamiento, no de la plataforma.
- **Sí:** el texto vigente es el último publicado; no hay vigencia futura. Programar vigencias no la pide ninguna fuente.
- **Sí:** un texto publicado no se edita ni se borra. Una corrección es una versión nueva.
- **Sí:** un consentimiento aceptado sigue vigente aunque se publique otra versión del texto. Decisión del usuario. `vigente` devuelve la versión aceptada para que el producto decida si pide reconsentir.
- **No:** caducar los consentimientos con cada texto nuevo. Decisión del usuario.
- **Sí:** revocar marca `revocado_en`, `revocado_por` y `canal_revocacion` en la fila vigente. Decisión del usuario. El RF dice «marca la fecha».
- **No:** fila nueva con decisión `REVOCA`. Decisión del usuario.
- **Sí:** un `RECHAZA` sobre un `ACEPTA` vigente revoca ese `ACEPTA` y publica `consentimiento.revocado`. Si no, TR-NOT vería un rechazo sin evento y la revocación dependería de qué ruta usó el producto.
- **Sí:** cada decisión trae `decision` explícita y `accion_expresa: true`, guardado en la fila; si no → 422. Decisión del usuario. La garantía final de que hubo una acción del titular es del front del producto; la API rechaza lo que llega sin ella.
- **Sí:** el lote es todo o nada. Un lote a medias dejaría finalidades sin decisión sin que el operador lo note.
- **Sí:** la evidencia se valida con `ArchivoPort.estado`: del tenant, `DISPONIBLE` y `EVIDENCIA`. Decisión del usuario. No se exige que la entidad del archivo sea la persona.
- **No:** guardar la evidencia como uuid sin validar. Decisión del usuario.
- **Sí:** `evidencia_archivo_id` sin FK a `arc`. Los esquemas de componentes no se cruzan (TR-RNF-119).
- **Sí:** solo `consentimiento.revocado`, en el SRS. Decisión del usuario. Registrar se audita con `AuditoriaPort` en la transacción; revocar, por evento con el consumidor de AUD.
- **No:** `consentimiento.registrado`. Decisión del usuario. No hay consumidor; TR-NOT consulta `ConsentimientoPort.vigente` al enviar.
- **Sí:** `plat.persona.consentimiento` para registrar y revocar, `plat.persona.leer` para consultar y `plat.persona.texto_finalidad` para publicar. Ninguno exige aal2. Decisión del usuario.
- **Sí:** consentimientos fuera del agregado `Persona`, con su repositorio. T-05 los dibuja dentro, pero cargarlos con cada edición de contactos y subir la `version` de la persona al consentir acopla dos flujos sin regla común. La persona solo se verifica que exista.
- **Sí:** `ux_consentimiento_aceptado_vigente` y el trigger de solo revocación como barreras en la base. El dominio es la primera.
- **Sí:** el inverso de la migración se niega con consentimientos guardados. Son prueba ante la autoridad (TR-RNF-016).
- **Sí:** PER pasa a depender de `comp:arc` y `comp:aud`. PL-10 no los dibuja como predecesores de PER, pero el RF los nombra (TR-ARC para la evidencia, TR-AUD para auditar) y ninguno depende de PER: no hay ciclo.
- **Sí:** `DATOS_SALUD` e `IDENTIDAD_PORTABLE` se aceptan como cualquier finalidad. Sus reglas propias (acceso sensible, identidad portable) llegan con sus productos y specs.
- **Sí:** migración `01l_per_consentimientos` (letra `l` de PER, después de `01l_per_contactos.sql`).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un front de producto marca `accion_expresa: true` sin acción real del titular | Se documenta en OpenAPI y en el puerto que la casilla no puede venir marcada; el componente de UI de consentimientos lo garantiza cuando exista. |
| Dos registros simultáneos de la misma finalidad | `ux_consentimiento_aceptado_vigente` rechaza el segundo `ACEPTA`; la API responde 409 `conflict` y el cliente reintenta. |
| La evidencia se valida fuera de la transacción y cambia de estado después | Un archivo `DISPONIBLE` no vuelve atrás; si se borra por retención (spec 69), el bloqueo legal lo cubre. |
| Un tenant sin textos publicados no puede registrar nada | Error 409 `TEXTO_NO_PUBLICADO` explícito; la UI de textos queda como spec opcional y mientras tanto se publica por API. |

## Lo que **no** entra en este spec

- UI de textos y de decisiones (spec opcional `per-textos-finalidad-ui` y spec 38).
- Revocación desde el portal (spec 92).
- Bloqueo de promociones sin consentimiento en TR-NOT (specs 45 y 46).
- ARCO e incidentes (specs 63 a 68).
- Vigencia programada de textos y evento `consentimiento.registrado`.
- Roles predefinidos con los permisos nuevos.

Cada uno, si llega, va en su propio spec.
