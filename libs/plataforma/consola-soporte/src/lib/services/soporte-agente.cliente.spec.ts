import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorSoporte } from '../models/error-soporte';
import { SoporteAgenteCliente } from './soporte-agente.cliente';

const URL_SOPORTE = `${API_URL}/seg/soporte`;

describe('SoporteAgenteCliente', () => {
  let http: HttpTestingController;
  let cliente: SoporteAgenteCliente;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(SoporteAgenteCliente);
  });

  afterEach(() => http.verify());

  it('mapea mis accesos a camelCase con fechas', async () => {
    const promesa = cliente.misAccesos();
    http.expectOne(`${URL_SOPORTE}/mis-accesos`).flush([
      {
        id: 'a-1',
        tenant_id: 't-1',
        tenant_nombre: 'Pollería',
        ticket: 'SOP-000001',
        modo: 'LECTURA',
        estado: 'APROBADO',
        horas_solicitadas: 2,
        solicitado_en: '2026-11-04T14:00:00Z',
        desde: '2026-11-04T14:05:00Z',
        hasta: '2026-11-04T16:05:00Z',
        motivo_cierre: null,
        causa_cierre: null,
      },
    ]);

    const [acceso] = await promesa;
    expect(acceso).toMatchObject({ id: 'a-1', tenantNombre: 'Pollería', horasSolicitadas: 2, estado: 'APROBADO' });
    expect(acceso.hasta?.toISOString()).toBe('2026-11-04T16:05:00.000Z');
  });

  it('envía la solicitud en snake_case y devuelve el id', async () => {
    const promesa = cliente.solicitar({ tenantId: 't-1', ticket: 'SOP-000001', motivo: 'Revisar cierre', modo: 'LECTURA', horas: 2 });
    const peticion = http.expectOne(`${URL_SOPORTE}/solicitudes`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ tenant_id: 't-1', ticket: 'SOP-000001', motivo: 'Revisar cierre', modo: 'LECTURA', horas: 2 });
    peticion.flush({ id: 'a-9' });

    expect(await promesa).toBe('a-9');
  });

  it('entrar hace POST al acceso; el error sale con el código de la API', async () => {
    const promesa = cliente.entrar('a/1');
    http
      .expectOne(`${URL_SOPORTE}/accesos/a%2F1/entrar`)
      .flush({ codigo: 'SOPORTE_NO_VIGENTE', mensaje: 'El acceso ya no está vigente' }, { status: 409, statusText: 'Conflict' });

    const error = await promesa.catch((rechazo: unknown) => rechazo);
    expect(error).toBeInstanceOf(ErrorSoporte);
    expect(error).toMatchObject({ codigo: 'SOPORTE_NO_VIGENTE', message: 'El acceso ya no está vigente', estado: 409 });
  });
});
