import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { CONSOLA_CATALOGOS_ROUTES } from '../lib/consola-catalogos.routes';
import type { DobleSesion } from './doble-sesion';
import { API_URL } from './http-de-prueba';

export const RUTA_BASE = '/consola/catalogos';
export const RUTA_MFA = '/auth/mfa';
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

/**
 * Monta las rutas reales de la lib bajo `consola/catalogos`, con HTTP de prueba, el doble de sesión y el de
 * avisos. `extra` suma rutas hermanas, después de las de la lib.
 */
export async function abrirConsola(ruta: string, sesion: DobleSesion, avisos: DobleAvisos, extra: Routes = []): Promise<ConsolaDePrueba> {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'consola/catalogos', children: [...CONSOLA_CATALOGOS_ROUTES, ...extra] },
        { path: '403', component: Destino },
        { path: 'auth/mfa', component: Destino },
      ]),
      { provide: SesionService, useValue: sesion },
      { provide: AvisosService, useValue: avisos },
      { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL, rutas: { mfa: RUTA_MFA, prohibido: '/403' } } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create(ruta);
  const estable = async () => {
    for (let vuelta = 0; vuelta < VUELTAS_DE_ESPERA; vuelta++) {
      await new Promise((resolver) => setTimeout(resolver));
      await harness.fixture.whenStable();
    }
  };
  await estable();
  return { harness, http, elemento: () => harness.routeNativeElement as HTMLElement, url: () => TestBed.inject(Router).url, estable };
}
