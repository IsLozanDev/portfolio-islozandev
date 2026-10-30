import { InjectionToken } from '@angular/core';

/** Origen exacto (`esquema://host[:puerto]`) → nombre de la app que se muestra en «Volver a …» (U-06). */
export type OrigenesVolverA = Readonly<Record<string, string>>;

/** Sin `provideVolverA` la lista blanca está vacía y nunca hay enlace de vuelta. */
export const ORIGENES_VOLVER_A = new InjectionToken<OrigenesVolverA>('ORIGENES_VOLVER_A', { factory: () => ({}) });
