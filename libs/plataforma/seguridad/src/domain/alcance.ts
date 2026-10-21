export const ALCANCES = ['TENANT', 'EMPRESA', 'SUCURSAL', 'UNIDAD'] as const;
export type Alcance = (typeof ALCANCES)[number];

export const RANGO_ALCANCE: Record<Alcance, number> = { TENANT: 4, EMPRESA: 3, SUCURSAL: 2, UNIDAD: 1 };

/** Ubicación ya resuelta contra org: la sucursal trae su empresa; la unidad, su sucursal y empresa. */
export interface Ambito {
  alcance: Alcance;
  empresaId: string | null;
  sucursalId: string | null;
  unidadId: string | null;
}

export function alcanceAlMenos(alcance: Alcance, minimo: Alcance): boolean {
  return RANGO_ALCANCE[alcance] >= RANGO_ALCANCE[minimo];
}

/** true si `otorgante` tiene rango igual o mayor y su ámbito contiene al `destino` (TR-RF-013, TR-RN-007). */
export function cubre(otorgante: Ambito, destino: Ambito): boolean {
  if (!alcanceAlMenos(otorgante.alcance, destino.alcance)) return false;
  switch (otorgante.alcance) {
    case 'TENANT':
      return true;
    case 'EMPRESA':
      return otorgante.empresaId !== null && destino.empresaId === otorgante.empresaId;
    case 'SUCURSAL':
      return otorgante.sucursalId !== null && destino.sucursalId === otorgante.sucursalId;
    case 'UNIDAD':
      return otorgante.unidadId !== null && destino.unidadId === otorgante.unidadId;
  }
}
