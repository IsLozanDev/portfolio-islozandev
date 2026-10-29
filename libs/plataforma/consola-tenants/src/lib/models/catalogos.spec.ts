import { TRANSICIONES_TENANT } from './catalogos';

describe('TRANSICIONES_TENANT', () => {
  it('repite la matriz de ORG: desde BAJA no hay destinos', () => {
    expect(TRANSICIONES_TENANT).toEqual({
      PRUEBA: ['ACTIVO', 'SUSPENDIDO', 'BAJA'],
      ACTIVO: ['SUSPENDIDO', 'BAJA'],
      SUSPENDIDO: ['ACTIVO', 'BAJA'],
      BAJA: [],
    });
  });
});
