# Contexto para arc-subida-versiones-url-firmada

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores, Matriz Proceso-RF), `3_plan.json` (R2-03), plan (árbol `archivos/`, costos de Supabase Storage, sec. 5.1), diagramas T-07, PL-10, código real en `libs/` y `apps/`. Ruta de planes P = `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`; diagramas D = `01-analysis/component-transversal/Vitrina_Productos_Todos_los_Mermaid/`.

## 1. Alcance y dependencias
- Historia R2-03 (sprint 13, 6 h, Back, R2): "Archivos: subida validada, versiones y URL firmada" (RF 080, 081, 082). Más el componente `<ui-archivo-carga>` (hoja Componentes), sin historia.
- Lib nueva `libs/plataforma/archivos` (árbol del plan: "TR-ARC · Supabase Storage con URL firmadas"), tags `scope:plataforma`, `type:backend`, `comp:arc`. Esquema `arc`. Supabase Storage solo en `infrastructure/supabase` (regla 2); la secret key solo en `apps/api` y `apps/worker` (regla 9).
- PL-10: `ARC --> FE` (los XML y CDR de comprobantes, R2-05) y `ARC --> CMS` (R3). ARC solo depende de kernel, SEG, AUD y EVT. Consumidores declarados: los 9 productos (hoja Consumidores); en la plataforma, TR-PER (evidencia de consentimiento), TR-CAT (importación, hoy en memoria), TR-SOP (adjuntos, R3).
- Partición propuesta (R2-03 da 6 h; no alcanza con capa HTTP, análisis en worker y UI):

| Spec | Slug | RF | h | Áreas | Depende de |
|---|---|---|---|---|---|
| A | arc-carga-descarga | 080, 082 | 9 | (a) DDL `arc` + dominio `Archivo`/`VersionArchivo` + puerto `AlmacenArchivos` (adaptador Supabase); (b) carga con URL firmada, confirmación y análisis en el worker (hash, tipo real, `AnalizadorAntivirus`) -> DISPONIBLE o CUARENTENA + `archivo.disponible`; (c) descarga con URL firmada <= 15 min y acceso sensible auditado | 07, 11, 20a, 21 |
| B | arc-antivirus | 080 (TR-RNF-114) | 4 | adaptador real del antivirus (P2) en el worker, prueba EICAR | A |
| C | arc-versiones | 081 | 4 | nueva versión con la misma validación, rechazo por hash idéntico, listar y marcar vigente | A |
| D | arc-ui-archivo-carga | UI de 080-082 | 7 | (a) lib `archivos-ui` con `<ui-archivo-carga>` (arrastrar, progreso, estado de análisis); (b) lista de versiones; (c) descarga | A, C, 13, 15b/15c/15d |

- Fuera de alcance: retención, bloqueo legal y expiración de exportaciones (RF-083, paquete `arc-retencion-bloqueo-legal.md`); OCR o extracción con IA (RF-102, R4); transformación de imágenes; CMS (R3); mover el importador de catálogos (spec 19b, multipart en memoria) a ARC.
- Constitución aplicable: reglas 1-11 (la 8 con matiz: el navegador sube y baja directo a Storage con URL firmada emitida por la API, P5); código limpio; estructura de libs Angular y diseño UI (D); verificación con Playwright (D); DoD.

## 2. RF
Módulo MOD-11 (TR-ARC), proceso TR-P11 (080 también TR-P07), fase MVP en SRS, R2 en el plan.

| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-080 | Subir archivo validado | plat.archivo.subir | APP-03 | TR-RN-027, 001 | TR-RNF-114, 011 | Módulo de producto, usuario operativo |
| TR-RF-081 | Versionar archivo | plat.archivo.versionar | APP-03 | TR-RN-027 | TR-RNF-114, 013 | Módulo de producto, usuario operativo |
| TR-RF-082 | Descargar archivo con URL firmada | plat.archivo.descargar | APP-03 | TR-RN-027, 028 | TR-RNF-114, 010 | Módulo de producto, usuario operativo, titular |

- **080** Must. Precondición: el producto define la categoría y el permiso de la entidad. Flujo: pide URL firmada de carga (categoría, nombre, tamaño) -> sube directo al almacenamiento -> el sistema calcula hash, verifica el tipo real y lo envía al antivirus -> limpio: DISPONIBLE y `archivo.disponible`; si no, cuarentena. Datos: `categoria` (IMAGEN|DOCUMENTO|CPE_XML|EVIDENCIA|ADJUNTO_SOPORTE), `nombre_original` (1-255), `tamano` (TR-RN-027), `mime` (lista permitida), `entidad_tipo`, `entidad_id`, `hash_sha256` (64 hex). Componentes: TR-ARC, TR-EVT.
- **081** Should. Precondición: el archivo existe y el actor puede editar la entidad. Flujo: sube nueva versión -> misma validación -> incrementa versión conservando las anteriores -> listar y marcar una anterior como vigente. Datos: `archivo_id`, `version`, `hash_sha256`, `subido_por`, `subido_en`, `vigente`. Componentes: TR-ARC, TR-AUD.
- **082** Must. Precondición: archivo DISPONIBLE. Flujo: pide descarga -> verifica tenant, permiso sobre la entidad y estado -> URL firmada con expiración -> si la categoría es sensible registra el acceso en TR-AUD. Datos: `archivo_id`, `version` opcional, `vigencia_segundos` (<= 900), `disposicion` (inline|attachment). Salida: URL temporal o 403. Componentes: TR-ARC, TR-SEG, TR-AUD.
- Interfaz (hoja Componentes, 23 RF usan TR-ARC): `ArchivoPort` (URL firmada de carga, versión, URL firmada de descarga, retención); evento `archivo.disponible`; `<ui-archivo-carga>`.

## 3. Criterios GWT
| ID | RF | Tipo | Escenario |
|---|---|---|---|
| TR-CA-199 | 080 | Positivo | PDF de 1,2 MB al paciente: DISPONIBLE con su hash y asociado |
| TR-CA-200 | 080 | Negativo | DOCUMENTO permite PDF, DOCX y JPG; un .exe renombrado a .pdf se detecta por tipo real y se rechaza |
| TR-CA-201 | 080 | Borde | Firma EICAR: CUARENTENA, no se puede descargar |
| TR-CA-202 | 081 | Positivo | Contrato LEX-2026-045 en versión 2: la corregida queda en 3 y 1 y 2 siguen disponibles |
| TR-CA-203 | 081 | Borde | Mismo hash que la vigente: «El archivo es idéntico a la versión vigente», sin versión nueva |
| TR-CA-204 | 082 | Positivo | Psicólogo con permiso: URL válida 15 min y acceso registrado |
| TR-CA-205 | 082 | Negativo | Archivo del tenant B pedido desde A: 404 sin revelar existencia |
| TR-CA-206 | 082 | Borde | URL de hace 16 min: el almacenamiento responde acceso expirado |

Estado SRS: Pendiente. TR-CA-204 usa un producto R3 (PsicoAgenda): probar con una entidad de prueba registrada como sensible. TR-CA-206 se prueba contra Supabase Storage real (solo CI/staging, sin Docker de Supabase local) o con reloj del adaptador falso. Faltan y se proponen: tamaño por encima del límite de la categoría (imagen 10 MB, documento 25 MB) rechazado al pedir la URL; URL de carga no usada no deja archivo DISPONIBLE (huérfano limpiado, P4); confirmar una carga cuyo tamaño real no coincide; descarga de un archivo PENDIENTE de análisis -> 409; versión vigente marcada desde una anterior; UI en claro, oscuro y 600 px.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-027 | MIME permitido por categoría; tamaño máx. imágenes 10 MB, documentos 25 MB; SHA-256; antivirus antes de quedar disponible; descarga por URL firmada de máx. 15 min. |
| TR-RN-028 | Auditoría inmutable (accesos sensibles y versiones). |
| TR-RN-001 | Ruta y metadatos por tenant; nada cruza tenants. |
| TR-RNF-114 | 100 % de archivos escaneados; URL firmada <= 15 min; EICAR bloqueado. |
| TR-RNF-011 | Cifrado en tránsito y en reposo (Storage) y secretos en gestor. |
| TR-RNF-010 | Doble barrera; 0 accesos cruzados (TR-CA-205). |
| TR-RNF-013 | Versiones y accesos sensibles auditados. |

Heredados por CLAUDE.md: 001/002/003, 008 (confirmación idempotente), 012, 024/119, 025, 026, 101, 106, 112.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | RF | Tipo | Release |
|---|---|---|---|---|---|---|
| R2-03 | 13 | 6 | TR-ARC | TR-RF-080, 081, 082 | Back | R2 |

Relacionadas: R2-05/R2-06 (FE: XML, CDR y PDF del comprobante como archivos), R2-01 (evidencia de consentimiento), R3-05/06 (CMS, galería), R3-08 (adjuntos de soporte). Costos (plan 10.3): Supabase Pro incluye Storage de producción; dev y staging en Free.

## 6. Tablas SQL, eventos, puertos y permisos
- Migraciones propuestas: `db/01l_arc.sql` (+ rollback y test) para el esquema `arc`; `supabase/migrations/<fecha>_arc_storage.sql` (+ rollback) para crear el bucket privado y sus límites (lo de Supabase va en `supabase/migrations`, regla 6).
- Tablas (T-07: `Archivo` agregado, `VersionArchivo` entidad; sin DDL en `codigo/`):
  - `arc.categoria`: `codigo` PK, `mimes_permitidos` text[], `tamano_max_bytes`, `sensible` bool. Siembra con las 5 categorías del RF-080 (P1).
  - `arc.archivo`: `id`, `tenant_id`, `categoria`, `entidad_tipo`, `entidad_id`, `nombre_original`, `estado` (PENDIENTE_CARGA|EN_ANALISIS|DISPONIBLE|CUARENTENA|RECHAZADO), `version_vigente`, `version` (bloqueo optimista), `creado_por`, `creado_en`.
  - `arc.version_archivo`: PK `(archivo_id, numero)`, `tenant_id`, `ruta_storage` (`{tenant_id}/{archivo_id}/{numero}`), `hash_sha256`, `bytes`, `mime_real`, `estado_analisis`, `subido_por`, `subido_en`; único `(archivo_id, hash_sha256)` para TR-CA-203.
  - RLS por `app.tenant_id`; REVOKE a `anon, authenticated` en `arc`; bucket privado sin políticas para `anon/authenticated` (todo pasa por URL firmada).
- Eventos: `archivo.disponible` (SRS). Proponer `archivo.en_cuarentena` y `archivo.version_creada` (no están en el SRS).
- Puertos: provee `ArchivoPort` (`solicitarCarga`, `confirmarCarga`, `nuevaVersion`, `urlDescarga`, `estado`). Internos: `AlmacenArchivos` (Supabase Storage: URL firmada de carga y de descarga, leer bytes, borrar), `AnalizadorAntivirus`, `DetectorTipo` (bytes mágicos), `AutorizadorEntidad` por `entidad_tipo` (los productos registran el suyo, patrón `VERIFICADORES_REFERENCIAS` de CAT, P3). Consume `AuditoriaPort.registrarAccesoSensible`.
- Análisis asíncrono: cola BullMQ en `apps/worker` (patrón `importaciones/` del spec 19b); el worker descarga, hashea, detecta tipo, escanea y cambia el estado.
- Permisos (SRS): `plat.archivo.subir`, `plat.archivo.versionar`, `plat.archivo.descargar`. Alta en `plat.manifiesto.json`.
- Endpoints propuestos: `POST /v1/archivos/cargas` (devuelve `archivo_id` + URL firmada de carga), `POST /v1/archivos/{id}/confirmar`, `POST /v1/archivos/{id}/versiones`, `GET /v1/archivos/{id}/versiones`, `PATCH /v1/archivos/{id}/version-vigente`, `GET /v1/archivos/{id}/descarga?version&disposicion`.

## 7. Código base relacionado
- No existe `libs/plataforma/archivos` ni uso de Supabase Storage en el repo. El único manejo de archivos es el importador de catálogos: `libs/plataforma/catalogos/src/interface/importaciones.controller.ts` (multer `memoryStorage`, 20 MB, nada a disco) y `db/01f_cat_importacion.sql` (`archivo_nombre`, `archivo_sha256`): patrón de hash y validación (`domain/importacion/validacion-archivo.ts`, `application/importacion/validar-archivo.ts`).
- `apps/worker/src/importaciones/`: cola BullMQ y procesador (`abrirColaImportaciones`, `crearProcesarImportacion` exportados por `catalogos`): patrón para la cola de análisis.
- `libs/plataforma/auditoria`: `AuditoriaPort.registrarAccesoSensible` con `TIPOS_RECURSO_SENSIBLE` (`HISTORIA_CLINICA, NOTA_SESION, EXPEDIENTE, DATOS_PORTABLES`) y `FINALIDADES`; no hay tipo para "archivo" (P6).
- `libs/plataforma/admin-cliente/src/lib/utils/descarga.ts` y `error-de-blob.ts`: descarga de blobs en el front (exportaciones 18b/20b), reutilizable en `archivos-ui`.
- `libs/shared/ui`: `vit-estado-vacio`, `vit-cargando`, `vit-chip-estado` (tonos para DISPONIBLE/EN_ANALISIS/CUARENTENA), `vit-tabla`.
- Memoria del proyecto: sin Docker de Supabase/Postgres en local; Storage real solo en Supabase Cloud dev y CI. Las pruebas locales usan un `AlmacenArchivos` en memoria.
- `codigo/` de P: nada de archivos.

## 8. Diagramas relevantes
- D/`8_Diseno_Piloto/2_Plataforma_Transversal/T-07_Modelo_de_dominio_Notificaciones_archivos_auditoria_y_eventos.mmd` (Archivo, VersionArchivo)
- P/`1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd` (`ARC --> FE`, `ARC --> CMS`)
- P/`1_Mermaid/PL-09_Ambientes_y_flujo_de_entrega.mmd` (un proyecto Supabase por ambiente: un bucket por ambiente)
- P/`1_Mermaid/PL-03_Autenticacion_con_Supabase_Auth_y_autorizacion_propia.mmd`

## 9. Ambigüedades y preguntas candidatas
1. Lista de MIME por categoría: el SRS solo da el ejemplo de DOCUMENTO (PDF, DOCX, JPG). Recomendación: tabla `arc.categoria` sembrada: IMAGEN (jpeg, png, webp; 10 MB), DOCUMENTO (pdf, docx, jpeg; 25 MB), CPE_XML (xml, zip; 25 MB), EVIDENCIA (pdf, jpeg, png; 25 MB), ADJUNTO_SOPORTE (pdf, jpeg, png, txt; 25 MB); el producto no puede inventar categorías en R2.
2. ¿Qué antivirus? Ninguna fuente lo fija. Recomendación: ClamAV (`clamd` por TCP) como servicio junto al worker en staging/prod, detrás de `AnalizadorAntivirus`; en dev y CI un adaptador que detecta la firma EICAR. Spec B aparte para no bloquear A.
3. "Permiso sobre la entidad asociada": ARC no conoce permisos de producto. Recomendación: `AutorizadorEntidad` registrado por cada producto por `entidad_tipo`; si no hay autorizador para el tipo, solo el permiso `plat.archivo.*` y el tenant. 404 (no 403) cuando el archivo no es del tenant (TR-CA-205).
4. ¿Cómo sabe la API que la carga terminó? Recomendación: el cliente llama `confirmar` (idempotente) y el worker verifica existencia y tamaño en Storage; tarea diaria que borra cargas PENDIENTE_CARGA de más de 24 h.
5. Regla 8 ("los frontends solo hablan con la API NestJS") frente a carga directa a Storage. Recomendación: permitido como excepción declarada: la URL firmada la emite la API, es de un solo objeto, de corta vigencia y el bucket es privado; documentarlo en el spec.
6. Acceso sensible de archivos: `registrarAccesoSensible` exige `TipoRecursoSensible` (sin "ARCHIVO") y `persona_titular_id`. Recomendación: usar `AuditoriaPort.registrar` con acción `plat.archivo.descargar` para categorías sensibles y dejar `registrarAccesoSensible` a los productos que conocen al titular; o ampliar `TIPOS_RECURSO_SENSIBLE` con `ARCHIVO` en un cambio pequeño de AUD.
7. Vigencia de la URL de carga. Recomendación: verificar en context7 la vigencia que admite `createSignedUploadUrl` de Supabase Storage y el límite de tamaño por bucket; si no es configurable, la vigencia efectiva la controla la confirmación.
8. ¿Dónde vive `<ui-archivo-carga>`? Recomendación: `libs/plataforma/archivos-ui` (`type:ui`, como `catalogos-ui`); `shared/ui` no puede llamar a la API de plataforma.
