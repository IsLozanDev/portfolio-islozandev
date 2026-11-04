import { EnvironmentInjector, inject, provideAppInitializer, type EnvironmentProviders } from '@angular/core';

/**
 * Spec 18: el número de solicitudes de soporte pendientes junto a «Soporte» en el menú. `admin-cliente`
 * se carga de forma diferida (sus rutas): se importa dinámico y sin frenar el arranque.
 */
export function iniciarInsigniasSoporte(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const inyector = inject(EnvironmentInjector);
    void import('@vitrina/plataforma/admin-cliente').then(({ InsigniasSoporteService }) => inyector.get(InsigniasSoporteService));
  });
}
