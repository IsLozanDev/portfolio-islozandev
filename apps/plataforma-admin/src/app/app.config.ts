import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter } from '@angular/router';
import { authInterceptor, provideAuth } from '@vitrina/shared/auth';
import { erroresHttpInterceptor } from '@vitrina/shared/shell';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

/** Fuente cargada en `index.html`; `seg.opcion.icono` guarda nombres de Material Symbols. */
const CLASE_FUENTE_ICONOS = 'material-symbols-outlined';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([authInterceptor, erroresHttpInterceptor])),
    provideAuth(environment.auth),
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass(CLASE_FUENTE_ICONOS);
    }),
  ],
};
