import type { CredencialesPse, PseOsePort } from '../../../application/ports/pse-ose.port.js';
import type { DocumentoElectronico } from '../../../domain/documento-electronico.js';
import type { RespuestaPse } from '../../../domain/respuesta-pse.js';

/** Tokens que fuerzan un resultado; cualquier otro acepta. */
export const TOKEN_SIMULAR_RECHAZO = 'SIMULAR_RECHAZO';
export const TOKEN_SIMULAR_ERROR = 'SIMULAR_ERROR';
/** El código de rechazo que usa SUNAT para un comprobante ya informado. */
export const CODIGO_RECHAZO_SIMULADO = '2800';
const DESCRIPCION_RECHAZO = 'Rechazo simulado';
const DESCRIPCION_ERROR = 'Error técnico simulado';
const CODIGO_ERROR_SIMULADO = 'SIMULADO';
const CODIGO_ACEPTADO = '0';

/** Hash ficticio y estable del comprobante, para que la vista y los logs tengan algo que mostrar. */
function hashFicticio(documento: DocumentoElectronico): string {
  return Buffer.from(`${documento.emisorRuc}-${documento.tipo}-${documento.serie}-${documento.numero}`).toString('base64');
}

/** Sin red y determinista según el token: para dev y CI (`FE_SIMULADO_PERMITIDO=true`). */
export class PseSimulador implements PseOsePort {
  async enviarComprobante(credenciales: CredencialesPse, documento: DocumentoElectronico): Promise<RespuestaPse> {
    if (credenciales.token === TOKEN_SIMULAR_RECHAZO) {
      return { resultado: 'RECHAZADO', codigo: CODIGO_RECHAZO_SIMULADO, descripcion: DESCRIPCION_RECHAZO, observaciones: [] };
    }
    if (credenciales.token === TOKEN_SIMULAR_ERROR) {
      return { resultado: 'ERROR_TECNICO', codigo: CODIGO_ERROR_SIMULADO, descripcion: DESCRIPCION_ERROR, observaciones: [] };
    }
    const descripcion = `La Boleta numero ${documento.serie}-${documento.numero}, ha sido aceptada`;
    return { resultado: 'ACEPTADO', codigo: CODIGO_ACEPTADO, descripcion, observaciones: [], hash: hashFicticio(documento) };
  }
}
