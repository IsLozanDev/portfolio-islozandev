# SPEC 40 — Personas: revisión de duplicados, comparación lado a lado y fusión en admin

> **Status:** Implementado
> **Depends on:** SPEC 39, SPEC 38, SPEC 17c, SPEC 15b, SPEC 15c, SPEC 15d
> **Date:** 2026-11-25
> **Objective:** Dar al administrador del cliente, en `admin-cliente`, una lista de pares de personas posiblemente duplicadas (también filtrada por una persona desde su ficha), una comparación a dos columnas donde elige la ficha que se conserva, cada dato básico y cada principal, y la fusión confirmada con motivo y aal2, más el descarte con deshacer y la ficha que resuelve los alias.

## Por qué existe este spec

Fila 40 de `docs/roadmap-specs.md` (UI de TR-RF-042). Contexto: `docs/spec-context/tr-per/per-duplicados-fusion.md`, partición B. El spec 39 dejó el back implementado. Hay cinco rutas: lista, comparación, descartar, quitar descarte y fusionar. `plat.persona.fusionar` es sensible (aal2). Las lecturas de una absorbida devuelven la conservada con `resuelta_desde`.

El roadmap da 6 h. El usuario sumó «duplicados desde la ficha», que necesita un filtro por persona en el back. Estimado: 8-8,5 h (1 h de canvas, 1,5 h de back y 6 h de UI). Orden de recorte si se pasa de 10 h: (1) la sección de duplicados en la ficha y el filtro `persona` del back, (2) el deshacer del descarte. Lo recortado pasa a un 40b.

Lo que hay en el código hoy (revisado al redactar):

- `libs/plataforma/personas/src/interface/duplicados.controller.ts`: `GET /v1/personas/duplicados?pagina=&tamano=` y `GET /v1/personas/duplicados/{a}/{b}` (`plat.persona.leer`). `POST /v1/personas/duplicados/descartes` y `DELETE /v1/personas/duplicados/descartes/{a}/{b}` (`plat.persona.fusionar`).
- `fusiones.controller.ts`: `POST /v1/personas/fusiones` con `persona_conservada_id`, `persona_absorbida_id`, `version_conservada`, `version_absorbida`, `campos_elegidos.datos_basicos` (`CONSERVADA` / `ABSORBIDA` por campo), `campos_elegidos.principales` (`CELULAR`, `FIJO`, `CORREO`, `WHATSAPP`, `DIRECCION` → id) y `motivo`.
- `ConsultaDuplicadosTypeOrm.buscar({ pagina, tamano, puntajeMinimo })`: SQL crudo encapsulado, sin filtro por persona.
- Dominio: `Persona.absorber` mueve los contactos que la conservada no tiene (`esMismoContacto`: mismo tipo y valor exacto) y las direcciones que no tiene (`esMismoLugar`: mismo ubigeo y texto normalizado). Un principal elegido que se quedó en la absorbida por repetido pasa a su igual de la conservada (`equivalenteDe`).
- `PersonaDetalleDto` ya trae `resuelta_desde` y `alias`. El modelo del front (`personas-ui/models/persona.ts`) todavía no los mapea.
- Una edición sobre una absorbida responde 409 `PERSONA_FUSIONADA` con `persona_conservada_id`.
- `personas-ui`: `PersonasCliente`, `denominacionDe`, `formatoDocumento`, `formatoContacto`, `formatoUbigeo`, `formatoRol`, `normalizarTexto`, `solicitar`, `ErrorPersonas`, `mensajeDeError`, `TONO_ROL`.
- `admin-cliente`: `personas-lista` (toast `registrada` con `AvisosService`), `persona-detalle` (lee `personaId` del `snapshot`: no reacciona si cambia el parámetro), rutas `personas` y `personas/:personaId`.
- `shared/ui`: `AvisosService.confirmarDestructiva({ pedirMotivo, longitudMinimaMotivo })` con `textarea` y mínimo. No tiene máximo. `toast(tipo, texto)` no tiene acción.
- `shared/shell`: `AccionSensibleService.exigirMfa()` avisa y lleva a `/auth/mfa` con retorno si el MFA no está vigente.
- Manifiesto 1.29.0 con `plat.persona.fusionar` (`sensible: true`). Este spec no lo toca.

RF cubierto (UI): **TR-RF-042**. Criterios del SRS en pantalla: **TR-CA-107** (adaptado como en el 39: DNI y PASAPORTE con el mismo celular) y **TR-CA-108**.

Reglas: **TR-RN-001** (todo por tenant), **TR-RN-013** (la absorbida queda como alias, no se borra).

RNF propios:

- **TR-RNF-021**: la fusión pide confirmación explícita y un motivo de 5 a 300 caracteres.
- **TR-RNF-018**: 360, 600 y 1280 px.
- **TR-RNF-019**: axe-core sin `critical` ni `serious` en la lista y la comparación.
- **TR-RNF-026**: ni el id de persona del filtro ni los nombres en los logs.
- **TR-RNF-122**: solo tokens.

RNF heredados: 010, 012, 013 (lo cumple el back), 024/119, 101.

Historias del backlog: ninguna propia. R2-12 (CC-06) cubre la parte de SazónPOS (ver contexto, sec. 5).

## Alcance

**Entra:**

- Back (`libs/plataforma/personas`): filtro opcional `persona` en `GET /v1/personas/duplicados`. Devuelve solo los pares donde está esa persona.
- `shared/ui`: `longitudMaximaMotivo` opcional en `OpcionesConfirmacionDestructiva`.
- Diseño previo en el canvas «Vitrina · Diseño UI», página «40 · Duplicados». La comparación no encaja en ninguna pantalla tipo.
- `personas-ui`: modelos, mensajes, tonos, `DuplicadosCliente` y utilidades puras de la fusión. Mapeo de `resuelta_desde` y `alias` en `PersonaDetalle`. `persona_conservada_id` en `ErrorPersonas`.
- `admin-cliente`:
  - Página `duplicados-lista`: pares con puntaje y motivos, paginada, con filtro opcional por persona en la URL.
  - Página `duplicados-comparacion`: las dos fichas a dos columnas con elección de conservada, datos básicos y principales. Confirmación con motivo y fusión.
  - Descartar desde la fila y desde la comparación, con «Deshacer» justo después. «Volver a proponer» en la comparación de un par descartado.
  - Botón «Revisar duplicados» en `personas-lista`.
  - En `persona-detalle`: sección «Posibles duplicados (N)», resolución del alias y manejo de `PERSONA_FUSIONADA`.
- Verificación con Playwright en tema claro, oscuro, 600 y 360 px.

**No entra (specs futuros):**

- Lista de pares descartados: un descarte antiguo solo se quita desde la URL de su par.
- Opción de menú propia y cambios al manifiesto.
- Historial de fusiones (se ve en el visor de auditoría del 20c) y deshacer una fusión.
- Elegir el documento de la absorbida o mover sus consentimientos (el back no lo permite).
- Fusionar más de dos fichas a la vez o elegir campo por campo de contactos y direcciones (todos pasan; solo se elige el principal).
- Reasignación en SazónPOS (CC-06) y el consumidor de `persona.fusionada` en productos.
- Acción en `shared/ui` para un toast con botón.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `ListarDuplicados`, `ConsultaDuplicadosTypeOrm`, `duplicados.controller.ts` y su DTO (39) | Se suma el criterio `personaId`. Los demás contratos no cambian. |
| `CompararPar`, `DescartarPar`, `QuitarDescarte`, `FusionarPersonas` (39) | Sin cambios. |
| `personas-ui` (`PersonasCliente`, `solicitar`, `ErrorPersonas`, `mensajeDeError`, `denominacionDe`, `formato*`, `normalizarTexto`, `TONO_ROL`) | Se amplía con `DuplicadosCliente` y los modelos nuevos. `PersonaDetalle` suma dos campos. |
| `shared/ui` (`vit-tabla`, `vit-chip-estado`, `vit-estado-vacio`, `vit-cargando`, `vit-acciones-formulario`, `AvisosService`, `AccionesFilaDirective`) | Lista, comparación, confirmaciones y toasts. `confirmarDestructiva` gana el máximo de motivo. |
| `shared/auth` (`SiPermisoDirective`, `permisoGuard`, `SesionService`) | Acciones ocultas sin `plat.persona.fusionar` y guard de las rutas. |
| `shared/shell` (`AccionSensibleService`) | aal2 antes de descartar, quitar el descarte o elegir campos. |
| `admin-cliente` (`personas-lista`, `persona-detalle`, `utils/filtro-url-*.ts`, `paginaDesdeUrl`, `tamanoDesdeUrl`) | Molde de la lista con estado en la URL. La ficha suma la sección y el alias. |

## Modelo de datos

Este spec no agrega tablas ni migraciones. Usa el modelo del 39.

### Back: filtro por persona

- `GET /v1/personas/duplicados?pagina=&tamano=&persona=` (`plat.persona.leer`). `persona` es un uuid opcional. Con él, la lista trae solo los pares con `persona_a_id = persona` o `persona_b_id = persona`, con las mismas reglas, exclusiones, orden y paginado.
- `persona` que no es uuid → 400 `SOLICITUD_INVALIDA`. Una persona de otro tenant, inactiva o absorbida → lista vacía con `total: 0`, sin 404: la lista no confirma qué ids existen.
- `CriteriosDuplicados` suma `personaId: string | null`. `ConsultaDuplicadosTypeOrm` lo pasa como un parámetro más de la consulta (`$n::uuid IS NULL OR a.id = $n OR b.id = $n`), nunca concatenado. Sigue siendo el SQL crudo del 39, ya justificado por la regla 11.
- OpenAPI del parámetro. El registro HTTP no escribe el valor de `persona` (TR-RNF-026): se enmascara como `q` y `numero`.

### `shared/ui`: máximo del motivo

```ts
interface OpcionesConfirmacionDestructiva extends OpcionesConfirmacion {
  pedirMotivo?: boolean;
  longitudMinimaMotivo?: number;
  longitudMaximaMotivo?: number;   // nuevo: `maxlength` del textarea y validación con mensaje
}
```

`MENSAJES_UI.motivoMuyLargo(maximo)`: «El motivo admite hasta 300 caracteres». Sin el campo, el comportamiento actual no cambia.

### Front: `personas-ui`

```
src/lib/
  models/    duplicados.ts, mensajes-duplicados.ts, (persona.ts, error-personas.ts y tonos-personas.ts se amplían)
  services/  duplicados.cliente.ts
  utils/     campos-fusion.ts
```

```ts
// models/duplicados.ts
export type MotivoDuplicado = 'MISMO_NUMERO_OTRO_TIPO' | 'CELULAR_Y_NOMBRE_IGUAL' | 'CELULAR_Y_NOMBRE_PARECIDO';
export type CodigoBloqueo = 'MISMA_PERSONA' | 'DOCUMENTOS_DISTINTOS' | 'TIPO_PERSONA_DISTINTO' | 'PERSONA_FUSIONADA';
export type Origen = 'CONSERVADA' | 'ABSORBIDA';
export type ClavePrincipal = 'CELULAR' | 'FIJO' | 'CORREO' | 'WHATSAPP' | 'DIRECCION';

export interface ParCandidato { personaA: PersonaListada; personaB: PersonaListada; puntaje: number; motivos: MotivoDuplicado[] }
export interface PaginaDuplicados { items: ParCandidato[]; total: number; pagina: number; tamano: number }
export interface CriteriosDuplicados { pagina: number; tamano: number; personaId: string | null }

export interface ComparacionPar {
  personaA: PersonaDetalle;   // con `version`
  personaB: PersonaDetalle;
  puntaje: number;
  motivos: MotivoDuplicado[];
  descartado: boolean;
  bloqueo: CodigoBloqueo | null;
}

export interface EleccionFusion {          // estado del formulario de la comparación
  conservadaId: string;
  datosBasicos: Partial<Record<'nombres' | 'apellidoPaterno' | 'apellidoMaterno' | 'razonSocial', Origen>>;
  principales: Partial<Record<ClavePrincipal, string>>;   // id del contacto o dirección
}

export interface SolicitudFusion extends EleccionFusion {
  absorbidaId: string;
  versionConservada: number;
  versionAbsorbida: number;
  motivo: string;
}
```

- `persona.ts`: `PersonaDetalle` suma `resueltaDesde: string | null` y `alias: string[]`, mapeados desde `resuelta_desde` y `alias`.
- `error-personas.ts`: `ErrorPersonas` suma `personaConservadaId: string | null` (de `persona_conservada_id` en el 409 `PERSONA_FUSIONADA`).
- `mensajes-duplicados.ts`:

  | Clave | Texto |
  | --- | --- |
  | `MISMO_NUMERO_OTRO_TIPO` | «Mismo número, otro tipo de documento» |
  | `CELULAR_Y_NOMBRE_IGUAL` | «Mismo celular y nombre» |
  | `CELULAR_Y_NOMBRE_PARECIDO` | «Mismo celular, nombre parecido» |
  | `DOCUMENTOS_DISTINTOS` | «Las personas tienen documentos distintos» (TR-CA-108) |
  | `TIPO_PERSONA_DISTINTO` | «Una es persona natural y la otra jurídica» |
  | `PERSONA_FUSIONADA` | «Una de las fichas ya se fusionó con otra» |
  | `MISMA_PERSONA` | «Es la misma ficha» |
  | `MOTIVO_INVALIDO` | «El motivo debe tener entre 5 y 300 caracteres» |
  | `CAMPO_ELEGIDO_INVALIDO` | «La elección ya no corresponde a las fichas; se recargó la comparación» |
  | `VERSION_OBSOLETA` | «Una de las fichas cambió; se recargó la comparación» |
  | `DESCARTE_NO_ENCONTRADO` | «El par ya no estaba descartado» |
  | `fusionada` | «Fichas fusionadas» |
  | `descartado` | «Se descartó el par {A} — {B}» |
  | `aliasResuelto` | «Esta ficha se fusionó en {denominación}. Se muestra la ficha vigente.» |
  | `vacio` | «No hay posibles duplicados» con «Se proponen pares con el mismo número en otro tipo de documento o el mismo celular» |

- `tonos-personas.ts`: `TONOS_PUNTAJE` (100 y 80 → `advertencia`, 60 → `info`) y `TONO_DESCARTADO` (`neutro`).
- `duplicados.cliente.ts` (`DuplicadosCliente`): `listar(criterios)`, `comparar(a, b)`, `descartar(a, b)`, `quitarDescarte(a, b)`, `fusionar(solicitud): Promise<PersonaDetalle>`. Mapea a snake_case y de vuelta. Los errores llegan como `ErrorPersonas`, por `solicitar`.
- `campos-fusion.ts` (funciones puras):
  - `conservadaSugerida(a, b)`: la de DNI o RUC sobre CE o PASAPORTE. Si empatan, `a` (id menor).
  - `eleccionInicial(conservada, absorbida)`: todos los datos básicos aplicables en `CONSERVADA`. Por cada clave de principal, el principal de la conservada. Si no tiene, el de la absorbida. Si ninguna tiene, la clave no va.
  - `opcionesDatosBasicos(conservada, absorbida)`: por campo aplicable al tipo de persona, los dos valores y si son iguales (comparados con `normalizarTexto`). Un campo igual no ofrece elección.
  - `opcionesPrincipales(conservada, absorbida)`: por clave, los candidatos de las dos fichas. Un contacto de la absorbida con el mismo tipo y valor que uno de la conservada se muestra una vez, marcado «En las dos». Lo mismo con una dirección del mismo ubigeo y texto normalizado. Es el mismo criterio que `esMismoContacto` y `esMismoLugar`. Si el front y el back difieren, solo cambia la presentación: el back resuelve el principal con `equivalenteDe`.
  - `solicitudDe(eleccion, comparacion, motivo)`: arma la `SolicitudFusion` con la absorbida y las versiones. Manda todos los datos básicos aplicables y todas las claves con candidato.
- `src/index.ts` exporta lo nuevo por ruta explícita.

### Front: `admin-cliente`

```
src/lib/
  pages/       duplicados-lista/, duplicados-comparacion/
  components/  opcion-fusion/          (fila con etiqueta y dos opciones de radio)
  utils/       filtro-url-duplicados.ts
```

Rutas en `ADMIN_CLIENTE_ROUTES`, declaradas antes de `personas/:personaId` para que no las capture:

| Ruta | Página | Guard |
| --- | --- | --- |
| `personas/duplicados` | `DuplicadosListaPage` | `permisoGuard(plat.persona.leer)` |
| `personas/duplicados/:a/:b` | `DuplicadosComparacionPage` | `permisoGuard(plat.persona.leer)` |

**`duplicados-lista`** (pantalla tipo Lista):

- Estado en la URL: `?pagina=&tamano=&persona=` con `filtro-url-duplicados.ts`. Tamaño por defecto 20.
- Con `persona`: chip «Pares de {denominación}» con botón para quitar el filtro. La denominación sale de `PersonasCliente.obtener` sobre ese id. Si la persona no existe, el chip muestra «Persona filtrada».
- `vit-tabla`: Persona A y Persona B (denominación con enlace a su ficha y documento con `formatoDocumento`), Puntaje (`vit-chip-estado` con `TONOS_PUNTAJE`), Motivos (textos de `mensajes-duplicados`, separados por coma).
- Acciones de fila: «Comparar» (ícono `compare_arrows`, enlace a la comparación) y «No son la misma persona» (ícono `person_off`, solo con `plat.persona.fusionar`).
- `ColumnaTabla.movil`: Persona A, Persona B y puntaje, con chevron «Comparar …» (hallazgo del 38: en celular `vit-tabla` no deja abrir por el título).
- Descartar: `exigirMfa()` → `AvisosService.confirmar` («¿No son la misma persona?», «El par no se volverá a proponer»), sin motivo → `descartar` → relee la página.
- Tras descartar, una franja sobre la tabla: «Se descartó el par …» con el botón «Deshacer». Solo para el último descarte. Se va al cambiar de página o al salir. «Deshacer» llama a `quitarDescarte` y relee. El toast de `shared/ui` no admite acción, por eso la franja es de la página.
- Vacío: `vit-estado-vacio` con el texto `vacio`. Cargando: `vit-cargando`.

**`duplicados-comparacion`** (pantalla tipo Detalle con formulario de página, diseñada en el canvas):

- Encabezado: «Comparar fichas», puntaje con chip y motivos. Si `descartado`: chip «Descartado» y «Volver a proponer» (`plat.persona.fusionar`, `exigirMfa`, `quitarDescarte`, relee). Si no está descartado: «No son la misma persona» (mismo flujo que en la lista; tras descartar vuelve a la lista con la franja de deshacer).
- `bloqueo` no nulo: franja de error con el mensaje del código. La elección se muestra en solo lectura y no hay «Fusionar».
- Dos columnas, una por ficha. Cada columna tiene en su cabecera la denominación, el documento, los roles con chips y el radio «Conservar esta ficha». Se preselecciona `conservadaSugerida`. Cambiar la conservada vuelve la elección a `eleccionInicial`.
- Secciones con `vit-opcion-fusion` por fila:
  - Documento: solo lectura, con la nota «Se conserva el de la ficha que queda».
  - Datos básicos: nombres, apellido paterno y apellido materno (NATURAL) o razón social (JURIDICA). Un radio por valor. Si los dos son iguales, un valor y la marca «Igual».
  - Contactos: por tipo, la lista de candidatos de las dos fichas con su origen («Ficha A», «Ficha B», «En las dos») y un radio «Principal». Todos pasan a la que queda, así que el texto aclara que solo se elige el principal.
  - Direcciones: igual que contactos, con `formatoUbigeo`.
  - Roles: solo lectura con la nota «Todos los roles pasan a la ficha que queda».
  - Consentimientos: solo lectura con la nota «Las decisiones de consentimiento quedan en el historial de la ficha que queda, sin cambios» (Ley 29733).
- Sin `plat.persona.fusionar`: comparación en solo lectura, sin radios ni acciones.
- Con el permiso y sin MFA vigente: franja «Fusionar o descartar exige verificación en dos pasos» con «Verificar ahora» (`exigirMfa`, vuelve a esta URL). Radios y «Fusionar» deshabilitados hasta volver con MFA. Así no se pierde una elección ya hecha (criterio del 16a y 17b: verificar antes de llenar).
- Pie con `vit-acciones-formulario`: «Cancelar» (vuelve a la lista) y «Fusionar» (`vit-destructivo`).
- «Fusionar»: `confirmarDestructiva({ titulo: '¿Fusionar las fichas?', texto: 'Quedará solo la ficha de {conservada}. La de {absorbida} pasará a ser un alias y no se puede deshacer.', textoConfirmar: 'Fusionar', pedirMotivo: true, longitudMinimaMotivo: 5, longitudMaximaMotivo: 300 })` → `fusionar(solicitudDe(...))`.
- 201: toast `fusionada` y navega a `/admin/personas/{conservadaId}`.
- 409 `VERSION_OBSOLETA` o 422 `CAMPO_ELEGIDO_INVALIDO`: aviso con su mensaje. Relee la comparación y vuelve a la elección inicial.
- 409 de bloqueo: aviso con su mensaje y relee (la franja de bloqueo queda a la vista).
- 422 `MOTIVO_INVALIDO`: su mensaje (no debería llegar, porque el diálogo ya valida).
- 401 por step-up vencido a mitad de camino: lo maneja el interceptor de errores del 13, sin reintento.
- 404 de cualquiera de las dos: `vit-estado-vacio` «El par no existe o no es de su organización».
- Layout: dos columnas desde `md:`. Bajo `md:` cada fila apila sus dos opciones, con la etiqueta «Ficha A» o «Ficha B» en cada una, y la cabecera de las fichas pasa a dos tarjetas apiladas.

**`personas-lista`**: botón «Revisar duplicados» (ícono `group`) en el encabezado, con `plat.persona.leer`, que lleva a `/admin/personas/duplicados`.

**`persona-detalle`**:

- Lee `personaId` como observable del `paramMap` (hoy usa el `snapshot`), para recargar si cambia el parámetro con el componente reutilizado.
- Si `resueltaDesde` no es nulo: `router.navigate(['/admin/personas', persona.id], { replaceUrl: true })` y toast `info` con `aliasResuelto`.
- 409 `PERSONA_FUSIONADA` en cualquier edición de la ficha: aviso con su mensaje y navega a `personaConservadaId`.
- Sección «Posibles duplicados (N)» después de Datos básicos, solo si N > 0. N sale de `listar({ pagina: 1, tamano: 1, personaId })`. Si la llamada falla, la sección no aparece y no bloquea la ficha. Enlace «Revisar» a `/admin/personas/duplicados?persona={id}`.

### Diseño de referencia

Canvas «Vitrina · Diseño UI» (https://claude.ai/artifact/UGvcmiWUiBsMuWerqMiWxh), página nueva «40 · Duplicados». Se diseña **antes** de escribir código de UI (paso 1 del plan). Artboards:

| Artboard | Qué fija |
| --- | --- |
| `DUP-Lista` (base editable) | Encabezado, tabla de pares, chips de puntaje, motivos, acciones de fila |
| `DUP-Lista-filtrada`, `-deshacer`, `-vacia`, `-oscuro`, `-600`, `-360` | Chip de persona filtrada, franja de deshacer, estado vacío, oscuro, 600 y 360 px |
| `DUP-Comparacion` (base editable) | Encabezado, dos columnas, radio de conservada, filas de datos básicos, contactos, direcciones, roles y consentimientos, pie |
| `DUP-Comparacion-bloqueo`, `-descartado`, `-mfa`, `-confirmar`, `-solo-lectura`, `-oscuro`, `-600`, `-360` | TR-CA-108, par descartado con «Volver a proponer», franja de verificación, diálogo con motivo, sin permiso, oscuro, 600 y 360 px |
| `PER-Ficha-duplicados`, `PER-Lista-duplicados` | Sección «Posibles duplicados (N)» en la ficha y botón «Revisar duplicados» en la lista |

| Pantalla | Pantalla tipo | Cambia en |
| --- | --- | --- |
| Lista de duplicados | Lista | Dos columnas de persona por fila, chip de puntaje, franja de deshacer, chip de filtro por persona |
| Comparación | Detalle (nueva variante) | Dos columnas con radios por fila, apiladas bajo `md:`; pie de formulario en la página |
| Confirmación de fusión | Confirmación | Con motivo (`confirmarDestructiva`) |
| Ficha de persona | Detalle | Una sección más |

Lo que el canvas fije y no esté arriba se anota en Decisiones al implementar.

## Plan de implementación

1. **Diseño en el canvas.** Página «40 · Duplicados» con los artboards de la tabla. El usuario lo revisa. Sin su visto bueno no se escribe código de UI (el paso 2 sí puede avanzar).
2. **Back: filtro `persona`.** Criterio en `ListarDuplicados`, parámetro en `ConsultaDuplicadosTypeOrm`, DTO zod, OpenAPI y enmascarado en el registro HTTP. Integración contra base temporal (PGlite): con `persona`, solo sus pares; persona de otro tenant o absorbida, vacía. E2e: 400 con un valor que no es uuid.
3. **`shared/ui`: máximo del motivo.** `longitudMaximaMotivo` en `confirmarDestructiva` con su prueba. Sin el campo, todo sigue igual.
4. **`personas-ui`: modelos, cliente y utilidades.** `duplicados.ts`, mensajes, tonos, `DuplicadosCliente` (pruebas con `HttpTestingController`), `campos-fusion.ts` (pruebas de `conservadaSugerida`, `eleccionInicial`, `opcionesDatosBasicos`, `opcionesPrincipales` con «En las dos» y `solicitudDe`), `resueltaDesde` y `alias` en `PersonaDetalle`, `personaConservadaId` en `ErrorPersonas`. Exportaciones.
5. **`duplicados-lista`.** Página, `filtro-url-duplicados.ts`, rutas, descartar con deshacer y botón en `personas-lista`. Pruebas de componente: tabla, filtro por persona, descartar, deshacer, vacío, acciones ocultas sin permiso.
6. **`duplicados-comparacion` y `vit-opcion-fusion`.** Página con elección, bloqueo, descartado, franja de MFA, confirmación y fusión con sus errores. Pruebas de componente de cada estado y del cuerpo enviado.
7. **Ficha.** `paramMap` observable, alias resuelto, `PERSONA_FUSIONADA` y sección «Posibles duplicados (N)», con pruebas.
8. **Verificación.** `nx serve` de `plataforma-admin` con la api local contra Supabase dev y los datos de TR-CA-107 y 108 sembrados (sin borrado: las personas de prueba quedan dadas de baja por estado o fusionadas). Recorrido con Playwright de los criterios de UI en claro, oscuro, 600 y 360 px, consola sin errores, axe-core y capturas comparadas con el canvas.
9. **Cierre.** `code-simplifier` sobre los archivos tocados; `npx nx run-many -t lint test -p personas personas-ui shared-ui plataforma-admin-cliente plataforma-admin api`.

## Criterios de aceptación

**Back:**

- [ ] `GET /v1/personas/duplicados?persona={juana-dni}` devuelve solo los pares donde está esa persona, con `total` correcto. Sin `persona`, la lista es la del 39.
- [ ] `persona` de otro tenant, inactiva o absorbida → 200 con `items: []` y `total: 0`. `persona=abc` → 400 `SOLICITUD_INVALIDA`.
- [ ] `persona` llega a la consulta solo como parámetro y no aparece en los logs (TR-RNF-026).
- [ ] La ruta documenta `persona` en OpenAPI bajo `/v1`.

**Front (pruebas unitarias y de componente):**

- [ ] `conservadaSugerida` elige la de DNI frente a la de PASAPORTE en cualquier orden. Con dos DNI o dos pasaportes, elige `a`.
- [ ] `opcionesPrincipales` muestra una sola vez un celular 987654321 que está en las dos fichas, marcado «En las dos». También una dirección con el mismo ubigeo y el texto «Av. Ejército 710» frente a «av ejercito 710».
- [ ] `solicitudDe` manda la conservada, la absorbida, sus versiones, todos los datos básicos aplicables al tipo de persona y el motivo recortado.
- [ ] `confirmarDestructiva` con `longitudMaximaMotivo: 300` rechaza 301 caracteres con su mensaje. Sin el campo, acepta textos largos como antes.

**UI (Playwright en `admin-cliente` de `plataforma-admin`, api local contra Supabase dev):**

- [ ] «Revisar duplicados» en la lista de personas abre `/admin/personas/duplicados`.
- [ ] TR-CA-107 (adaptado): el par «Quispe Mamani, Juana» (DNI 45781236) — «Quispe, Juana» (PASAPORTE) aparece con puntaje 60 y «Mismo celular, nombre parecido».
- [ ] TR-CA-107: en la comparación, la ficha del DNI viene preseleccionada como conservada. El celular 987654321 sale una vez, marcado «En las dos».
- [ ] TR-CA-107: se elige el apellido materno «Mamani» de la ficha del DNI y se confirma con el motivo «Misma clienta registrada con pasaporte». Se abre la ficha de la conservada con el toast «Fichas fusionadas», los roles y contactos de las dos, y sin la sección de duplicados.
- [ ] TR-CA-107: abrir la URL de la ficha absorbida cambia la URL a la de la conservada y muestra «Esta ficha se fusionó en Quispe Mamani, Juana…». La lista de personas ya no muestra la absorbida.
- [ ] TR-CA-108: la comparación de DNI 45781236 con DNI 45781237 (abierta por URL) muestra la franja «Las personas tienen documentos distintos», sin «Fusionar» y con la elección en solo lectura.
- [ ] Un motivo de 4 caracteres en el diálogo muestra el aviso de mínimo y no llama a la API. Uno de 301 no se puede escribir o muestra el aviso de máximo.
- [ ] Con la ficha absorbida editada en otra pestaña antes de confirmar, la fusión muestra «Una de las fichas cambió; se recargó la comparación» y la elección vuelve a la inicial.
- [ ] «No son la misma persona» en una fila saca el par de la lista y muestra la franja con «Deshacer». «Deshacer» lo devuelve a la lista.
- [ ] La comparación de un par descartado (por URL) muestra el chip «Descartado». «Volver a proponer» lo devuelve a la lista.
- [ ] Desde la ficha de una persona con un par, «Posibles duplicados (1)» → «Revisar» abre la lista filtrada con el chip «Pares de …». Quitar el chip muestra todos. El filtro y la página sobreviven a recargar.
- [ ] Con `plat.persona.fusionar` y sin MFA vigente, la comparación muestra la franja de verificación con los radios y «Fusionar» deshabilitados. Tras verificar, vuelve a la misma comparación habilitada. Descartar desde la fila sin MFA lleva a verificar antes de confirmar.
- [ ] Sin `plat.persona.fusionar` no se ven «No son la misma persona», «Volver a proponer», los radios ni «Fusionar». La lista y la comparación sí se ven. Sin `plat.persona.leer`, las rutas de duplicados redirigen como el resto de `admin-cliente`.
- [ ] Editar una ficha absorbida con una pestaña abierta desde antes de la fusión muestra el aviso de `PERSONA_FUSIONADA` y abre la conservada.
- [ ] Tema claro y oscuro solo con tokens en la lista, la comparación, la franja de deshacer y el diálogo, con capturas de los dos.
- [ ] A 600 y 360 px la lista usa la vista de celular con chevron, la comparación apila las opciones con su etiqueta de ficha y no hay scroll horizontal.
- [ ] Las capturas coinciden con los artboards de «40 · Duplicados» (textos, íconos, tonos y ubicación de acciones). Una diferencia se corrige en el código o en el canvas antes de cerrar.
- [ ] axe-core sin `critical` ni `serious` en la lista y la comparación. Los radios de cada fila forman un grupo con nombre accesible (la etiqueta del campo).
- [ ] Consola del navegador sin errores en todo el recorrido.

**General:**

- [ ] El código nuevo sigue «Código limpio», «Estructura de libs Angular» y «Diseño UI» de `CLAUDE.md`: un artefacto por archivo, `templateUrl` y `styleUrl`, `.css` solo con estilos propios, `index.ts` con exportaciones explícitas.
- [ ] `personas-ui` solo importa de `shared/*`. `admin-cliente` importa `personas-ui` por su `index.ts`. `personas` no suma dependencias.
- [ ] `npx nx run-many -t lint test -p personas personas-ui shared-ui plataforma-admin-cliente plataforma-admin api` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** comparación en una página a dos columnas con radios por fila y confirmación con `confirmarDestructiva`. Decisión del usuario. Elegir campos sin ver las dos fichas al lado lleva a errores. Es un formulario de página, como `empresa-formulario`, no un diálogo, así que la regla del panel lateral no aplica.
- **No:** comparación de solo lectura con la elección en el panel lateral de 480 px. Decisión del usuario.
- **Sí:** quitar un descarte con «Deshacer» justo después y con «Volver a proponer» en la comparación. Decisión del usuario. No hace falta back nuevo.
- **No:** pestaña «Descartados» con su `GET`. Decisión del usuario. Un descarte antiguo solo se alcanza por la URL del par.
- **Sí:** franja de deshacer en la página, no un toast con acción. `AvisosService.toast` no admite botones y agregarlos toca `shared/ui` para un solo uso.
- **Sí:** entrada por el botón «Revisar duplicados» de la lista de personas, sin opción de menú ni cambio de manifiesto. Decisión del usuario.
- **Sí:** sección «Posibles duplicados (N)» en la ficha con el filtro `persona` en el back. Decisión del usuario. Es el único cambio de back del spec.
- **Sí:** `persona` de otro tenant o absorbida devuelve una lista vacía, no 404. La lista no debe confirmar qué ids existen, y la RLS ya lo filtra.
- **Sí:** la ficha resuelve el alias: cambia la URL a la conservada y avisa. Decisión del usuario. Usa `resuelta_desde` del 39.
- **Sí:** se preselecciona como conservada la ficha con DNI o RUC; si empatan, la de id menor. Decisión del usuario. El documento de la conservada no cambia en el back, y un DNI vale más que un pasaporte.
- **Sí:** cambiar la conservada vuelve la elección a la inicial. Los orígenes son relativos a la conservada y mantenerlos confundiría.
- **Sí:** cliente, modelos y utilidades en `personas-ui`; páginas y `vit-opcion-fusion` en `admin-cliente`. Decisión del usuario. Reutiliza `denominacionDe` y los `formato*`. La comparación es solo de admin y no se exporta.
- **Sí:** descartar desde la fila y desde la comparación, con confirmación simple sin motivo. Decisión del usuario. El back no pide motivo para descartar y se puede deshacer.
- **Sí:** aal2 con `AccionSensibleService.exigirMfa` antes de descartar o quitar un descarte. En la comparación, una franja exige verificar antes de elegir, para no perder la elección al ir a `/auth/mfa`.
- **Sí:** `longitudMaximaMotivo` en `confirmarDestructiva`. TR-RF-042 pide de 5 a 300 y el diálogo solo validaba el mínimo. Es opcional y no cambia los usos actuales.
- **Sí:** la comparación de contactos y direcciones del front usa el criterio del back (`esMismoContacto`, `esMismoLugar`) solo para mostrar. El back resuelve el principal con `equivalenteDe`, así que una diferencia no rompe la fusión.
- **Sí:** la solicitud manda todos los datos básicos y principales explícitos, no solo los de la absorbida. `campos_elegidos` queda completo en `per.fusion` y en la auditoría.
- **Sí:** `persona-detalle` pasa a leer el `paramMap` observable. Sin eso, la navegación de alias a conservada reutiliza el componente con el id viejo.
- **Sí:** un spec de 8-8,5 h, sobre las 6 h del roadmap, por el filtro de back y la sección en la ficha. Decisión del usuario. Orden de recorte fijado en «Por qué existe este spec».
- **Sí (en el diseño):** el canvas fijó, con visto bueno del usuario, que en celular la fila de la lista solo abre la comparación (se descarta desde la comparación), la línea «Quedará como: …» en Datos básicos, el chip «Queda» / «Pasa a ser alias» en cada ficha, contactos y direcciones en una sección y roles y consentimientos en otra, el pie fijo con «Fusionar» y el botón «No son la misma» en la confirmación de descarte.
- **No (en la implementación):** enmascarar `persona` en el registro HTTP. `logger.pino.ts` registra solo la ruta (`url.split('?')[0]`): la query nunca llega al log.
- **Sí (en la implementación):** el descarte hecho en la comparación viaja a la lista en el `state` de la navegación (`history.state`), no en la URL: recargar la lista no vuelve a mostrar la franja.
- **Sí (en la implementación):** «Fusionar» vuelve a pedir `exigirMfa` aunque la franja de MFA ya lo resolvió, por si vence mientras se elige.
- **Sí (en la implementación):** el 409 `PERSONA_FUSIONADA` en la ficha entra en `CODIGOS_PERSONA_CAMBIADA`: la sección pide releer, la API devuelve la conservada con `resueltaDesde` y la página navega con el aviso del alias. No hace falta que cada panel lea `personaConservadaId`; ese campo de `ErrorPersonas` queda para otros consumidores.
- **Sí (en la implementación):** `eleccionInicial` propone principal también para FIJO y WHATSAPP cuando alguna ficha los tiene (el canvas solo dibujó celular, correo y dirección).
- **Hallazgo (verificación en dev, 2026-11-25):** `vit-destructivo` solo pinta botones de texto y con borde; «Fusionar» pasó de `mat-flat-button` a `mat-stroked-button` con `vit-destructivo` (como `tenant-detalle`). Diferencia con el canvas, que lo dibuja relleno.
- **Nota (verificación en dev):** a 360 px el pie fijo ocupa unos 150 px; cuando las dos fichas tienen la misma denominación, la franja y el diálogo de descarte repiten el nombre sin el documento. Quedan como mejora posible, no corregidas.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La sección de duplicados suma una consulta pesada (autounión del 39) a cada apertura de la ficha | `tamano=1` y el filtro por persona reducen la autounión a sus pares. Si la ficha pasa de TR-RNF-001 en la medición, la sección se carga después de la ficha y no la bloquea. |
| El front marca «En las dos» distinto del back | Solo afecta la presentación; el back resuelve el principal con `equivalenteDe`. Prueba con tilde y mayúsculas en la dirección. |
| Se va a `/auth/mfa` con la elección a medias | La franja deshabilita la elección hasta verificar. |
| Datos de prueba en dev sin borrado | Las personas de TR-CA-107 y 108 quedan fusionadas o dadas de baja. Se avisa al pedir autorización para sembrarlas. |
| La versión de la ficha cambia entre comparar y confirmar | El back responde 409 `VERSION_OBSOLETA` y la página relee y reinicia la elección. |
| El spec se pasa de 10 h | Orden de recorte fijado; lo recortado pasa a un 40b. |

## Lo que **no** entra en este spec

- Lista de pares descartados, opción de menú y cambios al manifiesto.
- Historial de fusiones, deshacer una fusión, fusionar más de dos fichas.
- Elegir el documento, mover consentimientos o elegir contactos y direcciones uno por uno.
- Toast con acción en `shared/ui`.
- Reasignación en SazónPOS (CC-06) y consumidores de `persona.fusionada` en productos.

Cada uno, si llega, va en su propio spec.
