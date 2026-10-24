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
import { ahoraSeg, claimsBase, firmar, JwksLocal, nuevaLlave, type Llave } from './support/jwks-local.js';
import { describeConDb } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/** Pila completa: guards reales, PermisoGuard con caché Redis y base temporal; Supabase es el doble. */
describeConDb('API de membresías (TR-RF-009, 010, 014; PostgreSQL 16 y Redis 7)', () => {
  let e: Entorno;
  let app: INestApplication;
  let proveedor: ProveedorIdentidadFalso;
  let tenant: string;
  let sucursal: string;
  let cajero: string;
  let invitador: string;
  let ana: { membresiaId: string; usuarioId: string };
  const jwks = new JwksLocal();
  let llave: Llave;

  const token = (sub: string, extra: Record<string, unknown> = {}) => firmar(llave, claimsBase({ sub, tenant_id: tenant, ...extra }));
  const conMfa = { aal: 'aal2', amr: [{ method: 'totp', timestamp: ahoraSeg() - 60 }] };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    e = await crearEntorno();
    await e.sembrar.permiso('rest.caja.cerrar', { alcanceMinimo: 'SUCURSAL' });
    await e.sembrar.permiso('plat.usuario.invitar', { alcanceMinimo: 'SUCURSAL' });
    await e.sembrar.permiso('plat.asignacion.revocar', { alcanceMinimo: 'SUCURSAL', sensible: true });
    tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST', 'ACTIVA', 10);
    ({ sucursales: [sucursal] } = await e.sembrar.organizacion(tenant));
    cajero = await e.sembrar.rol(tenant, 'REST', 'CAJERO', ['rest.caja.cerrar']);
    invitador = await e.sembrar.rol(tenant, 'PLAT', 'INVITADOR', ['plat.usuario.invitar']);
    const admin = await e.sembrar.rol(tenant, 'PLAT', 'ADMIN_SEG', ['plat.usuario.invitar', 'plat.asignacion.revocar']);
    ana = await e.sembrar.membresia(tenant, 'ACTIVO', true);
    await e.sembrar.asignacion(tenant, ana.membresiaId, { rolId: admin });

    llave = await nuevaLlave('kid-1');
    const jwksUrl = await jwks.iniciar();
    jwks.publicar(llave);
    proveedor = new ProveedorIdentidadFalso(e.dataSource);
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
          invitaciones: { supabaseSecretKey: 'sb_secret_prueba', url: 'https://app.vitrina.pe/auth/invitacion', aceptarPorMinuto: 1000 },
        }),
      ],
    })
      .overrideProvider(REGISTRO_ACCESO)
      .useValue({ marcar: async () => undefined })
      .overrideProvider(PROVEEDOR_IDENTIDAD)
      .useValue(proveedor)
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

  it('TR-CA-025 y TR-CA-028: Ana invita a Rosa, Rosa acepta sin tenant en el token y luego ve los permisos de Cajero', async () => {
    const invitada = await http()
      .post('/seg/invitaciones')
      .set('Authorization', `Bearer ${await token(ana.usuarioId)}`)
      .set('X-Sucursal-Id', sucursal)
      .send({ correo: 'rosa.huaman@gmail.com', nombre: 'Rosa Huamán', rol_id: cajero, alcance: 'SUCURSAL', sucursal_id: sucursal });
    expect(invitada.status).toBe(201);
    expect(invitada.body).toMatchObject({ usuario_nuevo: true, correo_enviado: true });

    const tokenInvitacion = new URL(proveedor.llamadas[proveedor.llamadas.length - 1].redirectTo).searchParams.get('token') ?? '';
    const [{ usuario_id: rosa }] = await e.dataSource.query('SELECT usuario_id FROM seg.membresia WHERE id = $1', [invitada.body.membresia_id]);

    const publica = await http().get(`/seg/invitaciones/${tokenInvitacion}`);
    expect(publica.status).toBe(200);
    expect(publica.body).toMatchObject({ estado: 'VIGENTE', tenant_nombre: 'Tenant de prueba' });

    const aceptada = await http()
      .post('/seg/invitaciones/aceptar')
      .set('Authorization', `Bearer ${await firmar(llave, claimsBase({ sub: rosa, tenant_id: null }))}`)
      .send({ token: tokenInvitacion });
    expect(aceptada.status).toBe(200);
    expect(aceptada.body).toEqual({ tenant_id: tenant, membresia_id: invitada.body.membresia_id, refrescar_sesion: true });

    // Tras refreshSession() el hook pone tenant_id: se simula con un token que ya lo trae.
    const contexto = await http().get('/seg/mi-contexto').set('Authorization', `Bearer ${await token(rosa)}`);
    expect(contexto.status).toBe(200);
    expect(contexto.body).toMatchObject({ sucursal_actual: sucursal, permisos: ['rest.caja.cerrar'] });
  });

  it('TR-CA-039: tras finalizar a Pedro, su siguiente petición con @Permiso responde 403', async () => {
    const pedro = await e.sembrar.membresia(tenant, 'ACTIVO');
    await e.sembrar.asignacion(tenant, pedro.membresiaId, { rolId: invitador }, {}, { alcance: 'SUCURSAL', sucursalId: sucursal });
    const comoPedro = async () =>
      http().post('/seg/invitaciones').set('Authorization', `Bearer ${await token(pedro.usuarioId)}`).set('X-Sucursal-Id', sucursal).send({});

    // Pasa el guard (llega a validar el cuerpo).
    expect((await comoPedro()).status).toBe(400);

    const fin = await http()
      .post(`/seg/membresias/${pedro.membresiaId}/finalizar`)
      .set('Authorization', `Bearer ${await token(ana.usuarioId, conMfa)}`)
      .set('X-Sucursal-Id', sucursal)
      .send({ motivo: 'Cese', confirmar: true });
    expect(fin.status).toBe(200);
    expect(fin.body.estado).toBe('FINALIZADO');

    const despues = await comoPedro();
    expect(despues.status).toBe(403);
    expect(despues.body.codigo).toBe('SUCURSAL_NO_ASIGNADA');
  });

  it('suspender con MFA de hace 40 min responde 401 MFA_REQUERIDA (permiso sensible)', async () => {
    const luis = await e.sembrar.membresia(tenant, 'ACTIVO');
    const res = await http()
      .post(`/seg/membresias/${luis.membresiaId}/suspender`)
      .set('Authorization', `Bearer ${await token(ana.usuarioId, { aal: 'aal2', amr: [{ method: 'totp', timestamp: ahoraSeg() - 40 * 60 }] })}`)
      .set('X-Sucursal-Id', sucursal)
      .send({ motivo: 'Licencia médica', confirmar: true });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ codigo: 'MFA_REQUERIDA', max_edad: 900 });
  });

  it('una membresía de otro tenant responde 404', async () => {
    const otro = await e.sembrar.tenant();
    const ajena = await e.sembrar.membresia(otro, 'ACTIVO');

    const res = await http()
      .post(`/seg/membresias/${ajena.membresiaId}/suspender`)
      .set('Authorization', `Bearer ${await token(ana.usuarioId, conMfa)}`)
      .set('X-Sucursal-Id', sucursal)
      .send({ motivo: 'Fuera de mi tenant', confirmar: true });

    expect(res.status).toBe(404);
    expect((await e.dataSource.query('SELECT estado FROM seg.membresia WHERE id = $1', [ajena.membresiaId]))[0].estado).toBe('ACTIVO');
  });
});
