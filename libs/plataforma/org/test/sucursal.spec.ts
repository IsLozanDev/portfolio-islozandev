import { ConflictError, ValidationError } from '@vitrina/plataforma/kernel';
import { exigirCupo, topeSucursales } from '../src/domain/cupo-sucursales.js';
import { Sucursal } from '../src/domain/sucursal.js';
import { Suscripcion, type DatosSuscripcion, type EstadoSuscripcion } from '../src/domain/suscripcion.js';
import { EMPRESA, TENANT, datosSucursal, empresa, sucursal } from './support/fabricas.js';

const ID = '0190a8e0-0000-7000-8000-000000000101';
const SIN_TOPE = { activas: 0, tope: null };

const suscripcion = (limiteSucursales: number | null, estado: EstadoSuscripcion = 'ACTIVA') =>
  Suscripcion.reconstituir(ID, 1, {
    tenantId: TENANT,
    productoCodigo: 'REST',
    ...({ edicion: null, plan: 'BASICO', estado, limiteSucursales, limiteUsuarios: null, vigenteHasta: null } satisfies DatosSuscripcion),
  });

describe('Cupo de sucursales (TR-RN-006)', () => {
  it('el tope es el menor límite entre las suscripciones vigentes', () => {
    expect(topeSucursales([suscripcion(5), suscripcion(2, 'PRUEBA'), suscripcion(1, 'CANCELADA'), suscripcion(null)])).toBe(2);
  });

  it('sin suscripciones vigentes o sin límites no hay tope', () => {
    expect(topeSucursales([])).toBeNull();
    expect(topeSucursales([suscripcion(null), suscripcion(1, 'VENCIDA')])).toBeNull();
  });

  it('TR-CA-008: con tope 2 y 2 activas se rechaza la tercera', () => {
    expect(() => exigirCupo({ activas: 2, tope: 2 })).toThrow(new ConflictError('Su plan permite 2 sucursales; amplíe su plan'));
    expect(() => exigirCupo({ activas: 1, tope: 2 })).not.toThrow();
  });
});

describe('Sucursal.crear', () => {
  it('TR-CA-007: «Cayma» con establecimiento 0002 y ubigeo 040103 queda activa', () => {
    const s = Sucursal.crear(ID, empresa(), datosSucursal(), { activas: 1, tope: 3 });

    expect(s.activo).toBe(true);
    expect(s.esPrincipal).toBe(false);
    expect(s.datos).toMatchObject({ nombre: 'Cayma', codigoEstablecimientoSunat: '0002', ubigeo: '040103' });
    expect(s.pullEvents()).toEqual([
      expect.objectContaining({
        eventType: 'sucursal.creada',
        aggregateType: 'sucursal',
        payload: { empresa_id: EMPRESA, codigo: 'CAYMA', nombre: 'Cayma', es_principal: false, codigo_establecimiento_sunat: '0002' },
      }),
    ]);
  });

  it('TR-CA-008: sin cupo no se crea', () => {
    expect(() => Sucursal.crear(ID, empresa(), datosSucursal(), { activas: 2, tope: 2 })).toThrow(ConflictError);
  });

  it('una sucursal no principal no puede tomar el 0000', () => {
    expect(() => Sucursal.crear(ID, empresa(), datosSucursal({ codigoEstablecimientoSunat: '0000' }), SIN_TOPE)).toThrow(ValidationError);
  });

  it('no se crea en una empresa inactiva', () => {
    expect(() => Sucursal.crear(ID, empresa({ activo: false }), datosSucursal(), SIN_TOPE)).toThrow(ConflictError);
  });

  it.each([
    ['código vacío', { codigo: '' }],
    ['código de 21', { codigo: 'x'.repeat(21) }],
    ['nombre corto', { nombre: 'Ca' }],
    ['establecimiento de 3 dígitos', { codigoEstablecimientoSunat: '002' }],
    ['teléfono de 31', { telefono: '9'.repeat(31) }],
    ['zona horaria inválida', { zonaHoraria: 'America/Arequipa' }],
  ])('rechaza %s', (_caso, cambio) => {
    expect(() => Sucursal.crear(ID, empresa(), datosSucursal(cambio), SIN_TOPE)).toThrow(ValidationError);
  });

  it('acepta otra zona IANA y establecimiento vacío', () => {
    const s = Sucursal.crear(ID, empresa(), datosSucursal({ zonaHoraria: 'America/Bogota', codigoEstablecimientoSunat: null }), SIN_TOPE);
    expect(s.datos).toMatchObject({ zonaHoraria: 'America/Bogota', codigoEstablecimientoSunat: null });
  });
});

describe('Sucursal.crearPrincipal', () => {
  it('nace principal con 0000 y la dirección fiscal de la empresa', () => {
    const s = Sucursal.crearPrincipal(ID, empresa(), SIN_TOPE);

    expect(s.esPrincipal).toBe(true);
    expect(s.datos).toMatchObject({ codigo: 'PRINCIPAL', nombre: 'Principal', codigoEstablecimientoSunat: '0000', direccion: 'Av. Ejército 101', ubigeo: '040101' });
  });

  it('también consume cupo del plan', () => {
    expect(() => Sucursal.crearPrincipal(ID, empresa(), { activas: 2, tope: 2 })).toThrow(ConflictError);
  });
});

describe('Sucursal: principal (TR-RN-003)', () => {
  const centro = () => sucursal('0190a8e0-0000-7000-8000-000000000c01', { esPrincipal: true, codigoEstablecimientoSunat: '0000', nombre: 'Centro' });
  const cayma = () => sucursal('0190a8e0-0000-7000-8000-000000000c02', { codigoEstablecimientoSunat: '0002', nombre: 'Cayma' });

  it('TR-CA-009: trasladar mueve la marca y el 0000; la anterior queda sin establecimiento', () => {
    const desde = centro();
    const hacia = cayma();
    Sucursal.trasladarPrincipal(desde, hacia);

    expect([desde.esPrincipal, hacia.esPrincipal]).toEqual([false, true]);
    expect(hacia.datos.codigoEstablecimientoSunat).toBe('0000');
    expect(desde.datos.codigoEstablecimientoSunat).toBeNull();
    expect(desde.pullEvents().map((e) => e.eventType)).toEqual(['sucursal.actualizada']);
    expect(hacia.pullEvents().map((e) => e.eventType)).toEqual(['sucursal.actualizada']);
  });

  it('trasladar a sí misma no cambia nada', () => {
    const s = centro();
    Sucursal.trasladarPrincipal(s, s);
    expect(s.esPrincipal).toBe(true);
    expect(s.pullEvents()).toEqual([]);
  });

  it.each([
    ['el origen no es principal', () => [cayma(), centro()]],
    ['el destino está inactivo', () => [centro(), sucursal('0190a8e0-0000-7000-8000-000000000c03', { activo: false })]],
    ['el destino es de otra empresa', () => [centro(), sucursal('0190a8e0-0000-7000-8000-000000000c04', { empresaId: 'otra' })]],
  ] as const)('rechaza el traslado si %s', (_caso, par) => {
    const [desde, hacia] = par();
    expect(() => Sucursal.trasladarPrincipal(desde, hacia)).toThrow(ConflictError);
    expect(desde.pullEvents()).toEqual([]);
  });

  it('inactivar la principal se rechaza', () => {
    expect(() => centro().inactivar()).toThrow(new ConflictError('Marque otra sucursal como principal antes de inactivar esta'));
  });

  it('la principal no puede soltar el 0000 al editar', () => {
    expect(() => centro().editar(datosSucursal({ codigoEstablecimientoSunat: '0001' }))).toThrow(ValidationError);
  });

  it('una no principal no puede tomar el 0000 al editar', () => {
    expect(() => cayma().editar(datosSucursal({ codigoEstablecimientoSunat: '0000' }))).toThrow(ValidationError);
  });
});

describe('Sucursal: editar, inactivar y reactivar', () => {
  it('editar levanta sucursal.actualizada', () => {
    const s = sucursal(ID);
    s.editar(datosSucursal({ nombre: 'Cayma Norte' }));
    expect(s.datos.nombre).toBe('Cayma Norte');
    expect(s.pullEvents().map((e) => e.eventType)).toEqual(['sucursal.actualizada']);
  });

  it('inactivar levanta sucursal.inactivada y repetirlo no hace nada', () => {
    const s = sucursal(ID);
    s.inactivar();
    s.inactivar();
    expect(s.activo).toBe(false);
    expect(s.pullEvents().map((e) => e.eventType)).toEqual(['sucursal.inactivada']);
  });

  it('reactivar exige cupo', () => {
    const s = sucursal(ID, { activo: false });
    expect(() => s.reactivar({ activas: 2, tope: 2 })).toThrow(ConflictError);
    s.reactivar({ activas: 1, tope: 2 });
    expect(s.activo).toBe(true);
    s.reactivar({ activas: 2, tope: 2 });
    expect(s.pullEvents().map((e) => e.eventType)).toEqual(['sucursal.actualizada']);
  });
});
