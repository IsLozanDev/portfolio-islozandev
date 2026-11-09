import { HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { FERIADOS_ROUTES } from '../lib/feriados.routes';
import type { AlcanceFeriado } from '../lib/models/feriado';
import { SUCURSALES } from './feriados-de-prueba';
import { estable, proveedoresHttpDePrueba } from './http-de-prueba';

export const ALCANCES_CONSOLA: AlcanceFeriado[] = ['GLOBAL'];
export const ALCANCES_ADMIN: AlcanceFeriado[] = ['TENANT', 'SUCURSAL'];
/** Rutas diferidas y promesas encadenadas de la página: unas vueltas del bucle bastan. */
const VUELTAS_DE_ESPERA = 4;

export interface DobleAvisos {
  toast: ReturnType<typeof vi.fn>;
  confirmarDestructiva: ReturnType<typeof vi.fn>;
}

export function crearDobleAvisos(): DobleAvisos {
  return { toast: vi.fn(), confirmarDestructiva: vi.fn(async () => ({ confirmado: true })) };
}

export interface PaginaDePrueba {
  http: HttpTestingController;
  elemento: () => HTMLElement;
  url: () => string;
  estable: () => Promise<void>;
}

/** Monta `FERIADOS_ROUTES` bajo `feriados` con los `alcances` de la app, HTTP de prueba y las sucursales de `mi-contexto`. */
export async function abrirFeriados(ruta: string, alcances: AlcanceFeriado[], avisos: DobleAvisos): Promise<PaginaDePrueba> {
  TestBed.configureTestingModule({
    providers: [
      ...proveedoresHttpDePrueba(),
      provideRouter([{ path: 'feriados', data: { alcances }, children: FERIADOS_ROUTES }]),
      { provide: SesionService, useValue: { contexto: signal({ sucursales: SUCURSALES }) } },
      { provide: AvisosService, useValue: avisos },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create(ruta);
  const esperar = async () => {
    for (let vuelta = 0; vuelta < VUELTAS_DE_ESPERA; vuelta++) await estable(harness.fixture);
  };
  await esperar();
  return { http, elemento: () => harness.routeNativeElement as HTMLElement, url: () => TestBed.inject(Router).url, estable: esperar };
}
