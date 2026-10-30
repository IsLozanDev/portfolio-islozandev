import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_UNIDADES } from '../../models/mensajes-organizacion';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { UnidadesListaPage } from './unidades-lista.page';

const URL_EMPRESAS = `${API_URL}/org/empresas`;
const URL_SUCURSALES_SABORES = `${API_URL}/org/empresas/e-sabores/sucursales`;
const URL_UNIDADES = `${API_URL}/org/unidades`;
const unidad = (id: string, codigo: string, cambios: object = {}) => ({
  id,
  empresa_id: 'e-sabores',
  sucursal_id: 's-cayma',
  tipo: 'CAJA',
  codigo,
  nombre: `Unidad ${codigo}`,
  padre_id: null,
  atributos: {},
  activo: true,
  version: 1,
  ...cambios,
});

@Component({ selector: 'vit-destino-unidades-lista', template: '' })
class Destino {}

describe('UnidadesListaPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let sesion: DobleSesion;
  let avisos: { toast: ReturnType<typeof vi.fn>; confirmarDestructiva: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const esperar = (ruta: string): TestRequest => http.expectOne((solicitud) => solicitud.url === ruta);
  const filaDe = (codigo: string) => [...elemento().querySelectorAll<HTMLElement>('tr[mat-row]')].find((filaTabla) => filaTabla.textContent?.includes(codigo));
  const accion = (codigo: string, tipo: string) => filaDe(codigo)?.querySelector<HTMLElement>(`[data-accion=${tipo}]`) ?? null;

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(ruta: string): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin', children: [{ path: 'unidades', component: UnidadesListaPage }] },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(ruta);
    await estable();
    esperar(URL_EMPRESAS).flush({ items: [{ id: 'e-sabores', razon_social: 'Sabores del Sur SAC' }], total: 1 });
    await estable();
  }

  /** Responde la lista de unidades y, la primera vez, las sucursales de la empresa. */
  async function responder(filas: object[], conSucursales = true): Promise<TestRequest> {
    const peticion = esperar(URL_UNIDADES);
    peticion.flush({ items: filas, total: filas.length });
    if (conSucursales) esperar(URL_SUCURSALES_SABORES).flush({ items: [{ id: 's-cayma', codigo: 'CAYMA', nombre: 'Cayma' }], total: 1 });
    await estable();
    return peticion;
  }

  beforeEach(() => {
    sesion = new DobleSesion().conPermisos(PERMISOS_ADMIN.organizacionConsultar, PERMISOS_ADMIN.unidadGestionar);
    avisos = { toast: vi.fn(), confirmarDestructiva: vi.fn(async () => ({ confirmado: true, motivo: null })) };
  });

  afterEach(() => http.verify());

  it('sin empresa en la URL elige la primera y pide sus unidades activas', async () => {
    await abrir('/admin/unidades');

    expect(url()).toBe('/admin/unidades?empresa=e-sabores');
    const peticion = await responder([]);
    expect(peticion.request.params.toString()).toBe('empresa_id=e-sabores&pagina=1&tamano=20&activo=true');
  });

  it('el filtro por sucursal y tipo arma sucursal_id y tipo', async () => {
    await abrir('/admin/unidades?empresa=e-sabores&sucursal=s-cayma&tipo=CAJA');
    const peticion = await responder([unidad('u-caja', 'CAJA-01')]);

    expect(peticion.request.params.get('sucursal_id')).toBe('s-cayma');
    expect(peticion.request.params.get('tipo')).toBe('CAJA');
  });

  it('TR-CA-010 y TR-CA-012: muestra la caja en «Cayma» y el almacén de nivel empresa con «Empresa»', async () => {
    await abrir('/admin/unidades?empresa=e-sabores');
    await responder([unidad('u-alm', 'ALM', { tipo: 'ALMACEN', sucursal_id: null }), unidad('u-caja', 'CAJA-01')]);

    expect(filaDe('CAJA-01')?.textContent).toContain('Caja');
    expect(filaDe('CAJA-01')?.textContent).toContain('Cayma');
    expect(filaDe('ALM')?.textContent).toContain('Almacén');
    expect(filaDe('ALM')?.textContent).toContain(MENSAJES_UNIDADES.nivelEmpresa);
  });

  it('inactivar confirma sin motivo, envía y recarga la lista sin volver a pedir las sucursales', async () => {
    await abrir('/admin/unidades?empresa=e-sabores');
    await responder([unidad('u-caja', 'CAJA-01')]);

    accion('CAJA-01', 'inactivar')?.click();
    await estable();

    expect(avisos.confirmarDestructiva).toHaveBeenCalledWith(expect.not.objectContaining({ pedirMotivo: true }));
    esperar(`${URL_UNIDADES}/u-caja/inactivar`).flush(null, { status: 204, statusText: 'No Content' });
    await estable();
    await responder([], false);

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_UNIDADES.inactivada);
  });

  it('reactivar envía PUT con los datos de la fila y activo: true', async () => {
    await abrir('/admin/unidades?empresa=e-sabores&activo=false');
    await responder([unidad('u-caja', 'CAJA-01', { activo: false, version: 3, atributos: { color: 'rojo' } })]);

    expect(accion('CAJA-01', 'inactivar')).toBeNull();
    accion('CAJA-01', 'reactivar')?.click();
    await estable();

    const peticion = esperar(`${URL_UNIDADES}/u-caja`);
    expect(peticion.request.body).toEqual({ version: 3, activo: true, codigo: 'CAJA-01', nombre: 'Unidad CAJA-01', padre_id: null, atributos: { color: 'rojo' } });
    peticion.flush(null, { status: 204, statusText: 'No Content' });
    await estable();
    await responder([], false);
  });

  it('enlaza a la edición y al alta con empresa y sucursal', async () => {
    await abrir('/admin/unidades?empresa=e-sabores&sucursal=s-cayma');
    await responder([unidad('u-caja', 'CAJA-01')]);

    expect(accion('CAJA-01', 'editar')?.getAttribute('href')).toBe('/admin/unidades/u-caja/editar');
    expect(elemento().querySelector('[data-accion=nueva]')?.getAttribute('href')).toBe('/admin/unidades/nueva?empresa=e-sabores&sucursal=s-cayma');
  });

  it('sin plat.unidad.gestionar no hay alta, edición, inactivación ni reactivación', async () => {
    sesion.conPermisos(PERMISOS_ADMIN.organizacionConsultar);
    await abrir('/admin/unidades?empresa=e-sabores');
    await responder([unidad('u-caja', 'CAJA-01')]);

    for (const tipo of ['editar', 'inactivar', 'reactivar']) expect(accion('CAJA-01', tipo)).toBeNull();
    expect(elemento().querySelector('[data-accion=nueva]')).toBeNull();
  });
});
