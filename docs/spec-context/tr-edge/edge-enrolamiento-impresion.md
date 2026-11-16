# Contexto para edge-enrolamiento-impresion

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx (hojas Módulos, RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores), `plan.md` (R4), `3_plan.json`, `01-analysis/.../3_Integracion_BD_Institucional/INT-02` e `INT-04`.

## 1. Alcance y dependencias
- Componente TR-EDGE (MOD-21, APP-04 «Agente local (edge)»), procesos TR-P12, TR-P01 y TR-P04. Instalación y enrolamiento del agente en una sucursal con código de un solo uso, e impresión ESC/POS con apertura de cajón.
- Release: plan **R4 (backlog 2028)**: «TR-EDGE (agente local)». SRS: Must/MVP. Manda el plan. Consumidores: REST (I), COL (E), LIB (I), GYM (E), CLI (I), LEX (I) según la hoja Consumidores; SazónPOS ya imprime comandas hoy por su cuenta.
- Historia: ninguna. Horas estimadas: 18-20 h.
- Dependencias: ORG (sucursal, spec 03/17a), SEG (07 `@Permiso`; credencial propia del dispositivo, distinta de Supabase Auth), CFG (configuración de impresoras por sucursal), AUD (20a), FE (R2) para el contenido del comprobante. Primera app nueva del monorepo fuera de `api`/`worker`/frontends: `apps/edge` (Node 24).
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| A | edge-enrolamiento | 134 | 9-10 | 07, 17a, 17c (UI de código), 21 |
| B | edge-impresion-cajon | 135 | 8-9 | A |

- A, áreas: (a) back: `edge.agente`, `edge.codigo_activacion` (8 caracteres, un uso, 30 min) y canje por credencial del dispositivo; (b) `apps/edge` mínimo: instalador/CLI que canjea el código, guarda la credencial cifrada y abre el canal con la nube; (c) UI en `admin-cliente` (generar código, ver agentes) y estado EN_LINEA en consola.
- B, áreas: (a) modelo de destino lógico (CAJA-01, COCINA) → impresora física (USB, red, Bluetooth) en la configuración del agente; (b) trabajo de impresión por Socket.IO o cola local, ESC/POS, pulso de cajón, copias 1-3; (c) reporte IMPRESO/ERROR y reintento.
- Fuera de alcance: cola offline y caché (`edge-offline-cache-bloques.md`), latido, alertas y actualización remota (`edge-gestion-remota.md`), plantillas de comprobantes de TR-FE (R2), biométricos, kiosco y pantallas de llamado (plugins de producto), firma de código del instalador.
- Constitución: 1, 2, 3 (el agente solo actúa en su tenant y sucursal), 5, 8, 9 (credenciales del dispositivo fuera del repo), 10 (impresoras detrás de puertos); código limpio; diseño UI.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-134 | Enrolar agente local | plat.edge.enrolar | APP-04 | TR-RN-046, 001 | TR-RNF-108, 011 | Administrador del cliente, Usuario operativo |
| TR-RF-135 | Imprimir en impresora térmica y abrir cajón | plat.edge.imprimir | APP-04 | TR-RN-046 | TR-RNF-108, 001 | Módulo de producto consumidor, Usuario operativo |

- **134** precondición: el producto requiere agente local y la sucursal existe. Flujo: 1) el admin genera el código para la sucursal (30 min); 2) el técnico instala e ingresa el código; 3) el agente se registra, recibe certificado de cliente y configuración (impresoras, dispositivos, serie offline); 4) la consola lo muestra EN_LINEA. Datos: codigo_activacion (8 caracteres, un uso, 30 min), sucursal_id, nombre_equipo, sistema_operativo, version_agente. Relacionados: TR-EDGE, TR-ORG, TR-SEG.
- **135** precondición: agente enrolado con impresoras configuradas. Flujo: 1) el producto envía el trabajo con destino lógico por Socket.IO o cola local; 2) el agente resuelve la impresora física; 3) imprime y, si se indica, abre el cajón; 4) reporta IMPRESO o ERROR (sin papel, desconectada) y reintenta. Datos: destino, tipo (COMPROBANTE|COMANDA|TICKET|PRECUENTA), contenido (ESC/POS o plantilla), abrir_cajon, copias (1-3). Relacionados: TR-EDGE, TR-FE.
- Interfaz (hoja Componentes): «Agente plataforma-edge: enrolamiento, impresión ESC/POS y cajón, cola offline cifrada, caché local, latido y actualización remota; canal Socket.IO con la nube». Forma de integración: «plugins por producto».

## 3. Criterios GWT
- **TR-CA-326** (134, Positivo): código `K7M2Q9XP` para «Huancayo» | lo ingresa dentro de 30 min | enrolado y EN_LINEA en la consola.
- **TR-CA-327** (134, Negativo): `K7M2Q9XP` ya usado | se ingresa en otro equipo | «Código inválido o usado» y no se enrola.
- **TR-CA-328** (135, Positivo): COCINA con impresora de red 192.168.1.50 | REST envía comanda a COCINA | se imprime y reporta IMPRESO.
- **TR-CA-329** (135, Negativo): impresora de caja sin papel | se envía boleta | ERROR «Sin papel» y el POS muestra alerta con opción de reimprimir.
- **TR-CA-330** (135, Positivo): cobro en efectivo | boleta con `abrir_cajon = verdadero` | se imprime y se abre el cajón.

Faltan y se proponen: código vencido (> 30 min) rechazado; código de la sucursal X no enrola en Y ni en otro tenant; agente revocado no se conecta; destino lógico inexistente → ERROR `DESTINO_DESCONOCIDO`; trabajo repetido (mismo id) no imprime dos veces; cajón sin impresión no permitido (o sí: P5); el contenido del trabajo no se loguea (puede tener datos del cliente).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-046 | El agente opera sin internet hasta 72 h con bloques de numeración y catálogos en caché; al reconectar sincroniza en orden y la configuración de la nube prevalece. |
| TR-RN-001 | Toda entidad lleva tenant_id (el agente pertenece a tenant y sucursal). |
| TR-RNF-108 | El agente mantiene la operación sin internet y sincroniza sin pérdida: 72 h offline, 10 000 eventos en < 5 min. |
| TR-RNF-011 | Cifrado y secretos (credencial del dispositivo protegida en el equipo, TLS con la nube). |
| TR-RNF-001 | Desempeño de operaciones de mostrador (la impresión no debe frenar la venta). |

Heredados por CLAUDE.md: 002/003, 008, 010, 012, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog
Sin historia (R4). Relacionadas: spec 22 (sazonpos-org-seq-cfg: restaurante = sucursal) y CC-D01 «integración por los bordes» de SazónPOS (hoy imprime por su cuenta).

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta: `db/04c_edge.sql` (prefijo 04 = R4, a confirmar).
- `edge.agente` (id, tenant_id, sucursal_id, nombre_equipo, sistema_operativo, version_agente, estado ENROLADO|EN_LINEA|FUERA_DE_LINEA|REVOCADO, huella_credencial, anillo PILOTO|GENERAL, ultimo_latido NULL, version). RLS. FK compuesta `(tenant_id, sucursal_id)` a `org.sucursal` como `seq.serie`.
- `edge.codigo_activacion` (codigo_hash, tenant_id, sucursal_id, generado_por, vence_en, usado_en NULL, agente_id NULL). El canje busca por código sin contexto de tenant: función `SECURITY DEFINER` con `FOR UPDATE` (un solo uso).
- `edge.impresora` / configuración (tenant_id, agente_id, destino_logico, conexion USB|RED|BLUETOOTH, direccion, ancho_papel, cajon boolean). Podría vivir como JSON versionado de configuración del agente (P3).
- **Eventos**: `edge.agente_enrolado`, `edge.agente_revocado` (auditoría por outbox). El resultado de impresión no va al outbox (alto volumen): va por el canal y a métricas.
- **Puertos** (nube, lib `libs/plataforma/edge`): `EmisorCredencialDispositivo`, `CanalAgentes` (Socket.IO gateway en `apps/api` o servicio aparte). **Puertos** (agente, `apps/edge`): `Impresora` (adaptadores ESC/POS por USB, red TCP 9100, Bluetooth), `AlmacenCredencial` (cifrado con llave del SO).
- **Permisos**: `plat.edge.enrolar` (admin cliente: generar código, ver y revocar agentes; sensible), `plat.edge.imprimir` (productos que envían trabajos).
- **Nx**: `apps/edge` con `scope:plataforma`, `type:app`; la lib compartida entre nube y agente (contratos de mensajes) en `libs/shared/contracts` o `libs/plataforma/edge-contratos`.

## 7. Código base relacionado
- **No existe** nada de edge en el repo ni en `docs/.../codigo/`. Tampoco Socket.IO. `sync.outbox.origin` ya acepta `'EDGE'` (spec 02, `db/01e_sync_outbox.sql`).
- **Se reutiliza**: `org` (sucursal); `seguridad` (`@Permiso`; patrón de función `SECURITY DEFINER` sin tenant de `db/01b_seg_soporte.sql`); `auditoria` (`EVENTOS_AUDITADOS` para sumar los eventos de edge); `kernel-infra` (`uuidV7`, `OutboxPublisher`); `shared/ui` y `admin-cliente` para la pantalla de agentes (pantalla tipo lista + panel lateral para generar código).
- **Falta**: app `apps/edge`, empaquetado e instalador por SO, Socket.IO, credencial de dispositivo (mTLS o JWT propio), drivers ESC/POS.

## 8. Diagramas relevantes
- `01-analysis/.../3_Integracion_BD_Institucional/INT-02_Vista_general_de_la_integracion_escenarios_A_y_B.mmd` («Servidor local» con cola SQLite y conector; equivalente del agente).
- `.../INT-04_Operacion_sin_internet_y_convergencia_doble_via.mmd`.
- `01-analysis/.../7_Control_Cambios_SazonPOS/CC-D01_Integracion_por_los_bordes_que_cambia_y_que_no.mmd`.
- `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/1_Mermaid/PL-09_Ambientes_y_flujo_de_entrega.mmd` (no incluye el agente: hay que sumarlo).

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- «Certificado de cliente» sugiere mTLS; la nube corre en Railway/Vercel (spec 21), donde mTLS no es directo.
- «Por Socket.IO o por la cola local»: no dice quién habla con quién (POS → agente local, nube → agente).
- La configuración de impresoras no tiene RF de administración.
- El agente es una app de escritorio/servicio: empaquetado, firma e instalación no tienen spec.

Preguntas, con recomendación:
1. ¿Credencial del dispositivo? Recomendación: par de llaves ES256 generado en el agente; el canje del código registra la llave pública y la nube emite tokens cortos firmados por el agente (o JWT propio de 15 min por desafío). Sin mTLS hasta tener infraestructura que lo soporte.
2. ¿Canales? Recomendación: POS del local → agente por HTTP/WebSocket local (LAN); agente ↔ nube por Socket.IO saliente (no abre puertos en el local). Un trabajo enviado desde la nube viaja por ese canal.
3. ¿Dónde se configura la impresora? Recomendación: en la nube por sucursal (UI en `admin-cliente`), bajada al agente como paquete de configuración (lo mismo que RF-137); la detección USB/Bluetooth la reporta el agente.
4. ¿Tecnología del agente? Recomendación: Node 24 + TypeScript (mismo stack), SQLite para la cola, empaquetado como servicio de Windows y systemd; confirmar librería ESC/POS con `ctx7` al redactar.
5. ¿Abrir cajón sin imprimir? Recomendación: permitirlo como trabajo propio `ABRIR_CAJON` con permiso sensible y auditado (apertura sin venta es punto de fraude).
6. ¿Quién genera el código? Recomendación: admin con alcance en la sucursal, MFA vigente; el código se guarda solo con hash.
