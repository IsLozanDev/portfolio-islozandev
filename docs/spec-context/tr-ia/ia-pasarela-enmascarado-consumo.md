# Contexto para ia-pasarela-enmascarado-consumo

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx (hojas Módulos, RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores), `plan.md` (sección «Fuera de este plan (R4)»), `3_plan.json`, `1_Mermaid/PL-10`, `01-analysis/.../2_Propuesta_IA/00_IA_Arquitectura/` (IA-ARQ-01, IA-ARQ-04) y `LEEME.md`.

## 1. Alcance y dependencias
- Componente TR-IA (MOD-15), proceso TR-P13 (y TR-P11 para 101, TR-P01 para 104). Primer slice de TR-IA: la pasarela es la puerta única a los modelos; 102, 103 y 105 se montan encima.
- Release: el plan lo deja **fuera de R0-R3 (R4, backlog 2028)**: «TR-IA (pasarela de modelos) … entran cuando un producto los necesite». El SRS marca 100, 101 y 104 como Must/MVP; manda el plan.
- Historia del backlog: ninguna (R4 no tiene historias en `3_plan.json`). Horas estimadas aquí: 16-18 h en total.
- PL-10 no dibuja TR-IA. Dependencias reales deducidas del SRS: kernel, ORG (plan y límites por tenant), SEG (`@Permiso`), CFG (umbral, política), AUD (101 registra el prompt enmascarado), OBS (102/RF-100 registra latencia; spec 21 ya da trazas), NOT (aviso del 80 %, R2).
- Partición propuesta (≤10 h, ≤3 áreas):

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| A | ia-pasarela-y-enmascarado | 100, 101 | 9-10 | 07, 09, 20a, 21 |
| B | ia-consumo-y-limites | 104 (+ UI de consumo) | 7-8 | A, 12 (suscripción/plan), TR-NOT (R2) o puerto nulo, 15/17b/17c para UI |

- A, áreas: (a) dominio de caso de uso, plantilla versionada y registro de invocación; (b) `IaPort` + adaptadores de proveedor con timeout, reintento y respaldo; (c) enmascarador por reglas con restitución.
- B, áreas: (a) acumulado por periodo y control previo a invocar; (b) aviso 80 % y política CORTE/EXCEDENTE; (c) vistas de consumo en consola y admin cliente.
- Fuera de alcance: extracción documental y RAG (`ia-extraccion-rag.md`), agente conversacional (`ia-agente-conversacional.md`), modelos predictivos en Python (IA-ARQ-01 «Modelos predictivos»; sin RF), copiloto analítico (aparece en la hoja Módulos y en TR-CA-255, sin RF propio), reconocimiento de entidades con modelo (NER) si el spec opta por reglas.
- Constitución aplicable: 1, 2, 3, 4, 5, 8, 9, 10 (proveedores detrás de puertos), 11; código limpio; DoD.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-100 | Enrutar solicitudes por la pasarela de modelos | plat.ia.invocar | APP-03 | TR-RN-041 | TR-RNF-121, 007, 115 | Módulo de producto consumidor, Proveedor de modelos de IA |
| TR-RF-101 | Enmascarar datos personales en solicitudes de IA | plat.ia.invocar | APP-03 | TR-RN-041, 032 | TR-RNF-115, 016 | Módulo de producto consumidor |
| TR-RF-104 | Medir consumo de IA y aplicar límites por tenant | plat.ia.consumo | APP-01 (y APP-02) | TR-RN-041 | TR-RNF-128, 026 | Admin de plataforma, Admin del cliente, Planificador de tareas |

- **100** precondición: caso de uso registrado con plantilla y modelo. Flujo: módulo invoca `IaPort` con código de caso y datos → enmascara → arma instrucción con plantilla vigente → llama con timeout; ante error, modelo de respaldo → registra tokens, costo, latencia, versión de plantilla. Datos: caso_uso (p. ej. `doc.clasificar_documento`), entrada JSON, modelo_principal, modelo_respaldo, plantilla_version, tokens_entrada/salida, costo_usd, latencia_ms. Relacionados: TR-IA, TR-OBS.
- **101** precondición: la solicitud pasa por la pasarela. Flujo: reglas (+ NER opcional) → marcadores `[DNI_1]`, `[NOMBRE_1]`, `[TEL_1]`, `[NUM_1]` → envía enmascarado → restituye solo si el caso lo pide → registra prompt enmascarado. Datos: texto_original (no se almacena), texto_enmascarado, mapa_marcadores (solo en memoria), entidades_detectadas (conteo por tipo). Relacionados: TR-IA, TR-AUD.
- **104** precondición: el plan define el límite mensual. Flujo: cada invocación con costo → acumulado por periodo y tenant → aviso al 80 % → al 100 % política CORTE (casos no esenciales) o EXCEDENTE. Datos: tenant_id, periodo AAAA-MM, limite_usd, consumido_usd, politica_exceso (CORTE|EXCEDENTE), por_caso_uso[]. Relacionados: TR-IA, TR-NOT, TR-ORG.
- Interfaz (hoja Componentes): «IaPort por caso de uso vía pasarela de modelos; enmascaramiento; … medición de consumo». Consumidores: los 9 productos (C), forma «IaPort por caso de uso (extraer, clasificar, resumir, responder, predecir)».

## 3. Criterios GWT
- **TR-CA-244** (100, Positivo, «Clasificación con modelo principal»): caso `doc.clasificar_documento` configurado | DocuFlujo envía documento | devuelve clasificación y registra tokens y costo.
- **TR-CA-245** (100, Borde, «Falla del proveedor principal»): principal responde 503 | se invoca | responde con el respaldo e indica el modelo usado.
- **TR-CA-246** (100, Negativo, «Caso de uso no registrado»): no existe `rest.poema_del_dia` | se invoca | rechaza con `CASO_USO_NO_REGISTRADO`.
- **TR-CA-247** (101, Positivo): «Juana Quispe, DNI 45781236, celular 987654321» | se resume | el proveedor recibe «[NOMBRE_1], DNI [DNI_1], celular [TEL_1]».
- **TR-CA-248** (101, Borde): «Pedido 12345678 de 3 unidades» | se enmascara | `[NUM_1]` por precaución y se restituye en la respuesta.
- **TR-CA-254** (104, Positivo): límite USD 20,00, consumido 16,10 | nueva invocación | aviso del 80 % al administrador.
- **TR-CA-255** (104, Negativo): límite alcanzado con CORTE | se invoca el copiloto analítico | `LIMITE_IA_ALCANZADO` y el producto muestra el mensaje.

Estado en el SRS: Pendiente. Faltan y se proponen: aislamiento (un tenant no ve consumo ni registros de otro, RNF-010); timeout del respaldo también agotado (error `PROVEEDOR_IA_NO_DISPONIBLE`, sin bloquear la operación principal, RNF-007); plantilla nueva sube versión y la invocación registra la versión usada; correo/teléfono/RUC de persona natural (10…) enmascarados; muestreo de prompts registrados sin DNI, teléfono ni correo (meta de RNF-115); política EXCEDENTE deja continuar y marca el excedente; caso «esencial» no se corta con CORTE.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-041 | Todo texto a un proveedor de IA se enmascara antes (DNI, RUC persona natural, nombres, teléfonos, correos); salidas con efecto requieren confirmación humana. |
| TR-RN-032 | Caché de identidad con campos mínimos (proporcionalidad, Ley 29733); aquí: no persistir el texto original. |
| TR-RNF-115 | Solicitudes a IA sin datos personales identificables. Meta: 0 DNI, teléfonos o correos en prompts registrados (muestreo 1 000/mes). |
| TR-RNF-121 | Proveedores externos por puertos y adaptadores, cambiables por tenant sin despliegue (< 10 min, sin reinicio). |
| TR-RNF-007 | Timeout, reintento con backoff y circuit breaker; la caída del tercero no bloquea la operación principal. |
| TR-RNF-128 | Consumo de IA, mensajería e identidad con límites mensuales, aviso 80 % y corte o degradado al 100 %. |
| TR-RNF-016 | Ley 29733 y D.S. 016-2024-JUS (finalidad, ARCO). |
| TR-RNF-026 | Logs estructurados sin datos personales (el texto original nunca va a logs). |

Heredados por CLAUDE.md: 001/002/003, 008, 010, 011 (llaves de proveedor solo por entorno o gestor de secretos), 012, 013/112, 024/119, 025, 101, 106.

## 5. Historia del backlog
Sin historia (R4). `3_plan.json` no tiene entradas con RF 100-105 ni componente TR-IA. Relacionadas: ninguna en R1-R3. Spec 21 (OTel, Sentry) da la base de trazas; TR-NOT (R2) da el canal del aviso.

## 6. Tablas SQL, eventos, puertos y permisos
- **Esquema `ia`** (propuesto, `db/04a_ia.sql`; prefijo 04 = R4, a confirmar contra la numeración que fije el mapa de componentes; hoy hay `01a`-`01i`):
  - `ia.caso_uso` (codigo PK `producto.dominio.accion`, descripcion, modelo_principal, modelo_respaldo, timeout_ms, esencial boolean, restituir boolean, esquema_salida jsonb NULL, activo, version). Global (catálogo de plataforma, sin tenant) o con override por tenant: ver P3.
  - `ia.plantilla` (caso_uso, version smallint, instruccion text, creada_en; PK (caso_uso, version); solo inserción).
  - `ia.invocacion` (id uuidv7, tenant_id, caso_uso, plantilla_version, modelo_usado, uso_respaldo, tokens_entrada, tokens_salida, costo_usd numeric(12,6), latencia_ms, resultado OK|ERROR|CORTADO, prompt_enmascarado text NULL, entidades jsonb (conteos), trace_id, creada_en). RLS por `app.tenant_id`.
  - `ia.consumo_mensual` (tenant_id, periodo char(7), consumido_usd, avisado_80 boolean, version; PK (tenant_id, periodo)). Límite y política: de la suscripción (`org.suscripcion` hoy tiene `plan`, `limite_sucursales`, `limite_usuarios`; no tiene límite de IA) o de CFG (`plat.ia.limite_mensual_usd`, `plat.ia.politica_exceso`). Ver P5.
- **Eventos** (outbox, `schema_version = 1`): `ia.consumo_umbral_alcanzado` (tenant, periodo, porcentaje 80|100, politica) para que TR-NOT avise. No hay eventos de TR-IA en el SRS; nombre propuesto.
- **Puertos** (lib `libs/plataforma/ia`): `IaPort.invocar(casoUso, entrada, opciones)` (aplicación, expuesto en `index.ts`); `ProveedorModelo` (infra: adaptadores por proveedor, uno nulo/falso para pruebas); `Enmascarador` (dominio puro: reglas regex DNI 8 dígitos, RUC 10/20, teléfono 9 dígitos que empieza en 9, correo, números largos → `[NUM_n]`); `ContadorConsumo`; `RelojPeriodo` (zona America/Lima, como el fix de vigencias en `01i_seg_vigencia_peru.sql`).
- **Permisos**: `plat.ia.invocar` (interno, sin endpoint público), `plat.ia.consumo` (consola y admin cliente: lectura de consumo). Gestión de casos y plantillas sin permiso en el SRS: proponer `plat.ia.casos_gestionar` (consola).
- **Etiquetas Nx**: `scope:plataforma`, `comp:ia`; dominio `type:domain`, resto `type:backend`. La UI de consumo iría en `consola-*` y `admin-cliente` (`type:feature`).

## 7. Código base relacionado
- **No existe** nada de TR-IA en el repo ni en `docs/.../codigo/` (solo `db/01a_org.sql`, `01b_seg.sql`, `seguridad`, `shared/auth`). Todo se escribe desde cero.
- **Se reutiliza**: `kernel` (`Clock`, `IdGenerator`, `TenantContext`, `UnitOfWork`, `EventPublisher`); `kernel-infra` (`TypeOrmUnitOfWork`, `OutboxPublisher`, `uuidV7`, `traceIdActivo`, `anotarSpanActivo`, `REPORTADOR_ERRORES`); `observabilidad` (`CAMPOS_SENSIBLES`, `rutasRedactadas`, `valorCensurado`: la redacción de logs ya existe y debe incluir `texto`, `prompt`); `auditoria` (`AUDITORIA`/`AuditoriaPort`, `CAMPOS_ENMASCARADOS`); `parametros` (`PARAMETRO_PORT` para umbral y política); `seguridad` (`@Permiso`).
- **Patrón de esquemas de evento**: `libs/plataforma/<lib>/src/infrastructure/event-schemas.ts` + `registrarEsquemas<Lib>` en `apps/api/src/main.ts` y `apps/worker/src/worker.module.ts`.
- **Falta**: lib `ia`, migración, adaptadores de proveedor (SDK de cada proveedor), llaves por entorno, tarea de muestreo de prompts (RNF-115).

## 8. Diagramas relevantes
- `01-analysis/.../2_Propuesta_IA/00_IA_Arquitectura/IA-ARQ-01_Arquitectura_del_Servicio_de_IA_de_la_plataforma.mmd` (pasarela, protección de datos, medición).
- `.../IA-ARQ-04_Matriz_de_priorizacion_de_casos_de_IA_impacto_vs_esfuerzo.mmd` (qué casos primero: LIB-01, DOC-01, REST-02, LEX-01).
- Casos por producto: `.../07_DOC_DocuFlujo_IA/DOC-IA-P01_*.mmd` (clasificación, TR-CA-244), `.../01_REST_SazonPOS_IA/REST-IA-P02_*.mmd`.
- `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd` (no incluye TR-IA: habrá que agregarlo).

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- El SRS dice MVP; el plan dice R4. Ningún producto de R1-R3 consume TR-IA.
- «Reglas y reconocimiento de entidades» (101): detectar nombres por reglas es poco fiable; con NER habría un modelo local más.
- TR-CA-248 enmascara cualquier número largo «por precaución»: puede dañar casos que necesitan cifras (montos, códigos).
- «Cambiables por tenant sin despliegue» (RNF-121) choca con llaves de proveedor solo por entorno (regla 9).
- 104 menciona «modo degradado» y «casos no esenciales» sin definirlos.

Preguntas, con recomendación:
1. ¿Cuándo entra TR-IA? Recomendación: no antes de que un producto lo pida (plan R4); al entrar, primero A y luego B, y un caso real (DOC-01 o LIB-01, matriz IA-ARQ-04).
2. ¿Proveedor y SDK? Recomendación: puerto `ProveedorModelo` con un adaptador por proveedor y uno falso; empezar con un proveedor principal y uno de respaldo de otro vendedor. Confirmar con `ctx7` el SDK vigente al redactar.
3. ¿Casos de uso globales o por tenant? Recomendación: catálogo global en la consola (lo declara el manifiesto del producto, como permisos y parámetros, RNF-120); el tenant solo activa o desactiva.
4. ¿Enmascarado por reglas o NER? Recomendación: reglas deterministas en el dominio (DNI, RUC 10, teléfono, correo, números ≥ 8 dígitos) + diccionario de nombres opcional; NER queda fuera hasta medir con el muestreo de RNF-115.
5. ¿Límite en plan o en CFG? Recomendación: CFG (`plat.ia.limite_mensual_usd`, `plat.ia.politica_exceso`, nivel tenant), con valor por defecto según plan al sembrar el alta; no tocar `org.suscripcion`.
6. ¿Se guarda el prompt? Recomendación: solo el enmascarado, 90 días, con muestreo automático que alerta si detecta DNI/teléfono/correo; el texto original y el mapa de marcadores nunca se persisten ni se loguean.
7. ¿Control del 100 % antes o después de invocar? Recomendación: antes (estimación por tokens de entrada) con `SELECT … FOR UPDATE` en `ia.consumo_mensual`; tolerar un pequeño sobregiro de la última invocación y documentarlo.
8. ¿Aviso del 80 % sin TR-NOT? Recomendación: evento `ia.consumo_umbral_alcanzado` al outbox; si TR-NOT no existe aún, el aviso queda visible en la vista de consumo y el correo llega cuando TR-NOT se suscriba.
