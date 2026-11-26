import type { ArchivoSistemaPort } from '@vitrina/plataforma/archivos';
import type { ArchivosCpe } from '../../application/ports/archivos-cpe.js';
import type { DocumentoElectronico } from '../../domain/documento-electronico.js';
import { PREFIJO_CDR } from '../pse/sunat/zip-sunat.js';
import { nombreArchivoSunat } from '../sunat/generar-xml-firmado.js';

/** Categoría sembrada en arc.categoria (01m_arc) para el XML y el CDR de los comprobantes. */
export const CATEGORIA_CPE = 'CPE_XML';
export const ENTIDAD_COMPROBANTE = 'FE_COMPROBANTE';
export const INTENTOS_SUBIDA_ARC = 3;
export const EVENTO_ARCHIVO_NO_GUARDADO = 'fe.envio.archivo_no_guardado';
const MIME_XML = 'application/xml';
const MIME_ZIP = 'application/zip';

type Registrar = (mensaje: string, datos: Record<string, unknown>) => void;

interface Subida {
  comprobanteId: string;
  tipoArchivo: 'XML' | 'CDR';
  nombre: string;
  mime: string;
  bytes: Uint8Array;
}

/**
 * Sobre `ARCHIVO_SISTEMA_PORT` de TR-ARC, con el tenant del contexto. Reintenta la subida en memoria; si sigue
 * fallando devuelve null y deja el log `fe.envio.archivo_no_guardado` (solo el nombre del error: el mensaje de
 * Storage puede llevar la ruta). El CDR que falte se recupera con getStatusCdr (spec 56).
 */
export class ArchivosCpeArc implements ArchivosCpe {
  constructor(
    private readonly archivos: ArchivoSistemaPort,
    private readonly avisar: Registrar,
  ) {}

  guardarXml(comprobanteId: string, documento: DocumentoElectronico, xml: Uint8Array): Promise<string | null> {
    return this.subir({ comprobanteId, tipoArchivo: 'XML', nombre: `${nombreArchivoSunat(documento)}.xml`, mime: MIME_XML, bytes: xml });
  }

  guardarCdr(comprobanteId: string, documento: DocumentoElectronico, cdr: Uint8Array): Promise<string | null> {
    return this.subir({ comprobanteId, tipoArchivo: 'CDR', nombre: `${PREFIJO_CDR}${nombreArchivoSunat(documento)}.zip`, mime: MIME_ZIP, bytes: cdr });
  }

  private async subir(subida: Subida): Promise<string | null> {
    let ultimoError: unknown;
    for (let intento = 1; intento <= INTENTOS_SUBIDA_ARC; intento += 1) {
      try {
        const { archivoId } = await this.archivos.guardar({
          categoria: CATEGORIA_CPE,
          nombreOriginal: subida.nombre,
          mime: subida.mime,
          bytes: subida.bytes,
          entidadTipo: ENTIDAD_COMPROBANTE,
          entidadId: subida.comprobanteId,
        });
        return archivoId;
      } catch (error) {
        ultimoError = error;
      }
    }
    this.avisar(EVENTO_ARCHIVO_NO_GUARDADO, {
      comprobante_id: subida.comprobanteId,
      archivo: subida.tipoArchivo,
      intentos: INTENTOS_SUBIDA_ARC,
      error: ultimoError instanceof Error ? ultimoError.name : 'desconocido',
    });
    return null;
  }
}
