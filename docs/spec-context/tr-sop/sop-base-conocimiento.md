# Contexto para sop-base-conocimiento

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes), `3_plan.json`, `plan.md`, diagramas T-09, OP-01, OP-10, OP-13, código de `libs/plataforma/*` y `libs/shared/ui`.

## 1. Alcance y dependencias
- **Sin historia en el plan.** RF 118 es Should, fase SRS **R2**, y depende de **TR-IA** (embeddings), que es R4 (fuera del plan, backlog 2028). Ninguna fila de `3_plan.json` cita TR-RF-118.
- Lo usa RF 111 (paso 2: el widget sugiere artículos; TR-CA-272), que sí está en R3-08. Sin este paquete, el widget sale sin sugerencias.
- PL-10 no dibuja TR-IA. OP-13 pone «Problemas + GitHub + base de conocimiento» en la Fase 2 e «IA en soporte: clasificación y sugerencias» en la Fase 3.
- Partición propuesta (si se agrega al backlog):

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | sop-kb-articulos | 118 sin IA: artículos, publicación, votos y búsqueda por texto | 5-6 | sop-tickets-nucleo, 07 |
| b | sop-kb-sugerencias-ui | 118 + paso 2 de 111: editor en consola, sugerencias en widget y al agente | 5-6 | a, sop-widget-ui, sop-consola-bandeja-ui |
| c | sop-kb-semantica | 118 con embeddings y similitud | 4 | TR-IA (R4), b |

- Áreas de (a): agregado `ArticuloKb` y publicación; votos de utilidad; puerto `BuscadorArticulos` con adaptador de texto completo de PostgreSQL. (c) solo cambia el adaptador.
- Fuera de alcance: clasificación automática de tickets con IA (OP-13 Fase 3, sin RF); artículos para el portal del cliente final (TR-POR); traducción.
- Constitución: reglas 1-11; diseño UI (editor en panel lateral o página de formulario; lista con `vit-tabla`).

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-118 | Gestionar base de conocimiento con sugerencias | plat.soporte.kb | APP-01 | TR-RN-041 | TR-RNF-020, 115 | Agente de soporte (N1/N2), Usuario operativo |

- **118** precondición: el agente tiene rol de soporte. Flujo: crea o edita un artículo y lo publica; se calcula su embedding con TR-IA; al escribir un ticket el widget sugiere los 3 más similares; los usuarios votan si fue útil. Datos: `producto_codigo`, `modulo`, `titulo` (5-200), `contenido` (texto enriquecido), `publicado`, `util_si`, `util_no`, `embedding` (vector). Salida: artículos publicados y sugeridos con métricas. Relacionados: TR-SOP, TR-IA. La hoja RF marca «Sí» en la columna de IA.
- Paso 2 de **111**: el widget sugiere artículos relacionados (ver `sop-widget-tickets-comentarios.md`).

## 3. Criterios GWT
| ID | RF | Tipo | Escenario |
|---|---|---|---|
| TR-CA-287 | 118 | Positivo | Artículo publicado «Configurar impresora térmica»; usuario escribe «la ticketera no imprime» → el widget lo sugiere entre los 3 primeros |
| TR-CA-288 | 118 | Negativo | Artículo «Nueva función de propinas» en borrador; búsqueda «propinas» → no se sugiere |
| TR-CA-272 | 111 | Borde | Artículo sugerido resuelve la duda → no se crea ticket y suma un voto útil |

Nota: TR-CA-287 es semántico («ticketera» ≈ «impresora térmica»); con búsqueda por texto puede fallar salvo sinónimos (pregunta 2). Faltan (proponer): voto duplicado del mismo usuario; artículo de otro producto no se sugiere; el agente ve sugerencias mientras redacta; texto enviado a IA enmascarado (TR-RN-041, cuando exista c).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-041 | Todo texto a un proveedor de IA se enmascara (DNI, RUC de persona natural, nombres, teléfonos, correos); salidas con efectos exigen confirmación humana. |
| TR-RNF-115 | 0 DNI, teléfonos o correos en prompts registrados (muestreo de 1 000/mes). |
| TR-RNF-020 | Aprendizaje < 1 h. |

Heredados por CLAUDE.md: 001/002/003, 008 (voto idempotente por usuario y artículo), 010, 011, 012, 013, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
Sin historia. Relacionadas: R3-08 (widget, paso 2 de 111), R3-09 (OP-10: N1 «resuelve y documenta en la base de conocimiento»). TR-IA no tiene historias en el plan (R4).

## 6. Tablas SQL, eventos, puertos y permisos
- `sop.articulo_kb` (global; T-09 `ArticuloKb`): `id`, `producto_codigo`, `modulo`, `titulo`, `contenido` (HTML saneado o Markdown), `publicado`, `publicado_en`, `util_si`, `util_no`, `busqueda` (`tsvector` generado con configuración `spanish` y `unaccent`), `embedding` (`vector`, solo con c), `autor_id`, `version`.
- `sop.voto_articulo`: PK (`articulo_id`, `usuario_id`), `util` (bool), `tenant_id`, `creado_en`; RLS por tenant.
- `pgvector` en Supabase solo para la parte c (habilitar la extensión es una migración aparte).
- **Eventos**: ninguno en el SRS. Propuesto: `sop.articulo.publicado` (para recalcular el embedding en c).
- **Puertos**: `BuscadorArticulos` (`sugerir(texto, producto, limite = 3)`), adaptador `BuscadorArticulosTextoCompleto` (`websearch_to_tsquery` + `ts_rank`), luego `BuscadorArticulosSemantico` (TR-IA); `ArticulosRepositorio`; `EnmascaradorTexto` (dominio, TR-RN-041) antes de cualquier proveedor.
- **Permisos** (SRS): `plat.soporte.kb` (gestionar). Faltan: leer y votar artículos desde el widget (propuesta: incluido en `plat.soporte.crear_ticket`).
- **Endpoints** (propuestos): `GET /v1/sop/kb/sugerencias?texto=&producto=`, `POST /v1/sop/kb/articulos/{id}/voto`, CRUD `/v1/sop/kb/articulos` (agentes).
- **Migración**: `db/01?_sop_kb.sql` (después de `01?_sop.sql`).

## 7. Código base relacionado
- Búsqueda por texto existente: `db/01f_cat_items_busqueda.sql` (spec 19d) busca por coincidencia literal en código, nombre y atributos; no hay `tsvector` ni texto completo en el repo. Sirve de patrón de función SQL de búsqueda, no de ranking.
- Enmascarado y redacción: `libs/plataforma/observabilidad` (`CAMPOS_SENSIBLES`, `valorCensurado`) y `auditoria` (`CAMPOS_ENMASCARADOS`); sirven de base para el enmascarador de TR-RN-041.
- UI: `vit-tabla`, `PanelLateralService`, `vit-estado-vacio`. No hay editor de texto enriquecido en el repo.
- Falta: todo `sop`, TR-IA, editor.

## 8. Diagramas relevantes
- `01-analysis/.../8_Diseno_Piloto/2_Plataforma_Transversal/T-09_Modelo_de_dominio_Centro_de_soporte_y_observabilidad.mmd` (ArticuloKb).
- `01-analysis/.../6_Plataforma_Operacion/OP-10_Proceso_de_atencion_de_incidencias.mmd` (sugerencias con IA; N1 documenta).
- `01-analysis/.../6_Plataforma_Operacion/OP-01_Mapa_de_la_plataforma_de_operacion.mmd`, `OP-13_Hoja_de_ruta_de_la_plataforma_de_operacion.mmd` (Fase 2 KB, Fase 3 IA).

## 9. Ambigüedades y preguntas candidatas
1. ¿Entra en R3 sin TR-IA? Recomendación: sí la parte a (texto completo) si el usuario quiere sugerencias en el widget de R3-08; b y c fuera hasta tener TR-IA.
2. ¿TR-CA-287 sin semántica? Recomendación: campo `palabras_clave` por artículo (sinónimos: «ticketera», «impresora») que entra al `tsvector`; con eso pasa sin IA.
3. ¿Formato del contenido? Recomendación: Markdown guardado y renderizado saneado en el front; evita un editor enriquecido.
4. ¿Artículos por tenant? El SRS los define por producto y módulo. Recomendación: solo globales de plataforma.
5. ¿Voto sin ticket? Recomendación: voto por usuario y artículo, uno vigente (se puede cambiar); `util_si/util_no` se recalculan desde `sop.voto_articulo`.
6. Inconsistencia de fase: el SRS dice R2 y depende de TR-IA (R4). Recomendación: registrarlo en `roadmap-specs.md` como backlog sin fecha.
