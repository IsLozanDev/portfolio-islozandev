import type { CanalNotificacion } from './canal.js';

export interface VariableDeclarada {
  nombre: string;
  tipo: string;
}

/** Una versión de plantilla, de plataforma (`tenantId` nulo) o personalizada por el tenant. */
export interface Plantilla {
  id: string;
  tenantId: string | null;
  codigo: string;
  canal: CanalNotificacion;
  version: number;
  asunto: string | null;
  cuerpo: string;
  variables: readonly VariableDeclarada[];
}

export const IDIOMA_POR_DEFECTO = 'es';
