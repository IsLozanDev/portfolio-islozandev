# Hoja de ruta de specs

Un spec es un archivo `specs/NN-slug.md`: un componente TR o un slice de uno. Objetivo en una frase, tres áreas como máximo, cabe en 10 h. `/spec` asigna el número según el orden en que se guardan; esta lista fija el orden de construcción y el contenido.

Estado: columna Estado, tomada del encabezado de cada `specs/NN-slug.md` (revisado el 2026-11-20). Se actualiza cuando un spec pasa a Aprobado o Implementado; sin archivo, Pendiente.

Versión 2: partida tras revisar los paquetes de contexto (`docs/spec-context/`). Los specs 03, 04, 06 y 07 originales superaban el tope de 10 h y el alta de tenant dependía de componentes que se construyen después.

## R0 y R1 (sprints 0 a 12): 40 specs

| NN | Slug | Cubre | h est. | Depende de | Contexto (`spec-context/NN-*.md`) | Estado |
|---|---|---|---|---|---|---|
| 01 | fundaciones-monorepo | F-02, F-03, F-05: Nx, pnpm, CI, docker-compose, Husky. Reglas de límites: etiquetas `comp:*`, ESLint por capa dentro de cada lib, matriz de dependencias entre componentes según PL-10. Debe dejar el generador `modulo-hexagonal`, libs en stub registradas y rangos de migraciones por componente | 7+ | — | — | Implementado |
| 02 | supabase-y-kernel | F-04, F-06 (RF 092): proyectos Supabase, kernel, kernel-infra, DDL de `sync.outbox` | 8 | 01 | 02 | Implementado |
| 03 | org-dominio-y-suscripcion | O-01 y parte de O-03 (RF 002-006): tenant, empresa, sucursal, unidad, suscripción, estados. Corrige `01a_org.sql` (RLS, CHECK, FK, historial) | 8-9 | 02 | 03 | Implementado |
| 04 | seg-identidad-hook-espejo | A-02, A-03: hook de token (`tenant_id`, `tipo_usuario`), espejo `auth.users` a `seg.usuario`, migración con rollback. Crea `db/01b_seg.sql` corregido (tablas con RLS, sin funciones de permisos). Solo dev; prod va al plan de migración a producción | 8-9 | 02, 03 | 04 | Implementado |
| 05 | seg-verificador-guard-mfa | A-01, A-05 (RF 017): lib `seguridad` con JWKS (solo ES256), `AutenticacionGuard`, `@Publico`, `@RequiereMfa` (aal2 y factor de 15 min como máximo, 401 step-up), `ultimo_acceso` y `GET /v1/seg/sesion`. Bloqueo por intentos e inactividad quedan como brecha (`docs/ops/supabase-ambientes.md`) | 9-10 | 04 | 04 | Implementado |
| 06 | seg-dominio-autorizacion | S-01 (RF 008, 011, 012, 013): permiso, rol, perfil, asignación con alcance y vigencia, manifiesto. `01b_seg.sql` ya existe (spec 04): lo que falte (p. ej. `version` en los agregados) entra como migración nueva | 6-8 | 04 | 06 | Implementado |
| 07 | seg-permisos-efectivos-guard | S-02, S-03, S-05 (RF 015, 016): permisos efectivos, caché Redis con invalidación, `@Permiso`, `X-Sucursal-Id`, aislamiento entre tenants. Incluye `seg.permisos_efectivos`, `seg.menu_usuario` y `seg.sucursales_accesibles` (`SECURITY DEFINER`, `search_path` fijo), que el 04 no creó. Del 05: `@Permiso` de un permiso sensible pone la metadata `REQUIERE_MFA`; `TenantContext` por petición desde el token; `/v1/seg/mi-contexto` reemplaza a `/v1/seg/sesion` | 10 | 05, 06 | 06 | Implementado (dentro del 06) |
| 08 | seg-membresias | S-04 (RF 009, 010, 014): invitar, aceptar, revocar, suspender. Límite de tasa en el endpoint público de aceptar (TR-RNF-015, pendiente del 05). Estimado mayor que las 4 h del plan | 8 | 07 | 08 | Implementado |
| 09 | cfg-parametros | D-01 y parte de D-05 (RF 030-033) | 8-9 | 07 | 09 | Implementado |
| 10 | seq-correlativos | D-02 y parte de D-05 (RF 035-037) | 7 | 07 | 10 | Implementado |
| 11 | evt-outbox-relay | E-02 (RF 093, 095): relay en el worker, suscriptores, reproceso | 6 | 02 | 11 | Implementado |
| 12 | org-alta-tenant-vencimiento | O-02 y vencimiento de O-03 (RF 001, 007): alta transaccional, siembra, invitación al propietario, tarea diaria. IDN y NOT van por puertos con adaptador nulo hasta R2 | 9 | 08, 09, 10, 11 | 03 | Implementado |
| 13 | auth-cliente-angular | A-04: shared/auth (cliente Supabase, sesión, interceptor, guards, `*siPermiso`). Compilar con Angular 21 | 6 | 07 | 13 | Aprobado |
| 14 | auth-ui-minima | Páginas `/auth`: ingresar, callback OAuth (Google real; Microsoft pendiente), MFA, recuperar, nueva clave e invitación (pantalla del spec 08). Primera app `plataforma-admin` con Material y Tailwind 4. Sin historia en el plan; se agrega | 12-13 | 13, 08 | 13 | Implementado |
| 15 | shell-y-ui | U-01, U-02 (RF 015, 016 en UI): `shared/ui` (tokens, avisos con SweetAlert2, tabla, filtros, formulario, carga, vacío) y `shared/shell` (layout, menú, selector de sucursal, páginas de sistema, interceptor de errores). Mayor que las 8 h del plan por SweetAlert2, tabla, filtros y formulario | 13-14 | 13, 14 | 15 | Implementado |
| 16a | usuarios-asignaciones | U-03 (RF 009, 013, 014) y su back: listar y detalle de miembros, `POST /asignaciones`. Agrega a `confirmarDestructiva` del 15 la opción `longitudMinimaMotivo` (por defecto 10) y la usa con 4 para SEG | 9 | 08, 15, 17a | 16a | Implementado |
| 16b | roles | U-04 (RF 011): controladores de roles, catálogo de permisos en árbol y UI de roles. Techo PLAT en `PLAT_PROPIETARIO` (sin escalada a permisos de operador). Perfiles salieron al 16c | 7 | 16a | 16b | Implementado |
| 16c | perfiles | U-04 (RF 012): lista, crear, copiar y cambiar roles del perfil (TR-CA-034, 035); `GET /v1/seg/perfiles/roles-disponibles` con `plat.perfil.gestionar`. Techo PLAT en perfiles (`ROL_FUERA_DEL_TECHO`: sin roles PLAT fuera de `PLAT_PROPIETARIO`) | 5-6 | 16b | 16b | Implementado |
| 17a | org-http | Back de ORG sin UI: tenants (lista, detalle, estado; `SECURITY DEFINER` para la lista) y empresas, sucursales y unidades. Permisos ORG al manifiesto y a `PLAT_PROPIETARIO`. Operador vs. cliente por permiso (`OPERADOR_REQUERIDO`), no por `tipo_usuario` | 7 | 12 | 17a | Implementado |
| 17b | consola-plataforma | O-04 (RF 001, 006): app `plataforma-consola`, solo front | 7 | 15, 17a | 17b | Implementado |
| 17c | admin-org-cliente | U-05 (RF 002-004) y U-06 (app admin cliente con sesión compartida). Front, más `GET` por id de empresa, sucursal y unidad y CORS por variable (`ORIGENES_PERMITIDOS`) | 9 | 16a, 17a | 17c | Implementado |
| 15b | identidad-visual | Revisión de diseño (sin historia en el plan): tema esmeralda, shell con menú oscuro, marco de `/auth` con la vitrina, chips de estado, `vit-tabla` como lista en celular; adopción en usuarios y tenants. Canvas «Vitrina · Diseño UI» | 9 | 15, 16a, 17b, 17c | — | Implementado |
| 15d | menu-colapsable-y-busqueda | Revisión de diseño (sin historia en el plan): menú lateral que se oculta a una franja de iconos con submenú, preferencia en `localStorage`, búsqueda de opciones con Ctrl K y teclado. Canvas «Shell · menú» | 6 | 15, 15b | — | Implementado |
| 15c | tema-oscuro | Revisión de diseño (sin historia en el plan): tema oscuro con selector Sistema / Claro / Oscuro en el menú de usuario, `light-dark()` en tokens, `data-tema` y script anti-parpadeo. Canvas «Tema oscuro» | 6 | 15b, 15d | — | Implementado |
| 18 | seg-bitacora-soporte | S-06 (RF 019, 020; TR-RN-011) | 4-6 | 08 | 18 | Implementado |
| 18b | seg-bitacora-ingreso-exportacion | S-06 (RF 019, 020): `LOGIN` y fallos de contraseña o MFA en la bitácora, ingreso por la API con bloqueo de fuerza bruta en Redis y exportación XLSX con permiso propio auditado | 8 | 05, 06, 13, 14, 18 | 18 | Implementado |
| 19a | cat-catalogos-nucleo | D-03 (RF 022-027): modelo, caché/ETag, `CatalogoPort` | 7 | 07 | 19 | Implementado |
| 19b | cat-importador-oficiales | D-04, parte de RF 028: importador CSV/XLSX de las 7 tablas oficiales, previsualización que valida todo, aplicación todo o nada en el worker (BullMQ), avance por SSE, reporte de errores en CSV y datos oficiales en `docs/datos-oficiales/` | 10 | 19a, 11, 12 | 19 | Implementado |
| 19c | cat-feriados-calendario | D-04, parte de RF 029: `cat.feriado` (GLOBAL/TENANT/SUCURSAL), `CalendarioPort.sumarDiasHabiles`, parámetro `plat.calendario.sabado_habil` y lista paginada de administración de ítems (pendiente del 19a) | 4-5 | 19a, 09 | 19 | Implementado |
| 19d | cat-consola-catalogos-ui | D-06, UI de RF 022, 023 y 028: consola de catálogos e ítems globales con vigencia y atributos (lib `catalogos-ui` compartida), tablas importables en solo lectura manual, importación por pasos y seguimiento global del avance en el shell con toast al terminar | 9 | 19a, 19b, 19c, 15, 15b, 15c, 15d, 17b | 19 | Aprobado (implementado, PR #34) |
| 19e | cat-admin-propios-feriados-ui | UI de RF 025, 026 y 029 (parte de D-05 sin dueño): lib `feriados` con una página por año en las dos apps (GLOBAL en la consola; TENANT y SUCURSAL en admin) y páginas de propios y ajustes en `admin-cliente` | 8-10 | 19c, 19d, 17c | 19 | Implementado |
| 20a | aud-registro-inmutable | E-01 (RF 084, 085): `aud.evento_auditoria` de solo inserción con hash SHA-256 encadenado por tenant (trigger), `AuditoriaPort` y `@Auditable` en la transacción del caso de uso, actor/IP/trace en `sync.outbox` y consumidor de eventos de ORG y suscripción | 9 | 03, 06, 11, 12 | 20 | Implementado |
| 20b | aud-consulta-integridad | E-01 (RF 086, TR-RNF-112): consulta paginada con alcance (TR-CA-213, 214), detalle, exportación XLSX auditada con aal2, permisos `plat.auditoria.consultar` y `plat.auditoria.exportar`, rol `PLAT_AUDITOR`, `VerificarIntegridad` incremental y tarea diaria en el worker | 6-7 | 06, 11, 18b, 20a | 20 | Implementado |
| 20c | aud-visor-ui | UI de RF 086 en `admin-cliente`: lista de auditoría con filtros y detalle con diferencias antes/después; exportar | 6-7 | 20b, 15, 15b, 15c, 15d, 17c | 20 | Aprobado (implementado, PR #38) |
| 21 | obs-y-staging | E-03, E-04 | 8 | 11 | 21 | Implementado |
| 22 | sazonpos-org-seq-cfg | C-01, C-02: CC-01, CC-03, CC-05 | 10 | 03, 09, 10 | — | Pendiente |
| 23 | sazonpos-auth | C-03: CC-10 | 8 | 05, 08 | — | Pendiente |
| 24 | sazonpos-permisos-sombra | C-04, Q-02, P-03: CC-02 | 13 | 07, 23 | — | Pendiente |
| 25 | sazonpos-catalogos-eventos | C-05, C-06, C-08: CC-04, CC-07 | 12 | 11, 19a, 19b, 20a | — | Pendiente |
| 26 | sazonpos-shell | C-07: CC-08 | 7 | 15, 24 | — | Pendiente |
| 27 | e2e-uat-produccion-r1 | Q-01, Q-03, P-01, Q-04, P-02, P-04 | 29 | todos | — | Pendiente |

Paquetes de contexto nuevos (9, 10, 11, 15, 18, 19, 20, 21): `docs/spec-context/NN-slug.md`. Pendientes de decidir al redactar: la UI de 09 y 10 depende de 13 y 15 (hoy declaran solo 07); RF-094 (registro de esquemas) sin spec; formato de número de SEQ (8 dígitos vs "A-001").

Persistencia con ORM (regla 11 de CLAUDE.md) desde el spec 10. Los specs 01 a 09 conservan SQL embebido en sus repositorios; migrarlos a TypeORM es un spec de refactor aparte (~6-8 h, sin número ni fecha). Los specs 10 SEQ (`FOR UPDATE`) y 20 AUD (hash encadenado) pueden justificar SQL puntual.

19 se partió en 19a (núcleo), 19b (importador), 19c (feriados y calendario) y 19d (UI): el 19b original tenía 4 áreas y unas 14 h, y el importador creció con el worker, el SSE y el reporte de errores. 19b y 19c se pueden implementar en paralelo; 19d va al final porque consume las rutas de los dos. La UI se partió a su vez en 19d (consola: catálogos, ítems globales, importación y seguimiento) y 19e (feriados en las dos apps, y propios y ajustes del tenant en admin): junta llegaba a 14-16 h.

20 se partió en 20a (registro, inmutabilidad, acceso sensible y consumo de eventos), 20b (consulta, exportación e integridad) y 20c (visor): con captura mixta (puerto en la transacción para productos, outbox para las libs de plataforma, que por PL-10 no importan `comp:aud`), actor en el outbox, exportación XLSX y verificación diaria llegaba a 13-15 h. 20b y 20c van en serie tras 20a.

16 y 17 se partieron en 16a/16b/16c y 17a/17b/17c: el plan contaba solo las horas de front y la capa HTTP del back no existía. Longitud del motivo: se respeta lo implementado (SEG 4-300, ORG 10-500); la UI la recibe por opción en vez de fijarla. Los specs 22 a 25 y 27 superan 10 h. Al llegar a ellos se parten (por ejemplo 19: catálogos propios, tablas SUNAT y feriados; 27: E2E, UAT, producción) antes de redactar.

## Cambios respecto a la versión 1

- 03 original (15 h) pasa a 03 y 12. El alta de tenant se mueve después de membresías, CFG, SEQ y outbox, porque los usa.
- 04 original (14 h) pasa a 04 y 05.
- 05 original pasa a 13 y 14. `auth-ui` no tenía dueño.
- 06 original (16 h) pasa a 06 y 07.
- 07 original pasa a 08.
- CFG, SEQ y evt suben antes de la UI porque el alta de tenant los necesita.

## Decisión de orden (2026-11-16)

Primero se terminan todos los componentes transversales (specs 28 a 138: R2, R3 y R4). La integración de SazónPOS (specs 22 a 26), el 27 y los consumidores de SazónPOS de R2 (CC-06, CC-09, homologación) van al final, después del último spec transversal. Los números 22 a 27 se conservan.

Mapa y checklist: `docs/mapa-componentes-transversales.md`. Contexto: `docs/spec-context/tr-*/` (una carpeta por componente, con `README.md`). Las horas salen de los paquetes y superan las del plan; las fechas H4 y H5 se replanifican.

Migraciones: la letra `db/01<letra>_*.sql` se asigna al implementar, en el orden de esta tabla (el runner ordena alfabéticamente). Las letras que proponen los paquetes son indicativas.

## Componentes transversales pendientes: specs 28 en adelante

| NN | Slug | Cubre | h est. | Depende de | Contexto (`spec-context/`) | Estado |
|---|---|---|---|---|---|---|
| 28 | idn-validacion-consulta | R2-02: TR-RF-044, 045, 046 | 8-9 | 06, 21 | `tr-idn/idn-validacion-consulta-dni-ruc.md` | Implementado |
| 28b | idn-padron-ruc-org | R2-02: adaptador real de `PadronRucPort` sobre `IdentidadPort`; TR-CA-004 y TR-CA-006 diferidos del 03; prellenado y aviso en `admin-cliente` y consola | 5-6 | 28, 12, 17a, 17b, 17c | `tr-idn/idn-validacion-consulta-dni-ruc.md` | Implementado |
| 29 | idn-cuota | R2-02: TR-RF-047 (back, tarea mensual, aviso 80 % como evento) | 6 | 28, 12 | `tr-idn/idn-cuota-y-consola-proveedor.md` | Implementado |
| 30 | idn-consola-proveedor-cuotas | UI de 047 en la consola | 8 | 29, 17b, 17c | `tr-idn/idn-cuota-y-consola-proveedor.md` | Implementado |
| 31 | per-registro-y-roles | R2-01: TR-RF-039, 040 | 9 | 28, 07, 19a, 17a | `tr-per/per-registro-roles-contactos.md` | Implementado |
| 32 | per-contactos-direcciones | R2-01: TR-RF-041 y edición de datos básicos de la persona | 6 | 31 | `tr-per/per-registro-roles-contactos.md` | Implementado |
| 33 | arc-carga-descarga | R2-03: TR-RF-080, 082 | 9 | 07, 11, 20a | `tr-arc/arc-subida-versiones-url-firmada.md` | Implementado |
| 34 | arc-antivirus | TR-RNF-114 (adaptador real). Hasta este spec el único antivirus es la firma EICAR del 33: TR-ARC no se habilita en producción. Incluye barrido de análisis atascados y clamd en staging | 6-7 | 33, 21 | `tr-arc/arc-subida-versiones-url-firmada.md` | Implementado |
| 35 | arc-versiones | R2-03: TR-RF-081 | 9-10 | 33 | `tr-arc/arc-subida-versiones-url-firmada.md` | Implementado |
| 36 | arc-ui-archivo-carga | `<ui-archivo-carga>` | 7 | 33, 35, 15 | `tr-arc/arc-subida-versiones-url-firmada.md` | Pendiente |
| 37 | per-consentimientos | R2-01: TR-RF-043 | 7 | 31, 33, 20a, 11 | `tr-per/per-consentimientos.md` | Pendiente |
| 38 | per-ui-persona-buscador | UI de 039 y 041 (`personas-ui`, `<ui-persona-buscador>`) | 8 | 31, 32, 15b-d | `tr-per/per-registro-roles-contactos.md` | Pendiente |
| 39 | per-duplicados-fusion | TR-RF-042 (back) | 7 | 31, 32, 37, 20a | `tr-per/per-duplicados-fusion.md` | Pendiente |
| 40 | per-fusion-ui | UI de 042 | 6 | 39, 17c | `tr-per/per-duplicados-fusion.md` | Pendiente |
| 41 | boveda-secretos | TR-RNF-113: secretos por tenant con cifrado por sobre (FE, PAG, NOT) | 4-5 | kernel-infra | `tr-fe/fe-emisor-y-puerto-pse.md`, `tr-pag/README.md` | Pendiente |
| 42 | not-envio-correo-resend | R2-09: TR-RF-075, 079 (correo) | 9 | 11, 21, 37 | `tr-not/not-correo-plantillas-estados.md` | Pendiente |
| 43 | not-plantillas-personalizacion | R2-09: TR-RF-074 (back) | 5 | 42, 07 | `tr-not/not-correo-plantillas-estados.md` | Pendiente |
| 44 | not-consumidores-plataforma | Correos de eventos ya publicados (vencimiento, suspensión, integridad, soporte) | 3 | 42, 43 | `tr-not/not-correo-plantillas-estados.md` | Pendiente |
| 45 | not-recordatorios | R2-10: TR-RF-076 | 4 | 42 | `tr-not/not-recordatorios-preferencias.md` | Pendiente |
| 46 | not-preferencias-bajas | R2-10: TR-RF-077 | 6 | 45, 31 | `tr-not/not-recordatorios-preferencias.md` | Pendiente |
| 47 | not-plantillas-ui | R2-11: UI de 074 | 4-5 | 43, 15, 17c, 19e | `tr-not/not-plantillas-ui.md` | Pendiente |
| 48 | cat-tablas-sunat-fe | Catálogos SUNAT 05, 09, 10, 16, 51, 52 y regenerar 01, 06, 07 | 3-4 | 19b | `tr-fe/fe-boleta-factura-cdr.md` | Implementado |
| 49 | fe-emisor-configuracion | R2-04: TR-RF-052 (pasos 1-3, alerta de vencimiento) | 7-8 | 41, 09, 19a, 20a | `tr-fe/fe-emisor-y-puerto-pse.md` | Pendiente |
| 50 | fe-puerto-pse-adaptador | R2-04: TR-RF-052 (pasos 4-5) | 5-6 | 49 | `tr-fe/fe-emisor-y-puerto-pse.md` | Pendiente |
| 51 | fe-emision-boleta-factura | R2-05: TR-RF-053, 054 | 9-10 | 48, 50, 10, 09, 28 | `tr-fe/fe-boleta-factura-cdr.md` | Pendiente |
| 51b | fe-ubl-firma | UBL 2.1 y firma propios; solo si se elige OSE o SUNAT directo | 8-10 | 51 | `tr-fe/fe-boleta-factura-cdr.md` | Condicional |
| 52 | fe-envio-cdr | R2-05: TR-RF-059 | 6-7 | 51, 33, 11 | `tr-fe/fe-boleta-factura-cdr.md` | Pendiente |
| 53 | fe-representacion-impresa | R2-06: TR-RF-061 | 6-7 | 51, 33 | `tr-fe/fe-representacion-impresa.md` | Pendiente |
| 54 | fe-notas-credito-debito | R2-07: TR-RF-055, 056 | 7-8 | 52 | `tr-fe/fe-notas-resumen-baja.md` | Pendiente |
| 55 | fe-resumen-diario-baja | R2-07: TR-RF-057, 058 | 8-9 | 54 | `tr-fe/fe-notas-resumen-baja.md` | Pendiente |
| 56 | fe-reintentos-contingencia | R2-08: TR-RF-060 | 5-6 | 52 | `tr-fe/fe-contingencia-monitor.md` | Pendiente |
| 57 | fe-monitor-api | R2-08: TR-RF-063 (back) | 4-5 | 52, 55, 33 | `tr-fe/fe-contingencia-monitor.md` | Pendiente |
| 58 | fe-monitor-ui | R2-08: UI de 063 (baja y nota de crédito manual) | 5-6 | 57, 15, 17c | `tr-fe/fe-contingencia-monitor.md` | Pendiente |
| 59 | fe-entrega-comprobante | R2-09: TR-RF-062 (correo) | 3-4 | 42, 52, 53 | `tr-fe/fe-entrega-comprobante.md` | Pendiente |
| 60 | seq-series-ui | UI de TR-RF-035 (deuda de D-05, R1) | 4-5 | 10, 17c | `tr-fe/fe-admin-ui.md` | Pendiente |
| 61 | cfg-parametros-ui | UI de TR-RF-031, 033 (deuda de D-05, R1) | por estimar | 09, 17c | `tr-pendientes-base/README.md` (pendiente 3) | Pendiente |
| 62 | fe-admin-emisor-ui | R2-11: UI de 052 | 5-7 | 49, 50, 17c | `tr-fe/fe-admin-ui.md` | Pendiente |
| 63 | aud-incidentes-datos | R2-17: TR-RF-091 (back) y consumidor de `aud.integridad.rota` | 7 | 20b, 42 | `tr-aud-arco/arco-incidentes-datos.md` | Pendiente |
| 64 | arco-solicitud-plazos | R2-17: TR-RF-088 (registro por el responsable), alertas 50/80 % | 8 | 10, 19c, 20a, 33, 42 | `tr-aud-arco/arco-registro-atencion.md` | Pendiente |
| 65 | arco-atencion-compilado | R2-17: TR-RF-089 | 7 | 64, 33 | `tr-aud-arco/arco-registro-atencion.md` | Pendiente |
| 66 | aud-incidentes-consola-ui | UI de 091 en la consola | 5 | 63, 17b | `tr-aud-arco/arco-incidentes-datos.md` | Pendiente |
| 67 | arco-admin-ui | UI de 088 y 089 en admin-cliente | 6 | 64, 65, 20c | `tr-aud-arco/arco-registro-atencion.md` | Pendiente |
| 68 | arco-cancelacion-anonimizacion | TR-RF-090 | 7 | 65, 31 | `tr-aud-arco/arco-cancelacion-anonimizacion.md` | Pendiente |
| 69 | arc-retencion-bloqueo-legal | TR-RF-083 (back) | 7 | 33, 35 | `tr-arc/arc-retencion-bloqueo-legal.md` | Pendiente |
| 70 | arc-retencion-ui | UI de 083 | 6 | 69 | `tr-arc/arc-retencion-bloqueo-legal.md` | Pendiente |
| 71 | cfg-historial-parametros | TR-RF-034 | 4-6 | 09, 11, 20a, 20b, 61 | `tr-pendientes-base/cfg-historial-parametros.md` | Pendiente |
| 72 | evt-registro-esquemas | TR-RF-094, TR-RNF-117 | 7-9 | 11 | `tr-pendientes-base/evt-registro-esquemas.md` | Pendiente |
| 73 | pag-pasarela-y-cobro-tarjeta | R3-01: TR-RF-065, 066 | 10 | 41, 05, 07, 11, 19a, 20a | `tr-pag/pag-pasarela-y-cobro-tarjeta.md` | Pendiente |
| 74 | pag-webhook-pasarela | R3-02: TR-RF-069 | 6 | 73 | `tr-pag/pag-yape-plin-webhook.md` | Pendiente |
| 75 | pag-yape-plin | R3-01: TR-RF-067 | 4 | 74 | `tr-pag/pag-yape-plin-webhook.md` | Pendiente |
| 76 | pag-configuracion-ui | UI de 065 | 5 | 73, 15, 17c | `tr-pag/pag-pasarela-y-cobro-tarjeta.md` | Pendiente |
| 77 | pag-link-pago | R3-03: TR-RF-068 | 4 | 74, 42 | `tr-pag/pag-link-reembolso.md` | Pendiente |
| 78 | pag-reembolso | R3-03: TR-RF-070 | 5 | 74 | `tr-pag/pag-link-reembolso.md` | Pendiente |
| 79 | pag-pagos-admin-ui | UI de 068 y 070 | 6 | 76, 77, 78 | `tr-pag/pag-link-reembolso.md` | Pendiente |
| 80 | rep-definiciones-motor | R3-04: TR-RF-096, 097 (síncrono) | 7 | 07, 20a | `tr-rep/rep-definiciones-ejecucion-exportacion.md` | Pendiente |
| 81 | rep-exportacion-asincrona | R3-04: TR-RF-097 (segundo plano) | 8 | 80, 11, 33, 42 | `tr-rep/rep-definiciones-ejecucion-exportacion.md` | Pendiente |
| 82 | rep-ui-admin | UI de reportes en admin-cliente | 6 | 80, 81, 15b-d, 17c | `tr-rep/rep-definiciones-ejecucion-exportacion.md` | Pendiente |
| 83 | cms-sitio-dominio-marca | R3-05: TR-RF-119 | 8 | 07, 11, 15, 33 | `tr-cms/cms-sitio-dominio-seo.md` | Pendiente |
| 84 | cms-paginas-bloques | R3-05: TR-RF-120 (back y editor) | 9 | 83 | `tr-cms/cms-paginas-bloques-render.md` | Pendiente |
| 85 | cms-render-ssr | R3-05: TR-RF-120 (render SSR, CDN) | 8 | 84 | `tr-cms/cms-paginas-bloques-render.md` | Pendiente |
| 86 | cms-seo-sitemap | R3-05: TR-RF-123 | 4 | 84, 85 | `tr-cms/cms-sitio-dominio-seo.md` | Pendiente |
| 87 | cms-menus-banners-galeria | R3-06: TR-RF-121 | 6 | 83, 85, 33 | `tr-cms/cms-medios-noticias-formularios.md` | Pendiente |
| 88 | cms-noticias-programadas | R3-06: TR-RF-122 | 5 | 84, 85, 19a | `tr-cms/cms-medios-noticias-formularios.md` | Pendiente |
| 89 | cms-formularios-contacto | R3-06: TR-RF-124 | 6 | 85, 31, 42 | `tr-cms/cms-medios-noticias-formularios.md` | Pendiente |
| 90 | por-cuentas-registro-otp | R3-07: TR-RF-125, 126 (back) | 9 | 05, 18b, 83, 31 | `tr-por/por-registro-ingreso-otp.md` | Pendiente |
| 91 | por-portal-acceso-ui | R3-07: UI de 125 y 126 | 5 | 90, 85 | `tr-por/por-registro-ingreso-otp.md` | Pendiente |
| 92 | por-perfil-consentimientos | R3-07: TR-RF-127, 129 | 9 | 90, 91, 37, 42, 64 | `tr-por/por-perfil-consentimientos.md` | Pendiente |
| 93 | por-mis-transacciones | TR-RF-128 (sin historia) | 7 | 90, 91, 31, 52 | `tr-por/por-mis-transacciones.md` | Pendiente |
| 94 | sop-tickets-nucleo | R3-08: TR-RF-111, 115 (back) | 8-9 | 07, 12, 19c | `tr-sop/sop-widget-tickets-comentarios.md` | Pendiente |
| 95 | sop-bandeja-estados-back | R3-08: TR-RF-113, 114 (back) | 6-7 | 94 | `tr-sop/sop-bandeja-sla-estados.md` | Pendiente |
| 96 | sop-widget-ui | R3-08: UI de 111 y 115 | 6 | 94 | `tr-sop/sop-widget-tickets-comentarios.md` | Pendiente |
| 97 | sop-consola-bandeja-ui | R3-08: UI de 113 a 115 | 7 | 95 | `tr-sop/sop-bandeja-sla-estados.md` | Pendiente |
| 98 | sop-problemas-github | R3-09: TR-RF-116, 117 | 7-8 | 95 | `tr-sop/sop-escalamiento-github-alertas.md` | Pendiente |
| 99 | obs-indicadores-negocio | R3-10: TR-RF-106 | 5-6 | 11, 21 | `tr-obs-negocio/obs-indicadores-reglas.md` | Pendiente |
| 100 | obs-reglas-alerta | R3-10: TR-RF-107 | 5-6 | 99, 07, 17b, 17c | `tr-obs-negocio/obs-indicadores-reglas.md` | Pendiente |
| 101 | obs-evaluador-alertas | R3-10: TR-RF-108 | 6-7 | 100, 42 | `tr-obs-negocio/obs-alertas-salud.md` | Pendiente |
| 102 | obs-salud-y-alertas-ui | R3-10: TR-RF-109, 110 | 7-8 | 101, 17a-c | `tr-obs-negocio/obs-alertas-salud.md` | Pendiente |
| 103 | sop-ticket-desde-alerta | TR-RF-112 (sin historia) | 2-3 | 101, 94 | `tr-sop/sop-escalamiento-github-alertas.md` | Pendiente |
| 104 | not-whatsapp-envio | R3-11: TR-RF-078, 079 (WhatsApp) | 8 | 42, 43, 45 | `tr-not/not-whatsapp.md` | Pendiente |
| 105 | not-whatsapp-plantillas-meta | R3-11: TR-RF-078 (aprobación de plantillas) | 5 | 104, 47 | `tr-not/not-whatsapp.md` | Pendiente |
| 106 | rep-programacion-envios | TR-RF-098 (sin historia) | 6-7 | 80, 42, 33 | `tr-rep/rep-programacion-tableros.md` | Pendiente |
| 107 | rep-tableros-back | TR-RF-099 (sin historia) | 5-6 | 80, 16b, 99 | `tr-rep/rep-programacion-tableros.md` | Pendiente |
| 108 | rep-tableros-ui | UI de 099 | 6 | 107 | `tr-rep/rep-programacion-tableros.md` | Pendiente |
| 109 | sop-kb-articulos | TR-RF-118 sin IA (sin historia) | 5-6 | 94 | `tr-sop/sop-base-conocimiento.md` | Pendiente |
| 110 | sop-kb-sugerencias-ui | UI de 118 | 5-6 | 109, 96 | `tr-sop/sop-base-conocimiento.md` | Pendiente |

### R4 (fuera del plan, backlog 2028): se especifican al cerrar R3

| NN | Slug | Cubre | h est. | Depende de | Contexto (`spec-context/`) | Estado |
|---|---|---|---|---|---|---|
| 111 | seg-sesiones-activas | TR-RF-018 e inactividad en servidor (TR-RNF-014) | 7-8 | 05, 18b, 16a | `tr-pendientes-base/seg-sesiones-transferencia.md` | Pendiente |
| 112 | seg-transferir-propiedad | TR-RF-021 | 5-6 | 08, 16a, 20a | `tr-pendientes-base/seg-sesiones-transferencia.md` | Pendiente |
| 113 | idn-portable-titular-y-solicitud | TR-RF-048 | 8 | 28, 42, 90 | `tr-idn/idn-identidad-portable.md` | Pendiente |
| 114 | idn-portable-confirmacion-y-lectura | TR-RF-049, 050 | 8 | 113 | `tr-idn/idn-identidad-portable.md` | Pendiente |
| 115 | idn-portable-mis-autorizaciones | TR-RF-051 | 8 | 114, 91 | `tr-idn/idn-identidad-portable.md` | Pendiente |
| 116 | pag-cobro-recurrente | TR-RF-071 | 9 | 73-78, 90 | `tr-pag/pag-recurrencia-conciliacion-suscripcion.md` | Pendiente |
| 117 | pag-conciliacion-liquidaciones | TR-RF-072 | 9 | 73-78, 80, 33 | `tr-pag/pag-recurrencia-conciliacion-suscripcion.md` | Pendiente |
| 118 | org-facturacion-suscripcion | TR-RF-073 | 10 | 116, 51 | `tr-pag/pag-recurrencia-conciliacion-suscripcion.md` | Pendiente |
| 119 | fe-registro-ventas | TR-RF-064 | por estimar | 51, 80 | `tr-fe/fe-pendientes-posteriores.md` | Pendiente |
| 120 | ia-pasarela-y-enmascarado | TR-RF-100, 101 | 9-10 | 07, 09, 20a, 21 | `tr-ia/ia-pasarela-enmascarado-consumo.md` | Pendiente |
| 121 | ia-consumo-y-limites | TR-RF-104 | 7-8 | 120, 12, 42 | `tr-ia/ia-pasarela-enmascarado-consumo.md` | Pendiente |
| 122 | ia-extraccion-documental | TR-RF-102 | 7-8 | 120, 33 | `tr-ia/ia-extraccion-rag.md` | Pendiente |
| 123 | ia-conocimiento-rag | TR-RF-103 | 10 | 120, 33, 09, 17c | `tr-ia/ia-extraccion-rag.md` | Pendiente |
| 124 | ia-agente-orquestador | TR-RF-105 (chat web) | 10 | 120, 121, 20a | `tr-ia/ia-agente-conversacional.md` | Pendiente |
| 125 | ia-agente-canales-derivacion | TR-RF-105 (WhatsApp, derivación) | 8-10 | 124, 123, 104 | `tr-ia/ia-agente-conversacional.md` | Pendiente |
| 126 | sop-kb-semantica | TR-RF-118 con IA | 4 | 109, 123 | `tr-sop/sop-base-conocimiento.md` | Pendiente |
| 127 | int-clientes-api | TR-RF-130 y emisión de token | 8-9 | 07, 12, 20a, 17c | `tr-int/int-clientes-api-publica.md` | Pendiente |
| 128 | int-api-publica-limites | TR-RF-131 | 8-9 | 127, 21 | `tr-int/int-clientes-api-publica.md` | Pendiente |
| 129 | int-webhooks-salientes | TR-RF-132 | 9-10 | 127, 72, 11, 42 | `tr-int/int-webhooks-salientes.md` | Pendiente |
| 130 | int-sync-cursor-ack | TR-RF-133 (lectura y ack) | 7-8 | 127, 11 | `tr-int/int-sincronizacion-cursor.md` | Pendiente |
| 131 | int-sync-conciliacion-purga | TR-RF-133 (conciliación y purga) | 5-6 | 130, 21, 101 | `tr-int/int-sincronizacion-cursor.md` | Pendiente |
| 132 | edge-enrolamiento | TR-RF-134 | 9-10 | 07, 17a, 17c, 21 | `tr-edge/edge-enrolamiento-impresion.md` | Pendiente |
| 133 | edge-impresion-cajon | TR-RF-135 | 8-9 | 132 | `tr-edge/edge-enrolamiento-impresion.md` | Pendiente |
| 134 | edge-latido-parque | TR-RF-138 (latido, vista) | 6-7 | 132, 17b, 21 | `tr-edge/edge-gestion-remota.md` | Pendiente |
| 135 | seq-bloques-offline | TR-RF-038 | 6-7 | 10, 132 | `tr-edge/edge-offline-cache-bloques.md` | Pendiente |
| 136 | edge-cache-local | TR-RF-137 | 7-8 | 132, 09, 19a, 11 | `tr-edge/edge-offline-cache-bloques.md` | Pendiente |
| 137 | edge-cola-offline-sync | TR-RF-136 | 10 | 135, 136 | `tr-edge/edge-offline-cache-bloques.md` | Pendiente |
| 138 | edge-actualizacion-anillos | TR-RF-138 (versiones firmadas) | 6-7 | 134 | `tr-edge/edge-gestion-remota.md` | Pendiente |

Opcionales sin número (se numeran solo si se deciden): `per-textos-finalidad-ui` (5 h), `arc-exportaciones-72h` (TR-RN-047, 6 h). Pendientes sin dueño de los specs 01-21: `spec-context/tr-pendientes-base/README.md`.

### Al final: SazónPOS

Specs 22 a 27 (tabla de arriba) y, de R2, CC-06 (personas por tenant, R2-12), CC-09 (facturación desde la caja, R2-13), homologación con el PSE (R2-14), E2E de emisión (R2-15) y pases a producción. Se reordenan y parten al terminar el bloque transversal.

## Olas de implementación en paralelo (worktrees)

- Ola 1: 01, luego 02. En serie.
- Ola 2: 03 y 11.
- Ola 3: 04, luego 05 y 06 en paralelo.
- Ola 4: 07, luego 08 y 13.
- Ola 5: 09, 10, 14, 20a; luego 20b; luego 20c.
- Ola 6: 12, 15, 18, 19a, 21; luego 19b y 19c en paralelo; 19d tras 19b y 19c, y 19e tras 19d; luego 17a; luego 16a y 17b (solo comparten `plat.manifiesto.json`); luego 16b y 17c (los dos sobre `libs/plataforma/admin-cliente`, que crea el 16a); luego 16c.
- Bloque transversal (28 a 138) antes que SazónPOS. SazónPOS (22 a 26), 27 y los CC de R2 al final.

Máximo 2 o 3 frentes a la vez: la revisión de diffs es el cuello de botella.

## Reglas de esta hoja

- TR-SEG y TR-ORG se dividen en varios specs porque concentran el riesgo y el mayor número de RF.
- El código de `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/codigo/` es base probada, no se copia a ciegas. No trae kernel, org, membresías, rol, perfil ni asignación en código.
- Si cambia el plan (regla del 70 %), se actualiza esta tabla.
