import { diaDeLaSemana } from './dia-semana';
import { anioEnLima, fechaDesdeIso, formatearFechaCalendario, isoDesdeFecha } from './fecha';

describe('fechas de feriados', () => {
  it('el año por defecto es el de Lima, no el de UTC', () => {
    expect(anioEnLima(new Date('2027-01-01T03:00:00Z'))).toBe(2026);
    expect(anioEnLima(new Date('2027-01-01T05:00:00Z'))).toBe(2027);
  });

  it('el día de la semana sale en español y no depende de la zona', () => {
    expect(diaDeLaSemana('2027-07-28')).toBe('miércoles');
    expect(diaDeLaSemana('2026-10-08')).toBe('jueves');
    expect(diaDeLaSemana('2026-11-08')).toBe('domingo');
  });

  it('formatea y convierte fechas calendario sin cambiar de día', () => {
    expect(formatearFechaCalendario('2027-07-28')).toBe('28/07/2027');
    expect(isoDesdeFecha(fechaDesdeIso('2026-10-08'))).toBe('2026-10-08');
  });
});
