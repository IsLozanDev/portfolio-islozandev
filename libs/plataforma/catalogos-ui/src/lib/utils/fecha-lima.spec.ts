import { formatearFechaCalendario, hoyEnLima } from './fecha-lima';

describe('hoyEnLima', () => {
  it('usa el día de Lima, no el de UTC', () => {
    expect(hoyEnLima(new Date('2026-11-09T03:30:00Z'))).toBe('2026-11-08');
    expect(hoyEnLima(new Date('2026-11-09T05:30:00Z'))).toBe('2026-11-09');
  });

  it('formatearFechaCalendario pasa YYYY-MM-DD a dd/MM/yyyy', () => {
    expect(formatearFechaCalendario('2027-01-01')).toBe('01/01/2027');
  });
});
