import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { RolesCliente } from './roles.cliente';

const MOZO = {
  id: 'r-mozo',
  codigo: 'REST_MOZO',
  nombre: 'Mozo',
  producto_codigo: 'REST',
  producto_nombre: 'Restaurante',
  predefinido: true,
  activo: true,
};

describe('RolesCliente', () => {
  let cliente: RolesCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(RolesCliente);
  });

  afterEach(() => http.verify());

  it('listar pide GET /seg/roles y mapea a camelCase', async () => {
    const respuesta = cliente.listar();

    const peticion = http.expectOne(`${API_URL}/seg/roles`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ items: [{ ...MOZO, total_permisos: 3 }] });

    await expect(respuesta).resolves.toEqual([
      { id: 'r-mozo', codigo: 'REST_MOZO', nombre: 'Mozo', productoCodigo: 'REST', productoNombre: 'Restaurante', predefinido: true, activo: true, totalPermisos: 3 },
    ]);
  });

  it('detalle pide GET /seg/roles/:rolId con sus permisos', async () => {
    const respuesta = cliente.detalle('r-mozo');

    http.expectOne(`${API_URL}/seg/roles/r-mozo`).flush({ ...MOZO, permisos: ['rest.mesa.ver'] });

    await expect(respuesta).resolves.toEqual({
      id: 'r-mozo',
      codigo: 'REST_MOZO',
      nombre: 'Mozo',
      productoCodigo: 'REST',
      productoNombre: 'Restaurante',
      predefinido: true,
      activo: true,
      permisos: ['rest.mesa.ver'],
    });
  });

  it('crear envía POST /seg/roles en snake_case y devuelve el id', async () => {
    const respuesta = cliente.crear('REST', { codigo: 'MOZO_BARRA', nombre: 'Mozo de barra' }, ['rest.mesa.ver']);

    const peticion = http.expectOne(`${API_URL}/seg/roles`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ producto_codigo: 'REST', codigo: 'MOZO_BARRA', nombre: 'Mozo de barra', permisos: ['rest.mesa.ver'] });
    peticion.flush({ rol_id: 'r-nuevo' });

    await expect(respuesta).resolves.toBe('r-nuevo');
  });

  it('TR-CA-031: copiar envía POST /copia siempre con los permisos', async () => {
    const respuesta = cliente.copiar('r-mozo', { codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza' }, ['rest.pedido.tomar', 'rest.mesa.ver']);

    const peticion = http.expectOne(`${API_URL}/seg/roles/r-mozo/copia`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza', permisos: ['rest.pedido.tomar', 'rest.mesa.ver'] });
    peticion.flush({ rol_id: 'r-terraza' });

    await expect(respuesta).resolves.toBe('r-terraza');
  });

  it('cambiarPermisos envía PUT /permisos con el conjunto completo', async () => {
    const respuesta = cliente.cambiarPermisos('r-terraza', ['rest.pedido.tomar']);

    const peticion = http.expectOne(`${API_URL}/seg/roles/r-terraza/permisos`);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toEqual({ permisos: ['rest.pedido.tomar'] });
    peticion.flush(null, { status: 204, statusText: 'No Content' });

    await expect(respuesta).resolves.toBeUndefined();
  });

  it('TR-CA-033: inactivar envía { confirmado } y mapea el resultado', async () => {
    const respuesta = cliente.inactivar('r-terraza', false);

    const peticion = http.expectOne(`${API_URL}/seg/roles/r-terraza/inactivar`);
    expect(peticion.request.body).toEqual({ confirmado: false });
    peticion.flush({ requiere_confirmacion: true, afectados: 4 });

    await expect(respuesta).resolves.toEqual({ requiereConfirmacion: true, afectados: 4 });
  });

  it('un error de la API sale como ErrorAdmin con su código y mensaje', async () => {
    const respuesta = cliente.cambiarPermisos('r-cajero', []);

    http
      .expectOne(`${API_URL}/seg/roles/r-cajero/permisos`)
      .flush({ codigo: 'ROL_PREDEFINIDO_NO_EDITABLE', mensaje: 'Los roles predefinidos no se editan; cree una copia' }, { status: 409, statusText: 'Conflict' });

    await expect(respuesta).rejects.toMatchObject({ codigo: 'ROL_PREDEFINIDO_NO_EDITABLE', message: 'Los roles predefinidos no se editan; cree una copia' });
  });
});
