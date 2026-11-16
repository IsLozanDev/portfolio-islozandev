import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ENTIDADES_IDN, IDENTIDAD, IdentidadModule, registrarEsquemasIdn, type IdentidadPort } from '@vitrina/plataforma/identidad';
import { InMemoryEventSchemaValidator, KernelInfraModule, TENANT_CONTEXT, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { ENTIDADES_ORG, OrgModule, PADRON_RUC, registrarEsquemasOrg } from '@vitrina/plataforma/org';
import { ContextoTenantInterceptor } from '@vitrina/plataforma/seguridad';
import { PadronRucIdentidad } from '../src/identidad/padron-ruc.identidad.js';
import { EmpresasController } from '../src/org/empresas.controller.js';
import { crearBaseTemporal, describeConDb, type BaseTemporal } from './support/temp-db.js';

const RUC_ACTIVO_HABIDO = '20512345671';
const RUC_NO_HABIDO = '20456789120';
const RUC_BAJA_DE_OFICIO = '20498765433';
const RUC_FUERA_DEL_PADRON = '20601234565';
// En el padrón falso y sin consultar en las otras pruebas: no está en la caché.
const RUC_SIN_CACHE = '20100070970';
const CABECERA_TENANT = 'x-prueba-tenant';
const INCLUIDAS_POR_PLAN = { BASICO: 200, PRO: 500, EMPRESA: 2000 };
const UMBRAL_AVISO = 80;

/** Como en organizacion.integracion.spec.ts: el principal toma el tenant de la cabecera. */
class TenantDeCabecera implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const solicitud = contexto.switchToHttp().getRequest();
    solicitud.principal = { usuarioId: uuidV7(), tenantId: solicitud.headers[CABECERA_TENANT], tipo: 'INTERNO', aal: 'aal1', sesionId: 'sesion', amr: [] };
    return true;
  }
}

describeConDb('POST /v1/org/empresas con el padrón RUC de IDN (spec 28b)', () => {
  let base: BaseTemporal;
  let dataSource: DataSource;
  let app: INestApplication;

  const consultar = (sql: string, parametros: unknown[] = []) => dataSource.query(sql, parametros);
  const registrar = (tenantId: string, cuerpo: object) =>
    request(app.getHttpServer()).post('/v1/org/empresas').set(CABECERA_TENANT, tenantId).send(cuerpo);
  const razonSocialDe = async (empresaId: string) => (await consultar('SELECT razon_social FROM org.empresa WHERE id = $1', [empresaId]))[0].razon_social;

  async function nuevoTenant(codigo: string): Promise<string> {
    const tenantId = uuidV7();
    await consultar(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, $2, $3, 'ACTIVO', 1)`, [tenantId, codigo, `Tenant ${codigo}`]);
    await consultar(`INSERT INTO org.suscripcion (id, tenant_id, producto_codigo, plan, estado, version) VALUES ($1, $2, 'REST', 'BASICO', 'ACTIVA', 1)`, [
      uuidV7(),
      tenantId,
    ]);
    return tenantId;
  }

  beforeAll(async () => {
    base = await crearBaseTemporal();
    dataSource = new DataSource({ type: 'postgres', url: base.url, entities: [...ENTIDADES_ORG, ...ENTIDADES_IDN] });
    await dataSource.initialize();
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasOrg(validator);
    registrarEsquemasIdn(validator);

    const identidadModulo = IdentidadModule.register({
      proveedor: 'falso',
      hasher: { hashear: () => `sha256:${'0'.repeat(64)}` },
      planDelTenant: { useFactory: () => ({ planVigente: async () => 'BASICO' as const }) },
      configuracionCuota: {
        useFactory: () => ({ incluidasPorPlan: async () => INCLUIDAS_POR_PLAN, umbralAvisoPorcentaje: async () => UMBRAL_AVISO }),
      },
      verificadorOperador: { useFactory: () => ({ exigir: async () => undefined }) },
    });
    const modulo = await Test.createTestingModule({
      imports: [
        KernelInfraModule.register({ dataSource, validator }),
        OrgModule.register({
          imports: [identidadModulo],
          padronRuc: { provide: PADRON_RUC, useFactory: (identidad: IdentidadPort) => new PadronRucIdentidad(identidad), inject: [IDENTIDAD] },
        }),
      ],
      controllers: [EmpresasController],
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

  it('TR-CA-004: RUC ACTIVO y HABIDO guarda la razón social del padrón aunque el comando traiga otra, con la principal 0000 y sin advertencias', async () => {
    const tenantId = await nuevoTenant('padron-activo');

    const respuesta = await registrar(tenantId, { ruc: RUC_ACTIVO_HABIDO, razon_social: 'Otra Razón SAC' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.advertencias).toEqual([]);
    expect(await razonSocialDe(respuesta.body.empresa_id)).toBe('Comercial Andina S.A.C.');
    expect(await consultar('SELECT codigo_establecimiento_sunat FROM org.sucursal WHERE id = $1', [respuesta.body.sucursal_principal_id])).toEqual([
      { codigo_establecimiento_sunat: '0000' },
    ]);
  });

  it('TR-CA-006: RUC NO HABIDO se registra y la respuesta trae la advertencia', async () => {
    const tenantId = await nuevoTenant('padron-no-habido');

    const respuesta = await registrar(tenantId, { ruc: RUC_NO_HABIDO, razon_social: 'Escrita por el usuario' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.advertencias).toEqual(['Contribuyente NO HABIDO: no podrá emitir comprobantes hasta regularizar']);
    expect(await razonSocialDe(respuesta.body.empresa_id)).toBe('Inversiones Misti S.A.C.');
  });

  it('RUC BAJA DE OFICIO se registra con la advertencia de estado', async () => {
    const tenantId = await nuevoTenant('padron-baja');

    const respuesta = await registrar(tenantId, { ruc: RUC_BAJA_DE_OFICIO, razon_social: 'Escrita por el usuario' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.advertencias).toEqual(['Contribuyente en estado BAJA DE OFICIO: no podrá emitir comprobantes hasta regularizar']);
  });

  it('cuota de consultas agotada: se registra con la razón social del comando (spec 29)', async () => {
    const tenantId = await nuevoTenant('padron-sin-cuota');
    const periodoActual = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit' }).format(new Date());
    await consultar(`INSERT INTO idn.cuota (tenant_id, periodo, plan, incluidas, consumidas) VALUES ($1, $2, 'BASICO', 0, 0)`, [tenantId, periodoActual]);

    const respuesta = await registrar(tenantId, { ruc: RUC_SIN_CACHE, razon_social: 'Escrita por el usuario' });

    expect(respuesta.status).toBe(201);
    expect(await razonSocialDe(respuesta.body.empresa_id)).toBe('Escrita por el usuario');
  });

  it('RUC fuera del padrón se registra con la razón social del comando y sin advertencias', async () => {
    const tenantId = await nuevoTenant('padron-no-encontrado');

    const respuesta = await registrar(tenantId, { ruc: RUC_FUERA_DEL_PADRON, razon_social: 'Pollería Doña Rosa SAC' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.advertencias).toEqual([]);
    expect(await razonSocialDe(respuesta.body.empresa_id)).toBe('Pollería Doña Rosa SAC');
  });

  it('sin razón social en el comando responde 400 como hoy, sin consultar el padrón', async () => {
    const tenantId = await nuevoTenant('padron-sin-razon');

    const respuesta = await registrar(tenantId, { ruc: RUC_FUERA_DEL_PADRON });

    expect(respuesta.status).toBe(400);
    expect(await consultar('SELECT 1 FROM idn.consulta_log WHERE tenant_id = $1', [tenantId])).toEqual([]);
  });

  it('la consulta al padrón deja una fila en idn.consulta_log del tenant con motivo VERIFICACION_IDENTIDAD y producto PLAT', async () => {
    const tenantId = await nuevoTenant('padron-bitacora');

    await registrar(tenantId, { ruc: RUC_ACTIVO_HABIDO, razon_social: 'Otra Razón SAC' });

    expect(await consultar('SELECT tipo_doc, motivo, producto_codigo FROM idn.consulta_log WHERE tenant_id = $1', [tenantId])).toEqual([
      { tipo_doc: 'RUC', motivo: 'VERIFICACION_IDENTIDAD', producto_codigo: 'PLAT' },
    ]);
  });
});
