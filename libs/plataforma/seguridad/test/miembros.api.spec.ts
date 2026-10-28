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
const RUTAS_DE_LECTURA = ['/seg/miembros', '/seg/asignables'];

/** Pila completa: guards reales, PermisoGuard con caché Redis y base temporal (spec 16a). */
describeConDb('API de miembros (spec 16a; PostgreSQL 16 y Redis 7)', () => {
  let e: Entorno;
  let app: INestApplication;
  let tenant: string;
  let sucursal: string;
  let cajero: string;
  let ana: { membresiaId: string; usuarioId: string };
  let luis: { membresiaId: string; usuarioId: string };
  const jwks = new JwksLocal();
  let llave: Llave;

  const comoUsuario = async (usuarioId: string, ruta: string) =>
    request(app.getHttpServer())
      .get(ruta)
      .set('Authorization', `Bearer ${await firmar(llave, claimsBase({ sub: usuarioId, tenant_id: tenant }))}`)
      .set('X-Sucursal-Id', sucursal);

  beforeAll(async () => {
    e = await crearEntorno();
    await e.sembrar.permiso('rest.caja.cerrar', { alcanceMinimo: 'SUCURSAL' });
    await e.sembrar.permiso('plat.usuario.invitar', { alcanceMinimo: 'SUCURSAL' });
    tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST');
    ({ sucursales: [sucursal] } = await e.sembrar.organizacion(tenant));
    cajero = await e.sembrar.rol(tenant, 'REST', 'CAJERO', ['rest.caja.cerrar']);
    const administrador = await e.sembrar.rol(tenant, 'PLAT', 'ADMIN_USUARIOS', ['plat.usuario.invitar']);
    ana = await e.sembrar.membresia(tenant, 'ACTIVO', true);
    await e.sembrar.asignacion(tenant, ana.membresiaId, { rolId: administrador });
    luis = await e.sembrar.membresia(tenant, 'ACTIVO');
    await e.sembrar.asignacion(tenant, luis.membresiaId, { rolId: cajero }, {}, { alcance: 'SUCURSAL', sucursalId: sucursal });

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

  it('sin plat.usuario.invitar, la lista, el detalle y los asignables responden 403 SIN_PERMISO', async () => {
    for (const ruta of [...RUTAS_DE_LECTURA, `/seg/miembros/${ana.membresiaId}`]) {
      const respuesta = await comoUsuario(luis.usuarioId, ruta);
      expect([ruta, respuesta.status, respuesta.body.codigo]).toEqual([ruta, 403, 'SIN_PERMISO']);
    }
  });

  it('con el permiso, lista los miembros del tenant y los asignables del producto contratado', async () => {
    const lista = await comoUsuario(ana.usuarioId, '/seg/miembros');
    expect(lista.status).toBe(200);
    expect(lista.body.total).toBe(2);
    expect(lista.body.items.map((miembro: { membresia_id: string }) => miembro.membresia_id).sort()).toEqual([ana.membresiaId, luis.membresiaId].sort());

    const asignables = await comoUsuario(ana.usuarioId, '/seg/asignables');
    expect(asignables.status).toBe(200);
    expect(asignables.body.roles).toEqual([{ id: cajero, codigo: 'CAJERO', nombre: 'CAJERO', producto_codigo: 'REST', sensible: false }]);
  });

  it('el detalle de Luis trae su asignación en Miraflores', async () => {
    const detalle = await comoUsuario(ana.usuarioId, `/seg/miembros/${luis.membresiaId}`);

    expect(detalle.status).toBe(200);
    expect(detalle.body.asignaciones).toEqual([
      expect.objectContaining({ rol: { id: cajero, nombre: 'CAJERO' }, alcance: 'SUCURSAL', sucursal: { id: sucursal, nombre: 'Miraflores' }, estado: 'VIGENTE' }),
    ]);
  });

  it('una membresía de otro tenant responde 404 NO_ENCONTRADO', async () => {
    const otro = await e.sembrar.tenant();
    const ajena = await e.sembrar.membresia(otro, 'ACTIVO');

    const respuesta = await comoUsuario(ana.usuarioId, `/seg/miembros/${ajena.membresiaId}`);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'La membresía no existe' });
  });
});
