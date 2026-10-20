import { ConflictError, ValidationError } from '@vitrina/plataforma/kernel';
import { UnidadOperativa, type DatosUnidad, type TipoUnidad } from '../src/domain/unidad-operativa.js';
import { EMPRESA, empresa, sucursal } from './support/fabricas.js';

const ID = '0190a8e0-0000-7000-8000-000000000201';
const CAYMA = '0190a8e0-0000-7000-8000-000000000c02';

const datos = (cambios: Partial<DatosUnidad> = {}): DatosUnidad => ({ codigo: 'CAJA-01', nombre: 'Caja 1', atributos: {}, ...cambios });
const almacen = (id: string, empresaId = EMPRESA) =>
  UnidadOperativa.reconstituir(id, 1, {
    tenantId: 't',
    empresaId,
    sucursalId: null,
    tipo: 'ALMACEN',
    padreId: null,
    activo: true,
    ...datos({ codigo: 'ALM', nombre: 'Almacén central' }),
  });

describe('UnidadOperativa.crear (TR-RN-004)', () => {
  it('TR-CA-010: CAJA-01 queda activa en «Cayma»', () => {
    const u = UnidadOperativa.crear(ID, empresa(), sucursal(CAYMA), 'CAJA', datos({ atributos: { impresora: 'EPSON-01' } }), null);

    expect(u.activo).toBe(true);
    expect(u.sucursalId).toBe(CAYMA);
    expect(u.datos.atributos).toEqual({ impresora: 'EPSON-01' });
    expect(u.pullEvents()).toEqual([
      expect.objectContaining({
        eventType: 'unidad.creada',
        aggregateType: 'unidad',
        payload: { empresa_id: EMPRESA, sucursal_id: CAYMA, tipo: 'CAJA', codigo: 'CAJA-01' },
      }),
    ]);
  });

  it('TR-CA-011: un CONSULTORIO sin sucursal se rechaza', () => {
    expect(() => UnidadOperativa.crear(ID, empresa(), null, 'CONSULTORIO', datos(), null)).toThrow(
      new ValidationError('Solo los almacenes pueden registrarse sin sucursal'),
    );
  });

  it('TR-CA-012: un ALMACEN sin sucursal queda a nivel de empresa', () => {
    const u = UnidadOperativa.crear(ID, empresa(), null, 'ALMACEN', datos({ codigo: 'ALM-CENTRAL' }), null);
    expect(u.sucursalId).toBeNull();
    expect(u.empresaId).toBe(EMPRESA);
  });

  it('acepta un padre de la misma empresa', () => {
    const u = UnidadOperativa.crear(ID, empresa(), sucursal(CAYMA), 'ALMACEN', datos({ codigo: 'SUB-01' }), almacen('0190a8e0-0000-7000-8000-000000000a01'));
    expect(u.padreId).toBe('0190a8e0-0000-7000-8000-000000000a01');
  });

  it('rechaza un padre de otra empresa', () => {
    expect(() => UnidadOperativa.crear(ID, empresa(), sucursal(CAYMA), 'CAJA', datos(), almacen('0190a8e0-0000-7000-8000-000000000a02', 'otra'))).toThrow(
      new ConflictError('La unidad padre debe ser de la misma empresa'),
    );
  });

  it.each([
    ['sucursal de otra empresa', () => sucursal(CAYMA, { empresaId: 'otra' })],
    ['sucursal inactiva', () => sucursal(CAYMA, { activo: false })],
  ])('rechaza una %s', (_caso, s) => {
    expect(() => UnidadOperativa.crear(ID, empresa(), s(), 'CAJA', datos(), null)).toThrow(ConflictError);
  });

  it('rechaza una empresa inactiva', () => {
    expect(() => UnidadOperativa.crear(ID, empresa({ activo: false }), null, 'ALMACEN', datos(), null)).toThrow(ConflictError);
  });

  it.each([
    ['tipo desconocido', 'BODEGA' as TipoUnidad, datos()],
    ['código vacío', 'CAJA' as TipoUnidad, datos({ codigo: '' })],
    ['nombre corto', 'CAJA' as TipoUnidad, datos({ nombre: 'C1' })],
    ['atributos como lista', 'CAJA' as TipoUnidad, datos({ atributos: [] as unknown as Record<string, unknown> })],
  ])('rechaza %s', (_caso, tipo, d) => {
    expect(() => UnidadOperativa.crear(ID, empresa(), sucursal(CAYMA), tipo, d, null)).toThrow(ValidationError);
  });
});

describe('UnidadOperativa: editar, inactivar y reactivar', () => {
  it('editar cambia datos y padre y levanta unidad.actualizada', () => {
    const u = almacen(ID);
    const padre = almacen('0190a8e0-0000-7000-8000-000000000a01');
    u.editar(datos({ codigo: 'ALM-2', nombre: 'Almacén 2', atributos: { piso: 2 } }), padre);

    expect(u.datos).toEqual({ codigo: 'ALM-2', nombre: 'Almacén 2', atributos: { piso: 2 } });
    expect(u.padreId).toBe(padre.id);
    expect(u.pullEvents().map((e) => e.eventType)).toEqual(['unidad.actualizada']);
  });

  it('una unidad no puede ser su propio padre', () => {
    const u = almacen(ID);
    expect(() => u.editar(datos(), u)).toThrow(ValidationError);
  });

  it('inactivar y reactivar son idempotentes', () => {
    const u = almacen(ID);
    u.inactivar();
    u.inactivar();
    expect(u.activo).toBe(false);
    u.reactivar();
    u.reactivar();
    expect(u.activo).toBe(true);
    expect(u.pullEvents().map((e) => e.eventType)).toEqual(['unidad.inactivada', 'unidad.actualizada']);
  });
});
