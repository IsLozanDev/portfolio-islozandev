import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { CatalogoCliente } from './catalogo.cliente';

describe('CatalogoCliente', () => {
  let cliente: CatalogoCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(CatalogoCliente);
  });

  afterEach(() => http.verify());

  it('productosDisponibles pide GET /seg/productos-disponibles', async () => {
    const respuesta = cliente.productosDisponibles();

    http.expectOne(`${API_URL}/seg/productos-disponibles`).flush({ items: [{ codigo: 'PLAT', nombre: 'Plataforma' }] });

    await expect(respuesta).resolves.toEqual([{ codigo: 'PLAT', nombre: 'Plataforma' }]);
  });

  it('arbol pide GET /seg/catalogo/:producto y mapea a camelCase', async () => {
    const respuesta = cliente.arbol('REST');

    const permiso = { codigo: 'rest.mesa.ver', descripcion: 'Ver mesas', sensible: false, alcance_minimo: 'UNIDAD' };
    http.expectOne(`${API_URL}/seg/catalogo/REST`).flush({
      producto_codigo: 'REST',
      modulos: [{ codigo: 'salon', nombre: 'Salón', opciones: [{ codigo: 'rest.salon.mesas', nombre: 'Mesas', permisos: [permiso] }] }],
      otros: [{ ...permiso, codigo: 'rest.reporte.ver', sensible: true }],
    });

    const enCamelCase = { codigo: 'rest.mesa.ver', descripcion: 'Ver mesas', sensible: false, alcanceMinimo: 'UNIDAD' };
    await expect(respuesta).resolves.toEqual({
      productoCodigo: 'REST',
      modulos: [{ codigo: 'salon', nombre: 'Salón', opciones: [{ codigo: 'rest.salon.mesas', nombre: 'Mesas', permisos: [enCamelCase] }] }],
      otros: [{ ...enCamelCase, codigo: 'rest.reporte.ver', sensible: true }],
    });
  });

  it('PRODUCTO_NO_CONTRATADO sale como ErrorAdmin', async () => {
    const respuesta = cliente.arbol('GYM');

    http
      .expectOne(`${API_URL}/seg/catalogo/GYM`)
      .flush({ codigo: 'PRODUCTO_NO_CONTRATADO', mensaje: 'El tenant no tiene suscripción vigente al producto GYM' }, { status: 400, statusText: 'Bad Request' });

    await expect(respuesta).rejects.toMatchObject({ codigo: 'PRODUCTO_NO_CONTRATADO' });
  });
});
