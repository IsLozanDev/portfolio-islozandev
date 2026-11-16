import { etiquetaPeriodo } from './periodo';

describe('etiquetaPeriodo', () => {
  it('etiqueta el periodo con el mes en español y el año, igual que la consola', () => {
    expect(etiquetaPeriodo('2026-11')).toBe('noviembre 2026');
    expect(etiquetaPeriodo('2026-01')).toBe('enero 2026');
  });
});
