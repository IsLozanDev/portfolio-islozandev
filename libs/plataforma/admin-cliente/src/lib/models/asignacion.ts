export const ALCANCES = ['TENANT', 'EMPRESA', 'SUCURSAL', 'UNIDAD'] as const;
export type Alcance = (typeof ALCANCES)[number];

/** Lo que eligen invitar y asignar: rol o perfil, alcance con su ubicación y vigencia. */
export interface FormularioAsignacion {
  rolId: string | null;
  perfilId: string | null;
  alcance: Alcance;
  empresaId: string | null;
  sucursalId: string | null;
  unidadId: string | null;
  /** Fecha calendario `YYYY-MM-DD`; sin valor, la API usa hoy. */
  vigenteDesde: string | null;
  vigenteHasta: string | null;
}

export interface CuerpoAsignacion {
  rol_id: string | null;
  perfil_id: string | null;
  alcance: Alcance;
  empresa_id: string | null;
  sucursal_id: string | null;
  unidad_id: string | null;
  vigente_hasta: string | null;
}

export interface CuerpoOtorgarAsignacion extends CuerpoAsignacion {
  membresia_id: string;
  vigente_desde: string | null;
}

export interface AsignacionOtorgadaRespuesta {
  asignacion_id: string;
}

/** Campos comunes a invitar y otorgar; invitar no recibe `vigente_desde` (spec 08). */
export function aCuerpoAsignacion(formulario: FormularioAsignacion): CuerpoAsignacion {
  return {
    rol_id: formulario.rolId,
    perfil_id: formulario.perfilId,
    alcance: formulario.alcance,
    empresa_id: formulario.empresaId,
    sucursal_id: formulario.sucursalId,
    unidad_id: formulario.unidadId,
    vigente_hasta: formulario.vigenteHasta,
  };
}

export function aCuerpoOtorgarAsignacion(membresiaId: string, formulario: FormularioAsignacion): CuerpoOtorgarAsignacion {
  return { membresia_id: membresiaId, ...aCuerpoAsignacion(formulario), vigente_desde: formulario.vigenteDesde };
}
