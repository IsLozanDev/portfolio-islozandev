/** Repetidos de `libs/plataforma/org` (`type:backend`, no importable desde el front). */
export const PRODUCTOS = ['REST', 'PSI', 'COL', 'LIB', 'GYM', 'CLI', 'DOC', 'ECO', 'LEX'] as const;
export type ProductoCodigo = (typeof PRODUCTOS)[number];

export const PLANES = ['BASICO', 'PRO', 'EMPRESA'] as const;
export type Plan = (typeof PLANES)[number];

export const MODALIDADES = ['PRUEBA', 'ACTIVO'] as const;
export type Modalidad = (typeof MODALIDADES)[number];

export const ESTADOS_TENANT = ['PRUEBA', 'ACTIVO', 'SUSPENDIDO', 'BAJA'] as const;
export type EstadoTenant = (typeof ESTADOS_TENANT)[number];

/** Matriz de `libs/plataforma/org/src/domain/tenant.ts` (TR-RN-005): la UI solo ofrece estos destinos. */
export const TRANSICIONES_TENANT: Readonly<Record<EstadoTenant, readonly EstadoTenant[]>> = {
  PRUEBA: ['ACTIVO', 'SUSPENDIDO', 'BAJA'],
  ACTIVO: ['SUSPENDIDO', 'BAJA'],
  SUSPENDIDO: ['ACTIVO', 'BAJA'],
  BAJA: [],
};
