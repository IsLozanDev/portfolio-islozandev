import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, type EnvironmentProviders, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';

export const API_URL = 'https://api.test/v1';
export const URL_FERIADOS = `${API_URL}/feriados`;

/** HttpClient de prueba con la `apiUrl` de `CONFIG_AUTH` y sin animaciones de Material (el panel cierra al instante). */
export function proveedoresHttpDePrueba(): (Provider | EnvironmentProviders)[] {
  return [
    provideHttpClient(),
    provideHttpClientTesting(),
    { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
    { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
  ];
}

export function prepararHttpDePrueba(): HttpTestingController {
  TestBed.configureTestingModule({ providers: proveedoresHttpDePrueba() });
  return TestBed.inject(HttpTestingController);
}

/** Espera las promesas de los clientes (`firstValueFrom`) y el render siguiente; sin fixture, el de la app (p. ej. un panel abierto). */
export async function estable(fixture?: { whenStable(): Promise<unknown> }): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver));
  await (fixture ?? TestBed.inject(ApplicationRef)).whenStable();
}
