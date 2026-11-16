# Mapa de componentes transversales

Checklist de los 21 componentes TR del SRS (`SRS_TR_Componentes_Transversales.xlsx`, hojas Módulos, RF y Componentes) contra lo implementado (specs 01 a 21) y el plan (`3_plan.json`, releases R0 a R3; R4 fuera del plan). Revisado el 2026-11-16.

Cobertura: 41 de 138 RF implementados (30 %). Los 97 restantes tienen paquete de contexto en `docs/spec-context/<carpeta>/`.

## Checklist por componente

| | Código | Componente (módulo) | RF | Hechos | Pendientes | Release | Contexto |
|---|---|---|---|---|---|---|---|
| [x] | TR-ORG | Organización y suscripciones (MOD-01) | 001-007 | 7 | — | R1 | `03`, `17a-c` |
| [ ] | TR-SEG | Seguridad y accesos (MOD-02) | 008-021 | 12 | 018, 021 | R1 / R4 | `tr-pendientes-base/` |
| [x] | TR-CAT | Catálogos y tablas maestras (MOD-03) | 022-029 | 8 | — | R1 | `19` |
| [ ] | TR-CFG | Parámetros jerárquicos (MOD-04) | 030-034 | 4 | 034 | R1 / R2 | `tr-pendientes-base/` |
| [ ] | TR-SEQ | Correlativos y series (MOD-05) | 035-038 | 3 | 038 | R1 / R4 | `tr-edge/` |
| [ ] | TR-PER | Personas (MOD-06) | 039-043 | 0 | 039-043 | R2 | `tr-per/` |
| [ ] | TR-IDN | Identidad DNI/RUC (MOD-07) | 044-051 | 0 | 044-051 | R2 / R4 | `tr-idn/` |
| [ ] | TR-FE | Facturación electrónica (MOD-08) | 052-064 | 0 | 052-064 | R2 / R3 | `tr-fe/` |
| [ ] | TR-PAG | Pagos y conciliación (MOD-09) | 065-073 | 0 | 065-073 | R3 / R4 | `tr-pag/` |
| [ ] | TR-NOT | Notificaciones (MOD-10) | 074-079 | 0 | 074-079 | R2 / R3 | `tr-not/` |
| [ ] | TR-ARC | Archivos (MOD-11) | 080-083 | 0 | 080-083 | R2 | `tr-arc/` |
| [ ] | TR-AUD | Auditoría y datos personales (MOD-12) | 084-091 | 4 | 088-091 (ARCO, incidentes) | R1 / R2 | `20`, `tr-aud-arco/` |
| [ ] | TR-EVT | Eventos de dominio (MOD-13) | 092-095 | 3 | 094 (registro de esquemas) | R1 | `tr-pendientes-base/` |
| [ ] | TR-REP | Reportes y tableros (MOD-14) | 096-099 | 0 | 096-099 | R3 | `tr-rep/` |
| [ ] | TR-IA | Servicios de IA (MOD-15) | 100-105 | 0 | 100-105 | R4 | `tr-ia/` |
| [ ] | TR-OBS | Observabilidad (MOD-16) | 106-110 | 0 (base técnica sí, spec 21) | 106-110 | R1 base / R3 negocio | `21`, `tr-obs-negocio/` |
| [ ] | TR-SOP | Centro de soporte (MOD-17) | 111-118 | 0 | 111-118 | R3 | `tr-sop/` |
| [ ] | TR-CMS | Gestor de contenidos web (MOD-18) | 119-124 | 0 | 119-124 | R3 | `tr-cms/` |
| [ ] | TR-POR | Portal del cliente final (MOD-19) | 125-129 | 0 | 125-129 | R3 | `tr-por/` |
| [ ] | TR-INT | Integración externa (MOD-20) | 130-133 | 0 | 130-133 | R4 | `tr-int/` |
| [ ] | TR-EDGE | Agente local (MOD-21) | 134-138 | 0 | 134-138 | R4 | `tr-edge/` |

Implementados (RF): 001-017, 019, 020, 022-033, 035-037, 084-087, 092, 093, 095. RF-087 (verificar integridad, fase R2 en el SRS) entró en el 20b.

## Facturación electrónica (TR-FE): qué falta

Nada de TR-FE existe: ni lib `libs/plataforma/comprobantes`, ni esquema, ni puerto PSE/OSE. Lo único reutilizable ya hecho son las tablas SUNAT importadas por catálogos (`tipo_comprobante`, `afectacion_igv`, `unidad_medida`, `moneda`, `tipo_doc_identidad`, `ubigeo`) y los correlativos (series por establecimiento, spec 10).

| RF | Capacidad | Prioridad / fase SRS | Historia del plan |
|---|---|---|---|
| 052 | Configurar emisor electrónico (certificado, credenciales PSE/OSE) | Must / MVP | R2-04 (back), R2-11 (UI) |
| 053 | Emitir factura (UBL 2.1) | Must / MVP | R2-05 |
| 054 | Emitir boleta | Must / MVP | R2-05 |
| 055 | Nota de crédito | Must / MVP | R2-07 |
| 056 | Nota de débito | Should / R2 | sin historia |
| 057 | Resumen diario de boletas | Must / MVP | R2-07 |
| 058 | Comunicación de baja | Must / MVP | R2-07 |
| 059 | Procesar respuesta y CDR | Must / MVP | R2-05 |
| 060 | Reintentos y contingencia | Must / MVP | R2-08 |
| 061 | Representación impresa (PDF, ticket con QR) | Must / MVP | R2-06 |
| 062 | Entregar comprobante al cliente | Should / MVP | R2-09 (con TR-NOT) |
| 063 | Monitor de pendientes y rechazados | Must / MVP | R2-08 |
| 064 | Exportar registro de ventas | Could / R3 | sin historia |

Antes de FE (PL-10): TR-PER, TR-IDN y TR-ARC (sprint 13). Después: SazónPOS CC-09 (R2-13, facturación desde la caja), homologación con el PSE (R2-14) y TR-PAG RF-073 (facturar la suscripción del tenant). Detalle en `docs/spec-context/tr-fe/README.md`.

## Orden de construcción (PL-10 y plan)

1. R2, sprint 13: TR-PER, TR-IDN (044-047), TR-ARC (080-082). En paralelo, sin dependencia entre PER/ARC.
2. R2, sprints 14-15: TR-FE (emisor, boleta y factura, impresa, notas, resumen, baja, contingencia, monitor).
3. R2, sprints 15-16: TR-NOT correo (074, 075, 079, 076, 077), entrega del comprobante (062), UI de emisor, series FE y plantillas.
4. R2, sprint 18: ARCO e incidentes (088, 089, 091; 090 tras TR-PER).
5. R3: TR-PAG (065-070), TR-REP (096, 097), TR-CMS, TR-POR, TR-SOP, TR-OBS negocio, WhatsApp (078).
6. R4 (sin fecha): TR-IA, TR-INT, TR-EDGE (con 038), identidad portable (048-051), 071-073, 018, 021.

## Desfase de horas frente al plan

Los paquetes parten cada historia en specs de 10 h o menos con capa HTTP y UI incluidas. Estimado frente al plan:

| Componente | Plan | Estimado en los paquetes |
|---|---|---|
| TR-FE | ~39 h | 77-92 h (85-102 con UBL y firma propios) |
| TR-PER + TR-IDN + TR-ARC | 20 h | ~90 h |
| TR-NOT | ~19 h | ~44 h |
| ARCO e incidentes | 5 h | ~40 h |
| TR-PAG | 26 h | ~40 h + bóveda de secretos |
| TR-REP | 8 h | ~20 h (+ 18 h sin historia) |
| TR-OBS negocio | 10 h | 23-27 h |
| TR-SOP | 18 h | 36-40 h |
| TR-CMS + TR-POR | 34 h | ~69 h |

H4 (30/06/2027) y H5 (05/10/2027) no caben sin replanificar o recortar alcance.

## Decisiones transversales que bloquean la redacción

1. Bóveda de secretos por tenant (TR-RNF-113): la piden FE (certificado, credenciales PSE), PAG y NOT. Propuesta: puerto `BovedaSecretos` con cifrado por sobre; spec propio antes de FE.
2. FE: PSE con API, OSE o SUNAT directo (define si hay spec de UBL y firma); emisión síncrona con envío asíncrono.
3. Orden IDN/PER: PL-10 pone PER antes de IDN, pero el registro de persona consume IDN. Propuesta: `idn-validacion-consulta` primero.
4. Proveedores: DNI/RUC, antivirus (ClamAV), pasarela de pagos, canal del OTP del portal.
5. Credenciales de máquina (TR-INT, TR-EDGE) y cliente final sin membresía (TR-POR): Supabase Auth no las cubre tal cual.
6. Migraciones: la letra (`db/01<letra>_*.sql`) se asigna al implementar, en orden de construcción, porque el runner ordena alfabéticamente. Los paquetes de PER, IDN, ARC y FE proponen `01j` a `01m`; los demás dejan la letra abierta.

## Pendientes no transversales del R1

Specs 22 a 27 (integración SazónPOS, E2E, UAT y producción) siguen pendientes y no son componentes TR; no tienen paquete aquí.

## Brechas del plan frente al SRS

RF sin historia en `3_plan.json`: 018, 021, 034, 038, 042 (solo vía CC-06), 048-051, 056, 064, 071-073, 083, 087 (cubierto en 20b), 090, 094, 098, 099, 100-105, 110, 112, 118, 128, 130-138. Los de R4 están declarados fuera del plan; el resto (034, 056, 083, 090, 094, 098, 099, 110, 112, 128) cae en R2/R3 sin horas asignadas.
