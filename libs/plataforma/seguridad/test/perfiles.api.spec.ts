import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import { ROL_PROPIETARIO } from '../src/application/invitar-propietario.js';
import { PROVEEDOR_IDENTIDAD } from '../src/application/ports/proveedor-identidad.port.js';
import { REGISTRO_ACCESO } from '../src/application/ports/registro-acceso.port.js';
import { registrarEsquemasSeg } from '../src/infrastructure/event-schemas.js';
import { CachePermisosRedis, crearClienteRedis } from '../src/infrastructure/redis/cache-permisos.redis.js';
import { SeguridadModule } from '../src/seguridad.module.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { ahoraSeg, claimsBase, firmar, JwksLocal, nuevaLlave, type Llave } from './support/jwks-local.js';
import { ProveedorIdentidadFalso } from './support/proveedor-identidad.falso.js';
import { describeConDb } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CON_MFA = { aal: 'aal2', amr: [{ method: 'totp', timestamp: ahoraSeg() - 60 }] };

type Metodo = 'get' | 'post' | 'put';
type Miembro = { membresiaId: string; usuarioId: string };

/** Pila completa: guards reales, PermisoGuard con caché Redis y base temporal (spec 16c). LIB y ECO contratados, CLI no. */
describeConDb('API de perfiles (spec 16c; PostgreSQL 16 y Redis 7)', () => {
  let e: Entorno;
  let app: INestApplication;
  let tenant: string;
  let sucursal: string;
  let LIB_VENDEDOR: string;
  let ECO_GESTOR: string;
  let CLI_RECEPCION: string;
  let PLAT_ADMIN_TENANTS: string;
  let CAJA_PREDEFINIDA: string;
  let ana: Miembro;
  let luis: Miembro;
  const jwks = new JwksLocal();
  let llave: Llave;

  const token = (usuarioId: string, claims: Record<string, unknown> = {}) => firmar(llave, claimsBase({ sub: usuarioId, tenant_id: tenant, ...claims }));
  const como = async (miembro: Miembro, metodo: Metodo, ruta: string, cuerpo?: object, claims: Record<string, unknown> = {}) => {
    const peticion = request(app.getHttpServer())[metodo](ruta).set('Authorization', `Bearer ${await token(miembro.usuarioId, claims)}`).set('X-Sucursal-Id', sucursal);
    return cuerpo === undefined ? peticion : peticion.send(cuerpo);
  };
  const comoAna = (metodo: Metodo, ruta: string, cuerpo?: object) => como(ana, metodo, ruta, cuerpo);
  const permisosEfectivos = async (miembro: Miembro) => {
    const respuesta = await request(app.getHttpServer()).get('/seg/mi-contexto').set('Authorization', `Bearer ${await token(miembro.usuarioId)}`);
    expect(respuesta.status).toBe(200);
    return respuesta.body.permisos as string[];
  };
  const payloadCreado = async (perfilId: string) =>
    (await e.dataSource.query("SELECT payload FROM sync.outbox WHERE aggregate_id = $1 AND event_type = 'perfil.creado'", [perfilId]))[0].payload;

  beforeAll(async () => {
    e = await crearEntorno();
    for (const permiso of ['plat.perfil.gestionar', 'plat.rol.gestionar', 'plat.tenant.crear']) await e.sembrar.permiso(permiso, { alcanceMinimo: 'TENANT' });
    await e.sembrar.permiso('plat.asignacion.otorgar', { alcanceMinimo: 'SUCURSAL', sensible: true });
    for (const permiso of ['lib.venta.registrar', 'eco.pedido.gestionar', 'cli.cita.registrar']) await e.sembrar.permiso(permiso, { alcanceMinimo: 'SUCURSAL' });

    await e.sembrar.rol(null, 'PLAT', ROL_PROPIETARIO, ['plat.perfil.gestionar', 'plat.rol.gestionar', 'plat.asignacion.otorgar']);
    PLAT_ADMIN_TENANTS = await e.sembrar.rol(null, 'PLAT', 'PLAT_ADMIN_TENANTS', ['plat.tenant.crear']);
    LIB_VENDEDOR = await e.sembrar.rol(null, 'LIB', 'LIB_VENDEDOR', ['lib.venta.registrar']);
    ECO_GESTOR = await e.sembrar.rol(null, 'ECO', 'ECO_GESTOR_PEDIDOS', ['eco.pedido.gestionar']);
    CLI_RECEPCION = await e.sembrar.rol(null, 'CLI', 'CLI_RECEPCION', ['cli.cita.registrar']);
    CAJA_PREDEFINIDA = await e.sembrar.perfil(null, 'CAJA', [LIB_VENDEDOR]);

    tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'LIB');
    await e.sembrar.suscripcion(tenant, 'ECO');
    ({ sucursales: [sucursal] } = await e.sembrar.organizacion(tenant));
    // Gestiona perfiles y asigna, pero no gestiona roles: roles-disponibles no exige plat.rol.gestionar.
    const administrador = await e.sembrar.rol(tenant, 'PLAT', 'ADMIN_PERFILES', ['plat.perfil.gestionar', 'plat.asignacion.otorgar']);
    ana = await e.sembrar.membresia(tenant, 'ACTIVO', true);
    await e.sembrar.asignacion(tenant, ana.membresiaId, { rolId: administrador });
    luis = await e.sembrar.membresia(tenant, 'ACTIVO');
    await e.sembrar.asignacion(tenant, luis.membresiaId, { rolId: LIB_VENDEDOR }, {}, { alcance: 'SUCURSAL', sucursalId: sucursal });

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

  it('sin plat.perfil.gestionar, las seis rutas responden 403 SIN_PERMISO', async () => {
    const rutas: Array<[Metodo, string]> = [
      ['get', '/seg/perfiles'],
      ['get', '/seg/perfiles/roles-disponibles'],
      ['get', `/seg/perfiles/${CAJA_PREDEFINIDA}`],
      ['post', '/seg/perfiles'],
      ['post', `/seg/perfiles/${CAJA_PREDEFINIDA}/copia`],
      ['put', `/seg/perfiles/${CAJA_PREDEFINIDA}/roles`],
    ];
    for (const [metodo, ruta] of rutas) {
      const respuesta = await como(luis, metodo, ruta, {});
      expect([metodo, ruta, respuesta.status, respuesta.body.codigo]).toEqual([metodo, ruta, 403, 'SIN_PERMISO']);
    }
  });

  it('roles-disponibles, sin plat.rol.gestionar: activos de PLAT y contratados por producto y nombre; sin CLI_RECEPCION ni PLAT_ADMIN_TENANTS', async () => {
    const retirado = await e.sembrar.rol(tenant, 'LIB', 'LIB_RETIRADO', ['lib.venta.registrar']);
    await e.dataSource.query('UPDATE seg.rol SET activo = false WHERE id = $1', [retirado]);

    const respuesta = await comoAna('get', '/seg/perfiles/roles-disponibles');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.items.map((rol: { codigo: string; producto_codigo: string }) => [rol.producto_codigo, rol.codigo])).toEqual([
      ['ECO', 'ECO_GESTOR_PEDIDOS'],
      ['LIB', 'LIB_VENDEDOR'],
      ['PLAT', 'ADMIN_PERFILES'],
      ['PLAT', ROL_PROPIETARIO],
    ]);
    expect(respuesta.body.items[1]).toEqual({ id: LIB_VENDEDOR, codigo: 'LIB_VENDEDOR', nombre: 'LIB_VENDEDOR', producto_codigo: 'LIB', producto_nombre: 'LIB', predefinido: true });
  });

  describe('crear, asignar y cambiar roles', () => {
    let encargado: string;
    let maria: Miembro;

    it('TR-CA-034: «Encargado de tienda» con LIB_VENDEDOR y ECO_GESTOR_PEDIDOS; al asignarlo da permisos de ambos productos', async () => {
      const creado = await comoAna('post', '/seg/perfiles', { codigo: 'ENCARGADO', nombre: 'Encargado de tienda', roles: [LIB_VENDEDOR, ECO_GESTOR] });
      expect(creado.status).toBe(201);
      encargado = creado.body.perfil_id;
      expect(await e.eventosDe(encargado)).toEqual([['perfil.creado', 1]]);

      maria = await e.sembrar.membresia(tenant, 'ACTIVO');
      const asignacion = await como(ana, 'post', '/seg/asignaciones', { membresia_id: maria.membresiaId, perfil_id: encargado, alcance: 'SUCURSAL', sucursal_id: sucursal }, CON_MFA);
      expect(asignacion.status).toBe(201);

      expect(await permisosEfectivos(maria)).toEqual(['eco.pedido.gestionar', 'lib.venta.registrar']);
    });

    it('TR-RNF-101: cambiar los roles del perfil asignado se ve en el siguiente mi-contexto del afectado', async () => {
      const cambio = await comoAna('put', `/seg/perfiles/${encargado}/roles`, { roles: [LIB_VENDEDOR] });

      expect(cambio.status).toBe(204);
      expect(await permisosEfectivos(maria)).toEqual(['lib.venta.registrar']);
      expect(await e.eventosDe(encargado)).toEqual([
        ['perfil.creado', 1],
        ['perfil.roles_cambiados', 2],
      ]);
    });

    it('TR-CA-035: CLI_RECEPCION sin CLI contratado responde 400 PRODUCTO_NO_CONTRATADO al crear y al cambiar roles', async () => {
      const crear = await comoAna('post', '/seg/perfiles', { codigo: 'RECEPCION', nombre: 'Recepción', roles: [CLI_RECEPCION] });
      const cambiar = await comoAna('put', `/seg/perfiles/${encargado}/roles`, { roles: [LIB_VENDEDOR, CLI_RECEPCION] });

      expect([crear.status, crear.body.codigo]).toEqual([400, 'PRODUCTO_NO_CONTRATADO']);
      expect([cambiar.status, cambiar.body.codigo]).toEqual([400, 'PRODUCTO_NO_CONTRATADO']);
    });

    it('PLAT_ADMIN_TENANTS responde 400 ROL_FUERA_DEL_TECHO al crear, copiar y cambiar roles', async () => {
      const respuestas = [
        await comoAna('post', '/seg/perfiles', { codigo: 'OPERADOR', nombre: 'Operador', roles: [PLAT_ADMIN_TENANTS] }),
        await comoAna('post', `/seg/perfiles/${encargado}/copia`, { codigo: 'OPERADOR_2', nombre: 'Operador 2', roles: [PLAT_ADMIN_TENANTS] }),
        await comoAna('put', `/seg/perfiles/${encargado}/roles`, { roles: [PLAT_ADMIN_TENANTS] }),
      ];

      for (const respuesta of respuestas) {
        expect([respuesta.status, respuesta.body]).toEqual([400, { codigo: 'ROL_FUERA_DEL_TECHO', mensaje: 'El rol PLAT_ADMIN_TENANTS no se puede usar en un perfil del cliente' }]);
      }
    });

    it('un perfil sin roles responde 400 SOLICITUD_INVALIDA', async () => {
      const respuesta = await comoAna('post', '/seg/perfiles', { codigo: 'VACIO', nombre: 'Vacío', roles: [] });

      expect([respuesta.status, respuesta.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', mensaje: 'El perfil debe tener al menos un rol' }]);
    });

    it('un código repetido responde 409 CONFLICTO', async () => {
      const respuesta = await comoAna('post', '/seg/perfiles', { codigo: 'ENCARGADO', nombre: 'Otro', roles: [LIB_VENDEDOR] });

      expect([respuesta.status, respuesta.body]).toEqual([409, { codigo: 'CONFLICTO', mensaje: 'Ya existe un perfil con ese código en el tenant' }]);
    });
  });

  describe('predefinidos y copia', () => {
    it('cambiar roles de un predefinido responde 409 PERFIL_PREDEFINIDO_NO_EDITABLE', async () => {
      const respuesta = await comoAna('put', `/seg/perfiles/${CAJA_PREDEFINIDA}/roles`, { roles: [ECO_GESTOR] });

      expect([respuesta.status, respuesta.body]).toEqual([409, { codigo: 'PERFIL_PREDEFINIDO_NO_EDITABLE', mensaje: 'Los perfiles predefinidos no se editan; cree una copia' }]);
    });

    it('copiar un predefinido sin roles crea un perfil propio con los del origen y copiado_de en perfil.creado', async () => {
      const copia = await comoAna('post', `/seg/perfiles/${CAJA_PREDEFINIDA}/copia`, { codigo: 'CAJA_PROPIA', nombre: 'Caja propia' });
      expect(copia.status).toBe(201);
      const copiaId = copia.body.perfil_id;

      const detalle = await comoAna('get', `/seg/perfiles/${copiaId}`);
      expect(detalle.body).toEqual({ id: copiaId, codigo: 'CAJA_PROPIA', nombre: 'Caja propia', predefinido: false, roles: [LIB_VENDEDOR] });
      expect(await e.eventosDe(copiaId)).toEqual([['perfil.creado', 1]]);
      expect((await payloadCreado(copiaId)).copiado_de).toBe(CAJA_PREDEFINIDA);
    });

    it('copiar un propio con roles usa esos roles', async () => {
      const origen = await comoAna('post', '/seg/perfiles', { codigo: 'MIXTO', nombre: 'Mixto', roles: [LIB_VENDEDOR, ECO_GESTOR] });
      const copia = await comoAna('post', `/seg/perfiles/${origen.body.perfil_id}/copia`, { codigo: 'SOLO_ECO', nombre: 'Solo ECO', roles: [ECO_GESTOR] });

      expect(copia.status).toBe(201);
      expect((await comoAna('get', `/seg/perfiles/${copia.body.perfil_id}`)).body.roles).toEqual([ECO_GESTOR]);
    });
  });

  describe('lecturas', () => {
    it('la lista trae propios y predefinidos con total_roles y productos, sin perfiles de otro tenant', async () => {
      const otro = await e.sembrar.tenant();
      await e.sembrar.perfil(otro, 'AJENO', [LIB_VENDEDOR]);

      const respuesta = await comoAna('get', '/seg/perfiles');

      expect(respuesta.status).toBe(200);
      const codigos = respuesta.body.items.map((perfil: { codigo: string }) => perfil.codigo);
      expect(codigos).toEqual(expect.arrayContaining(['CAJA', 'ENCARGADO', 'CAJA_PROPIA', 'MIXTO', 'SOLO_ECO']));
      expect(codigos).not.toContain('AJENO');
      expect(respuesta.body.items.find((perfil: { codigo: string }) => perfil.codigo === 'MIXTO')).toMatchObject({ predefinido: false, total_roles: 2, productos: ['ECO', 'LIB'] });
      expect(respuesta.body.items.find((perfil: { codigo: string }) => perfil.codigo === 'CAJA')).toMatchObject({ predefinido: true, total_roles: 1, productos: ['LIB'] });
    });

    it('un perfil de otro tenant responde 404 NO_ENCONTRADO', async () => {
      const otro = await e.sembrar.tenant();
      const ajeno = await e.sembrar.perfil(otro, 'AJENO_2', [LIB_VENDEDOR]);

      const respuesta = await comoAna('get', `/seg/perfiles/${ajeno}`);

      expect([respuesta.status, respuesta.body]).toEqual([404, { codigo: 'NO_ENCONTRADO', mensaje: 'El perfil no existe' }]);
    });
  });
});
