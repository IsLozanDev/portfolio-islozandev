import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { EmpresasCliente } from './empresas.cliente';

const FILA_SABORES = {
  id: 'e-sabores',
  ruc: '20512345671',
  razon_social: 'Sabores del Sur SAC',
  nombre_comercial: 'Sabores',
  direccion_fiscal: null,
  ubigeo: '040101',
  activo: true,
  version: 3,
};

const SABORES = {
  id: 'e-sabores',
  ruc: '20512345671',
  razonSocial: 'Sabores del Sur SAC',
  nombreComercial: 'Sabores',
  direccionFiscal: null,
  ubigeo: '040101',
  activo: true,
  version: 3,
};

const DATOS = { razonSocial: 'Sabores del Sur SAC', nombreComercial: null, direccionFiscal: 'Av. Ejército 101', ubigeo: '040101' };
const CUERPO_DATOS = { razon_social: 'Sabores del Sur SAC', nombre_comercial: null, direccion_fiscal: 'Av. Ejército 101', ubigeo: '040101' };

describe('EmpresasCliente', () => {
  let cliente: EmpresasCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(EmpresasCliente);
  });

  afterEach(() => http.verify());

  it('listar pide GET /org/empresas paginado y mapea a camelCase', async () => {
    const respuesta = cliente.listar({ pagina: 2, tamano: 20 });

    const peticion = http.expectOne((solicitud) => solicitud.url === `${API_URL}/org/empresas`);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.toString()).toBe('pagina=2&tamano=20');
    peticion.flush({ items: [FILA_SABORES], total: 21 });

    await expect(respuesta).resolves.toEqual({ items: [SABORES], total: 21 });
  });

  it('consultar pide GET /org/empresas/:id', async () => {
    const respuesta = cliente.consultar('e-sabores');

    http.expectOne(`${API_URL}/org/empresas/e-sabores`).flush(FILA_SABORES);

    await expect(respuesta).resolves.toEqual(SABORES);
  });

  it('TR-CA-004: registrar envía el RUC y los datos en snake_case y devuelve la empresa y su principal', async () => {
    const respuesta = cliente.registrar('20512345671', DATOS);

    const peticion = http.expectOne(`${API_URL}/org/empresas`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ ruc: '20512345671', ...CUERPO_DATOS });
    peticion.flush({ empresa_id: 'e-sabores', sucursal_principal_id: 's-centro' });

    await expect(respuesta).resolves.toEqual({ empresaId: 'e-sabores', sucursalPrincipalId: 's-centro' });
  });

  it('editar envía PUT con la versión y sin RUC', async () => {
    const respuesta = cliente.editar('e-sabores', 3, DATOS);

    const peticion = http.expectOne(`${API_URL}/org/empresas/e-sabores`);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toEqual({ version: 3, ...CUERPO_DATOS });
    peticion.flush(null, { status: 204, statusText: 'No Content' });

    await expect(respuesta).resolves.toBeUndefined();
  });

  it('TR-CA-005: un 409 sale como ErrorAdmin con el mensaje de la API', async () => {
    const respuesta = cliente.registrar('20512345671', DATOS);

    http
      .expectOne(`${API_URL}/org/empresas`)
      .flush({ codigo: 'CONFLICTO', mensaje: 'La empresa ya está registrada en este tenant' }, { status: 409, statusText: 'Conflict' });

    await expect(respuesta).rejects.toMatchObject({ codigo: 'CONFLICTO', message: 'La empresa ya está registrada en este tenant', estado: 409 });
  });
});
