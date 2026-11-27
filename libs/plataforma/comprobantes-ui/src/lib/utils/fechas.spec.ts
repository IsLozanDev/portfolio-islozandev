import { formatoFechaCorta, formatoFechaHoraCorta } from './fechas';

describe('fechas', () => {
  it('formatoFechaCorta da dd/mm/aa en hora de Lima', () => {
    expect(formatoFechaCorta('2026-12-13T15:00:00.000Z')).toBe('13/12/26');
    // 02:00 UTC del 14 aún es el 13 en Lima (UTC−5).
    expect(formatoFechaCorta('2026-12-14T02:00:00.000Z')).toBe('13/12/26');
  });

  it('formatoFechaHoraCorta da dd/mm/aa, hh:mm en hora de Lima', () => {
    expect(formatoFechaHoraCorta('2026-11-25T15:43:00.000Z')).toBe('25/11/26, 10:43');
  });
});
