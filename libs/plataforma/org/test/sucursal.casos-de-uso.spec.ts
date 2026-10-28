import { ConflictError, NotFoundError } from '@vitrina/plataforma/kernel';
import { CrearTenant } from '../src/application/crear-tenant.js';
import { RegistrarEmpresa } from '../src/application/empresa.casos-de-uso.js';
import { EditarSucursal, InactivarSucursal, MarcarSucursalPrincipal, RegistrarSucursal } from '../src/application/sucursal.casos-de-uso.js';
import { Suscripcion } from '../src/domain/suscripcion.js';
import { PadronRucNulo } from '../src/infrastructure/padron-ruc.nulo.js';
import { datosSucursal } from './support/fabricas.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

describeConDb('Casos de uso de sucursal (PostgreSQL 16)', () => {
  let e: Entorno;
  let casos: {
    registrar: RegistrarSucursal;
    editar: EditarSucursal;
    inactivar: InactivarSucursal;
    marcarPrincipal: MarcarSucursalPrincipal;
  };

  beforeAll(async () => {
    e = await crearEntorno();
    casos = {
      registrar: new RegistrarSucursal(e.uow, e.contexto, e.eventos, e.repos, e.ids),
      editar: new EditarSucursal(e.uow, e.contexto, e.eventos, e.repos),
      inactivar: new InactivarSucursal(e.uow, e.contexto, e.eventos, e.repos),
      marcarPrincipal: new MarcarSucursalPrincipal(e.uow, e.contexto, e.eventos, e.repos),
    };
  });

  afterAll(() => e?.cerrar());

  /** Tenant ACTIVO con «Sabores del Sur SAC», su principal «Centro» y una suscripción REST con el tope dado. */
  async function sembrar(codigo: string, limiteSucursales: number | null) {
    const { tenantId } = await new CrearTenant(e.uow, e.contexto, e.ids, e.eventos, e.repos.tenants).ejecutar({ codigo, nombre: `Tenant ${codigo}`, estado: 'ACTIVO' });
    return e.en(tenantId, async () => {
      await e.uow.run(() =>
        e.repos.suscripciones.guardar(
          Suscripcion.crear(e.ids.next(), tenantId, 'REST', { edicion: null, plan: 'BASICO', estado: 'ACTIVA', limiteSucursales, limiteUsuarios: null, vigenteHasta: null }, { sucursalesActivas: 0, usuariosActivos: 0 }),
        ),
      );
      const { empresaId, sucursalPrincipalId } = await new RegistrarEmpresa(e.uow, e.contexto, e.ids, e.eventos, e.repos, new PadronRucNulo()).ejecutar({
        ruc: '20512345671',
        razonSocial: 'Sabores del Sur SAC',
        nombreComercial: null,
        direccionFiscal: null,
        ubigeo: '040101',
      });
      await casos.editar.ejecutar({ sucursalId: sucursalPrincipalId, version: await e.versionDe('sucursal', sucursalPrincipalId), ...datosSucursal({ codigo: 'CENTRO', nombre: 'Centro', codigoEstablecimientoSunat: '0000' }) });
      return { tenantId, empresaId, centroId: sucursalPrincipalId };
    });
  }

  const sucursal = (id: string) =>
    e.dataSource.query('SELECT nombre, es_principal, activo, codigo_establecimiento_sunat AS est FROM org.sucursal WHERE id = $1', [id]).then((f) => f[0]);

  it('TR-CA-007: con 1 sucursal y un plan que permite 3, «Cayma» con 0002 y 040103 queda activa', async () => {
    const { tenantId, empresaId } = await sembrar('nueva-sucursal', 3);
    const { sucursalId } = await e.en(tenantId, () => casos.registrar.ejecutar({ empresaId, ...datosSucursal() }));

    expect(await sucursal(sucursalId)).toEqual({ nombre: 'Cayma', es_principal: false, activo: true, est: '0002' });
    expect(await e.eventosDe(sucursalId)).toEqual(['sucursal.creada']);
  });

  it('TR-CA-008: con límite 2 y 2 sucursales activas la tercera se rechaza', async () => {
    const { tenantId, empresaId } = await sembrar('limite-sucursales', 2);
    await e.en(tenantId, () => casos.registrar.ejecutar({ empresaId, ...datosSucursal() }));

    await expect(
      e.en(tenantId, () => casos.registrar.ejecutar({ empresaId, ...datosSucursal({ codigo: 'YANAHUARA', nombre: 'Yanahuara', codigoEstablecimientoSunat: '0003' }) })),
    ).rejects.toThrow(new ConflictError('Su plan permite 2 sucursales; amplíe su plan'));
    const [{ n }] = await e.dataSource.query('SELECT count(*)::int AS n FROM org.sucursal WHERE tenant_id = $1', [tenantId]);
    expect(n).toBe(2);
  });

  it('TR-CA-009: marcar «Cayma» como principal le traslada la marca y el 0000 y se los quita a «Centro»', async () => {
    const { tenantId, empresaId, centroId } = await sembrar('traslado-principal', null);
    const { sucursalId: caymaId } = await e.en(tenantId, () => casos.registrar.ejecutar({ empresaId, ...datosSucursal() }));

    await e.en(tenantId, () => casos.marcarPrincipal.ejecutar({ sucursalId: caymaId }));

    expect(await sucursal(caymaId)).toMatchObject({ nombre: 'Cayma', es_principal: true, est: '0000' });
    expect(await sucursal(centroId)).toMatchObject({ nombre: 'Centro', es_principal: false, est: null });
    const [{ n }] = await e.dataSource.query('SELECT count(*)::int AS n FROM org.sucursal WHERE empresa_id = $1 AND es_principal', [empresaId]);
    expect(n).toBe(1);
    expect(await e.eventosDe(caymaId)).toEqual(['sucursal.creada', 'sucursal.actualizada']);
  });

  it('marcar la que ya es principal no cambia nada', async () => {
    const { tenantId, centroId } = await sembrar('ya-principal', null);
    const antes = await e.eventosDe(centroId);
    await e.en(tenantId, () => casos.marcarPrincipal.ejecutar({ sucursalId: centroId }));
    expect(await e.eventosDe(centroId)).toEqual(antes);
  });

  it('inactivar la principal se rechaza; inactivar otra publica sucursal.inactivada', async () => {
    const { tenantId, empresaId, centroId } = await sembrar('inactivar', null);
    const { sucursalId } = await e.en(tenantId, () => casos.registrar.ejecutar({ empresaId, ...datosSucursal() }));

    await expect(e.en(tenantId, () => casos.inactivar.ejecutar({ sucursalId: centroId }))).rejects.toThrow(
      new ConflictError('Marque otra sucursal como principal antes de inactivar esta'),
    );
    await e.en(tenantId, () => casos.inactivar.ejecutar({ sucursalId }));
    expect(await sucursal(sucursalId)).toMatchObject({ activo: false });
    expect(await e.eventosDe(sucursalId)).toEqual(['sucursal.creada', 'sucursal.inactivada']);
  });

  it('reactivar por EditarSucursal vuelve a exigir cupo', async () => {
    const { tenantId, empresaId } = await sembrar('reactivar', 2);
    const { sucursalId: cayma } = await e.en(tenantId, () => casos.registrar.ejecutar({ empresaId, ...datosSucursal() }));
    await e.en(tenantId, () => casos.inactivar.ejecutar({ sucursalId: cayma }));
    await e.en(tenantId, () => casos.registrar.ejecutar({ empresaId, ...datosSucursal({ codigo: 'YANAHUARA', nombre: 'Yanahuara', codigoEstablecimientoSunat: '0003' }) }));

    const version = await e.versionDe('sucursal', cayma);
    await expect(e.en(tenantId, () => casos.editar.ejecutar({ sucursalId: cayma, version, ...datosSucursal(), activo: true }))).rejects.toThrow(
      new ConflictError('Su plan permite 2 sucursales; amplíe su plan'),
    );
    expect(await sucursal(cayma)).toMatchObject({ activo: false });
  });

  it('un código repetido en la empresa se rechaza sin dejar la fila', async () => {
    const { tenantId, empresaId } = await sembrar('codigo-repetido', null);
    await e.en(tenantId, () => casos.registrar.ejecutar({ empresaId, ...datosSucursal() }));
    await expect(
      e.en(tenantId, () => casos.registrar.ejecutar({ empresaId, ...datosSucursal({ nombre: 'Cayma bis', codigoEstablecimientoSunat: '0004' }) })),
    ).rejects.toThrow(new ConflictError('Ya existe una sucursal con ese código en la empresa'));
  });

  it('una sucursal de otro tenant no existe para el actor', async () => {
    const a = await sembrar('sucursal-tenant-a', null);
    const b = await sembrar('sucursal-tenant-b', null);
    await expect(e.en(b.tenantId, () => casos.inactivar.ejecutar({ sucursalId: a.centroId }))).rejects.toThrow(NotFoundError);
    await expect(e.en(b.tenantId, () => casos.registrar.ejecutar({ empresaId: a.empresaId, ...datosSucursal() }))).rejects.toThrow(NotFoundError);
  });
});
