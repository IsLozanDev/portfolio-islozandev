import { AceptarInvitacion } from '../src/application/aceptar-invitacion.js';
import { InvitarUsuario } from '../src/application/invitar-usuario.js';
import {
  FinalizarMembresia,
  ReactivarMembresia,
  RevocarAsignacion,
  SuspenderMembresia,
  type AccionMembresiaComando,
} from '../src/application/membresia.casos-de-uso.js';
import {
  ActorSinAlcanceError,
  ConfirmacionRequeridaError,
  MotivoInvalidoError,
  PropietarioUnicoError,
  TransicionMembresiaError,
} from '../src/domain/errores.js';
import { ProveedorIdentidadFalso } from './support/proveedor-identidad.falso.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const RELOJ = { now: () => new Date() };

interface Miembro {
  membresiaId: string;
  usuarioId: string;
}

describeConDb('Suspender, reactivar, finalizar y revocar (TR-RF-014, PostgreSQL 16)', () => {
  let e: Entorno;
  let tenant: string;
  let sucursales: [string, string];
  let cajero: string;
  let ana: Miembro;

  const suspender = (c: AccionMembresiaComando, t = tenant) => e.en(t, () => new SuspenderMembresia(e.uow, RELOJ, e.eventos, e.repos).ejecutar(c));
  const reactivar = (c: AccionMembresiaComando) => e.en(tenant, () => new ReactivarMembresia(e.uow, RELOJ, e.eventos, e.repos).ejecutar(c));
  const finalizar = (c: AccionMembresiaComando, t = tenant) => e.en(t, () => new FinalizarMembresia(e.uow, RELOJ, e.eventos, e.repos).ejecutar(c));
  const revocar = (asignacionId: string, actorId: string, motivo = 'Cambio de puesto') =>
    e.en(tenant, () => new RevocarAsignacion(e.uow, RELOJ, e.eventos, e.repos).ejecutar({ asignacionId, motivo, confirmar: true, actorId }));
  const accion = (membresiaId: string, actorId = ana.usuarioId, motivo = 'Cese'): AccionMembresiaComando => ({ membresiaId, motivo, confirmar: true, actorId });

  const permisos = (usuarioId: string, t = tenant, sucursal = sucursales[0]) =>
    e.en(t, () =>
      e.uow.run(async () =>
        (await e.uow.manager.query('SELECT permiso_codigo FROM seg.permisos_efectivos($1, $2, $3)', [usuarioId, t, sucursal])).map(
          (f: { permiso_codigo: string }) => f.permiso_codigo,
        ),
      ),
    );
  const fila = async (membresiaId: string) =>
    (await e.dataSource.query('SELECT estado, hasta, motivo, cambiado_por FROM seg.membresia WHERE id = $1', [membresiaId]))[0];
  const cajeroEn = async (t: string, rol: string, sucursal: string): Promise<Miembro & { asignacionId: string }> => {
    const m = await e.sembrar.membresia(t, 'ACTIVO');
    const asignacionId = await e.sembrar.asignacion(t, m.membresiaId, { rolId: rol }, {}, { alcance: 'SUCURSAL', sucursalId: sucursal });
    return { ...m, asignacionId };
  };

  beforeAll(async () => {
    e = await crearEntorno();
    await e.sembrar.permiso('rest.caja.cerrar', { alcanceMinimo: 'SUCURSAL' });
    await e.sembrar.permiso('rest.mesa.abrir', { alcanceMinimo: 'SUCURSAL' });
    tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST');
    ({ sucursales } = await e.sembrar.organizacion(tenant));
    cajero = await e.sembrar.rol(tenant, 'REST', 'CAJERO', ['rest.caja.cerrar']);
    // Ana Torres, única propietaria del tenant (TR-CA-040).
    ana = await e.sembrar.membresia(tenant, 'ACTIVO', true);
  });

  afterAll(() => e?.cerrar());

  it('TR-CA-039: finalizar a Pedro con «Cese» le quita el acceso y revoca sus asignaciones', async () => {
    const pedro = await cajeroEn(tenant, cajero, sucursales[0]);
    expect(await permisos(pedro.usuarioId)).toEqual(['rest.caja.cerrar']);
    const vtAntes = Number((await e.dataSource.query('SELECT version FROM seg.version_seguridad WHERE tenant_id = $1', [tenant]))[0].version);

    expect(await finalizar(accion(pedro.membresiaId))).toEqual({ estado: 'FINALIZADO', asignacionesRevocadas: [pedro.asignacionId] });

    expect(await fila(pedro.membresiaId)).toEqual({ estado: 'FINALIZADO', hasta: expect.any(Date), motivo: 'Cese', cambiado_por: ana.usuarioId });
    expect(await permisos(pedro.usuarioId)).toEqual([]);
    const [asignacion] = await e.dataSource.query('SELECT motivo_revocacion, revocada_por FROM seg.asignacion WHERE id = $1', [pedro.asignacionId]);
    expect(asignacion).toEqual({ motivo_revocacion: 'Cese', revocada_por: ana.usuarioId });
    // La versión de seguridad sube al commit: la caché de permisos no sirve la clave vieja.
    const [{ version }] = await e.dataSource.query('SELECT version FROM seg.version_seguridad WHERE tenant_id = $1', [tenant]);
    expect(Number(version)).toBeGreaterThan(vtAntes);
    expect(await e.eventosDe(pedro.membresiaId)).toEqual([['membresia.finalizada', 1]]);
    expect(await e.eventosDe(pedro.asignacionId)).toEqual([['asignacion.revocada', 1]]);
    const [bitacora] = await e.dataSource.query("SELECT usuario_id, detalle FROM seg.evento_seguridad WHERE tipo = 'ASIGNACION_REVOCADA' AND detalle->>'membresia_id' = $1", [
      pedro.membresiaId,
    ]);
    expect(bitacora).toEqual({
      usuario_id: ana.usuarioId,
      detalle: { accion: 'FINALIZAR', motivo: 'Cese', membresia_id: pedro.membresiaId, usuario_destino: pedro.usuarioId, asignaciones_revocadas: [pedro.asignacionId] },
    });
  });

  it('TR-CA-040: Ana, única propietaria, no puede suspenderse ni finalizarse', async () => {
    await expect(suspender(accion(ana.membresiaId, ana.usuarioId, 'Vacaciones'))).rejects.toThrow('El tenant debe tener al menos un propietario activo');
    await expect(finalizar(accion(ana.membresiaId))).rejects.toThrow(PropietarioUnicoError);
    expect((await fila(ana.membresiaId)).estado).toBe('ACTIVO');
  });

  it('dos propietarios que se suspenden mutuamente en paralelo dejan al menos uno ACTIVO', async () => {
    const t = await e.sembrar.tenant();
    const a = await e.sembrar.membresia(t, 'ACTIVO', true);
    const b = await e.sembrar.membresia(t, 'ACTIVO', true);

    const resultados = await Promise.allSettled([
      suspender(accion(b.membresiaId, a.usuarioId, 'Mutua A'), t),
      suspender(accion(a.membresiaId, b.usuarioId, 'Mutua B'), t),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const activos = await e.dataSource.query("SELECT count(*)::int AS n FROM seg.membresia WHERE tenant_id = $1 AND estado = 'ACTIVO'", [t]);
    expect(activos[0].n).toBe(1);
  });

  it('TR-RNF-021: sin confirmar o con motivo corto no cambia nada', async () => {
    const luis = await cajeroEn(tenant, cajero, sucursales[0]);

    await expect(suspender({ ...accion(luis.membresiaId), confirmar: false })).rejects.toThrow(ConfirmacionRequeridaError);
    await expect(suspender(accion(luis.membresiaId, ana.usuarioId, 'No'))).rejects.toThrow(MotivoInvalidoError);
    await expect(revocar(luis.asignacionId, ana.usuarioId, 'No')).rejects.toThrow(MotivoInvalidoError);
    expect((await fila(luis.membresiaId)).estado).toBe('ACTIVO');
  });

  it('suspender quita los permisos y reactivar los devuelve, con bitácora de ambos', async () => {
    const luis = await cajeroEn(tenant, cajero, sucursales[0]);

    expect(await suspender(accion(luis.membresiaId, ana.usuarioId, 'Licencia médica'))).toEqual({ estado: 'SUSPENDIDO' });
    expect(await permisos(luis.usuarioId)).toEqual([]);
    await expect(suspender(accion(luis.membresiaId, ana.usuarioId, 'Otra vez'))).rejects.toThrow(TransicionMembresiaError);

    expect(await reactivar(accion(luis.membresiaId, ana.usuarioId, 'Fin de licencia'))).toEqual({ estado: 'ACTIVO' });
    expect(await permisos(luis.usuarioId)).toEqual(['rest.caja.cerrar']);
    const tipos = await e.dataSource.query("SELECT tipo, detalle->>'accion' AS accion FROM seg.evento_seguridad WHERE detalle->>'membresia_id' = $1 ORDER BY id", [
      luis.membresiaId,
    ]);
    expect(tipos).toEqual([
      { tipo: 'ASIGNACION_REVOCADA', accion: 'SUSPENDER' },
      { tipo: 'ASIGNACION_OTORGADA', accion: 'REACTIVAR' },
    ]);
  });

  it('revocar una asignación quita solo sus permisos y deja ASIGNACION_REVOCADA', async () => {
    const mozo = await e.sembrar.rol(tenant, 'REST', 'MOZO_REV', ['rest.mesa.abrir']);
    const luis = await cajeroEn(tenant, cajero, sucursales[0]);
    await e.sembrar.asignacion(tenant, luis.membresiaId, { rolId: mozo }, {}, { alcance: 'SUCURSAL', sucursalId: sucursales[0] });

    expect(await revocar(luis.asignacionId, ana.usuarioId)).toEqual({ revocadaEn: expect.any(Date) });

    expect(await permisos(luis.usuarioId)).toEqual(['rest.mesa.abrir']);
    expect((await fila(luis.membresiaId)).estado).toBe('ACTIVO');
    expect(await e.eventosDe(luis.asignacionId)).toEqual([['asignacion.revocada', 1]]);
    const [bitacora] = await e.dataSource.query("SELECT detalle FROM seg.evento_seguridad WHERE detalle->>'asignacion_id' = $1", [luis.asignacionId]);
    expect(bitacora.detalle).toEqual({ accion: 'REVOCAR', motivo: 'Cambio de puesto', asignacion_id: luis.asignacionId, membresia_id: luis.membresiaId });
  });

  it('un jefe de Miraflores no puede suspender ni revocar a alguien de Surco', async () => {
    const jefe = await cajeroEn(tenant, cajero, sucursales[0]);
    const deSurco = await cajeroEn(tenant, cajero, sucursales[1]);
    const deMiraflores = await cajeroEn(tenant, cajero, sucursales[0]);

    await expect(suspender(accion(deSurco.membresiaId, jefe.usuarioId, 'Fuera de su sucursal'))).rejects.toThrow(ActorSinAlcanceError);
    await expect(revocar(deSurco.asignacionId, jefe.usuarioId)).rejects.toThrow(ActorSinAlcanceError);
    await expect(suspender(accion(deMiraflores.membresiaId, jefe.usuarioId, 'Su sucursal'))).resolves.toEqual({ estado: 'SUSPENDIDO' });
  });

  it('un jefe de Miraflores no suspende a quien solo tiene una asignación futura en Surco ni a quien no tiene asignaciones', async () => {
    const jefe = await cajeroEn(tenant, cajero, sucursales[0]);
    const futuro = await e.sembrar.membresia(tenant, 'ACTIVO');
    await e.sembrar.asignacion(tenant, futuro.membresiaId, { rolId: cajero }, { desde: '2099-01-01' }, { alcance: 'SUCURSAL', sucursalId: sucursales[1] });
    const sinAsignaciones = await e.sembrar.membresia(tenant, 'ACTIVO');

    await expect(suspender(accion(futuro.membresiaId, jefe.usuarioId, 'Fuera de su sucursal'))).rejects.toThrow(ActorSinAlcanceError);
    await expect(suspender(accion(sinAsignaciones.membresiaId, jefe.usuarioId, 'Sin alcance'))).rejects.toThrow(ActorSinAlcanceError);
    // La propietaria sí.
    await expect(suspender(accion(sinAsignaciones.membresiaId, ana.usuarioId, 'Propietaria'))).resolves.toEqual({ estado: 'SUSPENDIDO' });
  });

  it('finalizar en el tenant A no toca la membresía del mismo usuario en B', async () => {
    const tenantB = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenantB, 'REST');
    const { sucursales: deB } = await e.sembrar.organizacion(tenantB);
    const cajeroB = await e.sembrar.rol(tenantB, 'REST', 'CAJERO_B', ['rest.caja.cerrar']);
    const enA = await cajeroEn(tenant, cajero, sucursales[0]);
    const enB = await e.sembrar.membresia(tenantB, 'ACTIVO');
    await e.dataSource.query('UPDATE seg.membresia SET usuario_id = $2 WHERE id = $1', [enB.membresiaId, enA.usuarioId]);
    await e.sembrar.asignacion(tenantB, enB.membresiaId, { rolId: cajeroB }, {}, { alcance: 'SUCURSAL', sucursalId: deB[0] });

    await finalizar(accion(enA.membresiaId));

    expect((await fila(enB.membresiaId)).estado).toBe('ACTIVO');
    expect(await permisos(enA.usuarioId, tenantB, deB[0])).toEqual(['rest.caja.cerrar']);
  });

  it('reingresar a un finalizado no revive sus asignaciones viejas', async () => {
    const proveedor = new ProveedorIdentidadFalso(e.dataSource);
    const invitar = (correo: string, sucursal: string) =>
      e.en(tenant, () =>
        new InvitarUsuario(e.uow, e.contexto, e.ids, RELOJ, e.eventos, e.repos, proveedor, {
          urlInvitacion: 'https://app.vitrina.pe/auth/invitacion',
          horas: 72,
          mfaMaxEdadSeg: 900,
        }).ejecutar({
          correo,
          nombre: 'Reingreso',
          rolId: cajero,
          perfilId: null,
          alcance: 'SUCURSAL',
          empresaId: null,
          sucursalId: sucursal,
          unidadId: null,
          vigenteHasta: null,
          otorgante: { usuarioId: ana.usuarioId, mfaVigente: false },
        }),
      );
    const aceptar = async (usuarioId: string) => {
      const token = new URL(proveedor.llamadas[proveedor.llamadas.length - 1].redirectTo).searchParams.get('token') ?? '';
      return new AceptarInvitacion(e.uow, e.contexto, RELOJ, e.eventos, e.repos).ejecutar({ token, usuarioId });
    };

    const r = await invitar('reingreso@gmail.com', sucursales[0]);
    const [{ usuario_id: usuarioId }] = await e.dataSource.query('SELECT usuario_id FROM seg.membresia WHERE id = $1', [r.membresiaId]);
    await aceptar(usuarioId);
    await finalizar(accion(r.membresiaId));

    await invitar('reingreso@gmail.com', sucursales[1]);
    await aceptar(usuarioId);

    expect(await permisos(usuarioId, tenant, sucursales[0])).toEqual([]);
    expect(await permisos(usuarioId, tenant, sucursales[1])).toEqual(['rest.caja.cerrar']);
  });
});
