import { AceptarInvitacion } from '../src/application/aceptar-invitacion.js';
import { InvitarPropietario, ROL_PROPIETARIO, type IdentidadPropietario } from '../src/application/invitar-propietario.js';
import { IdentidadNoDisponibleError } from '../src/domain/errores.js';
import { ProveedorIdentidadFalso } from './support/proveedor-identidad.falso.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const AHORA = new Date('2026-10-25T15:00:00Z');
const RELOJ = { now: () => AHORA };
const URL_INVITACION = 'https://app.vitrina.pe/auth/invitacion';
const PERMISO_DEL_ROL = 'plat.usuario.invitar';
const ROL_ADMIN_TENANTS = 'PLAT_ADMIN_TENANTS';

describeConDb('InvitarPropietario (alta de tenant, spec 12, PostgreSQL 16)', () => {
  let e: Entorno;
  let proveedor: ProveedorIdentidadFalso;
  let operador: string;

  const caso = () => new InvitarPropietario(e.uow, e.contexto, e.ids, RELOJ, e.eventos, e.repos, proveedor, { urlInvitacion: URL_INVITACION, horas: 72 });
  /** Prepara y registra como lo hará el orquestador: identidad antes, registro en la transacción. */
  const invitar = async (tenant: string, correo: string) => {
    const identidad = await e.en(tenant, () => caso().prepararIdentidad(correo, 'Rosa Quispe'));
    const registrado = await e.en(tenant, () => e.uow.run(() => caso().registrar(identidad, operador)));
    return { identidad, registrado };
  };
  const contar = async (sql: string, params: unknown[]) => Number((await e.dataSource.query(sql, params))[0].n);

  beforeAll(async () => {
    e = await crearEntorno();
    await e.sembrar.permiso(PERMISO_DEL_ROL, { alcanceMinimo: 'SUCURSAL' });
    await e.sembrar.rol(null, 'PLAT', ROL_PROPIETARIO, [PERMISO_DEL_ROL]);
    await e.sembrar.rol(null, 'PLAT', ROL_ADMIN_TENANTS, [PERMISO_DEL_ROL]);
    operador = (await e.sembrar.membresia(await e.sembrar.tenant(), 'ACTIVO')).usuarioId;
  });

  beforeEach(() => {
    proveedor = new ProveedorIdentidadFalso(e.dataSource);
  });

  afterAll(() => e?.cerrar());

  it('correo nuevo: crea el usuario INTERNO, la membresía propietaria INVITADO y la asignación PLAT_PROPIETARIO con alcance TENANT', async () => {
    const tenant = await e.sembrar.tenant();

    const { identidad, registrado } = await invitar(tenant, ' Rosa.Quispe@Gmail.com ');

    expect(identidad).toMatchObject({ correo: 'rosa.quispe@gmail.com', usuarioNuevo: true });
    expect(proveedor.llamadas).toEqual([{ tipo: 'invitar', correo: 'rosa.quispe@gmail.com', nombre: 'Rosa Quispe', redirectTo: identidad.redirectTo }]);
    expect(registrado.expiraEn).toEqual(new Date('2026-10-28T15:00:00Z'));

    const [membresia] = await e.dataSource.query(
      'SELECT m.estado, m.es_propietario, m.invitado_por, u.tipo FROM seg.membresia m JOIN seg.usuario u ON u.id = m.usuario_id WHERE m.id = $1',
      [registrado.membresiaId],
    );
    expect(membresia).toEqual({ estado: 'INVITADO', es_propietario: true, invitado_por: operador, tipo: 'INTERNO' });

    const [asignacion] = await e.dataSource.query(
      'SELECT r.codigo, a.alcance, a.otorgado_por FROM seg.asignacion a JOIN seg.rol r ON r.id = a.rol_id WHERE a.membresia_id = $1',
      [registrado.membresiaId],
    );
    expect(asignacion).toEqual({ codigo: ROL_PROPIETARIO, alcance: 'TENANT', otorgado_por: operador });

    expect((await e.eventosDe(registrado.membresiaId)).map(([tipo]) => tipo)).toEqual(['membresia.invitada']);
    expect(await contar(`SELECT count(*) AS n FROM sync.outbox WHERE tenant_id = $1 AND event_type = 'asignacion.otorgada'`, [tenant])).toBe(1);
    await expect(caso().notificar(identidad)).resolves.toEqual({ correoEnviado: true });
    expect(proveedor.llamadas).toHaveLength(1);
  });

  it('correo existente: no crea usuario y notificar envía el enlace', async () => {
    const tenant = await e.sembrar.tenant();
    const otro = await e.sembrar.membresia(await e.sembrar.tenant(), 'ACTIVO');
    await e.dataSource.query('UPDATE seg.usuario SET email = $2 WHERE id = $1', [otro.usuarioId, 'carlos.rojas@outlook.com']);

    const { identidad } = await invitar(tenant, 'carlos.rojas@outlook.com');

    expect(identidad).toMatchObject({ usuarioId: otro.usuarioId, usuarioNuevo: false });
    expect(await contar('SELECT count(*) AS n FROM seg.usuario WHERE email = $1', ['carlos.rojas@outlook.com'])).toBe(1);
    await expect(caso().notificar(identidad)).resolves.toEqual({ correoEnviado: true });
    expect(proveedor.llamadas).toEqual([{ tipo: 'enlace', correo: 'carlos.rojas@outlook.com', redirectTo: identidad.redirectTo }]);

    proveedor.fallar = true;
    await expect(caso().notificar(identidad)).resolves.toEqual({ correoEnviado: false });
  });

  it('Supabase caído: IdentidadNoDisponibleError y nada escrito', async () => {
    const tenant = await e.sembrar.tenant();
    proveedor.fallar = true;

    await expect(e.en(tenant, () => caso().prepararIdentidad('nadie@vitrina.pe', 'Nadie Nadie'))).rejects.toThrow(IdentidadNoDisponibleError);
    expect(await contar('SELECT count(*) AS n FROM seg.usuario WHERE email = $1', ['nadie@vitrina.pe'])).toBe(0);
    expect(await contar('SELECT count(*) AS n FROM seg.membresia WHERE tenant_id = $1', [tenant])).toBe(0);
  });

  it('al aceptar, el propietario queda ACTIVO con los permisos de PLAT_PROPIETARIO', async () => {
    const tenant = await e.sembrar.tenant();
    const { sucursales } = await e.sembrar.organizacion(tenant);
    const { identidad, registrado }: { identidad: IdentidadPropietario; registrado: { membresiaId: string } } = await invitar(tenant, 'duena@vitrina.pe');

    await new AceptarInvitacion(e.uow, e.contexto, RELOJ, e.eventos, e.repos).ejecutar({ token: identidad.token, usuarioId: identidad.usuarioId });

    const [{ estado }] = await e.dataSource.query('SELECT estado FROM seg.membresia WHERE id = $1', [registrado.membresiaId]);
    expect(estado).toBe('ACTIVO');
    const permisos = await e.en(tenant, () =>
      e.uow.run(() => e.uow.manager.query('SELECT permiso_codigo FROM seg.permisos_efectivos($1, $2, $3)', [identidad.usuarioId, tenant, sucursales[0]])),
    );
    expect(permisos.map((fila: { permiso_codigo: string }) => fila.permiso_codigo)).toEqual([PERMISO_DEL_ROL]);
  });

  it('sin el rol PLAT_PROPIETARIO falla y revierte', async () => {
    const tenant = await e.sembrar.tenant();
    await e.dataSource.query(`UPDATE seg.rol SET activo = false WHERE codigo = $1 AND tenant_id IS NULL`, [ROL_PROPIETARIO]);
    try {
      await expect(invitar(tenant, 'sin.rol@vitrina.pe')).rejects.toThrow(`El rol ${ROL_PROPIETARIO} no existe; aplique el manifiesto PLAT`);
      expect(await contar('SELECT count(*) AS n FROM seg.membresia WHERE tenant_id = $1', [tenant])).toBe(0);
    } finally {
      await e.dataSource.query(`UPDATE seg.rol SET activo = true WHERE codigo = $1 AND tenant_id IS NULL`, [ROL_PROPIETARIO]);
    }
  });

  it('roles adicionales: la misma membresía recibe también PLAT_ADMIN_TENANTS con alcance TENANT (CLI del operador)', async () => {
    const tenant = await e.sembrar.tenant();
    const identidad = await e.en(tenant, () => caso().prepararIdentidad('operadora@vitrina.pe', 'Operadora Uno'));

    const registrado = await e.en(tenant, () => e.uow.run(() => caso().registrar(identidad, identidad.usuarioId, [ROL_ADMIN_TENANTS])));

    const roles = await e.dataSource.query(
      'SELECT r.codigo, a.alcance FROM seg.asignacion a JOIN seg.rol r ON r.id = a.rol_id WHERE a.membresia_id = $1 ORDER BY r.codigo',
      [registrado.membresiaId],
    );
    expect(roles).toEqual([
      { codigo: ROL_ADMIN_TENANTS, alcance: 'TENANT' },
      { codigo: ROL_PROPIETARIO, alcance: 'TENANT' },
    ]);
  });

  it('esMiembro: true para un correo con membresía en el tenant del contexto, false en otro tenant o sin usuario', async () => {
    const tenant = await e.sembrar.tenant();
    const otro = await e.sembrar.tenant();
    await invitar(tenant, 'miembro@vitrina.pe');

    expect(await e.en(tenant, () => caso().esMiembro(' Miembro@Vitrina.pe '))).toBe(true);
    expect(await e.en(otro, () => caso().esMiembro('miembro@vitrina.pe'))).toBe(false);
    expect(await e.en(tenant, () => caso().esMiembro('nadie.aqui@vitrina.pe'))).toBe(false);
  });
});
