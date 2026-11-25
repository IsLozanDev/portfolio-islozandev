# SPEC 51c — Facturación electrónica: adaptador SUNAT directo (SEE-Del Contribuyente) con sendBill, CDR y prueba en la beta de SUNAT

> **Status:** Borrador
> **Depends on:** SPEC 51b, SPEC 50, SPEC 49, SPEC 41
> **Date:** 2026-11-25
> **Objective:** Agregar a `libs/plataforma/comprobantes` el adaptador `SUNAT` de `PseOsePort`, que comprime el XML firmado del 51b, lo envía con `sendBill` al servicio de SUNAT del ambiente del emisor usando el usuario secundario SOL y devuelve el resultado con el CDR, de modo que la prueba del emisor del spec 50 funcione contra la beta real de SUNAT.

## Por qué existe este spec

Fila 51c de `docs/roadmap-specs.md`. Es la segunda mitad de SUNAT directo, decidido el 2026-11-25 por costo (ver el spec 51b). El 51b deja el XML firmado. Este spec lo hace llegar a SUNAT y entiende la respuesta. El spec 52 lo usa para enviar los comprobantes reales y guardar el CDR.

Lo que hay en el código hoy (revisado al redactar):

- `PseOsePort.enviarComprobante(credenciales, documento)` y `ResolutorPse` con `SIMULADO` y `NUBEFACT` (spec 50). `CredencialesPse { url, usuario, token, ambiente }`; no trae certificado.
- `RespuestaPse { resultado, codigo, descripcion, observaciones, hash?, enlaces? }`.
- `EjecutarPruebaEmisor` lee solo el token (`fe.credencial`) de la bóveda. El `.pfx` y su clave están como `fe.certificado` y `fe.clave_certificado`.
- `ConfigurarEmisor` exige `urlProveedor` cuando el ítem declara `dominios_permitidos` (`urlDelProveedor`).
- `ProveedoresFe.obtener` devuelve `requiereCertificado`, `seriePrueba` y `dominiosPermitidos`.
- `pse/circuit-breaker.ts` (copia del de NOT).
- El 51b deja `generarXmlFirmado(documento, certificado)` → `{ xml, hash, nombreArchivo }`.
- Última letra de migración: `01u`. Este spec propone `01v`; se reserva al abrir el worktree (el 46 y el 62, en paralelo, pueden necesitar otra).

## Alcance

**Entra:**

- Ítem `SUNAT` («SUNAT directo (SEE-Del Contribuyente)») en `PROVEEDOR_FE`. Atributos:
  - `requiere_certificado: true`, `soporta_resumen: true` y `serie_prueba: "BP01"`;
  - `url_beta` y `url_produccion`, las URL del `billService` de SUNAT;
  - `dominios_permitidos: ["e-beta.sunat.gob.pe", "e-factura.sunat.gob.pe"]`.
- URL fija por ambiente. Si el ítem trae `url_produccion`, el adaptador usa `url_beta` o `url_produccion` según el ambiente del emisor, y el tenant no escribe URL: `urlProveedor` queda `null` y, si llega, → 400 `URL_PROVEEDOR_NO_PERMITIDA`. Se sigue validando el host contra `dominios_permitidos`.
- Credenciales SOL:
  - `usuarioProveedor` guarda el usuario secundario SOL, alfanumérico en mayúsculas. El adaptador le antepone el RUC del emisor.
  - La credencial de la bóveda es la clave SOL.
- `ConfigurarEmisor` con `SUNAT` exige a la empresa domicilio fiscal y ubigeo (`DATOS_EMISOR_INCOMPLETOS`, del 51b) y exige usuario SOL.
- `CredencialesPse` suma `certificado?: { pfx: Uint8Array; clave: string }`. `EjecutarPruebaEmisor` lo lee de la bóveda solo si el proveedor `requiereCertificado`.
- Adaptador `pse/sunat/pse.sunat.ts`:
  - firma con el 51b, arma el ZIP con `fflate` y el sobre SOAP de `sendBill` con WS-Security `UsernameToken`, y lo envía con `fetch`;
  - timeout de 15 s y `CircuitBreaker` (5 fallos, 30 s);
  - lee el `applicationResponse` (ZIP del CDR) o el `soap:Fault`.
- Mapeo de la respuesta a `RespuestaPse`:
  - CDR con `ResponseCode` `0` sin notas → `ACEPTADO`;
  - con notas (códigos 4000 o mayores) → `ACEPTADO_CON_OBSERVACIONES`;
  - códigos 2000-3999 → `RECHAZADO`;
  - excepciones 0100-1999 → `ERROR_TECNICO`, salvo las de autenticación y autorización (lista en constante), que son `RECHAZADO` para no reintentar con una clave mala;
  - timeout, red, 5xx y circuito abierto → `ERROR_TECNICO`.
- `RespuestaPse` suma `xmlFirmado?: Uint8Array` y `cdr?: Uint8Array` (el ZIP tal como lo devuelve SUNAT). El `hash` ya existe y lo llena el adaptador SUNAT con el del 51b.
- Las boletas también van una por una con `sendBill`. El resumen diario queda en el 55.
- Prueba del emisor del 50 con `SUNAT`: la boleta de prueba (`BP01`, correlativo propio) por `sendBill` a la beta → `VERIFICADO`. El paso a producción ya exige certificado vigente porque el ítem lo requiere.
- Migración `db/01v_fe_sunat_directo.sql` (letra por confirmar) con inverso y prueba SQL.
- Dependencia `fflate`.
- Humo manual contra la beta real, fuera del CI (`FE_HUMO_SUNAT_BETA=1`).

**No entra (specs futuros):**

- Envío de comprobantes reales desde el worker, estados finales del comprobante, CDR en ARC, `cpe.aceptado` y `cpe.rechazado` (spec 52).
- `sendSummary`, `sendPack` y `getStatus` con ticket para resumen diario y baja (spec 55).
- `getStatusCdr` para recuperar el CDR de un comprobante ya enviado, incluido el caso `1033` «registrado previamente» (spec 56).
- UBL de notas (spec 54).
- Validación del certificado contra la cadena de entidades acreditadas (INDECOPI): la beta acepta autofirmados y producción lo valida SUNAT.
- Saber si un contribuyente está obligado a usar OSE: se revisa al dar de alta a cada cliente y queda como pendiente con un contador, junto con si SazónPOS debe inscribirse como PSE.
- UI de la configuración con SUNAT (spec 62).

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `PseOsePort`, `ResolutorPse`, `RespuestaPse`, `CredencialesPse` (50) | Se suma el adaptador `SUNAT`; `CredencialesPse` y `RespuestaPse` suman campos opcionales. |
| `generarXmlFirmado` (51b) | El adaptador firma con él. |
| `EjecutarPruebaEmisor`, `ConfigurarEmisor`, `urlDelProveedor` (50) | Leen el certificado si se requiere; URL fija por ambiente. |
| `pse/circuit-breaker.ts` (50) | Mismo breaker por instancia del adaptador. |
| `secretos` (`BOVEDA_SECRETOS.leer`) | `.pfx` y clave leídos solo en el worker, al enviar. |
| `catalogos` (`CATALOGO_PORT`) | Atributos nuevos `url_produccion` del ítem. |

## Modelo de datos

### Migración `db/01v_fe_sunat_directo.sql` (+ `db/rollback/01v_fe_sunat_directo.sql`, `db/tests/01v_fe_sunat_directo.test.sql`)

- Semilla: ítem GLOBAL `SUNAT` en `PROVEEDOR_FE` con:

  ```json
  {
    "requiere_certificado": true,
    "soporta_resumen": true,
    "serie_prueba": "BP01",
    "url_beta": "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService",
    "url_produccion": "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService",
    "dominios_permitidos": ["e-beta.sunat.gob.pe", "e-factura.sunat.gob.pe"]
  }
  ```

  Las URL se confirman contra el manual de servicios web de SUNAT al implementar; si cambian, se corrige la semilla, no el código.
- Inverso: quita el ítem; se niega si hay emisores con proveedor `SUNAT`.
- Prueba SQL: el ítem existe con sus atributos; el inverso falla con un emisor `SUNAT`.

### Dominio y puertos

```ts
// domain/respuesta-pse.ts
export interface RespuestaPse {
  resultado: ResultadoPse;
  codigo: string;
  descripcion: string;
  observaciones: string[];
  hash?: string;
  enlaces?: Record<string, string>;
  /** XML firmado enviado (SUNAT directo). El 52 lo guarda en ARC. */
  xmlFirmado?: Uint8Array;
  /** ZIP del CDR tal como lo devuelve SUNAT. El 52 lo guarda en ARC. */
  cdr?: Uint8Array;
}

// application/ports/pse-ose.port.ts
export interface CredencialesPse {
  url: string | null;
  usuario: string | null;
  token: string;
  ambiente: AmbienteEmisor;
  /** Solo si el proveedor requiere certificado. Leído en el worker; nunca se registra. */
  certificado?: { pfx: Uint8Array; clave: string };
}

// application/ports/proveedores-fe.ts: ProveedorFe suma
urlBeta: string | null;
urlProduccion: string | null;
```

- `domain/url-proveedor.ts` suma `urlSegunAmbiente(proveedor, ambiente)`: si el ítem trae `urlProduccion`, devuelve la del ambiente; si no, `null` (manda `url_proveedor`).
- `domain/usuario-sol.ts`: `exigirUsuarioSol(texto)` (alfanumérico en mayúsculas, sin el RUC) y `usuarioWsSecurity(ruc, usuario)` → `RUC + USUARIO`.
- `errores.ts` suma `UsuarioSolInvalidoError` (400, `USUARIO_SOL_INVALIDO`).

### Infraestructura (`infrastructure/pse/sunat/`)

- `sobre-send-bill.ts`: `armarSobreSendBill({ usuario, clave, nombreArchivo, zipBase64 })`. El sobre SOAP 1.1 lleva `wsse:Security/UsernameToken` con `PasswordText`, y `sendBill` con `fileName` = `nombreArchivo.zip` y `contentFile`. Es una función pura; la clave solo vive en el cuerpo de la petición.
- `zip-sunat.ts`: `comprimir(nombreArchivo, xml)` → ZIP con `nombreArchivo.xml`, y `descomprimirCdr(zip)` → XML `R-….xml`, con `fflate`.
- `lectura-cdr.ts`: con `@xmldom/xmldom`, lee `cac:DocumentResponse/cac:Response/cbc:ResponseCode`, `cbc:Description` y las `cbc:Note`.
- `lectura-fault.ts`: lee `faultcode` y `faultstring` de un `soap:Fault`; el código SUNAT sale del número al final de `faultcode` (`soap-env:Client.2335` → `2335`) o de `faultstring`.
- `codigos-sunat.ts`: rangos (`0`, 0100-1999, 2000-3999, 4000 o mayores) y `CODIGOS_CREDENCIAL_INVALIDA` (usuario o clave incorrectos, usuario sin perfil). La lista se confirma con la tabla de códigos de error de SUNAT al implementar.
- `pse.sunat.ts`:
  1. Resuelve la URL con `urlSegunAmbiente` y valida el host.
  2. Llama a `generarXmlFirmado`, comprime, arma el sobre y hace `POST` con `Content-Type: text/xml` y `SOAPAction`, con `AbortSignal.timeout(15 s)` dentro del breaker.
  3. Mapea la respuesta y devuelve `xmlFirmado`, `cdr` y `hash`.

  No registra el sobre, la clave, el `.pfx` ni el cuerpo de la respuesta; el log lleva emisor, serie-número, código y resultado.
- `pse/resolutor-pse.ts`: mapa `{ SIMULADO, NUBEFACT, SUNAT }`; `PROVEEDORES_CON_ADAPTADOR` suma `sunat`.
- `catalogos/proveedores-fe.catalogo.ts`: lee `url_beta` y `url_produccion`.

### Casos de uso que cambian

- `ConfigurarEmisor`:
  - con `SUNAT`, `urlProveedor` debe venir vacía (si llega → 400 `URL_PROVEEDOR_NO_PERMITIDA`);
  - `usuarioProveedor` pasa por `exigirUsuarioSol`;
  - la empresa necesita domicilio fiscal y ubigeo (422 `DATOS_EMISOR_INCOMPLETOS`).

  Con `NUBEFACT` y `SIMULADO` nada cambia.
- `EjecutarPruebaEmisor`: si `proveedor.requiereCertificado`, lee `fe.certificado` y `fe.clave_certificado` y los pasa en `credenciales.certificado`. Arma `boletaDePrueba` con los datos del emisor del 51b (empresa y establecimiento de la sucursal principal).

### Composición

- `package.json`: `fflate`, última versión estable al implementar.
- `ComprobantesModule.registerWorker` registra `PseSunat` en el resolutor.
- Manifiesto sin cambios: todo usa `plat.fe.configurar`.
- `docs/ops/supabase-ambientes.md`, sección FE: el proveedor `SUNAT`, el usuario `MODDATOS` de la beta y que en producción cada cliente necesita certificado, alta como emisor en SOL y usuario secundario.
- `test/sunat-beta.humo.spec.ts`: se salta salvo con `FE_HUMO_SUNAT_BETA=1`. Lee de variables de entorno locales el RUC, la ruta del `.pfx` y su clave, que no van en el repo.

## Plan de implementación

1. **Migración.** `01v_fe_sunat_directo.sql` con la semilla, inverso y prueba SQL. Antes se confirman las URL en el manual de servicios web de SUNAT.
2. **Dominio y catálogo.** `urlSegunAmbiente`, `usuario-sol`, campos nuevos de `RespuestaPse`, `CredencialesPse` y `ProveedorFe`, lectura del catálogo. Pruebas: URL por ambiente, usuario con minúsculas o con el RUC → `USUARIO_SOL_INVALIDO`.
3. **Piezas SOAP.** `sobre-send-bill`, `zip-sunat`, `lectura-cdr`, `lectura-fault`, `codigos-sunat`. Pruebas sobre un CDR aceptado, uno con observaciones, un rechazo `2335` por fault, un `0102` de credencial y un `0109` de servicio no disponible, grabados como archivos de prueba (sin datos reales).
4. **Adaptador.** `PseSunat` con `fetch` simulado: aceptado → `ACEPTADO` con `cdr`, `xmlFirmado` y `hash`; rechazo, timeout y breaker abierto → `ERROR_TECNICO`; el host fuera de la lista no se llama.
5. **Casos de uso.** Cambios a `ConfigurarEmisor` y `EjecutarPruebaEmisor` y el resolutor, con pruebas: configurar `SUNAT` con URL → 400, empresa sin ubigeo → 422, prueba con certificado leído solo cuando se requiere y nunca registrado.
6. **Humo en la beta real.**
   - Con el RUC del usuario, el usuario `MODDATOS`, la clave `moddatos` y un `.pfx` autofirmado con ese RUC (generado con node-forge en el scratchpad), en una empresa de dev. Antes de crear o modificar datos en dev se pide autorización al usuario; seg, org y personas no admiten borrado.
   - Primero, la prueba del emisor por la API y el worker locales → `VERIFICADO`.
   - Después, `FE_HUMO_SUNAT_BETA=1`: una factura y una boleta del 51 enviadas con el adaptador → `ACEPTADO` con CDR.
   - Si la beta rechaza la firma por algoritmo, se cambia a SHA-1 (constante del 51b) y se anota en Decisiones.
7. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` en Supabase dev; `npx nx run-many -t lint test -p comprobantes api worker migrar boundaries-test`.

## Criterios de aceptación

- [ ] El ítem `SUNAT` existe en `PROVEEDOR_FE` de dev con sus atributos; configurar un emisor `SUNAT` sin URL deja `url_proveedor` en `null`.
- [ ] Configurar `SUNAT` con `urlProveedor` → 400 `URL_PROVEEDOR_NO_PERMITIDA`; empresa sin domicilio fiscal o ubigeo → 422 `DATOS_EMISOR_INCOMPLETOS`; usuario SOL con minúsculas o con el RUC → 400 `USUARIO_SOL_INVALIDO`.
- [ ] El adaptador usa `url_beta` con ambiente `BETA` y `url_produccion` con `PRODUCCION`, y nunca llama a un host fuera de `dominios_permitidos`.
- [ ] El sobre `sendBill` lleva `Username` = RUC + usuario SOL y `fileName` = `RUC-TIPO-SERIE-NUMERO.zip`; el ZIP contiene un único `RUC-TIPO-SERIE-NUMERO.xml` firmado.
- [ ] CDR `0` → `ACEPTADO`; con notas → `ACEPTADO_CON_OBSERVACIONES` con las notas en `observaciones`; fault `2335` → `RECHAZADO` con código y descripción; credencial inválida → `RECHAZADO`; `0109`, timeout y circuito abierto → `ERROR_TECNICO`.
- [ ] La respuesta aceptada trae `cdr` (ZIP de SUNAT), `xmlFirmado` y `hash`.
- [ ] Humo: la prueba del emisor `SUNAT` en la beta real queda `ACEPTADA` y el emisor `VERIFICADO`.
- [ ] Humo (`FE_HUMO_SUNAT_BETA=1`): una factura y una boleta del 51 son aceptadas por la beta de SUNAT con CDR.
- [ ] El certificado solo se lee de la bóveda en el worker y solo para proveedores que lo requieren.
- [ ] TR-RNF-113 y TR-RNF-026: ningún log, error, evento, fila de `aud` ni `prueba_descripcion` contiene la clave SOL, el `.pfx`, su clave ni el sobre SOAP; gitleaks del CI pasa y el humo no deja RUC, certificado ni claves en el repo.
- [ ] `SIMULADO` y `NUBEFACT` siguen pasando sus pruebas sin cambios de comportamiento.
- [ ] Migración `01v_fe_sunat_directo` reversible y probada en CI contra PostgreSQL 16.
- [ ] Cobertura de dominio de `comprobantes` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM, sin SQL crudo nuevo.
- [ ] `npx nx run-many -t lint test -p comprobantes api worker migrar boundaries-test` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** SUNAT directo como proveedor principal y Nubefact como alterno. Decisión del usuario (2026-11-25), por costo.
- **Sí:** boletas una por una con `sendBill`. Decisión del usuario. SUNAT lo acepta y responde el CDR al instante; el resumen diario del 55 queda como alternativa.
- **Sí:** URL fija por ambiente en el catálogo. Decisión del usuario. Es la misma para todos los tenants y quita el riesgo de SSRF por URL escrita.
- **Sí:** `RespuestaPse` con `xmlFirmado`, `cdr` y `hash`. Decisión del usuario. SUNAT obliga a conservar el XML y el CDR; el 52 los guarda en ARC y el 53 usa el hash.
- **Sí:** sobre SOAP propio con `fetch` y `fflate` para el ZIP. Decisión del usuario. Son dos operaciones; un cliente SOAP desde el WSDL de SUNAT es pesado y frágil.
- **Sí:** humo en la beta con el RUC del usuario, `MODDATOS` y un certificado autofirmado. Decisión del usuario. No requiere trámites y valida firma y estructura de verdad. El RUC no se escribe en el repo.
- **Sí:** errores de credencial como `RECHAZADO`. Reintentar con una clave mala no la arregla y puede bloquear el usuario SOL.
- **Sí:** usuario SOL sin el RUC; el adaptador lo antepone. El usuario escribe lo mismo que en SOL y no puede poner otro RUC.
- **No:** `getStatusCdr`, resumen y baja aquí. Llegan con los specs que los usan (56 y 55).
- **No:** permiso nuevo. Todo es configuración del emisor con `plat.fe.configurar`.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La beta rechaza la firma (algoritmo o canonicalización) | Algoritmo en constante del 51b; el humo decide SHA-256 o SHA-1 y se anota. |
| URL, `SOAPAction` o códigos de SUNAT distintos de lo asumido | Se leen del manual de servicios web y de la tabla de códigos al implementar; URL en la semilla, códigos en constante. |
| La beta de SUNAT caída o lenta el día del humo | El criterio del humo queda pendiente y se dice así en el cierre; las pruebas con respuestas grabadas cubren el mapeo. |
| `1033` (ya registrado) al reintentar un envío que SUNAT sí recibió | Se trata como `ERROR_TECNICO`; el 56 lo resuelve con `getStatusCdr`. Anotado para el 56. |
| Letra de migración repetida con el 46 o el 62 en paralelo | Se reserva al abrir el worktree; `01v` es la propuesta. |
| Cliente obligado por SUNAT a emitir por OSE | Fuera de este spec; se verifica al dar de alta cada cliente (pendiente con un contador). |
| Estimado de 9-10 h | Corte natural: el humo de factura y boleta (paso 6, segunda parte) pasa al 52; la prueba del emisor en beta no se recorta. |

## Lo que **no** entra en este spec

- Envío de comprobantes reales, estados y CDR en ARC (spec 52).
- Resumen diario y baja (spec 55); `getStatusCdr` y contingencia (spec 56).
- Notas (spec 54) y UI del emisor (spec 62).
- Validación de la cadena del certificado y la obligación de OSE por cliente.

Cada uno, si llega, va en su propio spec.
