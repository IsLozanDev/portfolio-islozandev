import { ConflictError, ValidationError } from '@vitrina/plataforma/kernel';
import {
  PerfilPredefinidoNoEditableError,
  PermisoAjenoAlProductoError,
  ProductoNoContratadoError,
  RolPredefinidoNoEditableError,
} from '../src/domain/errores.js';
import { diferencia } from '../src/domain/eventos.js';
import { Perfil } from '../src/domain/perfil.js';
import { Rol, type PermisoCatalogo, type RolProps } from '../src/domain/rol.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const OTRO_TENANT = '0193f3a0-0000-7000-8000-000000000002';
const ID = '0193f3a0-0000-7000-8000-000000000501';

const permiso = (codigo: string, cambios: Partial<PermisoCatalogo> = {}): PermisoCatalogo => ({
  codigo,
  productoCodigo: codigo.split('.')[0].toUpperCase(),
  alcanceMinimo: 'SUCURSAL',
  sensible: false,
  obsoleto: false,
  ...cambios,
});
const CATALOGO_REST = ['rest.pedido.tomar', 'rest.pedido.anular', 'rest.mesa.ver', 'rest.caja.cerrar'].map((c) => permiso(c));

const rol = (id: string, cambios: Partial<RolProps> = {}): Rol =>
  Rol.reconstituir(id, 1, {
    tenantId: null,
    productoCodigo: 'REST',
    codigo: 'REST_MOZO',
    nombre: 'Mozo',
    activo: true,
    obsoleto: false,
    permisos: ['rest.pedido.tomar', 'rest.pedido.anular', 'rest.mesa.ver'],
    ...cambios,
  });

describe('Rol (TR-RF-011)', () => {
  it('crea un rol activo del tenant con sus permisos ordenados y emite rol.creado', () => {
    const r = Rol.crear(ID, TENANT, 'REST', { codigo: ' MOZO_BARRA ', nombre: 'Mozo de barra' }, ['rest.mesa.ver', 'rest.pedido.tomar'], CATALOGO_REST);

    expect(r.activo).toBe(true);
    expect(r.esPredefinido).toBe(false);
    expect(r.datos).toEqual({ codigo: 'MOZO_BARRA', nombre: 'Mozo de barra' });
    expect(r.pullEvents()).toEqual([
      expect.objectContaining({
        eventType: 'rol.creado',
        aggregateType: 'rol',
        aggregateVersion: 1,
        payload: { producto_codigo: 'REST', codigo: 'MOZO_BARRA', nombre: 'Mozo de barra', copiado_de: null, permisos: ['rest.mesa.ver', 'rest.pedido.tomar'] },
      }),
    ]);
  });

  it('rechaza permisos de otro producto, inexistentes u obsoletos', () => {
    const catalogo = [...CATALOGO_REST, permiso('gym.acceso.registrar'), permiso('rest.retirado.ver', { obsoleto: true })];
    const crear = () =>
      Rol.crear(ID, TENANT, 'REST', { codigo: 'MIXTO', nombre: 'Mixto' }, ['gym.acceso.registrar', 'rest.no.existe', 'rest.retirado.ver', 'rest.mesa.ver'], catalogo);
    expect(crear).toThrow(PermisoAjenoAlProductoError);
    expect(crear).toThrow('gym.acceso.registrar, rest.no.existe, rest.retirado.ver');
  });

  it.each([
    ['código corto', { codigo: 'AB', nombre: 'Nombre' }],
    ['nombre corto', { codigo: 'ABC', nombre: 'No' }],
    ['código largo', { codigo: 'X'.repeat(51), nombre: 'Nombre' }],
  ])('valida longitudes: %s', (_caso, datos) => {
    expect(() => Rol.crear(ID, TENANT, 'REST', datos, [], CATALOGO_REST)).toThrow(ValidationError);
  });

  it('TR-CA-031: copia REST_MOZO como «Mozo terraza» y le quita rest.pedido.anular', () => {
    const predefinido = rol('0193f3a0-0000-7000-8000-00000000f001');
    const copia = Rol.copiarDe(ID, TENANT, predefinido, { codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza' });
    copia.cambiarPermisos(['rest.pedido.tomar', 'rest.mesa.ver'], CATALOGO_REST);

    expect(copia.activo).toBe(true);
    expect(copia.tenantId).toBe(TENANT);
    expect(copia.permisos).toEqual(['rest.mesa.ver', 'rest.pedido.tomar']);
    expect(predefinido.permisos).toContain('rest.pedido.anular');
    expect(copia.pullEvents().map((e) => [e.eventType, e.payload])).toEqual([
      ['rol.creado', expect.objectContaining({ copiado_de: predefinido.id, permisos: ['rest.mesa.ver', 'rest.pedido.anular', 'rest.pedido.tomar'] })],
      ['rol.permisos_cambiados', { agregados: [], quitados: ['rest.pedido.anular'] }],
    ]);
    expect(copia.version).toBe(2);
  });

  it('no copia un rol de otro tenant ni uno inactivo', () => {
    expect(() => Rol.copiarDe(ID, TENANT, rol('r1', { tenantId: OTRO_TENANT }), { codigo: 'COPIA', nombre: 'Copia' })).toThrow(ConflictError);
    expect(() => Rol.copiarDe(ID, TENANT, rol('r2', { obsoleto: true }), { codigo: 'COPIA', nombre: 'Copia' })).toThrow(ConflictError);
  });

  it('TR-CA-032: un rol predefinido no se edita', () => {
    const cajero = rol('r3', { codigo: 'REST_CAJERO', permisos: ['rest.caja.cerrar'] });
    expect(() => cajero.cambiarPermisos([], CATALOGO_REST)).toThrow(new RolPredefinidoNoEditableError());
    expect(() => cajero.cambiarPermisos([], CATALOGO_REST)).toThrow('Los roles predefinidos no se editan; cree una copia');
    expect(() => cajero.inactivar(0)).toThrow(RolPredefinidoNoEditableError);
  });

  it('cambiar a los mismos permisos no emite evento', () => {
    const propio = rol('r4', { tenantId: TENANT });
    propio.cambiarPermisos(['rest.mesa.ver', 'rest.pedido.anular', 'rest.pedido.tomar'], CATALOGO_REST);
    expect(propio.pullEvents()).toEqual([]);
  });

  it('TR-CA-033: inactivar informa los afectados y una segunda vez no hace nada', () => {
    const propio = rol('r5', { tenantId: TENANT, nombre: 'Mozo terraza' });
    propio.inactivar(4);
    propio.inactivar(4);

    expect(propio.activo).toBe(false);
    expect(propio.pullEvents()).toEqual([expect.objectContaining({ eventType: 'rol.inactivado', payload: { afectados: 4 } })]);
  });
});

describe('Perfil (TR-RF-012)', () => {
  const LIB_VENDEDOR = rol('0193f3a0-0000-7000-8000-00000000f101', { productoCodigo: 'LIB', codigo: 'LIB_VENDEDOR' });
  const ECO_GESTOR = rol('0193f3a0-0000-7000-8000-00000000f102', { productoCodigo: 'ECO', codigo: 'ECO_GESTOR_PEDIDOS' });
  const CLI_RECEPCION = rol('0193f3a0-0000-7000-8000-00000000f103', { productoCodigo: 'CLI', codigo: 'CLI_RECEPCION' });
  const PLAT_ADMIN = rol('0193f3a0-0000-7000-8000-00000000f104', { productoCodigo: 'PLAT', codigo: 'PLAT_ADMIN' });

  it('TR-CA-034: «Encargado de tienda» con LIB_VENDEDOR y ECO_GESTOR_PEDIDOS', () => {
    const p = Perfil.crear(ID, TENANT, { codigo: 'ENCARGADO', nombre: 'Encargado de tienda' }, [ECO_GESTOR, LIB_VENDEDOR], ['LIB', 'ECO']);

    expect(p.roles).toEqual([LIB_VENDEDOR.id, ECO_GESTOR.id].sort());
    expect(p.pullEvents()).toEqual([
      expect.objectContaining({
        eventType: 'perfil.creado',
        aggregateType: 'perfil',
        payload: { codigo: 'ENCARGADO', nombre: 'Encargado de tienda', roles: [LIB_VENDEDOR.id, ECO_GESTOR.id].sort() },
      }),
    ]);
  });

  it('TR-CA-035: un rol de producto no contratado se rechaza', () => {
    const crear = () => Perfil.crear(ID, TENANT, { codigo: 'RECEPCION', nombre: 'Recepción' }, [LIB_VENDEDOR, CLI_RECEPCION], ['LIB', 'ECO']);
    expect(crear).toThrow(ProductoNoContratadoError);
    expect(crear).toThrow('CLI');
  });

  it('los roles PLAT no exigen contrato', () => {
    expect(Perfil.crear(ID, TENANT, { codigo: 'ADMIN', nombre: 'Administrador' }, [PLAT_ADMIN], []).roles).toEqual([PLAT_ADMIN.id]);
  });

  it('exige al menos un rol, activo y del tenant o predefinido', () => {
    const crear = (roles: Rol[]) => () => Perfil.crear(ID, TENANT, { codigo: 'VACIO', nombre: 'Vacío' }, roles, ['LIB']);
    expect(crear([])).toThrow(ValidationError);
    expect(crear([rol('x1', { productoCodigo: 'LIB', activo: false })])).toThrow('inactivo');
    expect(crear([rol('x2', { productoCodigo: 'LIB', tenantId: OTRO_TENANT })])).toThrow('no pertenece al tenant');
  });

  it('cambiarRoles emite solo la diferencia y un perfil predefinido no se edita', () => {
    const p = Perfil.reconstituir(ID, 1, { tenantId: TENANT, codigo: 'ENCARGADO', nombre: 'Encargado', roles: [LIB_VENDEDOR.id] });
    p.cambiarRoles([LIB_VENDEDOR], ['LIB', 'ECO']);
    expect(p.pullEvents()).toEqual([]);

    p.cambiarRoles([ECO_GESTOR], ['LIB', 'ECO']);
    expect(p.roles).toEqual([ECO_GESTOR.id]);
    expect(p.pullEvents()).toEqual([
      expect.objectContaining({ eventType: 'perfil.roles_cambiados', payload: { agregados: [ECO_GESTOR.id], quitados: [LIB_VENDEDOR.id] } }),
    ]);

    const predefinido = Perfil.reconstituir('p2', 1, { tenantId: null, codigo: 'CAJERO', nombre: 'Cajero', roles: [] });
    expect(() => predefinido.cambiarRoles([LIB_VENDEDOR], ['LIB'])).toThrow(PerfilPredefinidoNoEditableError);
    expect(predefinido.tenantId).toBeNull();
    expect(predefinido.datos).toEqual({ codigo: 'CAJERO', nombre: 'Cajero' });
  });
});

describe('diferencia', () => {
  it('ordena y no repite', () => {
    expect(diferencia(['b', 'a', 'a'], ['c', 'a'])).toEqual({ agregados: ['c'], quitados: ['b'] });
  });
});
