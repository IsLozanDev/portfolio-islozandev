import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { InvitacionCliente } from './invitacion.cliente';

const API_URL = 'https://api.test/v1';

describe('InvitacionCliente', () => {
  let cliente: InvitacionCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } }],
    });
    cliente = TestBed.inject(InvitacionCliente);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('consultar pide GET /seg/invitaciones/{token} con el token codificado', async () => {
    const respuesta = cliente.consultar('abc/def');

    const peticion = http.expectOne(`${API_URL}/seg/invitaciones/abc%2Fdef`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ estado: 'VIGENTE', tenant_nombre: 'Sazón', expira_en: '2026-10-29T15:00:00.000Z' });

    await expect(respuesta).resolves.toMatchObject({ tenantNombre: 'Sazón' });
  });

  it('consultar con 410 da INVITACION_EXPIRADA', async () => {
    const respuesta = cliente.consultar('vencido');

    http
      .expectOne(`${API_URL}/seg/invitaciones/vencido`)
      .flush({ codigo: 'INVITACION_EXPIRADA', mensaje: 'expiró' }, { status: 410, statusText: 'Gone' });

    await expect(respuesta).rejects.toMatchObject({ codigo: 'INVITACION_EXPIRADA' });
  });

  it('aceptar envía POST /seg/invitaciones/aceptar con { token }', async () => {
    const respuesta = cliente.aceptar('tok-1');

    const peticion = http.expectOne(`${API_URL}/seg/invitaciones/aceptar`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ token: 'tok-1' });
    peticion.flush({ tenant_id: 't-1', membresia_id: 'm-1', refrescar_sesion: true });

    await expect(respuesta).resolves.toEqual({ tenantId: 't-1', membresiaId: 'm-1', refrescarSesion: true });
  });

  it('aceptar con 403 da INVITACION_OTRO_CORREO', async () => {
    const respuesta = cliente.aceptar('tok-1');

    http
      .expectOne(`${API_URL}/seg/invitaciones/aceptar`)
      .flush({ codigo: 'INVITACION_OTRO_CORREO', mensaje: 'otro' }, { status: 403, statusText: 'Forbidden' });

    await expect(respuesta).rejects.toMatchObject({ codigo: 'INVITACION_OTRO_CORREO' });
  });
});
