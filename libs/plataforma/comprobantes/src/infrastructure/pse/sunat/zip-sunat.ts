import { strFromU8, unzipSync, zipSync } from 'fflate';

const EXTENSION_XML = '.xml';
/** SUNAT nombra el CDR `R-RUC-TIPO-SERIE-NUMERO.xml`. */
const PREFIJO_CDR = 'R-';

export class CdrIlegibleError extends Error {
  constructor() {
    super('El ZIP del CDR está corrupto o no trae el XML de respuesta');
  }
}

/** ZIP con un único `nombreArchivo.xml`: lo que espera `sendBill`. */
export function comprimir(nombreArchivo: string, xml: Uint8Array): Uint8Array {
  return zipSync({ [`${nombreArchivo}${EXTENSION_XML}`]: xml });
}

function esXmlDeCdr(nombre: string): boolean {
  const base = nombre.split('/').at(-1) ?? '';
  return base.startsWith(PREFIJO_CDR) && base.toLowerCase().endsWith(EXTENSION_XML);
}

/** XML `R-….xml` del ZIP que devuelve SUNAT. CdrIlegibleError si el ZIP está corrupto o no lo trae. */
export function descomprimirCdr(zip: Uint8Array): string {
  let entradas: Record<string, Uint8Array>;
  try {
    entradas = unzipSync(zip);
  } catch {
    throw new CdrIlegibleError();
  }
  const nombre = Object.keys(entradas).find(esXmlDeCdr);
  if (!nombre) throw new CdrIlegibleError();
  return strFromU8(entradas[nombre]);
}
