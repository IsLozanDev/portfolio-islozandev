import { TONOS_ESTADO_TENANT } from './mensajes-consola';

describe('tonos de estado de tenants', () => {
  it('ACTIVO éxito, PRUEBA info, SUSPENDIDO advertencia y BAJA neutro', () => {
    expect(TONOS_ESTADO_TENANT).toEqual({ ACTIVO: 'exito', PRUEBA: 'info', SUSPENDIDO: 'advertencia', BAJA: 'neutro' });
  });
});
