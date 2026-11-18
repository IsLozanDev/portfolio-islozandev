import { estadoDeCuotaActual } from './estado-cuota';

describe('estadoDeCuotaActual', () => {
  it('500 de 500 está agotada', () => {
    expect(estadoDeCuotaActual({ incluidas: 500, consumidas: 500, porcentaje: 100, umbralAviso: 80 })).toBe('AGOTADA');
  });

  it('410 de 500 con umbral 80 está sobre el umbral', () => {
    expect(estadoDeCuotaActual({ incluidas: 500, consumidas: 410, porcentaje: 82, umbralAviso: 80 })).toBe('EN_AVISO');
  });

  it('justo en el umbral ya está sobre el umbral', () => {
    expect(estadoDeCuotaActual({ incluidas: 500, consumidas: 400, porcentaje: 80, umbralAviso: 80 })).toBe('EN_AVISO');
  });

  it('120 de 500 es normal', () => {
    expect(estadoDeCuotaActual({ incluidas: 500, consumidas: 120, porcentaje: 24, umbralAviso: 80 })).toBe('NORMAL');
  });

  it('sin incluidas está agotada', () => {
    expect(estadoDeCuotaActual({ incluidas: 0, consumidas: 0, porcentaje: 100, umbralAviso: 80 })).toBe('AGOTADA');
  });
});
