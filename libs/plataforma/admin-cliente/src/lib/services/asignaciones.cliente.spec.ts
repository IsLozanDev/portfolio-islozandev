import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import type { FormularioAsignacion } from '../models/asignacion';
import { AsignacionesCliente } from './asignaciones.cliente';

const CAJERO_EN_CAJA_02: FormularioAsignacion = {
  rolId: 'r-cajero',
  perfilId: null,
  alcance: 'UNIDAD',
  empresaId: null,
  sucursalId: null,
  unidadId: 'u-caja-02',
  vigenteDesde: '2026-10-15',
  vigenteHasta: '2026-10-31',
};

describe('AsignacionesCliente', () => {
  let cliente: AsignacionesCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(AsignacionesCliente);
  });

  afterEach(() => http.verify());

  it('asignables pide GET /seg/asignables y mapea producto_codigo', async () => {
    const respuesta = cliente.asignables();

    http.expectOne(`${API_URL}/seg/asignables`).flush({
      roles: [{ id: 'r-cajero', codigo: 'CAJERO', nombre: 'Cajero', producto_codigo: 'REST', sensible: false }],
      perfiles: [{ id: 'p-turno', codigo: 'TURNO', nombre: 'Turno', sensible: true }],
    });

    await expect(respuesta).resolves.toEqual({
      roles: [{ id: 'r-cajero', codigo: 'CAJERO', nombre: 'Cajero', productoCodigo: 'REST', sensible: false }],
      perfiles: [{ id: 'p-turno', codigo: 'TURNO', nombre: 'Turno', sensible: true }],
    });
  });

  it('otorgar envía POST /seg/asignaciones en snake_case y devuelve el id (TR-CA-036)', async () => {
    const respuesta = cliente.otorgar('m-luis', CAJERO_EN_CAJA_02);

    const peticion = http.expectOne(`${API_URL}/seg/asignaciones`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      membresia_id: 'm-luis',
      rol_id: 'r-cajero',
      perfil_id: null,
      alcance: 'UNIDAD',
      empresa_id: null,
      sucursal_id: null,
      unidad_id: 'u-caja-02',
      vigente_desde: '2026-10-15',
      vigente_hasta: '2026-10-31',
    });
    peticion.flush({ asignacion_id: 'a-1' }, { status: 201, statusText: 'Created' });

    await expect(respuesta).resolves.toBe('a-1');
  });

  it('otorgar con 400 VIGENCIA_INVALIDA da el mensaje de la API (TR-CA-038)', async () => {
    const respuesta = cliente.otorgar('m-luis', { ...CAJERO_EN_CAJA_02, vigenteDesde: '2026-10-20', vigenteHasta: '2026-10-19' });

    http
      .expectOne(`${API_URL}/seg/asignaciones`)
      .flush({ codigo: 'VIGENCIA_INVALIDA', mensaje: 'La vigencia hasta no puede ser anterior a la vigencia desde' }, { status: 400, statusText: 'Bad Request' });

    await expect(respuesta).rejects.toMatchObject({ codigo: 'VIGENCIA_INVALIDA', message: 'La vigencia hasta no puede ser anterior a la vigencia desde' });
  });

  it('revocar envía POST /seg/asignaciones/{id}/revocar con motivo y confirmar', async () => {
    const respuesta = cliente.revocar('a-1', 'Cese');

    const peticion = http.expectOne(`${API_URL}/seg/asignaciones/a-1/revocar`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ motivo: 'Cese', confirmar: true });
    peticion.flush({ revocada_en: '2026-10-28T15:00:00.000Z' });

    await expect(respuesta).resolves.toBeUndefined();
  });
});
