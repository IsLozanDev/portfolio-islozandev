import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { authInterceptor, provideAuth } from '@vitrina/shared/auth';
import { erroresHttpInterceptor, provideVolverA } from '@vitrina/shared/shell';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([authInterceptor, erroresHttpInterceptor])),
    provideAuth(environment.auth),
    provideVolverA(environment.origenesVolverA),
  ],
};
