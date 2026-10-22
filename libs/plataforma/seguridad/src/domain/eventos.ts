import type { Alcance } from './alcance.js';

/** Eventos de seg en el outbox, todos en schema_version 1. El aggregate_type es el nombre del agregado. */
export const EVENTOS_SEG = {
  rolCreado: 'rol.creado',
  rolPermisosCambiados: 'rol.permisos_cambiados',
  rolInactivado: 'rol.inactivado',
  perfilCreado: 'perfil.creado',
  perfilRolesCambiados: 'perfil.roles_cambiados',
  asignacionOtorgada: 'asignacion.otorgada',
} as const;

export interface RolCreado {
  producto_codigo: string;
  codigo: string;
  nombre: string;
  copiado_de: string | null;
  permisos: string[];
}

export interface Cambios {
  agregados: string[];
  quitados: string[];
}

export interface RolInactivado {
  afectados: number;
}

export interface PerfilCreado {
  codigo: string;
  nombre: string;
  roles: string[];
}

export interface AsignacionOtorgada {
  membresia_id: string;
  rol_id: string | null;
  perfil_id: string | null;
  alcance: Alcance;
  empresa_id: string | null;
  sucursal_id: string | null;
  unidad_id: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  otorgado_por: string | null;
}

/** Diferencia entre dos conjuntos, ordenada para que el payload sea estable. */
export function diferencia(antes: Iterable<string>, despues: Iterable<string>): Cambios {
  const a = new Set(antes);
  const d = new Set(despues);
  return {
    agregados: [...d].filter((x) => !a.has(x)).sort(),
    quitados: [...a].filter((x) => !d.has(x)).sort(),
  };
}
