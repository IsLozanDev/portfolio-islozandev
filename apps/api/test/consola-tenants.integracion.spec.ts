import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConflictError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import { InMemoryEventSchemaValidator, KernelInfraModule, TENANT_CONTEXT, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { CambiarEstadoTenant, ENTIDADES_ORG, OrgModule, registrarEsquemasOrg, TenantRepositorioTypeOrm } from '@vitrina/plataforma/org';
import { ConsolaTenants, type ConsultaTenants } from '../src/org/consulta-tenants.js';
import { ConsultaTenantsTypeOrm } from '../src/org/consulta-tenants.typeorm.js';
import { ExigirOperador, OperadorRequeridoError } from '../src/org/operador.js';
import { crearBaseTemporal, describeConDb, type BaseTemporal } from './support/temp-db.js';

const TENANT_OPERADOR = 'plataforma';
const MOTIVO = 'Falta de pago de dos meses consecutivos';
const PRIMERA_PAGINA = { pagina: 1, tamano: 20 };

describeConDb('Consola de tenants contra PostgreSQL 16 (TR-RF-006)', () => {
  let base: BaseTemporal;
  let dataSource: DataSource;
  let app: INestApplication;
  let consola: ConsolaTenants;
  let lecturas: number;
  const operador = uuidV7();
  const cliente = uuidV7();
  const admin = uuidV7();
  const desdeOperador = { usuarioId: admin, tenantId: operador };

  const consultar = (sql: string, parametros: unknown[] = []) => dataSource.query(sql, parametros);
  const contar = async (sql: string, parametros: unknown[]) => Number((await consultar(sql, parametros))[0].n);
  const historialDe = (tenantId: string) => contar('SELECT count(*) AS n FROM org.tenant_estado_historial WHERE tenant_id = $1', [tenantId]);

  async function nuevoTenant(codigo: string, estado: string, producto: string | null = null): Promise<string> {
    const tenantId = uuidV7();
    await consultar(`INSERT INTO org.tenant (id, codigo, nombre, estado, version, baja_en) VALUES ($1, $2, $3, $4, 1, $5)`, [
      tenantId,
      codigo,
      `Tenant ${codigo}`,
      estado,
      estado === 'BAJA' ? new Date() : null,
    ]);
    if (producto) {
      await consultar(`INSERT INTO org.suscripcion (id, tenant_id, producto_codigo, plan, estado, vigente_hasta, version) VALUES ($1, $2, $3, 'BASICO', 'ACTIVA', '2026-12-31', 1)`, [
        uuidV7(),
        tenantId,
        producto,
      ]);
    }
    return tenantId;
  }

  beforeAll(async () => {
    base = await crearBaseTemporal();
    dataSource = new DataSource({ type: 'postgres', url: base.url, entities: ENTIDADES_ORG });
    await dataSource.initialize();
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasOrg(validator);
    const modulo = await Test.createTestingModule({ imports: [KernelInfraModule.register({ dataSource, validator }), OrgModule] }).compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();

    const unidadDeTrabajo = app.get(TypeOrmUnitOfWork);
    const contexto = app.get(TENANT_CONTEXT);
    const consultaReal = new ConsultaTenantsTypeOrm(dataSource);
    // Cuenta las lecturas entre tenants para comprobar que no corren antes de la regla de operador.
    const consulta: ConsultaTenants = {
      listar: (filtro) => {
        lecturas += 1;
        return consultaReal.listar(filtro);
      },
      detalle: (tenantId) => {
        lecturas += 1;
        return consultaReal.detalle(tenantId);
      },
    };
    consola = new ConsolaTenants({
      exigirOperador: new ExigirOperador({ unidadDeTrabajo, contexto, tenants: new TenantRepositorioTypeOrm(unidadDeTrabajo, contexto), tenantOperador: TENANT_OPERADOR }),
      consulta,
      cambiarEstadoTenant: app.get(CambiarEstadoTenant),
    });

    await consultar(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, $2, 'Plataforma', 'ACTIVO', 1), ($3, 'consola-cliente', 'Cliente', 'ACTIVO', 1)`, [
      operador,
      TENANT_OPERADOR,
      cliente,
    ]);
  });

  beforeEach(() => {
    lecturas = 0;
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await base?.borrar();
  });

  it('con «dona-rosa» en PRUEBA y «gym» SUSPENDIDO, el filtro SUSPENDIDO devuelve solo «gym» con sus suscripciones', async () => {
    await nuevoTenant('consola-dona-rosa', 'PRUEBA', 'REST');
    const gym = await nuevoTenant('consola-fuerza-total', 'SUSPENDIDO', 'GYM');

    const lista = await consola.listar(desdeOperador, { ...PRIMERA_PAGINA, estado: 'SUSPENDIDO', q: 'consola-' });

    expect(lista).toEqual({
      items: [expect.objectContaining({ id: gym, codigo: 'consola-fuerza-total', estado: 'SUSPENDIDO', suscripciones: [expect.objectContaining({ productoCodigo: 'GYM', vigenteHasta: '2026-12-31' })] })],
      total: 1,
    });
    expect(Object.keys(lista.items[0]).sort()).toEqual(['codigo', 'creadoEn', 'estado', 'id', 'nombre', 'suscripciones']);
  });

  it('una página pasada del final trae el total igual', async () => {
    const lista = await consola.listar(desdeOperador, { pagina: 99, tamano: 1, q: 'consola-' });
    expect(lista.items).toEqual([]);
    expect(lista.total).toBeGreaterThanOrEqual(2);
  });

  it('un propietario de cliente con el permiso recibe OperadorRequeridoError, sin lecturas entre tenants', async () => {
    const desdeCliente = { usuarioId: admin, tenantId: cliente };
    await expect(consola.listar(desdeCliente, PRIMERA_PAGINA)).rejects.toThrow(OperadorRequeridoError);
    await expect(consola.detalle(desdeCliente, operador)).rejects.toThrow(OperadorRequeridoError);
    await expect(consola.cambiarEstado(desdeCliente, { tenantId: operador, estado: 'SUSPENDIDO', motivo: MOTIVO })).rejects.toThrow(OperadorRequeridoError);
    expect(lecturas).toBe(0);
  });

  it('TR-CA-016: ACTIVO → SUSPENDIDO deja historial con el actor y tenant.suspendido en el outbox; el detalle lo muestra', async () => {
    const tenantId = await nuevoTenant('consola-suspender', 'ACTIVO', 'REST');

    expect(await consola.cambiarEstado(desdeOperador, { tenantId, estado: 'SUSPENDIDO', motivo: MOTIVO })).toEqual({ cambiado: true, estado: 'SUSPENDIDO' });

    const detalle = await consola.detalle(desdeOperador, tenantId);
    expect(detalle).toMatchObject({ estado: 'SUSPENDIDO', estadoMotivo: MOTIVO, version: 2 });
    expect(detalle.historial).toEqual([expect.objectContaining({ estadoAnterior: 'ACTIVO', estadoNuevo: 'SUSPENDIDO', motivo: MOTIVO, actorId: admin })]);
    const eventos = await consultar('SELECT event_type, tenant_id FROM sync.outbox WHERE aggregate_id = $1', [tenantId]);
    expect(eventos).toEqual([{ event_type: 'tenant.suspendido', tenant_id: tenantId }]);
  });

  it('repetir el estado es no-op: cambiado false y sin historial nuevo', async () => {
    const tenantId = await nuevoTenant('consola-repetir', 'ACTIVO');
    await consola.cambiarEstado(desdeOperador, { tenantId, estado: 'SUSPENDIDO', motivo: MOTIVO });

    expect(await consola.cambiarEstado(desdeOperador, { tenantId, estado: 'SUSPENDIDO', motivo: MOTIVO })).toEqual({ cambiado: false, estado: 'SUSPENDIDO' });
    expect(await historialDe(tenantId)).toBe(1);
  });

  it('TR-CA-017: BAJA → ACTIVO se rechaza sin historial', async () => {
    const tenantId = await nuevoTenant('consola-baja', 'BAJA');
    await expect(consola.cambiarEstado(desdeOperador, { tenantId, estado: 'ACTIVO', motivo: MOTIVO })).rejects.toThrow(ConflictError);
    expect(await historialDe(tenantId)).toBe(0);
  });

  it('TR-CA-018: un motivo de 9 caracteres se rechaza', async () => {
    const tenantId = await nuevoTenant('consola-motivo', 'ACTIVO');
    await expect(consola.cambiarEstado(desdeOperador, { tenantId, estado: 'SUSPENDIDO', motivo: 'Sin pagos' })).rejects.toThrow(ValidationError);
    expect(await historialDe(tenantId)).toBe(0);
  });

  it('un id inexistente da NotFoundError en el detalle y en el cambio de estado', async () => {
    const inexistente = uuidV7();
    await expect(consola.detalle(desdeOperador, inexistente)).rejects.toThrow(NotFoundError);
    await expect(consola.cambiarEstado(desdeOperador, { tenantId: inexistente, estado: 'SUSPENDIDO', motivo: MOTIVO })).rejects.toThrow(NotFoundError);
  });
});
