import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CONFIG_AUTH } from '@vitrina/shared/auth';

export const API_URL = 'https://api.test/v1';

/** HttpClient de prueba con la `apiUrl` de `CONFIG_AUTH`; devuelve el controlador para esperar peticiones. */
export function prepararHttpDePrueba(): HttpTestingController {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } }],
  });
  return TestBed.inject(HttpTestingController);
}
