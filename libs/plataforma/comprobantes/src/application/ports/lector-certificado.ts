import type { CertificadoLeido } from '../../domain/certificado-leido.js';

export interface LectorCertificado {
  /**
   * Abre el PKCS#12 con su clave y devuelve el certificado hoja (el de la llave privada). Lanza
   * ClaveCertificadoIncorrectaError, ArchivoCertificadoInvalidoError o CertificadoSinRucError. No guarda nada.
   */
  leer(pfx: Uint8Array, clave: string): CertificadoLeido;
}
