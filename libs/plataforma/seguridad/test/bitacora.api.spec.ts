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
/** Semana fija en el pasado: los ACCESO_DENEGADO que escribe el guard durante la prueba caen hoy. */
const SEMANA = { desde: '2026-10-19', hasta: '2026-10-25' };

/** Pila completa: guards reales, PermisoGuard con caché Redis y base temporal (spec 18, TR-RF-019). */
describeConDb('API de la bitácora (spec 18; PostgreSQL 16 y Redis 7)', () => {
  let e: Entorno;
  let app: INestApplication;
  let tenant: string;
  let otroTenant: string;
  let sucursal: string;
  let ana: { membresiaId: string; usuarioId: string };
  let luis: { membresiaId: string; usuarioId: string };
  let eventoAjeno: string;
  let eventoAsignacion: string;
  const jwks = new JwksLocal();
  let llave: Llave;

  const comoUsuario = async (usuarioId: string, ruta: string, query: Record<string, string> = {}) =>
    request(app.getHttpServer())
      .get(ruta)
      .query(query)
      .set('Authorization', `Bearer ${await firmar(llave, claimsBase({ sub: usuarioId, tenant_id: tenant }))}`)
      .set('X-Sucursal-Id', sucursal);
  const evento = async (tenantId: string, tipo: string, usuarioId: string, detalle: object, ocurridoEn: string): Promise<string> => {
    const [{ id }] = await e.dataSource.query(
      'INSERT INTO seg.evento_seguridad (tenant_id, usuario_id, tipo, detalle, ocurrido_en) VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id',
      [tenantId, usuarioId, tipo, JSON.stringify(detalle), ocurridoEn],
    );
    return String(id);
  };

  beforeAll(async () => {
    e = await crearEntorno();
    await e.sembrar.permiso('plat.seguridad.bitacora', { alcanceMinimo: 'TENANT' });
    await e.sembrar.permiso('rest.caja.cerrar', { alcanceMinimo: 'SUCURSAL' });
    tenant = await e.sembrar.tenant();
    otroTenant = await e.sembrar.tenant();
    ({ sucursales: [sucursal] } = await e.sembrar.organizacion(tenant));
    const auditor = await e.sembrar.rol(tenant, 'PLAT', 'AUDITOR', ['plat.seguridad.bitacora']);
    const cajero = await e.sembrar.rol(tenant, 'REST', 'CAJERO', ['rest.caja.cerrar']);
    await e.sembrar.suscripcion(tenant, 'REST');
    ana = await e.sembrar.membresia(tenant, 'ACTIVO', true);
    await e.sembrar.asignacion(tenant, ana.membresiaId, { rolId: auditor });
    luis = await e.sembrar.membresia(tenant, 'ACTIVO');
    const asignacionDeLuis = await e.sembrar.asignacion(tenant, luis.membresiaId, { rolId: cajero }, {}, { alcance: 'SUCURSAL', sucursalId: sucursal });
    await e.dataSource.query("UPDATE seg.usuario SET nombre = 'Luis Quispe' WHERE id = $1", [luis.usuarioId]);

    for (let indice = 0; indice < 15; indice += 1) {
      await evento(tenant, 'ACCESO_DENEGADO', luis.usuarioId, { permiso: 'plat.rol.gestionar', ruta: '/v1/seg/roles' }, `2026-10-2${indice % 6}T15:00:00Z`);
    }
    // Como los eventos anteriores al spec 18: solo el id de la asignación, sin destinatario ni rol.
    eventoAsignacion = await evento(tenant, 'ASIGNACION_OTORGADA', ana.usuarioId, { alcance: 'SUCURSAL', asignacion_id: asignacionDeLuis }, '2026-10-21T16:00:00Z');
    eventoAjeno = await evento(otroTenant, 'ACCESO_DENEGADO', luis.usuarioId, { permiso: 'plat.usuario.invitar' }, '2026-10-22T15:00:00Z');

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
    await new CachePermisosRedis(redis).invalidarTenant(tenant).catch(() => undefined);
    redis.disconnect();
    await app?.close();
    await jwks.detener();
    await e?.cerrar();
  });

  it('sin plat.seguridad.bitacora responde 403 SIN_PERMISO', async () => {
    const respuesta = await comoUsuario(luis.usuarioId, '/seg/bitacora', SEMANA);
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.codigo).toBe('SIN_PERMISO');
  });

  it('15 ACCESO_DENEGADO de la semana con usuario, permiso faltante y fecha (TR-CA-051)', async () => {
    const respuesta = await comoUsuario(ana.usuarioId, '/seg/bitacora', { ...SEMANA, tipo: 'ACCESO_DENEGADO' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(15);
    expect(respuesta.body.items).toHaveLength(15);
    for (const item of respuesta.body.items) {
      expect(item).toMatchObject({ tipo: 'ACCESO_DENEGADO', usuario: { id: luis.usuarioId }, resumen: 'plat.rol.gestionar' });
      expect(item.ocurrido_en).toMatch(/^2026-10-2[0-5]T15:00:00.000Z$/);
    }
  });

  it('ACCESO_SOPORTE en septiembre de 2026 no tiene eventos (TR-CA-052)', async () => {
    const respuesta = await comoUsuario(ana.usuarioId, '/seg/bitacora', { desde: '2026-09-01', hasta: '2026-09-30', tipo: 'ACCESO_SOPORTE' });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ items: [], total: 0 });
  });

  it('sin rango responde 400 RANGO_BITACORA_INVALIDO', async () => {
    const respuesta = await comoUsuario(ana.usuarioId, '/seg/bitacora');
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('RANGO_BITACORA_INVALIDO');
  });

  it('nunca devuelve eventos de otro tenant', async () => {
    const lista = await comoUsuario(ana.usuarioId, '/seg/bitacora', SEMANA);
    expect(lista.body.total).toBe(16);
    expect(lista.body.items.map((item: { id: string }) => item.id)).not.toContain(eventoAjeno);

    const detalle = await comoUsuario(ana.usuarioId, `/seg/bitacora/${eventoAjeno}`);
    expect(detalle.status).toBe(404);
    expect(detalle.body.codigo).toBe('NO_ENCONTRADO');
  });

  it('una asignación se resume como «rol → destinatario» y el detalle los trae con nombre', async () => {
    const lista = await comoUsuario(ana.usuarioId, '/seg/bitacora', { ...SEMANA, tipo: 'ASIGNACION_OTORGADA' });
    expect(lista.body.items).toEqual([expect.objectContaining({ id: eventoAsignacion, usuario: expect.objectContaining({ id: ana.usuarioId }), resumen: 'CAJERO → Luis Quispe' })]);

    const detalle = await comoUsuario(ana.usuarioId, `/seg/bitacora/${eventoAsignacion}`);
    expect(detalle.body).toMatchObject({
      destinatario: { id: luis.usuarioId, nombre: 'Luis Quispe' },
      asignado: { tipo: 'ROL', nombre: 'CAJERO' },
    });
  });

  it('el filtro de usuario también encuentra a quien recibió la asignación', async () => {
    const respuesta = await comoUsuario(ana.usuarioId, '/seg/bitacora', { ...SEMANA, tipo: 'ASIGNACION_OTORGADA', usuario: 'quispe' });
    expect(respuesta.body.items.map((item: { id: string }) => item.id)).toEqual([eventoAsignacion]);
  });

  it('un acceso denegado por el guard guarda la IP de la petición', async () => {
    await comoUsuario(luis.usuarioId, '/seg/bitacora', SEMANA);
    const [ultimo] = await e.dataSource.query(
      "SELECT id, host(ip) AS ip FROM seg.evento_seguridad WHERE tipo = 'ACCESO_DENEGADO' AND usuario_id = $1 AND ocurrido_en > now() - interval '1 minute' ORDER BY id DESC LIMIT 1",
      [luis.usuarioId],
    );
    expect(ultimo.ip).toMatch(/127\.0\.0\.1|::1/);

    const detalle = await comoUsuario(ana.usuarioId, `/seg/bitacora/${ultimo.id}`);
    expect(detalle.body.ip).toBe(ultimo.ip);
  });

  it('el detalle de un evento del tenant trae el detalle completo', async () => {
    const [primero] = (await comoUsuario(ana.usuarioId, '/seg/bitacora', { ...SEMANA, tipo: 'ACCESO_DENEGADO', tamano: '1' })).body.items;
    const detalle = await comoUsuario(ana.usuarioId, `/seg/bitacora/${primero.id}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body).toMatchObject({ id: primero.id, ip: null, destinatario: null, asignado: null, detalle: { permiso: 'plat.rol.gestionar', ruta: '/v1/seg/roles' } });
  });
});
