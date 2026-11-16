import { estadoDeFila } from './estado-cuota';

const AVISO = '2026-11-10T15:00:00Z';

describe('estadoDeFila', () => {
  it('500 de 500 está agotada aunque tenga aviso de umbral', () => {
    expect(estadoDeFila({ incluidas: 500, consumidas: 500, avisadoUmbralEn: AVISO })).toBe('AGOTADA');
  });

  it('400 de 500 con aviso de umbral está sobre el umbral', () => {
    expect(estadoDeFila({ incluidas: 500, consumidas: 400, avisadoUmbralEn: AVISO })).toBe('EN_AVISO');
  });

  it('100 de 500 sin aviso es normal', () => {
    expect(estadoDeFila({ incluidas: 500, consumidas: 100, avisadoUmbralEn: null })).toBe('NORMAL');
  });

  it('sin incluidas está agotada', () => {
    expect(estadoDeFila({ incluidas: 0, consumidas: 0, avisadoUmbralEn: null })).toBe('AGOTADA');
  });
});
