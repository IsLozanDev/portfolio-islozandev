import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import { PROVEEDOR_IDENTIDAD } from '../src/application/ports/proveedor-identidad.port.js';
import { REGISTRO_ACCESO } from '../src/application/ports/registro-acceso.port.js';
import { registrarEsquemasSeg } from '../src/infrastructure/event-schemas.js';
import { CachePermisosRedis, crearClienteRedis } from '../src/infrastructure/redis/cache-permisos.redis.js';
import { SeguridadModule } from '../src/seguridad.module.js';
import { ProveedorIdentidadFalso } from './support/proveedor-identidad.falso.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { claimsBase, firmar, JwksLocal, nuevaLlave, type Llave } from './support/jwks-local.js';
import { describeConDb } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

interface Actor {
  usuarioId: string;
  tenantId: string;
  sucursalId: string;
}

/** Pila completa: guards reales, PermisoGuard con caché Redis y base temporal (spec 18, TR-RF-020 paso 1). */
describeConDb('API de solicitud de soporte (spec 18; PostgreSQL 16 y Redis 7)', () => {
  let e: Entorno;
  let app: INestApplication;
  let operador: string;
  let clienteA: string;
  let clienteB: string;
  let javier: Actor;
  let lucia: Actor;
  let propietarioDeA: Actor;
  const jwks = new JwksLocal();
  let llave: Llave;

  const solicitud = (cambios: Record<string, unknown> = {}) => ({
    tenant_id: clienteA,
    ticket: 'SOP-000245',
    motivo: 'Revisar series de boletas',
    modo: 'LECTURA',
    horas: 2,
    ...cambios,
  });
  const token = (actor: Actor) => firmar(llave, claimsBase({ sub: actor.usuarioId, tenant_id: actor.tenantId }));
  const solicitar = async (actor: Actor, cuerpo: object) =>
    request(app.getHttpServer())
      .post('/seg/soporte/solicitudes')
      .set('Authorization', `Bearer ${await token(actor)}`)
      .set('X-Sucursal-Id', actor.sucursalId)
      .send(cuerpo);
  const misAccesos = async (actor: Actor) =>
    request(app.getHttpServer())
      .get('/seg/soporte/mis-accesos')
      .set('Authorization', `Bearer ${await token(actor)}`)
      .set('X-Sucursal-Id', actor.sucursalId);

  async function agenteEn(tenantId: string, sucursalId: string, rolId: string): Promise<Actor> {
    const { membresiaId, usuarioId } = await e.sembrar.membresia(tenantId, 'ACTIVO');
    await e.sembrar.asignacion(tenantId, membresiaId, { rolId });
    return { usuarioId, tenantId, sucursalId };
  }

  beforeAll(async () => {
    e = await crearEntorno();
    await e.sembrar.permiso('plat.soporte.solicitar', { alcanceMinimo: 'TENANT' });
    operador = await e.sembrar.tenant();
    clienteA = await e.sembrar.tenant();
    clienteB = await e.sembrar.tenant();
    const [{ codigo: codigoOperador }] = await e.dataSource.query('SELECT codigo FROM org.tenant WHERE id = $1', [operador]);
    const {
      sucursales: [sucursalOperador],
    } = await e.sembrar.organizacion(operador);
    const {
      sucursales: [sucursalA],
    } = await e.sembrar.organizacion(clienteA);
    const agenteDeSoporte = await e.sembrar.rol(operador, 'PLAT', 'AGENTE', ['plat.soporte.solicitar']);
    const solicitanteEnA = await e.sembrar.rol(clienteA, 'PLAT', 'AGENTE_A', ['plat.soporte.solicitar']);
    javier = await agenteEn(operador, sucursalOperador, agenteDeSoporte);
    lucia = await agenteEn(operador, sucursalOperador, agenteDeSoporte);
    propietarioDeA = await agenteEn(clienteA, sucursalA, solicitanteEnA);
    // Lucía además es miembro normal del cliente B.
    await e.dataSource.query(`INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado) VALUES ($1, $2, $3, 'ACTIVO')`, [e.ids.next(), lucia.usuarioId, clienteB]);

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
    for (const tenantId of [operador, clienteA]) await cache.invalidarTenant(tenantId).catch(() => undefined);
    redis.disconnect();
    await app?.close();
    await jwks.detener();
    await e?.cerrar();
  });

  it('el agente del operador solicita: PENDIENTE en el cliente, bitácora SOLICITADO y soporte.solicitado', async () => {
    const respuesta = await solicitar(javier, solicitud());

    expect(respuesta.status).toBe(201);
    const { id } = respuesta.body;
    const [fila] = await e.dataSource.query('SELECT tenant_id, agente_id, estado, ticket, horas_solicitadas FROM seg.acceso_soporte WHERE id = $1', [id]);
    expect(fila).toEqual({ tenant_id: clienteA, agente_id: javier.usuarioId, estado: 'PENDIENTE', ticket: 'SOP-000245', horas_solicitadas: 2 });
    const [evento] = await e.dataSource.query(
      `SELECT usuario_id, detalle FROM seg.evento_seguridad WHERE tenant_id = $1 AND tipo = 'ACCESO_SOPORTE' AND detalle ->> 'acceso_id' = $2`,
      [clienteA, id],
    );
    expect(evento).toEqual({ usuario_id: javier.usuarioId, detalle: { accion: 'SOLICITADO', acceso_id: id, ticket: 'SOP-000245', modo: 'LECTURA', horas: 2 } });
    expect(await e.eventosDe(id)).toEqual([['soporte.solicitado', 1]]);
  });

  it('una segunda solicitud abierta al mismo tenant da 409 SOPORTE_ABIERTO_EXISTENTE', async () => {
    const respuesta = await solicitar(javier, solicitud({ ticket: 'SOP-000246' }));
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.codigo).toBe('SOPORTE_ABIERTO_EXISTENTE');
  });

  it('un agente que ya es miembro del tenant da 409 SOPORTE_AGENTE_ES_MIEMBRO', async () => {
    const respuesta = await solicitar(lucia, solicitud({ tenant_id: clienteB }));
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.codigo).toBe('SOPORTE_AGENTE_ES_MIEMBRO');
  });

  it('desde un tenant que no es el operador da 403 OPERADOR_REQUERIDO', async () => {
    const respuesta = await solicitar(propietarioDeA, solicitud({ tenant_id: clienteB }));
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.codigo).toBe('OPERADOR_REQUERIDO');
  });

  it('pedir 8 horas da 400 «La vigencia máxima es 4 horas» (TR-CA-054)', async () => {
    const respuesta = await solicitar(lucia, solicitud({ horas: 8 }));
    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'VIGENCIA_SOPORTE_EXCEDIDA', mensaje: 'La vigencia máxima es 4 horas' });
  });

  it.each([
    ['ticket SOP-12', { ticket: 'SOP-12' }, 'TICKET_INVALIDO'],
    ['motivo de 9 caracteres', { motivo: 'Revisar 1' }, 'MOTIVO_SOPORTE_INVALIDO'],
    ['0 horas', { horas: 0 }, 'VIGENCIA_SOPORTE_INVALIDA'],
    ['modo desconocido', { modo: 'TOTAL' }, 'SOLICITUD_INVALIDA'],
    ['tenant que no es uuid', { tenant_id: 'cliente-a' }, 'SOLICITUD_INVALIDA'],
  ])('%s da 400 %s', async (_caso, cambios, codigo) => {
    const respuesta = await solicitar(lucia, solicitud(cambios));
    expect([respuesta.status, respuesta.body.codigo]).toEqual([400, codigo]);
  });

  it('un tenant que no existe da 404 NO_ENCONTRADO', async () => {
    const respuesta = await solicitar(lucia, solicitud({ tenant_id: e.ids.next() }));
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.codigo).toBe('NO_ENCONTRADO');
  });

  it('mis-accesos devuelve los del agente con el nombre del tenant, y nada de otros agentes', async () => {
    const deJavier = await misAccesos(javier);
    expect(deJavier.status).toBe(200);
    expect(deJavier.body).toEqual([
      expect.objectContaining({ tenant_id: clienteA, tenant_nombre: 'Tenant de prueba', ticket: 'SOP-000245', estado: 'PENDIENTE', desde: null, hasta: null }),
    ]);
    expect((await misAccesos(lucia)).body).toEqual([]);
  });
});
