import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { PerfilesCliente } from './perfiles.cliente';

const FORMULARIO = { codigo: 'ENCARGADO', nombre: 'Encargado de tienda' };

describe('PerfilesCliente', () => {
  let cliente: PerfilesCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(PerfilesCliente);
  });

  afterEach(() => http.verify());

  it('listar pide GET /seg/perfiles y mapea a camelCase', async () => {
    const respuesta = cliente.listar();

    const peticion = http.expectOne(`${API_URL}/seg/perfiles`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ items: [{ id: 'p1', codigo: 'ENCARGADO', nombre: 'Encargado', predefinido: false, total_roles: 2, productos: ['ECO', 'LIB'] }] });

    await expect(respuesta).resolves.toEqual([{ id: 'p1', codigo: 'ENCARGADO', nombre: 'Encargado', predefinido: false, totalRoles: 2, productos: ['ECO', 'LIB'] }]);
  });

  it('detalle pide GET /seg/perfiles/:perfilId con los ids de sus roles', async () => {
    const respuesta = cliente.detalle('p1');

    http.expectOne(`${API_URL}/seg/perfiles/p1`).flush({ id: 'p1', codigo: 'ENCARGADO', nombre: 'Encargado', predefinido: true, roles: ['r1'] });

    await expect(respuesta).resolves.toEqual({ id: 'p1', codigo: 'ENCARGADO', nombre: 'Encargado', predefinido: true, roles: ['r1'] });
  });

  it('rolesDisponibles pide GET /seg/perfiles/roles-disponibles y mapea a camelCase', async () => {
    const respuesta = cliente.rolesDisponibles();

    http
      .expectOne(`${API_URL}/seg/perfiles/roles-disponibles`)
      .flush({ items: [{ id: 'r1', codigo: 'LIB_VENDEDOR', nombre: 'Vendedor', producto_codigo: 'LIB', producto_nombre: 'Librería', predefinido: true }] });

    await expect(respuesta).resolves.toEqual([{ id: 'r1', codigo: 'LIB_VENDEDOR', nombre: 'Vendedor', productoCodigo: 'LIB', productoNombre: 'Librería', predefinido: true }]);
  });

  it('crear envía POST /seg/perfiles y devuelve el id', async () => {
    const respuesta = cliente.crear(FORMULARIO, ['r1', 'r2']);

    const peticion = http.expectOne(`${API_URL}/seg/perfiles`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ codigo: 'ENCARGADO', nombre: 'Encargado de tienda', roles: ['r1', 'r2'] });
    peticion.flush({ perfil_id: 'p2' });

    await expect(respuesta).resolves.toBe('p2');
  });

  it('copiar envía POST /seg/perfiles/:perfilId/copia siempre con roles', async () => {
    const respuesta = cliente.copiar('p1', FORMULARIO, ['r1']);

    const peticion = http.expectOne(`${API_URL}/seg/perfiles/p1/copia`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ codigo: 'ENCARGADO', nombre: 'Encargado de tienda', roles: ['r1'] });
    peticion.flush({ perfil_id: 'p3' });

    await expect(respuesta).resolves.toBe('p3');
  });

  it('cambiarRoles envía PUT /seg/perfiles/:perfilId/roles con el conjunto completo', async () => {
    const respuesta = cliente.cambiarRoles('p1', ['r2']);

    const peticion = http.expectOne(`${API_URL}/seg/perfiles/p1/roles`);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toEqual({ roles: ['r2'] });
    peticion.flush(null, { status: 204, statusText: 'No Content' });

    await expect(respuesta).resolves.toBeUndefined();
  });

  it('un error de la API sale como ErrorAdmin con su código y mensaje', async () => {
    const respuesta = cliente.crear(FORMULARIO, ['r9']);

    http
      .expectOne(`${API_URL}/seg/perfiles`)
      .flush({ codigo: 'ROL_FUERA_DEL_TECHO', mensaje: 'El rol PLAT_ADMIN_TENANTS no se puede usar en un perfil del cliente' }, { status: 400, statusText: 'Bad Request' });

    await expect(respuesta).rejects.toMatchObject({ codigo: 'ROL_FUERA_DEL_TECHO', estado: 400, message: 'El rol PLAT_ADMIN_TENANTS no se puede usar en un perfil del cliente' });
  });
});
