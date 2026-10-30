import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { SucursalesCliente } from './sucursales.cliente';

const FILA_CAYMA = {
  id: 's-cayma',
  empresa_id: 'e-sabores',
  codigo: 'CAYMA',
  nombre: 'Cayma',
  codigo_establecimiento_sunat: '0002',
  direccion: null,
  ubigeo: '040103',
  telefono: null,
  zona_horaria: 'America/Lima',
  es_principal: false,
  activo: false,
  version: 4,
};

const CAYMA = {
  id: 's-cayma',
  empresaId: 'e-sabores',
  codigo: 'CAYMA',
  nombre: 'Cayma',
  codigoEstablecimientoSunat: '0002',
  direccion: null,
  ubigeo: '040103',
  telefono: null,
  zonaHoraria: 'America/Lima',
  esPrincipal: false,
  activo: false,
  version: 4,
};

const CUERPO_DATOS_CAYMA = {
  codigo: 'CAYMA',
  nombre: 'Cayma',
  codigo_establecimiento_sunat: '0002',
  direccion: null,
  ubigeo: '040103',
  telefono: null,
  zona_horaria: 'America/Lima',
};

const DATOS_CAYMA = {
  codigo: 'CAYMA',
  nombre: 'Cayma',
  codigoEstablecimientoSunat: '0002',
  direccion: null,
  ubigeo: '040103',
  telefono: null,
  zonaHoraria: 'America/Lima',
};

describe('SucursalesCliente', () => {
  let cliente: SucursalesCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(SucursalesCliente);
  });

  afterEach(() => http.verify());

  it('listar pide GET /org/empresas/:id/sucursales con activo y página', async () => {
    const respuesta = cliente.listar('e-sabores', { activo: false, pagina: 1, tamano: 20 });

    const peticion = http.expectOne((solicitud) => solicitud.url === `${API_URL}/org/empresas/e-sabores/sucursales`);
    expect(peticion.request.params.toString()).toBe('pagina=1&tamano=20&activo=false');
    peticion.flush({ items: [FILA_CAYMA], total: 1 });

    await expect(respuesta).resolves.toEqual({ items: [CAYMA], total: 1 });
  });

  it('listar sin activo no manda el filtro', async () => {
    const respuesta = cliente.listar('e-sabores', { pagina: 1, tamano: 20 });

    const peticion = http.expectOne((solicitud) => solicitud.url === `${API_URL}/org/empresas/e-sabores/sucursales`);
    expect(peticion.request.params.has('activo')).toBe(false);
    peticion.flush({ items: [], total: 0 });

    await respuesta;
  });

  it('consultar pide GET /org/sucursales/:id', async () => {
    const respuesta = cliente.consultar('s-cayma');

    http.expectOne(`${API_URL}/org/sucursales/s-cayma`).flush(FILA_CAYMA);

    await expect(respuesta).resolves.toEqual(CAYMA);
  });

  it('TR-CA-007: registrar envía POST en snake_case y devuelve el id', async () => {
    const respuesta = cliente.registrar('e-sabores', DATOS_CAYMA);

    const peticion = http.expectOne(`${API_URL}/org/empresas/e-sabores/sucursales`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(CUERPO_DATOS_CAYMA);
    peticion.flush({ sucursal_id: 's-cayma' });

    await expect(respuesta).resolves.toBe('s-cayma');
  });

  it('editar envía PUT con la versión', async () => {
    const respuesta = cliente.editar('s-cayma', 4, DATOS_CAYMA);

    const peticion = http.expectOne(`${API_URL}/org/sucursales/s-cayma`);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toEqual({ version: 4, ...CUERPO_DATOS_CAYMA });
    peticion.flush(null, { status: 204, statusText: 'No Content' });

    await respuesta;
  });

  it('reactivar reenvía los datos de la fila con su versión y activo: true', async () => {
    const respuesta = cliente.reactivar(CAYMA);

    const peticion = http.expectOne(`${API_URL}/org/sucursales/s-cayma`);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toEqual({ version: 4, activo: true, ...CUERPO_DATOS_CAYMA });
    peticion.flush(null, { status: 204, statusText: 'No Content' });

    await respuesta;
  });

  it.each([
    ['inactivar', 'inactivar'],
    ['marcarPrincipal', 'principal'],
  ] as const)('%s envía POST /org/sucursales/:id/%s', async (metodo, accion) => {
    const respuesta = cliente[metodo]('s-cayma');

    const peticion = http.expectOne(`${API_URL}/org/sucursales/s-cayma/${accion}`);
    expect(peticion.request.method).toBe('POST');
    peticion.flush(null, { status: 204, statusText: 'No Content' });

    await respuesta;
  });

  it('TR-CA-008: el tope del plan sale como ErrorAdmin con el mensaje de la API', async () => {
    const respuesta = cliente.registrar('e-sabores', DATOS_CAYMA);

    http
      .expectOne(`${API_URL}/org/empresas/e-sabores/sucursales`)
      .flush({ codigo: 'CONFLICTO', mensaje: 'Su plan permite 2 sucursales; amplíe su plan' }, { status: 409, statusText: 'Conflict' });

    await expect(respuesta).rejects.toMatchObject({ codigo: 'CONFLICTO', message: 'Su plan permite 2 sucursales; amplíe su plan' });
  });
});
