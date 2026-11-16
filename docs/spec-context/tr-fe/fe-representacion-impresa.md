# Contexto para fe-representacion-impresa

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, SRS (RF, Criterios GWT, Reglas de negocio, RNF, Componentes), `plan.md` (backlog R2, alcance R4), `3_plan.json`, diagramas T-06 y T-S3, código real.

## 1. Alcance y dependencias
- Historia **R2-06** (sprint 14, 4 h, Back, R2): «Representación impresa (PDF y ticket con QR)», TR-RF-061.
- Depende de `fe-boleta-factura-cdr` parte A (comprobante registrado con totales y hash) y de TR-ARC (R2-03: guardar el PDF y entregar URL firmada). Lo consumen `fe-entrega-comprobante` (adjunta PDF), `fe-monitor` (descarga) y CC-09 (impresión en caja).
- Horas: 4 h en el plan; realista 6-7 h (dos plantillas, QR, monto en letras, logo con respaldo, caché en ARC). Un solo spec.
- Áreas: (a) modelo de la representación (datos del emisor, adquirente, líneas, totales, leyendas, cadena del QR), (b) generadores A4 y TICKET80 detrás de un puerto, (c) endpoint con caché en ARC y URL firmada.
- Fuera de alcance: impresión directa en impresora térmica, ESC/POS y apertura de cajón (TR-EDGE, R4 según el plan: «TR-EDGE (agente local)» está fuera del plan); envío por correo (062); consulta pública (pendientes).
- Constitución: 1, 2, 3, 5, 8, 10 (generador de PDF detrás de puerto), 11. Código limpio.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-061 | Generar representación impresa | plat.fe.pdf | APP-03 | TR-RN-027 | TR-RNF-017, TR-RNF-001 | Módulo de producto, usuario operativo |

- Precondición: comprobante registrado (no exige ACEPTADO: la caja imprime la boleta recién emitida).
- Flujo: 1) el producto pide formato A4 o TICKET80; 2) se arma la plantilla con emisor, adquirente, líneas, totales, leyendas y QR; 3) se genera el PDF o el texto ESC/POS y se guarda en TR-ARC; 4) se devuelve URL firmada o se envía al agente local.
- Datos: `comprobante_id`, `formato` (A4|TICKET80), `logo` (archivo de la empresa), `qr` = RUC|tipo|serie|número|IGV|total|fecha|tipo doc adquirente|número doc adquirente|hash.
- Salida: PDF o ticket disponible e imprimible. Componentes: TR-FE, TR-ARC, TR-EDGE.

## 3. Criterios GWT
- **TR-CA-155** (Positivo, «Ticket de 80 mm»): B002-00000125 registrada, formato TICKET80 -> el agente local imprime el ticket con logo, totales y QR. Depende de TR-EDGE (R4): en R2 se reformula como «se obtiene un PDF de 80 mm con logo, totales y QR».
- **TR-CA-156** (Borde, «Sin logo»): empresa sin logo, PDF A4 -> usa el nombre comercial en lugar del logo.
- Faltan (proponer): QR decodificado con los 10 campos en el orden del SRS y separador `|`; monto en letras correcto (S/ 118,00 -> «CIENTO DIECIOCHO CON 00/100 SOLES»); boleta a «clientes varios» con documento vacío en el QR; segunda solicitud del mismo formato devuelve el archivo guardado (no regenera) salvo que cambie el estado; comprobante de otro tenant -> 404; URL firmada vence a los 15 min (RN-027); A4 de una factura a crédito muestra cuotas; leyenda de pie del emisor (`leyenda_pie` de 052).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-027 | Archivos con MIME permitido, SHA-256, antivirus y URL firmada <= 15 min (lo cumple TR-ARC). |
| TR-RNF-017 | Representación conforme a la norma SUNAT (contenido mínimo, QR, hash). |
| TR-RNF-001 | Mostrador p95 < 800 ms: el ticket se genera rápido o se pregenera al emitir. |
| TR-RNF-004 | (De 062, no de 061) Core Web Vitals del portal público. |

Heredados por CLAUDE.md: 002, 003, 010, 011, 012, 024/119, 025, 026, 101.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R2-06 | 14 | 4 | TR-FE | Representación impresa (PDF y ticket con QR) | TR-RF-061 | Back | R2 |

Relacionadas: R2-05 (emisión), R2-09 (entrega por correo con PDF), R2-13 (CC-09 caja de SazónPOS).

## 6. Tablas SQL, eventos, puertos y permisos
- **Tablas**: sin tabla propia si TR-ARC guarda la relación por `entidad_tipo = 'CPE'`, `entidad_id = comprobante_id` (RF-080 tiene esos campos). Si no, columnas `pdf_a4_archivo_id`, `pdf_ticket_archivo_id` en `fe.comprobante`.
- **Logo**: `org.empresa` no tiene logo. Opciones: archivo de TR-ARC con categoría propia vinculado a la empresa, o campo `logo_archivo_id` en `fe.emisor`. Ver P3.
- **Eventos**: ninguno en el SRS. Proponer ninguno (lectura) o `cpe.representacion_generada` solo si TR-NOT la necesita para adjuntar.
- **Puertos**: `GeneradorRepresentacion.generar(modelo, formato) -> bytes` (adaptador con una librería de PDF y otra de QR, a elegir y verificar con ctx7 al redactar: no hay ninguna en `package.json`); `ArchivoPort` de TR-ARC (subir, URL firmada).
- **Funciones de dominio puras**: `cadenaQr(comprobante)`, `montoEnLetras(total, moneda)`.
- **Permisos**: `plat.fe.pdf`. Endpoint propuesto `GET /v1/fe/comprobantes/{id}/representacion?formato=A4|TICKET80` -> `{ url, expira_en }` o el PDF en línea para la caja (P4).

## 7. Código base relacionado
- **Existe**: `org.Empresa` (`razonSocial`, `nombreComercial` para CA-156, `direccionFiscal`), `org.Sucursal` (`direccion`, `codigoEstablecimientoSunat`); `catalogos` (descripciones de TIPO_COMPROBANTE, TIPO_DOC_IDENTIDAD, UNIDAD_MEDIDA, MONEDA para imprimir textos); `auditoria` no aplica (lectura).
- **Patrón de archivos generados**: la exportación XLSX de auditoría (`libs/plataforma/auditoria/src/infrastructure/xlsx/escritor-auditoria.xlsx.ts`, spec 20b) genera en memoria y responde sin guardar. Sirve de referencia para el adaptador.
- **No existe**: TR-ARC, generador de PDF, QR, monto en letras, campo de logo. Nada en `codigo/`.

## 8. Diagramas relevantes
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-S3_Secuencia_Emision_de_comprobante_electronico.mmd` (el worker guarda «XML, CDR y PDF» en Archivos tras la aceptación).
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-06_Modelo_de_dominio_Comprobantes_electronicos_y_pagos.mmd`.
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-07_Modelo_de_dominio_Notificaciones_archivos_auditoria_y_eventos.mmd` (modelo de archivos).

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- RF-061 y CA-155 dependen del agente local (TR-EDGE), que el plan deja en R4. «Texto ESC/POS» no tiene consumidor en R2.
- El hash del QR existe cuando el XML está firmado. Si firma el PSE al enviar (asíncrono), la boleta impresa en caja no tendría hash al momento.
- T-S3 genera el PDF tras la aceptación; RF-061 lo pide desde «registrado».
- No hay dónde guardar el logo.

Preguntas candidatas, con recomendación:
1. **¿TICKET80 como ESC/POS o PDF?** Recomendación: PDF de 80 mm de ancho en R2 (SazónPOS lo imprime con su mecanismo actual); ESC/POS y agente local quedan para TR-EDGE (R4). Ajustar CA-155.
2. **¿Hash en la representación de un comprobante aún no enviado?** Recomendación: elegir en P1 del emisor un proveedor que devuelva hash y XML firmado en la respuesta síncrona de registro, o firmar en la plataforma (parte C). Si no hay hash al imprimir, el ticket se reimprime tras la aceptación; documentarlo como limitación.
3. **¿Dónde está el logo?** Recomendación: `logo_archivo_id` en `fe.emisor` (por empresa), subido por la UI del emisor (`fe-admin-ui`) a TR-ARC con categoría de imagen; sin logo, nombre comercial (CA-156) y si tampoco hay, razón social.
4. **¿URL firmada o bytes en línea?** Recomendación: URL firmada de ARC para A4 (descarga y correo); bytes en línea para TICKET80 (la caja imprime al instante, RNF-001). Ambos guardan copia en ARC.
5. **¿Cuándo se regenera?** Recomendación: se genera al primer pedido y se guarda; se regenera solo si cambió el estado que se imprime (por ejemplo ANULADO con marca de agua) o el hash. Clave: `comprobante_id + formato + version`.
6. **¿Leyendas obligatorias?** Recomendación: monto en letras (cat. 52 código 1000), «Representación impresa de la [tipo] electrónica», URL o texto de consulta, `leyenda_pie` del emisor. Verificar la lista vigente con el proveedor elegido en homologación (R2-14).
