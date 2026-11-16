# Contexto para int-webhooks-salientes

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes), `plan.md` (R4), `3_plan.json`, spec 11 (relay), `db/01e_sync_*.sql`, `libs/plataforma/eventos`.

## 1. Alcance y dependencias
- Componente TR-INT (MOD-20), proceso TR-P12. Suscripción de URLs externas a eventos del tenant con firma HMAC-SHA256, reintentos exponenciales hasta 24 h, historial, reenvío manual y desactivación tras 3 días de fallos.
- Release: plan **R4 (backlog 2028)**. SRS: Should/R2.
- Historia: ninguna. Horas estimadas: 9-10 h (un solo spec).
- Dependencias: EVT (spec 11: relay, `@SuscribirEvento`, BullMQ, idempotencia `sync.evento_procesado`), registro de esquemas (`../tr-pendientes-base/evt-registro-esquemas.md`, para saber qué eventos son públicos y su versión), `int-clientes-api` (el plan del tenant incluye la API pública), TR-NOT (R2) para avisar la desactivación, AUD (20a).
- Áreas (≤ 3): (a) agregado `SuscripcionWebhook` (URL HTTPS, eventos, secreto, estado) con evento de prueba; (b) entregador en el worker: firma, reintento exponencial ≤ 24 h, historial de entregas, desactivación a los 3 días; (c) API y UI en `admin-cliente` (lista, historial, reenviar, rotar secreto).
- Si supera 10 h: separar la UI (`int-webhooks-ui`, 5-6 h).
- Fuera de alcance: webhooks entrantes de pasarelas (TR-PAG, RNF-109), transformación del payload por destino, filtros por contenido, mTLS.
- Constitución: 1, 2, 3, 4 (consumidor idempotente por `event_id`), 5, 8, 9, 10; código limpio; diseño UI.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-132 | Configurar webhooks salientes | plat.integracion.webhook | APP-02 | TR-RN-045, 034 | TR-RNF-107, 109 | Administrador del cliente, Sistema institucional o integrador |

- **132** precondición: el tenant tiene la API pública en su plan. Flujo: 1) registra URL HTTPS y tipos de evento; 2) genera secreto de firma y envía evento de prueba; 3) cada evento suscrito se entrega con firma, `event_id` y marca de tiempo; 4) ante fallos reintenta; tras 3 días seguidos desactiva y notifica. Datos: url (HTTPS obligatorio), eventos[] (catálogo de eventos públicos), secreto (generado), estado (ACTIVA|DESACTIVADA), entregas[] (event_id, intento, codigo_http, latencia). Relacionados: TR-INT, TR-EVT, TR-NOT.

## 3. Criterios GWT
- **TR-CA-320** (Positivo, «Entrega firmada»): suscribió `https://erp.andina.pe/hooks` a `cpe.aceptado` | se acepta una factura | el ERP recibe el evento con firma HMAC válida.
- **TR-CA-321** (Negativo, «URL sin HTTPS»): registra `http://…` | guarda | «La URL debe usar HTTPS».
- **TR-CA-322** (Borde, «Destino caído 3 días»): responde 500 desde hace 72 h | falla el último reintento | DESACTIVADA y aviso al administrador.

Faltan y se proponen: evento de otro tenant nunca se entrega a esta suscripción (RNF-010); reentrega del relay no duplica la entrega (idempotencia por `(suscripcion, event_id)`); reenvío manual crea un intento nuevo con el mismo `event_id`; URL a IP privada o `localhost` rechazada (SSRF, ASVS); timeout del destino (p. ej. 10 s) cuenta como fallo; payload con datos personales solo si el evento es público y el tenant lo eligió; rotación del secreto firma con el nuevo desde el siguiente envío.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-045 | Webhooks firmados con HMAC-SHA256 por suscripción, reintento exponencial hasta 24 h, desactivación tras 3 días consecutivos de fallos con aviso al administrador. |
| TR-RN-034 | Evento en el outbox en la misma tx; entrega al menos una vez; consumidor idempotente por `event_id`. |
| TR-RNF-107 | Webhooks salientes reintentados hasta entrega o desactivación; entrega final ≥ 99,9 % con destino disponible dentro de 24 h. |
| TR-RNF-109 | (Entrantes) firma y marca de tiempo ± 5 min. Aquí se aplica el espejo: la firma saliente incluye marca de tiempo para que el receptor rechace repeticiones. |

Heredados por CLAUDE.md: 001/002/003, 007, 008, 010, 011, 012, 013/112, 024/119, 025, 026 (sin payload en logs), 101, 106.

## 5. Historia del backlog
Sin historia (R4). Relacionadas: spec 11 (relay; dejó fuera «orden por agregado y reentrega del histórico a consumidores nuevos» y «purga del outbox»), spec 21 (métricas del outbox en `observabilidad`).

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta: `db/04b_int_webhooks.sql`.
- `int.suscripcion_webhook` (id, tenant_id, url, eventos text[], secreto_cifrado (P2), estado ACTIVA|DESACTIVADA, fallando_desde timestamptz NULL, creado_por, version). RLS.
- `int.entrega_webhook` (id, tenant_id, suscripcion_id, event_id, intento smallint, codigo_http, latencia_ms, error varchar (sin payload), enviado_en; UNIQUE (suscripcion_id, event_id, intento)). Retención 30 días (P5).
- **Cabeceras propuestas**: `X-Vitrina-Event-Id`, `X-Vitrina-Event-Type`, `X-Vitrina-Timestamp`, `X-Vitrina-Signature: v1=<hex(HMAC-SHA256(secreto, timestamp + "." + cuerpo))>`.
- **Eventos**: `integracion.webhook_desactivado` (TR-NOT avisa), `integracion.webhook_registrado`. Nombres propuestos.
- **Puertos**: `EntregadorHttp` (fetch con timeout, sin seguir redirecciones a IP privada), `CifradorSecretos` (RNF-113), `CatalogoEventosPublicos` (lee el registro de esquemas de EVT).
- **Mecánica**: un consumidor `@SuscribirEvento` genérico (`consumidor: 'int-webhooks'`) recibe cada evento, busca suscripciones activas del tenant para ese `event_type` y encola un trabajo BullMQ por suscripción con backoff exponencial; el job escribe `int.entrega_webhook`. El relay hoy registra un tipo por método (`@SuscribirEvento('tenant.creado', …)`, ver `auditoria.consumidor.ts`): un suscriptor «a todos los tipos públicos» necesita extender `eventos` (P1).
- **Permisos**: `plat.integracion.webhook` (sensible por manejar secreto). Ruta `/v1/int/webhooks`.

## 7. Código base relacionado
- **Se reutiliza**: `eventos` (`EventosModule`, `SuscribirEvento`, `EventoEntregado`, `PoliticaReintentos`, `ListarFallidos`/`ReprocesarFallidos` como patrón de reenvío manual); `db/01e_sync_relay.sql` (`sync.evento_procesado` por consumidor, `sync.evento_fallido`); `kernel-infra` (`OutboxPublisher`); `observabilidad` (`registrarMetricasOutbox` como modelo de métricas de entregas); `shared/ui`.
- **Falta**: lib `integracion` (compartida con `int-clientes-api`), registro de esquemas con marca «público», cifrado de secretos, suscriptor comodín en `eventos`.

## 8. Diagramas relevantes
- `01-analysis/.../8_Diseno_Piloto/2_Plataforma_Transversal/T-S7_Secuencia_Relay_del_outbox_hacia_los_consumidores.mmd`.
- `.../T-07_Modelo_de_dominio_Notificaciones_archivos_auditoria_y_eventos.mmd` (`EventoOutbox`, `Suscriptor`).
- `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd` (EVT; TR-INT no aparece).

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- «Catálogo de eventos públicos» no existe: RF-094 (registro de esquemas) está sin spec.
- «3 días seguidos de fallos» y «reintentos hasta 24 h» se solapan: cada evento muere a las 24 h, la suscripción a los 3 días.
- El payload interno del outbox puede tener campos que no deberían salir del sistema.

Preguntas, con recomendación:
1. ¿Suscriptor comodín? Recomendación: extender `eventos` con `@SuscribirEventos(tipos[])` o una lista dinámica leída del registro de esquemas; un consumidor `int-webhooks` con idempotencia por `event_id` y fan-out a BullMQ.
2. ¿Secreto cifrado o en claro? Recomendación: HMAC necesita el secreto en claro al firmar: guardarlo cifrado con AES-256-GCM y llave por entorno (paso previo a un gestor de secretos, RNF-113); mostrarlo una vez.
3. ¿Qué payload sale? Recomendación: solo eventos marcados `publico` en el registro de esquemas, con su `schema_version`; el sobre lleva `event_id`, `event_type`, `schema_version`, `occurred_at`, `tenant_id`, `data`.
4. ¿Política de reintentos? Recomendación: backoff exponencial con jitter (1 min, 5, 15, 1 h, 3 h, 6 h, 12 h, hasta 24 h); 2xx = entregado; 410 desactiva de inmediato.
5. ¿Retención del historial? Recomendación: 30 días en `int.entrega_webhook`, purga diaria en el worker.
6. ¿Protección SSRF? Recomendación: resolver DNS y rechazar rangos privados, loopback y link-local al registrar y al enviar; sin seguir redirecciones.
