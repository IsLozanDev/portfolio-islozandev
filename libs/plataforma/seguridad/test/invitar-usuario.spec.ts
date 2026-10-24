import { createHash } from 'node:crypto';
import { InvitarUsuario, type InvitarUsuarioComando } from '../src/application/invitar-usuario.js';
import {
  AlcanceSuperiorError,
  IdentidadNoDisponibleError,
  LimiteUsuariosError,
  MembresiaExistenteError,
  MfaRequeridaError,
} from '../src/domain/errores.js';
import { ProveedorIdentidadFalso } from './support/proveedor-identidad.falso.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const AHORA = new Date('2026-10-22T15:00:00Z');
const RELOJ = { now: () => AHORA };
const URL_INVITACION = 'https://app.vitrina.pe/auth/invitacion';

interface Escenario {
  tenant: string;
  /** Correo de Rosa propio del escenario: la base es una sola para todo el archivo. */
  correo: string;
  sucursales: [string, string];
  cajero: string;
  supervisor: string;
  propietario: { membresiaId: string; usuarioId: string };
}

describeConDb('InvitarUsuario (TR-RF-009, PostgreSQL 16)', () => {
  let e: Entorno;
  let proveedor: ProveedorIdentidadFalso;

  const caso = () =>
    new InvitarUsuario(e.uow, e.contexto, e.ids, RELOJ, e.eventos, e.repos, proveedor, { urlInvitacion: URL_INVITACION, horas: 72, mfaMaxEdadSeg: 900 });
  const invitar = (s: Escenario, cambios: Partial<InvitarUsuarioComando> = {}) =>
    e.en(s.tenant, () =>
      caso().ejecutar({
        correo: s.correo,
        nombre: 'Rosa Huamán',
        rolId: s.cajero,
        perfilId: null,
        alcance: 'SUCURSAL',
        empresaId: null,
        sucursalId: s.sucursales[0],
        unidadId: null,
        vigenteHasta: null,
        otorgante: { usuarioId: s.propietario.usuarioId, mfaVigente: false },
        ...cambios,
      }),
    );
  const contar = async (sql: string, params: unknown[]) => Number((await e.dataSource.query(sql, params))[0].n);
  const filas = (s: Escenario) =>
    Promise.all([
      contar('SELECT count(*) AS n FROM seg.membresia WHERE tenant_id = $1', [s.tenant]),
      contar('SELECT count(*) AS n FROM seg.asignacion WHERE tenant_id = $1', [s.tenant]),
      contar('SELECT count(*) AS n FROM seg.invitacion WHERE tenant_id = $1', [s.tenant]),
      contar('SELECT count(*) AS n FROM sync.outbox WHERE tenant_id = $1', [s.tenant]),
    ]);

  /** Tenant con REST (límite dado), Miraflores y Surco, Cajero, Supervisor (sensible) y una propietaria. */
  const escenario = async (limite: number | null = 10): Promise<Escenario> => {
    const tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST', 'ACTIVA', limite);
    const { sucursales } = await e.sembrar.organizacion(tenant);
    const cajero = await e.sembrar.rol(tenant, 'REST', 'CAJERO', ['rest.caja.cerrar']);
    const supervisor = await e.sembrar.rol(tenant, 'REST', 'SUPERVISOR', ['rest.pedido.anular']);
    const propietario = await e.sembrar.membresia(tenant, 'ACTIVO', true);
    return { tenant, correo: `rosa.huaman.${tenant.slice(-8)}@gmail.com`, sucursales, cajero, supervisor, propietario };
  };
  const activos = async (s: Escenario, n: number) => {
    for (let i = 0; i < n; i++) {
      const m = await e.sembrar.membresia(s.tenant, 'ACTIVO');
      await e.sembrar.asignacion(s.tenant, m.membresiaId, { rolId: s.cajero });
    }
  };
  const usuarioConCorreo = async (correo: string, tenantOrigen: string) => {
    const m = await e.sembrar.membresia(tenantOrigen, 'ACTIVO');
    await e.dataSource.query('UPDATE seg.usuario SET email = $2 WHERE id = $1', [m.usuarioId, correo]);
    return m.usuarioId;
  };
  const tokenDe = (redirectTo: string) => new URL(redirectTo).searchParams.get('token') ?? '';

  beforeAll(async () => {
    e = await crearEntorno();
    await e.sembrar.permiso('rest.caja.cerrar', { alcanceMinimo: 'SUCURSAL' });
    await e.sembrar.permiso('rest.pedido.anular', { alcanceMinimo: 'SUCURSAL', sensible: true });
  });

  beforeEach(() => {
    proveedor = new ProveedorIdentidadFalso(e.dataSource);
  });

  afterAll(() => e?.cerrar());

  it('TR-CA-025: con 6 de 10 usuarios, invita a Rosa como Cajero en Miraflores', async () => {
    const s = await escenario(10);
    await activos(s, 6);

    const r = await invitar(s);

    expect(r).toEqual({ membresiaId: expect.any(String), invitacionId: expect.any(String), expiraEn: new Date('2026-10-25T15:00:00Z'), usuarioNuevo: true, correoEnviado: true });
    expect(proveedor.llamadas).toEqual([{ tipo: 'invitar', correo: s.correo, nombre: 'Rosa Huamán', redirectTo: expect.stringMatching(/^https:\/\/app\.vitrina\.pe\/auth\/invitacion\?token=[\w-]{43}$/) }]);

    const [membresia] = await e.dataSource.query('SELECT m.estado, m.invitado_por, u.tipo FROM seg.membresia m JOIN seg.usuario u ON u.id = m.usuario_id WHERE m.id = $1', [r.membresiaId]);
    expect(membresia).toEqual({ estado: 'INVITADO', invitado_por: s.propietario.usuarioId, tipo: 'INTERNO' });

    const hash = createHash('sha256').update(tokenDe(proveedor.llamadas[0].redirectTo)).digest('hex');
    const [invitacion] = await e.dataSource.query('SELECT token_hash, expira_en FROM seg.invitacion WHERE id = $1', [r.invitacionId]);
    expect(invitacion).toEqual({ token_hash: hash, expira_en: new Date('2026-10-25T15:00:00Z') });

    const [asignacion] = await e.dataSource.query('SELECT rol_id, alcance, sucursal_id FROM seg.asignacion WHERE membresia_id = $1', [r.membresiaId]);
    expect(asignacion).toEqual({ rol_id: s.cajero, alcance: 'SUCURSAL', sucursal_id: s.sucursales[0] });
    expect(await e.eventosDe(r.membresiaId)).toEqual([['membresia.invitada', 1]]);
    expect(await contar("SELECT count(*) AS n FROM sync.outbox WHERE tenant_id = $1 AND event_type = 'asignacion.otorgada'", [s.tenant])).toBe(1);
    // El acceso empieza al aceptar: invitar no escribe ASIGNACION_OTORGADA.
    expect(await contar('SELECT count(*) AS n FROM seg.evento_seguridad WHERE tenant_id = $1', [s.tenant])).toBe(0);
  });

  it('TR-CA-026: un actor con alcance SUCURSAL no invita con alcance TENANT y no se escribe nada', async () => {
    const s = await escenario();
    const jefe = await e.sembrar.membresia(s.tenant, 'ACTIVO');
    // Vigente en AHORA, que es fijo.
    await e.sembrar.asignacion(s.tenant, jefe.membresiaId, { rolId: s.cajero }, { desde: '2026-01-01' }, { alcance: 'SUCURSAL', sucursalId: s.sucursales[0] });
    const antes = await filas(s);

    const intento = invitar(s, { alcance: 'TENANT', sucursalId: null, otorgante: { usuarioId: jefe.usuarioId, mfaVigente: false } });
    await expect(intento).rejects.toThrow(AlcanceSuperiorError);
    await expect(invitar(s, { alcance: 'TENANT', sucursalId: null, otorgante: { usuarioId: jefe.usuarioId, mfaVigente: false } })).rejects.toThrow(
      'No puede otorgar un alcance mayor al suyo',
    );
    expect(await filas(s)).toEqual(antes);
    expect(proveedor.llamadas).toEqual([]);

    // En su sucursal sí puede.
    await expect(invitar(s, { otorgante: { usuarioId: jefe.usuarioId, mfaVigente: false } })).resolves.toMatchObject({ usuarioNuevo: true });
  });

  it('TR-CA-027: Carlos, activo en otro tenant, recibe una segunda membresía sin duplicar el usuario', async () => {
    const norte = await escenario();
    const sur = await escenario();
    const carlos = await usuarioConCorreo('carlos.rojas@outlook.com', norte.tenant);

    const r = await invitar(sur, { correo: 'Carlos.Rojas@Outlook.com', nombre: 'Carlos Rojas' });

    expect(r).toMatchObject({ usuarioNuevo: false, correoEnviado: true });
    expect(proveedor.llamadas).toEqual([{ tipo: 'enlace', correo: 'carlos.rojas@outlook.com', redirectTo: expect.stringContaining('?token=') }]);
    expect(await contar("SELECT count(*) AS n FROM seg.usuario WHERE email = 'carlos.rojas@outlook.com'", [])).toBe(1);
    expect(await contar('SELECT count(*) AS n FROM seg.membresia WHERE usuario_id = $1', [carlos])).toBe(2);
    const [{ tipo }] = await e.dataSource.query('SELECT tipo FROM seg.usuario WHERE id = $1', [carlos]);
    expect(tipo).toBe('EXTERNO');
  });

  it('TR-RN-006: con el cupo lleno responde LIMITE_USUARIOS; un invitado vencido no cuenta', async () => {
    const s = await escenario(3);
    await activos(s, 2);
    const vencido = await e.sembrar.membresia(s.tenant, 'INVITADO');
    await e.sembrar.asignacion(s.tenant, vencido.membresiaId, { rolId: s.cajero });
    await e.sembrar.invitacion(s.tenant, vencido.membresiaId, s.propietario.usuarioId, new Date(AHORA.getTime() - 3_600_000));

    await expect(invitar(s)).resolves.toMatchObject({ usuarioNuevo: true });
    const antes = await filas(s);
    await expect(invitar(s, { correo: 'otra@prueba.pe' })).rejects.toThrow(LimiteUsuariosError);
    expect(await filas(s)).toEqual(antes);
    expect(proveedor.llamadas).toHaveLength(1);
  });

  it('reinvitar a un INVITADO anula el token anterior y reemplaza su asignación', async () => {
    const s = await escenario();
    const primera = await invitar(s);
    const segunda = await invitar(s, { rolId: s.cajero, sucursalId: s.sucursales[1] });

    expect(segunda.membresiaId).toBe(primera.membresiaId);
    expect(await contar('SELECT count(*) AS n FROM seg.invitacion WHERE membresia_id = $1 AND usada_en IS NULL AND anulada_en IS NULL', [primera.membresiaId])).toBe(1);
    const [anulada] = await e.dataSource.query('SELECT anulada_en FROM seg.invitacion WHERE id = $1', [primera.invitacionId]);
    expect(anulada.anulada_en).toEqual(AHORA);

    const asignaciones = await e.dataSource.query('SELECT sucursal_id, motivo_revocacion FROM seg.asignacion WHERE membresia_id = $1 ORDER BY revocada_en NULLS LAST', [
      primera.membresiaId,
    ]);
    expect(asignaciones).toEqual([
      { sucursal_id: s.sucursales[0], motivo_revocacion: 'Reinvitación' },
      { sucursal_id: s.sucursales[1], motivo_revocacion: null },
    ]);
    expect(await e.eventosDe(primera.membresiaId)).toEqual([
      ['membresia.invitada', 1],
      ['membresia.invitada', 2],
    ]);
    expect(await contar("SELECT count(*) AS n FROM seg.evento_seguridad WHERE tenant_id = $1 AND tipo = 'ASIGNACION_REVOCADA'", [s.tenant])).toBe(1);
    // El segundo correo sale por enlace: el usuario ya existe.
    expect(proveedor.llamadas.map((l) => l.tipo)).toEqual(['invitar', 'enlace']);
  });

  it('reinvitar a un FINALIZADO lo devuelve a INVITADO', async () => {
    const s = await escenario();
    const ex = await e.sembrar.membresia(s.tenant, 'FINALIZADO');
    const [{ email }] = await e.dataSource.query('SELECT email FROM seg.usuario WHERE id = $1', [ex.usuarioId]);

    const r = await invitar(s, { correo: email });

    expect(r.membresiaId).toBe(ex.membresiaId);
    const [fila] = await e.dataSource.query('SELECT estado, hasta FROM seg.membresia WHERE id = $1', [ex.membresiaId]);
    expect(fila).toEqual({ estado: 'INVITADO', hasta: null });
  });

  it.each(['ACTIVO', 'SUSPENDIDO'] as const)('invitar a un %s responde MEMBRESIA_EXISTENTE sin llamar a Supabase', async (estado) => {
    const s = await escenario();
    const m = await e.sembrar.membresia(s.tenant, estado);
    const [{ email }] = await e.dataSource.query('SELECT email FROM seg.usuario WHERE id = $1', [m.usuarioId]);

    await expect(invitar(s, { correo: email })).rejects.toThrow(MembresiaExistenteError);
    expect(proveedor.llamadas).toEqual([]);
  });

  it('TR-RN-009: invitar con un rol sensible exige MFA vigente', async () => {
    const s = await escenario();
    await expect(invitar(s, { rolId: s.supervisor })).rejects.toThrow(MfaRequeridaError);
    await expect(invitar(s, { rolId: s.supervisor, otorgante: { usuarioId: s.propietario.usuarioId, mfaVigente: true } })).resolves.toMatchObject({
      usuarioNuevo: true,
    });
  });

  it('con Supabase caído no crea usuario, membresía, asignación, invitación ni eventos', async () => {
    const s = await escenario();
    proveedor.fallar = true;
    const antes = await filas(s);

    await expect(invitar(s)).rejects.toThrow(IdentidadNoDisponibleError);
    expect(await filas(s)).toEqual(antes);
    expect(await contar('SELECT count(*) AS n FROM seg.usuario WHERE email = $1', [s.correo])).toBe(0);
  });

  it('si el enlace a un usuario existente falla, la invitación queda y correoEnviado es false', async () => {
    const s = await escenario();
    await usuarioConCorreo('ana.torres@gmail.com', (await escenario()).tenant);
    proveedor.fallar = true;

    const r = await invitar(s, { correo: 'ana.torres@gmail.com' });

    expect(r).toMatchObject({ usuarioNuevo: false, correoEnviado: false });
    expect(await contar('SELECT count(*) AS n FROM seg.invitacion WHERE id = $1', [r.invitacionId])).toBe(1);
  });
});
