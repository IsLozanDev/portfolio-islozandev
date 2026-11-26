import { avisoVencimiento, diasParaVencer, porVencer } from './vencimiento-certificado';

/** 10:00 en Lima. */
const HOY = new Date('2026-11-25T15:00:00.000Z');
/** Medianoche de Lima del día N desde hoy. */
const medianocheLimaEnDias = (dias: number) => new Date(Date.UTC(2026, 10, 25 + dias, 5)).toISOString();

describe('vencimiento del certificado', () => {
  it('vence en 30 días avisa; en 31 no', () => {
    expect(diasParaVencer(medianocheLimaEnDias(30), HOY)).toBe(30);
    expect(porVencer(medianocheLimaEnDias(30), HOY)).toBe(true);
    expect(avisoVencimiento(medianocheLimaEnDias(30), HOY)).toEqual({ texto: 'Vence en 30 días', tono: 'advertencia' });
    expect(porVencer(medianocheLimaEnDias(31), HOY)).toBe(false);
    expect(avisoVencimiento(medianocheLimaEnDias(31), HOY)).toBeNull();
  });

  it('cuenta días de calendario de Lima, no de UTC', () => {
    // 23:30 de Lima del 25 ya es 26 en UTC: sigue siendo hoy.
    expect(diasParaVencer('2026-11-26T04:30:00.000Z', HOY)).toBe(0);
    expect(avisoVencimiento('2026-11-26T04:30:00.000Z', HOY)?.texto).toBe('Vence hoy');
    expect(avisoVencimiento(medianocheLimaEnDias(1), HOY)?.texto).toBe('Vence en 1 día');
  });

  it('ya pasó el instante: «Vencido» en rojo', () => {
    expect(avisoVencimiento('2026-11-25T14:59:59.000Z', HOY)).toEqual({ texto: 'Vencido', tono: 'error' });
    expect(porVencer('2026-01-01T05:00:00.000Z', HOY)).toBe(true);
  });
});
