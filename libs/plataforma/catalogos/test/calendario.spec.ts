import { esBisiesto, esDiaHabil, sumarDiasCalendario, sumarDiasHabiles } from '../src/domain/feriados/calendario.js';
import { FeriadoInvalidoError } from '../src/domain/feriados/errores.js';

const ANGAMOS = new Set(['2026-10-08']);
const FIESTAS_PATRIAS = new Set(['2026-07-28', '2026-07-29']);
const SIN_FERIADOS = new Set<string>();

describe('sumarDiasHabiles (TR-RF-029)', () => {
  it('TR-CA-075: desde el miércoles 2026-10-07, 3 días con feriado el 08 y sábado hábil dan 2026-10-12', () => {
    expect(sumarDiasHabiles('2026-10-07', 3, ANGAMOS, true)).toBe('2026-10-12');
  });

  it('con sábado no hábil, el mismo caso da 2026-10-13', () => {
    expect(sumarDiasHabiles('2026-10-07', 3, ANGAMOS, false)).toBe('2026-10-13');
  });

  it('n = 0 en un día hábil devuelve la misma fecha', () => {
    expect(sumarDiasHabiles('2026-10-07', 0, ANGAMOS, true)).toBe('2026-10-07');
  });

  it('n = 0 en un domingo devuelve el lunes', () => {
    expect(sumarDiasHabiles('2026-10-11', 0, SIN_FERIADOS, true)).toBe('2026-10-12');
  });

  it('n = 0 en un feriado salta al siguiente hábil', () => {
    expect(sumarDiasHabiles('2026-10-08', 0, ANGAMOS, true)).toBe('2026-10-09');
  });

  it('un tramo con varios feriados seguidos se salta entero', () => {
    const semanaDeFeriados = new Set(['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25']);
    // Viernes 18 -> sábado 19, lunes 21-viernes 25 feriados, sábado 26 y lunes 28.
    expect(sumarDiasHabiles('2026-12-18', 3, semanaDeFeriados, true)).toBe('2026-12-28');
  });

  it('el domingo nunca cuenta, aunque el sábado sea hábil', () => {
    expect(sumarDiasHabiles('2026-10-09', 2, SIN_FERIADOS, true)).toBe('2026-10-12');
  });

  it('cruza fin de mes y de año', () => {
    expect(sumarDiasHabiles('2026-12-31', 1, new Set(['2027-01-01']), true)).toBe('2027-01-02');
  });

  it('acepta el tope de 366 días', () => {
    expect(sumarDiasHabiles('2026-01-01', 366, SIN_FERIADOS, true)).toBe('2027-03-04');
  });

  it.each([-1, 367, 1.5, Number.NaN])('n = %p lanza FeriadoInvalidoError', (dias) => {
    expect(() => sumarDiasHabiles('2026-10-07', dias, SIN_FERIADOS, true)).toThrow(
      new FeriadoInvalidoError('Los días hábiles deben estar entre 0 y 366'),
    );
  });

  it('una fecha inválida lanza FeriadoInvalidoError', () => {
    expect(() => sumarDiasHabiles('2026-02-30', 1, SIN_FERIADOS, true)).toThrow(
      new FeriadoInvalidoError('La fecha no es válida'),
    );
  });
});

describe('esDiaHabil', () => {
  it('Fiestas Patrias no es hábil y el día anterior sí', () => {
    expect(esDiaHabil('2026-07-28', FIESTAS_PATRIAS, true)).toBe(false);
    expect(esDiaHabil('2026-07-27', FIESTAS_PATRIAS, true)).toBe(true);
  });

  it('el sábado depende del parámetro y el domingo nunca es hábil', () => {
    expect(esDiaHabil('2026-10-10', SIN_FERIADOS, true)).toBe(true);
    expect(esDiaHabil('2026-10-10', SIN_FERIADOS, false)).toBe(false);
    expect(esDiaHabil('2026-10-11', SIN_FERIADOS, true)).toBe(false);
  });

  it('una fecha inválida lanza FeriadoInvalidoError', () => {
    expect(() => esDiaHabil('2026-13-01', SIN_FERIADOS, true)).toThrow(FeriadoInvalidoError);
  });
});

describe('utilidades de fechas', () => {
  it('sumarDiasCalendario cruza meses bisiestos', () => {
    expect(sumarDiasCalendario('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDiasCalendario('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('esBisiesto sigue la regla gregoriana', () => {
    expect([2028, 2027, 2100, 2000].map(esBisiesto)).toEqual([true, false, false, true]);
  });
});
