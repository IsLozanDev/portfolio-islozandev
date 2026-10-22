import 'reflect-metadata';
import { Controller, Get, Inject, Post, Req, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { TenantContext } from '@vitrina/plataforma/kernel';
import { InMemoryEventSchemaValidator, KernelInfraModule, TENANT_CONTEXT } from '@vitrina/plataforma/kernel-infra';
import { REGISTRO_ACCESO } from '../src/application/ports/registro-acceso.port.js';
import { CachePermisosRedis, crearClienteRedis } from '../src/infrastructure/redis/cache-permisos.redis.js';
import { Permiso, type SolicitudAutenticada } from '../src/interface/decoradores.js';
import { SeguridadModule } from '../src/seguridad.module.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';
import { ahoraSeg, claimsBase, firmar, JwksLocal, nuevaLlave, type Llave } from './support/jwks-local.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const STEP_UP = 'Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=900';
const OTRA_SUCURSAL = '0193f3a0-0000-7000-8000-0000000000ff';

let cierres = 0;

@Controller('p')
class PruebaController {
  constructor(@Inject(TENANT_CONTEXT) private readonly tenants: TenantContext) {}

  @Permiso('rest.caja.abrir')
  @Get('abrir')
  abrir(@Req() req: SolicitudAutenticada) {
    return { contexto: req.contexto, alcance: this.tenants.current() };
  }

  @Permiso('rest.caja.cerrar')
  @Post('cerrar')
  cerrar() {
    cierres++;
    return { cerrada: true };
  }

  @Permiso('rest.pedido.anular')
  @Get('anular')
  anular() {
    return { anulado: true };
  }

  @Permiso('gym.socio.registrar')
  @Get('gym')
  gym() {
    return { ok: true };
  }

  @Get('libre')
  libre() {
    return { alcance: this.tenants.current() };
  }
}

describeConDb('PermisoGuard y ContextoTenantInterceptor (TR-RF-016)', () => {
  let e: Entorno;
  let app: INestApplication;
  let tenant: string;
  let org: { empresaId: string; sucursales: [string, string]; cajas: [string, string] };
  let maria: { membresiaId: string; usuarioId: string };
  const jwks = new JwksLocal();
  let llave: Llave;
  const http = () => request(app.getHttpServer());

  const token = (extra: Record<string, unknown> = {}) => firmar(llave, claimsBase({ sub: maria.usuarioId, tenant_id: tenant, ...extra }));
  const conMfaHace = (seg: number) =>
    token({ aal: 'aal2', amr: [{ method: 'password', timestamp: ahoraSeg() - 3600 }, { method: 'totp', timestamp: ahoraSeg() - seg }] });
  const pedir = async (ruta: string, cabeceras: Record<string, string> = {}, tk?: string) => {
    const req = ruta === '/p/cerrar' ? http().post(ruta) : http().get(ruta);
    return req.set({ Authorization: `Bearer ${tk ?? (await token())}`, 'X-Sucursal-Id': org.sucursales[0], ...cabeceras });
  };
  const denegados = (): Promise<{ detalle: Record<string, unknown> }[]> =>
    e.dataSource.query("SELECT detalle FROM seg.evento_seguridad WHERE usuario_id = $1 AND tipo = 'ACCESO_DENEGADO' ORDER BY id", [maria.usuarioId]);

  beforeAll(async () => {
    e = await crearEntorno();
    await e.sembrar.permiso('rest.caja.abrir', { alcanceMinimo: 'UNIDAD' });
    await e.sembrar.permiso('rest.caja.cerrar', { alcanceMinimo: 'UNIDAD', sensible: true });
    await e.sembrar.permiso('rest.pedido.anular', { alcanceMinimo: 'UNIDAD' });
    await e.sembrar.permiso('gym.socio.registrar', { alcanceMinimo: 'UNIDAD' });
    tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST');
    await e.sembrar.suscripcion(tenant, 'GYM', 'VENCIDA');
    org = await e.sembrar.organizacion(tenant);
    const cajero = await e.sembrar.rol(tenant, 'REST', 'CAJERO', ['rest.caja.abrir', 'rest.caja.cerrar']);
    const recepcion = await e.sembrar.rol(tenant, 'GYM', 'GYM_RECEPCION', ['gym.socio.registrar']);
    maria = await e.sembrar.membresia(tenant);
    for (const rolId of [cajero, recepcion]) {
      await e.sembrar.asignacion(tenant, maria.membresiaId, { rolId }, { desde: '2026-01-01' }, { alcance: 'EMPRESA', empresaId: org.empresaId });
    }

    llave = await nuevaLlave('kid-1');
    const jwksUrl = await jwks.iniciar();
    jwks.publicar(llave);
    const modulo = await Test.createTestingModule({
      imports: [
        KernelInfraModule.register({ dataSource: e.dataSource, validator: new InMemoryEventSchemaValidator() }),
        SeguridadModule.register({ supabaseUrl: 'https://proyecto-prueba.supabase.co', mfaMaxEdadSeg: 900, dataSource: e.dataSource, redisUrl: REDIS_URL, jwksUrl }),
      ],
      controllers: [PruebaController],
    })
      .overrideProvider(REGISTRO_ACCESO)
      .useValue({ marcar: async () => undefined })
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

  beforeEach(() => {
    cierres = 0;
  });

  it('con el permiso: 200, req.contexto con lo verificado y TenantContext con tenant y sucursal', async () => {
    const res = await pedir('/p/abrir', { 'X-Unidad-Id': org.cajas[0] });
    expect(res.status).toBe(200);
    expect(res.body.contexto).toEqual({
      tenantId: tenant,
      sucursalId: org.sucursales[0],
      unidadId: org.cajas[0],
      permisos: ['rest.caja.abrir', 'rest.caja.cerrar'],
    });
    expect(res.body.alcance).toEqual({ tenantId: tenant, branchId: org.sucursales[0] });
  });

  it('sin @Permiso el handler ve el tenant, pero no una sucursal sin verificar', async () => {
    const res = await pedir('/p/libre');
    expect(res.status).toBe(200);
    expect(res.body.alcance).toEqual({ tenantId: tenant });
  });

  it('token sin tenant_id: 403 SIN_TENANT', async () => {
    const res = await pedir('/p/abrir', {}, await token({ tenant_id: null }));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ codigo: 'SIN_TENANT' });
  });

  it.each([
    ['ausente', undefined],
    ['no UUID', 'miraflores'],
  ])('X-Sucursal-Id %s: 400 SIN_SUCURSAL', async (_caso, valor) => {
    const req = http().get('/p/abrir').set('Authorization', `Bearer ${await token()}`);
    const res = await (valor ? req.set('X-Sucursal-Id', valor) : req);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ codigo: 'SIN_SUCURSAL' });
  });

  it('X-Unidad-Id no UUID: 400 UNIDAD_INVALIDA', async () => {
    const res = await pedir('/p/abrir', { 'X-Unidad-Id': 'caja-01' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ codigo: 'UNIDAD_INVALIDA' });
  });

  it('sucursal fuera de las accesibles: 403 SUCURSAL_NO_ASIGNADA', async () => {
    const res = await pedir('/p/abrir', { 'X-Sucursal-Id': OTRA_SUCURSAL });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ codigo: 'SUCURSAL_NO_ASIGNADA' });
  });

  it('permiso faltante: 403 SIN_PERMISO con el código y ACCESO_DENEGADO persistido', async () => {
    const antes = (await denegados()).length;
    const res = await pedir('/p/anular');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ codigo: 'SIN_PERMISO', permiso: 'rest.pedido.anular' });
    const filas = await denegados();
    expect(filas).toHaveLength(antes + 1);
    expect(filas.at(-1)?.detalle).toEqual({ permiso: 'rest.pedido.anular', ruta: '/p/anular', metodo: 'GET', sucursal_id: org.sucursales[0] });
  });

  it('TR-CA-042: con GYM VENCIDA, @Permiso de gym responde 403 y registra ACCESO_DENEGADO', async () => {
    const res = await pedir('/p/gym');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ codigo: 'SIN_PERMISO', permiso: 'gym.socio.registrar' });
    expect((await denegados()).at(-1)?.detalle).toMatchObject({ permiso: 'gym.socio.registrar' });
  });

  it('permiso sensible con aal1: 401 MFA_REQUERIDA step-up y no ejecuta', async () => {
    const res = await pedir('/p/cerrar');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ codigo: 'MFA_REQUERIDA', max_edad: 900 });
    expect(res.headers['www-authenticate']).toBe(STEP_UP);
    expect(cierres).toBe(0);
  });

  it('permiso sensible con MFA de hace 40 min: 401; con MFA de hace 5 min: ejecuta', async () => {
    const vencida = await pedir('/p/cerrar', {}, await conMfaHace(2400));
    expect(vencida.status).toBe(401);
    expect(vencida.body.codigo).toBe('MFA_REQUERIDA');
    expect(cierres).toBe(0);

    const vigente = await pedir('/p/cerrar', {}, await conMfaHace(300));
    expect(vigente.status).toBe(201);
    expect(cierres).toBe(1);
  });

  it('@Permiso con un código mal formado falla al decorar', () => {
    expect(() => Permiso('rest-caja')).toThrow(/producto\.recurso\.accion/);
  });
});
