# Contexto para el spec 15 · shell-y-ui

Paquete de contexto (no es el spec). Fuentes: `docs/roadmap-specs.md`, `docs/spec-context/13-auth-cliente-angular.md` y `06-seg-autorizacion.md`, SRS xlsx (hojas Aplicaciones, Reglas de negocio, RF, Criterios GWT, RNF), `3_plan.json`, `2_Estructura/estructura_frontend.txt`, `1_Mermaid/PL-xx`, `codigo/`. Ruta base del código: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.

## 1. Alcance y límite con el spec 13

- Roadmap: spec 15 `shell-y-ui`, cubre **U-01** (shared/ui) y **U-02** (shared/shell), RF 015 y 016 en UI; 8 h; depende del **13**. Lo consumen 16, 17 y 26 (SazónPOS shell, C-07).
- Sprint 4 del plan ("Frontend de seguridad: diseño, shell y usuarios"): U-01 3 h + U-02 5 h = 8 h; el sprint tiene capacidad 14 h y también aloja U-03.
- **Límite con el 13** (auth-cliente-angular, A-04). El 13 es dueño de `libs/shared/auth` completa: `SesionService`, `SupabaseCliente`, interceptor, `autenticadoGuard`, `permisoGuard` y **`*siPermiso`**. El 15 las consume, no las reimplementa. Pasa a ser del 15: libs `shared/ui` y `shared/shell`.
- Duplicidad documentada: el plan lista `*siPermiso` en la historia U-02 (shell), pero el código base y `estructura_frontend.txt` lo ubican en `shared/auth`. Recomendación (ya adoptada en 05, P4): vive en `shared/auth`; U-02 lo usa en el menú y la verificación es "se usa en el shell", no "se crea".
- Piezas de interfaz que el 13 deja al 15: la ruta `/seleccionar-sucursal` (el guard del 13 redirige a ella), el caso GWT 046 (cero sucursales: el 13 hoy redirige al selector) y el selector de tenant (el 13 solo trae `cambiarTenant`).
- Límite con el 14 (auth-ui): las páginas `/auth/*` son del 14; el 14 usa `shared/ui` si ya existe, así que 14 y 15 comparten dependencia sobre U-01. El roadmap pone 14 en la Ola 5 y 15 en la Ola 6, ambos tras el 13: si el 14 va antes, usa Material directo (05, P1).
- Fuera de alcance: pantallas de admin (U-03, U-04, U-05 = specs 16 y 17), app plataforma-admin (U-06), shell de SazónPOS (C-07 = spec 26), shell del portal del cliente final (APP-05 menciona `portal-shell`, es R3), `soporte-widget`, `shared/util` (formatos es-PE, validadores DNI/RUC; no tiene historia en el backlog).
- Límites Nx (`estructura_frontend.txt` + `eslint.boundaries.snippet.js`): `shared/ui` es `type:ui` y solo depende de `type:ui` y `type:util`; `shared/shell` es `type:feature` y puede usar feature, ui, data-access y util; `scope:shared` no importa fuera de shared.

## 2. Requisitos funcionales (UI)

Aplicación SRS: **APP-05** "Librerías Angular compartidas y shell del portal" (SRS dice: ui-diseno, shell-backoffice, seguridad-cliente, portal-shell, soporte-widget; el plan usa otros nombres: `shared/ui`, `shared/shell`, `shared/auth`, `shared/auth-ui`). Descripción SRS: "Sistema de diseño, shell de backoffice (selector de sucursal, menú por permisos, notificaciones)...".

| ID | Nombre | Permiso | Prioridad | Fase | Dueño UI |
|---|---|---|---|---|---|
| TR-RF-015 | Calcular permisos efectivos y menú | plat.permiso.consultar | Must | MVP | Backend en APP-03 (S-02, spec 07); el shell solo **consume y pinta** el menú |
| TR-RF-016 | Seleccionar empresa y sucursal de trabajo | plat.sesion.contexto | Must | MVP | APP-05; U-02 |

**TR-RF-015** (Calcular permisos efectivos y menú). Respuesta: `permisos[]` (códigos) y `menu[]` (opciones con ruta e icono). Salida: 200 con permisos y menú, o 403 con código de permiso faltante. Reglas TR-RN-006, TR-RN-007. RNF 101, 010, 001. Historia: backend S-02 (5 h); en UI la cubre U-02 ("menú dinámico").

**TR-RF-016** (Seleccionar empresa y sucursal). Precondición: autenticado con al menos una membresía ACTIVA. Flujo: 1 el shell obtiene sucursales con `seg.sucursales_accesibles`; 2 una sola opción: se selecciona sola; 3 varias: selector con la última usada preseleccionada; 4 al confirmar fija contexto y carga el menú. Datos: tenant_id, empresa_id, sucursal_id; ultima_seleccion (por usuario). El SRS dice "selector de tenant, empresa y sucursal ... recordar la última selección y permitir cambiarla sin cerrar sesión". Regla TR-RN-007. RNF 101, 018, 020. Backend del contexto: S-03.

## 3. Criterios GWT (tal cual)

**TR-CA-044** · TR-RF-016 · Usuario con una sola sucursal · Positivo
DADO QUE Rosa solo tiene acceso a la sucursal «Miraflores» · CUANDO inicia sesión · ENTONCES ingresa directamente a «Miraflores» sin ver el selector

**TR-CA-045** · TR-RF-016 · Cambio de sucursal en sesión · Positivo
DADO QUE Carmen tiene acceso a «Miraflores» y «Surco» · CUANDO cambia a «Surco» desde el encabezado · ENTONCES el menú y los datos se recargan con el contexto de «Surco» sin pedir nueva autenticación

**TR-CA-046** · TR-RF-016 · Sin sucursales accesibles · Negativo
DADO QUE todas las asignaciones de Jorge vencieron · CUANDO inicia sesión · ENTONCES el shell muestra «No tiene accesos vigentes; contacte a su administrador»

No existe ningún GWT para TR-RF-015 ni para el sistema de diseño (U-01), el layout, la página 403/404 ni la persistencia de la última sucursal (el RF la pide, ningún GWT la prueba): habrá que proponerlos. Los GWT 047 y 048 (MFA, RF-017) no son de este spec; el aviso de step-up lo maneja el 13.

## 4. Reglas TR-RN y RNF

- **TR-RN-007**: permisos `producto.recurso.accion` evaluados por alcance TENANT/EMPRESA/SUCURSAL/UNIDAD; los PLAT no dependen de suscripción (el menú de la consola de plataforma no depende de suscripción).
- **TR-RN-009**: permisos sensibles exigen MFA reciente (15 min). Efecto UI: ocultar con `*siPermiso` no sustituye a la API ("solo oculta; la API decide").
- RNF que aplican:
  - **TR-RNF-018** Operabilidad: responsiva escritorio/tableta/móvil (>= 360 px), español de Perú; verificación "pruebas en 3 tamaños de pantalla" (pruebas visuales automatizadas). Es el RNF más cargado para este spec.
  - **TR-RNF-019** Accesibilidad: WCAG 2.1 AA (axe-core en CI + revisión manual), el SRS lo exige a "portales públicos"; para backoffice no es obligatorio, pero Material lo facilita (decisión P5).
  - **TR-RNF-020** Aprendizaje: tareas principales con < 1 h de capacitación (prueba con usuarios, fuera de CI).
  - **TR-RNF-021** Protección contra errores: confirmación explícita y motivo obligatorio en acciones destructivas; encaja con el "diálogo de confirmación" de `shared/ui`.
  - **TR-RNF-023** Coexistencia: dos últimas versiones de Chrome, Edge, Firefox, Safari y Android gama media (e2e multinavegador; el e2e vive en el 27).
  - **TR-RNF-101** (caché de permisos, p95 < 20 ms): backend; el shell debe recargar contexto tras cambiar sucursal sin tormenta de peticiones.
  - **TR-RNF-014**: expiración por inactividad 30 min en backoffice; sin implementación en el cliente (heredado de 05; podría ser un aviso del shell, ver P8).
  - **TR-RNF-010**: aislamiento por tenant; el shell nunca debe pintar datos de otro tenant al cambiar de contexto (limpiar estado al cambiar).

## 5. Historias del backlog (3_plan.json)

| ID | Sprint | Horas | Tipo | RF | Release | Descripción |
|---|---|---|---|---|---|---|
| **U-01** | 4 | 3 | Front | — | R1 | shared/ui: sistema de diseño base (Angular Material + tokens por tenant) |
| **U-02** | 4 | 5 | Front | TR-RF-015, 016 | R1 | shared/shell: layout, menú dinámico, selector de empresa y sucursal, *siPermiso |

Total 8 h, igual a la estimación del roadmap. Las 3 h de U-01 incluyen tokens, tema y componentes; riesgo de no cubrir pruebas ni accesibilidad. Dependen de A-04 (spec 13) y de que exista el endpoint de contexto (S-02/S-03, spec 07). Historias relacionadas fuera de alcance: U-03 (6 h), U-04 (4 h), U-05 (4 h), U-06 (2 h), C-07 (7 h; shell de SazónPOS).

Riesgo del plan (3_plan.json): "Angular 19 ya no tiene soporte (EOL mayo 2026)"; mitigación "arrancar el monorepo en Angular 22 y NestJS 12". El proyecto va en 21 (roadmap spec 13: "Compilar con Angular 21").

## 6. Estructura de libs frontend (estructura_frontend.txt)

Stack declarado: Angular 22, standalone, signals, **zoneless**, Angular Material.

```
libs/shared/                     scope:shared
  auth/       type:data-access   (spec 13)
  auth-ui/    type:feature       (spec 14)
  shell/      type:feature       layout · menú dinámico desde la API · selector de empresa/sucursal
                                 · selector de tenant · avisos · página 403/404
  ui/         type:ui            tokens de diseño (marca por tenant) · tabla, formulario, filtros,
                                 diálogo de confirmación, estado vacío, carga
  util/       type:util          formatos es-PE · validadores DNI/RUC · zona America/Lima (fuera de alcance)
apps/plataforma-consola          SPA consola (/auth/* · /tenants · /catalogos · /eventos · /salud, lazy, MFA obligatoria)
apps/plataforma-admin            monta libs/plataforma/admin-cliente
libs/plataforma/admin-cliente    type:feature (specs 16/17)
```

Reglas: `type:app` -> feature, ui, data-access, util; `type:feature` -> feature, ui, data-access, util; `type:ui` -> ui, util. Las apps no existen aún como código; el spec 01 debe dejar las libs en stub registradas con sus tags.

Alcance sugerido por lib para 8 h:
- `shared/ui` (U-01): tokens (colores, tipografía, espaciado, radio) como CSS variables + tema Material 3; componentes mínimos que U-02 necesita (estado de carga, estado vacío, diálogo de confirmación); tabla/formulario/filtros solo si caben, o diferir a 16.
- `shared/shell` (U-02): layout (barra superior, menú lateral responsivo, contenedor), menú desde `ContextoUsuario.menu`, selector de empresa/sucursal, página `/seleccionar-sucursal`, estado "sin accesos" (GWT 046), 403/404, avisos (snackbar). Selector de tenant y notificaciones persistentes: ver P6.

## 7. Código base relacionado

Existe código solo en `codigo/libs/shared/auth/src/` (6 archivos + `index.ts`; sin `package.json`, `project.json`, tests ni README). **No existe ningún código de `shared/ui` ni `shared/shell`**: ni layout, ni menú, ni selector, ni tema, ni componentes (grep: ninguno). Lo que hay es el contrato que el shell consume:

| Archivo | Qué ofrece al shell | Hallazgo |
|---|---|---|
| `lib/sesion.service.ts` | signals `sesion`, `contexto: ContextoUsuario`, `sucursalId`, `autenticado`, `permisos` (Set); `tiene()`, `cargarContexto()`, `seleccionarSucursal(id)`, `cambiarTenant`, `salir()` | `ContextoUsuario = { tenantId, sucursales:{id,nombre,empresa}[], permisos:string[], menu:{codigo,nombre,ruta}[] }`. **El menú es plano: sin `icono`, sin `padre_id`, sin módulo, sin `orden`**, y el SRS (RF-015) exige "ruta e icono". `sucursalId` solo en memoria (RF-016 pide recordar la última); `cargarContexto` autoselecciona solo si hay una sucursal |
| `lib/guards.ts` | `autenticadoGuard` redirige a `/seleccionar-sucursal` si no hay `sucursalId`; `permisoGuard(codigo)` (CanMatchFn) | Con 0 sucursales también va al selector: el shell debe distinguir "sin accesos" (GWT 046); `permisoGuard` devuelve false sin ir a 403 |
| `lib/si-permiso.directive.ts` | `*siPermiso="'codigo'"` con `input.required`, `effect` | Una sola cadena, sin OR |
| `lib/auth.interceptor.ts` | Bearer + `X-Sucursal-Id` hacia `apiUrl` | El cambio de sucursal solo requiere `sucursalId.set` |

Backend relacionado (SQL en `codigo/db/01b_seg.sql`):
- `seg.modulo` (producto_codigo, codigo, nombre, orden) y `seg.opcion` (modulo_id, **padre_id**, codigo, nombre, ruta, **icono**, orden) y `seg.opcion_permiso`: el modelo soporta módulos, jerarquía e icono.
- `seg.menu_usuario(usuario, tenant, sucursal)` devuelve solo `(opcion_codigo, nombre, ruta, orden)`: **descarta modulo, padre e icono**, y excluye opciones sin permisos requeridos (`EXISTS opcion_permiso`) y las que tengan algún permiso faltante (todos requeridos, no cualquiera).
- `seg.sucursales_accesibles(usuario, tenant)` devuelve `(sucursal_id, sucursal, empresa)`; no devuelve `empresa_id`, aunque RF-016 lista empresa_id en los datos.
- `GET /seg/mi-contexto` y `PUT /seg/mi-tenant` no existen en el backend (confirmado en 05); el spec 07 (S-02/S-03) los definiría. Cabecera `X-Sucursal-Id` la exige `PermisoGuard`.
- No hay tabla de "última selección" ni de marca/tema por tenant (verificado en 06 para la primera; no encontré ninguna columna de logo o colores en lo leído de `01b_seg.sql`; `01a_org.sql` no lo revisé para branding).

## 8. Cómo se compone el menú desde el manifiesto de permisos

Cadena completa, de producto a pantalla:
1. Cada producto trae un **manifiesto versionado** (RF-008, spec 06): `modulos[]`, `opciones[]` (codigo, ruta, icono, permisos requeridos), `permisos[]` (codigo, alcance_minimo, sensible), roles predefinidos. Se aplica en el despliegue (idempotente) y llena `seg.modulo`, `seg.opcion`, `seg.opcion_permiso`, `seg.permiso`.
2. En ejecución, `seg.menu_usuario` cruza las opciones con `seg.permisos_efectivos` del usuario para el tenant y la sucursal; el resultado va en caché Redis (RNF-101) y se devuelve en `GET /v1/seg/mi-contexto` junto con `permisos[]` y `sucursales`.
3. `SesionService.contexto` guarda la respuesta; el shell **solo pinta** `contexto().menu`. El shell no recalcula permisos; el cliente no decide autorización (la API valida siempre).
4. Cuando cambia la sucursal, `seleccionarSucursal` recarga el contexto y el menú se reemplaza (GWT 045).

Huecos para el spec: (a) el menú debe llegar con árbol (módulo -> opción -> hijos) e icono; hoy la función SQL y `ContextoUsuario` lo aplanan (decisión P4, con el spec 07 como dueño del endpoint); (b) la semántica "todos los permisos requeridos" vs "alguno" de `opcion_permiso`; (c) rutas del menú que el manifiesto declara pero la app no tiene registradas: el shell debe tolerarlas (ocultar o 404), no romper.

## 9. Diagramas

- **PL-03** Autenticación con Supabase Auth y autorización propia (frontends -> Supabase Auth -> hook -> JWT; Bearer + X-Sucursal-Id a los guards). Rotulado "Frontends Angular 22".
- **PL-04** Secuencia de ingreso con MFA: termina en `GET /v1/seg/mi-contexto`, "selector de sucursal (si más de una) y menú": es el flujo exacto que implementa el shell (U-02).
- **PL-05** Solicitud autorizada en la API (cabecera `X-Sucursal-Id` y chequeo de permisos).
- **PL-08** Integración de SazónPOS (frontend Angular `pos.dominio.pe`): el shell se reutiliza en C-07 (spec 26) y en la sesión compartida por cookie de dominio.
- **PL-10** Dependencias entre componentes transversales (no hay nodo para UI; el shell cuelga de TR-SEG).
- Ningún diagrama dibuja `shared/ui` ni el diseño por tenant.

## 10. Ambigüedades

1. Versión: SRS dice Angular 19; plan, estructura y código dicen 22; roadmap y proyecto, 21. Material tiene que ser la versión que acompañe a Angular 21.
2. U-01 dice "tokens por tenant" y `estructura_frontend.txt` "marca por tenant", pero ningún RF, GWT ni tabla soporta marca por tenant (logo, colores). No hay origen del dato.
3. RF-015 pide icono y el menú actual no lo lleva (sección 7).
4. RF-016 pide "selector de tenant, empresa y sucursal" y "recordar la última selección"; el cliente base solo recuerda en memoria y `cambiarTenant` llama a un endpoint inexistente.
5. `*siPermiso` aparece en U-02 y en `shared/auth` (resuelto arriba).
6. "Avisos" / "notificaciones" en el shell (APP-05, estructura): TR-NOT es R2; no está claro si basta un snackbar local.
7. i18n: RNF-018 pide español de Perú; ningún documento pide multi-idioma. `shared/util` (formatos es-PE) no tiene historia.
8. Accesibilidad: RNF-019 solo exige AA en portales públicos; el backoffice no tiene criterio medible.
9. El SRS nombra las libs distinto al plan (`ui-diseno`, `shell-backoffice`, `seguridad-cliente`): se sigue el plan.

## 11. Preguntas candidatas para la Fase 2 de /spec

- **P1. ¿Versión y base: Angular 21 con Material 21?** Plan y código dicen 22. (Angular 21 + Angular Material de la misma versión mayor, standalone y signals; criterio de aceptación: las dos libs compilan con Angular 21. Verificar con ctx7 la API de tema Material 3 de esa versión antes de escribir el spec; no la pude confirmar aquí.)
- **P2. ¿Zoneless?** (Sí, `provideZonelessChangeDetection()` en las apps, ya es el estándar declarado; shell y ui solo con signals, `OnPush` y sin `NgZone`. Las pruebas usan TestBed zoneless. El cliente Supabase actualiza signals desde promesas, lo que ya funciona sin zona, según 05.)
- **P3. ¿Tema y tokens por tenant?** (Fase 1: tema Material 3 único con tokens CSS (`--vt-*`) que Material consume; "marca por tenant" queda como mecanismo (sobrescribir variables CSS por clase/atributo en `<html>`) sin fuente de datos real, porque ninguna tabla ni RF define logo o colores. Modo oscuro fuera. Origen de la marca: decisión para spec posterior, probablemente CFG.)
- **P4. ¿Cómo se compone el menú desde el manifiesto?** (El shell pinta lo que entrega `mi-contexto`; el contrato de menú se amplía a árbol con `codigo`, `nombre`, `ruta`, `icono`, `orden`, `padre` y módulo, y se fija como DTO en 15 con mock HTTP; el cambio en `seg.menu_usuario` y el endpoint son del 07. Iconos: nombre de Material Symbols. Las opciones con hijos se colapsan; las rutas no registradas se tratan como 404 en el shell.)
- **P5. ¿Alcance de `shared/ui` en 3 h y nivel de accesibilidad?** (Tokens, tema, carga, estado vacío y diálogo de confirmación (RNF-021); tabla/formulario/filtros se difieren al 16 donde se usan. Material por defecto cumple teclado y ARIA; axe-core sobre las páginas del shell como prueba automática, aunque RNF-019 no lo exija al backoffice.)
- **P6. ¿Alcance del selector y del tenant?** (Selector de empresa/sucursal agrupado por empresa, con autoselección si hay una (GWT 044), cambio desde el encabezado (045) y estado "sin accesos vigentes" (046). Selector de tenant solo si el usuario tiene más de una membresía, y se difiere si el endpoint `mi-tenant` no está; notificaciones persistentes quedan fuera, solo avisos con snackbar.)
- **P7. ¿Dónde se recuerda la última sucursal (RF-016)?** (`localStorage` por usuario y tenant en el MVP, claves bajo prefijo del shell; si el valor guardado ya no está entre las sucursales accesibles se ignora. Es el mismo criterio de 05, P6; implementarlo en el shell o en `SesionService` lo decide el spec 15, avisando al 13. Persistencia en servidor, después.)
- **P8. ¿i18n, formatos e inactividad?** (Español de Perú fijo: textos en un archivo de constantes del shell, sin `@angular/localize` ni transloco; `LOCALE_ID` en `es-PE`. Aviso de inactividad (RNF-014) fuera: lo resuelve la configuración de sesión de Supabase.)
- **P9. ¿Pruebas y evidencia?** (Pruebas de componente con TestBed zoneless: GWT 044, 045 y 046, render del menú por permisos y `*siPermiso`; contrato mock de `ContextoUsuario`. RNF-018 con tres anchos (360, 768, 1280 px) en pruebas de componente o Playwright mínimo; sin navegador a mano se declara como no probado; el e2e multinavegador (RNF-023) va en el 27.)
