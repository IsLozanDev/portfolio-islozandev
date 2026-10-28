import type { FiltroMiembros } from '../src/application/ports/lectura-miembros.js';
import { LecturaMiembrosTypeOrm } from '../src/infrastructure/typeorm/lectura-miembros.typeorm.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const HOY = '2026-10-20';
const PRIMERA_PAGINA: FiltroMiembros = { pagina: 1, tamano: 20, orden: 'nombre', direccion: 'asc' };

describeConDb('LecturaMiembros (spec 16a, PostgreSQL 16)', () => {
  let e: Entorno;
  let lectura: LecturaMiembrosTypeOrm;

  const leer = <T>(tenantId: string, trabajo: () => Promise<T>) => e.en(tenantId, () => e.uow.run(trabajo));
  const listar = (tenantId: string, cambios: Partial<FiltroMiembros> = {}) => leer(tenantId, () => lectura.listar({ ...PRIMERA_PAGINA, ...cambios }, HOY));
  const renombrar = (usuarioId: string, nombre: string, correo: string) =>
    e.dataSource.query('UPDATE seg.usuario SET nombre = $2, email = $3 WHERE id = $1', [usuarioId, nombre, correo]);

  beforeAll(async () => {
    e = await crearEntorno();
    lectura = new LecturaMiembrosTypeOrm(e.uow, e.contexto);
    await e.sembrar.permiso('rest.caja.cerrar', { alcanceMinimo: 'UNIDAD' });
    await e.sembrar.permiso('rest.pedido.anular', { alcanceMinimo: 'UNIDAD', sensible: true });
    await e.sembrar.permiso('gym.clase.reservar', { alcanceMinimo: 'UNIDAD' });
    await e.sembrar.permiso('plat.usuario.invitar', { alcanceMinimo: 'SUCURSAL' });
  });

  afterAll(() => e?.cerrar());

  /**
   * Tenant con REST contratado: Ana Torres (propietaria ACTIVO), Luis Paredes (ACTIVO, Cajero en CAJA-02
   * vigente, una vencida, una futura y una revocada), Rosa Huamán (INVITADO con invitación pendiente) y
   * Pedro Salazar (FINALIZADO, con su invitación usada).
   */
  async function sembrarTenant() {
    const tenantId = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenantId, 'REST');
    const organizacion = await e.sembrar.organizacion(tenantId);
    const cajero = await e.sembrar.rol(tenantId, 'REST', 'CAJERO', ['rest.caja.cerrar']);
    const perfilCaja = await e.sembrar.perfil(tenantId, 'CAJA', [cajero]);

    const ana = await e.sembrar.membresia(tenantId, 'ACTIVO', true);
    const luis = await e.sembrar.membresia(tenantId, 'ACTIVO');
    const rosa = await e.sembrar.membresia(tenantId, 'INVITADO');
    const pedro = await e.sembrar.membresia(tenantId, 'FINALIZADO');
    await renombrar(ana.usuarioId, 'Ana Torres', `ana.${tenantId}@prueba.pe`);
    await renombrar(luis.usuarioId, 'Luis Paredes', `luis.${tenantId}@prueba.pe`);
    await renombrar(rosa.usuarioId, 'Rosa Huamán', `rosa.huaman.${tenantId}@gmail.com`);
    await renombrar(pedro.usuarioId, 'Pedro Salazar', `pedro_100%.${tenantId}@outlook.com`);

    const enCaja02 = { alcance: 'UNIDAD' as const, unidadId: organizacion.cajas[0] };
    const vigente = await e.sembrar.asignacion(tenantId, luis.membresiaId, { rolId: cajero }, { desde: '2026-10-15', hasta: '2026-10-31' }, enCaja02);
    const vencida = await e.sembrar.asignacion(tenantId, luis.membresiaId, { rolId: cajero }, { desde: '2026-09-01', hasta: '2026-09-30' });
    const futura = await e.sembrar.asignacion(
      tenantId,
      luis.membresiaId,
      { perfilId: perfilCaja },
      { desde: '2026-11-01', hasta: null },
      { alcance: 'SUCURSAL', sucursalId: organizacion.sucursales[0] },
    );
    const revocada = await e.sembrar.asignacion(tenantId, luis.membresiaId, { rolId: cajero }, { desde: '2026-10-01', hasta: null });
    await e.dataSource.query("UPDATE seg.asignacion SET revocada_en = now(), revocada_por = $2, motivo_revocacion = 'Cese' WHERE id = $1", [revocada, ana.usuarioId]);
    await e.sembrar.asignacion(tenantId, rosa.membresiaId, { rolId: cajero }, { desde: '2026-10-20', hasta: null }, enCaja02);

    const expiraRosa = new Date('2026-10-23T15:00:00Z');
    await e.sembrar.invitacion(tenantId, rosa.membresiaId, ana.usuarioId, expiraRosa);
    const invitacionPedro = await e.sembrar.invitacion(tenantId, pedro.membresiaId, ana.usuarioId);
    await e.dataSource.query('UPDATE seg.invitacion SET usada_en = now() WHERE id = $1', [invitacionPedro]);

    return { tenantId, organizacion, cajero, perfilCaja, ana, luis, rosa, pedro, expiraRosa, asignaciones: { vigente, vencida, futura, revocada } };
  }

  it('pagina por nombre con total, cuenta asignaciones vigentes y trae la invitación pendiente', async () => {
    const t = await sembrarTenant();

    const todos = await listar(t.tenantId);
    expect(todos.total).toBe(4);
    expect(todos.items.map((miembro) => miembro.nombre)).toEqual(['Ana Torres', 'Luis Paredes', 'Pedro Salazar', 'Rosa Huamán']);
    expect(todos.items[1]).toEqual({
      membresiaId: t.luis.membresiaId,
      usuarioId: t.luis.usuarioId,
      nombre: 'Luis Paredes',
      correo: `luis.${t.tenantId}@prueba.pe`,
      estado: 'ACTIVO',
      esPropietario: false,
      asignacionesVigentes: 1,
      invitacionExpiraEn: null,
    });
    expect(todos.items[0]).toMatchObject({ esPropietario: true, asignacionesVigentes: 0 });
    expect(todos.items[3]).toMatchObject({ estado: 'INVITADO', asignacionesVigentes: 1, invitacionExpiraEn: t.expiraRosa });
    expect(todos.items[2]).toMatchObject({ estado: 'FINALIZADO', invitacionExpiraEn: null });

    const segunda = await listar(t.tenantId, { pagina: 2, tamano: 3 });
    expect(segunda).toEqual({ items: [expect.objectContaining({ nombre: 'Rosa Huamán' })], total: 4 });
  });

  it('ordena por nombre, correo o estado en las dos direcciones', async () => {
    const t = await sembrarTenant();
    const nombres = async (cambios: Partial<FiltroMiembros>) => (await listar(t.tenantId, cambios)).items.map((miembro) => miembro.nombre);

    expect(await nombres({ direccion: 'desc' })).toEqual(['Rosa Huamán', 'Pedro Salazar', 'Luis Paredes', 'Ana Torres']);
    expect(await nombres({ orden: 'correo' })).toEqual(['Ana Torres', 'Luis Paredes', 'Pedro Salazar', 'Rosa Huamán']);
    const porEstado = (await listar(t.tenantId, { orden: 'estado' })).items.map((miembro) => miembro.estado);
    expect(porEstado).toEqual(['ACTIVO', 'ACTIVO', 'FINALIZADO', 'INVITADO']);
    const porEstadoDesc = (await listar(t.tenantId, { orden: 'estado', direccion: 'desc' })).items.map((miembro) => miembro.estado);
    expect(porEstadoDesc).toEqual(['INVITADO', 'FINALIZADO', 'ACTIVO', 'ACTIVO']);
  });

  it('filtra por estado y busca por parte del nombre o del correo sin distinguir mayúsculas', async () => {
    const t = await sembrarTenant();

    expect((await listar(t.tenantId, { estado: 'INVITADO' })).items.map((miembro) => miembro.nombre)).toEqual(['Rosa Huamán']);
    expect((await listar(t.tenantId, { busqueda: 'PARED' })).items.map((miembro) => miembro.nombre)).toEqual(['Luis Paredes']);
    expect((await listar(t.tenantId, { busqueda: 'gmail.COM' })).items.map((miembro) => miembro.nombre)).toEqual(['Rosa Huamán']);
    expect((await listar(t.tenantId, { busqueda: 'a', estado: 'ACTIVO' })).total).toBe(2);
  });

  it('los comodines de LIKE en la búsqueda se buscan literales', async () => {
    const t = await sembrarTenant();

    expect((await listar(t.tenantId, { busqueda: '100%' })).items.map((miembro) => miembro.nombre)).toEqual(['Pedro Salazar']);
    expect((await listar(t.tenantId, { busqueda: '%' })).total).toBe(1);
    expect((await listar(t.tenantId, { busqueda: 'o_1' })).total).toBe(1);
    expect((await listar(t.tenantId, { busqueda: 'a_t' })).total).toBe(0);
  });

  it('el detalle trae las asignaciones con estado, nombres y orden', async () => {
    const t = await sembrarTenant();

    const detalle = await leer(t.tenantId, () => lectura.detalle(t.luis.membresiaId, HOY));
    expect(detalle).toMatchObject({ membresiaId: t.luis.membresiaId, nombre: 'Luis Paredes', asignacionesVigentes: 1, desde: expect.any(Date), hasta: null });
    expect(detalle?.asignaciones.map((asignacion) => [asignacion.id, asignacion.estado])).toEqual([
      [t.asignaciones.vigente, 'VIGENTE'],
      [t.asignaciones.futura, 'FUTURA'],
      [t.asignaciones.vencida, 'VENCIDA'],
      [t.asignaciones.revocada, 'REVOCADA'],
    ]);
    expect(detalle?.asignaciones[0]).toEqual({
      id: t.asignaciones.vigente,
      rol: { id: t.cajero, nombre: 'CAJERO' },
      perfil: null,
      alcance: 'UNIDAD',
      empresa: null,
      sucursal: null,
      unidad: { id: t.organizacion.cajas[0], nombre: 'Caja 02' },
      vigenteDesde: '2026-10-15',
      vigenteHasta: '2026-10-31',
      estado: 'VIGENTE',
      revocadaEn: null,
      motivoRevocacion: null,
    });
    expect(detalle?.asignaciones[1]).toMatchObject({ rol: null, perfil: { id: t.perfilCaja, nombre: 'CAJA' }, sucursal: { id: t.organizacion.sucursales[0], nombre: 'Miraflores' } });
    expect(detalle?.asignaciones[3]).toMatchObject({ revocadaEn: expect.any(Date), motivoRevocacion: 'Cese' });

    const finalizado = await leer(t.tenantId, () => lectura.detalle(t.pedro.membresiaId, HOY));
    expect(finalizado).toMatchObject({ estado: 'FINALIZADO', hasta: expect.any(Date), asignaciones: [] });
  });

  it('el tenant B no ve miembros ni detalle de A (TR-RNF-010)', async () => {
    const a = await sembrarTenant();
    const b = await sembrarTenant();

    const deB = await listar(b.tenantId);
    expect(deB.total).toBe(4);
    expect(deB.items.map((miembro) => miembro.membresiaId)).not.toContain(a.luis.membresiaId);
    expect((await listar(b.tenantId, { busqueda: a.tenantId })).total).toBe(0);
    await expect(leer(b.tenantId, () => lectura.detalle(a.luis.membresiaId, HOY))).resolves.toBeNull();
    await expect(leer(a.tenantId, () => lectura.detalle('0193f3a0-0000-7000-8000-00000000dead', HOY))).resolves.toBeNull();
  });

  it('asignables: roles activos de productos contratados, perfiles con alguno de ellos y la marca sensible', async () => {
    const t = await sembrarTenant();
    const supervisor = await e.sembrar.rol(t.tenantId, 'REST', 'SUPERVISOR', ['rest.pedido.anular']);
    const inactivo = await e.sembrar.rol(t.tenantId, 'REST', 'ANTIGUO', ['rest.caja.cerrar']);
    await e.dataSource.query('UPDATE seg.rol SET activo = false WHERE id = $1', [inactivo]);
    const instructor = await e.sembrar.rol(t.tenantId, 'GYM', 'INSTRUCTOR', ['gym.clase.reservar']);
    const predefinido = await e.sembrar.rol(null, 'REST', 'MOZO_PREDEFINIDO', ['rest.caja.cerrar']);
    const perfilMixto = await e.sembrar.perfil(t.tenantId, 'TURNO', [t.cajero, supervisor]);
    await e.sembrar.perfil(t.tenantId, 'GIMNASIO', [instructor]);

    const asignables = await leer(t.tenantId, () => lectura.asignables(['REST']));
    expect(asignables.roles).toEqual([
      { id: t.cajero, codigo: 'CAJERO', nombre: 'CAJERO', productoCodigo: 'REST', sensible: false },
      { id: predefinido, codigo: 'MOZO_PREDEFINIDO', nombre: 'MOZO_PREDEFINIDO', productoCodigo: 'REST', sensible: false },
      { id: supervisor, codigo: 'SUPERVISOR', nombre: 'SUPERVISOR', productoCodigo: 'REST', sensible: true },
    ]);
    expect(asignables.perfiles).toEqual([
      { id: t.perfilCaja, codigo: 'CAJA', nombre: 'CAJA', sensible: false },
      { id: perfilMixto, codigo: 'TURNO', nombre: 'TURNO', sensible: true },
    ]);
    await expect(leer(t.tenantId, () => lectura.asignables([]))).resolves.toEqual({ roles: [], perfiles: [] });
  });
});
