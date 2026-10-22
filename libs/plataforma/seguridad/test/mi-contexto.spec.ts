import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import { REGISTRO_ACCESO } from '../src/application/ports/registro-acceso.port.js';
import { CachePermisosRedis, crearClienteRedis } from '../src/infrastructure/redis/cache-permisos.redis.js';
import { SeguridadModule } from '../src/seguridad.module.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';
import { claimsBase, firmar, JwksLocal, nuevaLlave, type Llave } from './support/jwks-local.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const OTRA_SUCURSAL = '0193f3a0-0000-7000-8000-0000000000ff';

describeConDb('GET /seg/mi-contexto (TR-CA-044 a 046, parte back)', () => {
  let e: Entorno;
  let app: INestApplication;
  let tenant: string;
  let org: { empresaId: string; sucursales: [string, string]; cajas: [string, string] };
  let ana: { membresiaId: string; usuarioId: string };
  let luis: { membresiaId: string; usuarioId: string };
  let pedro: { membresiaId: string; usuarioId: string };
  const jwks = new JwksLocal();
  let llave: Llave;

  const pedir = async (usuarioId: string, sucursal?: string, extra: Record<string, unknown> = {}) => {
    const req = request(app.getHttpServer())
      .get('/seg/mi-contexto')
      .set('Authorization', `Bearer ${await firmar(llave, claimsBase({ sub: usuarioId, tenant_id: tenant, ...extra }))}`);
    return sucursal ? req.set('X-Sucursal-Id', sucursal) : req;
  };
  const versionSeguridad = async () => {
    const [{ version }] = await e.dataSource.query('SELECT version FROM seg.version_seguridad WHERE tenant_id = $1', [tenant]);
    return Number(version);
  };
  /** La preferencia se escribe sin esperar: se espera a verla en la base. */
  const ultimaSucursal = async (membresiaId: string, esperada: string) => {
    for (let i = 0; i < 50; i++) {
      const [{ ultima_sucursal_id }] = await e.dataSource.query('SELECT ultima_sucursal_id FROM seg.membresia WHERE id = $1', [membresiaId]);
      if (ultima_sucursal_id === esperada) return ultima_sucursal_id;
      await new Promise((ok) => setTimeout(ok, 20));
    }
    throw new Error('ultima_sucursal_id no se actualizó');
  };

  beforeAll(async () => {
    e = await crearEntorno();
    for (const p of ['rest.caja.abrir', 'rest.pedido.anular']) await e.sembrar.permiso(p, { alcanceMinimo: 'UNIDAD' });
    tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST');
    org = await e.sembrar.organizacion(tenant);
    const cajero = await e.sembrar.rol(tenant, 'REST', 'CAJERO', ['rest.caja.abrir']);
    const anulador = await e.sembrar.rol(tenant, 'REST', 'ANULADOR', ['rest.pedido.anular']);

    ana = await e.sembrar.membresia(tenant);
    await e.sembrar.asignacion(tenant, ana.membresiaId, { rolId: cajero }, { desde: '2026-01-01' }, { alcance: 'SUCURSAL', sucursalId: org.sucursales[0] });
    luis = await e.sembrar.membresia(tenant);
    await e.sembrar.asignacion(tenant, luis.membresiaId, { rolId: cajero }, { desde: '2026-01-01' }, { alcance: 'EMPRESA', empresaId: org.empresaId });
    await e.sembrar.asignacion(tenant, luis.membresiaId, { rolId: anulador }, { desde: '2026-01-01' }, { alcance: 'SUCURSAL', sucursalId: org.sucursales[1] });
    pedro = await e.sembrar.membresia(tenant);

    // Menú: una opción por permiso, para ver que cambia con la sucursal.
    const [{ id: modulo }] = await e.dataSource.query("INSERT INTO seg.modulo (id, producto_codigo, codigo, nombre) VALUES (gen_random_uuid(), 'REST', 'caja', 'Caja') RETURNING id");
    for (const [codigo, permiso, orden] of [
      ['rest.caja.apertura', 'rest.caja.abrir', 1],
      ['rest.pedido.anulacion', 'rest.pedido.anular', 2],
    ] as const) {
      const [{ id }] = await e.dataSource.query(
        'INSERT INTO seg.opcion (id, modulo_id, codigo, nombre, ruta, orden) VALUES (gen_random_uuid(), $1, $2, $2, $3, $4) RETURNING id',
        [modulo, codigo, `/${codigo}`, orden],
      );
      await e.dataSource.query('INSERT INTO seg.opcion_permiso (opcion_id, permiso_codigo) VALUES ($1, $2)', [id, permiso]);
    }

    llave = await nuevaLlave('kid-1');
    const jwksUrl = await jwks.iniciar();
    jwks.publicar(llave);
    const modulo_ = await Test.createTestingModule({
      imports: [
        KernelInfraModule.register({ dataSource: e.dataSource, validator: new InMemoryEventSchemaValidator() }),
        SeguridadModule.register({ supabaseUrl: 'https://proyecto-prueba.supabase.co', mfaMaxEdadSeg: 900, dataSource: e.dataSource, redisUrl: REDIS_URL, jwksUrl }),
      ],
    })
      .overrideProvider(REGISTRO_ACCESO)
      .useValue({ marcar: async () => undefined })
      .compile();
    app = modulo_.createNestApplication({ logger: false });
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

  it('TR-CA-044: con una sola sucursal, es la actual y no requiere selección', async () => {
    const res = await pedir(ana.usuarioId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      usuario_id: ana.usuarioId,
      tenant_id: tenant,
      aal: 'aal1',
      mfa_vigente: false,
      sucursal_actual: org.sucursales[0],
      requiere_seleccion: false,
      sin_accesos: false,
      permisos: ['rest.caja.abrir'],
    });
    expect(res.body.sucursales).toEqual([expect.objectContaining({ id: org.sucursales[0], empresa_id: org.empresaId })]);
    expect(res.body.menu.map((o: { codigo: string }) => o.codigo)).toEqual(['rest.caja.apertura']);
  });

  it('con varias sucursales y sin preferencia, requiere selección y no trae permisos', async () => {
    const res = await pedir(luis.usuarioId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sucursal_actual: null, requiere_seleccion: true, sin_accesos: false, permisos: [], menu: [] });
    expect(res.body.sucursales).toHaveLength(2);
  });

  it('TR-CA-045: cambiar X-Sucursal-Id cambia permisos y menú con el mismo token', async () => {
    const s0 = await pedir(luis.usuarioId, org.sucursales[0]);
    expect(s0.body).toMatchObject({ sucursal_actual: org.sucursales[0], permisos: ['rest.caja.abrir'] });
    expect(s0.body.menu.map((o: { codigo: string }) => o.codigo)).toEqual(['rest.caja.apertura']);

    const s1 = await pedir(luis.usuarioId, org.sucursales[1]);
    expect(s1.body).toMatchObject({ sucursal_actual: org.sucursales[1], permisos: ['rest.caja.abrir', 'rest.pedido.anular'] });
    expect(s1.body.menu.map((o: { codigo: string }) => o.codigo)).toEqual(['rest.caja.apertura', 'rest.pedido.anulacion']);
  });

  it('la última sucursal elegida es la actual sin header, y recordarla no sube la versión de seguridad', async () => {
    await pedir(luis.usuarioId, org.sucursales[0]);
    await ultimaSucursal(luis.membresiaId, org.sucursales[0]);
    const antes = await versionSeguridad();

    await pedir(luis.usuarioId, org.sucursales[1]);
    await ultimaSucursal(luis.membresiaId, org.sucursales[1]);
    expect(await versionSeguridad()).toBe(antes);

    const res = await pedir(luis.usuarioId);
    expect(res.body).toMatchObject({ sucursal_actual: org.sucursales[1], requiere_seleccion: false, permisos: ['rest.caja.abrir', 'rest.pedido.anular'] });
  });

  it('TR-CA-046: sin asignaciones vigentes, sin_accesos = true', async () => {
    const res = await pedir(pedro.usuarioId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sucursales: [], sucursal_actual: null, requiere_seleccion: false, sin_accesos: true, permisos: [], menu: [] });
  });

  it('X-Sucursal-Id no accesible: 403 SUCURSAL_NO_ASIGNADA; no UUID: 400 SIN_SUCURSAL', async () => {
    const ajena = await pedir(ana.usuarioId, OTRA_SUCURSAL);
    expect(ajena.status).toBe(403);
    expect(ajena.body).toEqual({ codigo: 'SUCURSAL_NO_ASIGNADA' });
    const otra = await pedir(ana.usuarioId, org.sucursales[1]);
    expect(otra.status).toBe(403);

    const mala = await pedir(ana.usuarioId, 'miraflores');
    expect(mala.status).toBe(400);
    expect(mala.body).toEqual({ codigo: 'SIN_SUCURSAL' });
  });

  it('token sin tenant_id: 403 SIN_TENANT', async () => {
    const res = await pedir(ana.usuarioId, undefined, { tenant_id: null });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ codigo: 'SIN_TENANT' });
  });
});
