import { ConflictError, ValidationError } from '@vitrina/plataforma/kernel';
import { ESTADOS_TENANT, TRANSICIONES, Tenant, type EstadoTenant } from '../src/domain/tenant.js';

const ID = '0190a8e0-0000-7000-8000-000000000001';
const MOTIVO = 'Deuda de 60 días';
const FECHA = new Date('2026-11-20T15:00:00Z');

const enEstado = (estado: EstadoTenant) =>
  Tenant.reconstituir(ID, 3, {
    codigo: 'gym-fuerza-total',
    nombre: 'Gym Fuerza Total',
    estado,
    estadoMotivo: null,
    estadoCambiadoEn: null,
    bajaEn: estado === 'BAJA' ? FECHA : null,
  });

describe('Tenant.crear', () => {
  it('crea en PRUEBA y levanta tenant.creado', () => {
    const tenant = Tenant.crear({ id: ID, codigo: 'polleria-dona-rosa', nombre: ' Pollería Doña Rosa ', estado: 'PRUEBA' });

    expect(tenant.estado).toBe('PRUEBA');
    expect(tenant.nombre).toBe('Pollería Doña Rosa');
    expect(tenant.version).toBe(1);
    const [evento] = tenant.pullEvents();
    expect(evento).toMatchObject({
      eventType: 'tenant.creado',
      aggregateType: 'tenant',
      aggregateId: ID,
      aggregateVersion: 1,
      payload: { codigo: 'polleria-dona-rosa', nombre: 'Pollería Doña Rosa', estado: 'PRUEBA' },
    });
  });

  it.each(['Polleria', 'ab', 'con espacio', '-inicio', 'fin-', 'doble--guion', 'a'.repeat(31)])('rechaza el código «%s»', (codigo) => {
    expect(() => Tenant.crear({ id: ID, codigo, nombre: 'Nombre válido', estado: 'ACTIVO' })).toThrow(ValidationError);
  });

  it.each(['ab', 'x'.repeat(151), '   '])('rechaza el nombre «%s»', (nombre) => {
    expect(() => Tenant.crear({ id: ID, codigo: 'valido', nombre, estado: 'ACTIVO' })).toThrow(ValidationError);
  });
});

describe('Tenant.cambiarEstado', () => {
  it('TR-CA-016: ACTIVO → SUSPENDIDO guarda motivo y levanta tenant.suspendido', () => {
    const tenant = enEstado('ACTIVO');
    const cambio = tenant.cambiarEstado('SUSPENDIDO', MOTIVO, FECHA);

    expect(cambio).toEqual({ estadoAnterior: 'ACTIVO', estadoNuevo: 'SUSPENDIDO', motivo: MOTIVO, fechaEfectiva: FECHA });
    expect(tenant.estado).toBe('SUSPENDIDO');
    expect(tenant.estadoMotivo).toBe(MOTIVO);
    expect(tenant.estadoCambiadoEn).toBe(FECHA);
    expect(tenant.version).toBe(4);
    expect(tenant.pullEvents()).toEqual([
      expect.objectContaining({
        eventType: 'tenant.suspendido',
        aggregateVersion: 4,
        payload: { estado_anterior: 'ACTIVO', motivo: MOTIVO, fecha_efectiva: FECHA.toISOString() },
      }),
    ]);
  });

  it('TR-CA-017: BAJA → ACTIVO se rechaza con el mensaje del SRS', () => {
    const tenant = enEstado('BAJA');
    expect(() => tenant.cambiarEstado('ACTIVO', MOTIVO, FECHA)).toThrow(
      new ConflictError('Un tenant dado de baja no puede reactivarse; cree uno nuevo o restaure desde respaldo'),
    );
    expect(tenant.estado).toBe('BAJA');
  });

  it.each(['', '   ', 'Deuda', 'x'.repeat(501)])('TR-CA-018: rechaza el motivo «%s» sin cambiar el estado', (motivo) => {
    const tenant = enEstado('ACTIVO');
    expect(() => tenant.cambiarEstado('SUSPENDIDO', motivo, FECHA)).toThrow(ValidationError);
    expect(tenant.estado).toBe('ACTIVO');
    expect(tenant.pullEvents()).toEqual([]);
  });

  const pares = ESTADOS_TENANT.flatMap((de) => ESTADOS_TENANT.filter((a) => a !== de).map((a) => [de, a] as const));

  it.each(pares.filter(([de, a]) => TRANSICIONES[de].includes(a)))('permite %s → %s', (de, a) => {
    const tenant = enEstado(de);
    expect(tenant.cambiarEstado(a, MOTIVO, FECHA)).not.toBeNull();
    expect(tenant.estado).toBe(a);
  });

  it.each(pares.filter(([de, a]) => !TRANSICIONES[de].includes(a)))('rechaza %s → %s', (de, a) => {
    const tenant = enEstado(de);
    expect(() => tenant.cambiarEstado(a, MOTIVO, FECHA)).toThrow(ConflictError);
    expect(tenant.estado).toBe(de);
  });

  it.each([
    ['PRUEBA', 'ACTIVO', 'tenant.reactivado'],
    ['SUSPENDIDO', 'ACTIVO', 'tenant.reactivado'],
    ['ACTIVO', 'BAJA', 'tenant.dado_de_baja'],
  ] as const)('%s → %s levanta %s', (de, a, evento) => {
    const tenant = enEstado(de);
    tenant.cambiarEstado(a, MOTIVO, FECHA);
    expect(tenant.pullEvents().map((e) => e.eventType)).toEqual([evento]);
  });

  it('pasar a BAJA fija baja_en', () => {
    const tenant = enEstado('SUSPENDIDO');
    tenant.cambiarEstado('BAJA', 'Cliente cerró el negocio', FECHA);
    expect(tenant.bajaEn).toBe(FECHA);
  });

  it('salir de SUSPENDIDO deja baja_en nulo', () => {
    const tenant = enEstado('SUSPENDIDO');
    tenant.cambiarEstado('ACTIVO', 'Deuda pagada en su totalidad', FECHA);
    expect(tenant.bajaEn).toBeNull();
  });

  it('cambiar al estado actual es un no-op: sin cambio, sin evento, sin versión nueva', () => {
    const tenant = enEstado('SUSPENDIDO');
    expect(tenant.cambiarEstado('SUSPENDIDO', '', FECHA)).toBeNull();
    expect(tenant.version).toBe(3);
    expect(tenant.pullEvents()).toEqual([]);
  });
});

describe('Tenant: guardas de estado', () => {
  it.each(['PRUEBA', 'ACTIVO'] as const)('exigirOperativo pasa en %s', (estado) => {
    expect(() => enEstado(estado).exigirOperativo()).not.toThrow();
  });

  it.each(['SUSPENDIDO', 'BAJA'] as const)('exigirOperativo falla en %s', (estado) => {
    expect(() => enEstado(estado).exigirOperativo()).toThrow(ConflictError);
  });

  it('exigirNoDadoDeBaja falla solo en BAJA', () => {
    expect(() => enEstado('SUSPENDIDO').exigirNoDadoDeBaja()).not.toThrow();
    expect(() => enEstado('BAJA').exigirNoDadoDeBaja()).toThrow(ConflictError);
  });
});
