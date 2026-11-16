# Contexto para ia-agente-conversacional

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores), `plan.md` (R4; WhatsApp en R3), `3_plan.json`, `01-analysis/.../2_Propuesta_IA/00_IA_Arquitectura/IA-ARQ-02` y casos REST/ECO/COL.

## 1. Alcance y dependencias
- Componente TR-IA (MOD-15), procesos TR-P06 y TR-P13. Orquestador de agentes para WhatsApp, chat web y kiosco, con herramientas que llaman a las APIs con los permisos del contexto y confirmación explícita antes de efectos económicos.
- Release: plan **R4 (backlog 2028)**; SRS Should/R2. WhatsApp (canal TR-NOT) entra en R3 según el plan («R3: … WhatsApp»).
- Historia: ninguna. Horas estimadas: 18-20 h.
- Dependencias: pasarela y enmascarado (`ia-pasarela-enmascarado-consumo.md`, parte A), consumo (parte B, el agente es el mayor consumidor), RAG (`ia-extraccion-rag.md`, parte B) para responder preguntas, TR-NOT con WhatsApp (R3) para el canal y la derivación, TR-PAG (R3) para el link de pago, TR-AUD (20a) para auditar acciones confirmadas, SEG para el principal de servicio del agente.
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| A | ia-agente-orquestador | 105 (núcleo, canal CHAT_WEB) | 10 | pasarela, consumo, 20a, 07 |
| B | ia-agente-canales-derivacion | 105 (WhatsApp, kiosco, derivación a persona) | 8-10 | A, TR-NOT WhatsApp (R3), RAG |

- A, áreas: (a) conversación (estado ACTIVA|DERIVADA|CERRADA, historial de 20 mensajes); (b) registro de herramientas por tenant con permiso y `requiere_confirmacion`, ejecución con el contexto del tenant; (c) máquina de confirmación (propuesta → confirmación explícita → efecto).
- B, áreas: (a) adaptador de canal WhatsApp (webhook entrante firmado, ventana de 24 h y plantillas, RN-026); (b) derivación tras 2 intentos fallidos o a pedido, con aviso a un usuario del tenant; (c) bandeja mínima de conversaciones derivadas.
- Fuera de alcance: herramientas propias de cada producto (las declara cada producto en su manifiesto), voz, kiosco físico (TR-EDGE), cobro (TR-PAG), plantillas de WhatsApp aprobadas por Meta (operación).
- Constitución: 1, 2, 3, 4 (la acción confirmada y su evento en la misma tx), 5 (cada herramienta con su permiso), 8, 9, 10; código limpio; diseño UI para la bandeja.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-105 | Orquestar agente conversacional con confirmación | plat.ia.agente | APP-03 | TR-RN-041, 026 | TR-RNF-115, 030, 007 | Cliente final, Módulo de producto, Proveedor de mensajería, Proveedor de IA |

- **105** precondición: el tenant configuró el agente con herramientas habilitadas y canal conectado. Flujo: 1) el canal entrega el mensaje con tenant y cliente identificados; 2) el orquestador envía al modelo instrucción, historial y herramientas; 3) ejecuta herramientas por las APIs con sus reglas; 4) antes de crear pedidos, citas o cobros muestra resumen y espera confirmación; 5) tras 2 intentos sin entender o a pedido, deriva a una persona. Datos: canal (WHATSAPP|CHAT_WEB|KIOSCO), conversacion_id, herramientas[] (nombre, permiso, requiere_confirmacion), historial (últimos 20), estado (ACTIVA|DERIVADA|CERRADA). Salida: conversación resuelta con acciones confirmadas o derivada. Relacionados: TR-IA, TR-NOT, TR-PAG, TR-AUD.
- Consumidores (hoja Consumidores): agente conversacional en REST, PSI, COL, GYM, CLI, DOC, ECO, LEX.

## 3. Criterios GWT
- **TR-CA-256** (Positivo, «Pedido confirmado por WhatsApp»): «Quiero 2 ceviches y una chicha para llevar» | el agente muestra resumen S/ 74,00 y el cliente responde «Sí, confirmo» | se crea el pedido y recibe número y link de pago.
- **TR-CA-257** (Negativo, «Acción sin confirmación»): el agente propuso un pedido | el cliente responde «mmm no sé» | no crea el pedido y pregunta de nuevo.
- **TR-CA-258** (Borde, «Derivación a persona»): no entendió dos mensajes seguidos | tercer mensaje ambiguo | pasa a DERIVADA y un usuario del tenant recibe la notificación.

Faltan y se proponen: herramienta sin permiso en el contexto del agente (no se ejecuta, `HERRAMIENTA_NO_PERMITIDA`); confirmación que llega después de vencida la propuesta (p. ej. 10 min) no crea nada; mensaje repetido por el canal no duplica la acción (idempotencia por id de mensaje, RNF-008); fuera de la ventana de 24 h solo plantilla (RN-026); límite de IA alcanzado deriva a persona en vez de fallar; aislamiento (conversaciones de A invisibles para B); datos personales enmascarados antes del modelo.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-041 | Enmascarar antes del proveedor; salidas con efecto (registrar, cobrar, enviar) requieren confirmación humana explícita. |
| TR-RN-026 | Fuera de 24 h desde el último mensaje del cliente, WhatsApp solo admite plantillas aprobadas por Meta. |
| TR-RNF-115 | Prompts sin datos personales identificables. |
| TR-RNF-030 | Acciones con dinero, inventario o salud con advertencia clara (el resumen previo con total). |
| TR-RNF-007 | Timeout, reintento y circuit breaker; caída del modelo no bloquea: deriva. |
| TR-RNF-109 | Webhooks entrantes verificados por firma y marca de tiempo (± 5 min): aplica al webhook de WhatsApp. |

Heredados por CLAUDE.md: 001/002/003, 008, 010, 011, 012, 013/112 (acción confirmada auditada), 024/119, 025, 026, 101, 106.

## 5. Historia del backlog
Sin historia (R4). Relacionadas: «obs-negocio-whatsapp» en R3 indicativo del roadmap (canal WhatsApp de TR-NOT); TR-PAG (R3) para el link de pago de TR-CA-256.

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta: `db/04a_ia_agente.sql`.
- `ia.agente_config` (tenant_id, canal, activo, instruccion_caso_uso, herramientas_habilitadas text[], version). RLS.
- `ia.conversacion` (id, tenant_id, canal, cliente_ref (teléfono con hash o id del cliente final), estado, intentos_fallidos smallint, derivada_a uuid NULL, ultimo_mensaje_cliente_en, version).
- `ia.mensaje` (id, tenant_id, conversacion_id, rol CLIENTE|AGENTE|HERRAMIENTA|PERSONA, contenido_enmascarado, canal_mensaje_id UNIQUE (idempotencia), creado_en). Retención corta (P4).
- `ia.accion_propuesta` (id, tenant_id, conversacion_id, herramienta, parametros jsonb, resumen, estado PROPUESTA|CONFIRMADA|DESCARTADA|VENCIDA, vence_en).
- **Eventos**: `ia.conversacion_derivada` (TR-NOT avisa al usuario del tenant), `ia.accion_confirmada` (auditoría). Nombres propuestos.
- **Puertos**: `CanalConversacional` (entrada/salida por canal; adaptadores WhatsApp vía TR-NOT y chat web), `RegistroHerramientas` (herramientas declaradas por manifiesto de producto, cada una con permiso), `EjecutorHerramienta` (llama a la API del producto con un principal de servicio limitado al tenant), `IaPort` (pasarela, con soporte de llamadas a herramientas).
- **Permisos**: `plat.ia.agente` (configurar el agente del tenant); proponer `plat.ia.conversaciones` (bandeja de derivadas). El principal del agente solo tiene los permisos de sus herramientas habilitadas.

## 7. Código base relacionado
- **No existe** código de agente, canales ni mensajería en el repo.
- **Se reutiliza**: `seguridad` (`@Permiso`, permisos efectivos con caché, manifiesto PLAT 1.15.0 en `libs/plataforma/seguridad/manifiesto/plat.manifiesto.json` como modelo para declarar herramientas); `auditoria` (`AuditoriaPort` y `@Auditable` para la acción confirmada); `kernel-infra` (`OutboxPublisher`, `TypeOrmUnitOfWork`); `eventos` (`SuscribirEvento` para avisos); `shared/ui` y `admin-cliente` para la bandeja.
- **Falta**: TR-NOT con WhatsApp, TR-PAG, pasarela de IA, un principal de servicio en SEG (hoy todo principal es un usuario de Supabase Auth; ver P2).

## 8. Diagramas relevantes
- `01-analysis/.../2_Propuesta_IA/00_IA_Arquitectura/IA-ARQ-02_Agente_conversacional_con_herramientas_patron_comun_para_WhatsApp.mmd` (secuencia de TR-CA-256).
- `.../IA-ARQ-01_Arquitectura_del_Servicio_de_IA_de_la_plataforma.mmd` (orquestador → pasarela, RAG).
- Por producto: `.../01_REST_SazonPOS_IA/REST-IA-P01_Pedido_por_WhatsApp_atendido_por_asistente_de_IA.mmd`, `.../08_ECO_MercaWeb_IA/ECO-IA-P01_Compra_asistida_por_vendedor_virtual.mmd`, `.../03_COL_TurnoFacil_IA/COL-IA-P01_*.mmd`.

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- «Con los permisos del contexto»: el cliente final no es usuario de la plataforma; no hay principal para él.
- «Confirmación explícita»: no define qué cuenta como «sí» (texto libre, botón).
- Kiosco aparece como canal, pero es dispositivo de TR-EDGE.
- La derivación necesita una bandeja y un destinatario; el SRS no dice cuál.

Preguntas, con recomendación:
1. ¿Cuándo? Recomendación: después de pasarela, consumo, RAG y WhatsApp de TR-NOT; primer caso REST-IA-P01 (SazónPOS) o ECO-01.
2. ¿Con qué identidad ejecuta herramientas? Recomendación: principal de servicio por tenant y agente (tipo_usuario nuevo `SERVICIO`, sin acceso por Supabase Auth), con un rol que solo incluye los permisos de las herramientas habilitadas; el cliente final se identifica como dato de la conversación, no como usuario.
3. ¿Qué es una confirmación? Recomendación: botón interactivo del canal (WhatsApp reply button) o respuesta que el modelo clasifica como afirmativa con una segunda verificación determinista (palabra clave); sin confirmación válida en 10 min la propuesta vence.
4. ¿Retención de mensajes? Recomendación: contenido enmascarado 30 días; el historial que va al modelo son los últimos 20; la acción confirmada queda en auditoría (5 años).
5. ¿Quién recibe la derivación? Recomendación: usuarios del tenant con permiso `plat.ia.conversaciones` en la sucursal de la conversación; aviso por TR-NOT y bandeja en `admin-cliente`.
6. ¿Herramientas de dónde? Recomendación: declaradas en el manifiesto del producto (nombre, permiso, `requiere_confirmacion`, esquema de parámetros), aplicado de forma idempotente como permisos y parámetros (RNF-120).
