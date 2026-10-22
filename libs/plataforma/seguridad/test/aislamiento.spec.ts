import 'reflect-metadata';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AlsTenantContext, InMemoryEventSchemaValidator, KernelInfraModule, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { REGISTRO_ACCESO } from '../src/application/ports/registro-acceso.port.js';
import { CachePermisosRedis, crearClienteRedis } from '../src/infrastructure/redis/cache-permisos.redis.js';
import { AsignacionRepositorioTypeOrm } from '../src/infrastructure/typeorm/asignacion.repositorio.js';
import { MembresiasLecturaTypeOrm } from '../src/infrastructure/typeorm/lecturas.js';
import { PerfilRepositorioTypeOrm } from '../src/infrastructure/typeorm/perfil.repositorio.js';
import { RolRepositorioTypeOrm } from '../src/infrastructure/typeorm/rol.repositorio.js';
import { Permiso } from '../src/interface/decoradores.js';
import { SeguridadModule } from '../src/seguridad.module.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { claimsBase, firmar, JwksLocal, nuevaLlave, type Llave } from './support/jwks-local.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

@Controller('p')
class PruebaController {
  @Permiso('rest.caja.abrir')
  @Get('abrir')
  abrir() {
    return { ok: true };
  }
}

interface Datos {
  tenant: string;
  org: { empresaId: string; sucursales: [string, string]; cajas: [string, string] };
  usuario: { membresiaId: string; usuarioId: string };
  rolId: string;
  perfilId: string;
}

/**
 * TR-RNF-010 (S-05): dos tenants completos y la aplicación corriendo con `seg_test_app`, un rol sin
 * BYPASSRLS. Desde A no se ve nada de B, ni por SQL ni por repositorios ni por la API.
 */
describe('Aislamiento entre tenants (TR-RNF-010)', () => {
  let e: Entorno;
  let appDs: DataSource;
  let contexto: AlsTenantContext;
  let uow: TypeOrmUnitOfWork;
  let app: INestApplication;
  let a: Datos;
  let b: Datos;
  const jwks = new JwksLocal();
  let llave: Llave;

  /** Corre como seg_test_app con app.tenant_id = tenant, como cada caso de uso. */
  const comoApp = <T>(tenant: string, fn: () => Promise<T>) => contexto.run({ tenantId: tenant }, () => uow.run(fn));
  const pedir = async (ruta: string, usuarioId: string, tenant: string, sucursal?: string) => {
    const req = request(app.getHttpServer())
      .get(ruta)
      .set('Authorization', `Bearer ${await firmar(llave, claimsBase({ sub: usuarioId, tenant_id: tenant }))}`);
    return sucursal ? req.set('X-Sucursal-Id', sucursal) : req;
  };

  async function sembrarTenant(): Promise<Datos> {
    const tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST');
    const org = await e.sembrar.organizacion(tenant);
    const rolId = await e.sembrar.rol(tenant, 'REST', 'CAJERO', ['rest.caja.abrir']);
    const perfilId = await e.sembrar.perfil(tenant, 'CAJA', [rolId]);
    const usuario = await e.sembrar.membresia(tenant);
    await e.sembrar.asignacion(tenant, usuario.membresiaId, { rolId }, { desde: '2026-01-01' }, { alcance: 'EMPRESA', empresaId: org.empresaId });
    await e.sembrar.asignacion(tenant, usuario.membresiaId, { perfilId }, { desde: '2026-01-01' }, { alcance: 'SUCURSAL', sucursalId: org.sucursales[0] });
    await e.dataSource.query("INSERT INTO seg.evento_seguridad (tenant_id, usuario_id, tipo) VALUES ($1, $2, 'ACCESO_DENEGADO')", [tenant, usuario.usuarioId]);
    return { tenant, org, usuario, rolId, perfilId };
  }

  beforeAll(async () => {
    e = await crearEntorno();
    // El rol es del clúster y otras suites lo crean en paralelo; los permisos son de esta base.
    await e.dataSource.query(`DO $$ BEGIN CREATE ROLE seg_test_app NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    for (const esquema of ['seg', 'org']) {
      await e.dataSource.query(`GRANT USAGE ON SCHEMA ${esquema} TO seg_test_app`);
      await e.dataSource.query(`GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ${esquema} TO seg_test_app`);
      await e.dataSource.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA ${esquema} TO seg_test_app`);
    }
    await e.sembrar.permiso('rest.caja.abrir', { alcanceMinimo: 'UNIDAD' });
    a = await sembrarTenant();
    b = await sembrarTenant();

    appDs = new DataSource({ type: 'postgres', url: e.db.url, extra: { options: '-c role=seg_test_app' } });
    await appDs.initialize();
    contexto = new AlsTenantContext();
    uow = new TypeOrmUnitOfWork(appDs, contexto);

    llave = await nuevaLlave('kid-1');
    const jwksUrl = await jwks.iniciar();
    jwks.publicar(llave);
    const modulo = await Test.createTestingModule({
      imports: [
        KernelInfraModule.register({ dataSource: appDs, validator: new InMemoryEventSchemaValidator() }),
        SeguridadModule.register({ supabaseUrl: 'https://proyecto-prueba.supabase.co', mfaMaxEdadSeg: 900, dataSource: appDs, redisUrl: REDIS_URL, jwksUrl }),
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
    const cache = new CachePermisosRedis(redis);
    for (const d of [a, b]) if (d) await cache.invalidarTenant(d.tenant).catch(() => undefined);
    redis.disconnect();
    await app?.close();
    await jwks.detener();
    if (appDs?.isInitialized) await appDs.destroy();
    await e?.cerrar();
  });

  it('la conexión de la aplicación corre como seg_test_app, sin BYPASSRLS', async () => {
    const [fila] = await appDs.query('SELECT current_user AS rol, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass');
    expect(fila).toEqual({ rol: 'seg_test_app', bypass: false });
  });

  it.each(['rol', 'perfil', 'asignacion', 'membresia', 'version_seguridad', 'evento_seguridad'])(
    'desde A, seg.%s no devuelve filas de B (y sí las de A)',
    async (tabla) => {
      const contar = (tenant: string) =>
        comoApp(a.tenant, async () => {
          const [{ n }] = await uow.manager.query(`SELECT count(*)::int AS n FROM seg.${tabla} WHERE tenant_id = $1`, [tenant]);
          return n as number;
        });
      expect(await contar(b.tenant)).toBe(0);
      expect(await contar(a.tenant)).toBeGreaterThan(0);
    },
  );

  it('las funciones de permisos con p_tenant = B y app.tenant_id = A devuelven 0 filas', async () => {
    const { usuarioId } = b.usuario;
    const [sucursal] = b.org.sucursales;
    const filas = await comoApp(a.tenant, async () => ({
      efectivos: await uow.manager.query('SELECT * FROM seg.permisos_efectivos($1, $2, $3, NULL)', [usuarioId, b.tenant, sucursal]),
      menu: await uow.manager.query('SELECT * FROM seg.menu_usuario($1, $2, $3, NULL)', [usuarioId, b.tenant, sucursal]),
      sucursales: await uow.manager.query('SELECT * FROM seg.sucursales_accesibles($1, $2)', [usuarioId, b.tenant]),
      versiones: await uow.manager.query('SELECT * FROM seg.versiones_seguridad($1)', [b.tenant]),
    }));
    expect(filas).toEqual({ efectivos: [], menu: [], sucursales: [], versiones: [] });

    // Control: con su propio tenant, B sí tiene permisos.
    const propios = await comoApp(b.tenant, () => uow.manager.query('SELECT * FROM seg.permisos_efectivos($1, $2, $3, NULL)', [usuarioId, b.tenant, sucursal]));
    expect(propios).toEqual([{ permiso_codigo: 'rest.caja.abrir' }]);
  });

  it('los repositorios, desde A, no leen el rol, el perfil, la membresía ni las asignaciones de B', async () => {
    const leido = await comoApp(a.tenant, async () => ({
      rol: await new RolRepositorioTypeOrm(uow, contexto).buscar(b.rolId),
      perfil: await new PerfilRepositorioTypeOrm(uow, contexto).buscar(b.perfilId),
      membresia: await new MembresiasLecturaTypeOrm(uow, contexto).deUsuario(b.usuario.usuarioId),
      porId: await new MembresiasLecturaTypeOrm(uow, contexto).buscar(b.usuario.membresiaId),
      asignaciones: await new AsignacionRepositorioTypeOrm(uow, contexto).vigentesDe(b.usuario.membresiaId, '2026-10-21'),
    }));
    expect(leido).toEqual({ rol: null, perfil: null, membresia: null, porId: null, asignaciones: [] });
  });

  it('por API, un usuario de A con X-Sucursal-Id de B recibe 403 SUCURSAL_NO_ASIGNADA', async () => {
    const guard = await pedir('/p/abrir', a.usuario.usuarioId, a.tenant, b.org.sucursales[0]);
    expect(guard.status).toBe(403);
    expect(guard.body).toEqual({ codigo: 'SUCURSAL_NO_ASIGNADA' });

    const contextoB = await pedir('/seg/mi-contexto', a.usuario.usuarioId, a.tenant, b.org.sucursales[0]);
    expect(contextoB.status).toBe(403);
    expect(contextoB.body).toEqual({ codigo: 'SUCURSAL_NO_ASIGNADA' });

    // Control: con su propia sucursal, A pasa.
    expect((await pedir('/p/abrir', a.usuario.usuarioId, a.tenant, a.org.sucursales[0])).status).toBe(200);
  });

  it('mi-contexto de A solo lista sucursales de A', async () => {
    const res = await pedir('/seg/mi-contexto', a.usuario.usuarioId, a.tenant);
    expect(res.status).toBe(200);
    expect(res.body.sucursales.map((s: { id: string }) => s.id).sort()).toEqual([...a.org.sucursales].sort());
  });

  it('un token con el usuario de B y el tenant de A no ve nada de B', async () => {
    const res = await pedir('/seg/mi-contexto', b.usuario.usuarioId, a.tenant);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sucursales: [], sin_accesos: true, permisos: [], menu: [] });

    const guard = await pedir('/p/abrir', b.usuario.usuarioId, a.tenant, b.org.sucursales[0]);
    expect(guard.status).toBe(403);
  });
});
