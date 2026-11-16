import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorIdentidad } from '../models/error-identidad';
import { ProveedoresCliente } from './proveedores.cliente';

const DECOLECTA = { codigo: 'DECOLECTA', tipos_doc: ['DNI', 'RUC'], prioridad: 1, ttl_dias: 30, timeout_ms: 3000, activo: true, version: 2 };

describe('ProveedoresCliente', () => {
  let cliente: ProveedoresCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(ProveedoresCliente);
  });

  afterEach(() => http.verify());

  it('listar pide GET /identidad/proveedores y conserva el orden de la API', async () => {
    const promesa = cliente.listar();
    http.expectOne({ method: 'GET', url: `${API_URL}/identidad/proveedores` }).flush([DECOLECTA, { ...DECOLECTA, codigo: 'APIS_PERU', prioridad: 2 }]);

    const lista = await promesa;
    expect(lista.map((proveedor) => proveedor.codigo)).toEqual(['DECOLECTA', 'APIS_PERU']);
    expect(lista[0]).toEqual({ codigo: 'DECOLECTA', tiposDoc: ['DNI', 'RUC'], prioridad: 1, ttlDias: 30, timeoutMs: 3000, activo: true, version: 2 });
  });

  it('actualizar manda PATCH solo con los campos cambiados y la versión', async () => {
    const promesa = cliente.actualizar('DECOLECTA', { prioridad: 3, version: 2 });
    const peticion = http.expectOne({ method: 'PATCH', url: `${API_URL}/identidad/proveedores/DECOLECTA` });
    expect(peticion.request.body).toEqual({ prioridad: 3, version: 2 });
    peticion.flush({ ...DECOLECTA, prioridad: 3, version: 3 });

    await expect(promesa).resolves.toBeUndefined();
  });

  it('ULTIMO_PROVEEDOR_ACTIVO sale como ErrorIdentidad 422 con el mensaje de la pantalla', async () => {
    const promesa = cliente.actualizar('DECOLECTA', { activo: false, version: 2 });
    http
      .expectOne(`${API_URL}/identidad/proveedores/DECOLECTA`)
      .flush({ codigo: 'ULTIMO_PROVEEDOR_ACTIVO', mensaje: 'x' }, { status: 422, statusText: 'Unprocessable Entity' });

    const error = await promesa.catch((causa: unknown) => causa);
    expect(error).toBeInstanceOf(ErrorIdentidad);
    expect(error).toMatchObject({ codigo: 'ULTIMO_PROVEEDOR_ACTIVO', message: 'Debe quedar al menos un proveedor activo.', estado: 422 });
  });

  it('VERSION_OBSOLETA sale como 409', async () => {
    const promesa = cliente.actualizar('DECOLECTA', { ttlDias: 60, version: 1 });
    http.expectOne(`${API_URL}/identidad/proveedores/DECOLECTA`).flush({ codigo: 'VERSION_OBSOLETA', mensaje: 'x' }, { status: 409, statusText: 'Conflict' });

    expect(await promesa.catch((causa: unknown) => causa)).toMatchObject({ codigo: 'VERSION_OBSOLETA', estado: 409 });
  });

  it('OPERADOR_REQUERIDO sale como 403', async () => {
    const promesa = cliente.listar();
    http.expectOne(`${API_URL}/identidad/proveedores`).flush({ codigo: 'OPERADOR_REQUERIDO', mensaje: 'x' }, { status: 403, statusText: 'Forbidden' });

    expect(await promesa.catch((causa: unknown) => causa)).toMatchObject({ codigo: 'OPERADOR_REQUERIDO', estado: 403 });
  });
});
