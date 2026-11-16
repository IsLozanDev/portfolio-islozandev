# Contexto para not-plantillas-ui

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md` (estructura de libs Angular, diseño UI, verificación con Playwright), `plan.md` §6.1, `3_plan.json`, `srs_docs.txt` (RF-074, GWT 184-186), specs 15, 15b-d, 19e y 20c, `not-correo-plantillas-estados.md`.

## 1. Alcance y dependencias
- Historia R2-11 (sprint 16, 5 h, Front, R2, componente «Admin cliente»): «Emisor electrónico, series de FE y plantillas». RF 052, 074. Este paquete cubre solo la parte de plantillas (RF-074); emisor y series FE van con el paquete FE.
- Plan §6.1, R2: `plataforma-admin / admin-cliente` suma «plantillas de notificación».
- Depende de: `not-plantillas-personalizacion` (API de plantillas, parte b del paquete de correo), 15/15b/15c/15d (shell, identidad, tema oscuro, menú), 17c (admin-cliente), 19e (patrón de pantallas de propios del tenant).
- Horas: 4-5 h (la parte de plantillas de las 5 h de R2-11). Un solo spec, tres áreas: lista, editor en panel lateral con vista previa, manifiesto y menú.
- Pantalla tipo del canvas «Vitrina · Diseño UI»: **lista** (plantillas por código y canal) + **formulario** en panel lateral (editor). Cambia en: vista previa al lado del editor (en el panel, debajo a 600 px) y contador de caracteres o segmentos por canal.
- Fuera de alcance: plantillas WhatsApp ante Meta (R3-11), edición de plantillas base desde consola de plataforma (ver P2), editor WYSIWYG de HTML.
- Constitución y CLAUDE.md: estructura de libs Angular (pages, components, services, models), colores solo por tokens, `vit-tabla`, `vit-chip-estado`, `vit-filtros`, `PanelLateralService`, `AvisosService`; verificación con MCP Playwright en tema claro y oscuro y a 600 px.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-074 | Gestionar plantillas de notificación | plat.notificacion.plantilla | APP-02 | TR-RN-026 | TR-RNF-027, 020 | Admin plataforma, admin cliente |

- **074** (UI): elegir plantilla y canal; editar asunto y cuerpo con variables `{{nombre}}`, `{{fecha}}`, `{{sucursal}}`; validar solo variables declaradas y el límite del canal (SMS 160); vista previa con datos de ejemplo; guardar versión. Personaliza la base de plataforma sin perderla (restaurar a la base).
- Datos de pantalla: codigo, canal, idioma, asunto (0-150), cuerpo, variables declaradas (solo lectura, con tipo y ejemplo), versión, origen (BASE | PERSONALIZADA).

## 3. Criterios GWT
- **TR-CA-184** (Positivo): personalizar CITA_RECORDATORIO con la dirección de la sucursal; la versión personalizada se usa en los próximos envíos.
- **TR-CA-185** (Negativo): `{{diagnostico}}` rechazada con «Variable no permitida: diagnostico» (mensaje en el campo, no solo en un aviso).
- **TR-CA-186** (Borde): SMS de 175 caracteres: aviso de 2 segmentos y costo estimado. En R2 solo hay CORREO: queda latente hasta tener SMS (ver P3).
- Faltan y se proponen (UI): restaurar la base pide confirmación con `AvisosService`; la vista previa no envía nada; sin permiso no aparece la opción de menú; verificación en claro/oscuro y a 600 px; consola sin errores (Playwright).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-026 | WhatsApp fuera de 24 h solo con plantillas aprobadas: el editor de canal WHATSAPP (R3) muestra el estado de aprobación. |
| TR-RNF-027 | Plantillas por tenant sin cambios de código. |
| TR-RNF-020 | Usuario operativo aprende en < 1 h: ayudas de variables a mano (insertar con un clic). |
| TR-RNF-021 | Confirmación explícita al restaurar la base (acción que descarta lo personalizado). |
| TR-RNF-012 | El HTML del cuerpo se sanea en el servidor; la vista previa se renderiza en un `iframe` con `sandbox` o como texto. |

Heredados: 001/002 (lista paginada), 019 (no es portal público, AA deseable), 024/119, 101.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R2-11 | 16 | 5 | Admin cliente | Emisor electrónico, series de FE y plantillas | TR-RF-052, 074 | Front | R2 |

Relacionadas: R2-09 (back de plantillas y envío, S15), R2-04 (emisor FE, back, S14). Sprint 16: 2027-05-31 a 2027-06-13.

## 6. Tablas SQL, eventos, puertos y permisos
- Sin tablas propias: consume la API de `not-plantillas-personalizacion`. Contrato propuesto (a fijar en ese spec):
  - `GET /v1/notificaciones/plantillas?canal=&q=` (lista: código, canal, idioma, origen, versión, actualizado_en).
  - `GET /v1/notificaciones/plantillas/{codigo}/{canal}` (detalle con variables declaradas y cuerpo base).
  - `PUT /v1/notificaciones/plantillas/{codigo}/{canal}` (guarda nueva versión; 409 por `version`, bloqueo optimista).
  - `POST /v1/notificaciones/plantillas/{codigo}/{canal}/vista-previa` (render con datos de ejemplo; no envía).
  - `DELETE .../personalizacion` (restaura la base).
- **Permisos y menú**: permiso de gestión (código a decidir, ver P1 del paquete de correo) y opción de menú «Plantillas» en el módulo «Configuración» de PLAT (hoy existen `plat.configuracion.parametros`, `.series`, `.catalogos`, `.feriados`). Sube la versión del manifiesto (hoy `1.15.0`).
- **Front**: `libs/plataforma/admin-cliente/src/lib/pages/plantillas-lista/`, `components/plantilla-editor/` (o página de panel), `services/plantillas.cliente.ts`, `models/plantilla.ts`; ruta en `admin-cliente.routes.ts`.

## 7. Código base relacionado
- `libs/plataforma/admin-cliente`: ya tiene páginas `catalogos-lista`, `item-propio-formulario`, `auditoria-lista`, `bitacora-lista`; la más parecida es `catalogos-lista` + `item-propio-formulario` (spec 19e: lista de propios con formulario en panel lateral).
- `libs/shared/ui`: `tabla`, `chip-estado`, `filtros`, `estado-vacio`, `cargando`, `acciones-formulario`, `panel-lateral`; servicios `PanelLateralService`, `AvisosService`, `TemaService`.
- Tokens: `libs/shared/ui/src/estilos/tema.css` y `material.scss` (sin hex sueltos).
- Verificación: memoria «Verificación UI con Playwright» (sesión falsa con firma JWT válida, scripts en `.playwright-mcp`).
- No existe: cliente de plantillas ni API de plantillas.

## 8. Diagramas relevantes
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-07_Modelo_de_dominio_Notificaciones_archivos_auditoria_y_eventos.mmd` (Plantilla).
- Canvas «Vitrina · Diseño UI» (https://claude.ai/artifact/UGvcmiWUiBsMuWerqMiWxh): pantallas tipo lista y formulario.

## 9. Ambigüedades y preguntas candidatas
1. ¿Este spec junto con emisor y series FE (R2-11 completo)? Recomendación: separar; FE tiene su propia API y su ritmo (homologación). Plantillas sale cuando sale su back.
2. ¿Quién edita la plantilla base de plataforma (actor «admin de plataforma» del RF)? Recomendación: en R2 las bases se siembran por código y migración; edición en `plataforma-consola` solo si hace falta (sin historia).
3. Canales visibles en R2: solo CORREO. Recomendación: el editor muestra el canal como chip y prepara el contador por canal; CA-186 se cubre cuando exista SMS.
4. ¿Editor HTML o texto con formato limitado? Recomendación: texto con Markdown limitado convertido a HTML en el servidor con un layout fijo de la marca del tenant; evita XSS y correos rotos.
5. ¿Vista previa con datos del tenant (sucursal real) o de ejemplo declarados? Recomendación: ejemplos declarados en la variable (`ejemplo`), más nombre de la sucursal activa si existe.
6. ¿Pantalla nueva en el canvas? El editor con vista previa lado a lado no está entre las pantallas tipo: según CLAUDE.md, diseñarlo primero en el canvas si el formulario en panel no basta.
