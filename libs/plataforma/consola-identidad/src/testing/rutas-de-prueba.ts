import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { CONSOLA_IDENTIDAD_ROUTES } from '../lib/consola-identidad.routes';
import { RUTA_PROHIBIDO, type DobleSesion } from './doble-sesion';
import { API_URL } from './http-de-prueba';

/** Rutas diferidas, `import()` dinámicos y promesas encadenadas de las páginas: unas vueltas del bucle bastan. */
const VUELTAS_DE_ESPERA = 5;

@Component({ template: '<p data-destino>destino</p>' })
export class Destino {}

export interface DobleAvisos {
  toast: ReturnType<typeof vi.fn>;
  advertencia: ReturnType<typeof vi.fn>;
  confirmar: ReturnType<typeof vi.fn>;
  confirmarDestructiva: ReturnType<typeof vi.fn>;
}

export function crearDobleAvisos(): DobleAvisos {
  return {
    toast: vi.fn(),
    advertencia: vi.fn(async () => undefined),
    confirmar: vi.fn(async () => true),
    confirmarDestructiva: vi.fn(async () => ({ confirmado: true })),
  };
}

export interface ConsolaDePrueba {
  harness: RouterTestingHarness;
  http: HttpTestingController;
  elemento: () => HTMLElement;
  url: () => string;
  /** Espera las promesas de la página y el render siguiente. */
  estable: () => Promise<void>;
}

/** Monta las rutas reales de la lib bajo `consola/identidad`, con HTTP de prueba, el doble de sesión y el de avisos. */
export async function abrirConsola(ruta: string, sesion: DobleSesion, avisos: DobleAvisos): Promise<ConsolaDePrueba> {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'consola/identidad', children: CONSOLA_IDENTIDAD_ROUTES },
        { path: '403', component: Destino },
      ]),
      { provide: SesionService, useValue: sesion },
      { provide: AvisosService, useValue: avisos },
      { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL, rutas: { prohibido: RUTA_PROHIBIDO } } },
      { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create(ruta);
  /** También la de la app: el panel lateral se pinta fuera del componente de la ruta. */
  const estable = async () => {
    for (let vuelta = 0; vuelta < VUELTAS_DE_ESPERA; vuelta++) {
      await new Promise((resolver) => setTimeout(resolver));
      await harness.fixture.whenStable();
      await TestBed.inject(ApplicationRef).whenStable();
    }
  };
  await estable();
  return { harness, http, elemento: () => harness.routeNativeElement as HTMLElement, url: () => TestBed.inject(Router).url, estable };
}
