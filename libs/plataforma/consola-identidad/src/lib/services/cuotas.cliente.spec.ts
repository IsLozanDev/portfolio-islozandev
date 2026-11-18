import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorIdentidad } from '../models/error-identidad';
import { CuotasCliente } from './cuotas.cliente';

const TENANT_ID = '9b2c8f1e-0000-4000-8000-000000000001';
const FILA = {
  tenant_id: TENANT_ID,
  tenant_nombre: 'Pollería Doña Rosa',
  plan: 'BASICO',
  incluidas: 500,
  consumidas: 120,
  porcentaje: 24,
  avisado_umbral_en: null,
  avisado_agotada_en: null,
  version: 3,
};
const CONSULTAS = { CACHE: 40, PROVEEDOR: 70, NO_ENCONTRADO: 5, INVALIDO: 2, CUOTA_AGOTADA: 0, PROVEEDOR_NO_DISPONIBLE: 3 };

describe('CuotasCliente', () => {
  let cliente: CuotasCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(CuotasCliente);
  });

  afterEach(() => http.verify());

  it('listar pide periodo, página y tamaño 20, y mapea a camelCase', async () => {
    const promesa = cliente.listar({ periodo: '2026-11', pagina: 2 });
    const peticion = http.expectOne((solicitud) => solicitud.url === `${API_URL}/identidad/cuotas`);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.toString()).toBe('periodo=2026-11&pagina=2&tamano=20');
    peticion.flush({ periodo: '2026-11', items: [FILA], total: 21, pagina: 2, tamano: 20 });

    expect(await promesa).toMatchObject({ periodo: '2026-11', total: 21, items: [{ tenantId: TENANT_ID, tenantNombre: 'Pollería Doña Rosa' }] });
  });

  it('listar agrega la búsqueda solo si la hay', async () => {
    const promesa = cliente.listar({ periodo: '2026-10', q: 'pollo', pagina: 1 });
    const peticion = http.expectOne((solicitud) => solicitud.url === `${API_URL}/identidad/cuotas`);
    expect(peticion.request.params.get('q')).toBe('pollo');
    peticion.flush({ periodo: '2026-10', items: [], total: 0, pagina: 1, tamano: 20 });

    expect((await promesa).items).toEqual([]);
  });

  it('detalle pide GET /cuotas/{tenantId}/{periodo} y mapea los contadores', async () => {
    const promesa = cliente.detalle(TENANT_ID, '2026-11');
    http
      .expectOne({ method: 'GET', url: `${API_URL}/identidad/cuotas/${TENANT_ID}/2026-11` })
      .flush({ ...FILA, periodo: '2026-11', creada_en: '2026-11-01T05:00:00Z', consultas_por_resultado: CONSULTAS });

    expect(await promesa).toMatchObject({ periodo: '2026-11', creadaEn: '2026-11-01T05:00:00Z', consultasPorResultado: CONSULTAS });
  });

  it('ajustar manda PATCH { incluidas, version }', async () => {
    const promesa = cliente.ajustar(TENANT_ID, '2026-11', 800, 3);
    const peticion = http.expectOne({ method: 'PATCH', url: `${API_URL}/identidad/cuotas/${TENANT_ID}/2026-11` });
    expect(peticion.request.body).toEqual({ incluidas: 800, version: 3 });
    peticion.flush({ ...FILA, incluidas: 800, version: 4, periodo: '2026-11' });

    await expect(promesa).resolves.toBeUndefined();
  });

  it('CUOTA_NO_ENCONTRADA sale como ErrorIdentidad 404', async () => {
    const promesa = cliente.detalle(TENANT_ID, '2026-10');
    http.expectOne(`${API_URL}/identidad/cuotas/${TENANT_ID}/2026-10`).flush({ codigo: 'CUOTA_NO_ENCONTRADA', mensaje: 'No existe' }, { status: 404, statusText: 'Not Found' });

    const error = await promesa.catch((causa: unknown) => causa);
    expect(error).toBeInstanceOf(ErrorIdentidad);
    expect(error).toMatchObject({ codigo: 'CUOTA_NO_ENCONTRADA', estado: 404 });
  });

  it('INCLUIDAS_MENOR_QUE_CONSUMIDAS lleva el mensaje propio de la pantalla', async () => {
    const promesa = cliente.ajustar(TENANT_ID, '2026-11', 100, 3);
    http
      .expectOne(`${API_URL}/identidad/cuotas/${TENANT_ID}/2026-11`)
      .flush({ codigo: 'INCLUIDAS_MENOR_QUE_CONSUMIDAS', mensaje: 'incluidas < consumidas' }, { status: 422, statusText: 'Unprocessable Entity' });

    expect(await promesa.catch((causa: unknown) => causa)).toMatchObject({
      codigo: 'INCLUIDAS_MENOR_QUE_CONSUMIDAS',
      message: 'Las incluidas no pueden ser menos que las ya consumidas.',
      estado: 422,
    });
  });

  it('un código sin mensaje propio conserva el de la API', async () => {
    const promesa = cliente.detalle(TENANT_ID, '2026-11');
    http.expectOne(`${API_URL}/identidad/cuotas/${TENANT_ID}/2026-11`).flush({ codigo: 'OTRO', mensaje: 'Algo de la API' }, { status: 400, statusText: 'Bad Request' });

    expect(await promesa.catch((causa: unknown) => causa)).toMatchObject({ codigo: 'OTRO', message: 'Algo de la API' });
  });
});
