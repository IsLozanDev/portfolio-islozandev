import { TONOS_ESTADO_ASIGNACION, TONOS_ESTADO_MEMBRESIA } from './mensajes-admin';

describe('tonos de estado de usuarios', () => {
  it('membresía: ACTIVO éxito, INVITADO advertencia, SUSPENDIDO y FINALIZADO neutro', () => {
    expect(TONOS_ESTADO_MEMBRESIA).toEqual({ ACTIVO: 'exito', INVITADO: 'advertencia', SUSPENDIDO: 'neutro', FINALIZADO: 'neutro' });
  });

  it('asignación: VIGENTE éxito, FUTURA info, VENCIDA y REVOCADA neutro', () => {
    expect(TONOS_ESTADO_ASIGNACION).toEqual({ VIGENTE: 'exito', FUTURA: 'info', VENCIDA: 'neutro', REVOCADA: 'neutro' });
  });
});
