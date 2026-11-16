# Contexto para edge-offline-cache-bloques

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes), `plan.md` (R4), `3_plan.json`, spec 10 (`seq-correlativos`), spec 11, spec 19a, `db/01d_seq.sql`, `db/01e_sync_*.sql`, `01-analysis/.../3_Integracion_BD_Institucional/INT-04`.

## 1. Alcance y dependencias
- Componentes TR-EDGE (MOD-21) y TR-SEQ (MOD-05, RF-038). Operación sin internet: el agente reserva bloques de numeración de una serie exclusiva, guarda las operaciones en cola cifrada, las sincroniza en orden al reconectar y mantiene una caché local de configuración y catálogos.
- Release: plan **R4 (backlog 2028)**. SRS: 136 Must/MVP, 137 Should/MVP, 038 Should/R2. El spec 10 dejó fuera «Reserva de bloques offline TR-RF-038 (R2)».
- Historia: ninguna. Horas estimadas: 24-26 h.
- Dependencias: `edge-enrolamiento` (agente enrolado con credencial), SEQ (spec 10: `seq.serie`, `seq.siguiente`, `CorrelativoPort`), EVT (02, 11: outbox con `origin = 'EDGE'`, idempotencia por `event_id`), CAT (19a: ETag y versiones), CFG (09: `cfg.versiones` por tenant), FE (R2) para validar comprobantes sincronizados.
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| A | seq-bloques-offline | 038 | 6-7 | 10, edge-enrolamiento |
| B | edge-cache-local | 137 | 7-8 | edge-enrolamiento, 09, 19a, 11 |
| C | edge-cola-offline-sync | 136 | 10 | A, B |

- A, áreas: (a) marca de serie offline del agente y tabla de bloques; (b) reserva atómica de N (10-1000) a nombre del agente; (c) conciliación de usados y liberación, con alerta por número fuera de rango.
- B, áreas: (a) paquetes declarados por el producto (catálogos, parámetros, precios, usuarios con PIN local) con versión y hash; (b) descarga inicial y diferencias cada 15 min o por evento; (c) servicio local de lectura para los equipos del local.
- C, áreas: (a) cola local cifrada (SQLite) con `event_id`, seq local, versión, estado PENDIENTE|ENVIADO|CONFIRMADO|CONFLICTO; (b) `POST /v1/edge/eventos` que aplica en orden e idempotente por `event_id` y escribe en el outbox con `origin = 'EDGE'`; (c) aviso de 70 h y bloqueo a las 72 h.
- Fuera de alcance: aplicación de cada operación de negocio (la hace cada producto con sus casos de uso; aquí el transporte y el orden), FE offline (contingencia de TR-FE), sincronización doble vía con SQL Server (INT-04, conector institucional).
- Constitución: 1, 2, 3, 4 (lo recibido del edge entra al outbox en la misma tx que su efecto), 5, 6, 8, 11 (`FOR UPDATE` de la serie como en el spec 10); código limpio.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-038 | Reservar bloques de numeración para operación offline | plat.serie.reservar_bloque | APP-03 | TR-RN-016, 046 | TR-RNF-108, 103 | Módulo de producto consumidor |
| TR-RF-136 | Operar sin internet con cola local | plat.edge.offline | APP-04 | TR-RN-046, 034, 016 | TR-RNF-108, 008 | Módulo de producto, Usuario operativo |
| TR-RF-137 | Mantener caché local de configuración y catálogos | plat.edge.cache | APP-04 | TR-RN-046 | TR-RNF-108, 102 | Módulo de producto consumidor |

- **038** precondición: serie marcada offline del agente y agente enrolado. Flujo: solicita bloque de N → reserva atómica a nombre del agente → emite localmente dentro del rango → al sincronizar informa usados; se marcan y se libera el resto si la política lo permite. Datos: agente_id, serie, cantidad (10-1000), rango_desde, rango_hasta (bigint), usados[] (bigint). Relacionados: TR-SEQ, TR-EDGE.
- **136** precondición: bloques de numeración y catálogos en caché. Flujo: detecta pérdida y la anuncia → los equipos envían operaciones al agente (origen EDGE, versión) → al reconectar envía en orden por seq local → la nube aplica idempotente por event_id y confirma → informa números usados. Datos: evento_local (event_id, tipo, agregado, version, payload, creado_en), estado (PENDIENTE|ENVIADO|CONFIRMADO|CONFLICTO), horas_sin_conexion. Relacionados: TR-EDGE, TR-EVT, TR-SEQ.
- **137** precondición: agente enrolado. Flujo: descarga paquete inicial declarado por el producto → se suscribe a eventos de cambio (`catalogo.actualizado`, `parametro.cambiado`, precios) → cada 15 min verifica versiones y baja diferencias → sirve los datos offline. Datos: paquetes[] (catálogos, parámetros, productos y precios, servicios, usuarios con PIN local), version_por_paquete, ultima_sincronizacion. Relacionados: TR-EDGE, TR-CAT, TR-CFG, TR-EVT.

## 3. Criterios GWT
- **TR-CA-098** (038, Positivo): serie B901 offline del agente de «Huancayo» | reserva 200 | rango 1 a 200 a nombre del agente.
- **TR-CA-099** (038, Negativo): reservado 1 a 200 | sincroniza comprobante 205 | rechaza ese comprobante y genera alerta de numeración.
- **TR-CA-331** (136, Positivo): 3 h sin internet y 420 operaciones | vuelve la conexión | se sincronizan en orden y quedan CONFIRMADO.
- **TR-CA-332** (136, Borde): durante el corte cambió el precio en la nube | sincroniza | prevalece la nube para nuevas operaciones; las offline conservan su precio.
- **TR-CA-333** (136, Borde): 70 h sin conexión | umbral de aviso | «Conecte a internet antes de 2 horas» y alerta a la consola al reconectar.
- **TR-CA-334** (137, Positivo): MEDIO_PAGO v4 | se publica `catalogo.actualizado` v5 | descarga v5 en < 1 min.
- **TR-CA-335** (137, Negativo): paquete de precios con hash distinto | lo verifica | descarta, conserva la anterior y reintenta.

Faltan y se proponen: dos agentes no reciben bloques solapados de la misma serie (concurrencia, RNF-103); número usado dos veces en el mismo bloque → CONFLICTO; evento reenviado tras corte de red a mitad de lote no se aplica dos veces (RNF-008); a las 72 h el agente deja de emitir (qué pasa exactamente, P4); paquete con PIN local nunca guarda el PIN en claro; agente revocado no puede reservar ni sincronizar; carga de 10 000 eventos en < 5 min (RNF-108).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-016 | Numeración atómica sin duplicados ni huecos por empresa, tipo y serie; reinicio NUNCA, ANUAL o DIARIO. |
| TR-RN-046 | Hasta 72 h offline con bloques y caché; al reconectar sincroniza en orden; la configuración de la nube prevalece. |
| TR-RN-034 | Outbox en la misma tx; al menos una vez; consumidor idempotente por `event_id`. |
| TR-RNF-108 | 72 h offline sin pérdida; 10 000 eventos sincronizados en < 5 min. |
| TR-RNF-103 | ≥ 200 números/s por serie con 50 hilos; 0 duplicados y 0 huecos. |
| TR-RNF-008 | Operaciones que cambian estado idempotentes. |
| TR-RNF-102 | Catálogo desde caché con ETag, 304 sin cambios (base del diff de paquetes). |

Heredados por CLAUDE.md: 001/002, 010, 011 (cola cifrada), 012, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog
Sin historia (R4). Relacionadas: spec 10 (dejó fuera RF-038), spec 09 (dejó fuera «caché del edge (R2+)»), spec 19a (ETag y versiones de catálogo), spec 11 (relay; `origin` EDGE ya transportado).

## 6. Tablas SQL, eventos, puertos y permisos
- Migraciones propuestas: `db/04c_edge_bloques.sql` (o `01d_seq_bloques.sql` si se considera extensión de SEQ, P1), `db/04c_edge_sync.sql`.
- `seq.serie`: agregar `offline_agente_id uuid NULL` (serie exclusiva de un agente). Restricción: una serie offline no se numera por `seq.siguiente` en línea (o sí, P2).
- `seq.bloque` (id, tenant_id, serie_id, agente_id, rango_desde, rango_hasta, reservado_en, conciliado_en, estado RESERVADO|CONCILIADO|LIBERADO; EXCLUDE o CHECK de no solape por serie). Reserva: `UPDATE seq.serie SET ultimo_numero = ultimo_numero + N … RETURNING` dentro de `FOR UPDATE` (mismo patrón que `seq.siguiente`).
- `seq.bloque_uso` (bloque_id, numero; PK) o `usados` como rango comprimido.
- `edge.evento_recibido` (event_id PK, tenant_id, agente_id, seq_local, estado APLICADO|CONFLICTO, motivo). Reutilizable: `sync.evento_procesado` con consumidor `edge-ingreso`.
- `edge.paquete` (tenant_id, sucursal_id, codigo, version, hash, generado_en): versión por paquete que el agente compara cada 15 min.
- **Eventos**: `seq.bloque_reservado`, `seq.numeracion_fuera_de_rango` (alerta, TR-CA-099), `edge.sin_conexion_prolongada` (TR-CA-333). Los eventos de negocio offline llegan con su propio `event_type` y `origin = 'EDGE'`.
- **Puertos**: `CorrelativoPort` ampliado o `ReservaBloquesPort` en `correlativos`; `ProveedorPaquete` por tipo (CAT, CFG, producto); en el agente: `ColaLocal` (SQLite cifrado), `CacheLocal`.
- **Permisos**: `plat.serie.reservar_bloque`, `plat.edge.offline`, `plat.edge.cache` (los ejerce el principal del agente, no un usuario).

## 7. Código base relacionado
- **Se reutiliza**: `db/01d_seq.sql` (`seq.serie` con `ultimo_numero`, `periodo`, `version`, `seq.siguiente` con `FOR UPDATE`, `seq.periodo_de`); `correlativos` (`CORRELATIVO_PORT`, `SerieAgotadaError`, `SerieInactivaError`, `ESQUEMAS_SEQ`); `db/01e_sync_outbox.sql` (`origin` CLOUD|EDGE, `version`); `db/01e_sync_relay.sql` (`sync.evento_procesado` por consumidor); `catalogos` (ETag y versión por catálogo, spec 19a); `db/01c_cfg.sql` (`cfg.version_tenant`, `cfg.versiones(p_tenant)`: ya da versión por tenant para invalidar la caché local).
- **Ojo**: reinicio ANUAL/DIARIO de una serie con bloques abiertos: el bloque reservado en un periodo no vale en el siguiente.
- **Falta**: todo lo del agente (cola, caché, cifrado), endpoint de ingreso de eventos del edge, aplicación por producto.

## 8. Diagramas relevantes
- `01-analysis/.../3_Integracion_BD_Institucional/INT-04_Operacion_sin_internet_y_convergencia_doble_via.mmd` (cola local, `POST /edge/events`, mismo `event_id` en el outbox).
- `.../INT-02_Vista_general_de_la_integracion_escenarios_A_y_B.mmd`.
- `01-analysis/.../8_Diseno_Piloto/2_Plataforma_Transversal/T-04_Modelo_de_dominio_Catalogos_parametros_y_correlativos.mmd` (sin bloques: habrá que agregarlos).
- `.../T-S7_Secuencia_Relay_del_outbox_hacia_los_consumidores.mmd`.

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- «Sin huecos» (RN-016) choca con liberar números no usados de un bloque: los liberados no vuelven a la serie en línea si la serie es exclusiva.
- Comprobantes SUNAT: la serie offline debe ser distinta (B901), pero el SRS no dice si se informa a SUNAT como contingencia.
- «La nube prevalece» (RN-046) vs. TR-CA-332 (las offline conservan su precio): prevalece para lo nuevo, no reescribe lo hecho.
- «Usuarios con PIN local» implica guardar credenciales en el equipo.
- No dice qué pasa a las 72 h.

Preguntas, con recomendación:
1. ¿Bloques en SEQ o en EDGE? Recomendación: en `correlativos` (`seq.bloque`, migración `01d_seq_bloques.sql`), porque es numeración; EDGE solo lo consume. Puede ir antes que el resto de TR-EDGE.
2. ¿Serie offline numerable en línea? Recomendación: no; serie exclusiva del agente (`offline_agente_id`), sin huecos dentro de cada bloque; los no usados se marcan LIBERADOS y no se reutilizan (se reporta el hueco con motivo, aceptado por ser serie de contingencia).
3. ¿Orden de aplicación? Recomendación: por `seq_local` del agente, en lotes; un CONFLICTO no frena el resto del lote pero sí los eventos del mismo agregado.
4. ¿72 h? Recomendación: aviso a las 70 h (TR-CA-333) y a las 72 h deja de emitir comprobantes (sí permite consultas), parámetro `plat.edge.horas_offline_max`.
5. ¿PIN local? Recomendación: hash argon2id del PIN en el paquete, cifrado en reposo; solo para usuarios con permiso de operar offline.
6. ¿Paquetes declarados cómo? Recomendación: el manifiesto del producto declara paquetes (código, fuente, filtro por sucursal); el agente pide `GET /v1/edge/paquetes/{codigo}?version=` y recibe 304 o el diff con hash SHA-256.
