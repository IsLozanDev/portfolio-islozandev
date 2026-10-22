import { ConflictError } from '@vitrina/plataforma/kernel';
import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { Invitacion } from '../src/domain/invitacion.js';
import { Membresia } from '../src/domain/membresia.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const HORA = 3_600_000;

function existe<T>(valor: T | null): T {
  if (valor === null) throw new Error('se esperaba un registro');
  return valor;
}

describeConDb('Repositorios de membresías (PostgreSQL 16)', () => {
  let e: Entorno;
  let tenant: string;
  let otroTenant: string;
  let admin: { membresiaId: string; usuarioId: string };
  let cajero: string;
  let mozo: string;
  let perfilSalon: string;

  const tx = <T>(fn: () => Promise<T>, t = tenant) => e.en(t, () => e.uow.run(fn));
  const usados = (producto: string, excluir?: string) => tx(() => e.repos.limites.usados(producto, new Date(), excluir));

  beforeAll(async () => {
    e = await crearEntorno();
    tenant = await e.sembrar.tenant();
    otroTenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST', 'ACTIVA', 10);
    await e.sembrar.suscripcion(tenant, 'GYM', 'ACTIVA', null);
    await e.sembrar.permiso('rest.caja.cerrar');
    await e.sembrar.permiso('rest.mesa.abrir');
    cajero = await e.sembrar.rol(tenant, 'REST', 'CAJERO', ['rest.caja.cerrar']);
    mozo = await e.sembrar.rol(tenant, 'REST', 'MOZO', ['rest.mesa.abrir']);
    perfilSalon = await e.sembrar.perfil(tenant, 'SALON', [mozo]);
    admin = await e.sembrar.membresia(tenant, 'ACTIVO', true);
  });

  afterAll(() => e?.cerrar());

  describe('RepositorioMembresias', () => {
    it('guarda una invitada, la relee con su versión y la actualiza con bloqueo optimista', async () => {
      const { usuarioId } = await e.sembrar.membresia(otroTenant, 'ACTIVO');
      const id = uuidV7();
      const ahora = new Date();
      await tx(() => e.repos.ciclo.guardar(Membresia.invitar(id, { usuarioId, tenantId: tenant, invitadoPor: admin.usuarioId }, ahora, new Date(ahora.getTime() + 72 * HORA))));

      const leida = await tx(() => e.repos.ciclo.buscar(id));
      expect(leida).toMatchObject({ estado: 'INVITADO', usuarioId, invitadoPor: admin.usuarioId, version: 1 });
      expect(await tx(() => e.repos.ciclo.deUsuario(usuarioId))).toMatchObject({ id });

      await tx(async () => {
        const m = existe(await e.repos.ciclo.buscar(id));
        m.aceptar(new Date());
        m.suspender('Licencia médica', admin.usuarioId, new Date());
        await e.repos.ciclo.guardar(m);
      });
      const [fila] = await e.dataSource.query('SELECT estado, motivo, cambiado_por, version FROM seg.membresia WHERE id = $1', [id]);
      expect(fila).toEqual({ estado: 'SUSPENDIDO', motivo: 'Licencia médica', cambiado_por: admin.usuarioId, version: '3' });

      // Dos lecturas de la misma versión: la segunda en guardar pierde.
      const a = existe(await tx(() => e.repos.ciclo.buscar(id)));
      const b = existe(await tx(() => e.repos.ciclo.buscar(id)));
      a.reactivar('Fin de licencia', admin.usuarioId, new Date());
      await tx(() => e.repos.ciclo.guardar(a));
      b.finalizar('Fin de contrato', admin.usuarioId, new Date(), []);
      await expect(tx(() => e.repos.ciclo.guardar(b))).rejects.toThrow(ConflictError);
    });

    it('una segunda membresía del mismo usuario en el tenant da ConflictError', async () => {
      const { usuarioId } = await e.sembrar.membresia(tenant, 'ACTIVO');
      const ahora = new Date();
      await expect(
        tx(() => e.repos.ciclo.guardar(Membresia.invitar(uuidV7(), { usuarioId, tenantId: tenant, invitadoPor: admin.usuarioId }, ahora, ahora))),
      ).rejects.toThrow('El usuario ya tiene una membresía en el tenant');
    });

    it('no lee membresías de otro tenant', async () => {
      const ajena = await e.sembrar.membresia(otroTenant, 'ACTIVO');
      expect(await tx(() => e.repos.ciclo.buscar(ajena.membresiaId))).toBeNull();
      expect(await tx(() => e.repos.ciclo.deUsuario(ajena.usuarioId))).toBeNull();
    });

    it('propietariosActivosParaActualizar devuelve solo propietarios ACTIVO y los bloquea hasta el commit', async () => {
      const t = await e.sembrar.tenant();
      const ana = await e.sembrar.membresia(t, 'ACTIVO', true);
      const beto = await e.sembrar.membresia(t, 'ACTIVO', true);
      await e.sembrar.membresia(t, 'SUSPENDIDO', true);
      await e.sembrar.membresia(t, 'ACTIVO', false);

      let liberar!: () => void;
      const bloqueada = new Promise<void>((ok) => (liberar = ok));
      let primera: string[] = [];
      const t1 = tx(async () => {
        primera = await e.repos.ciclo.propietariosActivosParaActualizar();
        await bloqueada;
        await e.uow.manager.query(`UPDATE seg.membresia SET estado = 'SUSPENDIDO' WHERE id = $1`, [ana.membresiaId]);
      }, t);

      // La segunda transacción espera el FOR UPDATE de la primera y relee tras su commit.
      await new Promise((ok) => setTimeout(ok, 200));
      const t2 = tx(() => e.repos.ciclo.propietariosActivosParaActualizar(), t);
      await new Promise((ok) => setTimeout(ok, 200));
      liberar();
      await t1;

      expect(primera).toEqual([ana.membresiaId, beto.membresiaId].sort());
      expect(await t2).toEqual([beto.membresiaId]);
    });
  });

  describe('RepositorioInvitaciones', () => {
    it('guarda, encuentra la pendiente, la anula y permite una nueva', async () => {
      const m = await e.sembrar.membresia(tenant, 'INVITADO');
      const emitir = (hash: string) =>
        Invitacion.emitir(uuidV7(), { tenantId: tenant, membresiaId: m.membresiaId, tokenHash: hash, creadaPor: admin.usuarioId, ahora: new Date(), horas: 72 });

      const primera = emitir('a'.repeat(64));
      await tx(() => e.repos.invitaciones.guardar(primera));
      await expect(tx(() => e.repos.invitaciones.guardar(emitir('b'.repeat(64))))).rejects.toThrow('La membresía ya tiene una invitación pendiente');

      await tx(async () => {
        const pendiente = existe(await e.repos.invitaciones.pendienteDe(m.membresiaId));
        expect(pendiente.id).toBe(primera.id);
        pendiente.anular(new Date());
        await e.repos.invitaciones.guardar(pendiente);
        await e.repos.invitaciones.guardar(emitir('c'.repeat(64)));
      });

      expect(await tx(() => e.repos.invitaciones.buscar(primera.id))).toMatchObject({ anuladaEn: expect.any(Date) });
      expect((await tx(() => e.repos.invitaciones.pendienteDe(m.membresiaId)))?.tokenHash).toBe('c'.repeat(64));
    });

    it('porToken resuelve sin tenant en el contexto y no encuentra un hash inexistente', async () => {
      const m = await e.sembrar.membresia(tenant, 'INVITADO');
      const id = await e.sembrar.invitacion(tenant, m.membresiaId, admin.usuarioId);
      const [{ token_hash }] = await e.dataSource.query('SELECT token_hash FROM seg.invitacion WHERE id = $1', [id]);

      expect(await e.repos.invitaciones.porToken(token_hash)).toEqual({
        invitacionId: id,
        tenantId: tenant,
        membresiaId: m.membresiaId,
        usuarioId: m.usuarioId,
        tenantNombre: 'Tenant de prueba',
        expiraEn: expect.any(Date),
        usadaEn: null,
        anuladaEn: null,
      });
      expect(await e.repos.invitaciones.porToken('f'.repeat(64))).toBeNull();
    });

    it('no lee invitaciones de otro tenant', async () => {
      const m = await e.sembrar.membresia(otroTenant, 'INVITADO');
      const id = await e.sembrar.invitacion(otroTenant, m.membresiaId, admin.usuarioId);
      expect(await tx(() => e.repos.invitaciones.buscar(id))).toBeNull();
      expect(await tx(() => e.repos.invitaciones.pendienteDe(m.membresiaId))).toBeNull();
    });
  });

  describe('UsuariosIdentidad', () => {
    it('busca por correo sin distinguir mayúsculas, marca INTERNO y fija el tenant preferido', async () => {
      const { usuarioId } = await e.sembrar.membresia(tenant, 'INVITADO');
      const [{ email }] = await e.dataSource.query('SELECT email FROM seg.usuario WHERE id = $1', [usuarioId]);

      expect(await tx(() => e.repos.usuarios.porCorreo(` ${email.toUpperCase()} `))).toEqual({ id: usuarioId, nombre: 'Usuario', tipo: 'EXTERNO' });
      expect(await tx(() => e.repos.usuarios.porCorreo('nadie@prueba.pe'))).toBeNull();

      await tx(async () => {
        await e.repos.usuarios.marcarInterno(usuarioId);
        await e.repos.usuarios.fijarTenantPreferido(usuarioId, tenant);
      });
      const [fila] = await e.dataSource.query('SELECT tipo, tenant_preferido FROM seg.usuario WHERE id = $1', [usuarioId]);
      expect(fila).toEqual({ tipo: 'INTERNO', tenant_preferido: tenant });
    });
  });

  describe('LimitesPlan (TR-RN-006)', () => {
    it('lee el límite de la suscripción vigente; null sin límite o sin suscripción', async () => {
      expect(await tx(() => e.repos.limites.limite('REST'))).toBe(10);
      expect(await tx(() => e.repos.limites.limite('GYM'))).toBeNull();
      expect(await tx(() => e.repos.limites.limite('LIB'))).toBeNull();
    });

    it('cuenta ACTIVO e INVITADO vigente con asignación del producto, directa o por perfil', async () => {
      const t = await e.sembrar.tenant();
      await e.sembrar.suscripcion(t, 'REST', 'ACTIVA', 10);
      const caja = await e.sembrar.rol(t, 'REST', 'CAJA_T', ['rest.caja.cerrar']);
      const salon = await e.sembrar.perfil(t, 'SALON_T', [await e.sembrar.rol(t, 'REST', 'MOZO_T', ['rest.mesa.abrir'])]);
      const gym = await e.sembrar.rol(t, 'GYM', 'RECEP_T', []);
      const contar = (excluir?: string) => tx(() => e.repos.limites.usados('REST', new Date(), excluir), t);
      const conAsignacion = async (estado: 'INVITADO' | 'ACTIVO' | 'SUSPENDIDO' | 'FINALIZADO', destino: { rolId?: string; perfilId?: string }) => {
        const m = await e.sembrar.membresia(t, estado);
        const asignacionId = await e.sembrar.asignacion(t, m.membresiaId, destino);
        return { ...m, asignacionId };
      };

      const activo = await conAsignacion('ACTIVO', { rolId: caja });
      await conAsignacion('ACTIVO', { perfilId: salon });
      // Dos asignaciones del mismo producto cuentan una vez.
      await e.sembrar.asignacion(t, activo.membresiaId, { perfilId: salon });
      expect(await contar()).toBe(2);

      const invitado = await conAsignacion('INVITADO', { rolId: caja });
      expect(await contar()).toBe(2); // sin invitación pendiente no cuenta
      await e.sembrar.invitacion(t, invitado.membresiaId, activo.usuarioId);
      expect(await contar()).toBe(3);

      const vencido = await conAsignacion('INVITADO', { rolId: caja });
      await e.sembrar.invitacion(t, vencido.membresiaId, activo.usuarioId, new Date(Date.now() - HORA));
      await conAsignacion('SUSPENDIDO', { rolId: caja });
      await conAsignacion('FINALIZADO', { rolId: caja });
      await conAsignacion('ACTIVO', { rolId: gym });
      const revocado = await conAsignacion('ACTIVO', { rolId: caja });
      await e.dataSource.query(`UPDATE seg.asignacion SET revocada_en = now(), motivo_revocacion = 'Cese' WHERE id = $1`, [revocado.asignacionId]);
      const vencida = await e.sembrar.membresia(t, 'ACTIVO');
      await e.sembrar.asignacion(t, vencida.membresiaId, { rolId: caja }, { desde: '2026-01-01', hasta: '2026-01-31' });
      expect(await contar()).toBe(3);

      expect(await contar(invitado.usuarioId)).toBe(2);
    });

    it('no cuenta usuarios de otro tenant', async () => {
      const m = await e.sembrar.membresia(otroTenant, 'ACTIVO');
      const rolAjeno = await e.sembrar.rol(otroTenant, 'REST', 'CAJERO_AJENO', ['rest.caja.cerrar']);
      await e.sembrar.asignacion(otroTenant, m.membresiaId, { rolId: rolAjeno });
      expect(await usados('REST')).toBe(0);
    });
  });

  describe('RepositorioAsignaciones (revocación)', () => {
    it('guarda la revocación y la excluye de vigentesDe y noRevocadasDe', async () => {
      const m = await e.sembrar.membresia(tenant, 'ACTIVO');
      const uno = await e.sembrar.asignacion(tenant, m.membresiaId, { rolId: cajero });
      const dos = await e.sembrar.asignacion(tenant, m.membresiaId, { perfilId: perfilSalon }, { desde: '2026-01-01', hasta: '2026-01-31' });

      await tx(async () => {
        const a = existe(await e.repos.asignaciones.buscar(uno));
        a.revocar('Cambio de puesto', admin.usuarioId, new Date());
        await e.repos.asignaciones.guardar(a);
      });

      const [fila] = await e.dataSource.query('SELECT revocada_por, motivo_revocacion, version FROM seg.asignacion WHERE id = $1', [uno]);
      expect(fila).toEqual({ revocada_por: admin.usuarioId, motivo_revocacion: 'Cambio de puesto', version: '2' });
      const hoy = new Date().toISOString().slice(0, 10);
      expect(await tx(() => e.repos.asignaciones.vigentesDe(m.membresiaId, hoy))).toEqual([]);
      expect((await tx(() => e.repos.asignaciones.noRevocadasDe(m.membresiaId))).map((a) => a.id)).toEqual([dos]);
      expect(await tx(() => e.repos.asignaciones.buscar(uno))).toMatchObject({ revocadaEn: expect.any(Date), revocadaPor: admin.usuarioId });
    });
  });
});
