import { NotFoundError } from '@vitrina/plataforma/kernel';
import { fechaLocal, OtorgarAsignacion, type OtorgarAsignacionComando } from '../src/application/otorgar-asignacion.js';
import {
  AlcanceInsuficienteError,
  MembresiaNoAsignableError,
  MfaRequeridaError,
  OtorganteSinAlcanceError,
  RolOPerfilError,
  VigenciaInvalidaError,
} from '../src/domain/errores.js';
import { crearEntorno, type Entorno } from './support/entorno.js';

// Reloj fijo: el "hoy" de los casos de uso es el 14/10/2026 en Lima.
const RELOJ = { now: () => new Date('2026-10-14T15:00:00Z') };

describe('OtorgarAsignacion (TR-RF-013, PostgreSQL 16)', () => {
  let e: Entorno;
  let tenant: string;
  let org: { empresaId: string; sucursales: [string, string]; cajas: [string, string] };
  let CAJERO: string;
  let SUPERVISOR: string;
  let REPORTES: string;
  let propietario: { membresiaId: string; usuarioId: string };
  let luis: { membresiaId: string; usuarioId: string };
  let jefeMiraflores: { membresiaId: string; usuarioId: string };

  const otorgar = () => new OtorgarAsignacion(e.uow, e.contexto, e.ids, RELOJ, e.eventos, e.repos, 900);
  const comando = (cambios: Partial<OtorgarAsignacionComando> = {}): OtorgarAsignacionComando => ({
    membresiaId: luis.membresiaId,
    rolId: CAJERO,
    perfilId: null,
    alcance: 'UNIDAD',
    empresaId: null,
    sucursalId: null,
    unidadId: org.cajas[0],
    vigenteDesde: '2026-10-15',
    vigenteHasta: '2026-10-31',
    otorgante: { usuarioId: propietario.usuarioId, mfaVigente: false },
    ...cambios,
  });
  const ejecutar = (c: OtorgarAsignacionComando) => e.en(tenant, () => otorgar().ejecutar(c));
  const contar = async (sql: string, params: unknown[] = []) => Number((await e.dataSource.query(sql, params))[0].n);
  const asignacionesDe = (membresiaId: string) => contar('SELECT count(*) AS n FROM seg.asignacion WHERE membresia_id = $1', [membresiaId]);

  beforeAll(async () => {
    e = await crearEntorno();
    await e.sembrar.permiso('rest.caja.cerrar', { alcanceMinimo: 'UNIDAD' });
    await e.sembrar.permiso('rest.pedido.anular', { alcanceMinimo: 'UNIDAD', sensible: true });
    await e.sembrar.permiso('rest.reporte.ver', { alcanceMinimo: 'EMPRESA' });
    tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST');
    org = await e.sembrar.organizacion(tenant);
    CAJERO = await e.sembrar.rol(tenant, 'REST', 'CAJERO', ['rest.caja.cerrar']);
    SUPERVISOR = await e.sembrar.rol(tenant, 'REST', 'SUPERVISOR', ['rest.pedido.anular']);
    REPORTES = await e.sembrar.rol(tenant, 'REST', 'REPORTES', ['rest.reporte.ver']);
    propietario = await e.sembrar.membresia(tenant, 'ACTIVO', true);
    luis = await e.sembrar.membresia(tenant);
    jefeMiraflores = await e.sembrar.membresia(tenant);
    await e.sembrar.asignacion(tenant, jefeMiraflores.membresiaId, { rolId: CAJERO }, { desde: '2026-01-01' }, { alcance: 'SUCURSAL', sucursalId: org.sucursales[0] });
  });

  afterAll(() => e?.cerrar());

  it('TR-CA-036: Cajero en CAJA-02 del 15/10 al 31/10, con bitácora y outbox en la misma transacción', async () => {
    const { asignacionId } = await ejecutar(comando());

    const [fila] = await e.dataSource.query(
      `SELECT alcance, unidad_id, to_char(vigente_desde, 'YYYY-MM-DD') AS desde, to_char(vigente_hasta, 'YYYY-MM-DD') AS hasta, otorgado_por, version
         FROM seg.asignacion WHERE id = $1`,
      [asignacionId],
    );
    expect(fila).toEqual({ alcance: 'UNIDAD', unidad_id: org.cajas[0], desde: '2026-10-15', hasta: '2026-10-31', otorgado_por: propietario.usuarioId, version: '1' });
    expect(await e.eventosDe(asignacionId)).toEqual([['asignacion.otorgada', 1]]);
    const [evento] = await e.dataSource.query("SELECT usuario_id, detalle FROM seg.evento_seguridad WHERE tipo = 'ASIGNACION_OTORGADA' AND detalle->>'asignacion_id' = $1", [
      asignacionId,
    ]);
    expect(evento).toEqual({
      usuario_id: propietario.usuarioId,
      detalle: expect.objectContaining({ membresia_id: luis.membresiaId, usuario_destino: luis.usuarioId, rol_id: CAJERO, alcance: 'UNIDAD' }),
    });
  });

  it('vigente_desde por defecto es hoy en Lima', async () => {
    const { asignacionId } = await ejecutar(comando({ alcance: 'TENANT', unidadId: null, vigenteDesde: undefined, vigenteHasta: null }));
    const [{ desde }] = await e.dataSource.query("SELECT to_char(vigente_desde, 'YYYY-MM-DD') AS desde FROM seg.asignacion WHERE id = $1", [asignacionId]);
    expect(desde).toBe('2026-10-14');
    expect(fechaLocal(new Date('2026-10-15T03:00:00Z'))).toBe('2026-10-14');
  });

  it('TR-CA-037 y TR-CA-038 no dejan filas, bitácora ni eventos', async () => {
    const antes = await contar('SELECT count(*) AS n FROM sync.outbox WHERE tenant_id = $1', [tenant]);
    const bitacora = await contar('SELECT count(*) AS n FROM seg.evento_seguridad WHERE tenant_id = $1', [tenant]);
    const perfilId = await e.sembrar.perfil(tenant, 'CAJA', [CAJERO]);

    await expect(ejecutar(comando({ perfilId }))).rejects.toThrow('Seleccione un rol o un perfil, no ambos');
    await expect(ejecutar(comando({ perfilId }))).rejects.toThrow(RolOPerfilError);
    await expect(ejecutar(comando({ vigenteDesde: '2026-10-20', vigenteHasta: '2026-10-19' }))).rejects.toThrow(
      'La vigencia hasta no puede ser anterior a la vigencia desde',
    );
    await expect(ejecutar(comando({ vigenteDesde: '2026-10-20', vigenteHasta: '2026-10-19' }))).rejects.toThrow(VigenciaInvalidaError);

    expect(await contar('SELECT count(*) AS n FROM sync.outbox WHERE tenant_id = $1', [tenant])).toBe(antes);
    expect(await contar('SELECT count(*) AS n FROM seg.evento_seguridad WHERE tenant_id = $1', [tenant])).toBe(bitacora);
  });

  it('un perfil se asigna con los permisos de sus roles', async () => {
    const perfilId = await e.sembrar.perfil(tenant, 'CAJA_PERFIL', [CAJERO]);
    await expect(ejecutar(comando({ rolId: null, perfilId }))).resolves.toEqual({ asignacionId: expect.any(String) });
  });

  describe('membresía destino', () => {
    it('una membresía INVITADO recibe asignaciones', async () => {
      const invitado = await e.sembrar.membresia(tenant, 'INVITADO');
      await ejecutar(comando({ membresiaId: invitado.membresiaId }));
      expect(await asignacionesDe(invitado.membresiaId)).toBe(1);
    });

    it('una membresía SUSPENDIDO no', async () => {
      const suspendido = await e.sembrar.membresia(tenant, 'SUSPENDIDO');
      await expect(ejecutar(comando({ membresiaId: suspendido.membresiaId }))).rejects.toThrow(MembresiaNoAsignableError);
      expect(await asignacionesDe(suspendido.membresiaId)).toBe(0);
    });

    it('una membresía de otro tenant no existe para este', async () => {
      const otro = await e.sembrar.tenant();
      const ajena = await e.sembrar.membresia(otro);
      await expect(ejecutar(comando({ membresiaId: ajena.membresiaId }))).rejects.toThrow(NotFoundError);
    });
  });

  describe('otorgante (alcance igual o mayor)', () => {
    const jefe = () => ({ usuarioId: jefeMiraflores.usuarioId, mfaVigente: false });

    it('un otorgante SUCURSAL asigna una caja de su sucursal', async () => {
      const destino = await e.sembrar.membresia(tenant);
      await ejecutar(comando({ membresiaId: destino.membresiaId, otorgante: jefe() }));
      expect(await asignacionesDe(destino.membresiaId)).toBe(1);
    });

    it('pero no alcance EMPRESA ni otra sucursal', async () => {
      const destino = await e.sembrar.membresia(tenant);
      await expect(
        ejecutar(comando({ membresiaId: destino.membresiaId, alcance: 'EMPRESA', unidadId: null, empresaId: org.empresaId, otorgante: jefe() })),
      ).rejects.toThrow(OtorganteSinAlcanceError);
      await expect(
        ejecutar(comando({ membresiaId: destino.membresiaId, alcance: 'SUCURSAL', unidadId: null, sucursalId: org.sucursales[1], otorgante: jefe() })),
      ).rejects.toThrow(OtorganteSinAlcanceError);
      await expect(ejecutar(comando({ membresiaId: destino.membresiaId, unidadId: org.cajas[1], otorgante: jefe() }))).rejects.toThrow(OtorganteSinAlcanceError);
      expect(await asignacionesDe(destino.membresiaId)).toBe(0);
    });

    it('el propietario del tenant asigna en cualquier alcance', async () => {
      const destino = await e.sembrar.membresia(tenant);
      await ejecutar(comando({ membresiaId: destino.membresiaId, rolId: REPORTES, alcance: 'EMPRESA', unidadId: null, empresaId: org.empresaId }));
      expect(await asignacionesDe(destino.membresiaId)).toBe(1);
    });

    it('un usuario sin membresía activa en el tenant no otorga', async () => {
      const sinMembresia = await e.sembrar.membresia(await e.sembrar.tenant());
      await expect(ejecutar(comando({ otorgante: { usuarioId: sinMembresia.usuarioId, mfaVigente: true } }))).rejects.toThrow(OtorganteSinAlcanceError);
    });

    it('una asignación del otorgante que no está vigente hoy no cuenta', async () => {
      const exJefe = await e.sembrar.membresia(tenant);
      await e.sembrar.asignacion(tenant, exJefe.membresiaId, { rolId: CAJERO }, { desde: '2026-01-01', hasta: '2026-10-13' }, { alcance: 'TENANT' });
      await expect(ejecutar(comando({ otorgante: { usuarioId: exJefe.usuarioId, mfaVigente: false } }))).rejects.toThrow(OtorganteSinAlcanceError);
    });
  });

  describe('reglas del rol', () => {
    it('TR-RN-009: un rol con permisos sensibles exige MFA vigente al otorgante', async () => {
      const destino = await e.sembrar.membresia(tenant);
      await expect(ejecutar(comando({ membresiaId: destino.membresiaId, rolId: SUPERVISOR }))).rejects.toThrow(MfaRequeridaError);
      expect(await asignacionesDe(destino.membresiaId)).toBe(0);

      await ejecutar(comando({ membresiaId: destino.membresiaId, rolId: SUPERVISOR, otorgante: { usuarioId: propietario.usuarioId, mfaVigente: true } }));
      expect(await asignacionesDe(destino.membresiaId)).toBe(1);
    });

    it('el alcance no puede ser menor que el alcance_minimo de los permisos', async () => {
      await expect(ejecutar(comando({ rolId: REPORTES }))).rejects.toThrow(AlcanceInsuficienteError);
    });

    it('una unidad de otro tenant no existe para este', async () => {
      const otro = await e.sembrar.tenant();
      const ajena = await e.sembrar.organizacion(otro);
      await expect(ejecutar(comando({ unidadId: ajena.cajas[0] }))).rejects.toThrow(new NotFoundError('La unidad no existe'));
    });

    it('un rol inexistente da NotFoundError', async () => {
      await expect(ejecutar(comando({ rolId: '0193f3a0-0000-7000-8000-00000000dead' }))).rejects.toThrow(new NotFoundError('El rol no existe'));
    });
  });
});
