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
import { MENSAJES_SUCURSALES } from '../../models/mensajes-organizacion';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { RecargaContextoService } from '../../services/recarga-contexto.service';
import { SucursalesListaPage } from './sucursales-lista.page';

const URL_EMPRESAS = `${API_URL}/org/empresas`;
const URL_SUCURSALES_SABORES = `${API_URL}/org/empresas/e-sabores/sucursales`;
const fila = (id: string, nombre: string, cambios: object = {}) => ({
  id,
  empresa_id: 'e-sabores',
  codigo: nombre.toUpperCase(),
  nombre,
  codigo_establecimiento_sunat: '0002',
  direccion: null,
  ubigeo: '040103',
  telefono: null,
  zona_horaria: 'America/Lima',
  es_principal: false,
  activo: true,
  version: 1,
  ...cambios,
});
const CENTRO = fila('s-centro', 'Centro', { es_principal: true, codigo_establecimiento_sunat: '0000' });
const CAYMA = fila('s-cayma', 'Cayma');

@Component({ selector: 'vit-destino-sucursales-lista', template: '' })
class Destino {}

describe('SucursalesListaPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let sesion: DobleSesion;
  let avisos: { toast: ReturnType<typeof vi.fn>; advertencia: ReturnType<typeof vi.fn>; confirmarDestructiva: ReturnType<typeof vi.fn> };
  let recarga: { recargar: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const esperar = (ruta: string): TestRequest => http.expectOne((solicitud) => solicitud.url === ruta);
  const filaDe = (nombre: string) => [...elemento().querySelectorAll<HTMLElement>('tr[mat-row]')].find((filaTabla) => filaTabla.textContent?.includes(nombre));
  const accion = (nombre: string, tipo: string) => filaDe(nombre)?.querySelector<HTMLElement>(`[data-accion=${tipo}]`) ?? null;

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(ruta: string, empresas: object[] = [{ id: 'e-sabores', razon_social: 'Sabores del Sur SAC' }]): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin', children: [{ path: 'sucursales', component: SucursalesListaPage }] },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: AvisosService, useValue: avisos },
        { provide: RecargaContextoService, useValue: recarga },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(ruta);
    await estable();
    esperar(URL_EMPRESAS).flush({ items: empresas, total: empresas.length });
    await estable();
  }

  /** Abre con Sabores elegida y responde su lista de sucursales. */
  async function abrirConSucursales(filas: object[] = [CENTRO, CAYMA]): Promise<void> {
    await abrir('/admin/sucursales?empresa=e-sabores');
    await responderLista(filas);
  }

  async function responderLista(filas: object[]): Promise<TestRequest> {
    const peticion = esperar(URL_SUCURSALES_SABORES);
    peticion.flush({ items: filas, total: filas.length });
    await estable();
    return peticion;
  }

  beforeEach(() => {
    sesion = new DobleSesion().conPermisos(PERMISOS_ADMIN.organizacionConsultar, PERMISOS_ADMIN.sucursalGestionar);
    avisos = { toast: vi.fn(), advertencia: vi.fn(async () => undefined), confirmarDestructiva: vi.fn(async () => ({ confirmado: true, motivo: null })) };
    recarga = { recargar: vi.fn(async () => undefined) };
  });

  afterEach(() => http.verify());

  it('sin empresa en la URL elige la primera, la escribe en la URL y pide sus sucursales activas', async () => {
    await abrir('/admin/sucursales');

    expect(url()).toBe('/admin/sucursales?empresa=e-sabores');
    const peticion = await responderLista([CENTRO]);
    expect(peticion.request.params.toString()).toBe('pagina=1&tamano=20&activo=true');
  });

  it('muestra las dos con «Centro» como principal y el establecimiento de cada una', async () => {
    await abrirConSucursales([CENTRO, CAYMA, fila('s-yana', 'Yanahuara', { codigo_establecimiento_sunat: null })]);

    expect(filaDe('Centro')?.textContent).toContain('Principal');
    expect(filaDe('Centro')?.textContent).toContain('0000');
    expect(filaDe('Cayma')?.textContent).toContain('0002');
    expect(filaDe('Cayma')?.textContent).not.toContain('Principal');
    expect(filaDe('Yanahuara')?.textContent).toContain(MENSAJES_SUCURSALES.sinEstablecimiento);
  });

  it('el filtro «Todas» quita activo de la petición y queda en la URL', async () => {
    await abrir('/admin/sucursales?empresa=e-sabores&activo=todas');
    const peticion = await responderLista([CENTRO]);

    expect(peticion.request.params.has('activo')).toBe(false);
  });

  it('TR-RN-003: inactivar la principal avisa con el mensaje del dominio y no llama a la API', async () => {
    await abrirConSucursales();

    accion('Centro', 'inactivar')?.click();
    await estable();

    expect(avisos.advertencia).toHaveBeenCalledWith(MENSAJES_SUCURSALES.tituloPrincipalNoInactivable, 'Marque otra sucursal como principal antes de inactivar esta');
    expect(avisos.confirmarDestructiva).not.toHaveBeenCalled();
    http.expectNone(`${API_URL}/org/sucursales/s-centro/inactivar`);
  });

  it('inactivar otra pide confirmación sin motivo, envía, recarga mi-contexto sin ella y la lista', async () => {
    await abrirConSucursales();

    accion('Cayma', 'inactivar')?.click();
    await estable();

    expect(avisos.confirmarDestructiva).toHaveBeenCalledWith(expect.not.objectContaining({ pedirMotivo: true }));
    expect(avisos.confirmarDestructiva.mock.calls[0][0].texto).toBe(MENSAJES_SUCURSALES.textoInactivar('Cayma'));
    esperar(`${API_URL}/org/sucursales/s-cayma/inactivar`).flush(null, { status: 204, statusText: 'No Content' });
    await estable();
    await responderLista([CENTRO]);

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_SUCURSALES.inactivada);
    expect(recarga.recargar).toHaveBeenCalledWith('s-cayma');
    expect(filaDe('Cayma')).toBeUndefined();
  });

  it('cancelar la confirmación no envía nada', async () => {
    avisos.confirmarDestructiva.mockResolvedValueOnce({ confirmado: false });
    await abrirConSucursales();

    accion('Cayma', 'inactivar')?.click();
    await estable();

    http.expectNone(`${API_URL}/org/sucursales/s-cayma/inactivar`);
    expect(recarga.recargar).not.toHaveBeenCalled();
  });

  it('TR-CA-009: marcar «Cayma» como principal avisa que «Centro» queda sin establecimiento y llama a /principal', async () => {
    await abrirConSucursales();

    expect(accion('Centro', 'principal')).toBeNull();
    accion('Cayma', 'principal')?.click();
    await estable();

    expect(avisos.confirmarDestructiva.mock.calls[0][0].texto).toBe(MENSAJES_SUCURSALES.textoMarcarPrincipal('Cayma', 'Centro'));
    esperar(`${API_URL}/org/sucursales/s-cayma/principal`).flush(null, { status: 204, statusText: 'No Content' });
    await estable();
    await responderLista([fila('s-cayma', 'Cayma', { es_principal: true, codigo_establecimiento_sunat: '0000' }), fila('s-centro', 'Centro', { codigo_establecimiento_sunat: null })]);

    expect(recarga.recargar).toHaveBeenCalledWith(undefined);
    expect(filaDe('Cayma')?.textContent).toContain('Principal');
    expect(filaDe('Centro')?.textContent).toContain(MENSAJES_SUCURSALES.sinEstablecimiento);
  });

  it('reactivar envía PUT con los datos de la fila, su versión y activo: true', async () => {
    await abrir('/admin/sucursales?empresa=e-sabores&activo=false');
    await responderLista([fila('s-yana', 'Yanahuara', { activo: false, version: 2, codigo_establecimiento_sunat: '0003' })]);

    expect(accion('Yanahuara', 'inactivar')).toBeNull();
    accion('Yanahuara', 'reactivar')?.click();
    await estable();

    const peticion = esperar(`${API_URL}/org/sucursales/s-yana`);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toMatchObject({ version: 2, activo: true, codigo: 'YANAHUARA', codigo_establecimiento_sunat: '0003' });
    peticion.flush(null, { status: 204, statusText: 'No Content' });
    await estable();
    await responderLista([]);

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_SUCURSALES.reactivada);
    expect(recarga.recargar).toHaveBeenCalled();
  });

  it('enlaza a la edición, a las unidades de la sucursal y al alta con la empresa', async () => {
    await abrirConSucursales();

    expect(accion('Cayma', 'editar')?.getAttribute('href')).toBe('/admin/sucursales/s-cayma/editar');
    expect(accion('Cayma', 'unidades')?.getAttribute('href')).toBe('/admin/unidades?empresa=e-sabores&sucursal=s-cayma');
    expect(elemento().querySelector('[data-accion=nueva]')?.getAttribute('href')).toBe('/admin/sucursales/nueva?empresa=e-sabores');
  });

  it('sin plat.sucursal.gestionar no hay alta, edición, principal, inactivación ni reactivación', async () => {
    sesion.conPermisos(PERMISOS_ADMIN.organizacionConsultar);
    await abrirConSucursales();

    for (const tipo of ['editar', 'principal', 'inactivar', 'reactivar']) expect(accion('Cayma', tipo)).toBeNull();
    expect(elemento().querySelector('[data-accion=nueva]')).toBeNull();
    expect(accion('Cayma', 'unidades')).not.toBeNull();
  });

  it('sin empresas invita a registrar una', async () => {
    sesion.conPermisos(PERMISOS_ADMIN.organizacionConsultar, PERMISOS_ADMIN.empresaCrear);
    await abrir('/admin/sucursales', []);

    expect(elemento().textContent).toContain(MENSAJES_SUCURSALES.sinEmpresas);
    expect([...elemento().querySelectorAll('a')].find((enlace) => enlace.textContent?.includes(MENSAJES_SUCURSALES.irANuevaEmpresa))?.getAttribute('href')).toBe(
      '/admin/empresas/nueva',
    );
  });
});
