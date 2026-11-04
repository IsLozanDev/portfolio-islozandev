import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
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
import { ahoraSeg, claimsBase, firmar, JwksLocal, nuevaLlave, type Llave } from './support/jwks-local.js';
import { describeConDb } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CON_MFA = { aal: 'aal2', amr: [{ method: 'totp', timestamp: ahoraSeg() - 60 }] };
const SIMULAR_SUPABASE = new URL('../../../../tools/migrar/test/fixtures/simular-supabase.sql', import.meta.url);
const HOOK = new URL('../../../../supabase/migrations/20261102000000_seg_supabase_auth.sql', import.meta.url);

interface Actor {
  usuarioId: string;
  tenantId: string;
  sucursalId: string;
}

/** Pila completa con el hook real (spec 18): entrar y salir como soporte y `mi-contexto` del agente. */
describeConDb('API de sesión de soporte (spec 18; PostgreSQL 16 y Redis 7)', () => {
  let e: Entorno;
  let app: INestApplication;
  let operador: string;
  let cliente: string;
  let sucursalCliente: string;
  let ana: Actor;
  let javier: Actor;
  let lucia: Actor;
  let rolSoporte: string;
  let accesoId: string;
  const jwks = new JwksLocal();
  let llave: Llave;

  const llamar = async (actor: Actor, metodo: 'get' | 'post', ruta: string, cuerpo?: object, tenantId = actor.tenantId, sucursalId = actor.sucursalId) => {
    const token = await firmar(llave, claimsBase({ sub: actor.usuarioId, tenant_id: tenantId, ...CON_MFA }));
    const peticion = request(app.getHttpServer())[metodo](ruta).set('Authorization', `Bearer ${token}`).set('X-Sucursal-Id', sucursalId);
    return cuerpo ? peticion.send(cuerpo) : peticion;
  };
  /** El agente con un token ya refrescado al tenant del cliente. */
  const enCliente = (agente: Actor, metodo: 'get' | 'post', ruta: string) => llamar(agente, metodo, ruta, undefined, cliente, sucursalCliente);
  const tenantDelToken = async (usuarioId: string): Promise<string | null> =>
    (await e.dataSource.query('SELECT seg.tenant_para_token($1) AS tenant', [usuarioId]))[0].tenant;

  async function miembro(tenantId: string, sucursalId: string, rolId: string, propietario = false): Promise<Actor> {
    const { membresiaId, usuarioId } = await e.sembrar.membresia(tenantId, 'ACTIVO', propietario);
    await e.sembrar.asignacion(tenantId, membresiaId, { rolId });
    return { usuarioId, tenantId, sucursalId };
  }

  async function sembrarMenuDeSeguridad(): Promise<void> {
    const [{ id: modulo }] = await e.dataSource.query(
      "INSERT INTO seg.modulo (id, producto_codigo, codigo, nombre) VALUES (gen_random_uuid(), 'PLAT', 'seguridad', 'Seguridad') RETURNING id",
    );
    const [{ id: agrupadora }] = await e.dataSource.query(
      "INSERT INTO seg.opcion (id, modulo_id, codigo, nombre, orden) VALUES (gen_random_uuid(), $1, 'plat.seguridad', 'Seguridad', 1) RETURNING id",
      [modulo],
    );
    const hijas: [string, string, string][] = [
      ['plat.seguridad.usuarios', '/admin/usuarios', 'plat.usuario.invitar'],
      ['plat.seguridad.bitacora', '/admin/bitacora', 'plat.seguridad.bitacora'],
    ];
    for (const [indice, [codigo, ruta, permiso]] of hijas.entries()) {
      const [{ id }] = await e.dataSource.query(
        'INSERT INTO seg.opcion (id, modulo_id, padre_id, codigo, nombre, ruta, orden) VALUES (gen_random_uuid(), $1, $2, $3, $3, $4, $5) RETURNING id',
        [modulo, agrupadora, codigo, ruta, indice + 1],
      );
      await e.dataSource.query('INSERT INTO seg.opcion_permiso (opcion_id, permiso_codigo) VALUES ($1, $2)', [id, permiso]);
    }
  }

  beforeAll(async () => {
    e = await crearEntorno();
    await e.dataSource.query(await readFile(SIMULAR_SUPABASE, 'utf8'));
    await e.dataSource.query(await readFile(HOOK, 'utf8'));
    await e.sembrar.permiso('plat.soporte.solicitar', { alcanceMinimo: 'TENANT' });
    await e.sembrar.permiso('plat.soporte.autorizar', { alcanceMinimo: 'TENANT', sensible: true });
    await e.sembrar.permiso('plat.usuario.invitar', { alcanceMinimo: 'SUCURSAL' });
    await e.sembrar.permiso('plat.seguridad.bitacora', { alcanceMinimo: 'TENANT' });
    await e.sembrar.rol(null, 'PLAT', 'PLAT_PROPIETARIO', ['plat.soporte.autorizar', 'plat.usuario.invitar', 'plat.seguridad.bitacora']);
    await sembrarMenuDeSeguridad();

    operador = await e.sembrar.tenant();
    cliente = await e.sembrar.tenant();
    const [{ codigo: codigoOperador }] = await e.dataSource.query('SELECT codigo FROM org.tenant WHERE id = $1', [operador]);
    const {
      sucursales: [sucursalOperador],
    } = await e.sembrar.organizacion(operador);
    ({
      sucursales: [sucursalCliente],
    } = await e.sembrar.organizacion(cliente));
    const agente = await e.sembrar.rol(operador, 'PLAT', 'AGENTE', ['plat.soporte.solicitar']);
    const autorizador = await e.sembrar.rol(cliente, 'PLAT', 'AUTORIZADOR', ['plat.soporte.autorizar']);
    rolSoporte = await e.sembrar.rol(cliente, 'PLAT', 'SOPORTE_PLAT', ['plat.usuario.invitar', 'plat.seguridad.bitacora']);
    javier = await miembro(operador, sucursalOperador, agente);
    lucia = await miembro(operador, sucursalOperador, agente);
    ana = await miembro(cliente, sucursalCliente, autorizador, true);
    // Al aceptar su invitación, el agente quedó con el operador como preferido (spec 08).
    await e.dataSource.query('UPDATE seg.usuario SET tenant_preferido = $2 WHERE id = ANY($1)', [[javier.usuarioId, lucia.usuarioId], operador]);

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

    const solicitud = await llamar(javier, 'post', '/seg/soporte/solicitudes', {
      tenant_id: cliente,
      ticket: 'SOP-000245',
      motivo: 'Revisar usuarios invitados',
      modo: 'LECTURA',
      horas: 2,
    });
    accesoId = solicitud.body.id;
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

  it('con una solicitud pendiente, entrar da 409 SOPORTE_NO_VIGENTE', async () => {
    const respuesta = await llamar(javier, 'post', `/seg/soporte/accesos/${accesoId}/entrar`);
    expect([respuesta.status, respuesta.body.codigo]).toEqual([409, 'SOPORTE_NO_VIGENTE']);
  });

  it('aprobado, el token sigue en el operador hasta que el agente entra', async () => {
    const aprobado = await llamar(ana, 'post', `/seg/soporte/solicitudes/${accesoId}/aprobar`, { horas: 2, rol_id: rolSoporte });
    expect(aprobado.status).toBe(200);
    expect(await tenantDelToken(javier.usuarioId)).toBe(operador);
  });

  it('el acceso de otro agente da 404 SOPORTE_NO_ENCONTRADO', async () => {
    const respuesta = await llamar(lucia, 'post', `/seg/soporte/accesos/${accesoId}/entrar`);
    expect([respuesta.status, respuesta.body.codigo]).toEqual([404, 'SOPORTE_NO_ENCONTRADO']);
  });

  it('entrar fija el preferido: el próximo token trae el tenant del cliente', async () => {
    const respuesta = await llamar(javier, 'post', `/seg/soporte/accesos/${accesoId}/entrar`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.tenant_id).toBe(cliente);
    expect(await tenantDelToken(javier.usuarioId)).toBe(cliente);
  });

  it('mi-contexto del agente trae el banner y no trae lo vetado', async () => {
    const respuesta = await enCliente(javier, 'get', '/seg/mi-contexto');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.soporte).toEqual({ acceso_id: accesoId, ticket: 'SOP-000245', modo: 'LECTURA', hasta: expect.any(String) });
    expect(respuesta.body.permisos).toEqual(['plat.seguridad.bitacora']);
    expect(respuesta.body.menu.map((opcion: { codigo: string }) => opcion.codigo)).toEqual(['plat.seguridad', 'plat.seguridad.bitacora']);
  });

  it('mi-contexto de un miembro normal no trae soporte', async () => {
    const respuesta = await llamar(ana, 'get', '/seg/mi-contexto');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.soporte).toBeNull();
  });

  it('salir, sin plat.soporte.solicitar en el cliente, devuelve el token al operador y es idempotente', async () => {
    expect((await enCliente(javier, 'post', '/seg/soporte/salir')).status).toBe(204);
    expect(await tenantDelToken(javier.usuarioId)).toBe(operador);
    expect((await enCliente(javier, 'post', '/seg/soporte/salir')).status).toBe(204);
    expect(await tenantDelToken(javier.usuarioId)).toBe(operador);
  });

  it('revocado, mi-contexto deja de traer soporte al instante y el token cae al operador', async () => {
    await llamar(javier, 'post', `/seg/soporte/accesos/${accesoId}/entrar`);
    expect((await enCliente(javier, 'get', '/seg/mi-contexto')).body.soporte).not.toBeNull();

    const revocado = await llamar(ana, 'post', `/seg/soporte/accesos/${accesoId}/revocar`, { motivo: 'Ya se resolvió', confirmar: true });
    expect(revocado.status).toBe(204);

    // La sucursal que traía ya no es accesible (la membresía quedó FINALIZADO): el front vuelve a pedir sin ella.
    const conSucursal = await enCliente(javier, 'get', '/seg/mi-contexto');
    expect([conSucursal.status, conSucursal.body.codigo]).toEqual([403, 'SUCURSAL_NO_ASIGNADA']);
    const token = await firmar(llave, claimsBase({ sub: javier.usuarioId, tenant_id: cliente }));
    const contexto = await request(app.getHttpServer()).get('/seg/mi-contexto').set('Authorization', `Bearer ${token}`);
    expect(contexto.body).toMatchObject({ soporte: null, permisos: [], sin_accesos: true });
    expect(await tenantDelToken(javier.usuarioId)).toBe(operador);
    const entrar = await llamar(javier, 'post', `/seg/soporte/accesos/${accesoId}/entrar`);
    expect([entrar.status, entrar.body.codigo]).toEqual([409, 'SOPORTE_NO_VIGENTE']);
  });
});
