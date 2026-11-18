import type { ProductoCodigo } from '@vitrina/plataforma/org';

export const ROLES_PERSONA = ['CLIENTE', 'PACIENTE', 'SOCIO', 'ADMINISTRADO', 'CONTRAPARTE', 'PROVEEDOR'] as const;
export type RolPersona = (typeof ROLES_PERSONA)[number];

/** Fecha de calendario `AAAA-MM-DD`, sin hora. */
export type FechaRol = string;

export interface RolAsignado {
  productoCodigo: ProductoCodigo;
  rol: RolPersona;
  desde: FechaRol;
  /** Nula mientras el rol está vigente. Ningún caso de uso la escribe todavía. */
  hasta: FechaRol | null;
}

export function estaVigente(rolAsignado: RolAsignado): boolean {
  return rolAsignado.hasta === null;
}
