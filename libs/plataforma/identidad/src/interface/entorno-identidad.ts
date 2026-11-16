import { z } from 'zod';

export const PROVEEDORES_IDENTIDAD = ['decolecta', 'falso'] as const;
export type ProveedorElegido = (typeof PROVEEDORES_IDENTIDAD)[number];

const AMBIENTE_PRODUCCION = 'production';

/** Variables de identidad que valida apps/api con zod. El token es secreto (regla 9). */
export const camposEntornoIdentidad = {
  IDN_PROVEEDOR: z.enum(PROVEEDORES_IDENTIDAD).default('falso'),
  IDN_DECOLECTA_TOKEN: z.string().min(1).optional(),
};

interface EntornoIdentidad {
  APP_ENV: string;
  IDN_PROVEEDOR: ProveedorElegido;
  IDN_DECOLECTA_TOKEN?: string;
}

/**
 * Para `superRefine` del esquema de la app. En producción el falso no se admite; con Decolecta el token
 * es obligatorio en cualquier ambiente. En local, test y staging se admite el falso.
 */
export function exigirProveedorReal(entorno: EntornoIdentidad, contexto: z.RefinementCtx): void {
  if (entorno.APP_ENV === AMBIENTE_PRODUCCION && entorno.IDN_PROVEEDOR !== 'decolecta') {
    contexto.addIssue({ code: 'custom', path: ['IDN_PROVEEDOR'], message: 'en producción debe ser decolecta' });
  }
  const exigeToken = entorno.IDN_PROVEEDOR === 'decolecta' || entorno.APP_ENV === AMBIENTE_PRODUCCION;
  if (exigeToken && !entorno.IDN_DECOLECTA_TOKEN) {
    contexto.addIssue({ code: 'custom', path: ['IDN_DECOLECTA_TOKEN'], message: 'obligatorio con decolecta' });
  }
}
