import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  contextoDePrueba,
  DobleSupabase,
  esperarMiContexto,
  MIRAFLORES,
  proveerAuthDePrueba,
  responderMiContexto,
  sesionDePrueba,
  SURCO,
} from '../testing/doble-supabase';
import { aal2Guard, anonimoGuard, autenticadoGuard, permisoGuard } from './guards';

@Component({ template: 'pagina' })
class Pagina {}

const RUTAS = [
  { path: 'caja', component: Pagina, canActivate: [autenticadoGuard] },
  { path: 'consola', component: Pagina, canActivate: [aal2Guard] },
  { path: 'anular', component: Pagina, canMatch: [permisoGuard('rest.venta.anular')] },
  { path: 'reportes', component: Pagina, canMatch: [permisoGuard(['rest.reportes.ver', 'rest.caja.abrir'])] },
  { path: 'auth/ingresar', component: Pagina, canActivate: [anonimoGuard] },
  { path: '**', component: Pagina },
];

describe('guards', () => {
  let supabase: DobleSupabase;
  let http: HttpTestingController;

  function configurar(): void {
    TestBed.configureTestingModule({ providers: [...proveerAuthDePrueba(supabase), provideRouter(RUTAS)] });
    http = TestBed.inject(HttpTestingController);
  }

  /** Navega mientras responde el `mi-contexto` que pide `iniciar()`. */
  async function navegarConSesion(url: string, contexto = contextoDePrueba()): Promise<string> {
    supabase.sesionGuardada = sesionDePrueba();
    configurar();
    const harness = await RouterTestingHarness.create();
    await Promise.all([harness.navigateByUrl(url), responderMiContexto(http, contexto)]);
    return TestBed.inject(Router).url;
  }

  async function navegarSinSesion(url: string): Promise<string> {
    configurar();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return TestBed.inject(Router).url;
  }

  beforeEach(() => {
    supabase = new DobleSupabase();
  });

  afterEach(() => http.verify());

  describe('autenticadoGuard', () => {
    it('con sesión válida en la cookie, la primera navegación entra sin ir a ingresar', async () => {
      expect(await navegarConSesion('/caja')).toBe('/caja');
    });

    it('sin sesión va a /auth/ingresar?returnUrl', async () => {
      expect(await navegarSinSesion('/caja')).toBe('/auth/ingresar?returnUrl=%2Fcaja');
    });

    it('sesión aal1 con factor TOTP verificado va a /auth/mfa?returnUrl', async () => {
      supabase.nivelSiguiente = 'aal2';

      expect(await navegarConSesion('/caja')).toBe('/auth/mfa?returnUrl=%2Fcaja');
    });

    it('TR-CA-044: con una sola sucursal entra sin pasar por el selector', async () => {
      expect(await navegarConSesion('/caja', contextoDePrueba({ sucursales: [MIRAFLORES] }))).toBe('/caja');
    });

    it('TR-CA-046: sin accesos vigentes va a /sin-accesos', async () => {
      const sinAccesos = contextoDePrueba({ sucursales: [], sucursal_actual: null, sin_accesos: true, permisos: [], menu: [] });

      expect(await navegarConSesion('/caja', sinAccesos)).toBe('/sin-accesos');
    });

    it('con varias sucursales y ninguna elegida va a /seleccionar-sucursal?returnUrl', async () => {
      const varias = contextoDePrueba({ sucursales: [MIRAFLORES, SURCO], sucursal_actual: null, requiere_seleccion: true });

      expect(await navegarConSesion('/caja', varias)).toBe('/seleccionar-sucursal?returnUrl=%2Fcaja');
    });

    it('si el contexto no se pudo cargar al iniciar, lo vuelve a pedir', async () => {
      supabase.sesionGuardada = sesionDePrueba();
      configurar();
      const harness = await RouterTestingHarness.create();
      const navegacion = harness.navigateByUrl('/caja');

      (await esperarMiContexto(http)).flush({}, { status: 503, statusText: 'Service Unavailable' });
      await responderMiContexto(http);

      await navegacion;
      expect(TestBed.inject(Router).url).toBe('/caja');
    });
  });

  describe('anonimoGuard', () => {
    it('sin sesión deja entrar a ingresar', async () => {
      expect(await navegarSinSesion('/auth/ingresar')).toBe('/auth/ingresar');
    });

    it('con sesión manda a la portada', async () => {
      expect(await navegarConSesion('/auth/ingresar')).toBe('/');
    });
  });

  describe('aal2Guard', () => {
    it('con sesión aal1 va a /auth/mfa?returnUrl', async () => {
      expect(await navegarConSesion('/consola')).toBe('/auth/mfa?returnUrl=%2Fconsola');
    });

    it('con sesión aal2 entra', async () => {
      supabase.nivelActual = 'aal2';

      expect(await navegarConSesion('/consola')).toBe('/consola');
    });

    it('sin sesión va a ingresar', async () => {
      expect(await navegarSinSesion('/consola')).toBe('/auth/ingresar?returnUrl=%2Fconsola');
    });
  });

  describe('permisoGuard', () => {
    it('sin el permiso redirige a /403', async () => {
      expect(await navegarConSesion('/anular')).toBe('/403');
    });

    it('con el permiso entra', async () => {
      expect(await navegarConSesion('/anular', contextoDePrueba({ permisos: ['rest.venta.anular'] }))).toBe('/anular');
    });

    it('con una lista entra si tiene cualquiera', async () => {
      expect(await navegarConSesion('/reportes')).toBe('/reportes');
    });
  });
});
