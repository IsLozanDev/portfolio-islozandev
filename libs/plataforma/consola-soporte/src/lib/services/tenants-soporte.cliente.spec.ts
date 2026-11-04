import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { TenantsSoporteCliente } from './tenants-soporte.cliente';

describe('TenantsSoporteCliente', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
  });

  afterEach(() => http.verify());

  it('busca una página corta y se queda con id, código y nombre', async () => {
    const promesa = TestBed.inject(TenantsSoporteCliente).buscar('pollería');
    const peticion = http.expectOne((candidata) => candidata.url === `${API_URL}/org/tenants`);
    expect(peticion.request.params.get('q')).toBe('pollería');
    expect(peticion.request.params.get('pagina')).toBe('1');
    expect(peticion.request.params.get('tamano')).toBe('20');
    peticion.flush({ items: [{ id: 't-1', codigo: 'polleria-dona-rosa', nombre: 'Pollería Doña Rosa', estado: 'ACTIVO' }], total: 1 });

    expect(await promesa).toEqual([{ id: 't-1', codigo: 'polleria-dona-rosa', nombre: 'Pollería Doña Rosa' }]);
  });
});
