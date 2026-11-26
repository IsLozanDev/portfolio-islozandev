import type { CredencialesPse, PseOsePort } from '../../../application/ports/pse-ose.port.js';
import type { DocumentoElectronico } from '../../../domain/documento-electronico.js';
import type { RespuestaPse } from '../../../domain/respuesta-pse.js';
import { nombreArchivoSunat } from '../../sunat/generar-xml-firmado.js';
import { comprimir, PREFIJO_CDR } from '../sunat/zip-sunat.js';

/** Tokens que fuerzan un resultado; cualquier otro acepta. */
export const TOKEN_SIMULAR_RECHAZO = 'SIMULAR_RECHAZO';
export const TOKEN_SIMULAR_ERROR = 'SIMULAR_ERROR';
export const TOKEN_SIMULAR_OBSERVACION = 'SIMULAR_OBSERVACION';
export const TOKEN_SIMULAR_CREDENCIAL = 'SIMULAR_CREDENCIAL';
/** El código de rechazo que usa SUNAT para un comprobante ya informado. */
export const CODIGO_RECHAZO_SIMULADO = '2800';
/** Una observación de SUNAT (4000 o mayor) que no impide aceptar. */
export const OBSERVACION_SIMULADA = '4252 - Observación simulada';
const CODIGO_CREDENCIAL_SIMULADA = '0102';
const DESCRIPCION_RECHAZO = 'Rechazo simulado';
const DESCRIPCION_ERROR = 'Error técnico simulado';
const DESCRIPCION_CREDENCIAL = 'Usuario o contraseña incorrectos (simulado)';
const CODIGO_ERROR_SIMULADO = 'SIMULADO';
const CODIGO_ACEPTADO = '0';
const codificador = new TextEncoder();

/** Hash ficticio y estable del comprobante, para que la vista y los logs tengan algo que mostrar. */
function hashFicticio(documento: DocumentoElectronico): string {
  return Buffer.from(`${documento.emisor.ruc}-${documento.tipo}-${documento.serie}-${documento.numero}`).toString('base64');
}

/** XML y CDR pequeños y sin firma, con la forma de los de SUNAT: el envío los guarda en ARC igual que los reales. */
function archivosFicticios(documento: DocumentoElectronico, codigo: string): Pick<RespuestaPse, 'xmlFirmado' | 'cdr'> {
  const nombre = nombreArchivoSunat(documento);
  const cdr = codificador.encode(`<ApplicationResponse><ResponseCode>${codigo}</ResponseCode></ApplicationResponse>`);
  return { xmlFirmado: codificador.encode(`<Invoice simulado="${nombre}"/>`), cdr: comprimir(`${PREFIJO_CDR}${nombre}`, cdr) };
}

function aceptado(documento: DocumentoElectronico, observaciones: string[]): RespuestaPse {
  return {
    resultado: observaciones.length > 0 ? 'ACEPTADO_CON_OBSERVACIONES' : 'ACEPTADO',
    codigo: CODIGO_ACEPTADO,
    descripcion: `La Boleta numero ${documento.serie}-${documento.numero}, ha sido aceptada`,
    observaciones,
    hash: hashFicticio(documento),
    ...archivosFicticios(documento, CODIGO_ACEPTADO),
  };
}

/** Sin red y determinista según el token: para dev y CI (`FE_SIMULADO_PERMITIDO=true`). */
export class PseSimulador implements PseOsePort {
  async enviarComprobante(credenciales: CredencialesPse, documento: DocumentoElectronico): Promise<RespuestaPse> {
    switch (credenciales.token) {
      case TOKEN_SIMULAR_RECHAZO:
        return { resultado: 'RECHAZADO', codigo: CODIGO_RECHAZO_SIMULADO, descripcion: DESCRIPCION_RECHAZO, observaciones: [] };
      case TOKEN_SIMULAR_ERROR:
        return { resultado: 'ERROR_TECNICO', codigo: CODIGO_ERROR_SIMULADO, descripcion: DESCRIPCION_ERROR, observaciones: [] };
      case TOKEN_SIMULAR_CREDENCIAL:
        return { resultado: 'CREDENCIAL_INVALIDA', codigo: CODIGO_CREDENCIAL_SIMULADA, descripcion: DESCRIPCION_CREDENCIAL, observaciones: [] };
      case TOKEN_SIMULAR_OBSERVACION:
        return aceptado(documento, [OBSERVACION_SIMULADA]);
      default:
        return aceptado(documento, []);
    }
  }
}
