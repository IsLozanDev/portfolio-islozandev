import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorAdmin } from '../models/error-admin';
import { PadronCliente } from './padron.cliente';

const RUC_MISTI = '20456789120';
const URL_MISTI = `${API_URL}/identidad/RUC/${RUC_MISTI}`;

describe('PadronCliente (spec 28b)', () => {
  let cliente: PadronCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(PadronCliente);
  });

  afterEach(() => http.verify());

  it('consulta GET /identidad/RUC/:ruc con motivo VERIFICACION_IDENTIDAD y mapea a camelCase', async () => {
    const respuesta = cliente.consultarRuc(RUC_MISTI);

    const peticion = http.expectOne((solicitud) => solicitud.url === URL_MISTI);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.toString()).toBe('motivo=VERIFICACION_IDENTIDAD');
    peticion.flush({
      tipo: 'RUC',
      razon_social: 'Inversiones Misti S.A.C.',
      estado: 'ACTIVO',
      condicion: 'NO HABIDO',
      direccion_fiscal: 'Calle Santa Catalina 210, Arequipa',
      ubigeo: '040101',
      apto_factura: false,
      motivo_no_apto: 'Condición NO HABIDO',
    });

    await expect(respuesta).resolves.toEqual({
      razonSocial: 'Inversiones Misti S.A.C.',
      estado: 'ACTIVO',
      condicion: 'NO HABIDO',
      aptoFactura: false,
      motivoNoApto: 'Condición NO HABIDO',
    });
  });

  it('un contribuyente apto no trae motivo', async () => {
    const respuesta = cliente.consultarRuc(RUC_MISTI);
    http.expectOne((solicitud) => solicitud.url === URL_MISTI).flush({ razon_social: 'Otra S.A.C.', estado: 'ACTIVO', condicion: 'HABIDO', apto_factura: true });
    await expect(respuesta).resolves.toMatchObject({ aptoFactura: true, motivoNoApto: null });
  });

  it.each([
    [404, 'Not Found', 'NO_ENCONTRADO'],
    [503, 'Service Unavailable', 'PROVEEDOR_NO_DISPONIBLE'],
  ])('%i devuelve null', async (status, statusText, codigo) => {
    const respuesta = cliente.consultarRuc(RUC_MISTI);
    http.expectOne((solicitud) => solicitud.url === URL_MISTI).flush({ codigo, mensaje: 'Sin datos' }, { status, statusText });
    await expect(respuesta).resolves.toBeNull();
  });

  it('otro error (403) sale como ErrorAdmin', async () => {
    const respuesta = cliente.consultarRuc(RUC_MISTI);
    http.expectOne((solicitud) => solicitud.url === URL_MISTI).flush({ codigo: 'SIN_PERMISO', mensaje: 'Sin permiso' }, { status: 403, statusText: 'Forbidden' });
    await expect(respuesta).rejects.toBeInstanceOf(ErrorAdmin);
  });
});
