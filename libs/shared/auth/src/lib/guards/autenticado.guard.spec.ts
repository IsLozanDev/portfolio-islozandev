import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { contextoDePrueba, esperarMiContexto, MIRAFLORES, responderMiContexto, sesionDePrueba, SURCO } from '../../testing/doble-supabase';
import { PaginaDePrueba, RutasDePrueba } from '../../testing/rutas-de-prueba';
import { autenticadoGuard } from './autenticado.guard';

describe('autenticadoGuard', () => {
  let rutas: RutasDePrueba;

  beforeEach(() => {
    rutas = new RutasDePrueba([{ path: 'caja', component: PaginaDePrueba, canActivate: [autenticadoGuard] }]);
  });

  afterEach(() => rutas.verificar());

  it('con sesión válida en la cookie, la primera navegación entra sin ir a ingresar', async () => {
    expect(await rutas.navegarConSesion('/caja')).toBe('/caja');
  });

  it('sin sesión va a /auth/ingresar?returnUrl', async () => {
    expect(await rutas.navegarSinSesion('/caja')).toBe('/auth/ingresar?returnUrl=%2Fcaja');
  });

  it('sesión aal1 con factor TOTP verificado va a /auth/mfa?returnUrl', async () => {
    rutas.supabase.nivelSiguiente = 'aal2';

    expect(await rutas.navegarConSesion('/caja')).toBe('/auth/mfa?returnUrl=%2Fcaja');
  });

  it('TR-CA-044: con una sola sucursal entra sin pasar por el selector', async () => {
    expect(await rutas.navegarConSesion('/caja', contextoDePrueba({ sucursales: [MIRAFLORES] }))).toBe('/caja');
  });

  it('TR-CA-046: sin accesos vigentes va a /sin-accesos', async () => {
    const sinAccesos = contextoDePrueba({ sucursales: [], sucursal_actual: null, sin_accesos: true, permisos: [], menu: [] });

    expect(await rutas.navegarConSesion('/caja', sinAccesos)).toBe('/sin-accesos');
  });

  it('sin tenant (403 SIN_TENANT de mi-contexto) también va a /sin-accesos', async () => {
    rutas.supabase.sesionGuardada = sesionDePrueba();
    rutas.configurar();
    const harness = await RouterTestingHarness.create();
    const navegacion = harness.navigateByUrl('/caja');
    const sinTenant = { status: 403, statusText: 'Forbidden' };

    (await esperarMiContexto(rutas.api)).flush({ codigo: 'SIN_TENANT' }, sinTenant);
    (await esperarMiContexto(rutas.api)).flush({ codigo: 'SIN_TENANT' }, sinTenant);

    await navegacion;
    expect(TestBed.inject(Router).url).toBe('/sin-accesos');
  });

  it('otro 403 de mi-contexto no se confunde con sin tenant', async () => {
    rutas.supabase.sesionGuardada = sesionDePrueba();
    rutas.configurar();
    const harness = await RouterTestingHarness.create();
    const navegacion = harness.navigateByUrl('/caja');
    const prohibido = { status: 403, statusText: 'Forbidden' };

    (await esperarMiContexto(rutas.api)).flush({ codigo: 'SIN_PERMISO' }, prohibido);
    (await esperarMiContexto(rutas.api)).flush({ codigo: 'SIN_PERMISO' }, prohibido);

    await expect(navegacion).rejects.toMatchObject({ status: 403 });
  });

  it('con varias sucursales y ninguna elegida va a /seleccionar-sucursal?returnUrl', async () => {
    const varias = contextoDePrueba({ sucursales: [MIRAFLORES, SURCO], sucursal_actual: null, requiere_seleccion: true });

    expect(await rutas.navegarConSesion('/caja', varias)).toBe('/seleccionar-sucursal?returnUrl=%2Fcaja');
  });

  it('si el contexto no se pudo cargar al iniciar, lo vuelve a pedir', async () => {
    rutas.supabase.sesionGuardada = sesionDePrueba();
    rutas.configurar();
    const harness = await RouterTestingHarness.create();
    const navegacion = harness.navigateByUrl('/caja');

    (await esperarMiContexto(rutas.api)).flush({}, { status: 503, statusText: 'Service Unavailable' });
    await responderMiContexto(rutas.api);

    await navegacion;
    expect(TestBed.inject(Router).url).toBe('/caja');
  });
});
