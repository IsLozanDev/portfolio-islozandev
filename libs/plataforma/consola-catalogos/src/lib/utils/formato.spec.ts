import { formatearFechaHora } from './formato';

describe('formatearFechaHora', () => {
  it('da dd/MM/yyyy HH:mm en hora de Lima', () => {
    expect(formatearFechaHora('2026-11-09T15:42:00.000Z')).toBe('09/11/2026 10:42');
    expect(formatearFechaHora('2026-11-09T04:05:00.000Z')).toBe('08/11/2026 23:05');
  });
});
