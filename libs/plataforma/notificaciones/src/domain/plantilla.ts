import type { CanalNotificacion } from './canal.js';

export interface VariableDeclarada {
  nombre: string;
  tipo: string;
  /** Valor de la vista previa; sin él se muestra `[nombre]`. */
  ejemplo?: string;
}

/** Una versión de plantilla, de plataforma (`tenantId` nulo) o personalizada por el tenant. */
export interface Plantilla {
  id: string;
  tenantId: string | null;
  codigo: string;
  canal: CanalNotificacion;
  idioma: string;
  version: number;
  asunto: string | null;
  cuerpo: string;
  variables: readonly VariableDeclarada[];
  /** La base de la que sale una personalizada; nulo en las base. */
  plantillaBaseId: string | null;
  activa: boolean;
  /** Nulo en las base, que siembra una migración. */
  creadoPor: string | null;
  creadoEn: Date;
}

export type OrigenPlantilla = 'BASE' | 'PERSONALIZADA';

export const ORIGENES_PLANTILLA: readonly OrigenPlantilla[] = ['BASE', 'PERSONALIZADA'];

export function origenDe(plantilla: Pick<Plantilla, 'tenantId'>): OrigenPlantilla {
  return plantilla.tenantId === null ? 'BASE' : 'PERSONALIZADA';
}

export const IDIOMA_POR_DEFECTO = 'es';
