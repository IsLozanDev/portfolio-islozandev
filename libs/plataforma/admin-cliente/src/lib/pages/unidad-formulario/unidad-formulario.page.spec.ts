import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_ORGANIZACION, MENSAJES_UNIDADES } from '../../models/mensajes-organizacion';
import type { GrupoUnidad } from '../../utils/formulario-unidad';
import { UnidadFormularioPage } from './unidad-formulario.page';

const URL_SUCURSALES_SABORES = `${API_URL}/org/empresas/e-sabores/sucursales`;
const URL_UNIDADES = `${API_URL}/org/unidades`;
const SUCURSALES = { items: [{ id: 's-cayma', codigo: 'CAYMA', nombre: 'Cayma' }], total: 1 };
const unidad = (id: string, codigo: string, cambios: object = {}) => ({
  id,
  empresa_id: 'e-sabores',
  sucursal_id: 's-cayma',
  tipo: 'SALON',
  codigo,
  nombre: `Unidad ${codigo}`,
  padre_id: null,
  atributos: {},
  activo: true,
  version: 1,
  ...cambios,
});
const SALON = unidad('u-salon', 'SALON-1');
const CAJA = unidad('u-caja', 'CAJA-01', { tipo: 'CAJA', padre_id: 'u-salon', atributos: { impresora: 'EPSON-1', color: 'rojo' }, version: 2 });

@Component({ selector: 'vit-destino-unidad-formulario', template: '' })
class Destino {}

describe('UnidadFormularioPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let avisos: { toast: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const grupo = () => (harness.routeDebugElement?.componentInstance as { grupo: GrupoUnidad }).grupo;
  const padres = () => (harness.routeDebugElement?.componentInstance as { padres: () => { id: string }[] }).padres().map((padre) => padre.id);
  const esperarUnidades = (): TestRequest => http.expectOne((solicitud) => solicitud.url === URL_UNIDADES && solicitud.method === 'GET');

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
          {
            path: 'admin',
            children: [
              { path: 'unidades/nueva', component: UnidadFormularioPage },
              { path: 'unidades/:unidadId/editar', component: UnidadFormularioPage },
            ],
          },
          { path: '**', component: Destino },
        ]),
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(ruta);
    await estable();
  }

  /** Alta en Sabores con «Cayma» elegida: responde las sucursales y los padres posibles. */
  async function abrirAlta(candidatas: object[] = [SALON]): Promise<TestRequest> {
    await abrir('/admin/unidades/nueva?empresa=e-sabores&sucursal=s-cayma');
    http.expectOne((solicitud) => solicitud.url === URL_SUCURSALES_SABORES).flush(SUCURSALES);
    await estable();
    const peticion = esperarUnidades();
    peticion.flush({ items: candidatas, total: candidatas.length });
    await estable();
    return peticion;
  }

  async function enviar(): Promise<void> {
    elemento().querySelector<HTMLFormElement>('form')?.dispatchEvent(new Event('submit'));
    await estable();
  }

  beforeEach(() => {
    avisos = { toast: vi.fn() };
  });

  afterEach(() => http.verify());

  it('TR-CA-010: registra la CAJA «CAJA-01» en «Cayma» bajo «SALON-1» y vuelve a la lista de la sucursal', async () => {
    const candidatas = await abrirAlta();
    expect(candidatas.request.params.toString()).toBe('empresa_id=e-sabores&pagina=1&tamano=100&sucursal_id=s-cayma&activo=true');
    expect(padres()).toEqual(['u-salon']);

    grupo().patchValue({ tipo: 'CAJA', codigo: 'CAJA-01', nombre: 'Caja 1', padreId: 'u-salon', impresora: 'EPSON-1', capacidad: 2 });
    await enviar();

    const peticion = http.expectOne((solicitud) => solicitud.url === URL_UNIDADES && solicitud.method === 'POST');
    expect(peticion.request.body).toEqual({
      empresa_id: 'e-sabores',
      sucursal_id: 's-cayma',
      tipo: 'CAJA',
      codigo: 'CAJA-01',
      nombre: 'Caja 1',
      padre_id: 'u-salon',
      atributos: { impresora: 'EPSON-1', capacidad: 2 },
    });
    peticion.flush({ unidad_id: 'u-caja' });
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_UNIDADES.registrada);
    expect(url()).toBe('/admin/unidades?empresa=e-sabores&sucursal=s-cayma');
  });

  it('TR-CA-011: un CONSULTORIO sin sucursal muestra el mensaje y no envía', async () => {
    await abrirAlta();
    grupo().controls.sucursalId.setValue(null);
    await estable();
    esperarUnidades().flush({ items: [], total: 0 });
    grupo().patchValue({ tipo: 'CONSULTORIO', codigo: 'C-01', nombre: 'Consultorio 1' });
    await estable();

    expect(elemento().querySelector('[data-error=sucursal]')?.textContent).toContain('Solo los almacenes pueden registrarse sin sucursal');
    await enviar();
    http.expectNone((solicitud) => solicitud.method === 'POST');
  });

  it('TR-CA-012: sin sucursal, los padres posibles son solo los de nivel empresa', async () => {
    await abrirAlta();
    grupo().controls.sucursalId.setValue(null);
    await estable();

    const peticion = esperarUnidades();
    expect(peticion.request.params.has('sucursal_id')).toBe(false);
    peticion.flush({ items: [SALON, unidad('u-alm', 'ALM', { tipo: 'ALMACEN', sucursal_id: null })], total: 2 });
    await estable();

    expect(padres()).toEqual(['u-alm']);
    expect(grupo().controls.padreId.value).toBeNull();
  });

  it('el alta sin ?empresa= vuelve a la lista', async () => {
    await abrir('/admin/unidades/nueva');
    expect(url()).toBe('/admin/unidades');
  });

  it('la edición muestra el padre elegido, tipo y sucursal en solo lectura, y el padre no incluye la propia unidad', async () => {
    await abrir('/admin/unidades/u-caja/editar');
    http.expectOne(`${URL_UNIDADES}/u-caja`).flush(CAJA);
    await estable();
    http.expectOne((solicitud) => solicitud.url === URL_SUCURSALES_SABORES).flush(SUCURSALES);
    await estable();
    esperarUnidades().flush({ items: [SALON, CAJA], total: 2 });
    await estable();

    expect(grupo().controls.padreId.value).toBe('u-salon');
    expect(grupo().controls.tipo.disabled).toBe(true);
    expect(grupo().controls.sucursalId.disabled).toBe(true);
    expect(padres()).toEqual(['u-salon']);

    grupo().patchValue({ nombre: 'Caja principal', piso: '1' });
    await enviar();

    const peticion = http.expectOne(`${URL_UNIDADES}/u-caja`);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toEqual({
      version: 2,
      codigo: 'CAJA-01',
      nombre: 'Caja principal',
      padre_id: 'u-salon',
      atributos: { color: 'rojo', impresora: 'EPSON-1', piso: '1' },
    });
    peticion.flush(null, { status: 204, statusText: 'No Content' });
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_UNIDADES.actualizada);
    expect(url()).toBe('/admin/unidades?empresa=e-sabores&sucursal=s-cayma');
  });

  it('TR-RNF-008: VERSION_OBSOLETA muestra el aviso', async () => {
    await abrir('/admin/unidades/u-caja/editar');
    http.expectOne(`${URL_UNIDADES}/u-caja`).flush(CAJA);
    await estable();
    http.expectOne((solicitud) => solicitud.url === URL_SUCURSALES_SABORES).flush(SUCURSALES);
    await estable();
    esperarUnidades().flush({ items: [SALON], total: 1 });
    await estable();

    await enviar();
    http
      .expectOne(`${URL_UNIDADES}/u-caja`)
      .flush({ codigo: 'VERSION_OBSOLETA', mensaje: 'El registro cambió desde que lo abrió; recargue y vuelva a intentar' }, { status: 409, statusText: 'Conflict' });
    await estable();

    expect(elemento().querySelector('[data-error=version]')?.textContent).toContain(MENSAJES_ORGANIZACION.versionObsoleta);
  });

  it('un id inexistente muestra «La unidad no existe»', async () => {
    await abrir('/admin/unidades/u-otra/editar');
    http.expectOne(`${URL_UNIDADES}/u-otra`).flush({ codigo: 'NO_ENCONTRADO', mensaje: 'La unidad no existe' }, { status: 404, statusText: 'Not Found' });
    await estable();

    expect(elemento().textContent).toContain(MENSAJES_UNIDADES.noExiste);
  });
});
