import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import { RevocarAccesosPorTicket } from '../src/application/cerrar-acceso-soporte.js';
import { PROVEEDOR_IDENTIDAD } from '../src/application/ports/proveedor-identidad.port.js';
import { REGISTRO_ACCESO } from '../src/application/ports/registro-acceso.port.js';
import { registrarEsquemasSeg } from '../src/infrastructure/event-schemas.js';
import { CachePermisosRedis, crearClienteRedis } from '../src/infrastructure/redis/cache-permisos.redis.js';
import { SeguridadModule } from '../src/seguridad.module.js';
import { ProveedorIdentidadFalso } from './support/proveedor-identidad.falso.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { ahoraSeg, claimsBase, firmar, JwksLocal, nuevaLlave, type Llave } from './support/jwks-local.js';
import { describeConDb } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const HORA = 3_600_000;
const CON_MFA = { aal: 'aal2', amr: [{ method: 'totp', timestamp: ahoraSeg() - 60 }] };

interface Actor {
  usuarioId: string;
  tenantId: string;
  sucursalId: string;
}

/** Pila completa (spec 18, TR-RF-020 pasos 2, 3 y 5): aprobar, rechazar, revocar y cerrar por ticket. */
describeConDb('API de aprobación y cierre de soporte (spec 18; PostgreSQL 16 y Redis 7)', () => {
  let e: Entorno;
  let app: INestApplication;
  let operador: string;
  let cliente: string;
  let sucursalCliente: string;
  let ana: Actor;
  let javier: Actor;
  let lucia: Actor;
  let rolSoporteRest: string;
  let rolFueraDelTecho: string;
  const jwks = new JwksLocal();
  let llave: Llave;

  const llamar = async (actor: Actor, metodo: 'get' | 'post', ruta: string, cuerpo?: object, mfa = true) => {
    const token = await firmar(llave, claimsBase({ sub: actor.usuarioId, tenant_id: actor.tenantId, ...(mfa ? CON_MFA : {}) }));
    const peticion = request(app.getHttpServer())[metodo](ruta).set('Authorization', `Bearer ${token}`).set('X-Sucursal-Id', actor.sucursalId);
    return cuerpo ? peticion.send(cuerpo) : peticion;
  };
  const solicitar = async (agente: Actor, ticket: string): Promise<string> => {
    const respuesta = await llamar(agente, 'post', '/seg/soporte/solicitudes', {
      tenant_id: cliente,
      ticket,
      motivo: 'Revisar series de boletas',
      modo: 'LECTURA',
      horas: 2,
    });
    expect(respuesta.status).toBe(201);
    return respuesta.body.id;
  };
  const aprobar = (accesoId: string, cuerpo: object, mfa = true) => llamar(ana, 'post', `/seg/soporte/solicitudes/${accesoId}/aprobar`, cuerpo, mfa);
  const fila = async (accesoId: string) =>
    (await e.dataSource.query('SELECT estado, causa_cierre, cerrado_por, membresia_id, asignacion_id, desde, hasta FROM seg.acceso_soporte WHERE id = $1', [accesoId]))[0];
  const membresiaDe = async (usuarioId: string) =>
    (await e.dataSource.query('SELECT id, estado, desde, hasta, cambiado_por FROM seg.membresia WHERE usuario_id = $1 AND tenant_id = $2', [usuarioId, cliente]))[0];
  const permisosEnCliente = (usuarioId: string): Promise<string[]> =>
    e.en(cliente, () =>
      e.uow.run(async () =>
        (await e.uow.manager.query('SELECT permiso_codigo FROM seg.permisos_efectivos($1, $2, $3) ORDER BY 1', [usuarioId, cliente, sucursalCliente])).map(
          (f: { permiso_codigo: string }) => f.permiso_codigo,
        ),
      ),
    );
  const bitacora = async (accesoId: string) =>
    (
      await e.dataSource.query(
        `SELECT tipo, usuario_id, detalle ->> 'accion' AS accion FROM seg.evento_seguridad WHERE tenant_id = $1 AND detalle ->> 'acceso_id' = $2 ORDER BY id`,
        [cliente, accesoId],
      )
    ).map((f: { tipo: string; accion: string | null; usuario_id: string | null }) => [f.tipo, f.accion, f.usuario_id]);

  async function miembro(tenantId: string, sucursalId: string, rolId: string, propietario = false): Promise<Actor> {
    const { membresiaId, usuarioId } = await e.sembrar.membresia(tenantId, 'ACTIVO', propietario);
    await e.sembrar.asignacion(tenantId, membresiaId, { rolId });
    return { usuarioId, tenantId, sucursalId };
  }

  beforeAll(async () => {
    e = await crearEntorno();
    await e.sembrar.permiso('plat.soporte.solicitar', { alcanceMinimo: 'TENANT' });
    await e.sembrar.permiso('plat.soporte.autorizar', { alcanceMinimo: 'TENANT', sensible: true });
    await e.sembrar.permiso('plat.tenant.consultar', { alcanceMinimo: 'TENANT' });
    await e.sembrar.permiso('rest.caja.ver', { alcanceMinimo: 'SUCURSAL' });
    // Techo PLAT del cliente (spec 16b): lo que tiene PLAT_PROPIETARIO.
    await e.sembrar.rol(null, 'PLAT', 'PLAT_PROPIETARIO', ['plat.soporte.autorizar']);
    rolFueraDelTecho = await e.sembrar.rol(null, 'PLAT', 'PLAT_ADMIN_TENANTS', ['plat.tenant.consultar']);

    operador = await e.sembrar.tenant();
    cliente = await e.sembrar.tenant();
    await e.sembrar.suscripcion(cliente, 'REST');
    const [{ codigo: codigoOperador }] = await e.dataSource.query('SELECT codigo FROM org.tenant WHERE id = $1', [operador]);
    const {
      sucursales: [sucursalOperador],
    } = await e.sembrar.organizacion(operador);
    ({
      sucursales: [sucursalCliente],
    } = await e.sembrar.organizacion(cliente));
    const agente = await e.sembrar.rol(operador, 'PLAT', 'AGENTE', ['plat.soporte.solicitar']);
    const autorizador = await e.sembrar.rol(cliente, 'PLAT', 'AUTORIZADOR', ['plat.soporte.autorizar']);
    rolSoporteRest = await e.sembrar.rol(cliente, 'REST', 'SOPORTE_REST', ['rest.caja.ver']);
    javier = await miembro(operador, sucursalOperador, agente);
    lucia = await miembro(operador, sucursalOperador, agente);
    ana = await miembro(cliente, sucursalCliente, autorizador, true);

    llave = await nuevaLlave('kid-1');
    const jwksUrl = await jwks.iniciar();
    jwks.publicar(llave);
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasSeg(validator);
    const modulo = await Test.createTestingModule({
      imports: [
        KernelInfraModule.register({ dataSource: e.dataSource, validator }),
        SeguridadModule.register({
          supabaseUrl: 'https://proyecto-prueba.supabase.co',
          mfaMaxEdadSeg: 900,
          dataSource: e.dataSource,
          redisUrl: REDIS_URL,
          jwksUrl,
          tenantOperador: codigoOperador,
          invitaciones: { supabaseSecretKey: 'sb_secret_prueba', url: 'https://app.vitrina.pe/auth/invitacion' },
        }),
      ],
    })
      .overrideProvider(REGISTRO_ACCESO)
      .useValue({ marcar: async () => undefined })
      .overrideProvider(PROVEEDOR_IDENTIDAD)
      .useValue(new ProveedorIdentidadFalso(e.dataSource))
      .compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    const redis = crearClienteRedis(REDIS_URL);
    const cache = new CachePermisosRedis(redis);
    for (const tenantId of [operador, cliente]) await cache.invalidarTenant(tenantId).catch(() => undefined);
    redis.disconnect();
    await app?.close();
    await jwks.detener();
    await e?.cerrar();
  });

  describe('Javier por SOP-000245', () => {
    let accesoId: string;

    beforeAll(async () => {
      accesoId = await solicitar(javier, 'SOP-000245');
    });

    it('la bandeja lista la pendiente con el agente y la insignia cuenta 1', async () => {
      const bandeja = await llamar(ana, 'get', '/seg/soporte/solicitudes?estado=PENDIENTE');
      expect(bandeja.status).toBe(200);
      expect(bandeja.body.total).toBe(1);
      expect(bandeja.body.items[0]).toMatchObject({ id: accesoId, ticket: 'SOP-000245', estado: 'PENDIENTE', agente: { id: javier.usuarioId } });
      expect((await llamar(ana, 'get', '/seg/soporte/solicitudes/pendientes')).body).toEqual({ total: 1 });
    });

    it('aprobar sin MFA responde 401 MFA_REQUERIDA (permiso sensible)', async () => {
      const respuesta = await aprobar(accesoId, { horas: 2, rol_id: rolSoporteRest }, false);
      expect(respuesta.status).toBe(401);
      expect(respuesta.body.codigo).toBe('MFA_REQUERIDA');
    });

    it('aprobar por 8 horas da 400 y no cambia nada (TR-CA-054)', async () => {
      const respuesta = await aprobar(accesoId, { horas: 8, rol_id: rolSoporteRest });
      expect(respuesta.status).toBe(400);
      expect(respuesta.body).toEqual({ codigo: 'VIGENCIA_SOPORTE_EXCEDIDA', mensaje: 'La vigencia máxima es 4 horas' });
      expect((await fila(accesoId)).estado).toBe('PENDIENTE');
    });

    it('un rol PLAT fuera del techo del cliente da 400 ROL_FUERA_DEL_TECHO', async () => {
      const respuesta = await aprobar(accesoId, { horas: 2, rol_id: rolFueraDelTecho });
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.codigo).toBe('ROL_FUERA_DEL_TECHO');
    });

    it('aprobar por 2 horas: acceso, membresía, asignación TENANT, bitácora y eventos (TR-CA-053)', async () => {
      const respuesta = await aprobar(accesoId, { horas: 2, rol_id: rolSoporteRest });

      expect(respuesta.status).toBe(200);
      expect(new Date(respuesta.body.hasta).getTime() - new Date(respuesta.body.desde).getTime()).toBe(2 * HORA);
      const acceso = await fila(accesoId);
      expect(acceso.estado).toBe('APROBADO');
      const membresia = await membresiaDe(javier.usuarioId);
      expect(membresia).toMatchObject({ id: acceso.membresia_id, estado: 'ACTIVO' });
      expect(membresia.hasta.getTime()).toBe(acceso.hasta.getTime());
      const [asignacion] = await e.dataSource.query('SELECT alcance, rol_id, otorgado_por FROM seg.asignacion WHERE id = $1', [acceso.asignacion_id]);
      expect(asignacion).toEqual({ alcance: 'TENANT', rol_id: rolSoporteRest, otorgado_por: ana.usuarioId });
      expect(await permisosEnCliente(javier.usuarioId)).toEqual(['rest.caja.ver']);
      expect(await bitacora(accesoId)).toEqual([
        ['ACCESO_SOPORTE', 'SOLICITADO', javier.usuarioId],
        ['ACCESO_SOPORTE', 'APROBADO', ana.usuarioId],
        ['ASIGNACION_OTORGADA', null, ana.usuarioId],
      ]);
      expect(await e.eventosDe(accesoId)).toEqual([
        ['soporte.solicitado', 1],
        ['soporte.aprobado', 2],
      ]);
      expect(await e.eventosDe(acceso.membresia_id)).toEqual([['membresia.soporte_abierta', 1]]);
    });

    it('al pasar hasta pierde los permisos aunque la membresía siga ACTIVO (TR-CA-053)', async () => {
      const { membresia_id: membresiaId } = await fila(accesoId);
      await e.dataSource.query(`UPDATE seg.membresia SET desde = now() - interval '3 hours', hasta = now() - interval '1 minute' WHERE id = $1`, [membresiaId]);
      expect(await permisosEnCliente(javier.usuarioId)).toEqual([]);
      await e.dataSource.query(`UPDATE seg.membresia SET hasta = now() + interval '2 hours' WHERE id = $1`, [membresiaId]);
    });

    it('aprobar otra vez da 409 TRANSICION_SOPORTE_INVALIDA', async () => {
      const respuesta = await aprobar(accesoId, { horas: 2, rol_id: rolSoporteRest });
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.codigo).toBe('TRANSICION_SOPORTE_INVALIDA');
    });

    it('revocar exige confirmar: true', async () => {
      const respuesta = await llamar(ana, 'post', `/seg/soporte/accesos/${accesoId}/revocar`, { motivo: 'Ya se resolvió' });
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.codigo).toBe('CONFIRMACION_REQUERIDA');
    });

    it('revocar deja REVOCADO, la membresía FINALIZADO y la asignación revocada, en la misma transacción', async () => {
      const respuesta = await llamar(ana, 'post', `/seg/soporte/accesos/${accesoId}/revocar`, { motivo: 'Ya se resolvió', confirmar: true });

      expect(respuesta.status).toBe(204);
      const acceso = await fila(accesoId);
      expect(acceso).toMatchObject({ estado: 'REVOCADO', causa_cierre: 'ADMINISTRADOR', cerrado_por: ana.usuarioId });
      expect(await membresiaDe(javier.usuarioId)).toMatchObject({ estado: 'FINALIZADO', cambiado_por: ana.usuarioId });
      const [asignacion] = await e.dataSource.query('SELECT revocada_por, motivo_revocacion FROM seg.asignacion WHERE id = $1', [acceso.asignacion_id]);
      expect(asignacion).toEqual({ revocada_por: ana.usuarioId, motivo_revocacion: 'Ya se resolvió' });
      expect(await permisosEnCliente(javier.usuarioId)).toEqual([]);
      expect((await bitacora(accesoId)).at(-1)).toEqual(['ACCESO_SOPORTE', 'REVOCADO', ana.usuarioId]);
    });
  });

  describe('un segundo acceso de Javier reusa la membresía y se cierra por ticket', () => {
    let accesoId: string;
    let membresiaPrevia: string;

    beforeAll(async () => {
      membresiaPrevia = (await membresiaDe(javier.usuarioId)).id;
      accesoId = await solicitar(javier, 'SOP-000250');
    });

    it('aprobar reabre la misma membresía FINALIZADO', async () => {
      const respuesta = await aprobar(accesoId, { horas: 1, rol_id: rolSoporteRest });
      expect(respuesta.status).toBe(200);
      expect(await membresiaDe(javier.usuarioId)).toMatchObject({ id: membresiaPrevia, estado: 'ACTIVO' });
      expect((await fila(accesoId)).membresia_id).toBe(membresiaPrevia);
      expect(await permisosEnCliente(javier.usuarioId)).toEqual(['rest.caja.ver']);
    });

    it('cerrar el ticket revoca sin actor y es idempotente (TR-CA-055)', async () => {
      const revocar = app.get(RevocarAccesosPorTicket);

      expect(await revocar.ejecutar(cliente, 'SOP-000250')).toEqual({ cerrados: 1 });
      expect(await fila(accesoId)).toMatchObject({ estado: 'REVOCADO', causa_cierre: 'TICKET_CERRADO', cerrado_por: null });
      expect(await membresiaDe(javier.usuarioId)).toMatchObject({ estado: 'FINALIZADO', cambiado_por: null });
      expect(await permisosEnCliente(javier.usuarioId)).toEqual([]);
      expect((await bitacora(accesoId)).at(-1)).toEqual(['ACCESO_SOPORTE', 'REVOCADO', null]);
      expect(await revocar.ejecutar(cliente, 'SOP-000250')).toEqual({ cerrados: 0 });
    });
  });

  describe('Lucía', () => {
    it('rechazar con motivo deja RECHAZADO y lo registra', async () => {
      const accesoId = await solicitar(lucia, 'SOP-000260');
      const corto = await llamar(ana, 'post', `/seg/soporte/solicitudes/${accesoId}/rechazar`, { motivo: 'No' });
      expect([corto.status, corto.body.codigo]).toEqual([400, 'MOTIVO_INVALIDO']);

      const respuesta = await llamar(ana, 'post', `/seg/soporte/solicitudes/${accesoId}/rechazar`, { motivo: 'No autorizado' });

      expect(respuesta.status).toBe(204);
      expect(await fila(accesoId)).toMatchObject({ estado: 'RECHAZADO', causa_cierre: 'RECHAZO', cerrado_por: ana.usuarioId });
      expect((await bitacora(accesoId)).at(-1)).toEqual(['ACCESO_SOPORTE', 'RECHAZADO', ana.usuarioId]);
      expect(await membresiaDe(lucia.usuarioId)).toBeUndefined();
    });

    it('una solicitud de más de 24 h queda EXPIRADO y aprobarla da 409', async () => {
      const accesoId = await solicitar(lucia, 'SOP-000261');
      await e.dataSource.query(`UPDATE seg.acceso_soporte SET solicitado_en = now() - interval '25 hours', caduca_en = now() - interval '1 hour' WHERE id = $1`, [
        accesoId,
      ]);

      const respuesta = await aprobar(accesoId, { horas: 2, rol_id: rolSoporteRest });

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.codigo).toBe('TRANSICION_SOPORTE_INVALIDA');
      expect(await fila(accesoId)).toMatchObject({ estado: 'EXPIRADO', causa_cierre: 'VENCIMIENTO' });
      expect((await bitacora(accesoId)).at(-1)).toEqual(['ACCESO_SOPORTE', 'EXPIRADO', null]);
    });

    it('el historial filtra varios estados y la insignia ya no cuenta nada', async () => {
      const historial = await llamar(ana, 'get', '/seg/soporte/solicitudes?estado=RECHAZADO,REVOCADO,EXPIRADO');
      expect(historial.status).toBe(200);
      expect(historial.body.total).toBe(4);
      expect((await llamar(ana, 'get', '/seg/soporte/solicitudes?estado=OTRO')).status).toBe(400);
      expect((await llamar(ana, 'get', '/seg/soporte/solicitudes/pendientes')).body).toEqual({ total: 0 });
    });
  });

  it('el agente no ve la bandeja del cliente: 403 SIN_PERMISO', async () => {
    const respuesta = await llamar(javier, 'get', '/seg/soporte/solicitudes');
    expect(respuesta.status).toBe(403);
  });
});
