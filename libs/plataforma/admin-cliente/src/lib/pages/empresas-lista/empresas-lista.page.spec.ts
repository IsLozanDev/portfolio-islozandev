import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { TablaComponent } from '@vitrina/shared/ui';
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
  telefono: null,
  correo: null,
  sitio_web: null,
  logo_archivo_id: null,
  activo: true,
  version: 1,
};

const PERMISO_DESCARGAR = 'plat.archivo.descargar';
const URL_LOGO = 'https://storage.ejemplo/logo-sabores.png';
const DELIVERY = { ...SABORES, id: 'e-delivery', ruc: '20612223334', razon_social: 'Delivery del Sur SAC' };

@Component({ selector: 'vit-destino-empresas-lista', template: '' })
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

  async function abrir(ruta = '/admin/empresas', enCelular = false): Promise<TestRequest> {
    const ancho: BreakpointState = { matches: enCelular, breakpoints: {} };
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
        { provide: BreakpointObserver, useValue: { observe: () => of(ancho) } },
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

  it('el tamaño de la URL viaja a la API y el combo lo cambia en la URL', async () => {
    const peticion = await abrir('/admin/empresas?tamano=50');
    expect(peticion.request.params.get('tamano')).toBe('50');
    await responder(peticion, { items: [SABORES], total: 60 });

    harness.fixture.debugElement.query(By.directive(TablaComponent)).componentInstance.pagina.emit({ indice: 0, tamano: 100 });
    await estable();

    expect(url()).toBe('/admin/empresas?tamano=100');
    expect(esperarLista().request.params.get('tamano')).toBe('100');
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

  describe('miniatura del logo (spec 17d)', () => {
    const miniaturas = () => [...elemento().querySelectorAll<HTMLElement>('vit-logo-empresa')];
    const firmaDe = (archivoId: string) => http.expectOne((solicitud) => solicitud.url === `${API_URL}/archivos/${archivoId}/descarga`);
    const conLogo = { ...SABORES, logo_archivo_id: 'logo-sabores' };

    async function listarConLogo(enCelular = false): Promise<void> {
      await responder(await abrir('/admin/empresas', enCelular), { items: [conLogo, DELIVERY], total: 2 });
      firmaDe('logo-sabores').flush({ url: URL_LOGO, expira_en: new Date(Date.now() + 900_000).toISOString() });
      await estable();
    }

    it('muestra la miniatura de 32 px de la empresa con logo y la inicial en la que no tiene', async () => {
      sesion.conPermisos(PERMISOS_ADMIN.organizacionConsultar, PERMISO_DESCARGAR);
      await listarConLogo();

      const [sabores, delivery] = miniaturas();
      expect(sabores?.querySelector('img')?.src).toBe(URL_LOGO);
      expect(sabores?.querySelector('[data-prueba=logo-empresa]')?.classList).toContain('size-8');
      expect(delivery?.querySelector('img')).toBeNull();
      expect(delivery?.textContent?.trim()).toBe('D');
    });

    it('en celular la miniatura va al inicio de la fila, antes de la razón social', async () => {
      sesion.conPermisos(PERMISOS_ADMIN.organizacionConsultar, PERMISO_DESCARGAR);
      await listarConLogo(true);

      const fila = elemento().querySelector('li');
      expect(fila?.firstElementChild?.querySelector('vit-logo-empresa img')?.getAttribute('src')).toBe(URL_LOGO);
      expect(fila?.querySelector('.font-medium')?.textContent?.trim()).toBe('Sabores del Sur SAC');
      expect(fila?.textContent).toContain('20512345671');
    });

    it('sin plat.archivo.descargar muestra las iniciales sin pedir ninguna URL', async () => {
      await responder(await abrir(), { items: [conLogo, DELIVERY], total: 2 });

      http.expectNone((solicitud) => solicitud.url.includes('/archivos/'));
      expect(miniaturas().map((miniatura) => miniatura.textContent?.trim())).toEqual(['S', 'D']);
    });
  });
});
