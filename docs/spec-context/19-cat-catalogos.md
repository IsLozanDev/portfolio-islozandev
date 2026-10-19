# Contexto para SPEC 19 · cat-catalogos

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, `docs/spec-context/02-supabase-y-kernel.md` (formato), SRS xlsx (hojas RF, Criterios GWT, Reglas de negocio, RNF, Procesos, Componentes, Consumidores), `3_plan.json`, `2_Estructura/`, `1_Mermaid/`, `codigo/`, docx del plan. Ruta de planes: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.

## 0. Partición propuesta (el spec 19 supera el tope: 14 h > 10 h)
D-03 (7) + D-04 (4) + D-06 (3) = 14 h. Se parte en 2 specs de 7 h (a futuro 19 y 20 en la numeración de `/spec`; la hoja de ruta tendrá que renumerar o usar 19a/19b).

| Parte | Slug | Historias | RF | h | Depende de |
|---|---|---|---|---|---|
| 19a | cat-catalogos-nucleo | D-03 (back) | TR-RF-022 a 027 | 7 | 07 (permisos, guard); transitivamente 02 (kernel, outbox) y 03 (tenant) |
| 19b | cat-tablas-oficiales-feriados-consola | D-04 (back) + D-06 (front consola) + UI de ítems propios/personalización (parte de D-05) | TR-RF-028, 029; UI de 022/023 (D-06); UI de 025/026 (D-05) | 7 (+~2 si se asigna la parte de D-05, ver P3) | 19a, 09 (parámetro `sabado_habil`), 15 (shell/UI), 13 (cliente auth); 20 (auditoría) deseable |

Fundamento:
- 19a es el núcleo transaccional: modelo, versionado, caché/ETag, puerto de validación. Un solo componente, tres áreas: (a) DDL + dominio + repositorio, (b) API REST + caché Redis + evento, (c) `CatalogoPort`.
- 19b agrupa lo que tiene dependencias externas distintas: importador de tablas oficiales (CSV/XLSX, TR-ARC/TR-AUD), feriados y días hábiles (necesita TR-CFG) y la UI (necesita shell del spec 15). Así 19a no espera a 09 ni a 15 y puede ir en la ola 5/6 pronto.
- Alternativa descartada: partir "propios del tenant" vs "SUNAT y feriados" (propuesta del roadmap) deja D-06 sin dueño claro; en esa partición D-06 va con la parte SUNAT/feriados (como arriba) porque ambos son consola de plataforma. La parte de D-03 (RF-025/026 back) queda en 19a de todos modos, porque el modelo MIXTO la necesita.
- Spec 25 (sazonpos-catalogos-eventos, CC-04) depende de "19": debe pasar a depender de 19a y, para cargar maestros SUNAT, de 19b.
- Orden: 19a antes de 19b. Ola 6 del roadmap trae 15 y 19 juntos; con la partición, 19a puede ir en ola 5 (solo necesita 07) y 19b en ola 6 tras 15 y 09.

## 1. Alcance y dependencias
- Roadmap: spec 19 `cat-catalogos` cubre D-03, D-04, D-06 (RF 022-029), 14 h estimadas, depende de 07. Línea 41 del roadmap ya anticipa la partición ("catálogos propios, tablas SUNAT y feriados").
- Sprint 6 (D-03, D-04) y 7 (D-06), release R1. Lib `libs/plataforma/catalogos` (TR-CAT); front `libs/plataforma/consola-catalogos` (solo consola) y `admin-cliente/.../catalogos/`.
- PL-10: SEG -> CFG, SEQ, CAT, AUD; CAT -> PER -> IDN; SEQ, CAT, PER -> FE. CAT en R1 no depende de CFG en el diagrama, pero RF-029 sí usa TR-CFG (`sabado_habil`) según el SRS (hoja Componentes del RF): dependencia real que PL-10 no muestra.
- Consumidores (hoja Consumidores): 9 sistemas (REST, PSI, COL, LIB, GYM, CLI, DOC, ECO consumen; LEX evalúa). Forma: API `GET /v1/catalogos/{codigo}/items` + `CatalogoPort.validarItem()` + componente Angular `<ui-catalogo-select>`.
- Proceso TR-P03 (Gestión de catálogos y parámetros), módulo MOD-03, 20 RF según la hoja Componentes (en MOD-03 hay 8: 022-029).
- Constitución aplicable (CLAUDE.md): reglas 1, 2, 3, 4, 5, 6, 8, 10; DoD completo.
- Fuera de alcance: parámetros TR-CFG (spec 09), series TR-SEQ (10), outbox/relay (02/11), auditoría (20), archivos TR-ARC (R2), maestros de SazónPOS CC-04 (spec 25), `<ui-catalogo-select>` (sin historia ni RF propios, ver P6).

## 2. RF
| ID | Nombre | Permiso | Prior. | App | Parte |
|---|---|---|---|---|---|
| TR-RF-022 | Administrar catálogos globales | plat.catalogo.gestionar | Must | APP-01 Consola | 19a back / 19b UI |
| TR-RF-023 | Administrar ítems de catálogo con vigencia | plat.catalogo.item_gestionar | Must | APP-01 | 19a back / 19b UI |
| TR-RF-024 | Consultar ítems de catálogo con caché | plat.catalogo.leer | Must | APP-03 API | 19a |
| TR-RF-025 | Personalizar ítems globales por tenant | plat.catalogo.personalizar | Should | APP-02 Admin cliente | 19a back / 19b UI |
| TR-RF-026 | Registrar ítems propios del tenant | plat.catalogo.item_propio | Must | APP-02 | 19a back / 19b UI |
| TR-RF-027 | Validar valor contra catálogo | plat.catalogo.leer | Must | APP-03 | 19a |
| TR-RF-028 | Importar tablas maestras oficiales | plat.catalogo.importar | Must | APP-01 | 19b |
| TR-RF-029 | Gestionar feriados y calcular días hábiles | plat.feriado.gestionar | Must | APP-02 | 19b |

Todos Fase MVP, sin IA, módulo MOD-03. Detalle:
- **022**: campos `codigo` (3-60, mayúsculas y `_`, único), `nombre` (3-150), `alcance` (GLOBAL|TENANT|MIXTO), `fuente` (0-150), `editable_por_tenant`, `version` (autoincremental). Flujo: valida unicidad y coherencia alcance/editable; guarda, incrementa versión, publica `catalogo.actualizado`, invalida caché Redis. Regla TR-RN-012. RNF 102, 027. Procesos TR-P03. Actor: admin de plataforma.
- **023**: ítem con `codigo` (1-40), `codigo_externo` (0-40), `nombre` (1-200), `abreviatura` (0-30), `orden`, `atributos` (JSON: longitud, regex, valida_reniec, mascara), `vigente_desde`, `vigente_hasta` (opcional >= desde), `activo`. Unicidad por catálogo y tenant (TR-RN-013). Eliminar ítem referenciado ofrece cerrar vigencia. Incrementa versión e invalida caché. RNF 102, 021. Actores: admin plataforma y admin cliente.
- **024**: `GET /v1/catalogos/{codigo}/items`; ítems vigentes y visibles del tenant (globales + propios con ajustes), `If-None-Match`/ETag/304; clave Redis `cat:{codigo}:{tenant}:{version}`; si falta ejecuta `cat.items` y guarda con TTL. Respuesta: `item_id, codigo, codigo_externo, nombre (alias si existe), atributos, orden`. RNF 102, 002.
- **025**: ocultar, reordenar, renombrar (alias) ítems globales de catálogos MIXTO en `cat.catalogo_item_tenant` (`item_id, visible, orden, alias`); invalida caché del tenant. RNF 027, 102.
- **026**: ítems propios en catálogos MIXTO o TENANT; rechaza código que coincida con global o propio; guarda con `tenant_id` del contexto. TR-RN-012, 013. RNF 027, 010.
- **027**: puerto `CatalogoPort.validarItem(catalogo, codigo)` -> `{valido, motivo (inexistente, inactivo, fuera de vigencia, oculto), atributos}`; lee de caché. Procesos TR-P03 y TR-P10. RNF 102, 012.
- **028**: importar UBIGEO, CIE10, TIPO_COMPROBANTE, UNIDAD_MEDIDA, TIPO_DOC_IDENTIDAD, AFECTACION_IGV, MONEDA desde CSV/XLSX <= 20 MB, UTF-8, con previsualización de altas/cambios/bajas; aplica en una transacción, cierra vigencias de bajas, publica `catalogo.actualizado`. Campos: `tabla`, `archivo`, `version_oficial`, `fecha_vigencia`. Componentes: TR-CAT, TR-ARC, TR-EVT, TR-AUD. Reglas TR-RN-012, 013, 027. RNF 017, 013.
- **029**: feriados GLOBAL/TENANT/SUCURSAL (`fecha, nombre 3-100, alcance, sucursal_id, recurrente_anual`) y `CalendarioPort.sumarDiasHabiles(fecha, n, sucursal)`; parámetro BOOLEANO `sabado_habil`. Reglas TR-RN-012, TR-RN-014 (resolución de parámetros). Procesos TR-P03, TR-P11. Componentes TR-CAT, TR-CFG. RNF 027, 002. El catálogo FERIADO es MIXTO. El SRS menciona "contar días hábiles" en la descripción, pero el flujo solo define `sumarDiasHabiles`.

## 3. Criterios GWT
- **TR-RF-022**: TR-CA-058 (Positivo, MEDIO_PAGO MIXTO queda en versión 1); TR-CA-059 (Negativo, GLOBAL normativo no puede ser editable por el tenant, mensaje «Un catálogo normativo global no puede ser editable por el tenant»).
- **TR-RF-023**: TR-CA-060 (Positivo, ítem DNI con atributos longitud 8 y regex); TR-CA-061 (Negativo, ítem referenciado «Yape» no se elimina, se ofrece cerrar vigencia); TR-CA-062 (Borde, vigencia futura desde 01/01/2027 no aparece el 10/10/2026).
- **TR-RF-024**: TR-CA-063 (Positivo, incluye globales + «Tarjeta Diners» propio); TR-CA-064 (Positivo, If-None-Match igual -> 304 sin cuerpo); TR-CA-065 (Negativo, 404 `CATALOGO_NO_EXISTE`).
- **TR-RF-025**: TR-CA-066 (Positivo, ocultar «Plin» solo para el tenant); TR-CA-067 (Negativo, TIPO_COMPROBANTE GLOBAL no editable: sin opciones de personalización).
- **TR-RF-026**: TR-CA-068 (Positivo, especialidad propia visible solo para la clínica); TR-CA-069 (Negativo, código «MED_GEN» colisiona con global: «El código ya existe en el catálogo»).
- **TR-RF-027**: TR-CA-070 (Positivo, DNI válido con longitud 8); TR-CA-071 (Negativo, ítem oculto -> inválido, motivo OCULTO).
- **TR-RF-028**: TR-CA-072 (Positivo, UBIGEO 1 874 -> 1 892, resumen 18 altas); TR-CA-073 (Negativo, falta columna `descripcion` en CIE10); TR-CA-074 (Borde, distrito 150199 referenciado por 3 personas se cierra con `vigente_hasta`).
- **TR-RF-029**: TR-CA-075 (Positivo, 3 días hábiles desde 07/10/2026 con feriado 08/10 -> 12/10/2026); TR-CA-076 (Positivo, feriado propio de sucursal «Cusco» solo para ella); TR-CA-077 (Negativo, feriado duplicado: «La fecha ya está registrada como feriado»).
- Total 20 criterios (2+3+3+2+2+2+3+3). Estado de prueba en el SRS: Pendiente. TR-CA-075 y TR-CA-074 usan datos que no existen aún (personas son R2): la prueba de 074 debe simular la referencia.
- Observación: 075 usa el 08/10/2026 (Combate de Angamos) y el plan no lo incluye en su lista de feriados (solo desde 08/12/2026).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-012 | GLOBAL normativos (SUNAT, INEI, ISO) no editables por el tenant; MIXTO admiten ítems propios y ajustes (ocultar, reordenar, alias); TENANT íntegros del cliente. |
| TR-RN-013 | Ítem referenciado no se elimina: se inactiva o cierra vigencia; código único por catálogo y tenant. |
| TR-RN-014 | Parámetro efectivo: sucursal -> empresa -> tenant -> defecto; no se admite valor más específico que el alcance máximo (es de CFG; RF-029 lo usa para `sabado_habil`). |
| TR-RN-027 | Archivos con MIME permitido y tamaño máximo (imágenes 10 MB, documentos 25 MB), SHA-256, antivirus, URL firmada <= 15 min (es de TR-ARC; RF-028 lo cita). |
| TR-RNF-102 | Propio MOD-03: consulta de catálogo desde caché con ETag y 304; p95 < 50 ms en caché; >= 90 % de 304 en navegación repetida; verificación por trazas OTel y métricas de caché. |
| TR-RNF-002 | Consultas y listados p95 < 1,5 s con hasta 100 000 registros por tenant. |
| TR-RNF-010 | Aislamiento por tenant, doble barrera (contexto + RLS); 0 accesos cruzados. |
| TR-RNF-012 | OWASP ASVS nivel 2; validación de entradas en servidor (aplica sobre todo a la importación). |
| TR-RNF-013 | Auditoría inmutable de operaciones críticas (importación, cambio de catálogos globales). |
| TR-RNF-017 | Conformidad con catálogos oficiales SUNAT (UBL 2.1). Aplica a la exactitud de los catálogos 01, 03, 06, 07 importados. |
| TR-RNF-021 | Confirmación y motivo en acciones destructivas (cierre de vigencia, baja). |
| TR-RNF-027 | Configuración por tenant (catálogos propios) sin cambios de código. |

Heredados por CLAUDE.md: 008, 011, 024/119, 025 (cobertura dominio >= 70 %), 026, 101, 106 (outbox).
En el SRS los RNF se llaman `TR-RNF-xxx`.

## 5. Historias del backlog (3_plan.json)
| ID | Sprint | Horas | Descripción | rf | Tipo / componente | Parte |
|---|---|---|---|---|---|---|
| D-03 | 6 | 7 | Catálogos globales, mixtos y del tenant con vigencia, caché y validación | TR-RF-022 a 027 | Back / TR-CAT | 19a |
| D-04 | 6 | 4 | Importar tablas SUNAT; feriados y cálculo de días hábiles | TR-RF-028, 029 | Back / TR-CAT | 19b |
| D-06 | 7 | 3 | Catálogos globales e ítems con vigencia | TR-RF-022, 023 | Front / Consola | 19b |

Total 14 h. Relacionadas (otros specs): D-05 (sprint 7, 6 h, Front Admin cliente: "Parámetros (herencia y restablecer), series y catálogos propios", RF 025, 026, 031, 033, 035). El roadmap reparte D-05 entre spec 09 (RF 030-033) y spec 10 (RF 035-037) y no cita RF-025/026: la UI de catálogos propios y personalización queda sin dueño (ver P3). D-01 (parámetros, spec 09) y D-02 (spec 10) en el mismo sprint 6. C-05/C-06 (CC-04 SazónPOS) en el spec 25. R2-03 (TR-ARC, sprint 13, R2) es el componente de archivos que RF-028 cita; no existe en R1.

## 6. Tablas SQL, eventos, puertos y permisos
- **Esquema `cat`**: el plan lo lista en PL-03 (`org · seg · cfg · cat · seq · aud · sync`) y en la estructura backend (`db/01d_cat_seq.sql`, con SEQ en el mismo archivo; ese archivo no existe en `codigo/`). Fuente SRS "transversal/sql/04_cat (ux_cat_item)" tampoco existe en el repo. No hay DDL de `cat` que conservar.
- **Tablas deducibles del SRS**: `cat.catalogo` (codigo, nombre, alcance, fuente, editable_por_tenant, version), `cat.catalogo_item` (catalogo, tenant_id nulo para globales, codigo, codigo_externo, nombre, abreviatura, orden, atributos jsonb, vigente_desde, vigente_hasta, activo; índice único `ux_cat_item` por catálogo y tenant + código), `cat.catalogo_item_tenant` (nombre citado en RF-025: item_id, tenant_id, visible, orden, alias), función `cat.items` (RF-024), y feriados (tabla propia o ítems del catálogo FERIADO; el SRS dice "catálogo FERIADO MIXTO" pero necesita `alcance`, `sucursal_id`, `recurrente_anual`: decisión de diseño, ver P5). Nombres de tabla de feriados no existen en el SRS ni el plan.
- **RLS**: patrón de `db/01a_org.sql`: `ENABLE ROW LEVEL SECURITY` + `USING (tenant_id = current_setting('app.tenant_id', true)::uuid)`. Los globales tienen `tenant_id` nulo, así que la política debe permitir lectura de `tenant_id IS NULL` y escritura solo del tenant (o rol de plataforma). Sin `FORCE` hoy.
- **Data API**: el esquema `cat` debe quedar fuera (regla 8). Replicar los `REVOKE` de `supabase/migrations/20261102000000_seg_supabase_auth.sql` líneas 99-100 para `cat`.
- **Evento**: `catalogo.actualizado` (RF-022, RF-028, flujo de RF-023/025/026 por la invalidación). Payload sin definir en el SRS: al menos codigo de catálogo y versión; se escribe en el outbox (regla 4) y debe registrarse en el registro de esquemas cuando exista (spec 11).
- **Caché**: Redis, clave `cat:{codigo}:{tenant}:{version}`, ETag derivado de la versión; invalidación por catálogo y por tenant.
- **Puertos** (SRS): `CatalogoPort.validarItem(catalogo, codigo)`; `CalendarioPort.sumarDiasHabiles(fecha, n, sucursal)`. Carpeta `libs/plataforma/catalogos` (estructura_backend.txt línea 57, sin detalle de archivos).
- **REST**: `GET /v1/catalogos/{codigo}/items` (ETag, 304, 404 `CATALOGO_NO_EXISTE`). Los otros RF no declaran ruta; endpoints de administración se definen en el spec bajo `/v1`.
- **Permisos**: plat.catalogo.gestionar (022), plat.catalogo.item_gestionar (023), plat.catalogo.leer (024, 027), plat.catalogo.personalizar (025), plat.catalogo.item_propio (026), plat.catalogo.importar (028), plat.feriado.gestionar (029). Deben entrar al manifiesto del spec 06. El SRS dice que 023 lo usan admin plataforma y admin cliente: el permiso `item_gestionar` y `item_propio` pueden solaparse (ver P7). Los de plataforma (gestionar, importar) probablemente exigen aal2 (decisión del spec).
- **Frontend**: `consola-catalogos` (type:feature, solo plataforma-consola), ruta `/catalogos`; `admin-cliente/src/lib/catalogos/`; `<ui-catalogo-select>` en `ui` (sin historia).
- **Etiquetas Nx**: lib `libs/plataforma/catalogos` con `scope:plataforma` y hexagonal (domain/application/infrastructure/interface/test).

## 7. Código base relacionado
Raíz: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/codigo/`.
- **Falta**: no hay código, DDL ni pruebas de catálogos. Ni `db/01d_cat_seq.sql`, ni `catalogos/`, ni importador, ni calendario.
- **Referencia útil**:
  - `libs/plataforma/seguridad/src/infrastructure/cache-permisos.redis.ts`: patrón de caché Redis con SET índice por tenant para invalidar sin `SCAN`. Transferible a `cat:{codigo}:{tenant}:{version}`; la clave de CAT incluye versión, así que la invalidación puede ser solo de claves antiguas.
  - `cache-permisos.memoria.ts`: implementación en memoria para pruebas.
  - `libs/plataforma/seguridad/src/interface/decoradores.ts`: `@Permiso('plat.x.y', { mfa })`, `@Publico`, `@UsuarioActual`.
  - `db/01a_org.sql`: patrón RLS por `app.tenant_id`.
  - `supabase/migrations/20261102000000_seg_supabase_auth.sql`: `REVOKE` a anon/authenticated.
  - `supabase/tests/` y `correr_pruebas.sh`: patrón de pruebas SQL.
  - `3_plan.json` clave `feriados`: 19 fechas 2026-12-08 a 2027-12-25 (feriados de Perú usados para planificar). Puede servir como semilla de datos de prueba, no como dato normativo completo.
- **Cambiar**: todo es nuevo; depende de kernel/kernel-infra (spec 02) para UoW, outbox y ALS, y del guard del spec 07.
- **Versiones**: Angular 21 (decisión vigente; el SRS y el docx dicen 19 o 22), NestJS 12.

## 8. Diagramas relevantes (`1_Mermaid/`)
- PL-10 Dependencias entre componentes (CAT bajo SEG; CAT -> PER -> IDN; CAT -> FE).
- PL-03 (esquema `cat` en la base), PL-08 (el worker de SazónPOS "lee seg/org/cfg/cat/seq").
- PL-01 Hoja de ruta (R1 incluye TR-CAT).

## 9. Ambigüedades y preguntas candidatas (Fase 2)
Ambigüedades:
- Tope de horas: D-03+D-04+D-06 = 14 h; el roadmap exige partir antes de redactar.
- RF-028 cita TR-ARC (R2-03, sprint 13) y TR-AUD (E-01, spec 20) como componentes; en R1 no hay archivos.
- RF-029 cita TR-CFG para `sabado_habil`; CFG es spec 09 y el roadmap pone el spec 19 solo detrás de 07.
- `db/01d_cat_seq.sql` mezcla CAT y SEQ (spec 10) en un único archivo.
- RF-025 y RF-026 (UI) son parte de D-05 pero ningún spec del roadmap las nombra.
- El SRS habla de «contar» días hábiles, el flujo solo define `sumarDiasHabiles`.
- No se define dónde viven los feriados (tabla o ítems del catálogo FERIADO).
- TR-CA-075 usa feriados de 2026 que el plan no lista; el calendario necesita semilla.
- RF-028 enumera 7 tablas, de las que UNIDAD_MEDIDA, AFECTACION_IGV y MONEDA nunca se detallan; la carga inicial de datos (ubigeo, CIE-10) no tiene fuente en el repo.

Preguntas candidatas, con recomendación:
1. ¿Se acepta la partición 19a (D-03, 7 h) / 19b (D-04 + D-06, 7 h)? Recomendación: sí; 19a primero, sin esperar a 09 ni 15. Actualizar roadmap (renumerar o 19a/19b) y la dependencia del spec 25 hacia ambos.
2. ¿Cómo importa RF-028 sin TR-ARC (R2)? Recomendación: puerto `AlmacenArchivoPort` con adaptador mínimo (carga en memoria/temporal, <= 20 MB, UTF-8) en este spec; sin guardado en TR-ARC hasta R2; documentar la desviación del flujo del SRS (paso 2).
3. ¿Quién implementa la UI de ítems propios y personalización (RF-025/026 en D-05)? Recomendación: 19b, con ~2 h tomadas de las 6 de D-05 (estimación mía, no del plan); ajustar spec 09/10 para no duplicarlas.
4. ¿Dónde va `sabado_habil` si 09 no está listo? Recomendación: 19b depende de 09 y lee el parámetro vía puerto `ParametrosPort`; para pruebas, adaptador en memoria. Alternativa: mover 19b a después de 09 en las olas (ya está en ola 6).
5. ¿Modelo de feriados? Recomendación: tabla propia `cat.feriado` (fecha, nombre, alcance, sucursal_id, recurrente_anual, tenant_id nulo si global) con RLS, y registro del catálogo FERIADO MIXTO como definición; un catálogo de ítems no soporta bien alcance por sucursal.
6. ¿`<ui-catalogo-select>` entra? Recomendación: no en 19a/19b; sin RF ni historia. Pasar al spec 15 (shell y UI) o al spec 25 si lo necesita SazónPOS. Anotar.
7. ¿Un solo permiso o dos para ítems (023 y 026)? Recomendación: respetar el SRS (item_gestionar para plataforma, item_propio para cliente) y que el guard distinga alcance GLOBAL vs tenant por catálogo; `gestionar` e `importar` con `mfa: true`.
8. ¿Dónde viven los DDL y qué numeración? Recomendación: `db/01d_cat.sql` separado de SEQ (`01d_seq.sql`, spec 10), cada uno con su script inverso en `db/rollback/` y pruebas en `db/pruebas/`; acordar rango en spec 01.
9. ¿Qué datos semilla trae 19a? Recomendación: catálogos de definición y los ítems que los GWT nombran (MEDIO_PAGO, TIPO_DOC_IDENTIDAD, TIPO_COMPROBANTE, ESPECIALIDAD) para pruebas; la carga completa (UBIGEO, CIE-10, SUNAT) se hace desde el importador de 19b con archivos que debe entregar el usuario.
10. ¿Payload de `catalogo.actualizado`? Recomendación: `{codigo, version, tenant_id|null}`; aggregate_type `catalogo`; registrar el esquema con `schema_version` 1.
