import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
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
import { CABECERA_SUCURSAL, SesionService } from './sesion.service';

describe('SesionService (contexto y sucursal, TR-RF-016)', () => {
  let supabase: DobleSupabase;
  let servicio: SesionService;
  let http: HttpTestingController;

  beforeEach(() => {
    supabase = new DobleSupabase();
    TestBed.configureTestingModule({ providers: proveerAuthDePrueba(supabase) });
    servicio = TestBed.inject(SesionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('iniciar con sesión carga el contexto sin cabecera de sucursal', async () => {
    supabase.sesionGuardada = sesionDePrueba();

    const [, peticion] = await Promise.all([servicio.iniciar(), responderMiContexto(http)]);

    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.headers.has(CABECERA_SUCURSAL)).toBe(false);
    expect(servicio.contexto()?.tenantId).toBe('t-1');
  });

  it('iniciar sin sesión no pide el contexto', async () => {
    await servicio.iniciar();

    http.expectNone(() => true);
    expect(servicio.contexto()).toBeNull();
  });

  it('si la API falla al iniciar, el arranque sigue y el contexto queda en null', async () => {
    supabase.sesionGuardada = sesionDePrueba();
    const inicio = servicio.iniciar();

    (await esperarMiContexto(http)).flush({ codigo: 'X' }, { status: 503, statusText: 'Service Unavailable' });

    await expect(inicio).resolves.toBeUndefined();
    expect(servicio.autenticado()).toBe(true);
    expect(servicio.contexto()).toBeNull();
  });

  it('TR-CA-044: con una sola sucursal, la actual es esa sin pedir selección', async () => {
    const [contexto] = await Promise.all([servicio.cargarContexto(), responderMiContexto(http)]);

    expect(contexto.requiereSeleccion).toBe(false);
    expect(servicio.sucursalId()).toBe(MIRAFLORES.id);
  });

  it('TR-CA-045: cambiar a Surco recarga permisos y menú con X-Sucursal-Id, sin volver a autenticar', async () => {
    await Promise.all([
      servicio.cargarContexto(),
      responderMiContexto(http, contextoDePrueba({ sucursales: [MIRAFLORES, SURCO] })),
    ]);
    const menuSurco = [{ codigo: 'rest.reportes', padre: null, nombre: 'Reportes', ruta: '/reportes', icono: null, orden: 2 }];

    const [, peticion] = await Promise.all([
      servicio.seleccionarSucursal(SURCO.id),
      responderMiContexto(
        http,
        contextoDePrueba({ sucursales: [MIRAFLORES, SURCO], sucursal_actual: SURCO.id, permisos: ['rest.reportes.ver'], menu: menuSurco }),
      ),
    ]);

    expect(peticion.request.headers.get(CABECERA_SUCURSAL)).toBe(SURCO.id);
    expect(servicio.sucursalId()).toBe(SURCO.id);
    expect(servicio.tiene('rest.reportes.ver')).toBe(true);
    expect(servicio.tiene('rest.caja.abrir')).toBe(false);
    expect(servicio.contexto()?.menu).toEqual(menuSurco);
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(supabase.auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('TR-CA-046: sin sucursales accesibles el contexto marca sinAccesos', async () => {
    const sinAccesos = contextoDePrueba({ sucursales: [], sucursal_actual: null, sin_accesos: true, permisos: [], menu: [] });

    const [contexto] = await Promise.all([servicio.cargarContexto(), responderMiContexto(http, sinAccesos)]);

    expect(contexto.sinAccesos).toBe(true);
    expect(servicio.sucursalId()).toBeNull();
  });

  describe('tiene', () => {
    beforeEach(async () => {
      await Promise.all([
        servicio.cargarContexto(),
        responderMiContexto(http, contextoDePrueba({ permisos: ['rest.caja.abrir', 'rest.venta.anular'] })),
      ]);
    });

    it('con una cadena exige ese permiso', () => {
      expect(servicio.tiene('rest.caja.abrir')).toBe(true);
      expect(servicio.tiene('rest.caja.cerrar')).toBe(false);
    });

    it('con una lista basta con cualquiera (OR)', () => {
      expect(servicio.tiene(['rest.caja.cerrar', 'rest.venta.anular'])).toBe(true);
      expect(servicio.tiene(['rest.caja.cerrar', 'plat.tenant.crear'])).toBe(false);
    });

    it('con una lista vacía es false', () => {
      expect(servicio.tiene([])).toBe(false);
    });
  });

  it('sin contexto no tiene ningún permiso', () => {
    expect(servicio.tiene('rest.caja.abrir')).toBe(false);
    expect(servicio.permisos().size).toBe(0);
  });
});
