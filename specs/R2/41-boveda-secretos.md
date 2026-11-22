# SPEC 41 — Bóveda de secretos por tenant con cifrado por sobre y rotación sin interrupción

> **Status:** Aprobado
> **Depends on:** SPEC 02, SPEC 20a
> **Date:** 2026-11-20
> **Objective:** Crear `libs/plataforma/secretos` con el puerto `BovedaSecretos`, que guarda, lee, rota y elimina secretos del tenant cifrados con AES-256-GCM bajo una clave de datos por tenant envuelta por una clave maestra versionada que solo vive en el entorno de `apps/api` y `apps/worker`, con las escrituras auditadas y un comando que re-envuelve las claves al rotar la maestra.

## Por qué existe este spec

Fila 41 de `docs/roadmap-specs.md` (TR-RNF-113). Contexto: `docs/spec-context/tr-fe/fe-emisor-y-puerto-pse.md` (P2) y `docs/spec-context/tr-pag/README.md` (fila 0). Lo necesitan FE (credenciales del PSE, certificado `.pfx` y su clave, spec 49), PAG (llaves de la pasarela, spec 73) y NOT (credenciales de canales por tenant). No tiene RF ni historia: es el «gestor de secretos» que piden TR-RNF-011 y TR-RNF-113 y que ninguna pieza cubre hoy.

TR-RNF-113: secretos del tenant cifrados con clave por tenant, rotados sin interrupción, 0 secretos en texto plano en base o repo. El spec 21 solo puso gitleaks en el CI.

El roadmap da 4-5 h. Con el comando de re-envoltura y la auditoría, el estimado es 6 h.

Lo que hay en el código hoy (revisado al redactar):

- No hay cifrado de datos en ninguna lib: `grep` de `createCipheriv`, `aes-256`, `Vault` sin resultados. Los secretos de plataforma (Supabase, Decolecta) van por variables de entorno validadas con zod (`apps/api/src/config/env.ts`, `camposEntornoIdentidad`, `camposEntornoObservabilidad`).
- `kernel`: `UnitOfWork`, `TenantContext`, `Clock`, `IdGenerator`, `NotFoundError`. `TypeOrmUnitOfWork.run` se une a la transacción activa si existe.
- `auditoria`: `AUDITORIA` / `AuditoriaPort.registrar`, que exige una transacción activa.
- Patrón de función cruzada entre tenants: `arc.versiones_pendientes_vencidas` (spec 35), `SECURITY DEFINER`, `search_path = ''`, dueño `org_lector`.
- CLI del worker: `apps/worker/src/cli/*` con scripts `pnpm <x>` y `<x>:remoto` en `package.json`.
- Última letra de migración: `01m` (ARC).

## Alcance

**Entra:**

- Lib nueva `libs/plataforma/secretos` con la estructura de `libs/plataforma/archivos`, etiquetas `scope:plataforma`, `type:backend`, `comp:sec`; alias `@vitrina/plataforma/secretos`.
- Esquema `sec` con `sec.clave_tenant` (una clave de datos por tenant, envuelta) y `sec.secreto` (valor cifrado).
- Puerto `BovedaSecretos` en proceso: `guardar`, `leer`, `rotar`, `eliminar`. Sin HTTP.
- Cifrado AES-256-GCM con `node:crypto`: el secreto con la clave de datos del tenant; la clave de datos con la clave maestra.
- Claves maestras versionadas por entorno (`SEC_CLAVES_MAESTRAS`, `SEC_CLAVE_ACTIVA`) en `apps/api` y `apps/worker`.
- Rotación del valor de un secreto conservando su id.
- Rotación de la clave maestra sin interrupción: se lee con cualquier versión configurada y se cifra con la activa; `pnpm secretos:reenvolver` re-envuelve las claves de datos de todos los tenants.
- `guardar`, `rotar` y `eliminar` auditados con `AuditoriaPort` en la transacción (tipo y id, nunca el valor).
- `pnpm secretos:clave` genera una clave maestra nueva.
- Migración `db/01n_sec.sql` con inverso y prueba SQL.

**No entra (specs futuros):**

- Uso desde FE, PAG o NOT: cada consumidor lo integra en su spec (49, 73, 104).
- Rotación de la clave de datos de un tenant (re-cifrar todos sus secretos).
- Rotación automática periódica de la clave maestra o de los secretos.
- Gestor externo (KMS, Secrets Manager) o Supabase Vault.
- Caché de claves de datos descifradas.
- Auditoría de las lecturas.
- Eventos de outbox.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `libs/plataforma/archivos` (`project.json`, `jest.config`, `tsconfig.*`) | Molde de la lib nueva: capas, etiquetas y alias en `tsconfig.base.json`. |
| `kernel` (`UnitOfWork`, `TenantContext`, `Clock`, `IdGenerator`, `NotFoundError`) | Transacción, tenant y usuario del contexto, ids `uuidV7`. |
| `kernel-infra` (`TypeOrmUnitOfWork`, `TENANT_CONTEXT`, `CLOCK`, `ID_GENERATOR`) | Inyección en `SecretosModule`. |
| `auditoria` (`AUDITORIA`) | Auditoría de las escrituras. |
| `camposEntorno*` de identidad y observabilidad | Patrón de `camposEntornoSecretos` y su `superRefine`. |
| `arc.versiones_pendientes_vencidas` | Patrón de `sec.tenants_por_reenvolver`. |
| `apps/worker/src/cli/ejecutar-auditoria.ts` | Patrón del CLI de re-envoltura. |

## Modelo de datos

### Migración `db/01n_sec.sql` (+ `db/rollback/01n_sec.sql`, `db/tests/01n_sec.test.sql`)

```sql
CREATE SCHEMA sec;

CREATE TABLE sec.clave_tenant (
  tenant_id               uuid PRIMARY KEY,
  clave_cifrada           bytea    NOT NULL CHECK (octet_length(clave_cifrada) = 48),  -- 32 de clave + 16 de etiqueta GCM
  iv                      bytea    NOT NULL CHECK (octet_length(iv) = 12),
  version_clave_maestra   smallint NOT NULL CHECK (version_clave_maestra >= 1),
  creado_en               timestamptz NOT NULL DEFAULT now(),
  reenvuelta_en           timestamptz
);
CREATE INDEX ix_clave_tenant_version ON sec.clave_tenant (version_clave_maestra);

CREATE TABLE sec.secreto (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES sec.clave_tenant(tenant_id),
  tipo         varchar(60) NOT NULL CHECK (tipo ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  cifrado      bytea NOT NULL CHECK (octet_length(cifrado) BETWEEN 17 AND 65552),     -- 1 B a 64 KiB + 16 de etiqueta
  iv           bytea NOT NULL CHECK (octet_length(iv) = 12),
  version      integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  creado_por   uuid NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  rotado_por   uuid,
  rotado_en    timestamptz
);
CREATE INDEX ix_secreto_tenant ON sec.secreto (tenant_id);
```

- RLS `ENABLE + FORCE` en las dos tablas con `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`. `sec.clave_tenant`: `SELECT`, `INSERT`, `UPDATE`. `sec.secreto`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- `REVOKE ALL ... FROM PUBLIC`; `GRANT` al `current_user`; `REVOKE` a `anon` y `authenticated` si existen (regla 8). Sin `TRUNCATE`.
- `sec.tenants_por_reenvolver(p_version_activa smallint, p_limite integer)` `SECURITY DEFINER`, `search_path = ''`, dueño `org_lector`: devuelve `tenant_id` de las claves con `version_clave_maestra <> p_version_activa`, de todos los tenants. `GRANT SELECT ON sec.clave_tenant TO org_lector` con política `clave_tenant_lector FOR SELECT TO org_lector USING (true)`. `REVOKE EXECUTE ... FROM PUBLIC`, `GRANT EXECUTE` al rol de la aplicación.
- `version` de `sec.secreto` sube en cada rotación y sirve de bloqueo optimista.
- Inverso: se niega si `sec.secreto` tiene filas (borrarlas pierde credenciales sin recuperación). Si está vacío, borra la función, las tablas y el esquema.

### Formato criptográfico

- Clave maestra: 32 bytes. `SEC_CLAVES_MAESTRAS = "1:<base64>;2:<base64>"` y `SEC_CLAVE_ACTIVA = 2`.
- Clave de datos del tenant: 32 bytes aleatorios (`randomBytes`), creada en el primer `guardar` del tenant. Se envuelve con AES-256-GCM, IV de 12 bytes aleatorio y AAD `sec.clave_tenant|{tenant_id}|{version}`.
- Secreto: AES-256-GCM con la clave de datos, IV de 12 bytes aleatorio por cifrado (también en cada rotación) y AAD `sec.secreto|{tenant_id}|{secreto_id}|{tipo}`. La AAD impide mover un cifrado a otra fila, otro tenant u otro tipo.
- `cifrado` guarda el texto cifrado seguido de la etiqueta GCM de 16 bytes.
- Valor del secreto: `Uint8Array` de 1 byte a 64 KiB. Un `.pfx` de 50 KB entra; un texto se pasa con `TextEncoder`.

### Dominio (`libs/plataforma/secretos/src/domain/`)

- `tipo-secreto.ts`: `TipoSecreto` con formato `componente.nombre` (p. ej. `fe.clave_certificado`, `pag.llave_privada`); `TipoSecretoInvalidoError`.
- `valor-secreto.ts`: `exigirValorSecreto(valor)`: vacío o mayor de 64 KiB → `ValorSecretoInvalidoError`.
- `claves-maestras.ts`: `ClavesMaestras` (versión → clave, versión activa). Crear con una activa que no está en la lista → `ClaveMaestraInvalidaError`; pedir una versión ausente → `ClaveMaestraDesconocidaError` (lleva la versión).
- `errores.ts`: `SecretoNoEncontradoError` (`NotFoundError`, `SECRETO_NO_ENCONTRADO`), `BovedaNoConfiguradaError`, `SecretoCorruptoError` (falla la etiqueta GCM), los anteriores.
- Ningún error, `toString` ni log incluye el valor, la clave de datos ni la maestra.

### Puertos (`application/ports/`)

```ts
export const BOVEDA_SECRETOS = Symbol('BovedaSecretos');

/** Tenant y usuario salen del TenantContext. Se une a la transacción del llamador si la hay (UnitOfWork.run). */
export interface BovedaSecretos {
  guardar(tipo: string, valor: Uint8Array): Promise<string>;           // secretoId
  /** SecretoNoEncontradoError si no existe en el tenant. */
  leer(secretoId: string): Promise<Uint8Array>;
  rotar(secretoId: string, valor: Uint8Array): Promise<void>;          // mismo id, version + 1
  eliminar(secretoId: string): Promise<void>;                          // borrado físico; idempotente
}

export interface Cifrador {                                            // AES-256-GCM, node:crypto
  cifrar(clave: Uint8Array, texto: Uint8Array, datosAsociados: string): { cifrado: Uint8Array; iv: Uint8Array };
  descifrar(clave: Uint8Array, cifrado: Uint8Array, iv: Uint8Array, datosAsociados: string): Uint8Array; // SecretoCorruptoError
  claveAleatoria(): Uint8Array;
}

export interface RepositorioClavesTenant {
  obtener(): Promise<ClaveTenantGuardada | null>;                       // la del tenant del contexto
  crearSiNoExiste(clave: ClaveTenantGuardada): Promise<ClaveTenantGuardada>; // ON CONFLICT: devuelve la que ganó
  reenvolver(clave: ClaveTenantGuardada): Promise<void>;
  tenantsPorReenvolver(versionActiva: number, limite: number): Promise<string[]>;
}

export interface RepositorioSecretos {
  obtener(secretoId: string): Promise<SecretoGuardado | null>;
  insertar(secreto: SecretoGuardado): Promise<void>;
  actualizar(secreto: SecretoGuardado, versionEsperada: number): Promise<void>;  // conflicto si cambió
  borrar(secretoId: string): Promise<boolean>;
}
```

### Casos de uso (`application/`)

- `GuardarSecreto`: valida tipo y valor; en una transacción obtiene o crea la clave de datos del tenant (envuelta con la maestra activa), cifra, inserta y audita `plat.secreto.guardar` (`entidadTipo: 'secreto'`, `entidadId`, `despues: { tipo }`).
- `LeerSecreto`: obtiene el secreto y la clave del tenant, desenvuelve con la versión de maestra que indica la fila y descifra. Sin auditoría; log `info` con `secretoId` y `tipo`.
- `RotarSecreto`: en una transacción cifra el valor nuevo con IV nuevo, actualiza con bloqueo optimista, `rotado_por`, `rotado_en` y audita `plat.secreto.rotar` (`despues: { tipo, version }`). Quien leyó antes de confirmar sigue con el valor anterior; quien lee después, con el nuevo: no hay ventana sin valor.
- `EliminarSecreto`: borra la fila y audita `plat.secreto.eliminar` (`antes: { tipo, version }`) si existía; si no, termina sin error ni auditoría.
- `ReenvolverClaves`: pide `tenantsPorReenvolver(activa, 200)` y, por cada tenant, en una transacción con su contexto, desenvuelve con la versión vieja, envuelve con la activa e IV nuevo, y actualiza `version_clave_maestra` y `reenvuelta_en`. Los secretos no se tocan. Repite hasta que no queden. Devuelve `{ reenvueltas, pendientes }`. Log estructurado con los conteos.

### Infraestructura

- `crypto/cifrador.aes-gcm.ts`: `createCipheriv('aes-256-gcm')`, `setAAD`, `getAuthTag`, `randomBytes`. Sin dependencias nuevas.
- `typeorm/entidades.ts`, `mapeo.ts`, `claves-tenant.repositorio.ts`, `secretos.repositorio.ts` con `getRepository` sobre el `EntityManager` de la transacción. `crearSiNoExiste` con `insert().orIgnore()` y relectura.
- `typeorm/tenants-por-reenvolver.sql.ts`: único SQL crudo (función de base de datos, regla 11).
- `interface/entorno-secretos.ts`: `camposEntornoSecretos` (`SEC_CLAVES_MAESTRAS` opcional, `SEC_CLAVE_ACTIVA` opcional) y `exigirClaveMaestraEnProduccion` (`superRefine`): en `production` las dos son obligatorias y válidas. Parseo a `ClavesMaestras`; cada clave decodifica a 32 bytes exactos.
- Sin claves configuradas (dev o test sin `.env` completo), la app arranca y la bóveda lanza `BovedaNoConfiguradaError` al usarse.

### Composición

- `SecretosModule.register({ claves })`: provee `BOVEDA_SECRETOS` con `TypeOrmUnitOfWork`, `TENANT_CONTEXT`, `CLOCK`, `ID_GENERATOR` y `AUDITORIA`; exporta `BOVEDA_SECRETOS`. `ENTIDADES_SEC` van en el `DataSource` de api y worker.
- `apps/api` y `apps/worker`: `camposEntornoSecretos` en `config/env.ts` e importación de `SecretosModule`. Ningún consumidor lo usa todavía.
- `apps/worker/src/cli/ejecutar-reenvoltura.ts` y scripts `secretos:reenvolver` y `secretos:reenvolver:remoto` en `package.json`. Opción `--verificar`: solo cuenta pendientes, sin escribir.
- `tools/secretos/generar-clave.mjs` y script `secretos:clave`: imprime `<version>:<base64 de 32 bytes>`; no escribe archivos.
- `eslint.config.mjs`: `comp('sec', 'kernel', 'aud')`; prueba en `tools/boundaries-test`.
- `.env.example`: `SEC_CLAVES_MAESTRAS=` y `SEC_CLAVE_ACTIVA=` con el procedimiento de rotación en el comentario. `docs/ops/supabase-ambientes.md` (sección de secretos): generar, agregar la versión nueva, activarla, desplegar api y worker, correr `secretos:reenvolver`, verificar 0 pendientes y retirar la versión vieja.
- `src/index.ts`: `BOVEDA_SECRETOS`, `BovedaSecretos`, `SecretosModule`, `ENTIDADES_SEC`, `camposEntornoSecretos`, `exigirClaveMaestraEnProduccion`, `ReenvolverClaves` y los errores, por ruta explícita.

## Plan de implementación

1. **Lib y migración.** Lib con el molde de `archivos`, alias, etiquetas, matriz de límites. `db/01n_sec.sql`, inverso y prueba SQL: CHECK de tamaños y de `tipo`, FK del secreto a la clave del tenant, RLS con dos `app.tenant_id`, `sec.tenants_por_reenvolver` ve todos los tenants, inverso que se niega con secretos.
2. **Dominio y cifrador.** `TipoSecreto`, `exigirValorSecreto`, `ClavesMaestras`, errores y `CifradorAesGcm`, con pruebas: ida y vuelta, IV distinto en cada cifrado, AAD distinta → `SecretoCorruptoError`, un byte alterado → `SecretoCorruptoError`.
3. **Persistencia.** Entidades, mapeo y repositorios. Integración contra base temporal: `crearSiNoExiste` concurrente deja una sola clave, bloqueo optimista en `actualizar`, aislamiento.
4. **Casos de uso.** `GuardarSecreto`, `LeerSecreto`, `RotarSecreto`, `EliminarSecreto` y la implementación de `BovedaSecretos`, con auditoría doble en pruebas.
5. **Entorno y composición.** `camposEntornoSecretos`, `SecretosModule`, api y worker, `.env.example`, `secretos:clave`.
6. **Re-envoltura.** `ReenvolverClaves`, `TenantsPorReenvolverSql`, CLI y scripts, procedimiento en `docs/ops/supabase-ambientes.md`. Integración: guardar con la versión 1, activar la 2, leer sin re-envolver, re-envolver, quitar la 1 y leer.
7. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` en Supabase dev; claves de dev en `.env` local (fuera del repo); `npx nx run-many -t lint test -p secretos api worker migrar boundaries-test`.

## Criterios de aceptación

- [ ] `guardar` y `leer` devuelven exactamente los bytes guardados, incluido un `.pfx` de 50 KB.
- [ ] Ninguna columna de `sec.secreto` ni de `sec.clave_tenant` contiene el valor ni la clave de datos en claro: la prueba de integración busca los bytes del valor en la fila y no los encuentra.
- [ ] Dos `guardar` del mismo valor producen `cifrado` e `iv` distintos.
- [ ] Copiar el `cifrado` y el `iv` de un secreto a otra fila (otro id, otro tipo u otro tenant) hace que `leer` falle con `SecretoCorruptoError`.
- [ ] El primer `guardar` de un tenant crea su clave de datos; dos `guardar` simultáneos del primer secreto dejan una sola fila en `sec.clave_tenant` y ambos secretos se leen.
- [ ] Secreto de otro tenant o inexistente → `SecretoNoEncontradoError`; la prueba SQL con dos `app.tenant_id` no ve filas ajenas.
- [ ] `rotar` conserva el id, sube `version`, cambia `iv`, registra `rotado_por` y `rotado_en`; `leer` devuelve el valor nuevo; dos `rotar` concurrentes → uno responde conflicto.
- [ ] `eliminar` borra la fila; `leer` después → `SecretoNoEncontradoError`; eliminar un id inexistente no falla ni audita.
- [ ] `guardar`, `rotar` y `eliminar` dejan fila en `aud` con `plat.secreto.guardar`, `plat.secreto.rotar` y `plat.secreto.eliminar`, `entidad_tipo = 'secreto'` y el tipo, sin el valor; si la transacción del llamador se revierte, no queda ni secreto ni fila de `aud`.
- [ ] `leer` no escribe en `aud`.
- [ ] Rotación de la maestra: con secretos guardados bajo la versión 1, configurar `1:..;2:..` con activa 2 → las lecturas siguen funcionando y los secretos nuevos de un tenant sin clave usan la 2; `pnpm secretos:reenvolver` deja todas las claves en la 2 sin tocar `sec.secreto`; `--verificar` informa 0 pendientes; quitar la 1 → las lecturas siguen funcionando.
- [ ] Una clave cuya versión de maestra no está configurada → `ClaveMaestraDesconocidaError` con la versión, sin el valor de ninguna clave.
- [ ] En `production`, sin `SEC_CLAVES_MAESTRAS` o `SEC_CLAVE_ACTIVA`, con una clave que no decodifica a 32 bytes o con una activa ausente de la lista, api y worker no arrancan. En `development` sin claves arrancan y la bóveda lanza `BovedaNoConfiguradaError` al usarse.
- [ ] Ningún log, error ni respuesta contiene valores, claves de datos ni claves maestras (TR-RNF-026); gitleaks del CI pasa.
- [ ] `pnpm secretos:clave` imprime una clave de 32 bytes en base64 con su versión.
- [ ] `secretos` solo importa de `kernel`, `kernel-infra` y `auditoria`; la prueba de `tools/boundaries-test` lo cubre.
- [ ] Migración `01n_sec` reversible y probada en CI contra PostgreSQL 16, con el inverso que se niega si hay secretos.
- [ ] Cobertura de dominio de `secretos` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM, con el único SQL crudo en `TenantsPorReenvolverSql`.
- [ ] `npx nx run-many -t lint test -p secretos api worker migrar boundaries-test` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** cifrado por sobre en la app con AES-256-GCM de `node:crypto`. Decisión del usuario. Clave por tenant como pide TR-RNF-113, sin servicio ni costo nuevo y sin dependencias.
- **No:** Supabase Vault. Decisión del usuario. No da clave por tenant y acopla la plataforma a Supabase fuera de `infrastructure/supabase`.
- **No:** gestor externo (KMS, Secrets Manager). Decisión del usuario. Si llega, entra como otra implementación de las claves maestras sin cambiar el puerto.
- **Sí:** lib propia `libs/plataforma/secretos` con `comp:sec` y esquema `sec`, solo puerto en proceso. Decisión del usuario.
- **No:** meterla en `kernel-infra`. Decisión del usuario. El kernel no tiene tablas ni migraciones propias.
- **No:** HTTP. Ningún front lee ni escribe secretos directo: cada consumidor (FE, PAG) recibe el secreto en su propia ruta, con su permiso y aal2, y lo pasa a la bóveda.
- **Sí:** rotación del valor (`rotar`, mismo id) y de la clave maestra (varias versiones por entorno y `secretos:reenvolver`). Decisión del usuario. Sin interrupción: durante la rotación se lee con cualquier versión configurada.
- **No:** rotar la clave de datos de un tenant. Decisión del usuario. Obliga a re-cifrar todos sus secretos; se agrega si una auditoría lo pide.
- **Sí:** auditar `guardar`, `rotar` y `eliminar` con `AuditoriaPort` en la transacción del llamador; las lecturas solo van al log. Decisión del usuario. El worker lee en cada envío y llenaría `aud`.
- **No:** eventos de outbox. Decisión del usuario. Nadie reacciona a un secreto guardado.
- **Sí:** la bóveda se une a la transacción del llamador (`UnitOfWork.run` anidado). Si el caso de uso de FE falla después de guardar el certificado, no queda secreto huérfano.
- **Sí:** la clave de datos se crea en el primer `guardar` del tenant, no en el alta del tenant. ORG no depende de SEC y los tenants existentes no necesitan migración.
- **Sí:** AAD con tenant, id y tipo en el secreto y con tenant y versión en la clave. Una fila copiada a otro lugar no se descifra.
- **Sí:** IV aleatorio de 12 bytes por cifrado. Con una clave por tenant y pocos secretos, el límite de GCM con IV aleatorio queda muy lejos.
- **Sí:** `tipo` libre con formato `componente.nombre`. La bóveda no conoce a sus consumidores; cada uno define sus tipos.
- **Sí:** valores en bytes de hasta 64 KiB. El `.pfx` es binario y RF-052 lo limita a 50 KB.
- **Sí:** borrado físico al eliminar. Un secreto que ya no se usa no debe sobrevivir; la auditoría guarda que existió.
- **Sí:** sin caché de claves de datos descifradas. Una lectura cuesta dos descifrados AES, por debajo de un milisegundo; una caché agrega claves en memoria sin medición que lo justifique.
- **Sí:** en `production` las claves maestras son obligatorias al arrancar; en dev y test la app arranca sin ellas y la bóveda falla al usarse. Así los specs que no usan secretos no exigen configurar claves en cada máquina.
- **Sí:** la re-envoltura por CLI con `sec.tenants_por_reenvolver` (`SECURITY DEFINER`, dueño `org_lector`) y una transacción por tenant con su contexto. RLS sigue aplicando en la escritura.
- **Sí:** el inverso de la migración se niega con secretos guardados. Perderlos obliga a cada tenant a volver a cargar certificados y credenciales.
- **Sí:** migración `01n_sec` (letra siguiente a ARC).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Se pierde la clave maestra | Sin ella no hay forma de leer ningún secreto. El procedimiento en `docs/ops/supabase-ambientes.md` exige guardarla en el gestor de contraseñas del equipo y en el panel del proveedor de despliegue antes de activarla. |
| Se retira una versión de maestra con claves aún envueltas con ella | `secretos:reenvolver --verificar` debe dar 0 antes de retirarla; si no, `ClaveMaestraDesconocidaError` dice qué versión falta y basta con volver a agregarla. |
| api y worker con claves maestras distintas | El procedimiento despliega los dos con la misma lista antes de activar la versión nueva. |
| La clave maestra aparece en un log o en el repo | Nunca se registra; gitleaks en el CI; `.env` fuera del repo. |
| El primer consumidor necesita leer secretos fuera de un contexto de tenant | La bóveda exige tenant en el contexto; los trabajos del worker ya corren con el contexto de su tenant (patrón de los specs 33 y 19b). |

## Lo que **no** entra en este spec

- Integración con FE, PAG o NOT (specs 49, 73, 104).
- Rotación de la clave de datos por tenant y rotación automática.
- Gestor externo o Supabase Vault.
- Caché de claves y auditoría de lecturas.
- HTTP y eventos.

Cada uno, si llega, va en su propio spec.
