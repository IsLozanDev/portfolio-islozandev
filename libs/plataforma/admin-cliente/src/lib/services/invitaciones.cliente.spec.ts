import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import type { DatosInvitacion } from '../models/invitacion';
import { InvitacionesCliente } from './invitaciones.cliente';

const ROSA_EN_MIRAFLORES: DatosInvitacion = {
  nombre: 'Rosa Huamán',
  correo: 'rosa.huaman@gmail.com',
  asignacion: {
    rolId: null,
    perfilId: 'p-cajero',
    alcance: 'SUCURSAL',
    empresaId: null,
    sucursalId: 's-miraflores',
    unidadId: null,
    vigenteDesde: '2026-10-20',
    vigenteHasta: null,
  },
};

describe('InvitacionesCliente', () => {
  let cliente: InvitacionesCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(InvitacionesCliente);
  });

  afterEach(() => http.verify());

  it('invitar envía POST /seg/invitaciones sin vigente_desde y mapea la respuesta (TR-CA-025)', async () => {
    const respuesta = cliente.invitar(ROSA_EN_MIRAFLORES);

    const peticion = http.expectOne(`${API_URL}/seg/invitaciones`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      nombre: 'Rosa Huamán',
      correo: 'rosa.huaman@gmail.com',
      rol_id: null,
      perfil_id: 'p-cajero',
      alcance: 'SUCURSAL',
      empresa_id: null,
      sucursal_id: 's-miraflores',
      unidad_id: null,
      vigente_hasta: null,
    });
    peticion.flush(
      { membresia_id: 'm-rosa', invitacion_id: 'i-1', expira_en: '2026-10-23T15:00:00.000Z', usuario_nuevo: true, correo_enviado: false },
      { status: 201, statusText: 'Created' },
    );

    await expect(respuesta).resolves.toEqual({
      membresiaId: 'm-rosa',
      invitacionId: 'i-1',
      expiraEn: new Date('2026-10-23T15:00:00.000Z'),
      usuarioNuevo: true,
      correoEnviado: false,
    });
  });

  it('LIMITE_USUARIOS da el mensaje de la API', async () => {
    const respuesta = cliente.invitar(ROSA_EN_MIRAFLORES);

    http
      .expectOne(`${API_URL}/seg/invitaciones`)
      .flush({ codigo: 'LIMITE_USUARIOS', mensaje: 'El plan de REST permite 10 usuarios' }, { status: 409, statusText: 'Conflict' });

    await expect(respuesta).rejects.toMatchObject({ codigo: 'LIMITE_USUARIOS', message: 'El plan de REST permite 10 usuarios' });
  });
});
