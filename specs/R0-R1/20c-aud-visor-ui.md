# SPEC 20c — Auditoría: visor en `plataforma-admin` con lista filtrable, detalle con diferencias, exportación y franja de integridad

> **Status:** Aprobado
> **Depends on:** SPEC 20b, SPEC 15, SPEC 15b, SPEC 15c, SPEC 15d, SPEC 17c
> **Date:** 2026-11-10
> **Objective:** Dar en `/admin/auditoria` una lista paginada de `aud.evento_auditoria` con filtros en la URL, el detalle de cada evento con la tabla de cambios antes/después, la exportación XLSX con MFA y una franja con el último resultado de la verificación de integridad, con su opción «Auditoría» en el menú de Seguridad.

## Por qué existe este spec

Fila 20c de `docs/roadmap-specs.md` (E-01, parte UI). Contexto de apoyo: `docs/spec-context/20-aud-auditoria.md`. El 20b dejó las 4 rutas de `/v1/aud` implementadas y probadas en dev; este spec solo las consume. No toca el back salvo el manifiesto.

Lo que hay en el código hoy (revisado al redactar):

- `GET /v1/aud/eventos` (20b): filtros `desde`, `hasta` (obligatorios, ≤ 92 días), `usuario` (2-100), `accion` (exacta), `entidad_tipo`, `entidad_id`, `sucursal_id`, `tipo` (`OPERACION` | `ACCESO_SENSIBLE`), `persona_titular_id`, `pagina`, `tamano` (1-100). Devuelve `{ items, total }` con `id`, `numero` (texto), `tipo`, `origen`, `accion`, `entidad_tipo`, `entidad_id`, `usuario { id, nombre, correo } | null`, `sucursal { id, codigo, nombre } | null`, `motivo`, `finalidad`, `ticket`, `persona_titular_id`, `ip`, `ocurrido_en`.
- `GET /v1/aud/eventos/:id`: lo anterior más `antes`, `despues`, `cambios [{ campo, antes, despues }]` (hasta 200, ordenados por ruta), `trace_id`, `event_id`, `hash_anterior`, `hash`. Fuera de alcance responde 404.
- `GET /v1/aud/eventos/exportar` (`plat.auditoria.exportar`, sensible): XLSX con `Content-Disposition`; sin aal2 responde 401 `MFA_REQUERIDA`; 422 `EXPORTACION_DEMASIADO_GRANDE`; 503 `AUDITORIA_NO_DISPONIBLE`.
- `GET /v1/aud/integridad`: `{ id, modo, desde_numero, hasta_numero, filas, estado, numero_roto, motivo, iniciada_en, terminada_en }`; 403 `SUCURSAL_FUERA_DE_ALCANCE` sin alcance TENANT; 404 `SIN_VERIFICACIONES`.
- Sin alcance TENANT, pedir `sucursal_id` distinto del de `X-Sucursal-Id` responde 403 `SUCURSAL_FUERA_DE_ALCANCE`.
- La bitácora (specs 18 y 18b) ya resolvió el mismo patrón en `libs/plataforma/admin-cliente`: `BitacoraListaPage` (rango con `mat-date-range-input`, `vit-filtros`, `vit-tabla`, filtros en la URL, «última consulta gana»), `BitacoraDetallePage`, `BitacoraCliente.exportar` (Blob, `OMITIR_AVISO_ERROR`, lectura del error JSON dentro del Blob), redirección al MFA con `PARAMETRO_RETORNO`, `descargarArchivo`, `diaEnLima` y `rangoPorDefecto` (7 días).
- El interceptor global de errores (`shared/shell`) solo avisa sin conexión y 5xx; los 4xx los maneja la página.
- `SesionService.contexto().sucursales` trae las sucursales accesibles (`id`, `empresaId`, `codigo`, `nombre`).
- El manifiesto PLAT está en `1.14.0`, con `plat.auditoria.consultar` y `plat.auditoria.exportar` y el rol `PLAT_AUDITOR`, sin opción de menú.

RF cubiertos (UI):

- **TR-RF-086**: consultar y exportar auditoría.
- **TR-RF-085** (parte): el responsable de datos ve los accesos sensibles filtrando por tipo y titular.

Criterios del SRS en lo que toca a la UI: **TR-CA-213** y **TR-CA-214**. Los de detalle, exportación e integridad en pantalla son propios.

Reglas: **TR-RN-028** (la pantalla solo lee), **TR-RN-047** (exportar exige permiso propio; la API la audita), **TR-RN-009** (exportar exige MFA reciente).

RNF propios:

- **TR-RNF-018**: 360, 600, 768 y 1280 px.
- **TR-RNF-019**: axe-core sin `critical` ni `serious`.
- **TR-RNF-122**: solo tokens.
- **TR-RNF-026**: la consola del navegador no muestra `antes`, `despues`, `motivo` ni correo.

RNF heredados: 010, 012, 024/119, 101.

Historias del backlog: **E-01** (parte UI). Estimado: 6-7 h. Si se pasa, se recorta primero el panel plegable con el JSON completo del detalle.

## Diseño UI

| Pantalla | Pantalla tipo | Cambia en |
| --- | --- | --- |
| Lista de auditoría | Lista | Franja de integridad arriba de los filtros; campo «Acción» de texto junto a `vit-filtros`; chips removibles «Filtrado por entidad …» y «Filtrado por titular …» |
| Detalle de evento | Detalle | Tabla «Cambios» (campo · antes · después) con el valor nuevo resaltado, panel plegable «JSON completo» y sección «Datos técnicos» |
| Error de exportación | Confirmación | El aviso de error de `AvisosService`, como la bitácora |

- Después de guardar este spec se dibujan en el canvas «Vitrina · Diseño UI» (https://claude.ai/artifact/UGvcmiWUiBsMuWerqMiWxh), en una página «20c · Auditoría», en claro y oscuro y a 600 px:
  - la lista con la franja en estado OK;
  - la lista con la franja en estado ROTA;
  - el detalle con la tabla de cambios.
- El usuario revisa el canvas antes de aprobar. Si el canvas cambia algo, se corrige el spec.
- Se verifica en tema claro y oscuro y a 600 px de ancho.

## Alcance

**In:**

- **Rutas** `auditoria` y `auditoria/:eventoId` en `ADMIN_CLIENTE_ROUTES`, con `permisoGuard('plat.auditoria.consultar')`.
- **Páginas** `AuditoriaListaPage` y `AuditoriaDetallePage` en `libs/plataforma/admin-cliente/src/lib/pages/`.
- **Componente** `vit-franja-integridad` en `components/franja-integridad/`.
- **Cliente** `AuditoriaCliente` (`listar`, `detalle`, `exportar`, `ultimaVerificacion`).
- **Modelos, mensajes y utilidades** de auditoría (ver modelo de datos).
- **Refactor chico**: la lectura del error JSON dentro de un Blob pasa de `bitacora.cliente.ts` a `utils/error-de-blob.ts`, y `CODIGO_MFA_REQUERIDA` a `models/error-admin.ts`; la bitácora y la auditoría los usan.
- **Manifiesto PLAT `1.15.0`**: opción «Auditoría» bajo Seguridad.
- **Pruebas** unitarias (Vitest con `@angular/build:unit-test`) y verificación en el navegador con el MCP Playwright.
- **Nube, dev (manual)**: aplicar el manifiesto `1.15.0`.

**Out of scope (para otros specs):**

- Cambios en la API de `/v1/aud` (el 20b está implementado).
- Página propia de integridad con el historial de verificaciones.
- Lanzar una verificación desde la pantalla, o atender o reparar una rotura.
- Vista del titular de sus accesos sensibles y ARCO (R2).
- Enlaces desde otras pantallas (venta, sucursal, usuario) a su auditoría filtrada; la lista ya acepta `entidad_tipo` y `entidad_id` por URL para cuando lleguen.
- Etiquetas legibles por acción (`rest.venta.anular` → «Anular venta»); la acción se muestra como código.
- Saber en el front si el actor tiene alcance TENANT.
- Visor en `plataforma-consola` o entre tenants.

## Base de código reutilizada

**Se conserva (como patrón):**

- Spec 18: `BitacoraListaPage`, `BitacoraDetallePage`, `filtro-url-bitacora.ts` (`diaEnLima`, `rangoPorDefecto`, `LONGITUD_MINIMA_USUARIO`), `paginaDesdeUrl`, `tamanoDesdeUrl`, `Listado`, `aListado`, `aErrorAdmin`, `solicitar`, `formatearFechaHora`.
- Spec 18b: `BitacoraCliente.exportar`, `descargarArchivo`, `nombreDeArchivo`, el flujo «sin MFA vigente → `/auth/mfa` con retorno».
- `shared/ui`: `vit-tabla` (con `movil`), `vit-filtros`, `vit-chip-estado`, `vit-cargando`, `vit-estado-vacio`, `AvisosService`, clase `vit-destructivo`.
- Spec 19e: el `AdaptadorFechaPeru` y `CalendarioEnEspanol` del selector de rango.

**Cambia:**

- `bitacora.cliente.ts` importa `conCuerpoJson` de `utils/error-de-blob.ts` (mismo comportamiento; sus pruebas no cambian).
- `bitacora-lista.page.ts` importa `CODIGO_MFA_REQUERIDA` de `models/error-admin.ts`.
- `permisos-admin.ts` suma `auditoriaConsultar` y `auditoriaExportar`.
- `admin-cliente.routes.ts` suma las 2 rutas.
- `libs/plataforma/seguridad/manifiesto/plat.manifiesto.json` pasa a `1.15.0`; las pruebas que fijan la versión (`manifiesto-exportacion.spec.ts`, `manifiesto-soporte.spec.ts` y las que corresponda) pasan a `1.15.0`.

**No existe** y se escribe desde cero: lo demás de este spec.

## Modelo de datos

No hay datos persistidos nuevos. Los modelos del front son:

### `models/evento-auditoria.ts`

```ts
export const TIPOS_EVENTO_AUDITORIA = ['OPERACION', 'ACCESO_SENSIBLE'] as const;
export type TipoEventoAuditoria = (typeof TIPOS_EVENTO_AUDITORIA)[number];
export type Finalidad = 'ATENCION' | 'AUDITORIA_MEDICA' | 'SOPORTE' | 'OTRO';

export interface FiltroAuditoria {
  desde: string; hasta: string;            // YYYY-MM-DD; por defecto los últimos 7 días en Lima
  usuario?: string;                        // ≥ 2 caracteres
  accion?: string;
  tipo?: TipoEventoAuditoria;
  sucursalId?: string;
  entidadTipo?: string; entidadId?: string;
  personaTitularId?: string;
  pagina: number; tamano: number;
}

export interface EventoAuditoria {
  id: string; numero: string; tipo: TipoEventoAuditoria; accion: string;
  entidadTipo: string; entidadId: string;
  usuario: { id: string; nombre: string; correo: string } | null;
  sucursal: { id: string; codigo: string; nombre: string } | null;
  motivo: string | null; finalidad: Finalidad | null; ticket: string | null;
  personaTitularId: string | null; ip: string | null; ocurridoEn: Date;
}

export interface CambioAuditoria { campo: string; antes: unknown; despues: unknown }

export interface EventoAuditoriaDetalle extends EventoAuditoria {
  antes: unknown; despues: unknown; cambios: CambioAuditoria[];
  traceId: string | null; eventId: string | null; hashAnterior: string; hash: string;
}
```

- `aEventoAuditoria` y `aEventoAuditoriaDetalle` mapean `snake_case` a `camelCase` y `ocurrido_en` a `Date`, como `aEventoSeguridad`.
- `origen` no se muestra (es dato técnico del 20a); el mapeo lo ignora.

### `models/verificacion-integridad.ts`

```ts
export type MotivoRotura = 'HASH' | 'ENLACE' | 'HUECO' | 'TRUNCADA';
export interface VerificacionIntegridad {
  estado: 'OK' | 'ROTA'; modo: 'INCREMENTAL' | 'COMPLETA';
  hastaNumero: string; filas: string;
  numeroRoto: string | null; motivo: MotivoRotura | null;
  terminadaEn: Date;
}
/** Lo que pinta la franja; `oculta` cuando la API responde 403. */
export type EstadoFranja = { tipo: 'cargando' } | { tipo: 'oculta' } | { tipo: 'sin-verificar' } | { tipo: 'verificada'; verificacion: VerificacionIntegridad };
```

### `models/mensajes-auditoria.ts`

- `MENSAJES_AUDITORIA`: títulos («Auditoría», «Evento de auditoría»), etiquetas de filtros y campos, textos vacíos y de error, «Sistema», «Todo el tenant», «Exportar», «Exportando…», textos de la franja.
- `COLUMNAS_AUDITORIA`: Fecha, Tipo, Acción, Entidad, Usuario, Sucursal.
- `ETIQUETAS_TIPO_AUDITORIA`: `Operación`, `Acceso sensible` (las mismas de la hoja XLSX del 20b).
- `TONOS_TIPO_AUDITORIA`: `OPERACION` neutro, `ACCESO_SENSIBLE` de aviso.
- `ETIQUETAS_FINALIDAD`: `Atención`, `Auditoría médica`, `Soporte`, `Otro`.
- `ETIQUETAS_MOTIVO_ROTURA`: `HASH` «el contenido no coincide con su hash», `ENLACE` «no enlaza con el evento anterior», `HUECO` «falta un evento en la cadena», `TRUNCADA` «faltan eventos ya verificados».

### `utils/filtro-url-auditoria.ts`

```ts
export const PARAMETRO_URL_AUDITORIA = {
  desde: 'desde', hasta: 'hasta', usuario: 'usuario', accion: 'accion', tipo: 'tipo',
  sucursalId: 'sucursal_id', entidadTipo: 'entidad_tipo', entidadId: 'entidad_id', personaTitularId: 'persona_titular_id',
} as const;
export function filtroAuditoriaDesdeUrl(parametros: ParamMap, ahora: Date): FiltroAuditoria;
export function filtroAuditoriaParaUrl(filtro: FiltroAuditoria): Params;
```

- Reutiliza `rangoPorDefecto`, `diaEnLima`, `paginaDesdeUrl` y `tamanoDesdeUrl`. Un `tipo` fuera del catálogo se ignora; un rango incompleto toma los últimos 7 días; un `usuario` de 1 carácter se ignora.
- Los nombres de los query params son los de la API, así una URL de la lista se puede armar desde otra pantalla sin traducir.

### `utils/valor-cambio.ts`

- `textoDeValor(valor: unknown): string`: `null` o `undefined` → «—»; texto tal cual; número y booleano con `String`; objeto o arreglo con `JSON.stringify`. Lo usan la tabla de cambios y nada más.

### `utils/error-de-blob.ts`

- `conCuerpoJson(error: unknown): Promise<unknown>`, movida tal cual desde `bitacora.cliente.ts` con su `leerTexto` por `FileReader`.

## Comportamiento

### Lista (`/admin/auditoria`)

1. Al entrar sin query params, rango de los últimos 7 días en Lima, página 1, tamaño 20.
2. Encabezado: título «Auditoría» y, con `*siPermiso="plat.auditoria.exportar"`, el botón «Exportar».
3. Franja de integridad (`vit-franja-integridad`), arriba de los filtros. Se pide una vez al entrar, no en cada cambio de filtro.
4. Filtros, todos en la URL:
   - rango de fechas con `mat-date-range-input` (navega al elegir la segunda fecha);
   - `vit-filtros` con la búsqueda por usuario, el select «Tipo» (`Todos`, `Operación`, `Acceso sensible`) y el select «Sucursal» (`Todas` y las de `SesionService.contexto().sucursales` como «código · nombre»);
   - campo de texto «Acción» que aplica con Enter o al salir del campo; vacío quita el filtro; el texto se recorta y pasa a minúsculas;
   - si la URL trae `entidad_tipo`/`entidad_id`, un chip «Entidad: {tipo} · {id}» con botón de quitar; si trae `persona_titular_id`, un chip «Titular: {id}» con botón de quitar.
5. Todo cambio de filtro vuelve a la página 1. Solo se pinta la respuesta de la última consulta.
6. Tabla `vit-tabla` con columnas:

   | Columna | Valor | `movil` |
   | --- | --- | --- |
   | Fecha | `formatearFechaHora(ocurridoEn)` | `detalle` (junto al usuario) |
   | Tipo | chip con `ETIQUETAS_TIPO_AUDITORIA` y `TONOS_TIPO_AUDITORIA` | `estado` |
   | Acción | código en fuente mono | `titulo` |
   | Entidad | `{entidadTipo} · {entidadId}` | — |
   | Usuario | nombre o «Sistema» | `detalle` |
   | Sucursal | código o «Todo el tenant» | — |

   La acción de fila es un enlace a `auditoria/:id` con `aria-label` «Ver detalle: {acción}, {fecha}».
7. Sin resultados: `textoVacio` «No hay eventos de auditoría con estos filtros».
8. Error de la API (incluido 403 `SUCURSAL_FUERA_DE_ALCANCE` y 400 de rango): la tabla queda vacía y se muestra el `mensaje` de la API en el `role="alert"` de la página, como la bitácora.
9. Exportar: mismos filtros aplicados que la lista, sin página ni tamaño.
   - Sin `mfaVigente` en el contexto, lleva a la ruta de MFA con `PARAMETRO_RETORNO` = URL actual, sin llamar a la API.
   - Con MFA, botón deshabilitado y «Exportando…» mientras viaja; al llegar, `descargarArchivo` con el nombre de `Content-Disposition` (o `auditoria-AAAAMMDD-AAAAMMDD.xlsx`).
   - 401 `MFA_REQUERIDA` sigue el camino de «sin MFA»; 422 y 503 abren `AvisosService.error` con el `mensaje` de la API.

### Franja de integridad (`vit-franja-integridad`)

| Respuesta de `GET /v1/aud/integridad` | Qué muestra |
| --- | --- |
| Cargando | Nada (no ocupa alto) |
| 200 `OK` | Ícono `verified`, «Cadena verificada el {fecha y hora} · {hasta_numero} eventos», tono de éxito |
| 200 `ROTA` | Ícono `gpp_bad`, clase `vit-destructivo`, `role="alert"`: «Cadena rota en el evento N.º {numero_roto}: {motivo legible}. Verificada el {fecha y hora}.» |
| 404 `SIN_VERIFICACIONES` | Ícono `schedule`, tono neutro, «La cadena aún no se ha verificado» |
| 403 o cualquier otro error | Nada |

- El componente recibe el estado por `input()` (`EstadoFranja`); la página hace la llamada. Así se prueba sin HTTP.

### Detalle (`/admin/auditoria/:eventoId`)

1. Enlace «Volver» a la lista con los filtros con que se entró. La lista pasa su URL en el `state` de la navegación al detalle; el detalle la usa si existe y, si no, vuelve a `/admin/auditoria`.
2. Encabezado: «Evento de auditoría», chip de tipo, acción en mono y fecha.
3. Bloque de datos (`dl`): Usuario (nombre · correo, o «Sistema»), Sucursal (código · nombre, o «Todo el tenant»), Entidad (tipo · id), y según tenga valor: Motivo, Finalidad (etiqueta), Ticket, Titular, IP.
4. Sección «Cambios»:
   - sin cambios: «Este evento no registra cambios»;
   - con cambios: tabla HTML simple (no `vit-tabla`, no pagina) con columnas Campo (mono), Antes y Después, valores con `textoDeValor`; la celda Después lleva fondo de token de realce (`--color-*` de `tema.css`) y la Antes texto atenuado; un campo que no estaba antes muestra «—»;
   - con 200 cambios, nota «Se muestran los primeros 200 cambios».
   - A 600 px o menos, cada cambio se apila como tarjeta: campo arriba, antes y después debajo con su etiqueta.
5. Panel plegable `mat-expansion-panel` «JSON completo», cerrado por defecto, con `antes` y `despues` en `<pre>` con `JSON.stringify(valor, null, 2)`; `null` se muestra como «—».
6. Sección «Datos técnicos»: N.º en la cadena, hash anterior, hash, `trace_id` y `event_id`, en mono y con `break-all`.
7. 404: mensaje «El evento no existe o está fuera de tu alcance» en `role="alert"` y el enlace «Volver».

## Manifiesto PLAT `1.15.0`

```json
{ "codigo": "plat.seguridad.auditoria", "modulo": "seguridad", "padre": "plat.seguridad", "nombre": "Auditoría", "ruta": "/admin/auditoria", "icono": "fact_check", "orden": 7, "permisos": ["plat.auditoria.consultar"] }
```

- Sin permisos ni roles nuevos. `PLAT_AUDITOR` y `PLAT_PROPIETARIO` ya tienen `plat.auditoria.consultar` (20b), así que ven la opción.

## Plan de implementación

1. **Refactor de la exportación de la bitácora.**
   - Mover `conCuerpoJson` y `leerTexto` a `utils/error-de-blob.ts` y `CODIGO_MFA_REQUERIDA` a `models/error-admin.ts`; ajustar imports.
   - Verificar: `pnpm nx test admin-cliente` sin cambios en las pruebas de la bitácora.
2. **Modelos, mensajes, filtro de URL y cliente.**
   - `evento-auditoria.ts`, `verificacion-integridad.ts`, `mensajes-auditoria.ts`, `permisos-admin.ts`, `filtro-url-auditoria.ts`, `valor-cambio.ts`, `auditoria.cliente.ts`.
   - Pruebas: mapeos de lista y detalle; `filtroAuditoriaDesdeUrl` sin params (7 días), con `tipo` inválido, con `usuario` de 1 carácter, ida y vuelta con todos los filtros; `textoDeValor` con null, texto, número, booleano, objeto y arreglo; el cliente arma los query params con los nombres de la API, `exportar` devuelve Blob y nombre, y un 422 dentro de un Blob sale como `ErrorAdmin` con su código; `ultimaVerificacion` devuelve `null` con 404.
   - Verificar: `pnpm nx test admin-cliente`.
3. **Franja de integridad.**
   - `components/franja-integridad/` (`.ts`, `.html`; `.css` solo si hace falta).
   - Pruebas: los 4 estados visibles y el oculto, con el texto y el ícono de cada uno; `ROTA` con `role="alert"` y motivo legible.
4. **Lista.**
   - `pages/auditoria-lista/`, ruta `auditoria` con su guard.
   - Pruebas: entrar sin params pide los últimos 7 días; TR-CA-213 (filtrar por usuario «rosa» y acción `rest.venta.anular` pone ambos en la URL y en la petición, y pinta las 7 filas devueltas); el select de sucursal lista las del contexto y manda `sucursal_id`; un 403 `SUCURSAL_FUERA_DE_ALCANCE` deja la tabla vacía y muestra el mensaje (TR-CA-214 en la UI); chips de entidad y titular aparecen con la URL y al quitarlos desaparece el parámetro; exportar sin MFA navega al MFA sin pedir el archivo; con MFA descarga; 503 abre el aviso; sin `plat.auditoria.exportar` no hay botón; la franja se pide una sola vez aunque cambien los filtros; sin `plat.auditoria.consultar` la ruta va a `/403`.
5. **Detalle.**
   - `pages/auditoria-detalle/`, ruta `auditoria/:eventoId`.
   - Pruebas: datos del evento con y sin usuario y sucursal; finalidad y ticket de un acceso sensible de soporte; tabla de cambios con un campo nuevo («—» en Antes); sin cambios muestra el texto; el panel JSON está cerrado y al abrirlo muestra `antes` y `despues`; datos técnicos con hash y número; 404 muestra el mensaje; «Volver» regresa a la lista con los filtros con que se entró.
6. **Manifiesto `1.15.0`.**
   - Opción `plat.seguridad.auditoria`, versión `1.15.0` y pruebas que fijan la versión.
   - Verificar: `pnpm nx test seguridad` y `pnpm nx run-many -t lint test build` con código 0.
7. **Canvas y verificación en el navegador.**
   - Ajustes del canvas «20c · Auditoría» ya aprobado, si los hay.
   - `nx serve plataforma-admin` con la sesión falsa y la API simulada en Playwright: recorrer TR-CA-213 y TR-CA-214, el detalle, la exportación sin y con MFA y los 4 estados de la franja; consola sin errores; capturas de lista (OK y ROTA) y detalle en claro, oscuro, 600 px y 360 px; axe-core sin `critical` ni `serious`.
8. **Cierre de calidad.**
   - `code-simplifier` sobre los archivos nuevos y modificados; revisar su diff.
9. **Nube, dev (manual).**
   - `pnpm manifiesto:aplicar:remoto` del PLAT `1.15.0`; aplicarlo otra vez da 0 cambios.
   - Con un usuario con `PLAT_AUDITOR`, el menú muestra «Seguridad > Auditoría». Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**Lista y filtros (TR-RF-086):**

- [ ] `/admin/auditoria` sin query params pide a la API los últimos 7 días en Lima, página 1, tamaño 20.
- [ ] Filtrar por usuario «rosa» y acción `rest.venta.anular` muestra las 7 anulaciones de octubre que devuelve la API (TR-CA-213).
- [ ] Un 403 `SUCURSAL_FUERA_DE_ALCANCE` al elegir otra sucursal deja la tabla vacía y muestra el mensaje de la API (TR-CA-214).
- [ ] Todos los filtros viven en la URL; recargar la página conserva filtros, página y tamaño.
- [ ] `entidad_tipo`, `entidad_id` y `persona_titular_id` en la URL se muestran como chips y al quitarlos desaparecen de la URL.
- [ ] La tabla tiene Fecha, Tipo, Acción, Entidad, Usuario y Sucursal; «Sistema» sin usuario y «Todo el tenant» sin sucursal.
- [ ] A 600 px la tabla se ve como tarjetas con la acción de título y el tipo como chip.

**Exportación (TR-RN-047, TR-RN-009):**

- [ ] Sin `plat.auditoria.exportar` no aparece el botón «Exportar».
- [ ] Sin MFA vigente, «Exportar» lleva a la verificación MFA y vuelve a la lista con sus filtros; no se llama a la API.
- [ ] Con MFA, se descarga el XLSX con el nombre que manda la API y los filtros de la lista.
- [ ] 422 y 503 abren un aviso con el mensaje de la API; el botón vuelve a habilitarse.

**Detalle:**

- [ ] El detalle muestra usuario, sucursal, entidad, motivo, finalidad, ticket, titular e IP cuando tienen valor.
- [ ] La tabla «Cambios» muestra campo, antes y después de cada cambio, con «—» cuando falta un lado y el valor nuevo resaltado con un token.
- [ ] El panel «JSON completo» empieza cerrado y muestra `antes` y `despues` al abrirlo.
- [ ] «Datos técnicos» muestra número, hash anterior, hash, `trace_id` y `event_id`.
- [ ] Un 404 muestra «El evento no existe o está fuera de tu alcance».
- [ ] «Volver» regresa a la lista con los filtros con que se entró.

**Integridad:**

- [ ] Con `OK`, la franja muestra la fecha de la verificación y el número de eventos.
- [ ] Con `ROTA`, la franja usa `vit-destructivo`, `role="alert"` y dice el número roto y el motivo legible.
- [ ] Con 404 muestra «La cadena aún no se ha verificado»; con 403 no muestra nada.
- [ ] La franja se pide una vez por entrada a la lista, no por cada cambio de filtro.

**Menú, diseño, accesibilidad y calidad:**

- [ ] Con el manifiesto `1.15.0` aplicado, un usuario con `plat.auditoria.consultar` ve «Seguridad > Auditoría» y uno sin él no la ve ni entra (va a `/403`).
- [ ] El manifiesto `1.15.0` aplicado dos veces da 0 cambios.
- [ ] Las pantallas coinciden con el canvas «20c · Auditoría» aprobado.
- [ ] Lista y detalle se verifican en tema claro y oscuro, a 600 px y a 360 px, con capturas.
- [ ] axe-core no reporta `critical` ni `serious` en lista y detalle.
- [ ] Ningún hex suelto en los archivos nuevos; solo tokens `--color-*` y clases de Tailwind sobre ellos.
- [ ] La consola del navegador no muestra errores ni registra `antes`, `despues`, `motivo` ni correo.
- [ ] Componentes y páginas con `templateUrl` (y `styleUrl` solo si hay `.css`), un artefacto por archivo, `index.ts` sin `export *`.
- [ ] Las pruebas de la bitácora pasan sin cambios después del refactor.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.
- [ ] Las horas reales de E-01 (parte 20c) quedan registradas en el plan.

## Decisiones

- **Sí:** páginas en `admin-cliente` y opción bajo Seguridad (`/admin/auditoria`, orden 7). Decisión del usuario. Mismo lugar y patrón que la bitácora. **No:** lib `auditoria-ui` nueva; más andamiaje para dos páginas. **No:** módulo propio en el menú.
- **Sí:** filtros visibles de rango, usuario, tipo, sucursal y acción; entidad y titular solo por URL con chip removible. Decisión del usuario. Entidad y titular son filtros de llegada desde otra pantalla, no de búsqueda a mano.
- **Sí:** query params con los nombres de la API (`sucursal_id`, `entidad_tipo`…). Otra pantalla arma el enlace sin conocer el front.
- **Sí:** acción como texto exacto, no select. No hay endpoint con el catálogo de acciones y cada producto define las suyas.
- **Sí:** acción mostrada como código. **No:** etiquetas por acción; sin catálogo, quedaría incompleto. Otro spec si llega.
- **Sí:** select de sucursal con las accesibles y el 403 de la API como error en pantalla. Decisión del usuario. **No:** inferir el alcance de la franja de integridad; acopla dos cosas. **No:** endpoint de alcance; toca el 20b.
- **Sí:** columnas Fecha, Tipo, Acción, Entidad, Usuario y Sucursal. Decisión del usuario. El motivo y los montos de TR-CA-213 están en el detalle.
- **Sí:** detalle con tabla de cambios, JSON plegable y datos técnicos. Decisión del usuario. La tabla responde «qué cambió»; el JSON y el hash sirven al responsable de datos. **No:** vista lado a lado; más trabajo para lo mismo.
- **Sí:** tabla HTML simple para los cambios, no `vit-tabla`. Son hasta 200 filas sin paginar ni acciones; `vit-tabla` está hecha para listas de la API.
- **Sí:** franja de integridad en la lista. Decisión del usuario. **No:** página propia de integridad; el historial no es necesario en R1.
- **Sí:** 403 de integridad oculta la franja; 404 muestra «aún no verificada». Sin alcance TENANT el dato no es del actor; sin verificaciones sí es un dato útil.
- **Sí:** la franja se pide una vez por entrada. Su resultado no depende de los filtros.
- **Sí:** mismo flujo de exportación que la bitácora (MFA antes, Blob, aviso de error). El usuario ya lo conoce y está probado en dev.
- **Sí:** mover `conCuerpoJson` a `utils/` en vez de copiarlo. Regla de código sin duplicados.
- **Sí:** manifiesto `1.15.0` solo con la opción de menú. Permisos y rol ya los trajo el 20b.
- **Sí:** canvas «20c · Auditoría» con lista (OK y ROTA) y detalle antes de aprobar. Decisión del usuario. El detalle con diferencias no tiene pantalla tipo exacta.
- **Sí:** verificación en el navegador con la API simulada en Playwright y sesión falsa. La API real de dev ya se probó en el 20b; la UI se prueba con datos controlados (7 filas de Rosa, cadena rota).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un JSON grande en `antes`/`despues` (hasta 64 KB) hace lento el panel plegable | El panel empieza cerrado y su contenido se renderiza solo al abrirlo (`matExpansionPanelContent` diferido). |
| Valores largos en la tabla de cambios rompen el ancho a 360 px | `break-words` en las celdas y vista apilada a 600 px o menos. |
| El actor sin alcance TENANT ve «Todas» en el select pero la API le fuerza su sucursal | Es el comportamiento del 20b: «Todas» para él significa su sucursal. Se documenta en el texto de ayuda del select si el canvas lo pide. |
| El refactor de `conCuerpoJson` rompe la exportación de la bitácora | El paso 1 va solo y se verifica con las pruebas de la bitácora antes de seguir. |
| El detalle necesita la URL de la lista para «Volver» y el usuario entra directo por enlace | Sin `state`, vuelve a `/admin/auditoria` con el rango por defecto. |

## Lo que **no** está en este spec

- Cambios en la API de `/v1/aud`.
- Página de integridad con historial, lanzar verificaciones o atender roturas.
- Vista del titular y ARCO (R2).
- Enlaces desde otras pantallas a la auditoría filtrada.
- Etiquetas legibles por acción.
- Visor en la consola o entre tenants.
