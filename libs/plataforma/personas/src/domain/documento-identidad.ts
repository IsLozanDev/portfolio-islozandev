import { validarDocumento, type TipoDocumento } from '@vitrina/shared/util';
import { DocumentoInvalidoPersonaError, TipoDocumentoNoAdmitidoError } from './errores.js';

export const TIPOS_DOCUMENTO_PERSONA = ['DNI', 'CE', 'RUC', 'PASAPORTE'] as const;
export type TipoDocumentoPersona = (typeof TIPOS_DOCUMENTO_PERSONA)[number];

/** El código lo manda el catálogo `TIPO_DOC_IDENTIDAD` (`PASAPORTE`); `validarDocumento` lo llama `PAS`. */
const TIPO_PARA_VALIDAR: Record<TipoDocumentoPersona, TipoDocumento> = {
  DNI: 'DNI',
  CE: 'CE',
  RUC: 'RUC',
  PASAPORTE: 'PAS',
};
const TIPOS_CONSULTABLES: readonly TipoDocumentoPersona[] = ['DNI', 'RUC'];
const LONGITUD_PREFIJO_RUC = 2;

export function esTipoDocumentoPersona(valor: string): valor is TipoDocumentoPersona {
  return (TIPOS_DOCUMENTO_PERSONA as readonly string[]).includes(valor);
}

export class DocumentoIdentidad {
  private constructor(
    readonly tipo: TipoDocumentoPersona,
    readonly numero: string,
  ) {}

  static crear(tipo: string, numero: string): DocumentoIdentidad {
    if (!esTipoDocumentoPersona(tipo)) throw new TipoDocumentoNoAdmitidoError();
    const validez = validarDocumento(TIPO_PARA_VALIDAR[tipo], numero);
    if (!validez.valido) throw new DocumentoInvalidoPersonaError(validez.motivo);
    return new DocumentoIdentidad(tipo, numero);
  }

  static reconstituir(tipo: TipoDocumentoPersona, numero: string): DocumentoIdentidad {
    return new DocumentoIdentidad(tipo, numero);
  }

  /** Solo DNI y RUC tienen proveedor de identidad. */
  esConsultable(): boolean {
    return TIPOS_CONSULTABLES.includes(this.tipo);
  }

  esRucConPrefijo(prefijos: readonly string[]): boolean {
    return this.tipo === 'RUC' && prefijos.includes(this.numero.slice(0, LONGITUD_PREFIJO_RUC));
  }
}
