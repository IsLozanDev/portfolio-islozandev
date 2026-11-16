# Contexto para ia-extraccion-rag

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores), `plan.md` (R4), `3_plan.json`, `01-analysis/.../2_Propuesta_IA/00_IA_Arquitectura/` (IA-ARQ-01, IA-ARQ-03) y casos por producto.

## 1. Alcance y dependencias
- Componente TR-IA (MOD-15), procesos TR-P13, TR-P10 (102) y TR-P07 (103). Dos capacidades distintas sobre la misma pasarela: extracción estructurada con revisión humana y base de conocimiento con citas.
- Release: plan **R4 (backlog 2028)**; el SRS marca 102 y 103 como Should/R2. Manda el plan.
- Historia del backlog: ninguna. Horas estimadas: 17-19 h en total.
- Dependencias: `ia-pasarela-y-enmascarado` (parte A de `ia-pasarela-enmascarado-consumo.md`), TR-ARC (archivo DISPONIBLE, RN-027; R2, sin implementar), CFG (spec 09: `umbral_similitud`), extensión `vector` (pgvector) en Supabase. La UI de revisión de campos es de cada producto; la de la base de conocimiento va en `admin-cliente`.
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| A | ia-extraccion-documental | 102 | 7-8 | pasarela, TR-ARC (R2) |
| B | ia-conocimiento-rag | 103 | 10 | pasarela, TR-ARC, 09, 17c (UI) |

- A, áreas: (a) OCR por puerto y armado del JSON contra el esquema del caso; (b) confianza por campo y estado PENDIENTE_REVISION → CONFIRMADO; (c) API para que el producto confirme o corrija.
- B, áreas: (a) indexador asíncrono en el worker (extraer, fragmentar, embeddings con `tenant_id`); (b) búsqueda por similitud filtrada por tenant con umbral y respuesta con citas o «No tengo esa información»; (c) UI mínima de documentos en `admin-cliente`.
- Fuera de alcance: agente conversacional que usa el RAG (`ia-agente-conversacional.md`), antivirus y URLs firmadas (TR-ARC), formularios de revisión dentro de cada producto (LIB, DOC, CLI), reindexado por cambio de modelo de embeddings, búsqueda híbrida (texto + vector).
- Constitución aplicable: 1, 2, 3 (doble barrera también en la búsqueda vectorial), 4, 5, 8, 10, 11 (SQL crudo justificado para el operador de distancia de pgvector); código limpio; diseño UI para B.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-102 | Extraer datos de documentos con revisión humana | plat.ia.extraer | APP-03 | TR-RN-041, 027 | TR-RNF-115, 030 | Módulo de producto, Usuario operativo, Proveedor de IA |
| TR-RF-103 | Indexar documentos y responder con citas (RAG) | plat.ia.conocimiento | APP-02 | TR-RN-041, 001 | TR-RNF-115, 010 | Admin del cliente, Cliente final / titular, Módulo de producto |

- **102** precondición: archivo DISPONIBLE en TR-ARC y caso de uso con esquema de salida. Flujo: solicita extracción con archivo y esquema → OCR, enmascara y pide JSON al modelo → valida contra el esquema y calcula confianza por campo → el usuario revisa los campos con confianza < 0,8 y confirma antes de registrar. Datos: archivo_id, esquema (JSON Schema), resultado (JSON), confianza_por_campo (0-1), confirmado_por, confirmado_en. Relacionados: TR-IA, TR-ARC.
- **103** precondición: servicio de IA habilitado en el plan. Flujo: el admin sube documentos → indexador extrae, fragmenta y calcula embeddings con tenant_id → búsqueda por similitud del tenant → si supera el umbral responde citando; si no, «no tiene la información» y ofrece derivar. Datos: documento_id; fragmentos (texto, embedding `vector(1024)`, tenant_id, pagina); pregunta (3-500); umbral_similitud (parámetro, defecto 0,75); respuesta; citas[] (documento, página). Relacionados: TR-IA, TR-ARC, TR-CFG.

## 3. Criterios GWT
- **TR-CA-249** (102, Positivo, «Factura de proveedor»): LibroPOS sube factura PDF | solicita extracción | RUC, serie, número, fecha, líneas y totales con su confianza.
- **TR-CA-250** (102, Borde, «Campo con baja confianza»): total con confianza 0,62 | el usuario revisa | resaltado y no se registra hasta confirmar o corregir.
- **TR-CA-251** (103, Positivo, «Respuesta del TUPA»): municipalidad indexó TUPA 2026 | ciudadano pregunta por licencia | lista requisitos y cita la página.
- **TR-CA-252** (103, Negativo, «Pregunta sin sustento»): sin información de estacionamiento | socio pregunta | «No tengo esa información» y ofrece contactar al personal.
- **TR-CA-253** (103, Negativo, «Aislamiento entre tenants»): tenant A indexó su reglamento | B pregunta algo similar | no devuelve fragmentos de A.

Faltan y se proponen: JSON del modelo que no cumple el esquema (reintento una vez y luego `EXTRACCION_INVALIDA`); archivo no DISPONIBLE (`ARCHIVO_NO_DISPONIBLE`); documento que falla al indexar queda en ERROR con motivo, sin fragmentos parciales; borrar un documento elimina sus fragmentos; pregunta fuera de 3-500 caracteres; el texto enviado al modelo para responder va enmascarado (RNF-115).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-041 | Enmascarar todo texto al proveedor; salidas con efecto requieren confirmación humana (102: nada se registra sin confirmar). |
| TR-RN-027 | Archivos con MIME permitido y tamaño máximo (docs 25 MB), SHA-256, antivirus antes de DISPONIBLE, URL firmada ≤ 15 min. |
| TR-RN-001 | Toda entidad lleva tenant_id; ninguna consulta cruza tenants (fragmentos incluidos). |
| TR-RNF-115 | 0 datos personales identificables en prompts registrados. |
| TR-RNF-030 | Acciones que afectan dinero, inventario o salud con advertencias claras (extracción de facturas antes de registrar compras). |
| TR-RNF-010 | Doble barrera de aislamiento; 0 accesos cruzados. |

Heredados por CLAUDE.md: 001/002/003, 007 (OCR y modelo con timeout y respaldo), 008, 011, 012, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog
Sin historia (R4). Relacionadas: TR-ARC (RF 080-083, R2) es prerrequisito y no tiene spec todavía; ver `docs/spec-context/tr-arc/` si existe.

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta: `db/04a_ia_*.sql` (mismo rango que la pasarela; p. ej. `04a_ia_extraccion.sql`, `04a_ia_conocimiento.sql`).
- `ia.extraccion` (id, tenant_id, caso_uso, archivo_id, estado PENDIENTE|PENDIENTE_REVISION|CONFIRMADA|RECHAZADA|ERROR, resultado jsonb, confianza jsonb, confirmado_por, confirmado_en, version). RLS. `resultado` puede tener datos personales (factura de persona natural): no se loguea y se cifra o se expira según P4.
- `ia.documento_conocimiento` (id, tenant_id, archivo_id, titulo, estado PENDIENTE|INDEXADO|ERROR, paginas, modelo_embedding, indexado_en, version).
- `ia.fragmento` (id, tenant_id, documento_id, pagina, orden, texto, embedding `vector(1024)`). Índice HNSW sobre `embedding` y filtro por `tenant_id` (índice compuesto o partición por tenant: ver P2). RLS `ENABLE + FORCE`.
- **Eventos**: `ia.documento_indexado`, `ia.extraccion_confirmada` (nombres propuestos; el SRS no define eventos de TR-IA).
- **Puertos**: `ExtractorTexto` (OCR; adaptador por proveedor), `GeneradorEmbeddings`, `BuscadorFragmentos` (SQL crudo encapsulado: `ORDER BY embedding <=> $1` con `tenant_id = current_setting(...)`), `IaPort` de la pasarela, `ArchivoPort` de TR-ARC (lectura del contenido).
- **Permisos**: `plat.ia.extraer` (interno, productos), `plat.ia.conocimiento` (admin cliente: subir, listar, borrar documentos). Proponer `plat.ia.preguntar` si la pregunta la hace el cliente final por el portal (TR-POR).
- Nx: `comp:ia`; el indexador corre en `apps/worker` (BullMQ), como el importador del 19b.

## 7. Código base relacionado
- **No existe** código de IA, archivos ni vectores en el repo. No hay `vector` en `db/`.
- **Se reutiliza**: patrón de tarea larga en el worker con avance (19b: importador con BullMQ y SSE, `libs/plataforma/catalogos/src/application/importacion/`); `eventos` (`SuscribirEvento` si el indexado se dispara por `archivo.disponible`); `kernel-infra` (`TypeOrmUnitOfWork`, `OutboxPublisher`); `parametros` (`PARAMETRO_PORT` para `umbral_similitud`); `shared/ui` (`vit-tabla`, `vit-estado-vacio`, `PanelLateralService`) para la UI de B.
- **Falta**: TR-ARC completo, lib `ia`, extensión `vector` habilitada en los tres proyectos Supabase, adaptadores OCR y embeddings.

## 8. Diagramas relevantes
- `01-analysis/.../2_Propuesta_IA/00_IA_Arquitectura/IA-ARQ-03_Recuperacion_de_conocimiento_RAG_con_datos_de_cada_cliente.mmd` (secuencia completa de 103).
- `.../IA-ARQ-01_Arquitectura_del_Servicio_de_IA_de_la_plataforma.mmd` (RAG sobre PostgreSQL + pgvector).
- Extracción por producto: `.../04_LIB_LibroPOS_IA/LIB-IA-P01_Lista_escolar_por_foto_con_IA.mmd`, `.../01_REST_SazonPOS_IA/REST-IA-P02_Compra_planificada_con_pronostico_y_lectura_de_factura.mmd`, `.../07_DOC_DocuFlujo_IA/DOC-IA-P01_*.mmd`.
- RAG por producto: `.../03_COL_TurnoFacil_IA/COL-IA-P01_Orientacion_y_emision_de_ticket_con_IA.mmd`.

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- `vector(1024)` fija la dimensión; depende del modelo de embeddings elegido.
- «Confianza por campo» no viene de todos los modelos; hay que definir cómo se calcula.
- 103 nombra al «cliente final» como actor, pero la app es APP-02; la pregunta pública llega por el agente (105) o el portal (TR-POR, R3).
- 102 depende de TR-ARC (R2), que no tiene spec.

Preguntas, con recomendación:
1. ¿Modelo de embeddings y dimensión? Recomendación: fijar el modelo en el caso de uso y guardar `modelo_embedding` por documento; dimensión según ese modelo (1024 si se mantiene el SRS). Cambiar de modelo obliga a reindexar.
2. ¿Aislamiento vectorial? Recomendación: una tabla con `tenant_id`, RLS `FORCE` y filtro explícito en la consulta (doble barrera); índice HNSW global con filtro, y medir; particionar por tenant solo si la medición lo pide.
3. ¿Confianza por campo? Recomendación: combinar validación del esquema, presencia del valor en el texto OCR y, si el proveedor la da, probabilidad de tokens; umbral 0,8 como constante con nombre por caso de uso.
4. ¿Cuánto vive el resultado de la extracción? Recomendación: hasta confirmar o 30 días; tras confirmar, el producto guarda lo suyo y la plataforma borra `resultado` (proporcionalidad, RN-032).
5. ¿Sin TR-ARC? Recomendación: no empezar 102/103 hasta tener TR-ARC (archivo DISPONIBLE con antivirus); no crear un almacenamiento paralelo.
6. ¿Formato de citas? Recomendación: `citas[] = {documento_id, titulo, pagina}` en la respuesta; la instrucción exige citar y la pasarela rechaza respuestas sin cita cuando hubo fragmentos.
