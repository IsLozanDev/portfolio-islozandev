import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InMemoryEventSchemaValidator, KernelInfraModule, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { ROL_PROPIETARIO } from '../src/application/invitar-propietario.js';
import { PROVEEDOR_IDENTIDAD } from '../src/application/ports/proveedor-identidad.port.js';
import { REGISTRO_ACCESO } from '../src/application/ports/registro-acceso.port.js';
import { registrarEsquemasSeg } from '../src/infrastructure/event-schemas.js';
import { CachePermisosRedis, crearClienteRedis } from '../src/infrastructure/redis/cache-permisos.redis.js';
import { SeguridadModule } from '../src/seguridad.module.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { claimsBase, firmar, JwksLocal, nuevaLlave, type Llave } from './support/jwks-local.js';
import { ProveedorIdentidadFalso } from './support/proveedor-identidad.falso.js';
import { describeConDb } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const MOZO_TERRAZA = { codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza', permisos: ['rest.pedido.tomar', 'rest.mesa.ver'] };

/** Pila completa: guards reales, PermisoGuard con caché Redis y base temporal (spec 16b). */
describeConDb('API de roles y catálogo (spec 16b; PostgreSQL 16 y Redis 7)', () => {
  let e: Entorno;
  let app: INestApplication;
  let tenant: string;
  let sucursal: string;
  let REST_MOZO: string;
  let REST_CAJERO: string;
  let PLAT_ADMIN_TENANTS: string;
  let ana: { membresiaId: string; usuarioId: string };
  let luis: { membresiaId: string; usuarioId: string };
  const jwks = new JwksLocal();
  let llave: Llave;

  const token = (usuarioId: string, tenantId = tenant) => firmar(llave, claimsBase({ sub: usuarioId, tenant_id: tenantId }));
  const comoAna = async (metodo: 'get' | 'post' | 'put', ruta: string, cuerpo?: object) => {
    const peticion = request(app.getHttpServer())[metodo](ruta).set('Authorization', `Bearer ${await token(ana.usuarioId)}`).set('X-Sucursal-Id', sucursal);
    return cuerpo === undefined ? peticion : peticion.send(cuerpo);
  };
  const permisosEfectivos = async (usuarioId: string) => {
    const respuesta = await request(app.getHttpServer()).get('/seg/mi-contexto').set('Authorization', `Bearer ${await token(usuarioId)}`);
    expect(respuesta.status).toBe(200);
    return respuesta.body.permisos as string[];
  };

  const sembrarOpcion = async (moduloCodigo: string, moduloOrden: number, opcionCodigo: string, permisos: string[]) => {
    const moduloId = uuidV7();
    const opcionId = uuidV7();
    await e.dataSource.query("INSERT INTO seg.modulo (id, producto_codigo, codigo, nombre, orden) VALUES ($1, 'REST', $2, $2, $3)", [moduloId, moduloCodigo, moduloOrden]);
    await e.dataSource.query('INSERT INTO seg.opcion (id, modulo_id, codigo, nombre, orden) VALUES ($1, $2, $3, $3, 1)', [opcionId, moduloId, opcionCodigo]);
    await e.dataSource.query('INSERT INTO seg.opcion_permiso (opcion_id, permiso_codigo) SELECT $1, unnest($2::varchar[])', [opcionId, permisos]);
  };

  beforeAll(async () => {
    e = await crearEntorno();
    for (const permiso of ['rest.pedido.tomar', 'rest.pedido.anular', 'rest.mesa.ver', 'rest.reporte.ver']) {
      await e.sembrar.permiso(permiso, { alcanceMinimo: 'SUCURSAL' });
    }
    await e.sembrar.permiso('rest.caja.cerrar', { alcanceMinimo: 'SUCURSAL', sensible: true });
    for (const permiso of ['plat.rol.gestionar', 'plat.manifiesto.aplicar', 'plat.tenant.crear']) {
      await e.sembrar.permiso(permiso, { alcanceMinimo: 'TENANT' });
    }
    await sembrarOpcion('salon', 1, 'rest.salon.pedidos', ['rest.pedido.tomar', 'rest.pedido.anular', 'rest.mesa.ver']);
    await sembrarOpcion('caja', 2, 'rest.caja.cierre', ['rest.caja.cerrar']);

    REST_MOZO = await e.sembrar.rol(null, 'REST', 'REST_MOZO', ['rest.pedido.tomar', 'rest.pedido.anular', 'rest.mesa.ver']);
    REST_CAJERO = await e.sembrar.rol(null, 'REST', 'REST_CAJERO', ['rest.caja.cerrar']);
    await e.sembrar.rol(null, 'PLAT', ROL_PROPIETARIO, ['plat.rol.gestionar']);
    PLAT_ADMIN_TENANTS = await e.sembrar.rol(null, 'PLAT', 'PLAT_ADMIN_TENANTS', ['plat.tenant.crear']);

    tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST');
    ({ sucursales: [sucursal] } = await e.sembrar.organizacion(tenant));
    const administrador = await e.sembrar.rol(tenant, 'PLAT', 'ADMIN_ROLES', ['plat.rol.gestionar']);
    ana = await e.sembrar.membresia(tenant, 'ACTIVO', true);
    await e.sembrar.asignacion(tenant, ana.membresiaId, { rolId: administrador });
    luis = await e.sembrar.membresia(tenant, 'ACTIVO');
    await e.sembrar.asignacion(tenant, luis.membresiaId, { rolId: REST_MOZO }, {}, { alcance: 'SUCURSAL', sucursalId: sucursal });

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

  it('sin plat.rol.gestionar, las ocho rutas responden 403 SIN_PERMISO', async () => {
    const rutas: Array<['get' | 'post' | 'put', string]> = [
      ['get', '/seg/roles'],
      ['get', `/seg/roles/${REST_MOZO}`],
      ['post', '/seg/roles'],
      ['post', `/seg/roles/${REST_MOZO}/copia`],
      ['put', `/seg/roles/${REST_MOZO}/permisos`],
      ['post', `/seg/roles/${REST_MOZO}/inactivar`],
      ['get', '/seg/productos-disponibles'],
      ['get', '/seg/catalogo/REST'],
    ];
    for (const [metodo, ruta] of rutas) {
      const respuesta = await request(app.getHttpServer())[metodo](ruta).set('Authorization', `Bearer ${await token(luis.usuarioId)}`).set('X-Sucursal-Id', sucursal).send({});
      expect([metodo, ruta, respuesta.status, respuesta.body.codigo]).toEqual([metodo, ruta, 403, 'SIN_PERMISO']);
    }
  });

  describe('roles', () => {
    let mozoTerraza: string;
    let afectados: Array<{ membresiaId: string; usuarioId: string }>;

    it('TR-CA-031: copiar REST_MOZO como «Mozo terraza» sin rest.pedido.anular deja un rol propio activo sin ese permiso', async () => {
      const copia = await comoAna('post', `/seg/roles/${REST_MOZO}/copia`, MOZO_TERRAZA);
      expect(copia.status).toBe(201);
      mozoTerraza = copia.body.rol_id;

      const detalle = await comoAna('get', `/seg/roles/${mozoTerraza}`);
      expect(detalle.body).toMatchObject({ codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza', predefinido: false, activo: true, permisos: ['rest.mesa.ver', 'rest.pedido.tomar'] });
      expect(await e.eventosDe(mozoTerraza)).toEqual([
        ['rol.creado', 1],
        ['rol.permisos_cambiados', 2],
      ]);
    });

    it('TR-CA-032: cambiar permisos de REST_CAJERO responde 409 ROL_PREDEFINIDO_NO_EDITABLE', async () => {
      const respuesta = await comoAna('put', `/seg/roles/${REST_CAJERO}/permisos`, { permisos: [] });

      expect([respuesta.status, respuesta.body]).toEqual([409, { codigo: 'ROL_PREDEFINIDO_NO_EDITABLE', mensaje: 'Los roles predefinidos no se editan; cree una copia' }]);
    });

    it('TR-RNF-101: un cambio de permisos se ve en el siguiente mi-contexto del afectado', async () => {
      afectados = [];
      for (let indice = 0; indice < 4; indice++) {
        const miembro = await e.sembrar.membresia(tenant, 'ACTIVO');
        await e.sembrar.asignacion(tenant, miembro.membresiaId, { rolId: mozoTerraza }, {}, { alcance: 'SUCURSAL', sucursalId: sucursal });
        afectados.push(miembro);
      }
      expect(await permisosEfectivos(afectados[0].usuarioId)).toEqual(['rest.mesa.ver', 'rest.pedido.tomar']);

      const cambio = await comoAna('put', `/seg/roles/${mozoTerraza}/permisos`, { permisos: ['rest.pedido.tomar'] });

      expect(cambio.status).toBe(204);
      expect(await permisosEfectivos(afectados[0].usuarioId)).toEqual(['rest.pedido.tomar']);
    });

    it('TR-CA-033: inactivar «Mozo terraza» con 4 usuarios pide confirmación y, confirmado, les quita los permisos', async () => {
      const sinConfirmar = await comoAna('post', `/seg/roles/${mozoTerraza}/inactivar`, { confirmado: false });
      expect([sinConfirmar.status, sinConfirmar.body]).toEqual([200, { requiere_confirmacion: true, afectados: 4 }]);
      expect((await comoAna('get', `/seg/roles/${mozoTerraza}`)).body.activo).toBe(true);

      const confirmado = await comoAna('post', `/seg/roles/${mozoTerraza}/inactivar`, { confirmado: true });
      expect([confirmado.status, confirmado.body]).toEqual([200, { requiere_confirmacion: false, afectados: 4 }]);
      expect((await comoAna('get', `/seg/roles/${mozoTerraza}`)).body.activo).toBe(false);
      for (const afectado of afectados) expect(await permisosEfectivos(afectado.usuarioId)).toEqual([]);
      expect((await e.eventosDe(mozoTerraza)).map(([tipo]) => tipo)).toContain('rol.inactivado');
    });

    it('inactivar un rol sin asignaciones informa 0 afectados', async () => {
      const creado = await comoAna('post', '/seg/roles', { producto_codigo: 'REST', codigo: 'SIN_USO', nombre: 'Sin uso', permisos: ['rest.mesa.ver'] });

      const respuesta = await comoAna('post', `/seg/roles/${creado.body.rol_id}/inactivar`, { confirmado: false });

      expect(respuesta.body).toEqual({ requiere_confirmacion: true, afectados: 0 });
    });

    it('un código repetido responde 409 CONFLICTO', async () => {
      const respuesta = await comoAna('post', '/seg/roles', { producto_codigo: 'REST', ...MOZO_TERRAZA });

      expect([respuesta.status, respuesta.body]).toEqual([409, { codigo: 'CONFLICTO', mensaje: 'Ya existe un rol con ese código en el tenant' }]);
    });

    it('un rol PLAT con permisos de despliegue u operador responde 400 PERMISO_AJENO_AL_PRODUCTO, también al copiar PLAT_ADMIN_TENANTS', async () => {
      for (const permiso of ['plat.manifiesto.aplicar', 'plat.tenant.crear']) {
        const respuesta = await comoAna('post', '/seg/roles', { producto_codigo: 'PLAT', codigo: 'ESCALADA', nombre: 'Escalada', permisos: [permiso] });
        expect([respuesta.status, respuesta.body.codigo]).toEqual([400, 'PERMISO_AJENO_AL_PRODUCTO']);
      }
      const copia = await comoAna('post', `/seg/roles/${PLAT_ADMIN_TENANTS}/copia`, { codigo: 'TENANTS', nombre: 'Tenants' });
      expect([copia.status, copia.body.codigo]).toEqual([400, 'PERMISO_AJENO_AL_PRODUCTO']);
    });

    it('un producto sin suscripción vigente responde 400 PRODUCTO_NO_CONTRATADO', async () => {
      const respuesta = await comoAna('post', '/seg/roles', { producto_codigo: 'GYM', codigo: 'RECEPCION', nombre: 'Recepción', permisos: [] });

      expect([respuesta.status, respuesta.body.codigo]).toEqual([400, 'PRODUCTO_NO_CONTRATADO']);
    });

    it('la lista trae propios e inactivos y predefinidos de PLAT y REST, sin PLAT_ADMIN_TENANTS ni roles de otro tenant', async () => {
      const otro = await e.sembrar.tenant();
      await e.sembrar.rol(otro, 'REST', 'AJENO', ['rest.mesa.ver']);

      const respuesta = await comoAna('get', '/seg/roles');

      expect(respuesta.status).toBe(200);
      const codigos = respuesta.body.items.map((rol: { codigo: string }) => rol.codigo);
      expect(codigos).toEqual(expect.arrayContaining(['ADMIN_ROLES', ROL_PROPIETARIO, 'MOZO_TERRAZA', 'SIN_USO', 'REST_CAJERO', 'REST_MOZO']));
      expect(codigos).not.toContain('PLAT_ADMIN_TENANTS');
      expect(codigos).not.toContain('AJENO');
      expect(respuesta.body.items.find((rol: { codigo: string }) => rol.codigo === 'MOZO_TERRAZA')).toMatchObject({ activo: false, predefinido: false, total_permisos: 1 });
    });

    it('un rol de otro tenant responde 404 NO_ENCONTRADO', async () => {
      const otro = await e.sembrar.tenant();
      const ajeno = await e.sembrar.rol(otro, 'REST', 'AJENO_2', ['rest.mesa.ver']);

      const respuesta = await comoAna('get', `/seg/roles/${ajeno}`);

      expect([respuesta.status, respuesta.body]).toEqual([404, { codigo: 'NO_ENCONTRADO', mensaje: 'El rol no existe' }]);
    });
  });

  describe('catálogo', () => {
    it('REST: módulo → opción → permiso, sensibles marcados, sin opción en otros', async () => {
      const respuesta = await comoAna('get', '/seg/catalogo/REST');

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.modulos.map((modulo: { codigo: string }) => modulo.codigo)).toEqual(['salon', 'caja']);
      expect(respuesta.body.modulos[1].opciones[0].permisos).toEqual([{ codigo: 'rest.caja.cerrar', descripcion: 'rest.caja.cerrar', sensible: true, alcance_minimo: 'SUCURSAL' }]);
      expect(respuesta.body.otros.map((permiso: { codigo: string }) => permiso.codigo)).toEqual(['rest.reporte.ver']);
    });

    it('PLAT solo trae permisos de PLAT_PROPIETARIO', async () => {
      const respuesta = await comoAna('get', '/seg/catalogo/PLAT');

      expect(respuesta.body.otros.map((permiso: { codigo: string }) => permiso.codigo)).toEqual(['plat.rol.gestionar']);
    });

    it('un producto no contratado responde 400 PRODUCTO_NO_CONTRATADO', async () => {
      const respuesta = await comoAna('get', '/seg/catalogo/GYM');

      expect([respuesta.status, respuesta.body.codigo]).toEqual([400, 'PRODUCTO_NO_CONTRATADO']);
    });

    it('productos-disponibles trae PLAT y solo los contratados vigentes', async () => {
      const respuesta = await comoAna('get', '/seg/productos-disponibles');

      expect(respuesta.body.items.map((producto: { codigo: string }) => producto.codigo)).toEqual(['PLAT', 'REST']);
    });
  });
});
