import { LecturaPerfilesTypeOrm } from '../src/infrastructure/typeorm/lectura-perfiles.typeorm.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

describeConDb('LecturaPerfiles (spec 16c, PostgreSQL 16)', () => {
  let e: Entorno;
  let lectura: LecturaPerfilesTypeOrm;
  let tenant: string;
  let otroTenant: string;
  let LIB_VENDEDOR: string;
  let ECO_GESTOR: string;
  let LIB_CAJERO: string;
  let encargado: string;
  let cajaPredefinida: string;
  let ajeno: string;

  const leer = <T>(tenantId: string, trabajo: () => Promise<T>) => e.en(tenantId, () => e.uow.run(trabajo));

  beforeAll(async () => {
    e = await crearEntorno();
    lectura = new LecturaPerfilesTypeOrm(e.uow, e.contexto);
    for (const permiso of ['lib.venta.registrar', 'lib.caja.cerrar', 'eco.pedido.gestionar']) await e.sembrar.permiso(permiso);

    tenant = await e.sembrar.tenant();
    otroTenant = await e.sembrar.tenant();
    LIB_VENDEDOR = await e.sembrar.rol(null, 'LIB', 'LIB_VENDEDOR', ['lib.venta.registrar']);
    LIB_CAJERO = await e.sembrar.rol(null, 'LIB', 'LIB_CAJERO', ['lib.caja.cerrar']);
    ECO_GESTOR = await e.sembrar.rol(null, 'ECO', 'ECO_GESTOR_PEDIDOS', ['eco.pedido.gestionar']);

    encargado = await e.sembrar.perfil(tenant, 'ENCARGADO', [LIB_VENDEDOR, LIB_CAJERO, ECO_GESTOR]);
    cajaPredefinida = await e.sembrar.perfil(null, 'CAJA', [LIB_CAJERO]);
    ajeno = await e.sembrar.perfil(otroTenant, 'AJENO', [LIB_VENDEDOR]);
  });

  afterAll(() => e?.cerrar());

  describe('listar', () => {
    it('trae propios y predefinidos por nombre, con el total de roles y los productos distintos ordenados', async () => {
      expect(await leer(tenant, () => lectura.listar())).toEqual([
        { id: cajaPredefinida, codigo: 'CAJA', nombre: 'CAJA', predefinido: true, totalRoles: 1, productos: ['LIB'] },
        { id: encargado, codigo: 'ENCARGADO', nombre: 'ENCARGADO', predefinido: false, totalRoles: 3, productos: ['ECO', 'LIB'] },
      ]);
    });

    it('no trae perfiles de otro tenant', async () => {
      const ids = (await leer(tenant, () => lectura.listar())).map((perfil) => perfil.id);
      expect(ids).not.toContain(ajeno);
      expect((await leer(otroTenant, () => lectura.listar())).map((perfil) => perfil.id)).toEqual([ajeno, cajaPredefinida]);
    });
  });

  describe('detalle', () => {
    it('un perfil propio trae los ids de sus roles ordenados', async () => {
      const detalle = await leer(tenant, () => lectura.detalle(encargado));
      expect(detalle).toEqual({ id: encargado, codigo: 'ENCARGADO', nombre: 'ENCARGADO', predefinido: false, roles: [LIB_VENDEDOR, LIB_CAJERO, ECO_GESTOR].sort() });
    });

    it('un predefinido se ve desde cualquier tenant', async () => {
      expect(await leer(otroTenant, () => lectura.detalle(cajaPredefinida))).toMatchObject({ predefinido: true });
    });

    it('un perfil de otro tenant devuelve null', async () => {
      expect(await leer(tenant, () => lectura.detalle(ajeno))).toBeNull();
    });
  });
});
