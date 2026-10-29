import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { LecturaRolesTypeOrm } from '../src/infrastructure/typeorm/lectura-roles.typeorm.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

describeConDb('LecturaRoles (spec 16b, PostgreSQL 16)', () => {
  let e: Entorno;
  let lectura: LecturaRolesTypeOrm;
  let tenant: string;
  let otroTenant: string;
  let REST_MOZO: string;
  let mozoTerraza: string;
  let cajeroInactivo: string;
  let ajeno: string;

  const leer = <T>(tenantId: string, trabajo: () => Promise<T>) => e.en(tenantId, () => e.uow.run(trabajo));

  const sembrarModulo = async (producto: string, codigo: string, orden: number, obsoleto = false) => {
    const id = uuidV7();
    await e.dataSource.query('INSERT INTO seg.modulo (id, producto_codigo, codigo, nombre, orden, obsoleto) VALUES ($1, $2, $3, $3, $4, $5)', [
      id,
      producto,
      codigo,
      orden,
      obsoleto,
    ]);
    return id;
  };

  const sembrarOpcion = async (moduloId: string, codigo: string, orden: number, permisos: string[], obsoleto = false) => {
    const id = uuidV7();
    await e.dataSource.query('INSERT INTO seg.opcion (id, modulo_id, codigo, nombre, orden, obsoleto) VALUES ($1, $2, $3, $3, $4, $5)', [
      id,
      moduloId,
      codigo,
      orden,
      obsoleto,
    ]);
    await e.dataSource.query('INSERT INTO seg.opcion_permiso (opcion_id, permiso_codigo) SELECT $1, unnest($2::varchar[])', [id, permisos]);
  };

  beforeAll(async () => {
    e = await crearEntorno();
    lectura = new LecturaRolesTypeOrm(e.uow, e.contexto);
    for (const permiso of ['rest.pedido.tomar', 'rest.pedido.anular', 'rest.mesa.ver', 'rest.caja.cerrar', 'rest.reporte.ver', 'rest.carta.ver', 'gym.acceso.registrar']) {
      await e.sembrar.permiso(permiso);
    }
    await e.sembrar.permiso('rest.pedido.descontar', { sensible: true, alcanceMinimo: 'SUCURSAL' });
    await e.sembrar.permiso('rest.retirado.ver', { obsoleto: true });

    tenant = await e.sembrar.tenant();
    otroTenant = await e.sembrar.tenant();
    REST_MOZO = await e.sembrar.rol(null, 'REST', 'REST_MOZO', ['rest.pedido.tomar', 'rest.pedido.anular', 'rest.mesa.ver']);
    const inactivoPredefinido = await e.sembrar.rol(null, 'REST', 'REST_VIEJO', ['rest.mesa.ver']);
    const obsoletoPredefinido = await e.sembrar.rol(null, 'REST', 'REST_RETIRADO', []);
    await e.dataSource.query('UPDATE seg.rol SET activo = false WHERE id = $1', [inactivoPredefinido]);
    await e.dataSource.query('UPDATE seg.rol SET obsoleto = true WHERE id = $1', [obsoletoPredefinido]);
    await e.sembrar.rol(null, 'GYM', 'GYM_RECEPCION', ['gym.acceso.registrar']);
    mozoTerraza = await e.sembrar.rol(tenant, 'REST', 'MOZO_TERRAZA', ['rest.pedido.tomar', 'rest.mesa.ver']);
    cajeroInactivo = await e.sembrar.rol(tenant, 'REST', 'CAJERO_NOCHE', ['rest.caja.cerrar']);
    await e.dataSource.query('UPDATE seg.rol SET activo = false WHERE id = $1', [cajeroInactivo]);
    ajeno = await e.sembrar.rol(otroTenant, 'REST', 'AJENO', ['rest.mesa.ver']);

    const salon = await sembrarModulo('REST', 'salon', 1);
    const caja = await sembrarModulo('REST', 'caja', 2);
    const retirado = await sembrarModulo('REST', 'retirado', 3, true);
    await sembrarOpcion(salon, 'rest.salon.pedidos', 1, ['rest.pedido.tomar', 'rest.pedido.anular', 'rest.pedido.descontar', 'rest.retirado.ver']);
    await sembrarOpcion(salon, 'rest.salon.mesas', 2, ['rest.mesa.ver', 'rest.pedido.tomar']);
    await sembrarOpcion(caja, 'rest.caja.cierre', 1, ['rest.caja.cerrar']);
    await sembrarOpcion(caja, 'rest.caja.vieja', 2, ['rest.reporte.ver'], true);
    await sembrarOpcion(retirado, 'rest.retirado.carta', 1, ['rest.carta.ver']);
  });

  afterAll(() => e?.cerrar());

  describe('listar', () => {
    it('trae propios activos e inactivos y predefinidos activos de los productos pedidos, por producto y nombre', async () => {
      const roles = await leer(tenant, () => lectura.listar(['REST']));

      expect(roles.map((rol) => [rol.codigo, rol.predefinido, rol.activo, rol.totalPermisos])).toEqual([
        ['CAJERO_NOCHE', false, false, 1],
        ['MOZO_TERRAZA', false, true, 2],
        ['REST_MOZO', true, true, 3],
      ]);
      expect(roles[0]).toMatchObject({ id: cajeroInactivo, productoCodigo: 'REST', productoNombre: 'REST' });
    });

    it('no trae roles de otro tenant ni de productos no pedidos', async () => {
      const roles = await leer(tenant, () => lectura.listar(['REST', 'GYM']));
      const ids = roles.map((rol) => rol.id);

      expect(ids).not.toContain(ajeno);
      expect(roles.map((rol) => rol.codigo)).toContain('GYM_RECEPCION');
      expect(await leer(otroTenant, () => lectura.listar(['REST']))).toEqual([
        expect.objectContaining({ id: ajeno }),
        expect.objectContaining({ id: REST_MOZO }),
      ]);
    });

    it('sin productos devuelve una lista vacía', async () => {
      expect(await leer(tenant, () => lectura.listar([]))).toEqual([]);
    });
  });

  describe('detalle', () => {
    it('un rol propio trae sus permisos ordenados', async () => {
      expect(await leer(tenant, () => lectura.detalle(mozoTerraza))).toEqual({
        id: mozoTerraza,
        codigo: 'MOZO_TERRAZA',
        nombre: 'MOZO_TERRAZA',
        productoCodigo: 'REST',
        productoNombre: 'REST',
        predefinido: false,
        activo: true,
        permisos: ['rest.mesa.ver', 'rest.pedido.tomar'],
      });
    });

    it('un predefinido se ve desde cualquier tenant', async () => {
      expect(await leer(otroTenant, () => lectura.detalle(REST_MOZO))).toMatchObject({ predefinido: true, permisos: ['rest.mesa.ver', 'rest.pedido.anular', 'rest.pedido.tomar'] });
    });

    it('un rol de otro tenant devuelve null', async () => {
      expect(await leer(tenant, () => lectura.detalle(ajeno))).toBeNull();
    });
  });

  describe('catalogo', () => {
    it('trae una fila por par permiso-opción, sin obsoletos, y nulos cuando no hay opción ni módulo vigente', async () => {
      const filas = await leer(tenant, () => lectura.catalogo('REST'));
      const pares = filas.map((fila) => [fila.permiso.codigo, fila.opcion?.codigo ?? null, fila.modulo?.codigo ?? null]);

      expect(pares).toEqual(
        expect.arrayContaining([
          ['rest.pedido.tomar', 'rest.salon.pedidos', 'salon'],
          ['rest.pedido.tomar', 'rest.salon.mesas', 'salon'],
          ['rest.caja.cerrar', 'rest.caja.cierre', 'caja'],
          ['rest.reporte.ver', null, null],
          ['rest.carta.ver', null, null],
        ]),
      );
      expect(pares).toHaveLength(8);
      expect(pares.map(([permiso]) => permiso)).not.toContain('rest.retirado.ver');
      expect(pares.map(([permiso]) => permiso)).not.toContain('gym.acceso.registrar');
    });

    it('trae descripción, sensibilidad, alcance mínimo y el orden del menú', async () => {
      const filas = await leer(tenant, () => lectura.catalogo('REST'));
      const descontar = filas.find((fila) => fila.permiso.codigo === 'rest.pedido.descontar');

      expect(descontar).toEqual({
        permiso: { codigo: 'rest.pedido.descontar', descripcion: 'rest.pedido.descontar', sensible: true, alcanceMinimo: 'SUCURSAL' },
        modulo: { codigo: 'salon', nombre: 'salon', orden: 1 },
        opcion: { codigo: 'rest.salon.pedidos', nombre: 'rest.salon.pedidos', orden: 1 },
      });
    });
  });

  it('productos devuelve código y nombre de los pedidos', async () => {
    expect(await leer(tenant, () => lectura.productos(['REST', 'PLAT']))).toEqual([
      { codigo: 'PLAT', nombre: 'PLAT' },
      { codigo: 'REST', nombre: 'REST' },
    ]);
  });
});
