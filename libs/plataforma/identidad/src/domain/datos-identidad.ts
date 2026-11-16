import type { TipoDocumento } from '@vitrina/shared/util';

export type TipoConsultable = Extract<TipoDocumento, 'DNI' | 'RUC'>;

const TIPOS_CONSULTABLES: readonly TipoDocumento[] = ['DNI', 'RUC'];

export function esTipoConsultable(tipo: TipoDocumento): tipo is TipoConsultable {
  return TIPOS_CONSULTABLES.includes(tipo);
}

export interface DatosDni {
  nombres: string;
  apellidos: string;
}

export interface DatosRuc {
  razonSocial: string;
  estado: string;
  condicion: string;
  direccionFiscal: string;
  ubigeo: string;
}

export type DocumentoConDatos = { tipo: 'DNI'; datos: DatosDni } | { tipo: 'RUC'; datos: DatosRuc };
