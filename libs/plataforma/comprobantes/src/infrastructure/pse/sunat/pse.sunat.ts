import type { ProveedoresFe } from '../../../application/ports/proveedores-fe.js';
import type { CredencialesPse, PseOsePort } from '../../../application/ports/pse-ose.port.js';
import { formatearNumero } from '../../../domain/comprobante/tipo-comprobante.js';
import type { DocumentoElectronico } from '../../../domain/documento-electronico.js';
import { UrlProveedorNoPermitidaError } from '../../../domain/errores.js';
import { PROVEEDORES_CON_ADAPTADOR } from '../../../domain/proveedores-fe.js';
import { fueAceptado, type RespuestaPse } from '../../../domain/respuesta-pse.js';
import { exigirUrlPermitida, urlSegunAmbiente } from '../../../domain/url-proveedor.js';
import { usuarioWsSecurity } from '../../../domain/usuario-sol.js';
import { generarXmlFirmado, type DocumentoFirmado } from '../../sunat/generar-xml-firmado.js';
import type { CircuitBreaker } from '../circuit-breaker.js';
import { resultadoDeCodigo } from './codigos-sunat.js';
import { leerCdr, zipDeLaRespuesta } from './lectura-cdr.js';
import { leerFault, type FaultLeido } from './lectura-fault.js';
import { armarSobreSendBill } from './sobre-send-bill.js';
import { CdrIlegibleError, comprimir, descomprimirCdr } from './zip-sunat.js';

export const TIMEOUT_SUNAT_MS = 15_000;
const DEMASIADAS_SOLICITUDES = 429;
const PRIMER_ERROR_DE_SERVIDOR = 500;
const CONTENIDO_SOAP = 'text/xml; charset=utf-8';
/** `soapAction` de la operación en el WSDL del billService. */
const SOAP_ACTION_SEND_BILL = 'urn:sendBill';

/** Códigos propios del adaptador cuando SUNAT no dio uno; ninguno lleva la URL, el usuario ni la clave. */
export const CODIGOS_ADAPTADOR_SUNAT = {
  urlNoPermitida: 'URL_NO_PERMITIDA',
  sinUsuario: 'SIN_USUARIO_SOL',
  sinCertificado: 'SIN_CERTIFICADO',
  firmaFallida: 'FIRMA_FALLIDA',
  circuitoAbierto: 'CIRCUITO_ABIERTO',
  tiempoAgotado: 'TIEMPO_AGOTADO',
  red: 'RED',
  respuestaInvalida: 'RESPUESTA_INVALIDA',
} as const;

/** Lo único que usa de `fetch`; las pruebas lo doblan con respuestas grabadas. */
export type BuscarSoap = (url: string, opciones: RequestInit) => Promise<Pick<Response, 'status' | 'text'>>;
type Registrar = (mensaje: string, datos: Record<string, unknown>) => void;

type Preparacion = { url: string; usuario: string; certificado: NonNullable<CredencialesPse['certificado']> } | { rechazo: RespuestaPse };

function respuestaSinSunat(resultado: RespuestaPse['resultado'], codigo: string): RespuestaPse {
  return { resultado, codigo, descripcion: null, observaciones: [] };
}

function esFallaDelServidor(estado: number): boolean {
  return estado === DEMASIADAS_SOLICITUDES || estado >= PRIMER_ERROR_DE_SERVIDOR;
}

function esTiempoAgotado(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

/** Un fault nunca es aceptación: un código de observación en un fault se trata como técnico. */
function respuestaDesdeFault({ codigo, descripcion }: FaultLeido): RespuestaPse {
  const resultado = codigo === null ? 'ERROR_TECNICO' : resultadoDeCodigo(codigo, false);
  return { resultado: fueAceptado(resultado) ? 'ERROR_TECNICO' : resultado, codigo, descripcion, observaciones: [] };
}

function respuestaDesdeCdr(zip: Uint8Array): RespuestaPse {
  const { codigo, descripcion, notas } = leerCdr(descomprimirCdr(zip));
  return { resultado: resultadoDeCodigo(codigo, notas.length > 0), codigo, descripcion, observaciones: notas, cdr: zip };
}

/** SOAP 1.1 devuelve los faults con HTTP 500: se lee el fault antes de mirar el estado. */
function interpretar(estado: number, cuerpo: string): RespuestaPse {
  const fault = leerFault(cuerpo);
  if (fault) return respuestaDesdeFault(fault);
  if (esFallaDelServidor(estado)) return respuestaSinSunat('ERROR_TECNICO', `HTTP_${estado}`);
  const zip = zipDeLaRespuesta(cuerpo);
  if (zip === null) return respuestaSinSunat('ERROR_TECNICO', CODIGOS_ADAPTADOR_SUNAT.respuestaInvalida);
  try {
    return respuestaDesdeCdr(zip);
  } catch (error) {
    if (!(error instanceof CdrIlegibleError)) throw error;
    return respuestaSinSunat('ERROR_TECNICO', CODIGOS_ADAPTADOR_SUNAT.respuestaInvalida);
  }
}

/**
 * SUNAT directo (SEE-Del Contribuyente): firma con el .pfx del emisor (51b), comprime y envía con `sendBill` al
 * billService del ambiente, con el usuario secundario SOL en WS-Security. Timeout de 15 s y circuit breaker local;
 * sin seguir redirecciones. No registra el sobre, la clave, el .pfx ni el cuerpo de la respuesta.
 */
export class PseSunat implements PseOsePort {
  constructor(
    private readonly proveedores: Pick<ProveedoresFe, 'obtener'>,
    private readonly circuito: CircuitBreaker,
    private readonly informar: Registrar,
    private readonly buscar: BuscarSoap = fetch,
  ) {}

  async enviarComprobante(credenciales: CredencialesPse, documento: DocumentoElectronico): Promise<RespuestaPse> {
    const respuesta = await this.firmarYEnviar(credenciales, documento);
    this.informar('Envío a SUNAT', {
      ruc_emisor: documento.emisor.ruc,
      comprobante: `${documento.tipo}-${formatearNumero(documento.serie, documento.numero)}`,
      codigo: respuesta.codigo,
      resultado: respuesta.resultado,
    });
    return respuesta;
  }

  private async firmarYEnviar(credenciales: CredencialesPse, documento: DocumentoElectronico): Promise<RespuestaPse> {
    const preparacion = await this.preparar(credenciales);
    if ('rechazo' in preparacion) return preparacion.rechazo;
    let firmado: DocumentoFirmado;
    try {
      firmado = generarXmlFirmado(documento, preparacion.certificado);
    } catch {
      // Clave o .pfx malos, o un dato que el UBL no admite: reintentar no lo arregla.
      return respuestaSinSunat('RECHAZADO', CODIGOS_ADAPTADOR_SUNAT.firmaFallida);
    }
    const usuario = usuarioWsSecurity(documento.emisor.ruc, preparacion.usuario);
    const respuesta = await this.enviar(preparacion.url, usuario, credenciales.token, firmado);
    return { ...respuesta, xmlFirmado: firmado.xml, hash: firmado.hash };
  }

  /** El catálogo pudo cambiar: la URL se vuelve a resolver y validar en cada envío (anti-SSRF). */
  private async preparar(credenciales: CredencialesPse): Promise<Preparacion> {
    const proveedor = await this.proveedores.obtener(PROVEEDORES_CON_ADAPTADOR.sunat);
    let url: string;
    try {
      url = exigirUrlPermitida(urlSegunAmbiente(proveedor, credenciales.ambiente) ?? '', proveedor.dominiosPermitidos);
    } catch (error) {
      if (error instanceof UrlProveedorNoPermitidaError) return { rechazo: respuestaSinSunat('RECHAZADO', CODIGOS_ADAPTADOR_SUNAT.urlNoPermitida) };
      throw error;
    }
    if (credenciales.usuario === null) return { rechazo: respuestaSinSunat('RECHAZADO', CODIGOS_ADAPTADOR_SUNAT.sinUsuario) };
    if (!credenciales.certificado) return { rechazo: respuestaSinSunat('RECHAZADO', CODIGOS_ADAPTADOR_SUNAT.sinCertificado) };
    return { url, usuario: credenciales.usuario, certificado: credenciales.certificado };
  }

  private async enviar(url: string, usuario: string, clave: string, { xml, nombreArchivo }: DocumentoFirmado): Promise<RespuestaPse> {
    if (!this.circuito.permiteLlamada()) return respuestaSinSunat('ERROR_TECNICO', CODIGOS_ADAPTADOR_SUNAT.circuitoAbierto);
    const sobre = armarSobreSendBill({
      usuario,
      clave,
      nombreArchivo,
      zipBase64: Buffer.from(comprimir(nombreArchivo, xml)).toString('base64'),
    });
    try {
      const respuesta = await this.buscar(url, {
        method: 'POST',
        headers: { 'Content-Type': CONTENIDO_SOAP, SOAPAction: SOAP_ACTION_SEND_BILL },
        body: sobre,
        signal: AbortSignal.timeout(TIMEOUT_SUNAT_MS),
        redirect: 'error',
      });
      return this.registrarSalud(interpretar(respuesta.status, await respuesta.text()));
    } catch (error) {
      this.circuito.registrarFallo();
      return respuestaSinSunat('ERROR_TECNICO', esTiempoAgotado(error) ? CODIGOS_ADAPTADOR_SUNAT.tiempoAgotado : CODIGOS_ADAPTADOR_SUNAT.red);
    }
  }

  /** Solo las fallas técnicas cuentan para el circuito: un rechazo es una respuesta sana de SUNAT. */
  private registrarSalud(respuesta: RespuestaPse): RespuestaPse {
    if (respuesta.resultado === 'ERROR_TECNICO') this.circuito.registrarFallo();
    else this.circuito.registrarExito();
    return respuesta;
  }
}
