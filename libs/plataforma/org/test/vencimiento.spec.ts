import { diasEntre, fechaCalendarioDe, sumarDias } from '../src/domain/fecha-calendario.js';
import { debeSuspenderse } from '../src/domain/regla-gracia.js';
import { Suscripcion, type EstadoSuscripcion, type ProductoCodigo } from '../src/domain/suscripcion.js';

const TENANT = '0190a8e0-0000-7000-8000-000000000001';
let secuencia = 0;

const suscripcion = (estado: EstadoSuscripcion, vigenteHasta: string | null, producto: ProductoCodigo = 'PSI') =>
  Suscripcion.reconstituir(`0190a8e0-0000-7000-8000-${String(++secuencia).padStart(12, '0')}`, 3, {
    tenantId: TENANT,
    productoCodigo: producto,
    edicion: null,
    plan: 'BASICO',
    estado,
    limiteSucursales: null,
    limiteUsuarios: null,
    vigenteHasta,
  });

describe('Fechas de calendario en Lima', () => {
  it('toma el día de Lima, no el de UTC', () => {
    expect(fechaCalendarioDe(new Date('2026-10-10T04:30:00Z'))).toBe('2026-10-09');
    expect(fechaCalendarioDe(new Date('2026-10-10T05:30:00Z'))).toBe('2026-10-10');
  });

  it('cuenta y suma días cruzando meses', () => {
    expect(diasEntre('2026-10-10', '2026-10-13')).toBe(3);
    expect(diasEntre('2026-10-13', '2026-10-10')).toBe(-3);
    expect(sumarDias('2026-10-25', 15)).toBe('2026-11-09');
  });
});

describe('Suscripcion: avisos de vencimiento', () => {
  it('TR-CA-019: vence el 13/10 y el 10/10 avisa con 3 días', () => {
    const s = suscripcion('PRUEBA', '2026-10-13');

    expect(s.diasParaVencer('2026-10-10')).toBe(3);
    expect(s.avisarVencimiento('2026-10-10')).toBe(3);
    expect(s.pullEvents()).toEqual([
      expect.objectContaining({
        eventType: 'suscripcion.por_vencer',
        aggregateVersion: 4,
        payload: { producto_codigo: 'PSI', vigente_hasta: '2026-10-13', dias_antes: 3 },
      }),
    ]);
  });

  it.each([
    ['7 días', '2026-10-06', 7],
    ['1 día', '2026-10-12', 1],
  ])('avisa a %s', (_caso, fecha, dias) => {
    expect(suscripcion('ACTIVA', '2026-10-13').avisarVencimiento(fecha)).toBe(dias);
  });

  it.each([
    ['el día del vencimiento', 'ACTIVA', '2026-10-13'],
    ['a 2 días', 'ACTIVA', '2026-10-11'],
    ['a 8 días', 'ACTIVA', '2026-10-05'],
    ['una suscripción vencida', 'VENCIDA', '2026-10-10'],
    ['una suscripción cancelada', 'CANCELADA', '2026-10-10'],
  ] as const)('no avisa %s', (_caso, estado, fecha) => {
    const s = suscripcion(estado, '2026-10-13');
    expect(s.avisarVencimiento(fecha)).toBeNull();
    expect(s.pullEvents()).toEqual([]);
  });

  it('sin vigente_hasta no avisa ni vence', () => {
    const s = suscripcion('ACTIVA', null);
    expect(s.diasParaVencer('2026-10-10')).toBeNull();
    expect(s.avisarVencimiento('2026-10-10')).toBeNull();
    expect(s.vencer('2030-01-01')).toBe(false);
  });
});

describe('Suscripcion.vencer', () => {
  it('el día después de vigente_hasta pasa a VENCIDA y levanta suscripcion.vencida', () => {
    const s = suscripcion('PRUEBA', '2026-10-13');

    expect(s.vencer('2026-10-14')).toBe(true);
    expect(s.datos.estado).toBe('VENCIDA');
    expect(s.diasVencida('2026-10-14')).toBe(1);
    expect(s.pullEvents()).toEqual([
      expect.objectContaining({
        eventType: 'suscripcion.vencida',
        aggregateVersion: 4,
        payload: { producto_codigo: 'PSI', vigente_hasta: '2026-10-13', estado_anterior: 'PRUEBA' },
      }),
    ]);
  });

  it('el último día con servicio no vence', () => {
    const s = suscripcion('ACTIVA', '2026-10-13');
    expect(s.vencer('2026-10-13')).toBe(false);
    expect(s.diasVencida('2026-10-13')).toBeNull();
    expect(s.pullEvents()).toEqual([]);
  });

  it('una ya vencida no vuelve a levantar el evento', () => {
    const s = suscripcion('VENCIDA', '2026-10-05');
    expect(s.vencer('2026-10-10')).toBe(false);
    expect(s.pullEvents()).toEqual([]);
  });
});

describe('debeSuspenderse', () => {
  const HOY = '2026-10-10';

  it('TR-CA-020: vencida hace 5 días con gracia de 5 suspende', () => {
    expect(debeSuspenderse([suscripcion('VENCIDA', '2026-10-05')], 5, HOY)).toBe(true);
  });

  it('vencida hace 4 días con gracia de 5 no suspende', () => {
    expect(debeSuspenderse([suscripcion('VENCIDA', '2026-10-06')], 5, HOY)).toBe(false);
  });

  it('con otra suscripción ACTIVA no suspende', () => {
    const suscripciones = [suscripcion('VENCIDA', '2026-09-01'), suscripcion('ACTIVA', '2026-12-31', 'GYM')];
    expect(debeSuspenderse(suscripciones, 5, HOY)).toBe(false);
  });

  it('manda la vencida más reciente', () => {
    const suscripciones = [suscripcion('VENCIDA', '2026-09-01'), suscripcion('VENCIDA', '2026-10-08', 'GYM')];
    expect(debeSuspenderse(suscripciones, 5, HOY)).toBe(false);
  });

  it('todas canceladas o sin suscripciones no suspende', () => {
    expect(debeSuspenderse([suscripcion('CANCELADA', '2026-09-01')], 5, HOY)).toBe(false);
    expect(debeSuspenderse([], 5, HOY)).toBe(false);
  });
});
