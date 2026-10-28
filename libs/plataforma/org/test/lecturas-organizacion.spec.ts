import { NotFoundError } from '@vitrina/plataforma/kernel';
import { CrearTenant } from '../src/application/crear-tenant.js';
import { RegistrarEmpresa } from '../src/application/empresa.casos-de-uso.js';
import { ListarEmpresas, ListarSucursales, ListarUnidades } from '../src/application/lecturas-organizacion.js';
import { InactivarSucursal, RegistrarSucursal } from '../src/application/sucursal.casos-de-uso.js';
import { RegistrarUnidad } from '../src/application/unidad.casos-de-uso.js';
import { PadronRucNulo } from '../src/infrastructure/padron-ruc.nulo.js';
import { LecturaOrganizacionTypeOrm } from '../src/infrastructure/typeorm/lectura-organizacion.typeorm.js';
import { datosSucursal } from './support/fabricas.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const PRIMERA_PAGINA = { pagina: 1, tamano: 20 };

describeConDb('Listas de organización (PostgreSQL 16)', () => {
  let e: Entorno;
  let listar: { empresas: ListarEmpresas; sucursales: ListarSucursales; unidades: ListarUnidades };

  beforeAll(async () => {
    e = await crearEntorno();
    const lectura = new LecturaOrganizacionTypeOrm(e.uow, e.contexto);
    listar = {
      empresas: new ListarEmpresas({ unidadDeTrabajo: e.uow, lectura }),
      sucursales: new ListarSucursales({ unidadDeTrabajo: e.uow, lectura, empresas: e.repos.empresas }),
      unidades: new ListarUnidades({ unidadDeTrabajo: e.uow, lectura }),
    };
  });

  afterAll(() => e?.cerrar());

  const registrarEmpresa = (ruc: string, razonSocial: string) =>
    new RegistrarEmpresa(e.uow, e.contexto, e.ids, e.eventos, e.repos, new PadronRucNulo()).ejecutar({
      ruc,
      razonSocial,
      nombreComercial: null,
      direccionFiscal: null,
      ubigeo: null,
    });

  /**
   * Tenant con dos empresas: «Sabores del Sur SAC» (principal, «Cayma» y «Yanahuara» inactiva) y
   * «Amauta EIRL» (principal). Unidades: CAJA-01 y CAJA-02 en Cayma, almacén de empresa ALM.
   */
  async function sembrar(codigo: string) {
    const { tenantId } = await new CrearTenant(e.uow, e.contexto, e.ids, e.eventos, e.repos.tenants).ejecutar({ codigo, nombre: `Tenant ${codigo}`, estado: 'ACTIVO' });
    return e.en(tenantId, async () => {
      const sabores = await registrarEmpresa('20512345671', 'Sabores del Sur SAC');
      const amauta = await registrarEmpresa('20498765433', 'Amauta EIRL');
      const registrarSucursal = new RegistrarSucursal(e.uow, e.contexto, e.eventos, e.repos, e.ids);
      const { sucursalId: caymaId } = await registrarSucursal.ejecutar({ empresaId: sabores.empresaId, ...datosSucursal() });
      const { sucursalId: yanahuaraId } = await registrarSucursal.ejecutar({
        empresaId: sabores.empresaId,
        ...datosSucursal({ codigo: 'YANAHUARA', nombre: 'Yanahuara', codigoEstablecimientoSunat: '0003' }),
      });
      await new InactivarSucursal(e.uow, e.contexto, e.eventos, e.repos).ejecutar({ sucursalId: yanahuaraId });

      const registrarUnidad = new RegistrarUnidad(e.uow, e.contexto, e.eventos, e.repos, e.ids);
      const unidad = { padreId: null, atributos: {} };
      await registrarUnidad.ejecutar({ ...unidad, empresaId: sabores.empresaId, sucursalId: caymaId, tipo: 'CAJA', codigo: 'CAJA-02', nombre: 'Caja 2' });
      await registrarUnidad.ejecutar({ ...unidad, empresaId: sabores.empresaId, sucursalId: caymaId, tipo: 'CAJA', codigo: 'CAJA-01', nombre: 'Caja 1' });
      await registrarUnidad.ejecutar({ ...unidad, empresaId: sabores.empresaId, sucursalId: null, tipo: 'ALMACEN', codigo: 'ALM', nombre: 'Almacén central' });
      return { tenantId, sabores, amauta, caymaId, yanahuaraId };
    });
  }

  it('empresas por razón social, con versión, paginadas y con total', async () => {
    const { tenantId } = await sembrar('listar-empresas');

    const todas = await e.en(tenantId, () => listar.empresas.ejecutar(PRIMERA_PAGINA));
    expect(todas.total).toBe(2);
    expect(todas.items.map((empresa) => empresa.razonSocial)).toEqual(['Amauta EIRL', 'Sabores del Sur SAC']);
    expect(todas.items[0]).toEqual({
      id: expect.any(String),
      ruc: '20498765433',
      razonSocial: 'Amauta EIRL',
      nombreComercial: null,
      direccionFiscal: null,
      ubigeo: null,
      activo: true,
      version: 1,
    });

    const segunda = await e.en(tenantId, () => listar.empresas.ejecutar({ pagina: 2, tamano: 1 }));
    expect(segunda).toEqual({ items: [expect.objectContaining({ razonSocial: 'Sabores del Sur SAC' })], total: 2 });
    expect((await e.en(tenantId, () => listar.empresas.ejecutar({ ...PRIMERA_PAGINA, activo: false }))).total).toBe(0);
  });

  it('sucursales: la principal primero, luego por código, y filtro por activo', async () => {
    const { tenantId, sabores, caymaId, yanahuaraId } = await sembrar('listar-sucursales');

    const todas = await e.en(tenantId, () => listar.sucursales.ejecutar(sabores.empresaId, PRIMERA_PAGINA));
    expect(todas.items.map((sucursal) => sucursal.id)).toEqual([sabores.sucursalPrincipalId, caymaId, yanahuaraId]);
    expect(todas.items[0]).toMatchObject({ esPrincipal: true, codigoEstablecimientoSunat: '0000', zonaHoraria: 'America/Lima' });

    const inactivas = await e.en(tenantId, () => listar.sucursales.ejecutar(sabores.empresaId, { ...PRIMERA_PAGINA, activo: false }));
    expect(inactivas).toEqual({ items: [expect.objectContaining({ id: yanahuaraId, activo: false, version: 2 })], total: 1 });
  });

  it('unidades por tipo y código, con filtros por empresa, sucursal y tipo', async () => {
    const { tenantId, sabores, amauta, caymaId } = await sembrar('listar-unidades');

    const todas = await e.en(tenantId, () => listar.unidades.ejecutar(PRIMERA_PAGINA));
    expect(todas.items.map((unidad) => unidad.codigo)).toEqual(['ALM', 'CAJA-01', 'CAJA-02']);
    expect(todas.items[0]).toMatchObject({ tipo: 'ALMACEN', sucursalId: null, atributos: {}, padreId: null });

    const deCayma = await e.en(tenantId, () => listar.unidades.ejecutar({ ...PRIMERA_PAGINA, sucursalId: caymaId }));
    expect(deCayma.items.map((unidad) => unidad.codigo)).toEqual(['CAJA-01', 'CAJA-02']);
    expect((await e.en(tenantId, () => listar.unidades.ejecutar({ ...PRIMERA_PAGINA, tipo: 'ALMACEN' }))).total).toBe(1);
    expect((await e.en(tenantId, () => listar.unidades.ejecutar({ ...PRIMERA_PAGINA, empresaId: sabores.empresaId }))).total).toBe(3);
    expect((await e.en(tenantId, () => listar.unidades.ejecutar({ ...PRIMERA_PAGINA, empresaId: amauta.empresaId }))).total).toBe(0);
  });

  it('el tenant B no ve nada de A, y una empresa de A en la URL no existe para B', async () => {
    const a = await sembrar('listar-tenant-a');
    const b = await sembrar('listar-tenant-b');

    const empresasDeB = await e.en(b.tenantId, () => listar.empresas.ejecutar(PRIMERA_PAGINA));
    expect(empresasDeB.items.map((empresa) => empresa.id)).toEqual([b.amauta.empresaId, b.sabores.empresaId]);
    const unidadesDeB = await e.en(b.tenantId, () => listar.unidades.ejecutar({ ...PRIMERA_PAGINA, sucursalId: a.caymaId }));
    expect(unidadesDeB).toEqual({ items: [], total: 0 });

    await expect(e.en(b.tenantId, () => listar.sucursales.ejecutar(a.sabores.empresaId, PRIMERA_PAGINA))).rejects.toThrow(
      new NotFoundError('La empresa no existe'),
    );
  });
});
