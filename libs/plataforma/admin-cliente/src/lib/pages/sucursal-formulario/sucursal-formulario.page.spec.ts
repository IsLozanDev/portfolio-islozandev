import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_ORGANIZACION, MENSAJES_SUCURSALES } from '../../models/mensajes-organizacion';
import { RecargaContextoService } from '../../services/recarga-contexto.service';
import { SucursalFormularioPage } from './sucursal-formulario.page';

const URL_SUCURSALES_SABORES = `${API_URL}/org/empresas/e-sabores/sucursales`;
const URL_SUCURSALES = `${API_URL}/org/sucursales`;
const CENTRO = {
  id: 's-centro',
  empresa_id: 'e-sabores',
  codigo: 'CENTRO',
  nombre: 'Centro',
  codigo_establecimiento_sunat: '0000',
  direccion: null,
  ubigeo: '040101',
  telefono: null,
  zona_horaria: 'America/Lima',
  es_principal: true,
  activo: true,
  version: 2,
};

@Component({ selector: 'vit-destino-sucursal-formulario', template: '' })
class Destino {}

describe('SucursalFormularioPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let avisos: { toast: ReturnType<typeof vi.fn> };
  let recarga: { recargar: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const campo = (nombre: string) => elemento().querySelector<HTMLInputElement>(`[data-campo=${nombre}]`);
  const ayuda = () => elemento().querySelector('[data-ayuda=establecimiento]')?.textContent?.trim() ?? null;

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
              { path: 'sucursales/nueva', component: SucursalFormularioPage },
              { path: 'sucursales/:sucursalId/editar', component: SucursalFormularioPage },
            ],
          },
          { path: '**', component: Destino },
        ]),
        { provide: AvisosService, useValue: avisos },
        { provide: RecargaContextoService, useValue: recarga },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(ruta);
    await estable();
  }

  async function abrirEdicion(sucursal: object): Promise<void> {
    await abrir('/admin/sucursales/s-centro/editar');
    http.expectOne(`${URL_SUCURSALES}/s-centro`).flush(sucursal);
    await estable();
  }

  async function escribir(nombre: string, valor: string): Promise<void> {
    const entrada = campo(nombre);
    if (!entrada) throw new Error(`No hay campo ${nombre}`);
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    await estable();
  }

  async function enviar(): Promise<void> {
    elemento().querySelector<HTMLFormElement>('form')?.dispatchEvent(new Event('submit'));
    await estable();
  }

  async function llenarCayma(): Promise<void> {
    await escribir('codigo', 'CAYMA');
    await escribir('nombre', 'Cayma');
    await escribir('establecimiento', '0002');
    await escribir('ubigeo', '040103');
  }

  beforeEach(() => {
    avisos = { toast: vi.fn() };
    recarga = { recargar: vi.fn(async () => undefined) };
  });

  afterEach(() => http.verify());

  it('TR-CA-007: registra «Cayma», recarga mi-contexto y vuelve a la lista de la empresa', async () => {
    await abrir('/admin/sucursales/nueva?empresa=e-sabores');
    await llenarCayma();
    await enviar();

    const peticion = http.expectOne(URL_SUCURSALES_SABORES);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      codigo: 'CAYMA',
      nombre: 'Cayma',
      codigo_establecimiento_sunat: '0002',
      direccion: null,
      ubigeo: '040103',
      telefono: null,
      zona_horaria: 'America/Lima',
    });
    peticion.flush({ sucursal_id: 's-cayma' });
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_SUCURSALES.registrada);
    expect(recarga.recargar).toHaveBeenCalled();
    expect(url()).toBe('/admin/sucursales?empresa=e-sabores');
  });

  it('el alta sin ?empresa= vuelve a la lista, que elige una', async () => {
    await abrir('/admin/sucursales/nueva');
    expect(url()).toBe('/admin/sucursales');
  });

  it('TR-CA-008: el tope del plan muestra el mensaje de la API y no navega ni recarga el contexto', async () => {
    await abrir('/admin/sucursales/nueva?empresa=e-sabores');
    await llenarCayma();
    await enviar();

    http.expectOne(URL_SUCURSALES_SABORES).flush({ codigo: 'CONFLICTO', mensaje: 'Su plan permite 2 sucursales; amplíe su plan' }, { status: 409, statusText: 'Conflict' });
    await estable();

    expect(elemento().querySelector('[data-error=api]')?.textContent).toContain('Su plan permite 2 sucursales; amplíe su plan');
    expect(url()).toBe('/admin/sucursales/nueva?empresa=e-sabores');
    expect(recarga.recargar).not.toHaveBeenCalled();
  });

  it('0000 en una sucursal nueva se rechaza en el cliente', async () => {
    await abrir('/admin/sucursales/nueva?empresa=e-sabores');
    await llenarCayma();
    await escribir('establecimiento', '0000');
    await enviar();

    expect(elemento().textContent).toContain('El establecimiento 0000 corresponde a la sucursal principal');
    http.expectNone(URL_SUCURSALES_SABORES);
  });

  it('en la principal el establecimiento queda fijo en 0000 con su ayuda, y se envía con la versión', async () => {
    await abrirEdicion(CENTRO);

    expect(campo('establecimiento')?.value).toBe('0000');
    expect(campo('establecimiento')?.disabled).toBe(true);
    expect(ayuda()).toBe(MENSAJES_SUCURSALES.ayudaPrincipal);

    await escribir('telefono', '054-123456');
    await enviar();

    const peticion = http.expectOne(`${URL_SUCURSALES}/s-centro`);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toMatchObject({ version: 2, codigo_establecimiento_sunat: '0000', telefono: '054-123456' });
    peticion.flush(null, { status: 204, statusText: 'No Content' });
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_SUCURSALES.actualizada);
    expect(recarga.recargar).toHaveBeenCalled();
    expect(url()).toBe('/admin/sucursales?empresa=e-sabores');
  });

  it('brecha 5: la que dejó de ser principal y no tiene establecimiento muestra la ayuda para asignarlo', async () => {
    await abrirEdicion({ ...CENTRO, es_principal: false, codigo_establecimiento_sunat: null });

    expect(campo('establecimiento')?.disabled).toBe(false);
    expect(ayuda()).toBe(MENSAJES_SUCURSALES.ayudaAsignarEstablecimiento);
  });

  it('TR-RNF-008: VERSION_OBSOLETA muestra el aviso y «Recargar» trae la versión nueva', async () => {
    await abrirEdicion({ ...CENTRO, es_principal: false, codigo_establecimiento_sunat: '0002' });
    await enviar();

    http
      .expectOne(`${URL_SUCURSALES}/s-centro`)
      .flush({ codigo: 'VERSION_OBSOLETA', mensaje: 'El registro cambió desde que lo abrió; recargue y vuelva a intentar' }, { status: 409, statusText: 'Conflict' });
    await estable();
    expect(elemento().querySelector('[data-error=version]')?.textContent).toContain(MENSAJES_ORGANIZACION.versionObsoleta);

    elemento().querySelector<HTMLButtonElement>('[data-accion=recargar]')?.click();
    await estable();
    http.expectOne(`${URL_SUCURSALES}/s-centro`).flush({ ...CENTRO, es_principal: false, nombre: 'Centro histórico', version: 3 });
    await estable();

    expect(campo('nombre')?.value).toBe('Centro histórico');
  });

  it('un id inexistente muestra «La sucursal no existe»', async () => {
    await abrir('/admin/sucursales/s-otra/editar');
    http.expectOne(`${URL_SUCURSALES}/s-otra`).flush({ codigo: 'NO_ENCONTRADO', mensaje: 'La sucursal no existe' }, { status: 404, statusText: 'Not Found' });
    await estable();

    expect(elemento().textContent).toContain(MENSAJES_SUCURSALES.noExiste);
    expect(elemento().querySelector('form')).toBeNull();
  });
});
