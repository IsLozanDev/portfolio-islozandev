import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { UnidadesCliente } from './unidades.cliente';

const FILA_CAJA = {
  id: 'u-caja',
  empresa_id: 'e-sabores',
  sucursal_id: 's-cayma',
  tipo: 'CAJA',
  codigo: 'CAJA-01',
  nombre: 'Caja 1',
  padre_id: 'u-salon',
  atributos: { impresora: 'EPSON-1', color: 'rojo' },
  activo: false,
  version: 2,
} as const;

const CAJA = {
  id: 'u-caja',
  empresaId: 'e-sabores',
  sucursalId: 's-cayma',
  tipo: 'CAJA',
  codigo: 'CAJA-01',
  nombre: 'Caja 1',
  padreId: 'u-salon',
  atributos: { impresora: 'EPSON-1', color: 'rojo' },
  activo: false,
  version: 2,
} as const;

describe('UnidadesCliente', () => {
  let cliente: UnidadesCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(UnidadesCliente);
  });

  afterEach(() => http.verify());

  it('listar pide GET /org/unidades con empresa, sucursal, tipo, activo y página', async () => {
    const respuesta = cliente.listar({ empresaId: 'e-sabores', sucursalId: 's-cayma', tipo: 'CAJA', activo: true, pagina: 1, tamano: 20 });

    const peticion = http.expectOne((solicitud) => solicitud.url === `${API_URL}/org/unidades`);
    expect(peticion.request.params.toString()).toBe('empresa_id=e-sabores&pagina=1&tamano=20&sucursal_id=s-cayma&tipo=CAJA&activo=true');
    peticion.flush({ items: [FILA_CAJA], total: 1 });

    await expect(respuesta).resolves.toEqual({ items: [CAJA], total: 1 });
  });

  it('TR-CA-012: listar solo con la empresa trae también las de nivel empresa', async () => {
    const respuesta = cliente.listar({ empresaId: 'e-sabores', pagina: 1, tamano: 20 });

    const peticion = http.expectOne((solicitud) => solicitud.url === `${API_URL}/org/unidades`);
    expect(peticion.request.params.toString()).toBe('empresa_id=e-sabores&pagina=1&tamano=20');
    peticion.flush({ items: [{ ...FILA_CAJA, tipo: 'ALMACEN', sucursal_id: null }], total: 1 });

    await expect(respuesta).resolves.toMatchObject({ items: [{ tipo: 'ALMACEN', sucursalId: null }] });
  });

  it('consultar pide GET /org/unidades/:id', async () => {
    const respuesta = cliente.consultar('u-caja');

    http.expectOne(`${API_URL}/org/unidades/u-caja`).flush(FILA_CAJA);

    await expect(respuesta).resolves.toEqual(CAJA);
  });

  it('TR-CA-010: registrar envía empresa, sucursal, tipo y datos en snake_case', async () => {
    const respuesta = cliente.registrar({
      empresaId: 'e-sabores',
      sucursalId: 's-cayma',
      tipo: 'CAJA',
      codigo: 'CAJA-01',
      nombre: 'Caja 1',
      padreId: null,
      atributos: { capacidad: 2 },
    });

    const peticion = http.expectOne(`${API_URL}/org/unidades`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      empresa_id: 'e-sabores',
      sucursal_id: 's-cayma',
      tipo: 'CAJA',
      codigo: 'CAJA-01',
      nombre: 'Caja 1',
      padre_id: null,
      atributos: { capacidad: 2 },
    });
    peticion.flush({ unidad_id: 'u-caja' });

    await expect(respuesta).resolves.toBe('u-caja');
  });

  it('editar envía PUT con la versión y sin tipo ni sucursal', async () => {
    const respuesta = cliente.editar('u-caja', 2, { codigo: 'CAJA-01', nombre: 'Caja principal', padreId: 'u-salon', atributos: {} });

    const peticion = http.expectOne(`${API_URL}/org/unidades/u-caja`);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toEqual({ version: 2, codigo: 'CAJA-01', nombre: 'Caja principal', padre_id: 'u-salon', atributos: {} });
    peticion.flush(null, { status: 204, statusText: 'No Content' });

    await respuesta;
  });

  it('reactivar reenvía los datos de la fila, atributos incluidos, con activo: true', async () => {
    const respuesta = cliente.reactivar(CAJA);

    const peticion = http.expectOne(`${API_URL}/org/unidades/u-caja`);
    expect(peticion.request.body).toEqual({
      version: 2,
      activo: true,
      codigo: 'CAJA-01',
      nombre: 'Caja 1',
      padre_id: 'u-salon',
      atributos: { impresora: 'EPSON-1', color: 'rojo' },
    });
    peticion.flush(null, { status: 204, statusText: 'No Content' });

    await respuesta;
  });

  it('inactivar envía POST /org/unidades/:id/inactivar', async () => {
    const respuesta = cliente.inactivar('u-caja');

    const peticion = http.expectOne(`${API_URL}/org/unidades/u-caja/inactivar`);
    expect(peticion.request.method).toBe('POST');
    peticion.flush(null, { status: 204, statusText: 'No Content' });

    await respuesta;
  });
});
