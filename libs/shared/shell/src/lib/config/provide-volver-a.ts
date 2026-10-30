import { inject, makeEnvironmentProviders, provideAppInitializer, type EnvironmentProviders } from '@angular/core';
import { VolverAService } from '../services/volver-a.service';
import { ORIGENES_VOLVER_A, type OrigenesVolverA } from './volver-a.config';

/**
 * Lista blanca de orígenes de `?volverA=` por ambiente. El servicio arranca con la app para leer el
 * parámetro ya en la primera navegación (la entrada profunda desde la otra app).
 */
export function provideVolverA(origenes: OrigenesVolverA): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ORIGENES_VOLVER_A, useValue: origenes },
    provideAppInitializer(() => {
      inject(VolverAService);
    }),
  ]);
}
