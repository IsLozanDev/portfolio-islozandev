import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { InMemoryEventSchemaValidator, KernelInfraModule, TENANT_CONTEXT, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { ENTIDADES_ORG, OrgModule, registrarEsquemasOrg } from '@vitrina/plataforma/org';
import { ContextoTenantInterceptor } from '@vitrina/plataforma/seguridad';
import { EmpresasController } from '../src/org/empresas.controller.js';
import { SucursalesController } from '../src/org/sucursales.controller.js';
import { UnidadesController } from '../src/org/unidades.controller.js';
import { crearBaseTemporal, describeConDb, type BaseTemporal } from './support/temp-db.js';

const RUC_SABORES = '20512345671';
const RUC_AMAUTA = '20498765433';
const CABECERA_TENANT = 'x-prueba-tenant';

/**
 * Deja el principal con el tenant de la cabecera, como AutenticacionGuard con el token. Los permisos
 * los cubre organizacion.http.spec.ts con PermisoGuard; aquí importan el dominio, la RLS y la base.
 */
class TenantDeCabecera implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const solicitud = contexto.switchToHttp().getRequest();
    solicitud.principal = { usuarioId: uuidV7(), tenantId: solicitud.headers[CABECERA_TENANT], tipo: 'INTERNO', aal: 'aal1', sesionId: 'sesion', amr: [] };
    return true;
  }
}

describeConDb('HTTP /v1/org contra PostgreSQL 16 (TR-CA-004 a 012)', () => {
  let base: BaseTemporal;
  let dataSource: DataSource;
  let app: INestApplication;

  const como = (tenantId: string) => ({
    get: (ruta: string) => request(app.getHttpServer()).get(`/v1/org${ruta}`).set(CABECERA_TENANT, tenantId),
    post: (ruta: string, cuerpo: object = {}) => request(app.getHttpServer()).post(`/v1/org${ruta}`).set(CABECERA_TENANT, tenantId).send(cuerpo),
    put: (ruta: string, cuerpo: object) => request(app.getHttpServer()).put(`/v1/org${ruta}`).set(CABECERA_TENANT, tenantId).send(cuerpo),
  });
  const consultar = (sql: string, parametros: unknown[] = []) => dataSource.query(sql, parametros);
  const eventosDe = async (aggregateId: string) =>
    (await consultar('SELECT event_type FROM sync.outbox WHERE aggregate_id = $1 ORDER BY seq', [aggregateId])).map((fila: { event_type: string }) => fila.event_type);

  /** Tenant ACTIVO con una suscripción REST con el tope de sucursales dado. */
  async function nuevoTenant(codigo: string, limiteSucursales: number | null = null): Promise<string> {
    const tenantId = uuidV7();
    await consultar(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, $2, $3, 'ACTIVO', 1)`, [tenantId, codigo, `Tenant ${codigo}`]);
    await consultar(
      `INSERT INTO org.suscripcion (id, tenant_id, producto_codigo, plan, estado, limite_sucursales, version) VALUES ($1, $2, 'REST', 'BASICO', 'ACTIVA', $3, 1)`,
      [uuidV7(), tenantId, limiteSucursales],
    );
    return tenantId;
  }

  /** Tenant con «Sabores del Sur SAC» y su principal. */
  async function conEmpresa(codigo: string, limiteSucursales: number | null = null) {
    const tenantId = await nuevoTenant(codigo, limiteSucursales);
    const respuesta = await como(tenantId).post('/empresas', { ruc: RUC_SABORES, razon_social: 'Sabores del Sur SAC', ubigeo: '040101' });
    expect(respuesta.status).toBe(201);
    return { tenantId, empresaId: respuesta.body.empresa_id as string, centroId: respuesta.body.sucursal_principal_id as string };
  }

  const sucursalCayma = { codigo: 'CAYMA', nombre: 'Cayma', codigo_establecimiento_sunat: '0002', ubigeo: '040103' };

  beforeAll(async () => {
    base = await crearBaseTemporal();
    dataSource = new DataSource({ type: 'postgres', url: base.url, entities: ENTIDADES_ORG });
    await dataSource.initialize();
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasOrg(validator);

    const modulo = await Test.createTestingModule({
      imports: [KernelInfraModule.register({ dataSource, validator }), OrgModule],
      controllers: [EmpresasController, SucursalesController, UnidadesController],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    app.useGlobalGuards(new TenantDeCabecera());
    app.useGlobalInterceptors(new ContextoTenantInterceptor(app.get(TENANT_CONTEXT)));
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await base?.borrar();
  });

  describe('empresas (TR-RF-002)', () => {
    it('TR-CA-004: la empresa queda activa con su principal 0000, y empresa.creada y sucursal.creada en el outbox', async () => {
      const { tenantId, empresaId, centroId } = await conEmpresa('http-empresa');

      const empresas = await como(tenantId).get('/empresas');
      expect(empresas.body).toEqual({ items: [expect.objectContaining({ id: empresaId, ruc: RUC_SABORES, activo: true, version: 1 })], total: 1 });
      const sucursales = await como(tenantId).get(`/empresas/${empresaId}/sucursales`);
      expect(sucursales.body.items).toEqual([expect.objectContaining({ id: centroId, es_principal: true, codigo_establecimiento_sunat: '0000' })]);
      expect(await eventosDe(empresaId)).toEqual(['empresa.creada']);
      expect(await eventosDe(centroId)).toEqual(['sucursal.creada']);
    });

    it('TR-CA-005: el mismo RUC en el tenant responde 409 sin filas ni eventos nuevos', async () => {
      const { tenantId } = await conEmpresa('http-ruc-repetido');
      const eventosAntes = Number((await consultar('SELECT count(*) AS n FROM sync.outbox WHERE tenant_id = $1', [tenantId]))[0].n);

      const respuesta = await como(tenantId).post('/empresas', { ruc: RUC_SABORES, razon_social: 'Otra razón SAC' });

      expect(respuesta.status).toBe(409);
      expect(respuesta.body).toEqual({ codigo: 'CONFLICTO', mensaje: 'La empresa ya está registrada en este tenant' });
      expect(Number((await consultar('SELECT count(*) AS n FROM org.empresa WHERE tenant_id = $1', [tenantId]))[0].n)).toBe(1);
      expect(Number((await consultar('SELECT count(*) AS n FROM sync.outbox WHERE tenant_id = $1', [tenantId]))[0].n)).toBe(eventosAntes);
    });

    it('un RUC con dígito verificador inválido responde 400 «RUC inválido»', async () => {
      const tenantId = await nuevoTenant('http-ruc-invalido');
      const respuesta = await como(tenantId).post('/empresas', { ruc: '20512345678', razon_social: 'Sabores del Sur SAC' });
      expect(respuesta.status).toBe(400);
      expect(respuesta.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', mensaje: 'RUC inválido' });
    });

    it('la edición con la versión de la lista responde 204; repetirla con esa versión responde 409 VERSION_OBSOLETA', async () => {
      const { tenantId, empresaId } = await conEmpresa('http-version-empresa');
      const [{ version }] = (await como(tenantId).get('/empresas')).body.items;
      const cuerpo = { version, razon_social: 'Sabores del Sur SAC', nombre_comercial: 'Sabores Arequipa' };

      expect((await como(tenantId).put(`/empresas/${empresaId}`, cuerpo)).status).toBe(204);
      const repetida = await como(tenantId).put(`/empresas/${empresaId}`, { ...cuerpo, nombre_comercial: 'Pisada' });

      expect(repetida.status).toBe(409);
      expect(repetida.body.codigo).toBe('VERSION_OBSOLETA');
      expect((await consultar('SELECT nombre_comercial FROM org.empresa WHERE id = $1', [empresaId]))[0].nombre_comercial).toBe('Sabores Arequipa');
    });
  });

  describe('sucursales (TR-RF-003)', () => {
    it('TR-CA-007: con 1 sucursal y tope 3, «Cayma» con 0002 y 040103 queda activa', async () => {
      const { tenantId, empresaId } = await conEmpresa('http-cayma', 3);

      const respuesta = await como(tenantId).post(`/empresas/${empresaId}/sucursales`, sucursalCayma);

      expect(respuesta.status).toBe(201);
      const lista = await como(tenantId).get(`/empresas/${empresaId}/sucursales?activo=true`);
      expect(lista.body.items[1]).toMatchObject({ id: respuesta.body.sucursal_id, nombre: 'Cayma', codigo_establecimiento_sunat: '0002', ubigeo: '040103', activo: true });
    });

    it('TR-CA-008: con tope 2 y 2 activas, la tercera responde 409 «Su plan permite 2 sucursales; amplíe su plan»', async () => {
      const { tenantId, empresaId } = await conEmpresa('http-tope', 2);
      expect((await como(tenantId).post(`/empresas/${empresaId}/sucursales`, sucursalCayma)).status).toBe(201);

      const tercera = await como(tenantId).post(`/empresas/${empresaId}/sucursales`, { ...sucursalCayma, codigo: 'YANAHUARA', nombre: 'Yanahuara', codigo_establecimiento_sunat: '0003' });

      expect(tercera.status).toBe(409);
      expect(tercera.body).toEqual({ codigo: 'CONFLICTO', mensaje: 'Su plan permite 2 sucursales; amplíe su plan' });
    });

    it('TR-CA-009: marcar «Cayma» como principal le pasa el 0000 y se lo quita a «Centro»', async () => {
      const { tenantId, empresaId, centroId } = await conEmpresa('http-principal');
      const { sucursal_id: caymaId } = (await como(tenantId).post(`/empresas/${empresaId}/sucursales`, sucursalCayma)).body;

      expect((await como(tenantId).post(`/sucursales/${caymaId}/principal`)).status).toBe(204);

      const lista = (await como(tenantId).get(`/empresas/${empresaId}/sucursales`)).body.items;
      expect(lista.filter((sucursal: { es_principal: boolean }) => sucursal.es_principal).map((sucursal: { id: string }) => sucursal.id)).toEqual([caymaId]);
      expect(lista.find((sucursal: { id: string }) => sucursal.id === caymaId).codigo_establecimiento_sunat).toBe('0000');
      expect(lista.find((sucursal: { id: string }) => sucursal.id === centroId).codigo_establecimiento_sunat).not.toBe('0000');
    });

    it('inactivar la principal responde 409; inactivar otra responde 204', async () => {
      const { tenantId, empresaId, centroId } = await conEmpresa('http-inactivar');
      const { sucursal_id: caymaId } = (await como(tenantId).post(`/empresas/${empresaId}/sucursales`, sucursalCayma)).body;

      const principal = await como(tenantId).post(`/sucursales/${centroId}/inactivar`);
      expect(principal.status).toBe(409);
      expect(principal.body.mensaje).toBe('Marque otra sucursal como principal antes de inactivar esta');
      expect((await como(tenantId).post(`/sucursales/${caymaId}/inactivar`)).status).toBe(204);
    });
  });

  describe('unidades (TR-RF-004)', () => {
    it('TR-CA-010: la CAJA «CAJA-01» queda activa en «Cayma»', async () => {
      const { tenantId, empresaId } = await conEmpresa('http-caja');
      const { sucursal_id: caymaId } = (await como(tenantId).post(`/empresas/${empresaId}/sucursales`, sucursalCayma)).body;

      const respuesta = await como(tenantId).post('/unidades', { empresa_id: empresaId, sucursal_id: caymaId, tipo: 'CAJA', codigo: 'CAJA-01', nombre: 'Caja 1', atributos: { impresora: 'EPSON-01' } });

      expect(respuesta.status).toBe(201);
      const lista = await como(tenantId).get(`/unidades?sucursal_id=${caymaId}`);
      expect(lista.body).toEqual({
        items: [expect.objectContaining({ id: respuesta.body.unidad_id, tipo: 'CAJA', codigo: 'CAJA-01', activo: true, atributos: { impresora: 'EPSON-01' } })],
        total: 1,
      });
    });

    it('TR-CA-011: un CONSULTORIO sin sucursal responde 400 «Solo los almacenes pueden registrarse sin sucursal»', async () => {
      const { tenantId, empresaId } = await conEmpresa('http-consultorio');
      const respuesta = await como(tenantId).post('/unidades', { empresa_id: empresaId, tipo: 'CONSULTORIO', codigo: 'C-01', nombre: 'Consultorio 1' });
      expect(respuesta.status).toBe(400);
      expect(respuesta.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', mensaje: 'Solo los almacenes pueden registrarse sin sucursal' });
    });

    it('TR-CA-012: un ALMACEN sin sucursal queda a nivel de empresa', async () => {
      const { tenantId, empresaId } = await conEmpresa('http-almacen');
      const respuesta = await como(tenantId).post('/unidades', { empresa_id: empresaId, tipo: 'ALMACEN', codigo: 'ALM', nombre: 'Almacén central' });
      expect(respuesta.status).toBe(201);
      expect((await consultar('SELECT sucursal_id FROM org.unidad_operativa WHERE id = $1', [respuesta.body.unidad_id]))[0].sucursal_id).toBeNull();
    });

    it('una unidad con padre de otra empresa responde 409', async () => {
      const { tenantId, empresaId } = await conEmpresa('http-padre-ajeno');
      const otra = (await como(tenantId).post('/empresas', { ruc: RUC_AMAUTA, razon_social: 'Amauta EIRL' })).body.empresa_id;
      const { unidad_id: almacenAjeno } = (await como(tenantId).post('/unidades', { empresa_id: otra, tipo: 'ALMACEN', codigo: 'ALM', nombre: 'Almacén Amauta' })).body;

      const respuesta = await como(tenantId).post('/unidades', { empresa_id: empresaId, tipo: 'ALMACEN', codigo: 'ALM-2', nombre: 'Almacén hijo', padre_id: almacenAjeno });

      expect(respuesta.status).toBe(409);
      expect(respuesta.body).toEqual({ codigo: 'CONFLICTO', mensaje: 'La unidad padre debe ser de la misma empresa' });
    });
  });

  it('aislamiento: un id de otro tenant en la URL responde 404, no 403, y las listas no lo muestran', async () => {
    const a = await conEmpresa('http-aislamiento-a');
    const b = await conEmpresa('http-aislamiento-b');
    const { sucursal_id: caymaDeA } = (await como(a.tenantId).post(`/empresas/${a.empresaId}/sucursales`, sucursalCayma)).body;
    const { unidad_id: almacenDeA } = (await como(a.tenantId).post('/unidades', { empresa_id: a.empresaId, tipo: 'ALMACEN', codigo: 'ALM', nombre: 'Almacén A' })).body;

    const intentos = [
      await como(b.tenantId).get(`/empresas/${a.empresaId}/sucursales`),
      await como(b.tenantId).put(`/empresas/${a.empresaId}`, { version: 1, razon_social: 'Tomada SAC' }),
      await como(b.tenantId).post(`/empresas/${a.empresaId}/sucursales`, sucursalCayma),
      await como(b.tenantId).post(`/sucursales/${caymaDeA}/inactivar`),
      await como(b.tenantId).post(`/unidades/${almacenDeA}/inactivar`),
      await como(b.tenantId).get(`/empresas/${a.empresaId}`),
      await como(b.tenantId).get(`/sucursales/${caymaDeA}`),
      await como(b.tenantId).get(`/unidades/${almacenDeA}`),
    ];

    expect(intentos.map((respuesta) => respuesta.status)).toEqual([404, 404, 404, 404, 404, 404, 404, 404]);
    expect((await como(a.tenantId).get(`/sucursales/${caymaDeA}`)).body).toMatchObject({ id: caymaDeA, codigo: 'CAYMA', version: 1 });
    expect((await como(b.tenantId).get('/empresas')).body.items.map((empresa: { id: string }) => empresa.id)).toEqual([b.empresaId]);
    expect((await como(b.tenantId).get('/unidades')).body).toEqual({ items: [], total: 0 });
  });
});
