import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { EmpresasListaPage } from './empresas-lista.page';

const SABORES = {
  id: 'e-sabores',
  ruc: '20512345671',
  razon_social: 'Sabores del Sur SAC',
  nombre_comercial: null,
  direccion_fiscal: null,
  ubigeo: '040101',
  activo: true,
  version: 1,
};

@Component({ template: '' })
class Destino {}

describe('EmpresasListaPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let sesion: DobleSesion;

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const esperarLista = (): TestRequest => http.expectOne((solicitud) => solicitud.url === `${API_URL}/org/empresas`);

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(ruta = '/admin/empresas'): Promise<TestRequest> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin/empresas', component: EmpresasListaPage },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(ruta);
    await estable();
    return esperarLista();
  }

  async function responder(peticion: TestRequest, cuerpo: object): Promise<void> {
    peticion.flush(cuerpo);
    await estable();
  }

  beforeEach(() => {
    sesion = new DobleSesion().conPermisos(PERMISOS_ADMIN.organizacionConsultar, PERMISOS_ADMIN.empresaCrear);
  });

  afterEach(() => http.verify());

  it('pide la primera página de 20 y muestra RUC, razón social y «—» en lo vacío', async () => {
    const peticion = await abrir();
    expect(peticion.request.params.toString()).toBe('pagina=1&tamano=20');

    await responder(peticion, { items: [SABORES], total: 1 });

    const fila = elemento().querySelector('tr[mat-row]')?.textContent ?? '';
    expect(fila).toContain('20512345671');
    expect(fila).toContain('Sabores del Sur SAC');
    expect(fila).toContain('—');
  });

  it('la página de la URL viaja a la API', async () => {
    const peticion = await abrir('/admin/empresas?pagina=2');
    expect(peticion.request.params.get('pagina')).toBe('2');
    await responder(peticion, { items: [], total: 21 });
  });

  it('enlaza a las sucursales de la empresa y a su edición', async () => {
    await responder(await abrir(), { items: [SABORES], total: 1 });

    expect(elemento().querySelector('[data-accion=sucursales]')?.getAttribute('href')).toBe('/admin/sucursales?empresa=e-sabores');
    expect(elemento().querySelector('[data-accion=editar]')?.getAttribute('href')).toBe('/admin/empresas/e-sabores/editar');
    expect(elemento().querySelector('[data-accion=nueva]')?.getAttribute('href')).toBe('/admin/empresas/nueva');
  });

  it('sin plat.empresa.crear no hay «Nueva empresa» ni «Editar»; sí el enlace a sucursales', async () => {
    sesion.conPermisos(PERMISOS_ADMIN.organizacionConsultar);
    await responder(await abrir(), { items: [SABORES], total: 1 });

    expect(elemento().querySelector('[data-accion=nueva]')).toBeNull();
    expect(elemento().querySelector('[data-accion=editar]')).toBeNull();
    expect(elemento().querySelector('[data-accion=sucursales]')).not.toBeNull();
  });

  it('sin empresas muestra el texto vacío', async () => {
    await responder(await abrir(), { items: [], total: 0 });
    expect(elemento().textContent).toContain('No hay empresas registradas.');
    expect(url()).toBe('/admin/empresas');
  });
});
