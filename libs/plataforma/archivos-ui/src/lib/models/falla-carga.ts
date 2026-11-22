import type { EtapaCarga } from './estado-carga';

/** «Elegir otro archivo» abre el selector; «Reintentar» repite la subida o reabre el seguimiento. */
export type AccionFalla = 'ELEGIR_OTRO' | 'REINTENTAR';

export interface PresentacionFalla {
  chip: string;
  icono: string;
  accion: AccionFalla;
  textoAccion: string;
  iconoAccion: string;
}

type EtapaConFalla = Extract<EtapaCarga, 'CUARENTENA' | 'RECHAZADO' | 'ERROR'>;

const ELEGIR_OTRO = { accion: 'ELEGIR_OTRO', textoAccion: 'Elegir otro archivo', iconoAccion: 'folder_open' } as const;

/** Chip y acción de cada etapa con falla, según el artboard `ARC-Estados`. */
export const FALLAS_CARGA: Readonly<Record<EtapaConFalla, PresentacionFalla>> = {
  CUARENTENA: { chip: 'En cuarentena', icono: 'gpp_bad', ...ELEGIR_OTRO },
  RECHAZADO: { chip: 'Rechazado', icono: 'block', ...ELEGIR_OTRO },
  ERROR: { chip: 'No se subió', icono: 'cloud_off', accion: 'REINTENTAR', textoAccion: 'Reintentar', iconoAccion: 'refresh' },
};

export function presentacionFalla(etapa: EtapaCarga): PresentacionFalla | null {
  return etapa in FALLAS_CARGA ? FALLAS_CARGA[etapa as EtapaConFalla] : null;
}
