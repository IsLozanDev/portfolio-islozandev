import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { ADMIN_CLIENTE_ROUTES } from '../lib/admin-cliente.routes';
import type { DobleSesion } from './doble-sesion';
import { API_URL } from './http-de-prueba';

export const URL_CATALOGOS = `${API_URL}/catalogos`;
/** Rutas diferidas y promesas encadenadas de las páginas: unas vueltas del bucle bastan. */
const VUELTAS_DE_ESPERA = 4;

export const CATALOGOS = [
  { id: 'c-1', codigo: 'MEDIO_PAGO', nombre: 'Medios de pago', alcance: 'MIXTO', fuente: null, editable_por_tenant: true, version: 3, importable: false },
  { id: 'c-2', codigo: 'TIPO_COMPROBANTE', nombre: 'Tipos de comprobante', alcance: 'GLOBAL', fuente: 'SUNAT', editable_por_tenant: false, version: 1, importable: false },
  { id: 'c-3', codigo: 'AREA', nombre: 'Áreas', alcance: 'TENANT', fuente: null, editable_por_tenant: true, version: 1, importable: false },
];

export const PLIN_ID = '0193f3a0-0000-7000-8000-00000000d003';
export const filaPlin = (cambios: object = {}) => ({
  item_id: PLIN_ID,
  codigo: 'PLIN',
  nombre: 'Plin',
  orden: 3,
  vigente_desde: '2026-01-01',
  vigente_hasta: null,
  propio: false,
  estado: 'VISIBLE',
  ajuste: null,
  version: 0,
  ...cambios,
});
export const VALE_ID = '0193f3a0-0000-7000-8000-00000000d0a1';
export const filaVale = (cambios: object = {}) => ({
  item_id: VALE_ID,
  codigo: 'VALE',
  nombre: 'Vale de consumo',
  orden: 9,
  vigente_desde: '2026-01-01',
  vigente_hasta: null,
  propio: true,
  estado: 'VISIBLE',
  ajuste: null,
  version: 2,
  ...cambios,
});

export interface DobleAvisosCatalogos {
  toast: ReturnType<typeof vi.fn>;
  advertencia: ReturnType<typeof vi.fn>;
  confirmar: ReturnType<typeof vi.fn>;
  confirmarDestructiva: ReturnType<typeof vi.fn>;
}

export function crearDobleAvisos(): DobleAvisosCatalogos {
  return {
    toast: vi.fn(),
    advertencia: vi.fn(async () => undefined),
    confirmar: vi.fn(async () => true),
    confirmarDestructiva: vi.fn(async () => ({ confirmado: true })),
  };
}

export interface AdminDePrueba {
  http: HttpTestingController;
  elemento: () => HTMLElement;
  url: () => string;
  estable: () => Promise<void>;
}

/** Monta `ADMIN_CLIENTE_ROUTES` bajo `admin` con HTTP de prueba, los dobles de sesión y avisos y sin animaciones. */
export async function abrirAdmin(ruta: string, sesion: DobleSesion, avisos: DobleAvisosCatalogos): Promise<AdminDePrueba> {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: 'admin', children: ADMIN_CLIENTE_ROUTES }]),
      { provide: SesionService, useValue: sesion },
      { provide: AvisosService, useValue: avisos },
      { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL, rutas: { prohibido: '/403' } } },
      { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create(ruta);
  const estable = async () => {
    for (let vuelta = 0; vuelta < VUELTAS_DE_ESPERA; vuelta++) {
      await new Promise((resolver) => setTimeout(resolver));
      await harness.fixture.whenStable();
      await TestBed.inject(ApplicationRef).whenStable();
    }
  };
  await estable();
  return { http, elemento: () => harness.routeNativeElement as HTMLElement, url: () => TestBed.inject(Router).url, estable };
}
