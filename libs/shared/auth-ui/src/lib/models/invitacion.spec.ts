import { HttpErrorResponse } from '@angular/common/http';
import { aErrorInvitacion, aEstadoInvitacion, aInvitacionAceptada, MENSAJES_INVITACION } from './invitacion';

describe('invitacion', () => {
  it('mapea el estado a camelCase con la fecha como Date', () => {
    const estado = aEstadoInvitacion({ estado: 'VIGENTE', tenant_nombre: 'Sazón Miraflores', expira_en: '2026-10-29T15:00:00.000Z' });

    expect(estado).toEqual({ estado: 'VIGENTE', tenantNombre: 'Sazón Miraflores', expiraEn: new Date('2026-10-29T15:00:00.000Z') });
  });

  it('mapea la aceptación a camelCase', () => {
    expect(aInvitacionAceptada({ tenant_id: 't-1', membresia_id: 'm-1', refrescar_sesion: true })).toEqual({
      tenantId: 't-1',
      membresiaId: 'm-1',
      refrescarSesion: true,
    });
  });

  describe('aErrorInvitacion', () => {
    it('usa el código del cuerpo de la API', () => {
      const error = aErrorInvitacion(new HttpErrorResponse({ status: 410, error: { codigo: 'INVITACION_EXPIRADA', mensaje: 'x' } }));

      expect(error.codigo).toBe('INVITACION_EXPIRADA');
      expect(error.message).toBe('La invitación expiró; solicite una nueva al administrador');
    });

    it.each([
      [403, 'INVITACION_OTRO_CORREO'],
      [404, 'INVITACION_NO_ENCONTRADA'],
      [409, 'INVITACION_NO_DISPONIBLE'],
      [429, 'DEMASIADAS_SOLICITUDES'],
      [500, 'DESCONOCIDO'],
    ])('sin código conocido en el cuerpo, %i da %s', (estado, codigo) => {
      expect(aErrorInvitacion(new HttpErrorResponse({ status: estado, error: { codigo: 'OTRO' } })).codigo).toBe(codigo);
    });

    it('un error que no es HTTP da el mensaje genérico', () => {
      expect(aErrorInvitacion(new Error('x')).message).toBe(MENSAJES_INVITACION.DESCONOCIDO);
    });
  });
});
