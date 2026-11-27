# SPEC 17d — Organización: logo, teléfono, correo y página web de la empresa, con ubigeo autocompletado y teléfono con máscara en empresa y sucursal

> **Status:** Aprobado
> **Depends on:** SPEC 17a, SPEC 17b, SPEC 17c, SPEC 19a, SPEC 33, SPEC 36, SPEC 38, SPEC 15b, SPEC 15c, SPEC 15d
> **Date:** 2026-11-27
> **Objective:** Agregar a la empresa de ORG el logo, el teléfono, el correo y la página web, editables en el formulario de empresa de `admin-cliente`, con el logo subido a TR-ARC en una categoría propia, visible en la lista de empresas y en el detalle del tenant de la consola, y listos para que los lea la representación impresa del spec 53; además, los formularios de empresa y de sucursal eligen el ubigeo con autocompletado («LIMA / LIMA / MIRAFLORES») y escriben el teléfono con una máscara peruana que lo guarda en E.164.

## Por qué existe este spec

Fila 17d de `docs/roadmap-specs.md`. No tiene historia en el plan. Salió al revisar el 47 y el 53:

- el logo es identidad de la empresa, no configuración de la facturación;
- lo usarán el PDF del comprobante (53), los correos y SazónPOS;
- una empresa sin emisor electrónico también tiene logo.

El 53 se ajustó el 2026-11-27 para leer estos datos de la empresa y depende de este spec.

Se analizó también la tabla `core.restaurants` de SazónPOS. Lo que es de la sucursal o del producto (coordenadas, delivery, `slug`, descripción) quedó anotado en la fila del spec 22. Aquí solo entran los datos de la empresa que se imprimen en un comprobante.

Al revisar el canvas, el usuario pidió dos cosas más para los formularios de empresa y de sucursal:

- el ubigeo como autocompletado con el nombre completo, en lugar del código numérico;
- una máscara en el teléfono para evitar errores de tipeo.

Estimado: 11-12 h (1,5 h de canvas, 4 h de back y 6-6,5 h de front). Pasa el tope de 10 h por decisión del usuario, que prefirió un solo spec para cerrar la identidad de la empresa antes del 47 y el 53. Si en la implementación se ve que no cabe, se recorta en este orden: (1) el logo en la consola, (2) la miniatura de la lista. Lo recortado pasaría a un 17e.

Lo que hay en el código hoy (revisado al redactar):

- `org.empresa` (`db/01a_org.sql`): `ruc`, `razon_social`, `nombre_comercial`, `direccion_fiscal`, `ubigeo`, `activo` y `version`. Sin logo ni contacto.
- `org.sucursal` ya tiene `telefono varchar(30)`, de texto libre y sin `CHECK`, y `zona_horaria`.
- Dominio `Empresa` (`libs/plataforma/org/src/domain/empresa.ts`): `DatosEmpresa { razonSocial, nombreComercial, direccionFiscal, ubigeo }`. `editar(datos)` publica `empresa.actualizada`.
- El esquema del evento (`infrastructure/event-schemas.ts`) lleva `ruc`, `razon_social` y `nombre_comercial`.
- Persistencia con TypeORM (`infrastructure/typeorm/empresa.repositorio.ts`).
- HTTP en `apps/api/src/org/empresas.controller.ts`:
  - `GET`, `GET :id`, `POST` y `PUT :id` bajo `/v1/org/empresas`;
  - `PUT` con `version` y permiso `plat.empresa.crear`;
  - errores por `org.filtro.ts` (`ValidationError` → 400).
- Límites de `eslint.config.mjs`: `comp('org', 'kernel')`. ORG no puede importar ARC. El patrón para hablar con otro componente es un puerto de ORG con adaptador en `apps/api`, como `PadronRucPort` (spec 28b).
- ARC:
  - categorías en `db/01m_arc.sql`. `IMAGEN` acepta jpeg, png y webp hasta 10 MB; pdfkit (53) no lee webp;
  - `ArchivoPort.estado(archivoId)` devuelve estado y categoría, pero no la entidad a la que pertenece el archivo;
  - `ArchivoPort.urlDescarga` firma URLs de 60 a 900 s y trabaja sobre el tenant del contexto.
- `archivos-ui` exporta `ArchivoCargaComponent` (`vit-archivo-carga`, con `categoria`, `entidadTipo`, `entidadId` y la salida `disponible`) y `ArchivosCliente`. Subir exige un `entidad_id`: en el alta la empresa todavía no existe.
- Manifiesto PLAT `1.30.0`. `PLAT_PROPIETARIO` tiene `plat.organizacion.consultar` y `plat.empresa.crear`. Ningún rol PLAT tiene `plat.archivo.subir` ni `plat.archivo.descargar`.
- `personas-ui` (38) exporta `UbigeoAutocompletarComponent` (`vit-ubigeo-autocompletar`), `UbigeosService` y `formatoUbigeo`:
  - busca por distrito, provincia o departamento y muestra «AREQUIPA / AREQUIPA / CAYMA»;
  - el catálogo `UBIGEO` se baja una vez por sesión y exige `plat.catalogo.leer`, que `PLAT_PROPIETARIO` ya tiene;
  - recibe un `FormControl<ValorUbigeo>` (`Ubigeo | string | null`). No convierte un código guardado (`150122`) en el `Ubigeo` del catálogo, y la etiqueta «Distrito» viene fija de los mensajes de la ficha.
- No hay librería de máscaras en `package.json` (no está `ngx-mask`) ni ninguna directiva de máscara en `shared/ui`.
- Front:
  - `empresa-formulario` (17c) usa un solo grid con RUC, razón social, nombre comercial, ubigeo y dirección fiscal, y sirve para el alta y para la edición;
  - en `empresa-formulario` y en `sucursal-formulario` el ubigeo es un `input` numérico de 6 dígitos y el teléfono de la sucursal es texto libre;
  - `empresas-lista` (17c);
  - `consola-tenants/tenant-detalle` (17b) muestra RUC y razón social de la empresa principal.
- Última letra de migración en `main`: `01x`. Los specs 46 y 47 proponen `01y`. Como este se implementa primero, toma la siguiente libre al implementar.

## Pantalla tipo

- **Formulario de empresa** (pantalla tipo formulario):
  - cambia en dos tarjetas, «Datos tributarios» (lo de hoy) e «Identidad y contacto» (logo, teléfono, correo y web);
  - son dos secciones, así que no van plegables (la regla de `CLAUDE.md` empieza en tres);
  - el logo usa la zona de `vit-archivo-carga` con una miniatura al lado.
- **Formulario de sucursal** (pantalla tipo formulario): cambia solo en el ubigeo autocompletado y el teléfono con máscara.
- **Lista de empresas** (pantalla tipo lista): cambia en una miniatura de 32 px junto a la razón social.
- **Detalle de tenant en la consola** (pantalla tipo detalle): cambia en el logo junto a la empresa principal.
- Diseño en el canvas «Vitrina · Diseño UI», página «17d · Identidad de empresa» (paso 1), con 17 artboards dibujados el 2026-11-27 (incluye el formulario de sucursal) y pendientes del visto bueno del usuario. Se verifica en claro, oscuro y a 600 px.

## Alcance

**Entra:**

- **Base de datos:**
  - columnas `logo_archivo_id`, `telefono`, `correo` y `sitio_web` en `org.empresa`, todas opcionales;
  - el teléfono se guarda en E.164 peruano: `+51` seguido de un celular de 9 dígitos que empieza con 9, o de un fijo de 8 dígitos (código de área sin el 0 más el número);
  - `org.sucursal.telefono` pasa al mismo formato: la migración normaliza los valores que puede y el `CHECK` nuevo se aplica a lo que se escriba desde ahora;
  - categoría ARC `LOGO` (jpeg y png, hasta 1 MB, no sensible).
- **Dominio ORG:**
  - valores `Telefono` (normaliza a E.164 y lo usan empresa y sucursal), `CorreoEmpresa` y `SitioWeb`;
  - `formatoTelefono(e164)`, exportado en `index.ts` para el PDF del 53: «987 654 321» o «(01) 555-0101»;
  - `DatosEmpresa` suma los tres campos y `logoArchivoId`;
  - `crear` acepta teléfono, correo y web; el logo solo se asigna al editar.
- **Puerto `ValidadorLogoPort`** en ORG con su adaptador sobre ARC en `apps/api`. El archivo debe ser:
  - de categoría `LOGO`;
  - `DISPONIBLE`;
  - de la entidad `EMPRESA` con el id de esa empresa.
  - Si no, `400 LOGO_INVALIDO` con su motivo.
- **ARC:** `EstadoArchivo` suma `entidadTipo` y `entidadId`.
- **HTTP ORG:**
  - `POST` acepta `telefono`, `correo` y `sitio_web`;
  - `PUT` acepta además `logo_archivo_id` (`null` quita el logo);
  - `GET` y la lista devuelven los cuatro campos.
- **Consola:** `GET /v1/org/tenants/{id}` suma a la empresa principal `logo_url` y `logo_expira_en`, con una URL firmada de 300 s que arma `apps/api`. Sin logo, `null`.
- **Manifiesto PLAT `1.30.0` → `1.31.0`:** `plat.archivo.subir` y `plat.archivo.descargar` en `PLAT_PROPIETARIO`.
- **Ubigeo autocompletado** en `empresa-formulario` y `sucursal-formulario` con `vit-ubigeo-autocompletar` (38):
  - se elige «LIMA / LIMA / MIRAFLORES» y se guarda el código `150122`, como hoy;
  - al editar, el código guardado se muestra con su nombre completo;
  - sin `plat.catalogo.leer` o si el catálogo no carga, el campo se deshabilita con un aviso y conserva el código guardado.
- **Teléfono con máscara** en los dos formularios, con la directiva `vitTelefono` de `shared/ui`:
  - solo deja escribir dígitos (y un `+51` inicial, que se quita);
  - reconoce celular o fijo por el primer dígito y da formato mientras se escribe: «987 654 321», «(01) 555-0101», «(054) 123-456»;
  - el formulario envía el número en E.164 y muestra el guardado con formato.
- **Front `admin-cliente`:**
  - tarjeta «Identidad y contacto» en `empresa-formulario`. En el alta, el logo se muestra deshabilitado con «Se habilita al registrar la empresa». Al registrar, la pantalla pasa a edición con el aviso «Empresa registrada. Ahora puede subir el logo»;
  - el logo subido queda como cambio pendiente y se asigna con «Guardar cambios», en el mismo `PUT` y con la misma versión;
  - «Quitar logo» también es un cambio del formulario;
  - miniatura del logo en `empresas-lista`, con la inicial de la razón social si no hay logo o no hay permiso para verlo.
- **Front `consola-tenants`:** el logo de la empresa principal en `tenant-detalle`.

**No entra (specs futuros):**

- Leer el logo y los datos de contacto en el PDF: spec 53.
- Logo y marca del tenant en los correos (layout de las plantillas del 47).
- Marca del tenant para el sitio web: CMS, spec 83.
- Correo y coordenadas de la sucursal, parámetros de delivery, `slug` y descripción: spec 22 (SazónPOS).
- Recortar o redimensionar el logo en el navegador.
- Pedir el logo en el alta de tenant de la consola (spec 12): el cliente lo sube después en su empresa.
- Teléfonos de otros países: solo números de Perú.
- Mover `vit-ubigeo-autocompletar` de `personas-ui` a otra lib: se reutiliza donde está.
- Ubigeo y teléfono en las direcciones y contactos de personas (32): ya tienen su propio campo; la máscara se les puede aplicar en otro spec.
- Limpiar logos que dejaron de usarse: retención de ARC (spec 69).

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `Empresa`, `validarDatos` y `valores.ts` (03, 17a) | Se amplían con los campos nuevos y sus valores. |
| `empresa.repositorio.ts` (TypeORM) | Entidad y mapeo con las cuatro columnas. |
| `PadronRucPort` y su adaptador en `apps/api` (28b) | Molde de `ValidadorLogoPort`, con su adaptador y su registro en `apps/api`. |
| `empresas.controller.ts`, `organizacion.http.ts` y `org.filtro.ts` | DTO, OpenAPI y el error nuevo. |
| `consulta-tenants.ts` (17b) | Suma la URL del logo de la empresa principal. |
| `ArchivoPort.estado` y `urlDescarga` (33) | Validación del logo y URLs firmadas. |
| `vit-archivo-carga` y `ArchivosCliente` (36) | Zona de carga y URL de descarga de la miniatura. |
| `vit-ubigeo-autocompletar`, `UbigeosService` y `formatoUbigeo` (38) | Ubigeo en los dos formularios; se agregan la etiqueta configurable y la búsqueda por código. |
| `sucursal-formulario` (17c) y `Sucursal` (03) | Ubigeo autocompletado y teléfono con `Telefono`. |
| `empresa-formulario`, `empresas-lista` (17c) y `tenant-detalle` (17b) | Pantallas que se amplían. |

## Modelo de datos

### Migración `db/01y_org_identidad_empresa.sql` (+ rollback y prueba; la letra se confirma al implementar)

```sql
INSERT INTO arc.categoria (codigo, mimes_permitidos, tamano_max_bytes, sensible)
VALUES ('LOGO', ARRAY['image/jpeg', 'image/png'], 1048576, false);

ALTER TABLE org.empresa
  ADD COLUMN logo_archivo_id uuid,          -- sin FK a arc (TR-RNF-119): ORG lo valida por ValidadorLogoPort
  ADD COLUMN telefono        varchar(12)  CHECK (telefono ~ '^\+51(9[0-9]{8}|[1-8][0-9]{7})$'),
  ADD COLUMN correo          varchar(254) CHECK (correo = lower(correo) AND correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  ADD COLUMN sitio_web       varchar(200) CHECK (sitio_web ~ '^https://[^\s/$.?#][^\s]*$');

-- Sucursal: E.164 peruano. Los valores que se pueden normalizar se normalizan; los demás quedan como están.
UPDATE org.sucursal
   SET telefono = '+51' || regexp_replace(regexp_replace(telefono, '\D', '', 'g'), '^(51|0)', '')
 WHERE telefono IS NOT NULL
   AND regexp_replace(regexp_replace(telefono, '\D', '', 'g'), '^(51|0)', '') ~ '^(9[0-9]{8}|[1-8][0-9]{7})$';

ALTER TABLE org.sucursal
  ADD CONSTRAINT ck_sucursal_telefono_e164 CHECK (telefono ~ '^\+51(9[0-9]{8}|[1-8][0-9]{7})$') NOT VALID;
```

- `NOT VALID`: el `CHECK` rige para lo que se escriba desde ahora y no falla por un teléfono viejo que no se pudo normalizar. El formulario lo muestra tal cual y pide corregirlo al guardar.
- La prueba SQL incluye el `VALIDATE CONSTRAINT` en una base limpia, para confirmar que el patrón es el mismo que el de la empresa.
- Las políticas RLS de `org.empresa` y `org.sucursal` no cambian.
- Inverso: quita las cuatro columnas, la categoría y el `CHECK` de la sucursal. Los teléfonos de sucursal quedan en E.164, que también cabe en la columna de texto de antes.
  - Se niega si hay archivos `LOGO`, porque borrar la categoría los dejaría huérfanos.
  - También se niega si alguna empresa tiene logo, teléfono, correo o web, para no perder datos en silencio.
- Prueba SQL:
  - teléfono `+51987654321` y `+5115550101` aceptados; `987654321` (sin `+51`), `+5198765432` (8 dígitos que empiezan con 9) y `abc` rechazados;
  - una sucursal con `987 654 321` queda en `+51987654321`; una con `anexo 12` queda igual y la migración no falla;
  - correo con mayúsculas rechazado;
  - web `http://` rechazada y `https://ejemplo.pe` aceptada;
  - la categoría `LOGO` existe con 1 MB;
  - aislamiento: un tenant no actualiza la empresa de otro.

### Dominio ORG (`libs/plataforma/org/src/domain/`)

- `valores.ts` suma:
  - `Telefono.de(texto)`: quita todo lo que no es dígito, luego un `51` o un `0` inicial, y exige un celular (9 dígitos que empiezan con 9) o un fijo (8 dígitos que empiezan del 1 al 8). Guarda `+51…`. Error `TELEFONO_INVALIDO`. Acepta «987 654 321», «(01) 555-0101», «054 123456» y «+51 987654321»;
  - `formatoTelefono(e164)`: celular «987 654 321»; fijo de Lima «(01) 555-0101»; fijo de provincia «(054) 123-456». Si el valor no es E.164 peruano, lo devuelve tal cual (teléfonos viejos de sucursal);
  - `CorreoEmpresa.de(texto)`: recorta y pasa a minúsculas; formato simple y hasta 254 caracteres; error `CORREO_INVALIDO`;
  - `SitioWeb.de(texto)`: solo `https://` y hasta 200 caracteres; error `SITIO_WEB_INVALIDO`. El dominio no completa el esquema: eso lo hace el front.
- `empresa.ts`:

```ts
export interface DatosEmpresa {
  razonSocial: string;
  nombreComercial: string | null;
  direccionFiscal: string | null;
  ubigeo: string | null;
  telefono: string | null;
  correo: string | null;
  sitioWeb: string | null;
}

export interface EmpresaProps extends DatosEmpresa {
  tenantId: string;
  ruc: string;
  activo: boolean;
  logoArchivoId: string | null;
}
```

- `sucursal.ts`: el teléfono pasa por `Telefono.de` al crear y al editar.
- `editar(datos, logoArchivoId)`: valida los datos. Si el logo cambió, exige que la aplicación ya lo haya validado (recibe un `LogoValidado`, tipo marca que solo crea el caso de uso). Publica `empresa.actualizada`.
- `errores.ts`: `LogoInvalidoError` (`ValidationError`, código `LOGO_INVALIDO`) con `motivo`: `NO_ENCONTRADO`, `NO_DISPONIBLE`, `CATEGORIA` u `OTRA_ENTIDAD`.
- Constantes con nombre: `ENTIDAD_ARCHIVO_EMPRESA = 'EMPRESA'` y `CATEGORIA_LOGO = 'LOGO'`.

### Puerto (`application/ports/validador-logo.port.ts`)

```ts
export const VALIDADOR_LOGO_PORT = Symbol('ValidadorLogoPort');

export type ResultadoValidacionLogo =
  | { valido: true }
  | { valido: false; motivo: 'NO_ENCONTRADO' | 'NO_DISPONIBLE' | 'CATEGORIA' | 'OTRA_ENTIDAD' };

export interface ValidadorLogoPort {
  /** Archivo del tenant del contexto: categoría LOGO, DISPONIBLE y de la entidad EMPRESA con ese id. */
  validar(archivoId: string, empresaId: string): Promise<ResultadoValidacionLogo>;
}
```

- `OrgModule` registra por defecto `ValidadorLogoRechazaTodo`, que siempre responde `NO_ENCONTRADO`: si falta el adaptador real, un logo nunca entra sin validar.
- `apps/api` sobreescribe el proveedor con `ValidadorLogoArchivos` (`apps/api/src/org/validador-logo.archivos.ts`), sobre `ArchivoPort.estado`.

### Casos de uso (`application/empresa.casos-de-uso.ts`)

- `RegistrarEmpresa`: acepta teléfono, correo y web. No recibe logo.
- `EditarEmpresa(empresaId, datos, logoArchivoId, version)`, en la transacción de hoy:
  - si `logoArchivoId` es distinto del guardado y no es `null`, llama a `ValidadorLogoPort.validar`;
  - si no es válido, lanza `LogoInvalidoError` con el motivo;
  - quitar el logo (`null`) no valida nada;
  - conserva el bloqueo optimista y el 409 de versión de hoy.
- `lecturas-organizacion.ts`: la vista de empresa suma `logoArchivoId`, `telefono`, `correo` y `sitioWeb`.

### Eventos

- `empresa.creada` y `empresa.actualizada` suman `logo_archivo_id` (uuid o `null`) en `event-schemas.ts`.
- Teléfono, correo y web no viajan en el evento, que solo lleva identificadores y nombres, como hoy. Un consumidor que los necesite los lee de ORG (TR-RNF-026).

### ARC (`libs/plataforma/archivos`)

- `EstadoArchivo` suma `entidadTipo` y `entidadId`, leídos de `arc.archivo`.
- El DTO HTTP de estado no cambia: el dato solo se usa en proceso.

### HTTP

| Método y ruta | Cambio | Errores nuevos |
| --- | --- | --- |
| `POST /v1/org/empresas` | Cuerpo suma `telefono`, `correo` y `sitio_web` (opcionales). El teléfono se acepta con formato y se devuelve en E.164. | `400 TELEFONO_INVALIDO`, `CORREO_INVALIDO`, `SITIO_WEB_INVALIDO` |
| `PUT /v1/org/empresas/{id}` | Cuerpo suma los tres campos y `logo_archivo_id` (uuid o `null`). | Los tres anteriores y `400 LOGO_INVALIDO` con `motivo` |
| `GET /v1/org/empresas` y `GET /v1/org/empresas/{id}` | Filas con `logo_archivo_id`, `telefono`, `correo` y `sitio_web`. | — |
| `POST /v1/org/empresas/{id}/sucursales` y `PUT /v1/org/sucursales/{id}` | El teléfono pasa por `Telefono` y se devuelve en E.164. | `400 TELEFONO_INVALIDO` |
| `GET /v1/org/tenants/{id}` (consola) | `empresa_principal` suma `logo_url` y `logo_expira_en` (300 s), o `null`. | — |

- OpenAPI de todo lo anterior, con los patrones de los tres campos.
- **Logo en la consola:** el operador está en el tenant de plataforma, y ARC solo firma archivos del tenant del contexto. `consulta-tenants.ts`:
  - lee `logo_archivo_id` con la consulta `SECURITY DEFINER` de hoy;
  - pide la URL a ARC dentro del contexto del tenant consultado, con el mecanismo de cambio de contexto que ya usan los trabajos del worker (se confirma al implementar);
  - si ese mecanismo no sirve desde la API, agrega a `ArchivoSistemaPort` un `urlDescargaDeTenant(tenantId, archivoId, segundos)`, que solo usa `apps/api`, con la razón en Decisiones;
  - un logo que no está `DISPONIBLE` devuelve `null`, sin error;
  - la ruta sigue exigiendo `plat.tenant.consultar`.

### Front `admin-cliente` (`libs/plataforma/admin-cliente/src/lib/`)

- `models/empresa.ts`:
  - `FilaEmpresaRespuesta` y `Empresa` suman `logoArchivoId`, `telefono`, `correo` y `sitioWeb`;
  - `DatosEmpresa` suma los tres campos de contacto;
  - `DatosEdicionEmpresa extends DatosEmpresa { logoArchivoId: string | null }`.
- `utils/validadores-organizacion.ts`:
  - `sitioWeb`, con el patrón del back;
  - `completarEsquemaWeb(texto)`, que antepone `https://` si falta, al salir del campo;
  - el correo usa `Validators.email` y se pasa a minúsculas.
- **Ubigeo en los dos formularios:**
  - el control `ubigeo` pasa a `FormControl<ValorUbigeo>` y usa `vit-ubigeo-autocompletar` con la etiqueta «Ubigeo (departamento / provincia / distrito)»;
  - al cargar una empresa o sucursal, `UbigeosService.porCodigo(codigo)` busca el `Ubigeo` en el catálogo y lo pone en el control. Si el catálogo no cargó, el control queda con el código como texto;
  - al guardar se envía `ubigeo.codigo` (o `null`);
  - texto escrito sin elegir una opción → error «Elija un distrito de la lista»;
  - sin `plat.catalogo.leer`: el campo se deshabilita con el aviso «No tiene permiso para ver el catálogo de ubigeos» y conserva el valor guardado.
- **Teléfono en los dos formularios:** `input` con `vitTelefono`, `inputmode="tel"` y `autocomplete="tel"`. El control guarda el valor en E.164 y la directiva muestra el formato. Errores del campo: «Celular de 9 dígitos que empieza con 9, o fijo con código de área» y, para un teléfono viejo de sucursal que no es E.164, «Corrija el teléfono para guardar».
- `components/logo-empresa/`: miniatura cuadrada con `object-fit: contain` y borde por token.
  - Recibe `url` y `nombre`, en tamaño 32 px (lista) o 96 px (formulario).
  - Sin `url`, o si la imagen falla, muestra la inicial de `nombre`.
- `services/logos-empresa.service.ts`: pide `ArchivosCliente.urlDescarga` por id, guarda la URL hasta que vence y no la pide sin `plat.archivo.descargar`.
- `pages/empresa-formulario`:
  - tarjeta «Datos tributarios» con los campos de hoy;
  - tarjeta «Identidad y contacto»:
    - a la izquierda, `vit-logo-empresa` (96 px) y «Quitar logo» (`vit-destructivo`);
    - a la derecha, `vit-archivo-carga` con `categoria="LOGO"`, `entidadTipo="EMPRESA"` y `[entidadId]="empresaId"`;
    - debajo, teléfono, correo y sitio web.
  - **Alta:** la zona de carga va con `deshabilitado` y la ayuda «Se habilita al registrar la empresa». Al registrar, navega a `empresas/:id/editar` con `replaceUrl` y el estado `recienRegistrada`, que muestra el aviso «Empresa registrada. Ahora puede subir el logo.».
  - **Edición:**
    - `disponible` del componente pone `logoArchivoId` en el formulario y lo marca como modificado;
    - la miniatura usa la URL del archivo recién subido;
    - «Guardar cambios» manda todo en el `PUT`;
    - `LOGO_INVALIDO` se muestra bajo la zona de carga con un texto por motivo.
  - **Sin `plat.archivo.subir`:** la zona no aparece y la ayuda dice «No tiene permiso para subir archivos».
- `pages/empresas-lista`: columna de 48 px con `vit-logo-empresa` de 32 px antes de la razón social; en la vista de celular, la miniatura va al inicio de la fila.
- `admin-cliente` importa `ArchivoCargaComponent` y `ArchivosCliente` desde `@vitrina/plataforma/archivos-ui`. Si hay que ajustar el `tsconfig` o las etiquetas de la lib, va en el paso 6.

### Front `personas-ui` (ajuste chico)

- `UbigeoAutocompletarComponent` suma la entrada opcional `etiqueta` (por defecto «Distrito», como hoy). La ficha de persona no cambia.
- `UbigeosService` suma `porCodigo(codigo): Ubigeo | null`, que busca en la lista ya cargada.

### Front `shared/ui`

- `directives/telefono.directive.ts`: `vitTelefono` (`ControlValueAccessor` sobre el `input`):
  - al escribir deja solo dígitos, quita un `+51` o `51` pegado al inicio y aplica el formato según el primer dígito (9 → celular, 1 → Lima, 2-8 → provincia);
  - mantiene el cursor en su lugar al insertar espacios, paréntesis y guiones;
  - entrega al formulario el número en E.164, o el texto tal cual si no está completo, para que el validador lo marque;
  - al pegar «+51 987-654-321» queda «987 654 321».
- `utils/telefono-peru.ts`: `aE164(texto)`, `formatoTelefono(e164)`, `esTelefonoPeru(e164)` y el validador `telefonoPeru`. Son funciones puras con las mismas pruebas que `Telefono` del back.
- Se exportan por `index.ts`, sin `export *`.

### Front `consola-tenants`

- `tenant-detalle`: `<img>` de 48 px con `logo_url` junto a RUC y razón social de la empresa principal. Sin URL o si falla, la inicial (estilo local, sin depender de `admin-cliente`).
- El modelo del detalle suma `logoUrl` y `logoExpiraEn`.

## Plan de implementación

1. **Canvas.** Página «17d · Identidad de empresa» del canvas «Vitrina · Diseño UI»:
   - formulario en edición con logo, alta con el logo deshabilitado, recién registrada, logo rechazado y sin permiso;
   - lista con miniaturas y detalle de tenant con logo;
   - en claro, oscuro y a 600 px.
   - El usuario lo revisa. Sin su visto bueno no se escribe código de UI; los pasos 2 a 5 sí pueden avanzar.
2. **Migración.** `01y_org_identidad_empresa.sql`, inverso y prueba SQL.
3. **Dominio ORG.** Valores, `formatoTelefono`, `DatosEmpresa`, `editar` con `LogoValidado`, teléfono de la sucursal, errores y evento. Pruebas:
   - teléfonos `987 654 321`, `(01) 555-0101`, `054 123456` y `+51 987654321` normalizados; `98765432`, `0987654321` y `12ab` rechazados;
   - `formatoTelefono` de un celular, un fijo de Lima y uno de provincia;
   - correo pasado a minúsculas;
   - web sin `https://` rechazada;
   - editar sin cambiar el logo no lo valida;
   - quitar el logo con `null`.
4. **ARC y puerto.** `entidadTipo` y `entidadId` en `EstadoArchivo`; `ValidadorLogoPort`, `ValidadorLogoRechazaTodo` y `ValidadorLogoArchivos` en `apps/api`. Pruebas de integración con los cuatro motivos.
5. **HTTP.** DTO, OpenAPI, `org.filtro` con `LOGO_INVALIDO` y su motivo; URL del logo en `consulta-tenants`; manifiesto `1.31.0`. Pruebas HTTP:
   - `PUT` con logo de otra empresa → `400 LOGO_INVALIDO` `OTRA_ENTIDAD`;
   - `PUT` con versión vieja → 409;
   - consola con y sin logo.
6. **Front `shared/ui` y `personas-ui`.** `telefono-peru.ts` y `vitTelefono` con pruebas (formato al escribir, pegar con `+51`, cursor, valor en E.164); `etiqueta` en el autocompletado y `UbigeosService.porCodigo`.
7. **Front: modelos, validadores, servicio y `logo-empresa`.** Con pruebas del mapeo, de `completarEsquemaWeb` y del componente sin URL.
8. **Front: formulario de empresa.** Tarjetas, ubigeo autocompletado, teléfono con máscara, alta con logo deshabilitado, paso a edición con aviso, carga, quitar, guardar y errores. Pruebas de la página con dobles.
9. **Front: formulario de sucursal.** Ubigeo autocompletado y teléfono con máscara, con el aviso para un teléfono viejo que no es E.164.
10. **Front: lista y consola.** Miniatura en `empresas-lista` y logo en `tenant-detalle`.
11. **Cierre.**
   - `code-simplifier` sobre los archivos tocados.
   - `pnpm db:up:remoto` y el CLI del manifiesto en Supabase dev.
   - Humo: registrar una empresa eligiendo «cayma» en el ubigeo y escribiendo un celular, subir un png, guardar, verlo en la lista y en la consola; intentar un webp; editar una sucursal con un teléfono viejo.
   - Verificación con el MCP Playwright de los criterios de UI en claro, oscuro y 600 px, consola sin errores y capturas comparadas con el canvas.
   - `npx nx run-many -t lint test -p org archivos admin-cliente consola-tenants personas-ui shared-ui api migrar seguridad` (nombres exactos de proyecto según `nx show projects`).

## Criterios de aceptación

- [ ] En el alta de empresa se ve la tarjeta «Identidad y contacto». La zona del logo está deshabilitada con «Se habilita al registrar la empresa»; teléfono, correo y web se pueden llenar.
- [ ] Al registrar, la pantalla pasa a edición de esa empresa con el aviso «Empresa registrada. Ahora puede subir el logo.» y la zona de carga activa; no queda ningún archivo subido sin empresa.
- [ ] Subir un png de 300 KB muestra el progreso y el análisis; al quedar disponible aparece la miniatura y «Guardar cambios» se habilita. Al guardar, `GET /v1/org/empresas/{id}` devuelve el `logo_archivo_id`.
- [ ] Un webp o un archivo de más de 1 MB se rechaza en la zona antes de subirlo, con la regla «JPG o PNG, hasta 1 MB».
- [ ] `PUT` con el id de un archivo de otra empresa, de otra categoría o no disponible → `400 LOGO_INVALIDO` con el motivo; el formulario lo muestra bajo la zona del logo.
- [ ] «Quitar logo» y «Guardar cambios» dejan `logo_archivo_id` en `null`; la lista y la consola muestran la inicial.
- [ ] En empresa y en sucursal, escribir «cayma» en el ubigeo sugiere «AREQUIPA / AREQUIPA / CAYMA»; al elegirlo se guarda `040103`.
- [ ] Al editar una empresa o sucursal con ubigeo `150122`, el campo muestra «LIMA / LIMA / MIRAFLORES».
- [ ] Escribir un distrito sin elegirlo de la lista muestra «Elija un distrito de la lista» y no deja guardar.
- [ ] Sin `plat.catalogo.leer`, el ubigeo está deshabilitado con su aviso y al guardar conserva el código que tenía.
- [ ] En el teléfono solo se pueden escribir dígitos. «987654321» se ve como «987 654 321», «015550101» como «(01) 555-0101» y «054123456» como «(054) 123-456», mientras se escribe.
- [ ] Pegar «+51 987-654-321» deja «987 654 321» y se guarda `+51987654321`; la API devuelve E.164 y el formulario lo muestra con formato.
- [ ] Un celular incompleto («98765») muestra el error en el campo y no deja guardar; por la API → `400 TELEFONO_INVALIDO`.
- [ ] La migración normaliza un teléfono de sucursal «987 654 321» a `+51987654321` y deja «anexo 12» igual; esa sucursal se abre sin error y pide corregir el teléfono al guardar.
- [ ] El correo `Ventas@Empresa.PE` se guarda como `ventas@empresa.pe`; uno sin `@` → error en el campo y `400 CORREO_INVALIDO`.
- [ ] Escribir `www.empresa.pe` en sitio web y salir del campo lo deja en `https://www.empresa.pe`; `http://empresa.pe` → `400 SITIO_WEB_INVALIDO`.
- [ ] Guardar con una versión vieja → 409 con el aviso de versión obsoleta de hoy, sin perder el logo recién subido del formulario.
- [ ] La lista de empresas muestra la miniatura de 32 px de cada empresa con logo y la inicial en las demás, también en la vista de celular.
- [ ] Un usuario sin `plat.archivo.descargar` ve la inicial en la lista y en el formulario, sin errores en consola. Sin `plat.archivo.subir`, el formulario no muestra la zona de carga.
- [ ] El detalle del tenant en la consola muestra el logo de la empresa principal con una URL que vence en 300 s; con logo no disponible o sin logo, la inicial.
- [ ] Un tenant no puede asignar un archivo de otro tenant: `PUT` con ese id → `400 LOGO_INVALIDO` `NO_ENCONTRADO` (TR-RNF-010).
- [ ] `empresa.actualizada` lleva `logo_archivo_id` y no lleva teléfono, correo ni web.
- [ ] Manifiesto `1.31.0` aplicado en dev: `PLAT_PROPIETARIO` tiene `plat.archivo.subir` y `plat.archivo.descargar`.
- [ ] OpenAPI documenta los campos nuevos y `LOGO_INVALIDO` con sus motivos.
- [ ] Migración reversible y probada en CI contra PostgreSQL 16; el inverso se niega si hay logos o datos de contacto.
- [ ] Verificado con el MCP Playwright en tema claro y oscuro y a 600 px; consola sin errores; las capturas coinciden con los artboards de «17d · Identidad de empresa».
- [ ] Colores solo por tokens; sin hex sueltos en los componentes nuevos.
- [ ] Cobertura de dominio de `org` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y la estructura de libs Angular; persistencia con TypeORM, sin SQL embebido nuevo.
- [ ] `npx nx run-many -t lint test -p org archivos admin-cliente consola-tenants api migrar seguridad` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** logo, teléfono, correo y web en `org.empresa`. Decisión del usuario. Son identidad de la empresa y los usan FE, los correos y SazónPOS.
- **No:** logo en `fe.emisor`. Era la versión anterior del 53; ataba un dato de ORG a la facturación.
- **Sí:** correo solo en la empresa. Decisión del usuario. El correo de la sucursal, si hace falta, va con SazónPOS (spec 22).
- **Sí:** logo en el alta y en la edición, con «Registrar y seguir». Decisión del usuario.
  - ARC exige `entidad_id` y en el alta la empresa no existe.
  - Registrar primero y subir después en la misma pantalla evita archivos huérfanos y no cambia `vit-archivo-carga`.
- **No:** subida diferida (elegir el archivo en el alta y subirlo al registrar). Pedía un modo nuevo en `vit-archivo-carga` y manejar una falla a mitad de camino.
- **Sí:** el logo se asigna con «Guardar cambios», en el `PUT` de la empresa. Decisión del usuario. Una sola versión y un solo 409; no hay endpoint aparte.
- **No:** asignar al instante con `PUT .../logo`. Cambiaría la versión mientras el usuario edita otros campos y su `PUT` recibiría 409.
- **Sí:** categoría ARC `LOGO` (jpeg y png, 1 MB). Decisión del usuario. ARC rechaza el archivo antes de subirlo; ORG solo valida la categoría, el estado y la entidad.
- **No:** reutilizar `IMAGEN` y validar en ORG. El usuario se enteraría después de subir.
- **Sí:** logo en la lista de empresas y en el detalle del tenant de la consola, además del formulario. Decisión del usuario. En la pregunta también se marcó «Solo en el formulario»; se tomó como «también en el formulario».
- **Sí:** `ValidadorLogoPort` en ORG con adaptador en `apps/api`. ORG solo depende de kernel (`eslint.config.mjs`); es el patrón de `PadronRucPort` (28b).
- **Sí:** `ValidadorLogoRechazaTodo` como proveedor por defecto. Sin el adaptador real, un logo nunca entra sin validar.
- **Sí:** `OTRA_ENTIDAD` como motivo. Impide asignar un archivo de otra entidad del mismo tenant (un contrato, la foto de una persona).
- **Sí:** `plat.archivo.subir` y `plat.archivo.descargar` en `PLAT_PROPIETARIO`. Sin ellos el propietario no podría subir ni ver el logo. Descargar archivos sensibles sigue auditado por ARC (spec 33).
- **Sí:** teléfono, correo y web fuera del evento. El evento lleva identificadores y nombres; los datos de contacto se leen de ORG (TR-RNF-026).
- **Sí:** `https://` obligatorio en la base; el front lo completa al salir del campo. La base guarda una forma única y el usuario puede escribir `www.…`.
- **Sí:** URL firmada de 300 s para la consola, armada en `apps/api`. El navegador del operador no puede pedir a ARC un archivo de otro tenant.
- **Sí:** miniatura con `object-fit: contain` y la inicial como respaldo. Los logos vienen en proporciones distintas y la falta de logo no debe verse como un error.
- **No:** recortar o redimensionar en el navegador. Suma una dependencia; el PDF ya escala el logo (53).
- **Sí:** un solo spec de 11-12 h, por encima del tope de 10 h. Decisión del usuario: prefiere cerrar la identidad de la empresa de una vez antes del 47 y el 53. El orden de recorte queda escrito por si no cabe.
- **No:** partirlo en contacto (17d) y logo (17e). Era la recomendación; el usuario la descartó.
- **Sí:** ubigeo con `vit-ubigeo-autocompletar` de `personas-ui` en empresa y sucursal. Pedido del usuario al revisar el canvas. Ya existe, lee el catálogo `UBIGEO` y muestra «DEPARTAMENTO / PROVINCIA / DISTRITO»; el back sigue guardando el código.
- **Sí:** directiva propia `vitTelefono` en `shared/ui`. Decisión del usuario. Sin dependencias, y la lógica de celular o fijo peruano no la da una máscara genérica.
- **No:** `ngx-mask`. Dependencia nueva, habría que confirmar que soporta Angular 21, y aun así habría que programar el formato de celular o fijo.
- **Sí:** teléfono guardado en E.164 peruano (`+51…`). Decisión del usuario. Sirve tal cual para WhatsApp (spec 104) y enlaces `tel:`; cada pantalla y el PDF lo formatean con `formatoTelefono`.
- **Sí:** sucursal con el mismo campo y el mismo formato. Decisión del usuario. Las dos pantallas quedan iguales.
- **Sí:** `CHECK ... NOT VALID` en `org.sucursal.telefono`. Los teléfonos viejos que no se pueden normalizar no rompen la migración; el formulario pide corregirlos.
- **Sí:** `formatoTelefono` en el back (ORG) y en el front (`shared/ui`), con las mismas pruebas. El front no puede importar libs de back.
- **Sí (al implementar el paso 2):** la migración se aparta del SQL de «Modelo de datos» en cuatro puntos:
  - la siembra de `LOGO` va entre `GRANT INSERT` y `REVOKE` al rol que migra, y el inverso hace lo mismo con `DELETE`. 01m le quitó esos privilegios sobre `arc.categoria`, y en Supabase ese rol es el dueño pero no es superusuario;
  - el `UPDATE` de teléfonos de sucursal va entre `NO FORCE` y `FORCE ROW LEVEL SECURITY`, dentro de un `DO`. Con `FORCE` y sin `app.tenant_id`, en Supabase no normalizaría ninguna fila. En CI no se ve porque el superusuario se salta el RLS;
  - los `CHECK` de la empresa llevan nombre (`ck_empresa_telefono_e164`, `ck_empresa_correo`, `ck_empresa_sitio_web`), y la prueba compara que el de sucursal tiene el mismo patrón;
  - la normalización se prueba en `db-esquemas.test.mjs`, que revierte, carga teléfonos viejos y reaplica. La `.test.sql` corre con la migración ya aplicada y no puede probarla. Además, `01m_arc.test.sql` cuenta solo sus cinco categorías y no todas.
- **Sí (al implementar el paso 3):** `Telefono.de` concreta la regla de «quitar un `51` o un `0` inicial»:
  - el `51` es código de país solo si quedan 10 u 11 dígitos;
  - el `0` troncal solo va antes de un fijo. Por eso `0987654321` se rechaza, como pide la prueba, y `+51 (01) 555-0101` se acepta;
  - la migración normaliza con la regla simple. Solo difiere en casos raros de datos viejos, y lo que escriba la app pasa por `Telefono`.
- **Sí (al implementar el paso 3):** `empresa.repositorio.ts` es SQL del spec 03 (regla 11: los specs 01 a 09 conservan su SQL). Se le suman las cuatro columnas al `INSERT`, al `UPDATE` y al mapeo; pasarlo a TypeORM es el spec aparte de la regla 11.
- **Sí (al implementar el paso 4):** `LOGO` entra también en `CODIGOS_CATEGORIA` de ARC.
  - El spec no lo mencionaba, pero sin eso el esquema de los eventos de archivo (`enum` de categoría) rechazaría los de un logo, y la subida fallaría.
  - La prueba que compara la lista con lo sembrado ahora lee 01m y 01y.
- **Sí (al implementar el paso 4):** `ValidadorLogoArchivos` se prueba con un `ArchivoPort` falso: los cuatro motivos, el caso válido y otro error que se propaga. El recorrido con ARC real lo cubren las pruebas HTTP del paso 5. Orden de las verificaciones: existe, categoría, entidad, disponible.
- **Sí (al implementar el paso 5):** `logo_archivo_id` es obligatorio en el `PUT` (uuid o `null`). Si fuera opcional, un cliente que no lo manda borraría el logo sin querer.
- **Sí (al implementar el paso 5):** 01y reemplaza `org.tenant_detalle` (`CREATE OR REPLACE`, conserva el dueño `org_lector`) para que `empresa_principal` traiga `logo_archivo_id`.
  - La función armaba el JSON con claves fijas: «la consulta de hoy» no lo traía.
  - El inverso repone el cuerpo anterior antes de quitar la columna.
- **Sí (al implementar el paso 5):** la URL del logo en la consola usa `TenantContext.run({ tenantId })`, el mismo cambio de contexto del worker, sobre `ArchivoPort.urlDescarga`. Sirve desde la API, así que no hace falta `urlDescargaDeTenant` en `ArchivoSistemaPort`.
  - Va `inline`, por 300 s, en `UrlLogoEmpresaArchivos`.
  - Un logo inexistente, no disponible o con la versión no disponible da `null`.
- **Sí (al implementar el paso 5):** los criterios HTTP del logo se prueban por partes:
  - el `400 LOGO_INVALIDO` con cada motivo, en `organizacion.http.spec.ts`;
  - el recorrido HTTP → caso de uso → base, con un validador falso, en `organizacion.integracion.spec.ts`;
  - el adaptador sobre ARC, en `validador-logo.archivos.spec.ts`;
  - el aislamiento de ARC entre tenants, en su TR-CA-205.
  - `ConsultarEstadoArchivo` no se exporta de ARC y no se abre solo para una prueba.
- **Sí (al implementar el paso 8):** `vit-ubigeo-autocompletar` suma `textos` (`TextosUbigeo`: ayuda, ayuda con el distrito elegido, error, error de carga y sin permiso) y `sinPermiso`. Decisión del usuario.
  - Los textos de hoy quedan por defecto (`TEXTOS_UBIGEO_FICHA`), así que la ficha de persona no cambia.
  - Empresa y sucursal pasan `TEXTOS_UBIGEO_ORGANIZACION`, de usted: «Elija un distrito de la lista», «Se guarda el código 150122.».
  - Con `sinPermiso` no pide el catálogo, para que no aparezca un 403 en la consola.
  - Amplía lo que el spec decía de `personas-ui` (solo `etiqueta`).
- **Sí (al implementar el paso 8):** en el formulario de empresa:
  - sin `plat.archivo.subir` se muestra el aviso en lugar de la zona, también en el alta (criterio «no muestra la zona de carga»);
  - al registrar ya no sale el toast de «registrada»: lo reemplaza el aviso de la edición; las advertencias del padrón siguen saliendo;
  - «Recargar» tras un 409 conserva el logo recién subido y su miniatura;
  - la zona se vuelve a crear al quitar el logo: `vit-archivo-carga` solo lee `archivoId` al iniciar.
- **No (al implementar el paso 8):** deshabilitar «Guardar cambios» hasta que haya cambios. `vit-acciones-formulario` no tiene esa entrada, y hoy ningún formulario lo hace; el botón queda siempre activo, como en el resto de las pantallas.
- **Sí (al implementar el paso 8):** la regla bajo la zona dice «JPG o PNG · hasta 1 MB», el formato común de `vit-archivo-carga`, en vez de «JPG o PNG, hasta 1 MB».
- **Sí (al implementar el paso 10):** `vit-tabla` suma el rol de celular `inicio`, que pinta su plantilla `vitCeldaTabla` antes del título. Hacía falta para poner la miniatura al inicio de la fila en celular; la tabla solo tenía título, detalle y estado.
  - La lista de empresas define sus roles de celular, como en el canvas: logo al inicio, razón social de título y RUC de detalle.
  - El encabezado de la columna dice «Logo» a la vista (en el canvas va oculto), porque `ColumnaTabla` no tiene títulos ocultos.
  - El ancho de 48 px sale de la miniatura de 32 px más el relleno de la celda: `ColumnaTabla` no fija anchos.
- **Sí (al implementar el paso 10):** la lista de empresas sale enseguida con las iniciales y cada miniatura aparece cuando llega su URL firmada.
- **Sí (al implementar el paso 3):** `Empresa.editar(datos, logo)` recibe un `LogoEdicion`: un `LogoValidado` (logo nuevo), el id que ya tenía (sin cambio) o `null` (quitar). Un id nuevo sin validar es un error de programación (500), no de usuario.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Firmar la URL de un archivo de otro tenant desde la consola abre una puerta entre tenants | Solo `apps/api`, solo para la empresa principal del tenant consultado, con `plat.tenant.consultar` y 300 s. Prueba de que un usuario cliente no llega a esa ruta. |
| No existe un mecanismo para cambiar de tenant en la API | Método explícito `urlDescargaDeTenant` en `ArchivoSistemaPort`, con la razón en Decisiones; si se complica, se recorta el logo de la consola (primer recorte). |
| Las listas piden una URL por cada empresa con logo | Pocas empresas por tenant; el servicio guarda la URL hasta que vence. |
| El antivirus tarda y el usuario guarda antes de que el logo quede disponible | «Guardar cambios» no toma el logo hasta `disponible`; los demás cambios se guardan igual. |
| Los specs 46 y 47 usan también `01y` y el manifiesto `1.31.0` | Este va primero; los otros se renumeran al implementar, como ya dicen sus riesgos. |
| El spec pasa el tope de 10 h | Orden de recorte escrito (logo de la consola, miniatura de la lista); horas reales al cerrar. |
| La máscara mueve el cursor al insertar espacios o paréntesis | La directiva recalcula la posición contando dígitos antes del cursor; prueba de edición en medio del número. |
| Un teléfono viejo de sucursal no se puede normalizar | Queda como está y el formulario pide corregirlo; la prueba SQL cubre «anexo 12». |
| El catálogo `UBIGEO` (unos 1 900 distritos) tarda en cargar la primera vez | Se baja una vez por sesión con `ETag` (38); mientras tanto el campo muestra el código guardado. |
| Un logo con fondo transparente se pierde en tema oscuro | La miniatura tiene fondo claro fijo por token (como el correo del 47); se revisa en el canvas. |

## Lo que **no** entra en este spec

- Logo y contacto en el PDF (spec 53).
- Marca del tenant en correos y sitio web (47 y 83).
- Datos de la sucursal y del restaurante (spec 22).
- Recortar el logo en el navegador.
- Logo en el alta de tenant de la consola.
- Limpieza de logos sin uso (spec 69).
- Teléfonos de otros países y máscara en los contactos de personas.

Cada uno, si llega, va en su propio spec.
