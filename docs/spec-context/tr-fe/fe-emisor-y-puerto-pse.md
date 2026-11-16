# Contexto para fe-emisor-y-puerto-pse

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Actores), `plan.md` (backlog R2, riesgos, ADR), `3_plan.json`, `2_Estructura/estructura_backend.txt`, `1_Mermaid/PL-10`, diagramas T-06 y T-S3, código real en `libs/plataforma/*`.

## 1. Alcance y dependencias
- Historia **R2-04** (sprint 14, 6 h, Back, R2): «Emisor electrónico y adaptador PSE/OSE detrás de un puerto», TR-RF-052. La UI del emisor es **R2-11** (ver `fe-admin-ui.md`).
- PL-10: `SEQ & CAT & PER --> FE`, `ARC --> FE`. Este primer slice solo necesita kernel, ORG, SEG, CFG, CAT, AUD (todo implementado). No necesita PER, IDN ni ARC (ver P3).
- Lib nueva `libs/plataforma/comprobantes` (nombre del árbol de `estructura_backend.txt`: «TR-FE · puerto PSE/OSE · representación impresa»). Etiquetas `scope:plataforma`, `type:backend`, `comp:fe`. Alias `@vitrina/plataforma/comprobantes`.
- Horas: el plan da 6 h. Con bóveda de secretos, validación del PFX, adaptador real en beta y simulador, la estimación realista es 12-14 h. Partición:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| A | fe-emisor-configuracion | 052 pasos 1-3, alerta de vencimiento | 7-8 | 09 (CFG), 19a (CAT), 20a (AUD) |
| B | fe-puerto-pse-adaptador | 052 pasos 4-5; base del envío de 053/054/057/058/059 | 5-6 | A; decisión P1 |

- Áreas A: (a) esquema `fe` + agregado `Emisor` + API `/v1/fe/emisores`, (b) bóveda de secretos y validación del certificado, (c) tarea diaria de vencimiento. Áreas B: (a) `PseOsePort` y su contrato, (b) adaptador del proveedor elegido + simulador, (c) envío de prueba y paso a producción.
- Fuera de alcance: emisión real (053/054), CDR (059), UI (R2-11), correo de alerta (lo entrega TR-NOT, R2-09), rotación automática de secretos de otros componentes (pasarela de pagos es R3).
- Constitución: reglas 1, 2, 3, 4, 5, 6, 8, 9 (secretos solo por entorno), 10 (integración externa detrás de puerto), 11 (TypeORM). Código limpio. DoD completo.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-052 | Configurar emisor electrónico | plat.fe.configurar | APP-02 | TR-RN-009, TR-RN-021 | TR-RNF-113, TR-RNF-017 | ACT-06 Encargado de facturación del cliente |

- Precondición: empresa con RUC activo; el actor con MFA vigente (aal2, `@RequiereMfa`).
- Flujo: 1) elige proveedor PSE/OSE e ingresa credenciales; 2) sube el certificado (.pfx) y su clave; 3) el sistema valida que el certificado sea del RUC y esté vigente, y lo guarda en el gestor de secretos; 4) envío de prueba en beta; 5) muestra el resultado y permite pasar a producción.
- Datos: `proveedor` (catálogo PROVEEDOR_FE, no existe), `usuario_sol` o `client_id`, `clave` (secreto), `certificado` (.pfx <= 50 KB), `clave_certificado` (secreto), `ambiente` (BETA|PRODUCCION), `regimen_igv` (GENERAL|REDUCIDO_RESTAURANTES), `leyenda_pie` (0-300).
- Salida: emisor configurado y verificado; alerta 30 días antes del vencimiento del certificado.
- Componentes: TR-FE, TR-ARC, TR-AUD, TR-NOT. Procesos TR-P04 y TR-P01.
- Interfaz (hoja Componentes): TR-FE provee `ComprobantePort.emitir (01, 03, 07, 08)`, resumen, baja, PDF/ticket, consulta pública, workers de envío y contingencia. El puerto `PseOsePort` no está nombrado en el SRS: lo nombra el plan («adaptador PSE/OSE detrás de un puerto»).

## 3. Criterios GWT
- **TR-CA-133** (Positivo, «Configuración y prueba exitosa»): RUC 20601234561, certificado vigente de ese RUC, prueba en beta -> «Conexión correcta: comprobante de prueba aceptado» y habilita producción.
- **TR-CA-134** (Negativo, «Certificado de otro RUC»): certificado del RUC 20512345678 para la empresa 20601234561 -> «El certificado no corresponde al RUC de la empresa».
- **TR-CA-135** (Borde, «Certificado por vencer»): vence el 05/11/2026, job del 06/10/2026 -> alerta de 30 días al encargado.
- Faltan (proponer): certificado vencido; clave del PFX incorrecta; archivo > 50 KB o no PFX; pasar a producción sin prueba beta aceptada (409); actor sin aal2 (403); aislamiento: otro tenant no lee el emisor; ninguna respuesta ni log devuelve secretos (RNF-113, RNF-026); la alerta de 30 días no se repite el mismo día (idempotencia).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-009 | Permisos sensibles exigen MFA <= 15 min y quedan auditados. Aplica a `plat.fe.configurar`. |
| TR-RN-021 | IGV con tasa vigente parametrizada (18 % = 16 + 2 IPM) o reducida según régimen del emisor; redondeo a 2 decimales. Aquí solo fija el `regimen_igv`. |
| TR-RNF-113 | Secretos del tenant (certificado, credenciales OSE) cifrados con clave por tenant en gestor de secretos y rotados sin interrupción; 0 secretos en texto plano en BD o repo. |
| TR-RNF-017 | Conformidad UBL 2.1 y catálogos SUNAT; 100 % aceptados en homologación. |
| TR-RNF-007 | Integraciones externas con timeout, reintento, circuit breaker; el adaptador PSE nace con timeout. |
| TR-RNF-011 | Cifrado en tránsito y en reposo; secretos en gestor de secretos. |

Heredados por CLAUDE.md: 001/002/003, 008, 010, 012, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R2-04 | 14 | 6 | TR-FE | Emisor electrónico y adaptador PSE/OSE detrás de un puerto | TR-RF-052 | Back | R2 |

Relacionadas: R2-11 (UI del emisor, 5 h, sprint 16), R2-14 (homologación con el PSE en beta, 4 h, sprint 17), R2-05 (emisión). Riesgo del plan: «Homologación de FE: usar un PSE con API probada; iniciar homologación en el sprint 14, no al final».

## 6. Tablas SQL, eventos, puertos y permisos
- **Migración**: `db/01?_fe.sql` (+ `rollback/` y `tests/`). La numeración sigue a 01i; PER, IDN y ARC van antes en R2, así que FE queda tentativamente en `01m_fe.sql` (confirmar al implementar). Esquema `fe`, RLS `ENABLE + FORCE` por `app.tenant_id`, `REVOKE` a `anon`/`authenticated` (regla 8).
- **`fe.emisor`** (propuesta): `id, tenant_id, empresa_id (único), proveedor, ambiente (BETA|PRODUCCION), estado (BORRADOR|VERIFICADO|PRODUCCION), regimen_igv, leyenda_pie, usuario_proveedor, secreto_credencial_id, secreto_certificado_id, certificado_ruc, certificado_vence_en, certificado_huella_sha256, modo_boletas (INDIVIDUAL|RESUMEN), ultima_prueba_en, ultima_prueba_resultado, version, creado_por/en, modificado_por/en`. FK `(tenant_id, empresa_id)` a `org.empresa`.
- **`fe.secreto`** (si P2 = cifrado en la app): `id, tenant_id, tipo (CREDENCIAL|CERTIFICADO|CLAVE_CERTIFICADO), cifrado bytea, iv, dek_cifrada, version_clave_maestra, creado_en, rotado_en`. Nunca sale por la API.
- **`fe.aviso_certificado`** (idempotencia de la alerta, mismo patrón que `org.aviso_vencimiento` del spec 12): `tenant_id, emisor_id, dias_antes, vence_en, fecha_ejecucion`.
- **Eventos** (no están en el SRS; proponer): `fe.emisor.configurado`, `fe.emisor.produccion_habilitada`, `fe.certificado.por_vencer` (lo consume TR-NOT en R2-09). Registro de esquemas con `registrarEsquemasFe(validator)` en api y worker, como `registrarEsquemasCat`.
- **Puertos** (en `application/ports/`):
  - `PseOsePort`: `probarConexion(emisor)`, `enviarComprobante(documento)`, `enviarResumen(resumen)`, `enviarBaja(baja)`, `consultarTicket(ticket)`. Respuesta común: `{ resultado: ACEPTADO|ACEPTADO_CON_OBSERVACIONES|RECHAZADO|ERROR_TECNICO|EN_PROCESO, codigo, descripcion, observaciones[], cdr?: bytes, ticket?, hash? }`. Errores técnicos (timeout, 5xx) separados de rechazos (TR-CA-160 depende de esa distinción).
  - `BovedaSecretos`: `guardar(tenantId, tipo, valor) -> secretoId`, `leer(secretoId)`, `rotar(...)`.
  - `LectorCertificado`: `leer(pfx, clave) -> { ruc, venceEn, huella }` (adaptador con node-forge u OpenSSL; verificar con ctx7 al redactar).
- **Permisos** (SRS): `plat.fe.configurar` (sensible, aal2). Endpoints propuestos: `GET/PUT /v1/fe/emisores/{empresaId}`, `POST .../certificado` (multipart), `POST .../prueba`, `POST .../produccion`. Manifiesto PLAT sube de `1.15.0` a la siguiente versión con módulo/opción «Facturación electrónica» y rol propuesto `PLAT_ENCARGADO_FACTURACION` (ACT-06; no existe).
- **Parámetros** (TR-CFG, no existen en el manifiesto): `plat.fe.dias_aviso_certificado` (30), `plat.fe.ambiente_permitido` o variable de entorno que impida PRODUCCION en dev y staging.

## 7. Código base relacionado
- **Existe y se reutiliza**: `kernel-infra` (`TypeOrmUnitOfWork`, `OutboxPublisher`, `uuidV7`, `SystemClock`, `AlsTenantContext`); `seguridad` (`Permiso`, `RequiereMfa`, `PermisoGuard`, `ContextoTenantInterceptor`); `auditoria` (`AUDITORIA`/`AuditoriaPort`, `@Auditable`) para auditar la configuración; `org` (`Empresa` con `ruc`, `razonSocial`, `nombreComercial`, `direccionFiscal`, `ubigeo`; `Ruc` en `domain/valores.ts`; `ZONA_VENCIMIENTOS = 'America/Lima'`, `fechaCalendarioDe`); `parametros` (`PARAMETRO_PORT`); `catalogos` (`CATALOGO_PORT.validarItem` para PROVEEDOR_FE).
- **Patrones**: tarea diaria con aviso idempotente en `apps/worker/src/vencimientos/` (spec 12) y cron configurable en `apps/worker/src/auditoria/verificacion.module.ts` (spec 20b). Adaptador nulo como `PadronRucNulo` (`libs/plataforma/org`).
- **No existe**: lib `comprobantes`, esquema `fe`, gestor de secretos (spec 21 solo puso gitleaks en CI para RNF-113), catálogo PROVEEDOR_FE, librería de PFX. `codigo/` del plan no trae nada de FE.

## 8. Diagramas relevantes
- `9_Plan_Implementacion/PL-10_Dependencias_entre_componentes_transversales.mmd`.
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-06_Modelo_de_dominio_Comprobantes_electronicos_y_pagos.mmd` (Empresa como emisor; `EnvioPse`).
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-S3_Secuencia_Emision_de_comprobante_electronico.mmd` (participante «PSE/OSE (adaptador)»).
- `7_Control_Cambios_SazonPOS/CC-D02_Situacion_actual_y_situacion_objetivo.mmd` (objetivo «facturación electrónica (PSE/OSE)»).

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- El SRS pide subir el certificado y firmar el XML (RF-052, 053), pero el plan mitiga el riesgo con «un PSE con API probada». Un PSE con API JSON firma y genera el XML él mismo; un OSE o SUNAT directo exigen que la plataforma genere UBL 2.1 y firme. Cambia el tamaño de R2-05 a la mitad o al doble.
- `TR-ARC` figura como componente de 052, pero un PFX es un secreto, no un archivo de negocio.
- «Clave por tenant» (RNF-113) y «gestor de secretos» no tienen producto elegido.
- El catálogo PROVEEDOR_FE no existe en CAT ni en `docs/datos-oficiales`.

Preguntas candidatas, con recomendación:
1. **¿PSE, OSE o SUNAT directo (SEE-Del Contribuyente)?** Recomendación: un PSE con API REST/JSON para R2 (lo pide el riesgo del plan y hace viable el 30/06/2027), con `PseOsePort` definido a nivel de comprobante de dominio para que un adaptador OSE/SUNAT directo (UBL propio + firma XMLDSig) se agregue después sin tocar dominio. Elegir proveedor concreto antes del sprint 14 (precio por comprobante, beta gratuita, soporte de resumen y baja, devuelve XML, CDR y hash).
2. **¿Gestor de secretos?** Recomendación: cifrado por sobre en la app (AES-256-GCM; una clave de datos por tenant cifrada con una clave maestra que solo vive en variables de entorno de `apps/api` y `apps/worker`; columna de versión para rotar). Alternativa: Supabase Vault, pero no da clave por tenant y acopla el dominio a Supabase. Todo detrás de `BovedaSecretos`.
3. **¿Esperar a PER, IDN y ARC?** Recomendación: no para este slice. El emisor no los usa; el PFX va a la bóveda, no a ARC (desviación documentada).
4. **¿Certificado obligatorio si el PSE firma?** Recomendación: obligatorio solo si el proveedor lo requiere (`requiere_certificado` como atributo del ítem PROVEEDOR_FE); la validación de RUC y vigencia (CA-134, CA-135) se implementa igual porque es barata y la exige el SRS.
5. **¿Catálogo PROVEEDOR_FE?** Recomendación: catálogo GLOBAL sembrado en la migración con el proveedor elegido y `SIMULADO` (solo dev y CI); atributos `requiere_certificado`, `soporta_resumen`, `url_beta`.
6. **¿Cómo llega la alerta de 30 días?** Recomendación: evento `fe.certificado.por_vencer` con aviso idempotente por día (patrón spec 12); el correo lo agrega TR-NOT en R2-09 como consumidor. Mientras tanto se ve en la UI del emisor.
7. **¿Producción en staging?** Recomendación: variable de entorno que solo permite BETA en dev y staging; PRODUCCION solo con prueba beta aceptada en las últimas 24 h y aal2.
8. **¿Rol ACT-06?** Recomendación: rol predefinido `PLAT_ENCARGADO_FACTURACION` con `plat.fe.configurar`, `plat.fe.monitorear`, `plat.fe.baja`, `plat.fe.nota_credito`; los productos lo asignan por sucursal.
