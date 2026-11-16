import { esPeriodoActual, etiquetaPeriodo, periodoActual, periodosSeleccionables } from './periodo';

describe('periodo', () => {
  it('a las 23:30 de Lima del 30 de noviembre sigue siendo noviembre aunque en UTC ya sea diciembre', () => {
    expect(periodoActual(new Date('2026-12-01T04:30:00Z'))).toBe('2026-11');
  });

  it('a medianoche de Lima del 1 de diciembre ya es diciembre', () => {
    expect(periodoActual(new Date('2026-12-01T05:00:00Z'))).toBe('2026-12');
  });

  it('ofrece el mes actual y los 11 anteriores, de más nuevo a más viejo, cruzando el año', () => {
    const periodos = periodosSeleccionables(new Date('2026-11-16T15:00:00Z'));

    expect(periodos).toHaveLength(12);
    expect(periodos[0]).toBe('2026-11');
    expect(periodos[10]).toBe('2026-01');
    expect(periodos[11]).toBe('2025-12');
  });

  it('enero ofrece desde febrero del año anterior', () => {
    expect(periodosSeleccionables(new Date('2027-01-10T15:00:00Z')).at(-1)).toBe('2026-02');
  });

  it('etiqueta el periodo con el mes en español y el año', () => {
    expect(etiquetaPeriodo('2026-11')).toBe('noviembre 2026');
    expect(etiquetaPeriodo('2026-01')).toBe('enero 2026');
  });

  it('esPeriodoActual compara con el mes de Lima', () => {
    const ahora = new Date('2026-12-01T04:30:00Z');

    expect(esPeriodoActual('2026-11', ahora)).toBe(true);
    expect(esPeriodoActual('2026-12', ahora)).toBe(false);
  });
});
