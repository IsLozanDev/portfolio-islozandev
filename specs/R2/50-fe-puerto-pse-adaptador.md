# SPEC 50 — Facturación electrónica: puerto PSE con adaptadores Nubefact y simulador, prueba en beta asíncrona y paso a producción

> **Status:** Aprobado
> **Depends on:** SPEC 49, SPEC 41, SPEC 11, SPEC 21
> **Date:** 2026-11-23
> **Objective:** Agregar a `libs/plataforma/comprobantes` el puerto `PseOsePort` con adaptadores Nubefact y simulador, una prueba en beta que se solicita por la API y ejecuta el worker enviando un comprobante de prueba, y el paso a producción con sus reglas (TR-RF-052 pasos 4 y 5).

## Por qué existe este spec

Fila 50 de `docs/roadmap-specs.md` (R2-04: TR-RF-052 pasos 4 y 5). Contexto: `docs/spec-context/tr-fe/fe-emisor-y-puerto-pse.md`, parte B. Cierra el emisor del spec 49 (`BORRADOR` → `CONFIGURADO`) con `VERIFICADO` y `PRODUCCION`, y deja el puerto que usa la emisión (spec 51).

El roadmap estima 5-6 h. Con la cola de la prueba y el adaptador real estimo 7-8 h. Si se pasa de 10 h, el adaptador Nubefact se separa a un spec 50b y este cierra con el simulador.

Lo que hay en el código hoy (revisado al redactar):

- `comprobantes` (spec 49): agregado `Emisor` con `recalcularEstado` solo entre `BORRADOR` y `CONFIGURADO`; el CHECK de `fe.emisor.estado` ya admite `VERIFICADO` y `PRODUCCION`, y `ambiente` admite `BETA` y `PRODUCCION`. `ConfigurarEmisor`, `CargarCertificado`, `ConsultarEmisor`, `VistaEmisor`, eventos `fe.emisor.configurado` y `fe.certificado.por_vencer`.
- Credencial del proveedor en la bóveda como `fe.credencial` (spec 41, `BOVEDA_SECRETOS.leer`).
- Catálogo `PROVEEDOR_FE` con el ítem `SIMULADO` (`requiere_certificado`, `soporta_resumen`, `url_beta`).
- Patrón de cola alimentada por outbox: `not.mensaje.solicitado` → `not-envios` (spec 42); `CircuitBreaker` copiado en `notificaciones/infrastructure/resend`.
- Permiso `plat.fe.configurar` (sensible, aal2) en el manifiesto `1.26.0`.
- Última letra de migración: `01p` (FE). El spec 43, en paralelo, usa `01q`.

## Alcance

**Entra:**

- Puerto `PseOsePort` con `enviarComprobante(credenciales, documento)` y la respuesta común (`ACEPTADO`, `ACEPTADO_CON_OBSERVACIONES`, `RECHAZADO`, `ERROR_TECNICO`, `EN_PROCESO`), y un resolutor que elige el adaptador por código de proveedor.
- Documento de dominio mínimo `DocumentoElectronico` (boleta, tipo 03) que el spec 51 amplía.
- Adaptador `SIMULADO` determinista y adaptador `NUBEFACT` por HTTP (ruta + token), con timeout y circuit breaker.
- Ítem `NUBEFACT` en `PROVEEDOR_FE`; atributos nuevos `serie_prueba` y `dominios_permitidos` en los dos ítems.
- Columna `url_proveedor` en `fe.emisor`, validada contra `dominios_permitidos` (anti-SSRF); `PUT` del emisor la recibe.
- Prueba en beta asíncrona: `POST /v1/fe/emisores/{empresaId}/prueba` responde 202 y deja `prueba_estado = EN_PROCESO`; evento interno `fe.prueba.solicitada` por outbox; cola BullMQ `fe-pruebas` en el worker que envía la boleta de prueba y guarda el resultado. Aceptada → `VERIFICADO`.
- Correlativo de prueba propio del emisor (`pruebas_enviadas`), sin tocar SEQ.
- Paso a producción: `POST /v1/fe/emisores/{empresaId}/produccion` con las reglas de prueba aceptada en las últimas 24 h, entorno que lo permite, proveedor distinto de `SIMULADO` y certificado vigente si el proveedor lo requiere.
- `SIMULADO` solo elegible donde el entorno lo permite (dev y CI).
- Cambios de configuración después de verificar: vuelven a `CONFIGURADO` o se rechazan en producción (ver Decisiones).
- Eventos `fe.emisor.verificado` y `fe.emisor.produccion_habilitada` con esquema registrado.
- Variables de entorno `FE_PRODUCCION_PERMITIDA` y `FE_SIMULADO_PERMITIDO`.
- Migración `db/01r_fe_prueba.sql` con inverso y prueba SQL.

**No entra (specs futuros):**

- Emisión real de boleta y factura, series de SEQ y `ComprobantePort` (spec 51).
- `enviarResumen`, `enviarBaja` y `consultarTicket` del puerto (specs 55 y 56).
- CDR en ARC y procesamiento de la respuesta de comprobantes reales (spec 52).
- Adaptador OSE o SUNAT directo, UBL propio y firma (spec 51b, condicional).
- Volver de `PRODUCCION` a `BETA`.
- Historial de pruebas en tabla propia: queda la última prueba en el emisor y la auditoría de cada solicitud.
- UI del emisor (spec 62) y correo con el resultado de la prueba.
- Homologación formal con el PSE (R2-14).

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `comprobantes` (spec 49: `Emisor`, repositorio, `ConfigurarEmisor`, `VistaEmisor`, `ProveedoresFe`, eventos y esquemas) | Se amplía: estados nuevos, `urlProveedor`, prueba y producción. |
| `secretos` (`BOVEDA_SECRETOS.leer`) | El worker lee el token (`fe.credencial`) solo al enviar; nunca sale del adaptador. |
| `notificaciones` (spec 42: `not.mensaje.solicitado` → `not-envios`, `CircuitBreaker`) | Patrón de evento interno por outbox, cola con `jobId`, reintentos y circuit breaker (se copia, FE no depende de NOT). |
| `eventos` (`@SuscribirEvento`, registro de esquemas) | Consumidor de `fe.prueba.solicitada` y esquemas nuevos en `registrarEsquemasFe`. |
| `catalogos` (`CATALOGO_PORT`) | Atributos `serie_prueba`, `dominios_permitidos`, `requiere_certificado`. |
| `seguridad` (`@Permiso`), `auditoria` (`@Auditable`) | `plat.fe.configurar` con aal2 y auditoría de prueba y producción. |
| `apps/worker/src/notificaciones/` | Molde del módulo de cola `fe-pruebas` con cierre ordenado. |

## Modelo de datos

### Migración `db/01r_fe_prueba.sql` (+ `db/rollback/01r_fe_prueba.sql`, `db/tests/01r_fe_prueba.test.sql`)

```sql
ALTER TABLE fe.emisor
  ADD COLUMN url_proveedor              varchar(255),
  ADD COLUMN pruebas_enviadas           integer NOT NULL DEFAULT 0 CHECK (pruebas_enviadas >= 0),
  ADD COLUMN prueba_estado              varchar(12)
                                          CHECK (prueba_estado IN ('EN_PROCESO','ACEPTADA','RECHAZADA','ERROR')),
  ADD COLUMN prueba_solicitada_en       timestamptz,
  ADD COLUMN prueba_resultado_en        timestamptz,
  ADD COLUMN prueba_codigo              varchar(20),
  ADD COLUMN prueba_descripcion         varchar(500),
  ADD COLUMN produccion_habilitada_en   timestamptz,
  ADD COLUMN produccion_habilitada_por  uuid,
  ADD CONSTRAINT ck_emisor_url_https CHECK (url_proveedor IS NULL OR url_proveedor LIKE 'https://%'),
  ADD CONSTRAINT ck_emisor_produccion CHECK ((estado = 'PRODUCCION') = (ambiente = 'PRODUCCION'));
```

- Semilla: ítem `NUBEFACT` («Nubefact (PSE)») en `PROVEEDOR_FE` con `atributos = {"requiere_certificado": false, "soporta_resumen": true, "url_beta": null, "serie_prueba": "BBB1", "dominios_permitidos": ["api.nubefact.com"]}`; a `SIMULADO` se le agregan `"serie_prueba": "B999"` y `"dominios_permitidos": ["simulador.invalid"]`. Dominio y serie de Nubefact confirmados con la cuenta demo: `B001` responde código 21 («No puedes emitir comprobantes con esta serie») y `BBB1`, la serie de boletas de las cuentas demo, se registra.
- RLS sin cambios (las políticas del 49 cubren las columnas nuevas).
- Inverso: quita columnas, CHECK e ítem `NUBEFACT` y los atributos nuevos de `SIMULADO`. Se niega si hay emisores en `VERIFICADO` o `PRODUCCION` (el 49 no sabe tratarlos) o con proveedor `NUBEFACT`.
- Prueba SQL: `PRODUCCION` sin ambiente `PRODUCCION` falla y al revés; URL `http://` falla; aislamiento con dos `app.tenant_id` sobre las columnas nuevas.

### Dominio (`libs/plataforma/comprobantes/src/domain/`)

- `estado-emisor.ts`: `ESTADOS_PRUEBA = ['EN_PROCESO','ACEPTADA','RECHAZADA','ERROR']`; `VIGENCIA_PRUEBA_HORAS = 24`; `PRUEBA_ATASCADA_MINUTOS = 10`.
- `emisor.ts`:
  - `configurarProveedor` suma `urlProveedor` (validada aparte contra el catálogo). Si el emisor está `VERIFICADO` y cambia proveedor, URL, credencial o certificado → vuelve a `CONFIGURADO` y la prueba se limpia. En `PRODUCCION`: rotar credencial o certificado se permite y sigue en `PRODUCCION` (TR-RNF-113, rotación sin interrupción); cambiar proveedor o URL → `EmisorEnProduccionError`.
  - `solicitarPrueba(ahora)`: exige `CONFIGURADO` o `VERIFICADO` (otro → `EstadoEmisorInvalidoError`); con una prueba `EN_PROCESO` de menos de `PRUEBA_ATASCADA_MINUTOS` → `PruebaEnCursoError`. Suma `pruebas_enviadas`, pone `EN_PROCESO` y devuelve el número de prueba.
  - `registrarResultadoPrueba(numero, respuesta, ahora)`: ignora resultados de un número que no es el último (prueba vieja). `ACEPTADO` o `ACEPTADO_CON_OBSERVACIONES` → `ACEPTADA` y estado `VERIFICADO` (devuelve si pasó a `VERIFICADO`, para el evento); `RECHAZADO` → `RECHAZADA`; `ERROR_TECNICO` final → `ERROR`. Guarda código y descripción (máx. 500, recortada).
  - `habilitarProduccion(ahora, reglas)`: `reglas = { produccionPermitida, esSimulado, requiereCertificado }`. Falla en orden: entorno no lo permite → `ProduccionNoPermitidaError`; `SIMULADO` → `ProveedorSimuladoEnProduccionError`; no `VERIFICADO` o prueba aceptada de más de 24 h → `PruebaBetaRequeridaError`; certificado requerido y vencido o ausente → `CertificadoVencidoError` (del 49). Pone `ambiente` y `estado` en `PRODUCCION`.
- `documento-electronico.ts`: `DocumentoElectronico { tipo: '03'; serie; numero; fechaEmision; emisorRuc; moneda: 'PEN'; adquirente: { tipoDocumento: '-'; numero: '-'; nombre: 'CLIENTES VARIOS' }; items: [{ descripcion; cantidad; valorUnitario; igv; total }]; totales }`. `boletaDePrueba(emisorRuc, serie, numero, fecha)` arma S/ 1.00 con IGV del 18 % redondeado a 2 decimales (constantes con nombre).
- `respuesta-pse.ts`: `ResultadoPse` y `RespuestaPse { resultado; codigo; descripcion; observaciones: string[]; hash?: string; enlaces?: Record<string, string> }`.
- `url-proveedor.ts`: `exigirUrlPermitida(url, dominiosPermitidos)`: https, host exacto en la lista, sin credenciales en la URL, sin puerto distinto de 443 → si no, `UrlProveedorNoPermitidaError`.
- `errores.ts` suma los anteriores con códigos `EMISOR_EN_PRODUCCION`, `ESTADO_EMISOR_INVALIDO`, `PRUEBA_EN_CURSO`, `PRODUCCION_NO_PERMITIDA`, `PROVEEDOR_SIMULADO_EN_PRODUCCION`, `PRUEBA_BETA_REQUERIDA`, `URL_PROVEEDOR_NO_PERMITIDA`. Ninguno lleva token ni URL completa.
- `eventos-fe.ts` suma `fe.emisor.verificado`, `fe.emisor.produccion_habilitada` y el interno `fe.prueba.solicitada`.

### Puertos (`application/ports/`)

```ts
export interface CredencialesPse {
  url: string | null;
  usuario: string | null;
  token: string;                 // leído de la bóveda en el worker; no se registra
  ambiente: AmbienteEmisor;
}

/** Contrato a nivel de comprobante de dominio: un adaptador OSE o SUNAT directo (51b) se agrega sin tocar el dominio. */
export interface PseOsePort {
  /** Nunca lanza por rechazo: RECHAZADO es respuesta. Timeout, red, 5xx, 429 y circuito abierto → ERROR_TECNICO. */
  enviarComprobante(credenciales: CredencialesPse, documento: DocumentoElectronico): Promise<RespuestaPse>;
}

export interface ResolutorPse {
  /** ProveedorFeInvalidoError si no hay adaptador para el código. */
  para(proveedor: string): PseOsePort;
}

export interface ColaPruebasFe {
  /** jobId = `${emisorId}-${numeroPrueba}` (BullMQ no admite `:` en un jobId propio); repetido no duplica. */
  encolar(prueba: { tenantId: string; emisorId: string; numeroPrueba: number }): Promise<void>;
}
```

`ProveedoresFe.obtener` (49) devuelve además `seriePrueba` y `dominiosPermitidos` (atributos `serie_prueba` y `dominios_permitidos`).

### Casos de uso (`application/`)

- `ConfigurarEmisor` (49, cambia): recibe `urlProveedor?`; si el proveedor tiene `dominios_permitidos` no vacíos y la URL falta o no está permitida → 400. `FE_SIMULADO_PERMITIDO=false` y proveedor `SIMULADO` → `ProveedorFeInvalidoError`. Aplica las reglas de cambio tras verificar o en producción.
- `CargarCertificado` (49, cambia): mismas reglas de vuelta a `CONFIGURADO` o rotación en producción.
- `SolicitarPruebaEmisor(empresaId)`, en una transacción: `solicitarPrueba`, guarda y publica `fe.prueba.solicitada` (`{ emisorId, numeroPrueba }`) por outbox. Responde 202 con la vista. Audita.
- `EncolarPruebaEmisor` (consumidor en el worker): idempotente por `event_id` y por `jobId`.
- `EjecutarPruebaEmisor` (procesador de `fe-pruebas`, con el contexto del tenant): relee el emisor; si la prueba ya no es la última o no está `EN_PROCESO`, termina. Lee el token de la bóveda, arma `boletaDePrueba` con `serie_prueba` y el número, llama a `resolutor.para(proveedor).enviarComprobante`. `ERROR_TECNICO` → relanza para que BullMQ reintente (3 intentos, backoff exponencial desde 5 s); en el último → `ERROR`. `EN_PROCESO` (el PSE registró la boleta sin error y SUNAT aún no responde) cuenta como `ACEPTADO`: la prueba en beta comprueba ruta, credencial y formato, y Nubefact envía a SUNAT al día siguiente, según su política. Otro resultado → `registrarResultadoPrueba`; si pasó a `VERIFICADO`, publica `fe.emisor.verificado`. Log estructurado con emisor, número y resultado, sin token ni URL.
- `HabilitarProduccion(empresaId)`, en una transacción: lee reglas (entorno, catálogo), `habilitarProduccion`, guarda, publica `fe.emisor.produccion_habilitada`. Audita.

### Eventos (outbox, con esquema en `registrarEsquemasFe`)

| Evento | Carga | Cuándo |
| --- | --- | --- |
| `fe.prueba.solicitada` (interno) | `{ emisorId, numeroPrueba }` | Al solicitar la prueba. |
| `fe.emisor.verificado` | `{ emisorId, empresaId, proveedor }` | La prueba es aceptada y el emisor pasa a `VERIFICADO`. |
| `fe.emisor.produccion_habilitada` | `{ emisorId, empresaId, proveedor }` | El emisor pasa a `PRODUCCION`. |

Ninguna carga lleva token, usuario, URL ni contenido del certificado.

### HTTP (`interface/emisores.controller.ts`, bajo `/v1/fe`)

| Método y ruta | Permiso | Respuestas |
| --- | --- | --- |
| `PUT /emisores/{empresaId}` (cambia) | `plat.fe.configurar` (aal2) | Lo del 49, más `urlProveedor`; 400 `URL_PROVEEDOR_NO_PERMITIDA`; 409 `EMISOR_EN_PRODUCCION`. |
| `POST /emisores/{empresaId}/prueba` | `plat.fe.configurar` (aal2) | 202 vista con `prueba.estado = EN_PROCESO`; 404 `EMISOR_NO_ENCONTRADO`; 409 `ESTADO_EMISOR_INVALIDO`, `PRUEBA_EN_CURSO`. |
| `POST /emisores/{empresaId}/produccion` | `plat.fe.configurar` (aal2) | 200 vista en `PRODUCCION`; 409 `PRODUCCION_NO_PERMITIDA`, `PROVEEDOR_SIMULADO_EN_PRODUCCION`, `PRUEBA_BETA_REQUERIDA`; 422 `CERTIFICADO_VENCIDO`. |

- `VistaEmisor` suma `urlProveedor` y `prueba: { estado, numero, solicitadaEn, resultadoEn, codigo, descripcion } | null` y `produccionHabilitadaEn`. La UI (spec 62) consulta `GET` hasta que la prueba deja `EN_PROCESO`.

### Infraestructura

- `pse/simulador/pse.simulador.ts`: sin red, determinista según el token: `SIMULAR_RECHAZO` → `RECHAZADO` (código `2800`), `SIMULAR_ERROR` → `ERROR_TECNICO`, otro → `ACEPTADO` con hash ficticio. Constantes con nombre.
- `pse/nubefact/pse.nubefact.ts`: `fetch` a `url_proveedor` con la cabecera de token (formato, operación y campos JSON por la documentación de Nubefact al implementar), timeout de 15 s con `AbortSignal.timeout`, `CircuitBreaker` local (5 fallos, 30 s). Mapeo: respuesta con aceptación → `ACEPTADO` u `ACEPTADO_CON_OBSERVACIONES`; errores de validación del PSE → `RECHAZADO` con su código; timeout, red, 5xx, 429 → `ERROR_TECNICO`. No registra cuerpo de petición ni respuesta completa.
- `pse/nubefact/mapeo-nubefact.ts`: `DocumentoElectronico` → JSON de Nubefact y su respuesta → `RespuestaPse`, funciones puras con pruebas.
- `pse/resolutor-pse.ts`: mapa `{ SIMULADO, NUBEFACT }`.
- `pse/circuit-breaker.ts`: copia del de `notificaciones`.
- `bullmq/cola-pruebas.ts`: `abrirColaPruebasFe(redisUrl)`.
- `interface/entorno-fe.ts`: `camposEntornoFe` con `FE_PRODUCCION_PERMITIDA` y `FE_SIMULADO_PERMITIDO` (booleanos, por defecto `false`). `.env.example` y el `.env` de dev con `FE_SIMULADO_PERMITIDO=true`.
- Entidad y mapeo de `fe.emisor`: columnas nuevas.

### Composición

- `ComprobantesModule.register({ entorno })` suma los casos de uso de prueba y producción; `ComprobantesModule.registerWorker({ redisUrl, entorno })` suma el consumidor, el procesador y el resolutor.
- `apps/worker/src/certificados-fe/` (o carpeta hermana `pruebas-fe/`) con la cola `fe-pruebas` y cierre ordenado.
- Manifiesto sin cambios: todo usa `plat.fe.configurar`.
- `eslint.config.mjs`: la matriz de `comp:fe` ya incluye `sec`, `cat`, `evt`; se comprueba en `tools/boundaries-test`.
- `docs/ops/supabase-ambientes.md`: sección FE con las dos variables por ambiente (dev: simulador sí, producción no; staging: simulador no, producción no; prod: simulador no, producción sí) y el alta de la cuenta demo de Nubefact.

## Plan de implementación

1. **Migración.** `01r_fe_prueba.sql`, inverso y prueba SQL (CHECK de producción y https, semilla de `NUBEFACT`, inverso que se niega con emisores verificados).
2. **Dominio.** Estados de prueba, `solicitarPrueba`, `registrarResultadoPrueba`, `habilitarProduccion`, reglas de cambio tras verificar, `boletaDePrueba`, `exigirUrlPermitida`, con pruebas: prueba vieja ignorada, prueba atascada de 11 min se puede repetir, aceptada hace 25 h no habilita producción, URL con otro host, con `user@`, con puerto 8443.
3. **Simulador y resolutor.** `PseSimulador`, `ResolutorPse` y entorno `FE_*`.
4. **Prueba asíncrona.** `SolicitarPruebaEmisor`, evento interno, consumidor, cola `fe-pruebas`, `EjecutarPruebaEmisor` con el simulador. Pruebas: aceptada → `VERIFICADO` y evento una vez; rechazo; `ERROR_TECNICO` × 3 → `ERROR`; Redis caído no pierde la solicitud (queda en outbox).
5. **Producción y cambios.** `HabilitarProduccion`, cambios a `ConfigurarEmisor` y `CargarCertificado`, controlador, DTO, OpenAPI, `@Auditable`.
6. **Nubefact.** Leer su documentación de la API (operación, cabeceras, campos, códigos de error, dominio y modo demo) antes de escribir; mapeo y adaptador con pruebas sobre respuestas grabadas.
7. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` en Supabase dev; humo con la API y el worker locales: emisor `SIMULADO` de una empresa de dev → prueba → `VERIFICADO` → producción rechazada por `PROVEEDOR_SIMULADO_EN_PRODUCCION`; con la cuenta demo de Nubefact (ruta y token que entrega el usuario) → prueba aceptada → `VERIFICADO`; `npx nx run-many -t lint test -p comprobantes api worker migrar boundaries-test`.

## Criterios de aceptación

- [ ] TR-CA-133: emisor `CONFIGURADO` de la empresa con RUC 20601234561 con `SIMULADO`; `POST .../prueba` → 202 `EN_PROCESO`; con el worker en marcha la prueba queda `ACEPTADA`, el emisor `VERIFICADO`, `fe.emisor.verificado` se publica una vez y `POST .../produccion` deja de responder `PRUEBA_BETA_REQUERIDA`.
- [ ] Con la cuenta demo de Nubefact (humo en dev), la prueba se envía con `serie_prueba` y el siguiente correlativo y queda `ACEPTADA`.
- [ ] Rechazo del PSE → prueba `RECHAZADA` con código y descripción; el emisor sigue `CONFIGURADO`.
- [ ] `ERROR_TECNICO` se reintenta 3 veces con backoff y deja la prueba en `ERROR`; un PSE caído no bloquea la API (el `POST` responde 202 sin llamar al PSE).
- [ ] Una segunda solicitud con una prueba `EN_PROCESO` de menos de 10 min → 409 `PRUEBA_EN_CURSO`; pasados 10 min se acepta y el resultado de la prueba vieja se ignora.
- [ ] Cada prueba usa un número nuevo (`pruebas_enviadas` + 1); la misma prueba no se envía dos veces aunque el evento se repita (`jobId`).
- [ ] Producción: sin prueba aceptada en las últimas 24 h → 409 `PRUEBA_BETA_REQUERIDA`; con `FE_PRODUCCION_PERMITIDA=false` → 409 `PRODUCCION_NO_PERMITIDA`; con `SIMULADO` → 409 `PROVEEDOR_SIMULADO_EN_PRODUCCION`; proveedor que requiere certificado con certificado vencido → 422 `CERTIFICADO_VENCIDO`. Si todo se cumple, `estado` y `ambiente` quedan en `PRODUCCION` y se publica `fe.emisor.produccion_habilitada`.
- [ ] Con `FE_SIMULADO_PERMITIDO=false`, configurar `SIMULADO` → 400 `PROVEEDOR_FE_INVALIDO`.
- [ ] URL fuera de `dominios_permitidos`, sin https, con credenciales o con otro puerto → 400 `URL_PROVEEDOR_NO_PERMITIDA`; el adaptador nunca llama a otro host.
- [ ] Cambiar proveedor, URL, credencial o certificado de un emisor `VERIFICADO` lo vuelve a `CONFIGURADO`; en `PRODUCCION`, rotar credencial o certificado lo mantiene en `PRODUCCION` y cambiar proveedor o URL → 409 `EMISOR_EN_PRODUCCION`.
- [ ] Sin aal2, `POST .../prueba` y `POST .../produccion` → 401 de step-up; sin `plat.fe.configurar` → 403.
- [ ] TR-RNF-113 y TR-RNF-026: el token solo se lee en el worker al enviar; ninguna respuesta, log, error, evento, fila de `aud` ni `prueba_descripcion` contiene el token ni la URL con credenciales; gitleaks del CI pasa.
- [ ] Aislamiento (TR-RNF-010): otro tenant no solicita prueba ni producción sobre el emisor (404); la prueba SQL cubre las columnas nuevas.
- [ ] `POST .../prueba` y `POST .../produccion` dejan fila en `aud` (TR-RNF-013).
- [ ] OpenAPI documenta las rutas nuevas y el cambio del `PUT` con sus códigos de error.
- [ ] Migración `01r_fe_prueba` reversible y probada en CI contra PostgreSQL 16.
- [ ] Cobertura de dominio de `comprobantes` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM, sin SQL crudo nuevo.
- [ ] `npx nx run-many -t lint test -p comprobantes api worker migrar boundaries-test` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** Nubefact como PSE real, más el simulador. Decisión del usuario. PSE con API JSON que genera y firma el XML: no hace falta el 51b y el modo demo sirve de beta.
- **No (por ahora):** SUNAT directo (SEE-Del Contribuyente). Evita el costo por comprobante, pero exige UBL 2.1, firma XMLDSig, SOAP con usuario secundario SOL y mantenimiento ante cambios de SUNAT (spec 51b), y la RS 000048-2026/SUNAT restringe la emisión a SEE-OSE en el régimen que regula; se revisa antes de reconsiderarlo. El puerto a nivel de comprobante permite agregarlo sin tocar el dominio.
- **Sí:** `PseOsePort` con `enviarComprobante` y la respuesta común. Decisión del usuario. La prueba en beta es enviar un comprobante; resumen, baja y ticket llegan con sus specs.
- **Sí:** prueba asíncrona por outbox y cola `fe-pruebas`. Decisión del usuario. Un PSE lento no retiene la petición y una caída de Redis no pierde la solicitud.
- **Sí:** última prueba en columnas de `fe.emisor`, sin tabla de historial. Decisión del usuario. La auditoría registra cada solicitud.
- **Sí:** `url_proveedor` como columna nueva y token en la bóveda. Decisión del usuario. La ruta no es secreta y la UI la muestra; el token sí.
- **Sí:** URL validada contra `dominios_permitidos` del catálogo. Un tenant con `plat.fe.configurar` no debe poder hacer que el worker llame a hosts arbitrarios (SSRF).
- **Sí:** correlativo de prueba propio (`pruebas_enviadas`) con `serie_prueba` del catálogo. Decisión del usuario. No mezcla pruebas con las series reales de SEQ.
- **Sí:** las cuatro reglas para producción: prueba aceptada en 24 h, entorno, sin `SIMULADO`, certificado vigente si se requiere. Decisión del usuario.
- **Sí:** `SIMULADO` solo con `FE_SIMULADO_PERMITIDO=true` (dev y CI). Decisión del usuario.
- **Sí:** tras verificar, cambiar la configuración invalida la prueba; en producción, rotar secretos no interrumpe y cambiar proveedor o URL se rechaza. Una prueba solo vale para la configuración con la que se hizo; TR-RNF-113 pide rotación sin interrupción.
- **No:** volver de producción a beta. Sin caso de uso hoy; si hace falta, va en su propio spec con sus reglas sobre comprobantes emitidos.
- **No:** permiso nuevo. Prueba y producción son pasos 4 y 5 de TR-RF-052 y usan `plat.fe.configurar` con aal2; el manifiesto no cambia y no choca con el spec 43.
- **Sí:** `CircuitBreaker` copiado a FE. FE no depende de NOT; si un tercero lo necesita, se sube a `kernel-infra`.
- **Sí:** migración `01r` (el spec 43, en paralelo, usa `01q`).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La API de Nubefact (operación, cabecera de token, dominio, serie de demo) difiere de lo asumido | Paso 6 empieza leyendo su documentación; el dominio y la serie viven en el catálogo y se corrigen en la semilla sin tocar código. Si no hay documentación accesible, el adaptador se separa a un 50b y este cierra con el simulador. |
| Sin cuenta demo de Nubefact no hay humo real | El usuario entrega ruta y token de demo al implementar; sin ellos se dice así en el cierre y el criterio del humo queda pendiente. |
| La estimación (7-8 h) supera la del roadmap | El adaptador Nubefact es el corte natural si se pasa de 10 h. |
| Prueba atascada en `EN_PROCESO` si el worker muere entre reintentos | Se puede pedir otra pasados 10 min; el número nuevo hace que el resultado viejo se ignore. |
| Las ramas paralelas 43 y 50 chocan en `package.json`, `env.ts`, módulos de api y worker | Solo el 43 cambia el manifiesto; letras `01q` y `01r`; conflictos de líneas contiguas. El segundo PR se rebasa sobre el primero. |

## Lo que **no** entra en este spec

- Emisión real, series de SEQ y CDR (specs 51 y 52).
- Resumen, baja y ticket en el puerto (specs 55 y 56).
- OSE o SUNAT directo con UBL y firma propios (spec 51b).
- Volver a beta, historial de pruebas y UI del emisor (spec 62).
- Homologación formal con el PSE (R2-14).

Cada uno, si llega, va en su propio spec.
