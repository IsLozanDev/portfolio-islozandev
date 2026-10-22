import { ConflictError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import { CrearTenant } from '../src/application/crear-tenant.js';
import { RegistrarEmpresa } from '../src/application/empresa.casos-de-uso.js';
import { RegistrarSucursal } from '../src/application/sucursal.casos-de-uso.js';
import { EditarUnidad, InactivarUnidad, RegistrarUnidad, type RegistrarUnidadComando } from '../src/application/unidad.casos-de-uso.js';
import { PadronRucNulo } from '../src/infrastructure/padron-ruc.nulo.js';
import { datosSucursal } from './support/fabricas.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

describeConDb('Casos de uso de unidad operativa (PostgreSQL 16)', () => {
  let e: Entorno;
  let casos: { registrar: RegistrarUnidad; editar: EditarUnidad; inactivar: InactivarUnidad };

  beforeAll(async () => {
    e = await crearEntorno();
    casos = {
      registrar: new RegistrarUnidad(e.uow, e.contexto, e.eventos, e.repos, e.ids),
      editar: new EditarUnidad(e.uow, e.contexto, e.eventos, e.repos),
      inactivar: new InactivarUnidad(e.uow, e.contexto, e.eventos, e.repos),
    };
  });

  afterAll(() => e?.cerrar());

  /** Tenant ACTIVO con una empresa y la sucursal «Cayma». */
  async function sembrar(codigo: string, ruc = '20512345671') {
    const { tenantId } = await new CrearTenant(e.uow, e.contexto, e.ids, e.eventos, e.repos.tenants).ejecutar({ codigo, nombre: `Tenant ${codigo}`, estado: 'ACTIVO' });
    return e.en(tenantId, async () => {
      const { empresaId } = await new RegistrarEmpresa(e.uow, e.contexto, e.ids, e.eventos, e.repos, new PadronRucNulo()).ejecutar({
        ruc,
        razonSocial: 'Librería Amauta EIRL',
        nombreComercial: null,
        direccionFiscal: null,
        ubigeo: null,
      });
      const { sucursalId } = await new RegistrarSucursal(e.uow, e.contexto, e.eventos, e.repos, e.ids).ejecutar({ empresaId, ...datosSucursal() });
      return { tenantId, empresaId, caymaId: sucursalId };
    });
  }

  const comando = (cambios: Partial<RegistrarUnidadComando> & Pick<RegistrarUnidadComando, 'empresaId'>): RegistrarUnidadComando => ({
    sucursalId: null,
    tipo: 'CAJA',
    padreId: null,
    codigo: 'CAJA-01',
    nombre: 'Caja 1',
    atributos: {},
    ...cambios,
  });
  const unidad = (id: string) =>
    e.dataSource.query('SELECT sucursal_id, empresa_id, padre_id, tipo, activo FROM org.unidad_operativa WHERE id = $1', [id]).then((f) => f[0]);

  it('TR-CA-010: la CAJA «CAJA-01» queda activa en «Cayma»', async () => {
    const { tenantId, empresaId, caymaId } = await sembrar('caja-en-sucursal');
    const { unidadId } = await e.en(tenantId, () => casos.registrar.ejecutar(comando({ empresaId, sucursalId: caymaId, atributos: { impresora: 'EPSON-01' } })));

    expect(await unidad(unidadId)).toMatchObject({ sucursal_id: caymaId, tipo: 'CAJA', activo: true });
    expect(await e.eventosDe(unidadId)).toEqual(['unidad.creada']);
  });

  it('TR-CA-011: un CONSULTORIO sin sucursal se rechaza', async () => {
    const { tenantId, empresaId } = await sembrar('consultorio-sin-sucursal');
    await expect(e.en(tenantId, () => casos.registrar.ejecutar(comando({ empresaId, tipo: 'CONSULTORIO', codigo: 'CONS-01' })))).rejects.toThrow(
      new ValidationError('Solo los almacenes pueden registrarse sin sucursal'),
    );
    const [{ n }] = await e.dataSource.query('SELECT count(*)::int AS n FROM org.unidad_operativa WHERE tenant_id = $1', [tenantId]);
    expect(n).toBe(0);
  });

  it('TR-CA-012: un ALMACEN sin sucursal queda a nivel de empresa', async () => {
    const { tenantId, empresaId } = await sembrar('almacen-central');
    const { unidadId } = await e.en(tenantId, () => casos.registrar.ejecutar(comando({ empresaId, tipo: 'ALMACEN', codigo: 'ALM-CENTRAL', nombre: 'Almacén central' })));
    expect(await unidad(unidadId)).toMatchObject({ sucursal_id: null, empresa_id: empresaId, tipo: 'ALMACEN' });
  });

  it('una unidad repetida en empresa+tipo+código se rechaza', async () => {
    const { tenantId, empresaId, caymaId } = await sembrar('unidad-repetida');
    await e.en(tenantId, () => casos.registrar.ejecutar(comando({ empresaId, sucursalId: caymaId })));
    await expect(e.en(tenantId, () => casos.registrar.ejecutar(comando({ empresaId, sucursalId: caymaId })))).rejects.toThrow(
      new ConflictError('Ya existe una unidad de ese tipo con ese código en la empresa'),
    );
  });

  it('un padre de otra empresa del mismo tenant se rechaza', async () => {
    const { tenantId, empresaId, caymaId } = await sembrar('padre-otra-empresa');
    const otra = await e.en(tenantId, () =>
      new RegistrarEmpresa(e.uow, e.contexto, e.ids, e.eventos, e.repos, new PadronRucNulo()).ejecutar({
        ruc: '20601234565',
        razonSocial: 'Otra SAC',
        nombreComercial: null,
        direccionFiscal: null,
        ubigeo: null,
      }),
    );
    const { unidadId: almacenAjeno } = await e.en(tenantId, () => casos.registrar.ejecutar(comando({ empresaId: otra.empresaId, tipo: 'ALMACEN', codigo: 'ALM' })));

    await expect(e.en(tenantId, () => casos.registrar.ejecutar(comando({ empresaId, sucursalId: caymaId, padreId: almacenAjeno })))).rejects.toThrow(
      new ConflictError('La unidad padre debe ser de la misma empresa'),
    );
  });

  it('editar rechaza un padre que es descendiente de la unidad', async () => {
    const { tenantId, empresaId } = await sembrar('ciclo-unidades');
    const almacen = (codigo: string, padreId: string | null) =>
      e.en(tenantId, () => casos.registrar.ejecutar(comando({ empresaId, tipo: 'ALMACEN', codigo, nombre: `Almacén ${codigo}`, padreId })));
    const { unidadId: a } = await almacen('A', null);
    const { unidadId: b } = await almacen('B', a);
    const { unidadId: c } = await almacen('C', b);

    await expect(e.en(tenantId, () => casos.editar.ejecutar({ unidadId: a, codigo: 'A', nombre: 'Almacén A', atributos: {}, padreId: c }))).rejects.toThrow(
      new ValidationError('La unidad padre no puede ser la propia unidad ni una de sus descendientes'),
    );
    expect(await unidad(a)).toMatchObject({ padre_id: null });
  });

  it('editar cambia datos y padre; inactivar publica unidad.inactivada', async () => {
    const { tenantId, empresaId, caymaId } = await sembrar('editar-unidad');
    const { unidadId: almacenId } = await e.en(tenantId, () => casos.registrar.ejecutar(comando({ empresaId, tipo: 'ALMACEN', codigo: 'ALM' })));
    const { unidadId } = await e.en(tenantId, () => casos.registrar.ejecutar(comando({ empresaId, sucursalId: caymaId })));

    await e.en(tenantId, () => casos.editar.ejecutar({ unidadId, codigo: 'CAJA-01', nombre: 'Caja principal', atributos: { piso: 1 }, padreId: almacenId }));
    await e.en(tenantId, () => casos.inactivar.ejecutar({ unidadId }));

    expect(await unidad(unidadId)).toMatchObject({ padre_id: almacenId, activo: false });
    expect(await e.eventosDe(unidadId)).toEqual(['unidad.creada', 'unidad.actualizada', 'unidad.inactivada']);
  });

  it('una sucursal o unidad de otro tenant no existe para el actor', async () => {
    const a = await sembrar('unidad-tenant-a');
    const b = await sembrar('unidad-tenant-b');
    const { unidadId } = await e.en(a.tenantId, () => casos.registrar.ejecutar(comando({ empresaId: a.empresaId, sucursalId: a.caymaId })));

    await expect(e.en(b.tenantId, () => casos.registrar.ejecutar(comando({ empresaId: b.empresaId, sucursalId: a.caymaId })))).rejects.toThrow(NotFoundError);
    await expect(e.en(b.tenantId, () => casos.inactivar.ejecutar({ unidadId }))).rejects.toThrow(NotFoundError);
  });
});
