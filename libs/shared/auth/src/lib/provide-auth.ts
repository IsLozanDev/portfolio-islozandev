import {
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
} from '@angular/core';
import { CONFIG_AUTH, resolverConfigAuth, type ConfigAuth } from './config';
import { InactividadService } from './inactividad.service';
import { SesionService } from './sesion.service';

/**
 * Registra la configuración, lee la sesión antes del primer ruteo y vigila la inactividad.
 * La app agrega `provideHttpClient(withInterceptors([authInterceptor]))` y `provideRouter(...)`.
 */
export function provideAuth(config: ConfigAuth): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CONFIG_AUTH, useValue: resolverConfigAuth(config) },
    provideAppInitializer(() => inject(SesionService).iniciar()),
    provideEnvironmentInitializer(() => inject(InactividadService)),
  ]);
}
