import 'reflect-metadata';
import { Controller, Get, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import { PROVEEDOR_IDENTIDAD } from '../src/application/ports/proveedor-identidad.port.js';
import { REGISTRO_ACCESO } from '../src/application/ports/registro-acceso.port.js';
import { registrarEsquemasSeg } from '../src/infrastructure/event-schemas.js';
import { CachePermisosRedis, crearClienteRedis } from '../src/infrastructure/redis/cache-permisos.redis.js';
import { Permiso } from '../src/interface/decoradores.js';
import { SeguridadModule } from '../src/seguridad.module.js';
import { ProveedorIdentidadFalso } from './support/proveedor-identidad.falso.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { ahoraSeg, claimsBase, firmar, JwksLocal, nuevaLlave, type Llave } from './support/jwks-local.js';
import { describeConDb } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CON_MFA = { aal: 'aal2', amr: [{ method: 'totp', timestamp: ahoraSeg() - 60 }] };
const ejecuciones = { leer: 0, escribir: 0 };

/** Rutas de datos de un producto cualquiera: cuentan si el controlador llegó a correr. */
@Controller('prueba-soporte')
class RutasDePrueba {
  @Get()
  @Permiso('plat.seguridad.bitacora')
  leer() {
    ejecuciones.leer += 1;
    return { leido: true };
  }

  @Post()
  @Permiso('plat.prueba.escribir')
  escribir() {
    ejecuciones.escribir += 1;
    return { escrito: true };
  }
}

interface Actor {
  usuarioId: string;
  tenantId: string;
  sucursalId: string;
}

interface Peticion {
  usuario_id: string;
  detalle: Record<string, unknown>;
}

/** Pila completa (spec 18, TR-RNF-110): veto, modo LECTURA y una fila PETICION por petición, fallando cerrado. */
describeConDb('SoporteInterceptor (spec 18; PostgreSQL 16 y Redis 7)', () => {
  let e: Entorno;
  let app: INestApplication;
  let cliente: string;
  let sucursalCliente: string;
  let ana: Actor;
  let javier: Actor;
  let lucia: Actor;
  const accesos: Record<string, string> = {};
  const jwks = new JwksLocal();
  let llave: Llave;

  const llamar = async (actor: Actor, metodo: 'get' | 'post', ruta: string, cuerpo?: object) => {
    const token = await firmar(llave, claimsBase({ sub: actor.usuarioId, tenant_id: actor.tenantId, ...CON_MFA }));
    const peticion = request(app.getHttpServer())[metodo](ruta).set('Authorization', `Bearer ${token}`).set('X-Sucursal-Id', actor.sucursalId);
    return cuerpo ? peticion.send(cuerpo) : peticion;
  };
  /** El agente con el token ya refrescado al tenant del cliente. */
  const comoSoporte = (agente: Actor): Actor => ({ usuarioId: agente.usuarioId, tenantId: cliente, sucursalId: sucursalCliente });
  const peticiones = async (): Promise<Peticion[]> =>
    e.dataSource.query(
      `SELECT usuario_id, detalle FROM seg.evento_seguridad WHERE tenant_id = $1 AND detalle ->> 'accion' = 'PETICION' ORDER BY id`,
      [cliente],
    );
  /** Ejecuta `accion` y devuelve las filas PETICION que dejó. */
  const nuevasPeticiones = async (accion: () => Promise<unknown>): Promise<Peticion[]> => {
    const antes = (await peticiones()).length;
    await accion();
    return (await peticiones()).slice(antes);
  };

  async function miembro(tenantId: string, sucursalId: string, rolId: string, propietario = false): Promise<Actor> {
    const { membresiaId, usuarioId } = await e.sembrar.membresia(tenantId, 'ACTIVO', propietario);
    await e.sembrar.asignacion(tenantId, membresiaId, { rolId });
    return { usuarioId, tenantId, sucursalId };
  }

  async function accesoAprobado(agente: Actor, ticket: string, modo: 'LECTURA' | 'ESCRITURA', rolId: string): Promise<string> {
    const solicitud = await llamar(agente, 'post', '/seg/soporte/solicitudes', { tenant_id: cliente, ticket, motivo: 'Revisar la configuración', modo, horas: 2 });
    const aprobado = await llamar(ana, 'post', `/seg/soporte/solicitudes/${solicitud.body.id}/aprobar`, { horas: 2, rol_id: rolId });
    expect(aprobado.status).toBe(200);
    return solicitud.body.id;
  }

  beforeAll(async () => {
    e = await crearEntorno();
    for (const [codigo, sensible] of [
      ['plat.soporte.solicitar', false],
      ['plat.soporte.autorizar', true],
      ['plat.usuario.invitar', false],
      ['plat.seguridad.bitacora', false],
      ['plat.prueba.escribir', false],
    ] as const) {
      await e.sembrar.permiso(codigo, { alcanceMinimo: 'TENANT', sensible });
    }
    await e.sembrar.rol(null, 'PLAT', 'PLAT_PROPIETARIO', ['plat.soporte.autorizar', 'plat.usuario.invitar', 'plat.seguridad.bitacora', 'plat.prueba.escribir']);

    const operador = await e.sembrar.tenant();
    cliente = await e.sembrar.tenant();
    const [{ codigo: codigoOperador }] = await e.dataSource.query('SELECT codigo FROM org.tenant WHERE id = $1', [operador]);
    const {
      sucursales: [sucursalOperador],
    } = await e.sembrar.organizacion(operador);
    ({
      sucursales: [sucursalCliente],
    } = await e.sembrar.organizacion(cliente));
    const agente = await e.sembrar.rol(operador, 'PLAT', 'AGENTE', ['plat.soporte.solicitar']);
    const autorizador = await e.sembrar.rol(cliente, 'PLAT', 'AUTORIZADOR', ['plat.soporte.autorizar', 'plat.seguridad.bitacora']);
    const soporte = await e.sembrar.rol(cliente, 'PLAT', 'SOPORTE', ['plat.usuario.invitar', 'plat.seguridad.bitacora', 'plat.prueba.escribir']);
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
      controllers: [RutasDePrueba],
    })
      .overrideProvider(REGISTRO_ACCESO)
      .useValue({ marcar: async () => undefined })
      .overrideProvider(PROVEEDOR_IDENTIDAD)
      .useValue(new ProveedorIdentidadFalso(e.dataSource))
      .compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();

    accesos.javier = await accesoAprobado(javier, 'SOP-000245', 'LECTURA', soporte);
    accesos.lucia = await accesoAprobado(lucia, 'SOP-000246', 'ESCRITURA', soporte);
  });

  afterAll(async () => {
    const redis = crearClienteRedis(REDIS_URL);
    await new CachePermisosRedis(redis).invalidarTenant(cliente).catch(() => undefined);
    redis.disconnect();
    await app?.close();
    await jwks.detener();
    await e?.cerrar();
  });

  it('una lectura en modo LECTURA corre y deja exactamente una PETICION, sin query ni cuerpo', async () => {
    const filas = await nuevasPeticiones(async () => {
      const respuesta = await llamar(comoSoporte(javier), 'get', '/prueba-soporte?correo=rosa%40gmail.com');
      expect(respuesta.status).toBe(200);
    });

    expect(filas).toEqual([
      {
        usuario_id: javier.usuarioId,
        detalle: {
          accion: 'PETICION',
          acceso_id: accesos.javier,
          ticket: 'SOP-000245',
          modo: 'LECTURA',
          metodo: 'GET',
          ruta: '/prueba-soporte',
          permiso: 'plat.seguridad.bitacora',
          resultado: 'PERMITIDA',
        },
      },
    ]);
    expect(ejecuciones.leer).toBe(1);
  });

  it('un POST en modo LECTURA da 403 SOPORTE_SOLO_LECTURA, no corre y queda auditado', async () => {
    const filas = await nuevasPeticiones(async () => {
      const respuesta = await llamar(comoSoporte(javier), 'post', '/prueba-soporte', { nombre: 'Rosa' });
      expect(respuesta.status).toBe(403);
      expect(respuesta.body).toEqual({ codigo: 'SOPORTE_SOLO_LECTURA', mensaje: 'La sesión de soporte es de solo lectura' });
    });

    expect(filas.map((fila) => fila.detalle.resultado)).toEqual(['SOLO_LECTURA']);
    expect(ejecuciones.escribir).toBe(0);
  });

  it('un permiso vetado da 403 SOPORTE_PERMISO_VETADO aunque el rol aprobado lo tenga', async () => {
    const filas = await nuevasPeticiones(async () => {
      const respuesta = await llamar(comoSoporte(lucia), 'get', '/seg/miembros');
      expect([respuesta.status, respuesta.body.codigo]).toEqual([403, 'SOPORTE_PERMISO_VETADO']);
    });
    expect(filas).toEqual([expect.objectContaining({ detalle: expect.objectContaining({ ruta: '/seg/miembros', permiso: 'plat.usuario.invitar', resultado: 'VETADA' }) })]);
  });

  it('en modo ESCRITURA el POST corre', async () => {
    const respuesta = await llamar(comoSoporte(lucia), 'post', '/prueba-soporte', { nombre: 'Rosa' });
    expect(respuesta.status).toBe(201);
    expect(ejecuciones.escribir).toBe(1);
  });

  it('salir de soporte se permite en modo LECTURA y queda auditado', async () => {
    const filas = await nuevasPeticiones(async () => {
      expect((await llamar(comoSoporte(javier), 'post', '/seg/soporte/salir')).status).toBe(204);
    });
    expect(filas.map((fila) => [fila.detalle.ruta, fila.detalle.resultado])).toEqual([['/seg/soporte/salir', 'PERMITIDA']]);
  });

  it('las peticiones de un miembro normal no escriben PETICION', async () => {
    const filas = await nuevasPeticiones(async () => {
      expect((await llamar(ana, 'get', '/prueba-soporte')).status).toBe(200);
    });
    expect(filas).toEqual([]);
  });

  it('si la bitácora no escribe, responde 503 AUDITORIA_NO_DISPONIBLE y el controlador no corre', async () => {
    const lecturasPrevias = ejecuciones.leer;
    await e.dataSource.query(
      `ALTER TABLE seg.evento_seguridad ADD CONSTRAINT ck_prueba_sin_peticiones CHECK (detalle ->> 'accion' IS DISTINCT FROM 'PETICION') NOT VALID`,
    );
    try {
      const respuesta = await llamar(comoSoporte(javier), 'get', '/prueba-soporte');
      expect(respuesta.status).toBe(503);
      expect(respuesta.body.codigo).toBe('AUDITORIA_NO_DISPONIBLE');
    } finally {
      await e.dataSource.query('ALTER TABLE seg.evento_seguridad DROP CONSTRAINT ck_prueba_sin_peticiones');
    }
    expect(ejecuciones.leer).toBe(lecturasPrevias);
  });

  it('revocado el acceso, deja de auditar como soporte y PermisoGuard ya no lo deja pasar', async () => {
    await llamar(ana, 'post', `/seg/soporte/accesos/${accesos.javier}/revocar`, { motivo: 'Ya se resolvió', confirmar: true });
    const filas = await nuevasPeticiones(async () => {
      expect((await llamar(comoSoporte(javier), 'get', '/prueba-soporte')).status).toBe(403);
    });
    expect(filas).toEqual([]);
  });
});
