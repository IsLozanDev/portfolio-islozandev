# SPEC 49 — Facturación electrónica: emisor por empresa con credenciales y certificado en la bóveda, validación del RUC y alerta de vencimiento

> **Status:** Aprobado
> **Depends on:** SPEC 09, SPEC 19a, SPEC 20a, SPEC 41, SPEC 48, SPEC 17a
> **Date:** 2026-11-22
> **Objective:** Crear `libs/plataforma/comprobantes` con el emisor electrónico de cada empresa (`/v1/fe/emisores/{empresaId}`), que guarda el proveedor PSE, sus credenciales y el certificado `.pfx` en la bóveda de secretos tras validar que es del RUC de la empresa y está vigente, y una tarea diaria que publica `fe.certificado.por_vencer` una vez por certificado.

## Por qué existe este spec

Fila 49 de `docs/roadmap-specs.md` (R2-04: TR-RF-052 pasos 1 a 3 y la alerta de vencimiento). Contexto: `docs/spec-context/tr-fe/fe-emisor-y-puerto-pse.md`, parte A. Es el primer spec de TR-FE: crea la lib, el esquema `fe` y el agregado `Emisor` que usan la prueba en beta (spec 50), la emisión (51) y la UI del emisor (62).

El plan da 6 h a toda R2-04. Esta parte estima 8-9 h con la lib nueva, la lectura del PKCS#12 y la tarea diaria. Si se pasa de 10 h, el evento `fe.emisor.configurado` se deja para el spec 50.

Lo que hay en el código hoy (revisado al redactar):

- `secretos` (spec 41): `BOVEDA_SECRETOS` con `guardar(tipo, valor)`, `leer`, `rotar`, `eliminar`; se une a la transacción del llamador y audita las escrituras. Tipos `componente.nombre`, valores de hasta 64 KiB.
- `org`: `Empresa` (`ruc`, `razonSocial`, estado), caso de uso `ConsultarEmpresa`, `ZONA_VENCIMIENTOS`, `fechaCalendarioDe`; tabla `org.aviso_vencimiento` (idempotencia de avisos, spec 12).
- `catalogos`: `CATALOGO_PORT.validarItem`; catálogos GLOBAL sembrados en migración (`01f_cat_tablas_fe.sql`, spec 48) con `atributos jsonb`.
- `parametros`: `ParametroPort.valor` por tenant del contexto; parámetros declarados en `libs/plataforma/seguridad/manifiesto/plat.manifiesto.json` (versión `1.24.0`).
- `seguridad`: `@Permiso`, sensibles con aal2. `auditoria`: `@Auditable`.
- Multipart: `FileInterceptor` con `limits` en `catalogos/src/interface/importaciones.controller.ts`.
- Tarea diaria: `apps/worker/src/vencimientos/tarea-vencimientos.ts` (`upsertJobScheduler`, zona Lima, sin reintentos).
- No existe lib `comprobantes`, esquema `fe`, catálogo `PROVEEDOR_FE` ni librería de PKCS#12.
- Última letra de migración: `01n` (SEC); el spec 42 usa `01o`.

## Alcance

**Entra:**

- Lib nueva `libs/plataforma/comprobantes` con el molde de `libs/plataforma/secretos`, etiquetas `scope:plataforma`, `type:backend`, `comp:fe`; alias `@vitrina/plataforma/comprobantes`.
- Esquema `fe` con `fe.emisor` (uno por empresa) y `fe.aviso_certificado`.
- Catálogo GLOBAL `PROVEEDOR_FE` sembrado con el ítem `SIMULADO` y los atributos `requiere_certificado`, `soporta_resumen`, `url_beta`.
- `GET /v1/fe/emisores/{empresaId}` (`plat.fe.consultar`) y `PUT /v1/fe/emisores/{empresaId}` (`plat.fe.configurar`, aal2): proveedor, usuario y clave del proveedor, régimen IGV y leyenda del pie.
- `POST /v1/fe/emisores/{empresaId}/certificado` (`plat.fe.configurar`, aal2, multipart ≤ 50 KB): valida clave, RUC y vigencia, y guarda el `.pfx` y su clave en la bóveda.
- Estados `BORRADOR` → `CONFIGURADO`. El CHECK de la tabla ya admite `VERIFICADO` y `PRODUCCION`, que usa el spec 50.
- Puerto `LectorCertificado` con adaptador `node-forge`.
- Tarea diaria en el worker: `fe.certificado.por_vencer` por outbox una vez por certificado, según `plat.fe.dias_aviso_certificado` (30).
- Eventos `fe.emisor.configurado` y `fe.certificado.por_vencer` con esquema registrado.
- Manifiesto PLAT `1.25.0`: permisos `plat.fe.configurar` (sensible) y `plat.fe.consultar`, rol `PLAT_ENCARGADO_FACTURACION`, los dos permisos en `PLAT_PROPIETARIO` y el parámetro `plat.fe.dias_aviso_certificado`.
- Auditoría de los cambios del emisor sin secretos.
- Migración `db/01p_fe.sql` con inverso y prueba SQL.

**No entra (specs futuros):**

- `PseOsePort`, adaptador del PSE real, prueba en beta, estados `VERIFICADO` y `PRODUCCION`, y la variable que impide PRODUCCION en dev y staging (spec 50).
- Ítem del PSE real en `PROVEEDOR_FE` (spec 50, cuando se elija el proveedor).
- Correo de la alerta: lo agrega un consumidor de TR-NOT (spec 44 o el que toque) sobre `fe.certificado.por_vencer`.
- UI del emisor (spec 62) y opción de menú.
- Permisos de monitor, baja y nota de crédito (specs 54, 55 y 57).
- `modo_boletas` y la serie por defecto (specs 51 y 55).
- Recheck del RUC contra el padrón SUNAT al configurar (lo hizo el alta de la empresa, spec 28b).
- Borrar el emisor.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `libs/plataforma/secretos` (molde y `BOVEDA_SECRETOS`) | Estructura de la lib nueva; credencial, `.pfx` y clave del certificado como secretos `fe.credencial`, `fe.certificado`, `fe.clave_certificado`. |
| `kernel` / `kernel-infra` (`UnitOfWork`, `TenantContext`, `OutboxPublisher`, `Clock`, `uuidV7`) | Transacción, eventos, ids. |
| `org` (`ConsultarEmpresa`, `Empresa`, `ZONA_VENCIMIENTOS`, `fechaCalendarioDe`) | Adaptador `EmpresaEmisoraOrg` del puerto `EmpresaEmisoraPort`; fecha de Lima de la tarea. |
| `catalogos` (`CATALOGO_PORT`) | Validar el proveedor y leer sus atributos. |
| `parametros` (`PARAMETRO_PORT`) | `plat.fe.dias_aviso_certificado` por tenant. |
| `seguridad` (`@Permiso`), `auditoria` (`@Auditable`) | Autorización con aal2 y auditoría. |
| `eventos` (registro de esquemas) | `registrarEsquemasFe` en api y worker. |
| `importaciones.controller.ts` (spec 19b) | Patrón de `FileInterceptor` en memoria con `limits`. |
| `apps/worker/src/vencimientos/` y `org.aviso_vencimiento` (spec 12) | Patrón de la tarea diaria y del aviso idempotente. |
| `arc.versiones_pendientes_vencidas` (spec 35) | Patrón de `fe.certificados_con_aviso_pendiente` (`SECURITY DEFINER`, dueño `org_lector`). |
| `01f_cat_tablas_fe.sql` (spec 48) | Patrón de la semilla del catálogo GLOBAL. |

## Modelo de datos

### Migración `db/01p_fe.sql` (+ `db/rollback/01p_fe.sql`, `db/tests/01p_fe.test.sql`)

```sql
CREATE SCHEMA fe;

CREATE TABLE fe.emisor (
  id                            uuid PRIMARY KEY,
  tenant_id                     uuid NOT NULL,
  empresa_id                    uuid NOT NULL,
  proveedor                     varchar(40) NOT NULL,                  -- código del ítem PROVEEDOR_FE
  ambiente                      varchar(10) NOT NULL DEFAULT 'BETA' CHECK (ambiente IN ('BETA','PRODUCCION')),
  estado                        varchar(12) NOT NULL DEFAULT 'BORRADOR'
                                  CHECK (estado IN ('BORRADOR','CONFIGURADO','VERIFICADO','PRODUCCION')),
  regimen_igv                   varchar(24) NOT NULL DEFAULT 'GENERAL' CHECK (regimen_igv IN ('GENERAL','REDUCIDO_RESTAURANTES')),
  leyenda_pie                   varchar(300),
  usuario_proveedor             varchar(100),
  secreto_credencial_id         uuid,
  secreto_certificado_id        uuid,
  secreto_clave_certificado_id  uuid,
  certificado_ruc               char(11),
  certificado_vence_en          timestamptz,
  certificado_huella_sha256     char(64),
  version                       integer NOT NULL DEFAULT 1,
  creado_por                    uuid NOT NULL,
  creado_en                     timestamptz NOT NULL DEFAULT now(),
  modificado_por                uuid,
  modificado_en                 timestamptz,
  CONSTRAINT uq_emisor_empresa UNIQUE (tenant_id, empresa_id),
  CONSTRAINT fk_emisor_empresa FOREIGN KEY (tenant_id, empresa_id) REFERENCES org.empresa (tenant_id, id),
  CHECK ((secreto_certificado_id IS NULL) = (certificado_huella_sha256 IS NULL))
);

CREATE TABLE fe.aviso_certificado (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  emisor_id          uuid NOT NULL REFERENCES fe.emisor (id),
  huella_sha256      char(64) NOT NULL,
  dias_antes         smallint NOT NULL CHECK (dias_antes BETWEEN 1 AND 90),
  vence_en           timestamptz NOT NULL,
  fecha_ejecucion    date NOT NULL,
  registrado_en      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_aviso_certificado UNIQUE (emisor_id, huella_sha256)
);
```

- Si `org.empresa` no tiene una clave única `(tenant_id, id)`, la migración la agrega (y el inverso la quita) o la FK va solo a `id`; se comprueba al implementar.
- RLS `ENABLE + FORCE` en las dos tablas con `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`. `fe.emisor`: `SELECT`, `INSERT`, `UPDATE`. `fe.aviso_certificado`: `SELECT`, `INSERT`.
- `fe.certificados_con_aviso_pendiente(p_hasta timestamptz, p_limite integer)` `SECURITY DEFINER`, `search_path = ''`, dueño `org_lector`: devuelve `(tenant_id, emisor_id)` de los emisores con certificado que vence antes de `p_hasta` y sin fila en `fe.aviso_certificado` para su huella, de todos los tenants. `p_hasta` = hoy + 90 días (máximo del parámetro); cada tenant decide con su propio valor. `GRANT SELECT` a `org_lector` en las dos tablas con políticas `FOR SELECT TO org_lector USING (true)`.
- `REVOKE ALL ... FROM PUBLIC`; `GRANT` al `current_user`; `REVOKE` a `anon` y `authenticated` si existen (regla 8).
- Semilla en `cat.catalogo` (id fijo, `PROVEEDOR_FE`, «Proveedores de facturación electrónica», `GLOBAL`, fuente `Plataforma`, `editable_por_tenant false`) y su ítem `SIMULADO` («Simulador (solo dev y CI)») con `atributos = {"requiere_certificado": true, "soporta_resumen": true, "url_beta": null}`.
- Inverso: borra la función, las tablas, el esquema y la semilla de `PROVEEDOR_FE`. Se niega si `fe.emisor` tiene filas con secretos (`secreto_credencial_id` o `secreto_certificado_id` no nulos): borrarlas dejaría secretos huérfanos en `sec`.

### Dominio (`libs/plataforma/comprobantes/src/domain/`)

- `emisor.ts`: agregado `Emisor`. `crear(empresaId, ruc, datos)` en `BORRADOR`. `configurarProveedor(proveedor, usuario, regimenIgv, leyendaPie)`, `asignarCredencial(secretoId)`, `asignarCertificado(certificadoLeido, secretos)`. `recalcularEstado(requiereCertificado)`: `CONFIGURADO` si tiene proveedor, usuario, credencial y (si el proveedor lo pide) certificado vigente; si no, `BORRADOR`. Devuelve si pasó a `CONFIGURADO` (para el evento). En 49 solo hay transiciones entre `BORRADOR` y `CONFIGURADO`.
- `certificado-leido.ts`: `CertificadoLeido { ruc, venceEn, emitidoEn, huellaSha256, sujeto }`. `validarPara(rucEmpresa, ahora)`: RUC distinto → `CertificadoOtroRucError` («El certificado no corresponde al RUC de la empresa», TR-CA-134); `venceEn <= ahora` → `CertificadoVencidoError`; `emitidoEn > ahora` → `CertificadoNoVigenteError`.
- `ruc-certificado.ts`: `extraerRuc(atributosSujeto)`: busca un RUC de 11 dígitos (prefijo `10`, `15`, `17` o `20`) en `serialNumber`, `OU`, `CN`, `O` del sujeto, en ese orden; sin RUC → `CertificadoSinRucError`.
- `regimen-igv.ts`, `estado-emisor.ts`: listas y tipos.
- `aviso-certificado.ts`: `debeAvisar(venceEn, hoy, diasAviso)`: verdadero si faltan `diasAviso` días o menos (incluido vencido), según la fecha de Lima.
- `errores.ts`: los anteriores, `EmisorNoEncontradoError` (`NotFoundError`, `EMISOR_NO_ENCONTRADO`), `EmpresaNoEncontradaError`, `EmpresaInactivaError`, `ProveedorFeInvalidoError`, `ClaveCertificadoIncorrectaError`, `ArchivoCertificadoInvalidoError` (no es PKCS#12 o > 50 KB), `VersionObsoletaEmisorError`. Ningún error lleva claves ni contenido del `.pfx`.
- `permisos-fe.ts`: `PERMISOS_FE = { configurar: 'plat.fe.configurar', consultar: 'plat.fe.consultar' }`.
- `eventos-fe.ts`: `EVENTOS_FE` y sus cargas.

### Puertos (`application/ports/`)

```ts
export interface LectorCertificado {
  /** ClaveCertificadoIncorrectaError o ArchivoCertificadoInvalidoError. No guarda nada. */
  leer(pfx: Uint8Array, clave: string): CertificadoLeido;
}

export interface EmpresaEmisoraPort {
  /** Del tenant del contexto. EmpresaNoEncontradaError si no existe. */
  obtener(empresaId: string): Promise<{ id: string; ruc: string; activa: boolean }>;
}

export interface ProveedoresFe {
  /** ProveedorFeInvalidoError si el ítem no existe o no está vigente en PROVEEDOR_FE. */
  obtener(codigo: string): Promise<{ codigo: string; requiereCertificado: boolean }>;
}

export interface RepositorioEmisores {
  porEmpresa(empresaId: string): Promise<Emisor | null>;
  insertar(emisor: Emisor): Promise<void>;
  actualizar(emisor: Emisor, versionEsperada: number): Promise<void>;   // VersionObsoletaEmisorError
}

export interface RepositorioAvisosCertificado {
  /** ON CONFLICT DO NOTHING; devuelve si insertó. */
  registrar(aviso: AvisoCertificado): Promise<boolean>;
  pendientes(hasta: Date, limite: number): Promise<{ tenantId: string; emisorId: string }[]>;   // cruza tenants
}
```

### Casos de uso (`application/`)

- `ConsultarEmisor(empresaId)`: vista sin secretos: proveedor, ambiente, estado, régimen, leyenda, usuario del proveedor, `tieneCredencial`, `certificado: { ruc, venceEn, huellaSha256 } | null`, `version`. Sin emisor → `EmisorNoEncontradoError`.
- `ConfigurarEmisor(empresaId, { proveedor, usuarioProveedor, clave?, regimenIgv, leyendaPie?, version? })`, en una transacción: empresa del tenant y activa; proveedor válido. Sin emisor → lo crea (`version` ausente). Con emisor → exige `version` (bloqueo optimista). `clave` presente → `boveda.guardar('fe.credencial', ...)` la primera vez o `rotar` el mismo secreto después; ausente → se conserva. Recalcula el estado; si pasó a `CONFIGURADO`, publica `fe.emisor.configurado`. Audita con `@Auditable` (`antes`/`despues` sin `clave`).
- `CargarCertificado(empresaId, pfx, clave)`, en una transacción: tamaño ≤ 50 KB; `LectorCertificado.leer`; `validarPara(ruc de la empresa, ahora)`; guarda o rota `fe.certificado` y `fe.clave_certificado`; actualiza `certificado_ruc`, `certificado_vence_en`, `certificado_huella_sha256`; recalcula el estado y publica `fe.emisor.configurado` si corresponde. Si el emisor no existe → `EmisorNoEncontradoError` (primero se configura el proveedor). Audita (`despues: { ruc, venceEn, huellaSha256 }`).
- `AvisarCertificadosPorVencer(hoy)` (tarea diaria): pide `pendientes(hoy + 90 días, 200)` en lotes y, por cada emisor, en una transacción con el contexto de su tenant: lee `plat.fe.dias_aviso_certificado`; si `debeAvisar`, registra el aviso y, solo si insertó, publica `fe.certificado.por_vencer`. Devuelve `{ revisados, avisados }`; log estructurado con los conteos.

### Eventos (outbox, con esquema en `registrarEsquemasFe`)

| Evento | Carga | Cuándo |
| --- | --- | --- |
| `fe.emisor.configurado` | `{ emisorId, empresaId, proveedor, ambiente }` | El emisor pasa de `BORRADOR` a `CONFIGURADO`. |
| `fe.certificado.por_vencer` | `{ emisorId, empresaId, ruc, venceEn, diasRestantes }` | Una vez por certificado (huella), cuando faltan `plat.fe.dias_aviso_certificado` días o menos. |

Ninguna carga lleva secretos, usuario del proveedor ni contenido del certificado.

### HTTP (`interface/emisores.controller.ts`, DTO y OpenAPI, bajo `/v1/fe`)

| Método y ruta | Permiso | Respuestas |
| --- | --- | --- |
| `GET /emisores/{empresaId}` | `plat.fe.consultar` | 200 vista sin secretos; 404 `EMISOR_NO_ENCONTRADO`. |
| `PUT /emisores/{empresaId}` | `plat.fe.configurar` (aal2) | 200 vista; 201 si lo creó; 400 validación o `PROVEEDOR_FE_INVALIDO`; 404 `EMPRESA_NO_ENCONTRADA`; 409 `VERSION_OBSOLETA` o `EMPRESA_INACTIVA`. |
| `POST /emisores/{empresaId}/certificado` (multipart: `archivo`, `clave`) | `plat.fe.configurar` (aal2) | 200 vista; 400 `ARCHIVO_CERTIFICADO_INVALIDO`, `CLAVE_CERTIFICADO_INCORRECTA`, `CERTIFICADO_SIN_RUC`; 413 si supera 50 KB; 422 `CERTIFICADO_OTRO_RUC`, `CERTIFICADO_VENCIDO`, `CERTIFICADO_NO_VIGENTE`. |

- La `clave` del PUT y la del certificado nunca vuelven en ninguna respuesta, log ni error. El DTO de respuesta no tiene campos para ellas.
- `FileInterceptor` en memoria con `limits: { fileSize: 50 * 1024 }` (constante con nombre).

### Infraestructura

- `forge/lector-certificado.forge.ts`: `node-forge` (versión y API por ctx7 al implementar): `pkcs12FromAsn1` con la clave, certificado hoja (el que tiene la llave privada), `validity`, atributos del sujeto y huella SHA-256 del DER. Error de MAC o descifrado → `ClaveCertificadoIncorrectaError`; ASN.1 inválido → `ArchivoCertificadoInvalidoError`.
- `org/empresa-emisora.org.ts`: adaptador sobre `ConsultarEmpresa` de `org`.
- `catalogos/proveedores-fe.catalogo.ts`: adaptador sobre `CATALOGO_PORT` (atributo `requiere_certificado`).
- `typeorm/entidades.ts`, `mapeo.ts`, `emisores.repositorio.ts`, `avisos-certificado.repositorio.ts`; `typeorm/certificados-con-aviso-pendiente.sql.ts`: único SQL crudo (función de base de datos, regla 11).
- `event-schemas.ts`: `ESQUEMAS_FE`, `registrarEsquemasFe(validator)`.

### Composición

- `ComprobantesModule.register()` (api: controlador y casos de uso) y `ComprobantesModule.registerWorker()` (worker: `AvisarCertificadosPorVencer`), con `BOVEDA_SECRETOS`, `CATALOGO_PORT`, `PARAMETRO_PORT`, `AUDITORIA` y el caso de uso de `org`. `ENTIDADES_FE` en el `DataSource` de api y worker; `registrarEsquemasFe` en los dos.
- `apps/worker/src/certificados-fe/`: `TareaCertificadosFe` con el patrón de `TareaVencimientos` (cola `fe-certificados`, `0 7 * * *` en Lima, sin reintentos) y CLI `pnpm fe:avisos:ejecutar` / `fe:avisos:ejecutar:remoto` para correrla a mano.
- `plat.manifiesto.json` `1.24.0` → `1.25.0`: permisos `plat.fe.configurar` («Configurar el emisor electrónico», `TENANT`, `sensible: true`) y `plat.fe.consultar` («Ver el emisor electrónico», `TENANT`, `sensible: false`); rol `PLAT_ENCARGADO_FACTURACION` con los dos; los dos en `PLAT_PROPIETARIO`; parámetro `plat.fe.dias_aviso_certificado` (entero, por defecto 30, de 1 a 90, editable por tenant). Sin opción de menú hasta el spec 62. Se aplica con el CLI del manifiesto.
- `package.json`: `node-forge` y `@types/node-forge`.
- `eslint.config.mjs`: `comp('fe', 'kernel', 'org', 'sec', 'cat', 'cfg', 'aud', 'seg', 'evt')` (ajustar a los nombres reales de la matriz); prueba en `tools/boundaries-test`.
- `src/index.ts`: `ComprobantesModule`, `ENTIDADES_FE`, `registrarEsquemasFe`, `EVENTOS_FE`, `PERMISOS_FE` y los errores, por ruta explícita.

## Plan de implementación

1. **Lib y migración.** Lib con el molde de `secretos`, alias, etiquetas, matriz de límites. `db/01p_fe.sql`, inverso y prueba SQL: CHECK, un emisor por empresa, FK a `org.empresa`, RLS con dos `app.tenant_id`, la función cruza tenants y omite los avisados, semilla de `PROVEEDOR_FE`, inverso que se niega con secretos.
2. **Dominio.** `Emisor`, `CertificadoLeido`, `extraerRuc`, `debeAvisar` y errores, con pruebas (RUC en `serialNumber`, en `OU` con texto `RUC:20601234561`, sin RUC; vence hoy, mañana, en 30 y en 31 días).
3. **Lector de certificados.** Adaptador `node-forge` (ctx7 antes de escribir). Fixtures generados en la prueba con `node-forge`: `.pfx` vigente del RUC 20601234561, de otro RUC, vencido, con clave incorrecta, archivo de texto y uno de 60 KB.
4. **Persistencia.** Entidades, mapeo, repositorios y `CertificadosConAvisoPendienteSql`. Integración: bloqueo optimista, aislamiento, aviso concurrente deja una fila.
5. **Casos de uso y HTTP.** `ConsultarEmisor`, `ConfigurarEmisor`, `CargarCertificado` con la bóveda real en integración y doble en unitarias; controlador, DTO, OpenAPI, `@Permiso`, `@Auditable`; manifiesto `1.25.0`.
6. **Tarea diaria.** `AvisarCertificadosPorVencer`, `TareaCertificadosFe`, CLI y eventos con esquema.
7. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` y el CLI del manifiesto en Supabase dev; humo con la API local: configurar `SIMULADO`, subir un `.pfx` de prueba del RUC de una empresa de dev, ver el emisor `CONFIGURADO` y correr `fe:avisos:ejecutar:remoto` con un certificado que vence en 20 días; `npx nx run-many -t lint test -p comprobantes api worker migrar boundaries-test seguridad`.

## Criterios de aceptación

- [ ] TR-CA-133 (pasos 1 a 3): para la empresa con RUC 20601234561, `PUT` con `SIMULADO`, usuario y clave y `POST .../certificado` con un `.pfx` vigente de ese RUC dejan el emisor `CONFIGURADO` con `certificado_ruc`, `certificado_vence_en` y huella, y publican `fe.emisor.configurado` una sola vez.
- [ ] TR-CA-134: un `.pfx` del RUC 20512345678 para esa empresa → 422 «El certificado no corresponde al RUC de la empresa»; el emisor y la bóveda no cambian.
- [ ] TR-CA-135: con un certificado que vence el 2026-11-05, la tarea del 2026-10-06 (30 días antes) publica `fe.certificado.por_vencer` con `diasRestantes = 30`; correrla otra vez ese día o los siguientes no publica otro aviso para la misma huella; cargar un certificado nuevo habilita un aviso nuevo.
- [ ] Certificado vencido → 422 `CERTIFICADO_VENCIDO`; clave del `.pfx` incorrecta → 400 `CLAVE_CERTIFICADO_INCORRECTA`; archivo que no es PKCS#12 → 400 `ARCHIVO_CERTIFICADO_INVALIDO`; más de 50 KB → 413.
- [ ] Sin aal2, `PUT` y `POST .../certificado` responden 401 de step-up; sin `plat.fe.configurar` → 403. `GET` con solo `plat.fe.consultar` → 200.
- [ ] TR-RNF-113: la credencial, el `.pfx` y su clave solo existen cifrados en `sec.secreto` (tipos `fe.credencial`, `fe.certificado`, `fe.clave_certificado`); `fe.emisor` solo guarda sus ids; reemplazar el certificado o la clave rota el mismo secreto (misma id, `version` + 1).
- [ ] TR-RNF-026: ninguna respuesta, log, error, evento ni fila de `aud` contiene la clave del proveedor, la clave del certificado ni bytes del `.pfx`; gitleaks del CI pasa.
- [ ] Si la transacción falla después de guardar en la bóveda (p. ej. conflicto de versión), no queda secreto, ni cambio del emisor, ni fila de `aud`, ni evento.
- [ ] `PUT` con `version` vieja → 409 `VERSION_OBSOLETA`; empresa de otro tenant → 404; empresa inactiva → 409 `EMPRESA_INACTIVA`; proveedor fuera de `PROVEEDOR_FE` → 400 `PROVEEDOR_FE_INVALIDO`.
- [ ] Un proveedor con `requiere_certificado: false` queda `CONFIGURADO` sin certificado; con `true`, sigue `BORRADOR` hasta tener uno vigente.
- [ ] Aislamiento (TR-RNF-010): otro tenant no lee el emisor (404) y la prueba SQL con dos `app.tenant_id` no ve filas ajenas.
- [ ] `PUT` y `POST .../certificado` dejan fila en `aud` con `antes`/`despues` sin secretos (TR-RNF-013).
- [ ] Manifiesto `1.25.0` aplicado en dev: `PLAT_ENCARGADO_FACTURACION` y `PLAT_PROPIETARIO` tienen los dos permisos; `plat.fe.dias_aviso_certificado` vale 30 y un tenant puede cambiarlo; `plat.fe.configurar` es sensible.
- [ ] OpenAPI documenta las tres rutas con sus códigos de error; ningún esquema de respuesta tiene campos de clave.
- [ ] `comprobantes` solo importa de los componentes declarados en la matriz; la prueba de `tools/boundaries-test` lo cubre.
- [ ] Migración `01p_fe` reversible y probada en CI contra PostgreSQL 16, con el inverso que se niega si hay emisores con secretos.
- [ ] Cobertura de dominio de `comprobantes` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM, con el único SQL crudo en `CertificadosConAvisoPendienteSql`.
- [ ] `npx nx run-many -t lint test -p comprobantes api worker migrar boundaries-test seguridad` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** catálogo `PROVEEDOR_FE` con solo `SIMULADO`. Decisión del usuario. El PSE real se elige y se siembra en el spec 50, junto a su adaptador.
- **Sí:** `node-forge` detrás de `LectorCertificado`. Decisión del usuario. `node:crypto` no abre PKCS#12; `node-forge` es JS puro, sin binarios ni archivos temporales.
- **Sí:** estados `BORRADOR` y `CONFIGURADO` solamente; el CHECK ya admite `VERIFICADO` y `PRODUCCION`. Decisión del usuario. La prueba en beta es del spec 50 y así no necesita migrar el CHECK.
- **Sí:** rol `PLAT_ENCARGADO_FACTURACION` (ACT-06) con `plat.fe.configurar` y `plat.fe.consultar`, ambos también en `PLAT_PROPIETARIO`. Decisión del usuario. Los permisos de monitor, baja y nota de crédito llegan con sus specs.
- **Sí:** `plat.fe.consultar` además del `plat.fe.configurar` del SRS. Leer el emisor sin secretos no debe exigir aal2.
- **Sí:** alerta como evento diario `fe.certificado.por_vencer`, sin correo. Decisión del usuario. El correo lo agrega TR-NOT como consumidor; así 49 y 42 se implementan en paralelo.
- **Sí:** un aviso por certificado (por huella), cuando faltan los días del parámetro o menos. Si una corrida falla, la siguiente avisa igual; un certificado nuevo vuelve a avisar.
- **Sí:** el `.pfx` va a la bóveda, no a TR-ARC. Es un secreto, no un archivo de negocio (desviación del SRS documentada en el paquete de contexto).
- **Sí:** la validación de RUC y vigencia se hace siempre, aunque el proveedor firme por su cuenta. Es barata y la exige el SRS (TR-CA-134, 135).
- **Sí:** RUC del certificado buscado en `serialNumber`, `OU`, `CN` y `O`. Las entidades certificadoras peruanas no lo ponen en el mismo atributo.
- **Sí:** reemplazar clave o certificado rota el mismo secreto. No quedan secretos huérfanos y la auditoría de `sec` muestra la rotación.
- **Sí:** FE lee la empresa por un puerto propio con adaptador sobre `ConsultarEmpresa`. El dominio de FE no importa el agregado de ORG.
- **No:** recheck del RUC en el padrón al configurar. Lo hizo el alta de la empresa (spec 28b) y agregaría una dependencia de IDN.
- **No:** opción de menú en el manifiesto. Apuntaría a una ruta que no existe hasta el spec 62.
- **Sí:** migración `01p_fe` (el spec 42 usa `01o`).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un certificado real de una entidad certificadora peruana pone el RUC en un atributo no previsto | `CertificadoSinRucError` es explícito; el humo del spec 50 con un certificado real confirma el formato y se agrega el atributo si hace falta. |
| `node-forge` no abre un `.pfx` con cifrado moderno (AES-256, PBES2) | Se prueba un fixture con PBES2 en el paso 3; si falla, se cambia el adaptador a `pkijs` sin tocar el puerto. |
| La carga de 50 KB en memoria o el multipart filtran el archivo en un log | `FileInterceptor` en memoria, sin `dest`; el filtro de errores no registra cuerpos multipart. |
| `SIMULADO` visible a los tenants en producción | Sin adaptador real no hay envío posible; el spec 50 restringe `SIMULADO` a dev y CI. |
| Las dos ramas paralelas (42 y 49) tocan `tsconfig.base.json`, `eslint.config.mjs`, `package.json` y los módulos de api y worker | Solo el 49 cambia el manifiesto; el resto son líneas contiguas. El segundo PR se rebasa sobre el primero. |

## Lo que **no** entra en este spec

- `PseOsePort`, PSE real, prueba en beta y producción (spec 50).
- Correo de la alerta (consumidor de TR-NOT).
- UI del emisor y menú (spec 62).
- Permisos de monitor, baja y nota de crédito.
- Recheck del RUC en el padrón y borrado del emisor.

Cada uno, si llega, va en su propio spec.
