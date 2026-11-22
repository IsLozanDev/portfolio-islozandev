export const ETAPAS_CARGA = ['ESPERA', 'SUBIENDO', 'CONFIRMANDO', 'ANALIZANDO', 'DISPONIBLE', 'CUARENTENA', 'RECHAZADO', 'ERROR'] as const;

/** Etapa de `vit-archivo-carga`, de la espera al resultado del análisis. */
export type EtapaCarga = (typeof ETAPAS_CARGA)[number];

export const MODOS_CARGA = ['carga', 'version'] as const;
export type ModoCarga = (typeof MODOS_CARGA)[number];

export interface ArchivoDisponible {
  archivoId: string;
  numero: number;
}

export interface ArchivoRechazado {
  archivoId: string;
  numero: number;
  resultado: 'CUARENTENA' | 'RECHAZADO';
  mensaje: string;
}
