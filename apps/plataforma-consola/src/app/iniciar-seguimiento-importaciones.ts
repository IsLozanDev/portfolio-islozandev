import { EnvironmentInjector, inject, provideAppInitializer, type EnvironmentProviders } from '@angular/core';

/**
 * Spec 19d: el seguimiento global de las importaciones vive desde el arranque, así recupera las activas al
 * iniciar sesión o recargar. `consola-catalogos` se carga de forma diferida: se importa dinámico y sin frenar el arranque.
 */
export function iniciarSeguimientoImportaciones(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const inyector = inject(EnvironmentInjector);
    void import('@vitrina/plataforma/consola-catalogos').then(({ SeguimientoImportacionesService }) => inyector.get(SeguimientoImportacionesService));
  });
}
