import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { AvisosService, FiltrosComponent, TablaComponent } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_CONSOLA } from '../../models/mensajes-consola';
import { PERMISOS_CONSOLA } from '../../models/permisos-consola';
import { TenantsListaPage } from './tenants-lista.page';

const URL_TENANTS = `${API_URL}/org/tenants`;
const RUTA_LISTA = '/consola/tenants';
const RUTA_MFA = '/auth/mfa';

const GYM = {
  id: 't-gym',
  codigo: 'gym-fuerza-total',
  nombre: 'Gym Fuerza Total',
  estado: 'SUSPENDIDO',
  creado_en: '2026-10-01T15:00:00.000Z',
  suscripciones: [{ producto_codigo: 'GYM', plan: 'PRO', estado: 'ACTIVA', vigente_hasta: null }],
};

@Component({ template: '' })
class Destino {}

describe('TenantsListaPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let sesion: DobleSesion;

  const esperarLista = (): TestRequest => http.expectOne((solicitud) => solicitud.url === URL_TENANTS);
  const parametros = (peticion: TestRequest) => Object.fromEntries(peticion.request.params.keys().map((clave) => [clave, peticion.request.params.get(clave)]));
  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const botonNuevo = () => [...elemento().querySelectorAll('button')].find((boton) => boton.textContent?.includes(MENSAJES_CONSOLA.nuevoTenant));

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(ruta = RUTA_LISTA): Promise<TestRequest> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'consola/tenants', component: TenantsListaPage },
          { path: 'consola/tenants/nuevo', component: Destino },
          { path: 'auth/mfa', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: AvisosService, useValue: { advertencia: vi.fn(async () => undefined) } },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL, rutas: { mfa: RUTA_MFA } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(ruta);
    return esperarLista();
  }

  async function responder(peticion: TestRequest, cuerpo: object): Promise<void> {
    peticion.flush(cuerpo);
    await estable();
  }

  beforeEach(() => {
    sesion = new DobleSesion().conPermisos(PERMISOS_CONSOLA.tenantConsultar);
  });

  afterEach(() => http.verify());

  it('pide la primera página y muestra cada fila como texto', async () => {
    const peticion = await abrir();
    expect(parametros(peticion)).toEqual({ pagina: '1', tamano: '20' });

    await responder(peticion, { items: [GYM], total: 1 });

    const fila = elemento().querySelector('tr[mat-row]')?.textContent ?? '';
    expect(fila).toContain('gym-fuerza-total');
    expect(fila).toContain('Suspendido');
    expect(fila).toContain('GYM PRO');
    expect(fila).toContain('01/10/2026');
    expect(elemento().querySelector('a[aria-label="Ver detalle: gym-fuerza-total"]')?.getAttribute('href')).toBe('/consola/tenants/t-gym');
  });

  it('filtrar por SUSPENDIDO lo pone en la URL y pide estado=SUSPENDIDO desde la página 1', async () => {
    await responder(await abrir(`${RUTA_LISTA}?pagina=2`), { items: [], total: 0 });

    harness.fixture.debugElement.query(By.directive(FiltrosComponent)).componentInstance.cambio.emit({ busqueda: '', estado: 'SUSPENDIDO', producto: null });
    await estable();

    expect(url()).toBe(`${RUTA_LISTA}?estado=SUSPENDIDO`);
    expect(parametros(esperarLista())).toEqual({ pagina: '1', tamano: '20', estado: 'SUSPENDIDO' });
  });

  it('al recargar con filtros en la URL los pide y los muestra en los controles', async () => {
    const peticion = await abrir(`${RUTA_LISTA}?q=gym&estado=SUSPENDIDO&pagina=2`);

    expect(parametros(peticion)).toEqual({ pagina: '2', tamano: '20', q: 'gym', estado: 'SUSPENDIDO' });
    await responder(peticion, { items: [GYM], total: 21 });
    const campo: HTMLInputElement | null = elemento().querySelector('input[type="search"]');
    expect(campo?.value).toBe('gym');
    expect(harness.fixture.debugElement.query(By.directive(TablaComponent)).componentInstance.indicePagina()).toBe(1);
  });

  it('cambiar de página la pone en la URL', async () => {
    await responder(await abrir(), { items: [GYM], total: 21 });

    harness.fixture.debugElement.query(By.directive(TablaComponent)).componentInstance.pagina.emit({ indice: 1, tamano: 20 });
    await estable();

    expect(url()).toBe(`${RUTA_LISTA}?pagina=2`);
    expect(parametros(esperarLista())).toEqual({ pagina: '2', tamano: '20' });
  });

  it('un error de la API se muestra como alerta y sin filas', async () => {
    const peticion = await abrir();
    peticion.flush({ codigo: 'OPERADOR_REQUERIDO', mensaje: 'Solo el tenant operador puede administrar tenants' }, { status: 403, statusText: 'Forbidden' });
    await estable();

    expect(elemento().querySelector('[role="alert"]')?.textContent).toContain('Solo el tenant operador puede administrar tenants');
    expect(elemento().querySelectorAll('tr[mat-row]')).toHaveLength(0);
  });

  it('sin plat.tenant.crear no muestra «Nuevo tenant»', async () => {
    await responder(await abrir(), { items: [], total: 0 });

    expect(botonNuevo()).toBeUndefined();
  });

  it('«Nuevo tenant» con MFA vigente abre el asistente', async () => {
    sesion.contexto.set({ permisos: [PERMISOS_CONSOLA.tenantConsultar, PERMISOS_CONSOLA.tenantCrear], mfaVigente: true });
    await responder(await abrir(), { items: [], total: 0 });

    botonNuevo()?.click();

    await vi.waitFor(() => expect(url()).toBe('/consola/tenants/nuevo'));
  });

  it('«Nuevo tenant» sin MFA vigente lleva a /auth/mfa con retorno a la lista', async () => {
    sesion.conPermisos(PERMISOS_CONSOLA.tenantConsultar, PERMISOS_CONSOLA.tenantCrear);
    await responder(await abrir(), { items: [], total: 0 });

    botonNuevo()?.click();

    await vi.waitFor(() => expect(url()).toBe(`${RUTA_MFA}?returnUrl=${encodeURIComponent(RUTA_LISTA)}`));
  });
});
