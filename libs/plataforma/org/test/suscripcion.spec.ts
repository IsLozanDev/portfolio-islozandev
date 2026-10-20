import { ValidationError } from '@vitrina/plataforma/kernel';
import { Suscripcion, type DatosSuscripcion, type ProductoCodigo, type UsoActual } from '../src/domain/suscripcion.js';

const ID = '0190a8e0-0000-7000-8000-000000000301';
const TENANT = '0190a8e0-0000-7000-8000-000000000001';
const SIN_USO: UsoActual = { sucursalesActivas: 0, usuariosActivos: 0 };

const datos = (cambios: Partial<DatosSuscripcion> = {}): DatosSuscripcion => ({
  edicion: null,
  plan: 'BASICO',
  estado: 'ACTIVA',
  limiteSucursales: null,
  limiteUsuarios: null,
  vigenteHasta: null,
  ...cambios,
});

const existente = (cambios: Partial<DatosSuscripcion> = {}, producto: ProductoCodigo = 'CLI') =>
  Suscripcion.reconstituir(ID, 2, { tenantId: TENANT, productoCodigo: producto, ...datos(cambios) });

describe('Suscripcion.crear', () => {
  it('TR-CA-015 (parte org): crea DOC en BASICO y levanta suscripcion.cambiada con nueva = true', () => {
    const s = Suscripcion.crear(ID, TENANT, 'DOC', datos({ estado: 'PRUEBA', vigenteHasta: '2026-12-31' }), SIN_USO);

    expect(s.vigente).toBe(true);
    expect(s.pullEvents()).toEqual([
      expect.objectContaining({
        eventType: 'suscripcion.cambiada',
        aggregateType: 'suscripcion',
        aggregateVersion: 1,
        payload: {
          producto_codigo: 'DOC',
          plan: 'BASICO',
          estado: 'PRUEBA',
          limite_sucursales: null,
          limite_usuarios: null,
          vigente_hasta: '2026-12-31',
          nueva: true,
        },
      }),
    ]);
  });

  it('rechaza un producto desconocido', () => {
    expect(() => Suscripcion.crear(ID, TENANT, 'XXX' as ProductoCodigo, datos(), SIN_USO)).toThrow(ValidationError);
  });

  it('no se crea en VENCIDA', () => {
    expect(() => Suscripcion.crear(ID, TENANT, 'REST', datos({ estado: 'VENCIDA' }), SIN_USO)).toThrow(
      new ValidationError('El estado VENCIDA lo asigna solo el control diario de vencimientos'),
    );
  });
});

describe('Suscripcion.cambiar', () => {
  it('TR-CA-013: BASICO → PRO con 5 sucursales', () => {
    const s = existente();
    s.cambiar(datos({ plan: 'PRO', limiteSucursales: 5 }), { sucursalesActivas: 1, usuariosActivos: 3 });

    expect(s.datos).toMatchObject({ plan: 'PRO', limiteSucursales: 5 });
    expect(s.version).toBe(3);
    expect(s.pullEvents()).toEqual([
      expect.objectContaining({ eventType: 'suscripcion.cambiada', payload: expect.objectContaining({ plan: 'PRO', nueva: false }) }),
    ]);
  });

  it('TR-CA-014: límite de usuarios menor que los activos se rechaza', () => {
    const s = existente({}, 'GYM');
    expect(() => s.cambiar(datos({ limiteUsuarios: 10 }), { sucursalesActivas: 1, usuariosActivos: 12 })).toThrow(
      new ValidationError('Hay 12 usuarios activos; el límite no puede ser menor'),
    );
    expect(s.datos.limiteUsuarios).toBeNull();
    expect(s.pullEvents()).toEqual([]);
  });

  it('límite de sucursales menor que las activas se rechaza', () => {
    expect(() => existente().cambiar(datos({ limiteSucursales: 2 }), { sucursalesActivas: 3, usuariosActivos: 0 })).toThrow(
      new ValidationError('Hay 3 sucursales activas; el límite no puede ser menor'),
    );
  });

  it('límite igual al uso actual se acepta', () => {
    const s = existente();
    s.cambiar(datos({ limiteSucursales: 3, limiteUsuarios: 12 }), { sucursalesActivas: 3, usuariosActivos: 12 });
    expect(s.datos).toMatchObject({ limiteSucursales: 3, limiteUsuarios: 12 });
  });

  it.each([0, -1, 2.5])('rechaza el límite %s', (limite) => {
    expect(() => existente().cambiar(datos({ limiteSucursales: limite }), SIN_USO)).toThrow(
      new ValidationError('Los límites deben ser enteros mayores o iguales a 1'),
    );
  });

  it('pasar a VENCIDA a mano se rechaza', () => {
    expect(() => existente().cambiar(datos({ estado: 'VENCIDA' }), SIN_USO)).toThrow(ValidationError);
  });

  it('una suscripción ya VENCIDA admite otros cambios sin salir de VENCIDA', () => {
    const s = existente({ estado: 'VENCIDA' });
    s.cambiar(datos({ estado: 'VENCIDA', plan: 'PRO' }), SIN_USO);
    expect(s.datos).toMatchObject({ estado: 'VENCIDA', plan: 'PRO' });
    expect(s.vigente).toBe(false);
  });

  it('CANCELADA deja de ser vigente', () => {
    const s = existente();
    s.cambiar(datos({ estado: 'CANCELADA' }), SIN_USO);
    expect(s.vigente).toBe(false);
  });

  it.each(['2026-02-30', '2026-13-01', '31/12/2026', '2026-1-1'])('rechaza vigente_hasta «%s»', (fecha) => {
    expect(() => existente().cambiar(datos({ vigenteHasta: fecha }), SIN_USO)).toThrow(ValidationError);
  });

  it('normaliza la edición vacía a null y rechaza más de 30 caracteres', () => {
    const s = existente();
    s.cambiar(datos({ edicion: '  ' }), SIN_USO);
    expect(s.datos.edicion).toBeNull();
    expect(() => s.cambiar(datos({ edicion: 'x'.repeat(31) }), SIN_USO)).toThrow(ValidationError);
  });

  it.each([
    ['plan', { plan: 'GOLD' }],
    ['estado', { estado: 'ACTIVO' }],
  ])('rechaza un %s desconocido', (_campo, cambio) => {
    expect(() => existente().cambiar(datos(cambio as Partial<DatosSuscripcion>), SIN_USO)).toThrow(ValidationError);
  });
});
