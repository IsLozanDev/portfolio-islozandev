import { EventoNoFallidoError, IntentosInvalidosError } from '../src/domain/errores.js';
import type { EventoEntregado } from '../src/domain/evento-entregado.js';
import { EventoFallido, LONGITUD_MAXIMA_ERROR, type DatosFallo } from '../src/domain/evento-fallido.js';

const ID = '0193f3a0-0000-7000-8000-0000000000f1';
const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const AHORA = new Date('2026-10-25T15:00:00Z');
const DESPUES = new Date('2026-10-25T16:00:00Z');

const CITA_CREADA: EventoEntregado = {
  eventId: '0193f3a0-0000-7000-8000-0000000000e1',
  seq: '1001',
  tenantId: TENANT,
  sedeId: null,
  aggregateType: 'cita',
  aggregateId: '0193f3a0-0000-7000-8000-0000000000c1',
  eventType: 'cita.creada',
  version: '1',
  origin: 'CLOUD',
  payload: { paciente: 'no debe copiarse' },
  schemaVersion: 1,
  occurredAt: AHORA.toISOString(),
};

const registrar = (cambios: Partial<DatosFallo> = {}): EventoFallido =>
  EventoFallido.registrar({ id: ID, consumidor: 'prueba-a', evento: CITA_CREADA, error: 'boom', intentos: 8, ahora: AHORA, ...cambios });

describe('EventoFallido.registrar (TR-RF-095)', () => {
  test('nace FALLIDO con los datos del evento, sin payload y sin reproceso', () => {
    const fallido = registrar();

    expect(fallido.estado).toBe('FALLIDO');
    expect(fallido.version).toBe(0);
    expect(fallido.tenantId).toBe(TENANT);
    expect(fallido.consumidor).toBe('prueba-a');
    expect(fallido.eventId).toBe(CITA_CREADA.eventId);
    expect(fallido.eventType).toBe('cita.creada');
    expect(fallido.aggregateType).toBe('cita');
    expect(fallido.aggregateId).toBe(CITA_CREADA.aggregateId);
    expect(fallido.intentos).toBe(8);
    expect(fallido.error).toBe('boom');
    expect(fallido.fallidoEn).toEqual(AHORA);
    expect(fallido.reprocesadoPor).toBeNull();
    expect(fallido.reprocesadoEn).toBeNull();
    expect(JSON.stringify(fallido)).not.toContain('no debe copiarse');
  });

  test.each([0, -1, 1.5])('intentos %p lanza IntentosInvalidosError', (intentos) => {
    expect(() => registrar({ intentos })).toThrow(IntentosInvalidosError);
  });

  test(`trunca el error a ${LONGITUD_MAXIMA_ERROR} caracteres`, () => {
    expect(registrar({ error: 'x'.repeat(5000) }).error).toHaveLength(LONGITUD_MAXIMA_ERROR);
  });

  test('trunca por caracteres sin partir un par sustituto', () => {
    const error = Array.from(registrar({ error: '😀'.repeat(LONGITUD_MAXIMA_ERROR + 10) }).error);

    expect(error).toHaveLength(LONGITUD_MAXIMA_ERROR);
    expect(error.every((caracter) => caracter === '😀')).toBe(true);
  });
});

describe('EventoFallido: transiciones', () => {
  test('iniciarReproceso desde FALLIDO deja REPROCESANDO con actor y fecha', () => {
    const fallido = registrar();

    fallido.iniciarReproceso(ANA, DESPUES);

    expect(fallido.estado).toBe('REPROCESANDO');
    expect(fallido.reprocesadoPor).toBe(ANA);
    expect(fallido.reprocesadoEn).toEqual(DESPUES);
  });

  test('iniciarReproceso desde REPROCESANDO lanza EventoNoFallidoError', () => {
    const fallido = registrar();
    fallido.iniciarReproceso(ANA, DESPUES);

    expect(() => fallido.iniciarReproceso(ANA, DESPUES)).toThrow(EventoNoFallidoError);
  });

  test('iniciarReproceso desde PROCESADO lanza EventoNoFallidoError', () => {
    const fallido = registrar();
    fallido.marcarProcesado();

    expect(() => fallido.iniciarReproceso(ANA, DESPUES)).toThrow(EventoNoFallidoError);
  });

  test('marcarProcesado desde FALLIDO o REPROCESANDO devuelve true; desde PROCESADO, false', () => {
    const fallido = registrar();
    expect(fallido.marcarProcesado()).toBe(true);
    expect(fallido.estado).toBe('PROCESADO');
    expect(fallido.marcarProcesado()).toBe(false);

    const enReproceso = registrar();
    enReproceso.iniciarReproceso(ANA, DESPUES);
    expect(enReproceso.marcarProcesado()).toBe(true);
  });

  test('registrarFallo tras un reproceso suma intentos, guarda el último error y vuelve a FALLIDO', () => {
    const fallido = registrar();
    fallido.iniciarReproceso(ANA, DESPUES);

    fallido.registrarFallo('otra vez', 8, DESPUES);

    expect(fallido.estado).toBe('FALLIDO');
    expect(fallido.intentos).toBe(16);
    expect(fallido.error).toBe('otra vez');
    expect(fallido.fallidoEn).toEqual(DESPUES);
    expect(fallido.reprocesadoPor).toBe(ANA);
  });

  test('registrarFallo con intentos inválidos no cambia el estado', () => {
    const fallido = registrar();

    expect(() => fallido.registrarFallo('x', 0, DESPUES)).toThrow(IntentosInvalidosError);
    expect(fallido.intentos).toBe(8);
  });

  test('reconstituir conserva id, versión y estado', () => {
    const original = registrar();
    original.iniciarReproceso(ANA, DESPUES);

    const copia = EventoFallido.reconstituir(ID, 3, {
      tenantId: original.tenantId,
      consumidor: original.consumidor,
      eventId: original.eventId,
      eventType: original.eventType,
      aggregateType: original.aggregateType,
      aggregateId: original.aggregateId,
      error: original.error,
      intentos: original.intentos,
      estado: original.estado,
      fallidoEn: original.fallidoEn,
      reprocesadoPor: original.reprocesadoPor,
      reprocesadoEn: original.reprocesadoEn,
    });

    expect(copia.id).toBe(ID);
    expect(copia.version).toBe(3);
    expect(copia.estado).toBe('REPROCESANDO');
  });
});
