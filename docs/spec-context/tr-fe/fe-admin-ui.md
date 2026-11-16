# Contexto para fe-admin-ui

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md` (estructura de libs Angular, diseño UI, verificación con Playwright), SRS (RF-052, RF-035, Criterios GWT), `plan.md` (6.1 Pantallas por release), `3_plan.json`, `specs/10`, `specs/17c`, `specs/19e`, código real de `admin-cliente`, `shared/ui`, `shared/auth` y del manifiesto PLAT.

## 1. Alcance y dependencias
- Historia **R2-11** (sprint 16, 5 h, **Front**, componente «Admin cliente»): «Emisor electrónico, series de FE y plantillas», TR-RF-052 y TR-RF-074. Plan 6.1: en R2, `plataforma-admin` suma «Emisor electrónico, series FE, plantillas de notificación, derechos ARCO».
- La parte de plantillas (RF-074) es de TR-NOT y va en su paquete. Este cubre emisor y series.
- Depende de `fe-emisor-y-puerto-pse` (API del emisor, prueba beta, paso a producción), 10 (API `/v1/seq` de series), 15/15b-d (shell, `shared/ui`, tema oscuro), 17c (`admin-cliente`), TR-ARC (logo, ver `fe-representacion-impresa` P3).
- **Hallazgo**: la pantalla genérica de series no existe. El spec 10 dejó la UI de RF-035 fuera; 17c y 19e también («UI de parámetros y series: resto de D-05… va en un spec aparte»). El manifiesto PLAT `1.15.0` ya tiene la opción `plat.configuracion.series` sin página. «Series FE» depende de esa pantalla.
- Horas: 5 h en el plan; realista 10-12 h. Partición:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| A | seq-series-ui | UI de TR-RF-035 (todas las series, con filtro de comprobantes) | 4-5 | 10, 17c; deuda de R1 (D-05) |
| B | fe-admin-emisor-ui | UI de TR-RF-052 | 5-7 | fe-emisor-y-puerto-pse A y B, 15, 17c, ARC (logo) |

- Áreas A: (a) lista de series por empresa y sucursal, (b) alta en panel lateral, (c) activar o inactivar. Áreas B: (a) formulario del emisor y subida del certificado, (b) prueba en beta con resultado, (c) paso a producción con confirmación y aal2.
- Monitor de comprobantes, baja y NC manual: en `fe-contingencia-monitor` (parte C).
- Constitución y `CLAUDE.md`: libs Angular por tipo de artefacto, sin `template` inline, Tailwind + Material, tokens `--color-*`, densidad media, verificación con Playwright en claro, oscuro y 600 px.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-052 | Configurar emisor electrónico (UI) | plat.fe.configurar | APP-02 | TR-RN-009, 021 | TR-RNF-113, 017 | ACT-06 |
| TR-RF-035 | Configurar series y correlativos (UI) | plat.serie.gestionar | APP-02 | TR-RN-016, 017, 009 | (spec 10) | Admin del cliente |

- **052 en UI**: elegir proveedor, ingresar usuario y clave del proveedor, subir `.pfx` (<= 50 KB) y su clave, ambiente, régimen de IGV, leyenda de pie; ver RUC y vencimiento del certificado; ejecutar prueba beta y ver «Conexión correcta: comprobante de prueba aceptado» (CA-133) o el error (CA-134); botón «Pasar a producción» habilitado tras prueba correcta. Los secretos nunca vuelven a la pantalla: solo «configurado el dd/mm».
- **035 en UI**: crear serie (tipo, código, sucursal o unidad, dígitos, reinicio, último número), listar, activar/inactivar. Para comprobantes la API ya fuerza `^F|B…`, 8 dígitos y sucursal (`ck_serie_sunat`, `ck_serie_sunat_ambito`). «Cambiar series» es sensible (RN-009).

## 3. Criterios GWT
- **TR-CA-133**, **TR-CA-134**, **TR-CA-135** (052): ver `fe-emisor-y-puerto-pse.md`; en UI se verifican los mensajes y que «Pasar a producción» solo se habilite tras CA-133.
- **TR-CA-090 a 097** (SEQ, spec 10): el back ya los cubre; la UI no tiene GWT propios en el SRS.
- Faltan (proponer): sin aal2 la pantalla pide MFA antes de guardar (guard `aal2Guard`); el campo de clave nunca se rellena al volver; archivo > 50 KB rechazado en el cliente y en el servidor; aviso visible si el certificado vence en <= 30 días; confirmación destructiva al pasar a producción (`AvisosService`, RNF-021); serie FE con código inválido muestra el error de la API; lista de series filtrable por tipo (comprobantes vs otros); pantallas en tema claro y oscuro y a 600 px; consola sin errores (Playwright).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-009 | Configurar emisor y cambiar series son sensibles: MFA <= 15 min y auditoría. |
| TR-RN-017 | Formato de series de comprobantes (la UI lo valida antes de enviar). |
| TR-RNF-113 | Secretos nunca en texto plano: la UI no los muestra ni los guarda en `localStorage`. |
| TR-RNF-021 | Confirmación explícita para acciones irreversibles (paso a producción). |

Heredados por CLAUDE.md: 001/002, 012, 024/119, 025, 026.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R2-11 | 16 | 5 | Admin cliente | Emisor electrónico, series de FE y plantillas | TR-RF-052, 074 | Front | R2 |

Relacionadas: D-05 (R1, sprint 6: parámetros, series y catálogos propios; series sin UI), R2-04, R2-09 (plantillas), R2-14 (homologación: usa esta pantalla para la prueba beta). Sprint 16 «Notificaciones, administración de FE y personas en SazónPOS» (2027-05-31 a 2027-06-13, 18 h).

## 6. Tablas SQL, eventos, puertos y permisos
- Sin tablas ni eventos nuevos: consume las API de `fe-emisor-y-puerto-pse` (`/v1/fe/emisores/...`) y de SEQ (`/v1/seq/series`).
- **Manifiesto PLAT**: hoy `1.15.0` con opciones `plat.configuracion.series` (sin página) y sin módulo de FE. Proponer módulo `facturacion` con opciones `plat.facturacion.emisor` (`plat.fe.configurar`) y `plat.facturacion.comprobantes` (`plat.fe.monitorear`).
- **Rutas** (lazy): `series`, `fe/emisor/:empresaId`, y en el monitor `fe/comprobantes`, `fe/comprobantes/:id`.
- **Guardas**: `aal2Guard` (`libs/shared/auth`) en la ruta del emisor; `@RequiereMfa` en el back.

## 7. Código base relacionado
- **`admin-cliente`** (`libs/plataforma/admin-cliente`, `type:feature`): rutas en `admin-cliente.routes.ts` (usuarios, roles, perfiles, empresas, sucursales, unidades, bitácora, soporte, auditoría, catálogos). Montada en `apps/plataforma-admin` bajo `admin` (`ADMIN_CLIENTE_ROUTES`). Patrones de formulario: `pages/empresa-formulario`, `utils/formulario-empresa.ts`, `utils/validadores-organizacion.ts`.
- **`shared/ui`**: `TablaComponent`, `FiltrosComponent`, `ChipEstadoComponent` + `TonoEstado`, `EstadoVacioComponent`, `CargandoComponent`, `AccionesFormularioComponent`, `AvisosService`, `PanelLateralService`, `MensajeValidacionPipe`.
- **`shared/auth`**: `MfaService`, `aal2Guard`.
- **Back existente**: `correlativos` (`/v1/seq` con 4 rutas: crear, cambiar estado, listar, consultar; spec 10).
- **No existe**: páginas de series, de parámetros y de FE; API de FE; subida de archivos en el front (llega con TR-ARC, `<ui-archivo-carga>` de la hoja Consumidores).

## 8. Diagramas relevantes
- Canvas «Vitrina · Diseño UI» (https://claude.ai/artifact/UGvcmiWUiBsMuWerqMiWxh): pantallas tipo formulario (emisor), lista (series) y confirmación (paso a producción).
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-04_Modelo_de_dominio_Catalogos_parametros_y_correlativos.mmd` (series).
- `9_Plan_Implementacion/PL-08_Integracion_de_SazonPOS_con_la_plataforma.mmd` (SazónPOS abre la app de Administración).

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- R2-11 da 5 h a tres pantallas de dos componentes (FE y NOT) y supone que la pantalla de series existe.
- RF-052 es APP-02 «embebible»: SazónPOS abre la app de Administración (ADR-31), no embebe componentes.
- La subida del PFX no pasa por TR-ARC (es un secreto, ver emisor P3), pero el logo sí.

Preguntas candidatas, con recomendación:
1. **¿Lib nueva o `admin-cliente`?** Recomendación: lib feature nueva `libs/plataforma/admin-fe` (emisor, comprobantes) con rutas propias montadas desde `admin-cliente.routes.ts`; `admin-cliente` ya tiene 27 páginas. Series se queda en `admin-cliente` (es de SEQ).
2. **¿Quién paga la pantalla de series?** Recomendación: spec `seq-series-ui` como deuda de R1 (D-05), programado antes de FE o en el sprint 16 junto con el emisor. Sin él, «series FE» no tiene pantalla.
3. **¿Formulario del emisor en página o panel lateral?** Recomendación: página (pantalla tipo formulario) por la cantidad de campos y la prueba beta; el alta de serie sí en panel lateral (`PanelLateralService`), como manda `CLAUDE.md`.
4. **¿Cómo se sube el PFX?** Recomendación: `multipart` directo a `POST /v1/fe/emisores/{empresaId}/certificado` (no ARC), con validación de tamaño en el cliente y respuesta con RUC y vencimiento leídos del certificado.
5. **¿Crear series de notas desde esta pantalla?** Recomendación: al crear una serie B### o F### de comprobante, ofrecer crear las de NC y ND con el mismo código (ver `fe-notas-resumen-baja` P3).
