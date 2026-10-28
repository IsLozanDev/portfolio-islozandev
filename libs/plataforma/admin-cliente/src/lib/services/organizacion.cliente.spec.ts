import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { OrganizacionCliente } from './organizacion.cliente';

describe('OrganizacionCliente', () => {
  let cliente: OrganizacionCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(OrganizacionCliente);
  });

  afterEach(() => http.verify());

  it('empresas pide las activas con tamaño 100 y nombra por razón social', async () => {
    const respuesta = cliente.empresas();

    const peticion = http.expectOne((solicitud) => solicitud.url === `${API_URL}/org/empresas`);
    expect(peticion.request.params.toString()).toBe('tamano=100&activo=true');
    peticion.flush({ items: [{ id: 'e-1', razon_social: 'Sabores del Sur SAC', ruc: '20512345671' }], total: 1 });

    await expect(respuesta).resolves.toEqual([{ id: 'e-1', nombre: 'Sabores del Sur SAC' }]);
  });

  it('sucursales pide las de la empresa', async () => {
    const respuesta = cliente.sucursales('e-1');

    http
      .expectOne((solicitud) => solicitud.url === `${API_URL}/org/empresas/e-1/sucursales`)
      .flush({ items: [{ id: 's-mir', empresa_id: 'e-1', codigo: 'MIRAFLORES', nombre: 'Miraflores' }], total: 1 });

    await expect(respuesta).resolves.toEqual([{ id: 's-mir', nombre: 'Miraflores' }]);
  });

  it('unidades pide las de la sucursal y antepone el código (TR-CA-036)', async () => {
    const respuesta = cliente.unidades('s-mir');

    const peticion = http.expectOne((solicitud) => solicitud.url === `${API_URL}/org/unidades`);
    expect(peticion.request.params.toString()).toBe('tamano=100&activo=true&sucursal_id=s-mir');
    peticion.flush({ items: [{ id: 'u-2', sucursal_id: 's-mir', codigo: 'CAJA-02', nombre: 'Caja 2' }], total: 1 });

    await expect(respuesta).resolves.toEqual([{ id: 'u-2', nombre: 'CAJA-02 · Caja 2' }]);
  });
});
