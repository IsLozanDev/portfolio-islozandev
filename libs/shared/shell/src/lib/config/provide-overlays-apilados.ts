import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';

/**
 * Overlays del CDK (panel lateral, selects, menús) apilados por `z-index` y no en el top layer (`popover`).
 * En el top layer nada los tapa, y una confirmación de `AvisosService` (SweetAlert2, z-index 1060) abierta
 * desde el panel lateral quedaba debajo de su fondo, sin poder pulsarse (spec 30).
 */
export function provideOverlaysApilados(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: OVERLAY_DEFAULT_CONFIG, useValue: { usePopover: false } }]);
}
