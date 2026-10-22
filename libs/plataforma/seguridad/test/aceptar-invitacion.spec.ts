import { AceptarInvitacion, ConsultarInvitacion } from '../src/application/aceptar-invitacion.js';
import { InvitarUsuario } from '../src/application/invitar-usuario.js';
import {
  InvitacionExpiradaError,
  InvitacionNoDisponibleError,
  InvitacionNoEncontradaError,
  InvitacionOtroCorreoError,
} from '../src/domain/errores.js';
import { ProveedorIdentidadFalso } from './support/proveedor-identidad.falso.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const EMISION = new Date('2026-10-22T15:00:00Z');
const horasDespues = (h: number) => new Date(EMISION.getTime() + h * 3_600_000);

describeConDb('ConsultarInvitacion y AceptarInvitacion (TR-RF-010, PostgreSQL 16)', () => {
  let e: Entorno;
  let tenant: string;
  let sucursales: [string, string];
  let cajero: string;
  let propietaria: { membresiaId: string; usuarioId: string };
  let ahora = EMISION;
  const reloj = { now: () => ahora };

  const consultar = (token: string) => new ConsultarInvitacion(e.repos.invitaciones, reloj).ejecutar(token);
  const aceptar = (token: string, usuarioId: string) => new AceptarInvitacion(e.uow, e.contexto, reloj, e.eventos, e.repos).ejecutar({ token, usuarioId });

  /** Invita con el caso de uso real y devuelve el token del enlace y el usuario creado. */
  const invitar = async (correo: string) => {
    ahora = EMISION;
    const proveedor = new ProveedorIdentidadFalso(e.dataSource);
    const caso = new InvitarUsuario(e.uow, e.contexto, e.ids, reloj, e.eventos, e.repos, proveedor, {
      urlInvitacion: 'https://app.vitrina.pe/auth/invitacion',
      horas: 72,
      mfaMaxEdadSeg: 900,
    });
    const r = await e.en(tenant, () =>
      caso.ejecutar({
        correo,
        nombre: 'Invitada',
        rolId: cajero,
        perfilId: null,
        alcance: 'SUCURSAL',
        empresaId: null,
        sucursalId: sucursales[0],
        unidadId: null,
        vigenteHasta: null,
        otorgante: { usuarioId: propietaria.usuarioId, mfaVigente: false },
      }),
    );
    const token = new URL(proveedor.llamadas[0].redirectTo).searchParams.get('token') ?? '';
    const [{ usuario_id }] = await e.dataSource.query('SELECT usuario_id FROM seg.membresia WHERE id = $1', [r.membresiaId]);
    return { ...r, token, usuarioId: usuario_id as string };
  };
  const estado = async (membresiaId: string) => (await e.dataSource.query('SELECT estado FROM seg.membresia WHERE id = $1', [membresiaId]))[0].estado;

  beforeAll(async () => {
    e = await crearEntorno();
    await e.sembrar.permiso('rest.caja.cerrar', { alcanceMinimo: 'SUCURSAL' });
    tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST');
    ({ sucursales } = await e.sembrar.organizacion(tenant));
    cajero = await e.sembrar.rol(tenant, 'REST', 'CAJERO', ['rest.caja.cerrar']);
    propietaria = await e.sembrar.membresia(tenant, 'ACTIVO', true);
  });

  afterAll(() => e?.cerrar());

  it('consultar una vigente devuelve el nombre del tenant y el vencimiento, sin el correo', async () => {
    const r = await invitar('consulta@gmail.com');
    ahora = horasDespues(1);

    expect(await consultar(r.token)).toEqual({ estado: 'VIGENTE', tenantNombre: 'Tenant de prueba', expiraEn: horasDespues(72) });
    await expect(consultar('token-inexistente')).rejects.toThrow(InvitacionNoEncontradaError);
  });

  it('TR-CA-028: Rosa acepta y queda ACTIVO con el tenant preferido y los permisos de Cajero', async () => {
    const r = await invitar('rosa.huaman@gmail.com');
    ahora = horasDespues(2);

    expect(await aceptar(r.token, r.usuarioId)).toEqual({ tenantId: tenant, membresiaId: r.membresiaId, refrescarSesion: true });

    expect(await estado(r.membresiaId)).toBe('ACTIVO');
    const [usuario] = await e.dataSource.query('SELECT tenant_preferido FROM seg.usuario WHERE id = $1', [r.usuarioId]);
    expect(usuario.tenant_preferido).toBe(tenant);
    const [invitacion] = await e.dataSource.query('SELECT usada_en FROM seg.invitacion WHERE id = $1', [r.invitacionId]);
    expect(invitacion.usada_en).toEqual(horasDespues(2));
    expect(await e.eventosDe(r.membresiaId)).toEqual([
      ['membresia.invitada', 1],
      ['membresia.aceptada', 2],
    ]);
    const [bitacora] = await e.dataSource.query("SELECT usuario_id, detalle FROM seg.evento_seguridad WHERE tipo = 'ASIGNACION_OTORGADA' AND detalle->>'membresia_id' = $1", [
      r.membresiaId,
    ]);
    expect(bitacora).toEqual({ usuario_id: r.usuarioId, detalle: { origen: 'INVITACION', membresia_id: r.membresiaId, invitacion_id: r.invitacionId } });

    // Lo mismo que lee mi-contexto: ya tiene la sucursal y el permiso del rol.
    const permisos = await e.en(tenant, () =>
      e.uow.run(() => e.uow.manager.query('SELECT permiso_codigo FROM seg.permisos_efectivos($1, $2, $3)', [r.usuarioId, tenant, sucursales[0]])),
    );
    expect(permisos).toEqual([{ permiso_codigo: 'rest.caja.cerrar' }]);
  });

  it('TR-CA-029: emitida hace 80 h, consultar y aceptar responden que expiró', async () => {
    const r = await invitar('vencida@gmail.com');
    ahora = horasDespues(80);

    await expect(consultar(r.token)).rejects.toThrow('La invitación expiró; solicite una nueva al administrador');
    await expect(aceptar(r.token, r.usuarioId)).rejects.toThrow(InvitacionExpiradaError);
    expect(await estado(r.membresiaId)).toBe('INVITADO');
  });

  it('TR-CA-030: con la sesión de otro usuario no se activa la membresía', async () => {
    const r = await invitar('rosa.h@gmail.com');
    const otra = await e.sembrar.membresia(await e.sembrar.tenant(), 'ACTIVO');
    ahora = horasDespues(1);

    await expect(aceptar(r.token, otra.usuarioId)).rejects.toThrow('Esta invitación pertenece a otro correo');
    await expect(aceptar(r.token, otra.usuarioId)).rejects.toThrow(InvitacionOtroCorreoError);
    expect(await estado(r.membresiaId)).toBe('INVITADO');
    const [invitacion] = await e.dataSource.query('SELECT usada_en FROM seg.invitacion WHERE id = $1', [r.invitacionId]);
    expect(invitacion.usada_en).toBeNull();
  });

  it('un token usado responde 409 en consultar y en aceptar', async () => {
    const r = await invitar('dos.veces@gmail.com');
    ahora = horasDespues(1);
    await aceptar(r.token, r.usuarioId);

    await expect(aceptar(r.token, r.usuarioId)).rejects.toThrow(InvitacionNoDisponibleError);
    await expect(consultar(r.token)).rejects.toThrow(InvitacionNoDisponibleError);
  });

  it('un token anulado por una reinvitación ya no sirve; el nuevo sí', async () => {
    const primera = await invitar('reinvitada@gmail.com');
    const segunda = await invitar('reinvitada@gmail.com');
    ahora = horasDespues(1);

    await expect(aceptar(primera.token, primera.usuarioId)).rejects.toThrow(InvitacionNoDisponibleError);
    await expect(aceptar(segunda.token, segunda.usuarioId)).resolves.toMatchObject({ membresiaId: primera.membresiaId });
  });
});
