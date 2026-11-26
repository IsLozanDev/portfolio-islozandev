# SPEC 62 — Facturación electrónica: lista de emisores por empresa y página del emisor con proveedor, certificado, prueba en beta y paso a producción

> **Status:** Borrador
> **Depends on:** SPEC 49, SPEC 50, SPEC 51c, SPEC 17c, SPEC 15b, SPEC 15c, SPEC 15d
> **Date:** 2026-11-25
> **Objective:** Dar al encargado de facturación, en la app de administración, una lista de las empresas del tenant con el estado de su emisor electrónico y una página por empresa donde configura el proveedor y la credencial, sube el certificado, lanza la prueba en beta y ve su resultado, y pasa a producción con confirmación y aal2 (UI de TR-RF-052).

## Por qué existe este spec

Fila 62 de `docs/roadmap-specs.md` (R2-11: UI de TR-RF-052). Contexto: `docs/spec-context/tr-fe/fe-admin-ui.md`, parte B. El back está implementado: `GET` y `PUT /v1/fe/emisores/{empresaId}`, `POST .../certificado`, `POST .../prueba` (202, asíncrona) y `POST .../produccion` (specs 49 y 50), con el proveedor `SUNAT` del spec 51c.

El roadmap da 5-7 h. Estimado: 7,5-8,5 h (1 h de canvas, 1,5 h de back y 5-6 h de UI). El back crece por dos huecos que aparecieron al revisar el código:

- `PLAT_ENCARGADO_FACTURACION` no tiene `plat.catalogo.leer`, así que no puede listar los proveedores de `PROVEEDOR_FE`.
- El mismo rol tampoco tiene `plat.organizacion.consultar`, así que no puede listar empresas.

Si el spec se pasa de 10 h, se recorta en este orden: (1) la vista de celular de la lista (queda la tabla con desplazamiento horizontal), (2) el aviso de certificado por vencer en la lista (queda en la página). Lo recortado pasa a un 62b.

Lo que hay en el código hoy (revisado al redactar):

- `comprobantes` (back): `EmisoresController` con las cinco rutas. `EmisorDto` lleva `emisor_id`, `empresa_id`, `proveedor`, `ambiente`, `estado`, `regimen_igv`, `leyenda_pie`, `usuario_proveedor`, `tiene_credencial`, `certificado { ruc, vence_en, huella_sha256 }`, `url_proveedor`, `prueba { estado, numero, solicitada_en, resultado_en, codigo, descripcion }`, `produccion_habilitada_en` y `version`. No hay ruta para listar emisores. `EmpresaEmisoraPort` solo tiene `obtener(empresaId)`.
- `org`: caso de uso `ListarEmpresas(filtro)`, exportado.
- `catalogos`: `GET /v1/cat/catalogos/{codigo}/items` (`plat.catalogo.leer`), que devuelve `codigo`, `nombre` y `atributos` con ETag.
- Manifiesto PLAT `1.29.0`. No tiene módulo de facturación. El rol `PLAT_ENCARGADO_FACTURACION` tiene `plat.fe.configurar`, `plat.fe.consultar` y `plat.sesion.contexto`.
- Front: `admin-cliente` (`ADMIN_CLIENTE_ROUTES`, montada bajo `admin`); `personas-ui` es una lib feature aparte que `admin-cliente` consume. `shared/auth` tiene `aal2Guard`, `permisoGuard` y `vitSiPermiso`. `shared/ui` tiene `TablaComponent`, `ChipEstadoComponent` y `TonoEstado` (`exito`, `advertencia`, `info`, `neutro`, `error`), `EstadoVacioComponent`, `CargandoComponent`, `AccionesFormularioComponent` y `AvisosService` (`confirmar`, `confirmarDestructiva`).
- `archivos-ui` (spec 36) sube a Storage con una URL firmada. **No** se usa para el `.pfx`, porque es un secreto y va por multipart a la API (decisión del spec 49).

## Alcance

**Entra:**

- **Back (`comprobantes`):** `GET /v1/fe/emisores` (`plat.fe.consultar`). Devuelve las empresas activas del tenant, cada una con un resumen de su emisor o `null`.
- **Manifiesto PLAT `1.29.0` → `1.30.0`:**
  - módulo `facturacion` con la opción padre «Facturación» y la hija «Emisor electrónico», que apunta a `/admin/fe/emisores` (`plat.fe.consultar`);
  - `plat.catalogo.leer` en `PLAT_ENCARGADO_FACTURACION`.
- **Lib nueva `libs/plataforma/comprobantes-ui`** (`scope:plataforma`, `type:feature`) con rutas propias, montadas desde `admin-cliente.routes.ts` bajo `fe`.
- **Lista `/admin/fe/emisores`** (pantalla tipo Lista). Por fila: empresa, RUC, proveedor, ambiente, estado y vencimiento del certificado, con aviso si vence en 30 días o menos. Tiene vista de celular, y la fila abre la página del emisor.
- **Página `/admin/fe/emisores/:empresaId`** (pantalla tipo Formulario, con `aal2Guard`). Arriba muestra el encabezado con el estado y debajo cuatro tarjetas en orden:
  1. **Proveedor y credencial:** proveedor del catálogo, usuario (para `SUNAT`, «Usuario secundario SOL»), clave, URL solo si el proveedor la pide, régimen de IGV y leyenda del pie.
  2. **Certificado:** subida del `.pfx` (50 KB como máximo) con su clave, y RUC y vencimiento leídos.
  3. **Prueba en beta:** botón «Ejecutar prueba» y el resultado, que se consulta solo cada 3 s durante 2 min como máximo.
  4. **Producción:** botón «Pasar a producción», habilitado solo con una prueba aceptada en las últimas 24 h, con confirmación destructiva.
- Mensajes en español para cada código de error de las cinco rutas.
- Sin `plat.fe.configurar`, la página se ve en solo lectura.
- Diseño previo en el canvas «Vitrina · Diseño UI», página «62 · Facturación».
- Verificación con Playwright en claro, oscuro y 600 px.

**No entra (specs futuros):**

- Pantalla de series (spec 60, `seq-series-ui`) y creación de series de comprobantes desde el emisor.
- Monitor de comprobantes, baja y nota de crédito manual (spec 58, que irá en `comprobantes-ui`).
- Logo del emisor para la representación impresa (spec 53).
- Volver de producción a beta, y borrar el emisor (el back no lo permite).
- Historial de pruebas (el back guarda solo la última).
- Leer el parámetro `plat.fe.dias_aviso_certificado` desde la UI: se usa una constante de 30 días (ver Decisiones).
- Acceso al emisor desde el formulario de la empresa.
- Correo con el resultado de la prueba.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `comprobantes` (`EmisoresController`, `RepositorioEmisores`, `EmpresaEmisoraPort`, `EmpresaEmisoraOrg`) | Ruta nueva de lista; el puerto suma `listarActivas()`; el repositorio suma `porEmpresas(ids)`. |
| `org` (`ListarEmpresas`) | Adaptador de `listarActivas()`. |
| `personas-ui` (estructura de lib feature: `models`, `services`, `utils`, `solicitar.ts`) | Molde de `comprobantes-ui`. |
| `admin-cliente` (`empresa-formulario`, `utils/formulario-empresa.ts`, `empresas-lista`) | Patrón de formulario reactivo de página, de lista y de mapeo de errores de la API. |
| `shared/ui` (`TablaComponent` con `ColumnaTabla.movil`, `ChipEstadoComponent`, `EstadoVacioComponent`, `CargandoComponent`, `AccionesFormularioComponent`, `AvisosService`) | Lista, chips, estados vacíos y de carga, pies de tarjeta y confirmación. |
| `shared/auth` (`aal2Guard`, `permisoGuard`, `vitSiPermiso`) | Ruta de la página con aal2; acciones solo con `plat.fe.configurar`. |
| `consola-tenants.routes.ts` | Patrón de ruta detrás de `aal2Guard`. |
| Canvas: `IDN-Cuota-Detalle`, `IDN-Proveedores`, `O-Empresas`, `Formulario` | Base visual de los artboards nuevos. |

## Modelo de datos

No hay tablas, migraciones ni eventos nuevos.

### Back: `GET /v1/fe/emisores`

- `EmpresaEmisoraPort` suma `listarActivas(): Promise<EmpresaEmisora[]>`, con las empresas activas del tenant del contexto ordenadas por razón social. El adaptador `EmpresaEmisoraOrg` usa `ListarEmpresas` con el filtro de estado activo y sin paginar: un tenant tiene pocas empresas, y el límite `LIMITE_EMPRESAS_EMISORAS = 100` es una constante con nombre.
- `RepositorioEmisores` suma `porEmpresas(empresaIds: string[]): Promise<Emisor[]>`, que hace un solo `IN` con `QueryBuilder`.
- El caso de uso `ListarEmisores()` corre en una transacción de lectura y cruza las dos listas en memoria.
- `interface/emisores.controller.ts` suma `@Get()` con `@Permiso(plat.fe.consultar)`, sin aal2, y OpenAPI.

```ts
// emisores.dto.ts
class ResumenEmisorDto {
  estado!: string;                       // BORRADOR | CONFIGURADO | VERIFICADO | PRODUCCION
  proveedor!: string;
  ambiente!: string;                     // BETA | PRODUCCION
  certificado_vence_en!: string | null;
  prueba_estado!: string | null;         // EN_PROCESO | ACEPTADA | RECHAZADA | ERROR
}

export class EmpresaConEmisorDto {
  empresa_id!: string;
  ruc!: string;
  razon_social!: string;
  emisor!: ResumenEmisorDto | null;      // null: la empresa aún no configura su emisor
}
```

La respuesta es `200 EmpresaConEmisorDto[]`. No lleva secretos, usuario del proveedor ni huella.

### Manifiesto PLAT `1.30.0`

```json
{ "codigo": "plat.facturacion", "modulo": "facturacion", "padre": null, "nombre": "Facturación", "icono": "receipt_long", "orden": 4, "permisos": [] },
{ "codigo": "plat.facturacion.emisores", "modulo": "facturacion", "padre": "plat.facturacion", "nombre": "Emisor electrónico", "ruta": "/admin/fe/emisores", "icono": "verified", "orden": 1, "permisos": ["plat.fe.consultar"] }
```

- «Consola» pasa de `orden` 4 a 5.
- `PLAT_ENCARGADO_FACTURACION` suma `plat.catalogo.leer`.
- No hay permisos nuevos. Si `manifiesto.aplicar.spec.ts` cuenta opciones o permisos de roles, se actualiza.

### Front: `libs/plataforma/comprobantes-ui`

Molde de `personas-ui`. Alias `@vitrina/plataforma/comprobantes-ui`, prefijo `vit`, etiquetas `scope:plataforma` y `type:feature`. `src/index.ts` exporta `FE_ROUTES` y `PERMISOS_FE_UI` por ruta explícita.

| Carpeta | Archivo | Contiene |
| --- | --- | --- |
| `models/` | `emisor.ts` | `Emisor`, `PruebaEmisor`, `CertificadoEmisor`, `EmpresaConEmisor` y `ResumenEmisor` en camelCase, más los mapeos desde los DTO de la API. |
| | `proveedor-fe.ts` | `ProveedorFe { codigo, nombre, requiereCertificado, pideUrl, esSunat }` y el mapeo desde el ítem del catálogo. `pideUrl = dominios_permitidos.length > 0 && !url_produccion` (spec 51c). |
| | `estado-emisor.ts` | Tipos `EstadoEmisor` y `EstadoPrueba`, y los mapas `TONOS_ESTADO_EMISOR` (BORRADOR `neutro`, CONFIGURADO `info`, VERIFICADO `exito`, PRODUCCION `exito`) y `TONOS_PRUEBA` (EN_PROCESO `info`, ACEPTADA `exito`, RECHAZADA `error`, ERROR `advertencia`) con sus etiquetas. |
| | `mensajes-emisor.ts` | `MENSAJES_ERROR_FE`: código de la API → texto en español, para todos los códigos de las cinco rutas (ver la tabla de mensajes). Códigos sin texto → «No se pudo completar la operación. Intenta de nuevo.» |
| | `permisos-fe.ts` | `PERMISOS_FE_UI = { consultar: 'plat.fe.consultar', configurar: 'plat.fe.configurar', catalogoLeer: 'plat.catalogo.leer' }`. |
| `services/` | `emisores.cliente.ts` | `listar()`, `obtener(empresaId)` (404 → `null`), `configurar(empresaId, datos)`, `cargarCertificado(empresaId, archivo, clave)` (`FormData`), `solicitarPrueba(empresaId)` y `pasarAProduccion(empresaId)`. |
| | `proveedores-fe.service.ts` | Lee `PROVEEDOR_FE` una vez por sesión con signals. Oculta `SIMULADO` si el back lo rechaza; el back manda con `FE_SIMULADO_PERMITIDO`. |
| | `seguimiento-prueba.service.ts` | `seguir(empresaId)`: `timer(0, INTERVALO_CONSULTA_PRUEBA_MS)` de 3000 ms con `switchMap(obtener)`. Termina cuando `prueba.estado !== 'EN_PROCESO'` o tras `MAXIMO_CONSULTAS_PRUEBA` (40, unos 2 min). Se cancela al destruir la página. |
| `utils/` | `validar-certificado.ts` | `validarArchivoCertificado(archivo)`: extensión `.pfx` o `.p12` y `TAMANO_MAXIMO_CERTIFICADO_BYTES = 50 * 1024`. Devuelve un error con nombre o `null`. |
| | `vencimiento-certificado.ts` | `diasParaVencer(venceEn, hoy)` y `porVencer(venceEn, hoy)` con `DIAS_AVISO_CERTIFICADO = 30`, en fecha de Lima. |
| | `reglas-emisor.ts` | Funciones puras que habilitan cada tarjeta: `certificadoHabilitado(emisor)`, `pruebaHabilitada(emisor)`, `produccionHabilitada(emisor, ahora)` (VERIFICADO, prueba ACEPTADA y `resultadoEn` de menos de 24 h) y `motivoProduccionDeshabilitada(emisor, ahora)`. |
| | `formulario-emisor.ts` | `FormGroup` tipado del proveedor y su conversión a la carga del `PUT`: `clave` solo si se escribió y `url_proveedor` solo si `pideUrl`. |
| | `solicitar.ts` | Igual que en `personas-ui`: mapea el `HttpErrorResponse` a `{ codigo, mensaje }`. |
| `components/` | `tarjeta-proveedor/` | Tarjeta 1, con el formulario reactivo y el pie Guardar y Descartar. |
| | `tarjeta-certificado/` | Tarjeta 2: `<input type="file" accept=".pfx,.p12">` oculto tras un botón, nombre y tamaño del archivo, clave y «Subir certificado». Con un certificado cargado muestra el RUC, el vencimiento, la huella abreviada y el botón «Reemplazar». |
| | `tarjeta-prueba/` | Tarjeta 3: el número, la fecha y el chip de la última prueba, el código y la descripción de SUNAT o del PSE, y el progreso indeterminado mientras está `EN_PROCESO`. |
| | `tarjeta-produccion/` | Tarjeta 4: el botón, o el motivo por el que está deshabilitado; en `PRODUCCION`, «En producción desde dd/mm/aa». |
| `pages/` | `emisores-lista/` | La lista. |
| | `emisor-configuracion/` | La página: lee el emisor (o ninguno), coordina las tarjetas y guarda `version` para el bloqueo optimista. |
| raíz | `comprobantes-ui.routes.ts` | `FE_ROUTES`: `emisores` (`permisoGuard(consultar)`) y `emisores/:empresaId` (`permisoGuard(consultar)` + `canActivate: [aal2Guard]`). |

`admin-cliente.routes.ts` suma `{ path: 'fe', loadChildren: () => import('@vitrina/plataforma/comprobantes-ui').then((modulo) => modulo.FE_ROUTES) }`. La matriz de límites permite que `admin-cliente` importe `comprobantes-ui`, como ya hace con `personas-ui`.

### Comportamiento de la página

| Estado del emisor | Tarjeta 1 | Tarjeta 2 | Tarjeta 3 | Tarjeta 4 |
| --- | --- | --- | --- | --- |
| Sin emisor (404) | Vacía; «Guardar» crea el emisor (201) | Deshabilitada: «Guarda primero el proveedor» | Deshabilitada | Deshabilitada |
| `BORRADOR` | Editable | Habilitada; si el proveedor no la pide, «Opcional: este proveedor firma por su cuenta» | Deshabilitada: «Completa el proveedor y el certificado» | Deshabilitada |
| `CONFIGURADO` | Editable | Habilitada | «Ejecutar prueba» | Deshabilitada: «Necesita una prueba aceptada» |
| `VERIFICADO` | Editable; avisa que guardar cambios de proveedor, URL, credencial o certificado obliga a repetir la prueba | Habilitada | «Volver a probar» | Habilitada si la prueba tiene menos de 24 h; si no, «La prueba venció: vuelve a probar» |
| `PRODUCCION` | Proveedor y URL bloqueados; credencial, régimen y leyenda editables | «Reemplazar» habilitado (rotación sin interrupción) | Oculta la acción: «En producción no se ejecutan pruebas» | «En producción desde …» |

- La clave del proveedor y la del certificado **nunca** se rellenan. Con `tiene_credencial`, el campo de la clave muestra la ayuda «Configurada. Déjalo vacío para conservarla.» No se guardan en `localStorage` ni en el estado de la URL.
- La lista y la página muestran el aviso de vencimiento «Vence en N días» (`advertencia`) cuando faltan 30 días o menos, y «Vencido» (`error`) si ya pasó la fecha.
- `409 VERSION_OBSOLETA` → aviso «Otro usuario cambió el emisor. Se recargaron los datos.» y se recarga el emisor.
- `422 DATOS_EMISOR_INCOMPLETOS` (`SUNAT` sin domicilio fiscal o ubigeo) → mensaje con un enlace a `/admin/empresas/:id` para completarlos.
- Si la consulta automática se agota con la prueba aún `EN_PROCESO` → «Sigue en proceso. SUNAT puede tardar.» con un botón «Actualizar».

### Mensajes de error

| Código | Texto |
| --- | --- |
| `PROVEEDOR_FE_INVALIDO` | El proveedor elegido no está disponible. |
| `URL_PROVEEDOR_NO_PERMITIDA` | La URL no pertenece al proveedor elegido. |
| `USUARIO_SOL_INVALIDO` | El usuario SOL va en mayúsculas, sin el RUC. |
| `EMPRESA_INACTIVA` | La empresa está inactiva. |
| `EMISOR_EN_PRODUCCION` | En producción no se cambia el proveedor ni la URL. |
| `DATOS_EMISOR_INCOMPLETOS` | Falta el domicilio fiscal o el ubigeo de la empresa. |
| `ARCHIVO_CERTIFICADO_INVALIDO` | El archivo no es un certificado .pfx válido. |
| `CLAVE_CERTIFICADO_INCORRECTA` | La clave del certificado no es correcta. |
| `CERTIFICADO_SIN_RUC` | El certificado no indica un RUC. |
| `CERTIFICADO_OTRO_RUC` | El certificado no corresponde al RUC de la empresa. |
| `CERTIFICADO_VENCIDO` | El certificado está vencido. |
| `CERTIFICADO_NO_VIGENTE` | El certificado aún no está vigente. |
| 413 | El archivo supera los 50 KB. |
| `ESTADO_EMISOR_INVALIDO` | El emisor no está listo para la prueba. |
| `PRUEBA_EN_CURSO` | Ya hay una prueba en curso. |
| `PRODUCCION_NO_PERMITIDA` | Este ambiente no permite pasar a producción. |
| `PROVEEDOR_SIMULADO_EN_PRODUCCION` | El simulador no puede pasar a producción. |
| `PRUEBA_BETA_REQUERIDA` | Necesitas una prueba aceptada en las últimas 24 horas. |
| `VERSION_OBSOLETA` | Otro usuario cambió el emisor. Se recargaron los datos. |

Prueba aceptada (TR-CA-133): «Conexión correcta: comprobante de prueba aceptado». Rechazada (TR-CA-134): «SUNAT rechazó el comprobante de prueba: {código} {descripción}».

### Diseño de referencia

Canvas «Vitrina · Diseño UI» (https://claude.ai/artifact/UGvcmiWUiBsMuWerqMiWxh), página «62 · Facturación». Se dibujó junto con este spec y el usuario lo revisa antes del paso 2 del plan.

| Artboard | Qué fija |
| --- | --- |
| `FE-Emisores` (base editable) | Lista: columnas, chips de estado y de vencimiento, fila sin emisor con «Configurar», menú «Facturación» |
| `FE-Emisor` (base editable) | Encabezado con estado y ambiente, las cuatro tarjetas, mensajes y estados de cada tarjeta, confirmación de producción |
| `FE-Emisor-en-curso` | Claro: proveedor SUNAT, certificado por vencer en 18 días, prueba `EN_PROCESO` |
| `FE-Emisor-verificado-oscuro` | Oscuro: prueba aceptada, «Pasar a producción» habilitado |
| `FE-Emisor-confirmar-oscuro` | Oscuro: diálogo de confirmación del paso a producción |
| `FE-Emisor-600` | Página a 600 px con las tarjetas apiladas |

| Pantalla | Pantalla tipo | Cambia en |
| --- | --- | --- |
| Lista de emisores | Lista | Chip de vencimiento al lado de la fecha; fila sin emisor con «Configurar» |
| Página del emisor | Formulario | Cuatro tarjetas numeradas con pie propio en lugar de un solo formulario |
| Paso a producción | Confirmación | Destructiva, sin motivo |

Lo que el canvas fije y no esté arriba se anota en Decisiones al implementar.

## Plan de implementación

1. **Back.** `listarActivas` en el puerto y en `EmpresaEmisoraOrg`, `porEmpresas` en el repositorio, `ListarEmisores`, la ruta `GET /v1/fe/emisores`, el DTO y OpenAPI. Pruebas unitarias del cruce (empresa sin emisor y empresa inactiva excluida) e integración con dos tenants. Manifiesto `1.30.0` con el CLI. **Este paso no arranca hasta que el spec 52 esté en `main`** (misma lib `comprobantes`).
2. **Diseño aprobado.** Revisión del canvas «62 · Facturación» con el usuario. Sin su visto bueno no se escribe código de UI.
3. **Lib y modelos.** Generar `comprobantes-ui` con el generador de `nx.json`, los modelos, los mapeos, `mensajes-emisor`, `reglas-emisor`, `validar-certificado` y `vencimiento-certificado`, con pruebas: prueba aceptada hace 23 h habilita producción y hace 25 h no; archivo de 51 KB o `.txt` rechazado; certificado que vence en 30 días avisa y en 31 no.
4. **Clientes y servicios.** `emisores.cliente`, `proveedores-fe.service` y `seguimiento-prueba.service`, con `HttpTestingController` y reloj falso: la consulta para al salir de `EN_PROCESO` y a los 40 intentos.
5. **Lista.** Página `emisores-lista` con `vit-tabla`, vista móvil y estado vacío, y las rutas montadas en `admin-cliente`.
6. **Página del emisor.** La página y las cuatro tarjetas, la tabla de comportamiento por estado, la confirmación con `AvisosService.confirmarDestructiva` y el modo de solo lectura con `vitSiPermiso`.
7. **Cierre.** `code-simplifier` sobre los archivos tocados. `npx nx run-many -t lint test -p comprobantes comprobantes-ui admin-cliente plataforma-admin api seguridad boundaries-test`. Manifiesto `1.30.0` aplicado en Supabase dev. Verificación con Playwright (siguiente sección).

## Verificación con Playwright

`nx serve plataforma-admin` con la api y el worker locales contra Supabase dev. Se usa la empresa de dev que ya tenga emisor, o una nueva con autorización del usuario (sin borrado: queda dada de baja por estado). El recorrido:

1. Configurar `SIMULADO` y subir un `.pfx` de prueba del RUC de la empresa.
2. Ejecutar la prueba y verla pasar sola a «Conexión correcta…».
3. Ver que «Pasar a producción» se habilita y que al confirmar el back responde `PROVEEDOR_SIMULADO_EN_PRODUCCION`, con su mensaje en la tarjeta.
4. Subir un `.pfx` de otro RUC y ver el error de TR-CA-134.

Se recorre en claro, oscuro y 600 px, con la consola sin errores y capturas comparadas con los artboards.

## Criterios de aceptación

**Back:**

- [ ] `GET /v1/fe/emisores` con solo `plat.fe.consultar` → 200 con las empresas activas del tenant ordenadas por razón social; una empresa sin emisor viene con `emisor: null`; las inactivas no vienen.
- [ ] Otro tenant no ve las empresas ni los emisores de este (prueba de integración con dos tenants).
- [ ] La respuesta no tiene usuario del proveedor, huella, secretos ni URL; OpenAPI la documenta.
- [ ] Manifiesto `1.30.0` aplicado en dev: el usuario con solo `PLAT_ENCARGADO_FACTURACION` ve «Facturación > Emisor electrónico» en el menú y lee `PROVEEDOR_FE`.

**UI (Playwright en `plataforma-admin`):**

- [ ] La lista muestra cada empresa con RUC, proveedor, ambiente, chip de estado y vencimiento. Un certificado que vence en 30 días o menos lleva el chip «Vence en N días», y la fila sin emisor dice «Sin configurar» y ofrece «Configurar».
- [ ] Entrar a la página del emisor con una sesión aal1 lleva a MFA y luego vuelve a la página (`aal2Guard`).
- [ ] TR-CA-133 en UI: tras «Ejecutar prueba» la tarjeta muestra la prueba en proceso y, sin recargar, «Conexión correcta: comprobante de prueba aceptado»; el chip del encabezado pasa a «Verificado» y «Pasar a producción» se habilita.
- [ ] TR-CA-134 en UI: un `.pfx` de otro RUC muestra «El certificado no corresponde al RUC de la empresa» en la tarjeta del certificado y el certificado anterior se sigue viendo.
- [ ] «Pasar a producción» está deshabilitado y explica por qué si no hay prueba aceptada o si tiene más de 24 h; al pulsarlo con la prueba vigente se abre la confirmación destructiva y cancelar no llama a la API.
- [ ] Las claves nunca se rellenan: al volver a la página los campos de clave están vacíos con la ayuda «Configurada…», y `localStorage`, `sessionStorage` y la URL no las contienen (TR-RNF-113).
- [ ] Un archivo de más de 50 KB o con otra extensión se rechaza en el cliente, sin llamar a la API.
- [ ] Con `SUNAT`, el usuario se rotula «Usuario secundario SOL» y el campo de URL no aparece; con un proveedor que la pide, aparece y es obligatoria.
- [ ] Un usuario con solo `plat.fe.consultar` ve la página en solo lectura, sin botones de guardar, subir, probar ni producción.
- [ ] `409 VERSION_OBSOLETA` recarga el emisor y avisa; `422 DATOS_EMISOR_INCOMPLETOS` muestra el enlace a la empresa.
- [ ] Al salir de la página con una prueba en curso, no quedan consultas en la pestaña de red.
- [ ] Las pantallas se ven bien en tema claro, oscuro y a 600 px, solo con tokens `--color-*` y sin hex sueltos; la consola no tiene errores; las capturas coinciden con los artboards de «62 · Facturación».

**Código:**

- [ ] `comprobantes-ui` sigue la estructura de libs Angular de `CLAUDE.md` (un artefacto por archivo, `templateUrl` y `styleUrl`, `index.ts` sin `export *`); los formularios de las tarjetas no usan paneles laterales porque son de página, y no hay diálogos con formulario.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`.
- [ ] `npx nx run-many -t lint test -p comprobantes comprobantes-ui admin-cliente plataforma-admin api seguridad boundaries-test` en verde; `nx affected` en verde en el CI del PR.

## Decisiones

- **Sí:** lib nueva `comprobantes-ui` con rutas propias montadas desde `admin-cliente`. Decisión del usuario. `admin-cliente` ya tiene unas 30 páginas, y el monitor del spec 58 irá aquí.
- **Sí:** entrar por una lista de empresas desde el menú «Facturación > Emisor electrónico», con una página por empresa. Decisión del usuario.
- **Sí:** `GET /v1/fe/emisores` en el back en lugar de dar `plat.organizacion.consultar` al rol y hacer N llamadas. Decisión del usuario. Es una sola llamada, el rol queda acotado y la vista ya trae el estado de cada emisor.
- **Sí:** `plat.catalogo.leer` en `PLAT_ENCARGADO_FACTURACION` para listar los proveedores, sin endpoint propio. Decisión del usuario. Es un permiso no sensible que ya tienen los demás roles de operación.
- **Sí:** una página con cuatro tarjetas en orden, no un stepper. Decisión del usuario. Rotar la credencial o el certificado en producción no encaja en un flujo lineal.
- **Sí:** `aal2Guard` en la ruta de la página; la lista no lo exige. Decisión del usuario. Es el patrón de la consola, y todas las acciones de la página son sensibles.
- **Sí:** el resultado de la prueba se consulta solo cada 3 s, durante 2 min como máximo, y después aparece «Actualizar». Decisión del usuario. El back es asíncrono (202) y no hay SSE para este evento.
- **Sí:** el `.pfx` sube por multipart a la API con un `<input type="file">` propio, no con `vit-archivo-carga`. Es un secreto y no pasa por Storage (spec 49).
- **Sí:** aviso de vencimiento con una constante de 30 días en la UI. Leer `plat.fe.dias_aviso_certificado` pediría `plat.parametro.leer`; el valor por defecto es 30, y el correo de aviso sí usa el parámetro.
- **Sí:** «Pasar a producción» con `confirmarDestructiva` y sin motivo. No se puede volver a beta (TR-RNF-021). El back audita la acción.
- **No:** acceso al emisor desde el formulario de la empresa. El menú alcanza, y no se toca `empresa-formulario`.
- **No:** crear series de comprobantes desde el emisor: es del spec 60.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El spec 52 está en curso en otra sesión sobre la misma lib `comprobantes` | El paso 1 (back) espera a que el 52 esté en `main`. Los pasos 2 a 4 (canvas, lib, modelos y servicios con dobles) pueden avanzar antes. |
| El 52 u otro spec de la misma ola sube también el manifiesto (`1.30.0`) | El segundo PR se rebasa, toma la siguiente versión y actualiza el conteo de `manifiesto.aplicar.spec.ts`. |
| La consulta automática sigue corriendo al cambiar de página | `takeUntilDestroyed` en la página y una prueba que verifica que no quedan peticiones. |
| `aal2Guard` redirige a MFA y pierde la ruta de vuelta | Se verifica con Playwright; el guard ya conserva el destino en la consola. |
| Un PSE responde a la prueba en más de 2 min | Mensaje «Sigue en proceso» con «Actualizar»; el resultado queda en el emisor igual. |

## Lo que **no** entra en este spec

- Series de comprobantes (spec 60).
- Monitor de comprobantes, baja y nota de crédito (spec 58).
- Logo del emisor (spec 53).
- Volver a beta, borrar el emisor, historial de pruebas y correo del resultado.
- Acceso desde el formulario de la empresa.

Cada uno, si llega, va en su propio spec.
