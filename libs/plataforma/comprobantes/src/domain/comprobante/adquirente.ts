/** Códigos internos del catálogo TIPO_DOC_IDENTIDAD (cat. 06): el `codigo_externo` SUNAT es 6 para RUC y 0 para DOC_0. */
export const TIPO_DOCUMENTO_RUC = 'RUC';
export const TIPO_DOCUMENTO_SIN_DOCUMENTO = 'DOC_0';

/** Los mismos largos que las columnas adquirente_* de fe.comprobante. */
export const LARGO_MAXIMO_TIPO_DOCUMENTO = 10;
export const LARGO_MAXIMO_NUMERO_DOCUMENTO = 15;
export const LARGO_MAXIMO_NOMBRE_ADQUIRENTE = 200;
export const LARGO_MAXIMO_CORREO_ADQUIRENTE = 254;

/** Valor embebido en el comprobante: `personaId` es opcional y no se valida contra TR-PER. */
export interface Adquirente {
  tipoDocumento: string;
  numero: string;
  nombre: string;
  correo: string | null;
  personaId: string | null;
}

/** TR-CA-139: la boleta sin adquirente va a «Clientes varios» con documento 0. */
export const CLIENTES_VARIOS: Adquirente = Object.freeze({
  tipoDocumento: TIPO_DOCUMENTO_SIN_DOCUMENTO,
  numero: '0',
  nombre: 'CLIENTES VARIOS',
  correo: null,
  personaId: null,
});

/** Documento y nombre que identifican al adquirente (TR-RN-018): DOC_0 no identifica. */
export function identificaAlAdquirente(adquirente: Adquirente): boolean {
  return adquirente.tipoDocumento !== TIPO_DOCUMENTO_SIN_DOCUMENTO && adquirente.numero.trim() !== '' && adquirente.nombre.trim() !== '';
}
