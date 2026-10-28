import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import { fechaLocal } from '../src/application/otorgar-asignacion.js';
import { PROVEEDOR_IDENTIDAD } from '../src/application/ports/proveedor-identidad.port.js';
import { REGISTRO_ACCESO } from '../src/application/ports/registro-acceso.port.js';
import { ResolverPermisos } from '../src/application/resolver-permisos.js';
import { SucursalNoAsignadaError } from '../src/domain/errores.js';
import { registrarEsquemasSeg } from '../src/infrastructure/event-schemas.js';
import { CachePermisosRedis, crearClienteRedis } from '../src/infrastructure/redis/cache-permisos.redis.js';
import { SeguridadModule } from '../src/seguridad.module.js';
import { ProveedorIdentidadFalso } from './support/proveedor-identidad.falso.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { ahoraSeg, claimsBase, firmar, JwksLocal, nuevaLlave, type Llave } from './support/jwks-local.js';
import { describeConDb } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const UN_DIA_MS = 86_400_000;

/** Fecha de Lima a `dias` de hoy: la vigencia real la mide `current_date`, no un reloj fijo. */
const dentroDe = (dias: number) => fechaLocal(new Date(Date.now() + dias * UN_DIA_MS));

/** Pila completa: guards reales, OtorgarAsignacion y base temporal (TR-RF-013, spec 16a). */
describeConDb('API de asignaciones (TR-RF-013; PostgreSQL 16 y Redis 7)', () => {
  let e: Entorno;
  let app: INestApplication;
  let tenant: string;
  let org: { empresaId: string; sucursales: [string, string]; cajas: [string, string] };
  let cajero: string;
  let ana: { membresiaId: string; usuarioId: string };
  let jefeMiraflores: { membresiaId: string; usuarioId: string };
  const jwks = new JwksLocal();
  let llave: Llave;

  const conMfa = { aal: 'aal2', amr: [{ method: 'totp', timestamp: ahoraSeg() - 60 }] };
  const otorgar = async (usuarioId: string, cuerpo: Record<string, unknown>, claims: Record<string, unknown> = conMfa) =>
    request(app.getHttpServer())
      .post('/seg/asignaciones')
      .set('Authorization', `Bearer ${await firmar(llave, claimsBase({ sub: usuarioId, tenant_id: tenant, ...claims }))}`)
      .set('X-Sucursal-Id', org.sucursales[0])
      .send(cuerpo);
  const contar = async (sql: string, params: unknown[]) => Number((await e.dataSource.query(sql, params))[0].n);

  beforeAll(async () => {
    e = await crearEntorno();
    await e.sembrar.permiso('rest.caja.cerrar', { alcanceMinimo: 'UNIDAD' });
    await e.sembrar.permiso('plat.asignacion.otorgar', { alcanceMinimo: 'SUCURSAL', sensible: true });
    tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST');
    org = await e.sembrar.organizacion(tenant);
    cajero = await e.sembrar.rol(tenant, 'REST', 'CAJERO', ['rest.caja.cerrar']);
    const administrador = await e.sembrar.rol(tenant, 'PLAT', 'ADMIN_ASIGNACIONES', ['plat.asignacion.otorgar']);
    ana = await e.sembrar.membresia(tenant, 'ACTIVO', true);
    await e.sembrar.asignacion(tenant, ana.membresiaId, { rolId: administrador });
    jefeMiraflores = await e.sembrar.membresia(tenant, 'ACTIVO');
    await e.sembrar.asignacion(tenant, jefeMiraflores.membresiaId, { rolId: administrador }, {}, { alcance: 'SUCURSAL', sucursalId: org.sucursales[0] });

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

  it('TR-CA-036: Cajero en CAJA-02 con vigencia da permisos de caja solo en CAJA-02, con bitácora y outbox', async () => {
    const luis = await e.sembrar.membresia(tenant, 'ACTIVO');

    const respuesta = await otorgar(ana.usuarioId, {
      membresia_id: luis.membresiaId,
      rol_id: cajero,
      alcance: 'UNIDAD',
      unidad_id: org.cajas[0],
      vigente_desde: dentroDe(0),
      vigente_hasta: dentroDe(3),
    });

    expect(respuesta.status).toBe(201);
    const asignacionId = respuesta.body.asignacion_id;
    const resolver = app.get(ResolverPermisos);
    const permisosDeLuis = (unidadId: string | null) => resolver.ejecutar({ usuarioId: luis.usuarioId, tenantId: tenant, sucursalId: org.sucursales[0], unidadId });
    expect((await permisosDeLuis(org.cajas[0])).permisos).toEqual(['rest.caja.cerrar']);
    expect((await permisosDeLuis(null)).permisos).toEqual([]);
    expect(await e.eventosDe(asignacionId)).toEqual([['asignacion.otorgada', 1]]);
    expect(
      await contar("SELECT count(*) AS n FROM seg.evento_seguridad WHERE tipo = 'ASIGNACION_OTORGADA' AND usuario_id = $1 AND detalle->>'asignacion_id' = $2", [
        ana.usuarioId,
        asignacionId,
      ]),
    ).toBe(1);
  });

  it('TR-CA-036: fuera del rango de fechas la asignación no da acceso', async () => {
    const marta = await e.sembrar.membresia(tenant, 'ACTIVO');

    const respuesta = await otorgar(ana.usuarioId, {
      membresia_id: marta.membresiaId,
      rol_id: cajero,
      alcance: 'UNIDAD',
      unidad_id: org.cajas[0],
      vigente_desde: dentroDe(5),
      vigente_hasta: dentroDe(10),
    });

    expect(respuesta.status).toBe(201);
    await expect(
      app.get(ResolverPermisos).ejecutar({ usuarioId: marta.usuarioId, tenantId: tenant, sucursalId: org.sucursales[0], unidadId: org.cajas[0] }),
    ).rejects.toThrow(SucursalNoAsignadaError);
  });

  it('TR-CA-037: rol y perfil a la vez responde 400 ASIGNACION_ROL_O_PERFIL', async () => {
    const luis = await e.sembrar.membresia(tenant, 'ACTIVO');
    const perfilId = await e.sembrar.perfil(tenant, 'CAJA', [cajero]);

    const respuesta = await otorgar(ana.usuarioId, { membresia_id: luis.membresiaId, rol_id: cajero, perfil_id: perfilId, alcance: 'TENANT' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'ASIGNACION_ROL_O_PERFIL', mensaje: 'Seleccione un rol o un perfil, no ambos' });
  });

  it('TR-CA-038: hasta anterior a desde responde 400 VIGENCIA_INVALIDA sin escribir nada', async () => {
    const luis = await e.sembrar.membresia(tenant, 'ACTIVO');

    const respuesta = await otorgar(ana.usuarioId, {
      membresia_id: luis.membresiaId,
      rol_id: cajero,
      alcance: 'TENANT',
      vigente_desde: '2026-10-20',
      vigente_hasta: '2026-10-19',
    });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'VIGENCIA_INVALIDA', mensaje: 'La vigencia hasta no puede ser anterior a la vigencia desde' });
    expect(await contar('SELECT count(*) AS n FROM seg.asignacion WHERE membresia_id = $1', [luis.membresiaId])).toBe(0);
  });

  it('con aal1 responde 401 MFA_REQUERIDA (permiso sensible)', async () => {
    const luis = await e.sembrar.membresia(tenant, 'ACTIVO');

    const respuesta = await otorgar(ana.usuarioId, { membresia_id: luis.membresiaId, rol_id: cajero, alcance: 'TENANT' }, {});

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.codigo).toBe('MFA_REQUERIDA');
  });

  it('el jefe de Miraflores no asigna en Surco: 403 OTORGANTE_SIN_ALCANCE', async () => {
    const luis = await e.sembrar.membresia(tenant, 'ACTIVO');

    const respuesta = await otorgar(jefeMiraflores.usuarioId, { membresia_id: luis.membresiaId, rol_id: cajero, alcance: 'SUCURSAL', sucursal_id: org.sucursales[1] });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.codigo).toBe('OTORGANTE_SIN_ALCANCE');
  });

  it('a una membresía SUSPENDIDO responde 409 MEMBRESIA_NO_ASIGNABLE', async () => {
    const suspendido = await e.sembrar.membresia(tenant, 'SUSPENDIDO');

    const respuesta = await otorgar(ana.usuarioId, { membresia_id: suspendido.membresiaId, rol_id: cajero, alcance: 'TENANT' });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.codigo).toBe('MEMBRESIA_NO_ASIGNABLE');
  });
});
