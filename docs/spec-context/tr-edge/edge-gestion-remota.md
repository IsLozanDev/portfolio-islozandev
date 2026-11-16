# Contexto para edge-gestion-remota

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes), `plan.md` (R4), `3_plan.json`, spec 21 (observabilidad base), `01-analysis/.../6_Plataforma_Operacion/` (OP-01, OP-02, OP-12).

## 1. Alcance y dependencias
- Componente TR-EDGE (MOD-21), procesos TR-P09 y TR-P12. Latido cada 60 s, estado del parque en la consola, alerta SIN_DATOS si no reporta en 5 min en horario de operación, y actualizaciones firmadas por anillos PILOTO y GENERAL.
- Release: plan **R4 (backlog 2028)**. SRS: Should/R2.
- Historia: ninguna. Horas estimadas: 12-14 h.
- Dependencias: `edge-enrolamiento` (agente y canal), OBS (spec 21 da métricas técnicas; reglas y alertas por sucursal son TR-OBS negocio, RF 107-108, R3), SOP (R3: agente de soporte N1/N2 ve el parque), consola de plataforma (17b), CFG o ORG para el horario de operación de la sucursal.
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| A | edge-latido-parque | 138 (pasos 1-3) | 6-7 | edge-enrolamiento, 17b, 21 |
| B | edge-actualizacion-anillos | 138 (pasos 4-5) | 6-7 | A |

- A, áreas: (a) recepción del latido (versión, dispositivos, cola pendiente) y estado EN_LINEA/FUERA_DE_LINEA; (b) detección de silencio > 5 min en horario de operación → alerta SIN_DATOS sin duplicar; (c) vista del parque en `plataforma-consola`.
- B, áreas: (a) publicación de versión firmada y asignación a anillo; (b) en el agente: descarga, verificación de firma, instalación fuera de horario y reporte en el latido; (c) vista de despliegue por anillo.
- Fuera de alcance: reglas de alerta configurables (TR-OBS RF-107, R3), tickets automáticos (TR-SOP, R3), control remoto del equipo, telemetría de negocio.
- Constitución: 1, 2, 3 (el admin del cliente solo ve sus agentes; el operador de plataforma ve todos con permiso explícito), 5, 9 (llave privada de firma fuera del repo y del servidor de API), 10; código limpio; diseño UI.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-138 | Monitorear y actualizar agentes de forma remota | plat.edge.gestionar | APP-01 | TR-RN-046 | TR-RNF-108, 127 | Admin de plataforma, Agente de soporte (N1/N2), Planificador de tareas |

- **138** precondición: existen agentes enrolados. Flujo: 1) latido cada 60 s; 2) actualiza estado y registra métricas en TR-OBS; 3) sin latido en 5 min en horario de operación abre alerta SIN_DATOS; 4) el admin publica una versión para PILOTO y luego GENERAL; 5) el agente descarga, verifica firma e instala fuera de horario. Datos: agente_id, version, dispositivos[] (tipo IMPRESORA|CAJON|BIOMETRICO|KIOSCO|PANTALLA, estado), cola_pendiente (entero), ultimo_latido, anillo (PILOTO|GENERAL). Relacionados: TR-EDGE, TR-OBS, TR-SOP.

## 3. Criterios GWT
- **TR-CA-336** (Positivo, «Actualización en anillo piloto»): 5 agentes en PILOTO | se publica 1.8.0 para PILOTO | solo esos 5 se actualizan fuera de su horario.
- **TR-CA-337** (Negativo, «Paquete sin firma válida»): firma inválida | el agente lo descarga | rechaza la instalación y reporta el error en el latido.
- **TR-CA-338** (Borde, «Agente sin latido»): «Huancayo» no reporta hace 6 min en horario | se evalúan las reglas | alerta SIN_DATOS para la sucursal.

Faltan y se proponen: fuera del horario de operación no se abre alerta; la alerta se cierra sola al volver el latido y no se duplica por sucursal (RNF-127); admin del tenant A no ve agentes de B; instalación fallida revierte a la versión anterior y lo reporta; versión retirada no se instala; `cola_pendiente` alto (p. ej. > 1 000) se marca en la vista.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-046 | Operación offline hasta 72 h; al reconectar sincroniza en orden; la nube prevalece. |
| TR-RNF-108 | 72 h offline sin pérdida; 10 000 eventos en < 5 min. |
| TR-RNF-127 | Evaluador de alertas cada minuto; detección ≤ 2 min; 0 alertas duplicadas por regla y sucursal. |

Heredados por CLAUDE.md: 001/002/003, 008, 010, 011, 012 (integridad del paquete de actualización), 013/112 (publicar versión auditado), 024/119, 025, 026, 101, 106.

## 5. Historia del backlog
Sin historia (R4). Relacionadas: spec 21 (OTel a Grafana Cloud, métricas del outbox con `registrarMetricasOutbox`; dejó fuera «Observabilidad de negocio TR-OBS (TR-RF-106 a 110…): R3»), R3 indicativo `obs-negocio-whatsapp` y `soporte`.

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta: `db/04c_edge_gestion.sql`.
- `edge.agente` (de `edge-enrolamiento`): `ultimo_latido`, `version`, `anillo`, `cola_pendiente`, `dispositivos jsonb`. El latido actualiza la fila (alto volumen: 1/min por agente; usar `UPDATE` simple sin `version`, o Redis con volcado periódico, P1).
- `edge.version_agente` (version PK semver, url_paquete, sha256, firma, publicada_en, retirada boolean).
- `edge.despliegue` (version, anillo, publicado_por, publicado_en; PK (version, anillo)).
- `edge.alerta` (id, tenant_id, sucursal_id, agente_id, tipo SIN_DATOS, abierta_en, cerrada_en; índice único parcial `(agente_id, tipo) WHERE cerrada_en IS NULL` para no duplicar). Si TR-OBS negocio ya existe, usar `obs.alerta` (P3).
- **Eventos**: `edge.sin_datos` (abre), `edge.latido_recuperado` (cierra), `edge.version_publicada` (auditoría).
- **Puertos**: `VerificadorFirma` en el agente (llave pública embebida en el instalador), `AlmacenPaquetes` (objetos firmados; TR-ARC o almacenamiento de releases), `HorarioOperacion` (de la sucursal).
- **Permisos**: `plat.edge.gestionar` (operador: parque, publicar versiones; sensible). Para el admin del cliente ver sus agentes basta `plat.edge.enrolar` (ver `edge-enrolamiento-impresion.md`).
- Tarea en el worker cada minuto (BullMQ repetible) que busca agentes silenciosos: patrón de `VerificarTodosLosTenants` (spec 20b) y vencimientos (spec 12).

## 7. Código base relacionado
- **Se reutiliza**: `observabilidad` (`ObservabilidadModule`, métricas OTel); worker con tareas programadas (`apps/worker/src/cli/vencimientos.cli.ts`, `apps/worker/src/auditoria/verificacion.module.ts`); `consola-tenants` y `plataforma-consola` (17b) como base de la vista del parque; `shared/ui` (`vit-tabla`, `vit-chip-estado` con `TonoEstado` para EN_LINEA/FUERA_DE_LINEA, `vit-filtros`).
- **Falta**: horario de operación por sucursal (no existe en `org.sucursal` ni en CFG), almacenamiento de paquetes, firma de releases en CI, TR-OBS negocio (R3).

## 8. Diagramas relevantes
- `01-analysis/.../6_Plataforma_Operacion/OP-01_Mapa_de_la_plataforma_de_operacion.mmd`.
- `.../OP-02_Arquitectura_de_observabilidad_comprar_el_motor_construir_la_capa_de_n.mmd`.
- `.../OP-12_Modelo_de_datos_del_Centro_de_Soporte_y_de_la_observabilidad_de_negoci.mmd` (alertas, SIN_DATOS).
- `.../OP-13_Hoja_de_ruta_de_la_plataforma_de_operacion.mmd`.

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- «Abre una alerta SIN_DATOS» presupone el motor de alertas de TR-OBS (R3).
- «Horario de operación» no existe como dato en ORG ni CFG.
- Quién firma los paquetes y dónde vive la llave no está definido.

Preguntas, con recomendación:
1. ¿Latido a la base o a Redis? Recomendación: Redis (`SET edge:latido:<agente> … EX 600`) y volcado a `edge.agente` cada 5 min o al cambiar de estado; la detección lee Redis.
2. ¿Horario de operación? Recomendación: parámetro CFG por sucursal `plat.sucursal.horario_operacion` (JSON por día); sin valor, se alerta las 24 h.
3. ¿Alertas propias o de TR-OBS? Recomendación: tabla `edge.alerta` mínima ahora con el mismo modelo que OP-12, migrable a `obs.alerta` cuando llegue TR-OBS negocio.
4. ¿Firma de releases? Recomendación: firma Ed25519/ES256 en el pipeline de CI con llave en secretos del CI; el agente embebe la pública; la API nunca tiene la privada.
5. ¿Ventana de instalación? Recomendación: fuera del horario de operación de la sucursal y nunca con `cola_pendiente > 0`.
