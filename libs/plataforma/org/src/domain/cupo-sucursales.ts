import { ConflictError } from '@vitrina/plataforma/kernel';
import type { Suscripcion } from './suscripcion.js';

/** Sucursales activas de todo el tenant contra el tope de su plan (TR-RN-006). */
export interface CupoSucursales {
  activas: number;
  tope: number | null;
}

/**
 * El menor limite_sucursales entre las suscripciones vigentes; null si ninguna fija tope.
 * Las sucursales no pertenecen a un producto, así que manda el plan más restrictivo.
 */
export function topeSucursales(suscripciones: readonly Suscripcion[]): number | null {
  const limites = suscripciones
    .filter((s) => s.vigente)
    .map((s) => s.datos.limiteSucursales)
    .filter((l): l is number => l !== null);
  return limites.length === 0 ? null : Math.min(...limites);
}

export function exigirCupo({ activas, tope }: CupoSucursales): void {
  if (tope !== null && activas >= tope) {
    throw new ConflictError(`Su plan permite ${tope} sucursales; amplíe su plan`);
  }
}
