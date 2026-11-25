import forge from 'node-forge';
import { abrirParDeLlave } from '../../forge/lector-certificado.forge.js';

/** PEM de la llave y del certificado. La llave nunca se registra ni sale en un error. */
export interface LlaveDeFirma {
  llavePrivadaPem: string;
  certificadoPem: string;
}

/** Con el lector del 49: ClaveCertificadoIncorrectaError si la clave no abre el .pfx, sin la clave en el mensaje. */
export function llaveDesdePfx(pfx: Uint8Array, clave: string): LlaveDeFirma {
  const { llave, certificado } = abrirParDeLlave(pfx, clave);
  return { llavePrivadaPem: forge.pki.privateKeyToPem(llave), certificadoPem: forge.pki.certificateToPem(certificado) };
}
