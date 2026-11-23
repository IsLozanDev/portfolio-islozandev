import { CertificadoNoVigenteError, CertificadoOtroRucError, CertificadoVencidoError } from './errores.js';
import type { AtributoSujeto } from './ruc-certificado.js';

/** Lo que el lector sacó del certificado hoja del .pfx. Nunca la llave ni la clave. */
export class CertificadoLeido {
  constructor(
    readonly ruc: string,
    readonly venceEn: Date,
    readonly emitidoEn: Date,
    /** SHA-256 del DER del certificado, en hexadecimal minúsculo. */
    readonly huellaSha256: string,
    readonly sujeto: readonly AtributoSujeto[],
  ) {}

  /** TR-CA-134 y 135: del RUC de la empresa y vigente en `ahora`. */
  validarPara(rucEmpresa: string, ahora: Date): void {
    if (this.ruc !== rucEmpresa) throw new CertificadoOtroRucError();
    if (this.venceEn.getTime() <= ahora.getTime()) throw new CertificadoVencidoError();
    if (this.emitidoEn.getTime() > ahora.getTime()) throw new CertificadoNoVigenteError();
  }
}
