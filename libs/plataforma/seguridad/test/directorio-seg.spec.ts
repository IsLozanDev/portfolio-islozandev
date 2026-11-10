import { AlcanceActorSeg } from '../src/application/alcance-actor.js';
import { DirectorioSegTypeOrm } from '../src/infrastructure/typeorm/directorio-seg.typeorm.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const CONSULTAR_AUDITORIA = 'plat.auditoria.consultar';
const LIMITE_BUSQUEDA = 500;

describeConDb('DirectorioSeg y alcanzaTenant (spec 20b, PostgreSQL 16)', () => {
  let e: Entorno;
  let directorio: DirectorioSegTypeOrm;
  let alcanceActor: AlcanceActorSeg;

  const leer = <T>(tenantId: string, trabajo: () => Promise<T>) => e.en(tenantId, () => e.uow.run(trabajo));
  const renombrar = (usuarioId: string, nombre: string, correo: string) =>
    e.dataSource.query('UPDATE seg.usuario SET nombre = $2, email = $3 WHERE id = $1', [usuarioId, nombre, correo]);

  beforeAll(async () => {
    e = await crearEntorno();
    directorio = new DirectorioSegTypeOrm(e.uow, e.contexto);
    alcanceActor = new AlcanceActorSeg(e.repos);
    await e.sembrar.permiso(CONSULTAR_AUDITORIA, { alcanceMinimo: 'SUCURSAL' });
    await e.sembrar.permiso('plat.sesion.contexto', { alcanceMinimo: 'SUCURSAL' });
  });

  afterAll(() => e?.cerrar());

  async function sembrarTenantConRosa() {
    const tenantId = await e.sembrar.tenant();
    const organizacion = await e.sembrar.organizacion(tenantId);
    const rosa = await e.sembrar.membresia(tenantId, 'ACTIVO');
    const luis = await e.sembrar.membresia(tenantId, 'ACTIVO');
    await renombrar(rosa.usuarioId, 'Rosa Huamán', `rosa.huaman.${tenantId}@gmail.com`);
    await renombrar(luis.usuarioId, 'Luis Paredes', `lparedes.${tenantId}@prueba.pe`);
    return { tenantId, organizacion, rosa, luis };
  }

  it('buscarUsuarios encuentra por parte del correo o del nombre, sin distinguir mayúsculas y solo del tenant', async () => {
    const a = await sembrarTenantConRosa();
    const b = await sembrarTenantConRosa();

    expect(await leer(a.tenantId, () => directorio.buscarUsuarios('ROSA', LIMITE_BUSQUEDA))).toEqual([a.rosa.usuarioId]);
    expect(await leer(a.tenantId, () => directorio.buscarUsuarios('huamán', LIMITE_BUSQUEDA))).toEqual([a.rosa.usuarioId]);
    expect(await leer(a.tenantId, () => directorio.buscarUsuarios('lparedes', LIMITE_BUSQUEDA))).toEqual([a.luis.usuarioId]);
    expect(await leer(b.tenantId, () => directorio.buscarUsuarios('rosa', LIMITE_BUSQUEDA))).toEqual([b.rosa.usuarioId]);
    expect(await leer(a.tenantId, () => directorio.buscarUsuarios('nadie', LIMITE_BUSQUEDA))).toEqual([]);
    // Los comodines de LIKE se buscan literales.
    expect(await leer(a.tenantId, () => directorio.buscarUsuarios('%', LIMITE_BUSQUEDA))).toEqual([]);
    expect(await leer(a.tenantId, () => directorio.buscarUsuarios('.', 1))).toHaveLength(1);
  });

  it('usuarios y sucursales devuelven nombre, correo y código solo del tenant del contexto', async () => {
    const a = await sembrarTenantConRosa();
    const b = await sembrarTenantConRosa();

    const usuarios = await leer(a.tenantId, () => directorio.usuarios([a.rosa.usuarioId, b.rosa.usuarioId]));
    expect(usuarios).toEqual([{ id: a.rosa.usuarioId, nombre: 'Rosa Huamán', correo: `rosa.huaman.${a.tenantId}@gmail.com` }]);

    const [miraflores, surco] = a.organizacion.sucursales;
    const sucursales = await leer(a.tenantId, () => directorio.sucursales([miraflores, surco, b.organizacion.sucursales[0]]));
    expect(sucursales.sort((x, y) => x.codigo.localeCompare(y.codigo))).toEqual([
      { id: miraflores, codigo: 'MIRAFLORES', nombre: 'Miraflores' },
      { id: surco, codigo: 'SURCO', nombre: 'Surco' },
    ]);
    expect(await leer(a.tenantId, () => directorio.usuarios([]))).toEqual([]);
    expect(await leer(a.tenantId, () => directorio.sucursales([]))).toEqual([]);
  });

  it('alcanzaTenant: propietario y asignación TENANT con el permiso sí; SUCURSAL, sin el permiso o vencida no', async () => {
    const tenantId = await e.sembrar.tenant();
    const organizacion = await e.sembrar.organizacion(tenantId);
    const auditor = await e.sembrar.rol(tenantId, 'PLAT', 'AUDITOR', [CONSULTAR_AUDITORIA]);
    const otro = await e.sembrar.rol(tenantId, 'PLAT', 'CONTEXTO', ['plat.sesion.contexto']);
    const perfilControl = await e.sembrar.perfil(tenantId, 'CONTROL', [otro, auditor]);

    const propietaria = await e.sembrar.membresia(tenantId, 'ACTIVO', true);
    const conRol = await e.sembrar.membresia(tenantId, 'ACTIVO');
    const conPerfil = await e.sembrar.membresia(tenantId, 'ACTIVO');
    const deSucursal = await e.sembrar.membresia(tenantId, 'ACTIVO');
    const sinPermiso = await e.sembrar.membresia(tenantId, 'ACTIVO');
    const vencida = await e.sembrar.membresia(tenantId, 'ACTIVO');
    await e.sembrar.asignacion(tenantId, conRol.membresiaId, { rolId: auditor });
    await e.sembrar.asignacion(tenantId, conPerfil.membresiaId, { perfilId: perfilControl });
    await e.sembrar.asignacion(tenantId, deSucursal.membresiaId, { rolId: auditor }, {}, { alcance: 'SUCURSAL', sucursalId: organizacion.sucursales[1] });
    await e.sembrar.asignacion(tenantId, sinPermiso.membresiaId, { rolId: otro });
    await e.sembrar.asignacion(tenantId, vencida.membresiaId, { rolId: auditor }, { desde: '2025-01-01', hasta: '2025-12-31' });

    const alcanza = (usuarioId: string) => leer(tenantId, () => alcanceActor.alcanzaTenant(usuarioId, CONSULTAR_AUDITORIA, new Date()));
    expect(await alcanza(propietaria.usuarioId)).toBe(true);
    expect(await alcanza(conRol.usuarioId)).toBe(true);
    expect(await alcanza(conPerfil.usuarioId)).toBe(true);
    expect(await alcanza(deSucursal.usuarioId)).toBe(false);
    expect(await alcanza(sinPermiso.usuarioId)).toBe(false);
    expect(await alcanza(vencida.usuarioId)).toBe(false);
  });
});
