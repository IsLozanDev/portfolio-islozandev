import type { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AHORA } from '../../../testing/emisor-de-prueba';
import { API_URL, prepararHttpDePrueba } from '../../../testing/http-de-prueba';
import type { EmpresaConEmisorRespuesta } from '../../models/emisor';
import { EmisoresListaPage } from './emisores-lista.page';

const URL_EMISORES = `${API_URL}/fe/emisores`;
const URL_PROVEEDORES = `${API_URL}/catalogos/PROVEEDOR_FE/items`;

const EN_PRODUCCION: EmpresaConEmisorRespuesta = {
  empresa_id: 'e-sabores',
  ruc: '20601234567',
  razon_social: 'Sabores del Sur SAC',
  emisor: { estado: 'PRODUCCION', proveedor: 'SUNAT', ambiente: 'PRODUCCION', certificado_vence_en: '2027-03-14T15:00:00.000Z', prueba_estado: 'ACEPTADA' },
};
/** 18 días después de AHORA (25/11/26). */
const POR_VENCER: EmpresaConEmisorRespuesta = {
  empresa_id: 'e-andino',
  ruc: '20605551234',
  razon_social: 'Inversiones Sur Andino SAC',
  emisor: { estado: 'VERIFICADO', proveedor: 'SUNAT', ambiente: 'BETA', certificado_vence_en: '2026-12-13T15:00:00.000Z', prueba_estado: 'ACEPTADA' },
};
const SIN_EMISOR: EmpresaConEmisorRespuesta = { empresa_id: 'e-delivery', ruc: '20612223334', razon_social: 'Delivery del Sur SAC', emisor: null };

@Component({ selector: 'vit-destino-emisores-lista', template: '' })
class Destino {}

describe('EmisoresListaPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const filas = () => [...elemento().querySelectorAll('tr[mat-row]')] as HTMLElement[];

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(): Promise<{ lista: TestRequest; proveedores: TestRequest }> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin/fe/emisores', component: EmisoresListaPage },
          { path: '**', component: Destino },
        ]),
      ],
    });
    http = prepararHttpDePrueba();
    harness = await RouterTestingHarness.create('/admin/fe/emisores');
    await estable();
    return { lista: http.expectOne({ method: 'GET', url: URL_EMISORES }), proveedores: http.expectOne(URL_PROVEEDORES) };
  }

  async function responder(peticion: TestRequest, cuerpo: object, opciones?: { status: number; statusText: string }): Promise<void> {
    peticion.flush(cuerpo, opciones);
    await estable();
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('muestra empresa, RUC, nombre del proveedor, ambiente, chip de estado y vencimiento', async () => {
    const { lista, proveedores } = await abrir();
    await responder(proveedores, [{ codigo: 'SUNAT', nombre: 'SUNAT directo', atributos: { url_produccion: 'https://e-factura.sunat.gob.pe' } }]);
    await responder(lista, [EN_PRODUCCION]);

    const fila = filas()[0].textContent ?? '';
    for (const texto of ['Sabores del Sur SAC', '20601234567', 'SUNAT directo', 'Producción', 'En producción', '14/03/27']) {
      expect(fila).toContain(texto);
    }
    expect(filas()[0].querySelector('[data-chip=vencimiento]')).toBeNull();
    expect(filas()[0].querySelector('[data-accion=ver]')?.getAttribute('href')).toBe('/admin/fe/emisores/e-sabores');
  });

  it('un certificado que vence en 30 días o menos lleva «Vence en N días»', async () => {
    const { lista, proveedores } = await abrir();
    await responder(proveedores, []);
    await responder(lista, [POR_VENCER]);

    expect(filas()[0].querySelector('[data-chip=vencimiento]')?.textContent?.trim()).toBe('Vence en 18 días');
    expect(filas()[0].textContent).toContain('13/12/26');
  });

  it('la empresa sin emisor dice «Sin configurar» y ofrece «Configurar»', async () => {
    const { lista, proveedores } = await abrir();
    await responder(proveedores, []);
    await responder(lista, [SIN_EMISOR]);

    expect(filas()[0].textContent).toContain('Sin configurar');
    const configurar = filas()[0].querySelector('[data-accion=configurar]');
    expect(configurar?.textContent?.trim()).toBe('Configurar');
    expect(configurar?.getAttribute('href')).toBe('/admin/fe/emisores/e-delivery');
    expect(filas()[0].querySelector('[data-accion=ver]')).toBeNull();
  });

  it('sin plat.catalogo.leer la lista sigue con el código del proveedor', async () => {
    const { lista, proveedores } = await abrir();
    await responder(proveedores, { codigo: 'SIN_PERMISO' }, { status: 403, statusText: 'Forbidden' });
    await responder(lista, [EN_PRODUCCION]);

    expect(filas()[0].textContent).toContain('SUNAT');
    expect(elemento().querySelector('[data-error=api]')).toBeNull();
  });

  it('sin empresas muestra el estado vacío; un error de la API, su mensaje', async () => {
    const { lista, proveedores } = await abrir();
    await responder(proveedores, []);
    await responder(lista, []);
    expect(elemento().textContent).toContain('No hay empresas activas.');

    TestBed.resetTestingModule();
    const segunda = await abrir();
    await responder(segunda.proveedores, []);
    await responder(segunda.lista, { codigo: 'OTRO' }, { status: 500, statusText: 'Server Error' });
    expect(elemento().querySelector('[data-error=api]')?.textContent).toContain('No se pudo completar la operación.');
  });
});
