import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AlsTenantContext, InMemoryEventSchemaValidator, OutboxPublisher, SystemClock, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import type { AlcanceActor } from '@vitrina/plataforma/seguridad';
import type { DependenciasValores } from '../../src/application/dependencias-valores.js';
import { ValidadorEsquemaAjv } from '../../src/infrastructure/ajv/validador-esquema.ajv.js';
import { registrarEsquemasCfg } from '../../src/infrastructure/event-schemas.js';
import { ENTIDADES_CFG } from '../../src/infrastructure/typeorm/entidades.js';
import { LecturaDefinicionesTypeOrm } from '../../src/infrastructure/typeorm/lectura-definiciones.typeorm.js';
import { ResolucionSqlTypeOrm } from '../../src/infrastructure/typeorm/resolucion-sql.typeorm.js';
import { ValoresRepositorioTypeOrm } from '../../src/infrastructure/typeorm/valores.repositorio.js';
import { createTempDb, type TempDb } from './temp-db.js';

export interface Organizacion {
  tenantId: string;
  empresaLima: string;
  empresaArequipa: string;
  jockey: string;
  miraflores: string;
  cayma: string;
  usuarioId: string;
}

/** Pila real de los casos de uso de valores: base temporal con db/ aplicado, UoW, outbox y repositorios ORM. */
export interface EntornoValores {
  dataSource: DataSource;
  contexto: AlsTenantContext;
  unidadDeTrabajo: TypeOrmUnitOfWork;
  dependencias: DependenciasValores;
  /** El actor cubre todo salvo lo que diga `negar` (AlcanceActorSeg se prueba en seguridad). */
  negar: { alcances: Set<string> };
  en<T>(tenantId: string, trabajo: () => Promise<T>): Promise<T>;
  eventosDe(codigo: string): Promise<Record<string, unknown>[]>;
  organizacion(): Promise<Organizacion>;
  definicion(datos: { codigo: string; producto: string; tipo: string; defecto: unknown; maximo: string; esquema?: object; obsoleto?: boolean }): Promise<void>;
  cerrar(): Promise<void>;
}

export async function crearEntornoValores(): Promise<EntornoValores> {
  const baseTemporal: TempDb = await createTempDb();
  const dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_CFG });
  await dataSource.initialize();
  const contexto = new AlsTenantContext();
  const unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
  const validador = new InMemoryEventSchemaValidator();
  registrarEsquemasCfg(validador);
  const negar = { alcances: new Set<string>() };
  const alcanceActor: AlcanceActor = { cubre: async (_usuarioId, destino) => !negar.alcances.has(destino.alcance) };

  const dependencias: DependenciasValores = {
    unidadDeTrabajo,
    contexto,
    ids: { next: uuidV7 },
    reloj: new SystemClock(),
    eventos: new OutboxPublisher(unidadDeTrabajo, contexto, validador, { next: uuidV7 }),
    definiciones: new LecturaDefinicionesTypeOrm(unidadDeTrabajo),
    valores: new ValoresRepositorioTypeOrm(unidadDeTrabajo, contexto),
    resolucion: new ResolucionSqlTypeOrm(unidadDeTrabajo),
    alcanceActor,
    esquemas: new ValidadorEsquemaAjv(),
  };

  return {
    dataSource,
    contexto,
    unidadDeTrabajo,
    dependencias,
    negar,
    en: (tenantId, trabajo) => contexto.run({ tenantId }, trabajo),
    eventosDe: (codigo) =>
      dataSource.query(
        `SELECT event_type, aggregate_type, version, payload FROM sync.outbox WHERE event_type = 'parametro.cambiado' AND payload->>'codigo' = $1 ORDER BY occurred_at, version`,
        [codigo],
      ),
    organizacion: () => sembrarOrganizacion(dataSource),
    definicion: async ({ codigo, producto, tipo, defecto, maximo, esquema, obsoleto }) => {
      await dataSource.query('INSERT INTO seg.producto (codigo, nombre) VALUES ($1, $1) ON CONFLICT (codigo) DO NOTHING', [producto]);
      await dataSource.query(
        `INSERT INTO cfg.parametro_def (codigo, producto_codigo, descripcion, tipo, valor_defecto, alcance_maximo, esquema, obsoleto)
         VALUES ($1, $2, 'Parámetro de prueba', $3, $4::jsonb, $5, $6::jsonb, $7)`,
        [codigo, producto, tipo, JSON.stringify(defecto), maximo, esquema ? JSON.stringify(esquema) : null, obsoleto ?? false],
      );
    },
    cerrar: async () => {
      await dataSource.destroy();
      await baseTemporal.drop();
    },
  };
}

// El RUC es único por tenant: cada organización sembrada puede repetirlos.
const RUC_LIMA = '20300000001';
const RUC_AREQUIPA = '20300000002';

/** Inserta como superusuario (salta la RLS): un tenant con dos empresas y tres sucursales, y un usuario. */
async function sembrarOrganizacion(dataSource: DataSource): Promise<Organizacion> {
  const organizacion: Organizacion = {
    tenantId: uuidV7(),
    empresaLima: uuidV7(),
    empresaArequipa: uuidV7(),
    jockey: uuidV7(),
    miraflores: uuidV7(),
    cayma: uuidV7(),
    usuarioId: uuidV7(),
  };
  const sufijo = randomUUID().slice(0, 8);
  const { tenantId } = organizacion;
  await dataSource.query(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, $2, 'Tenant cfg', 'ACTIVO', 1)`, [tenantId, `cfg-${sufijo}`]);
  await dataSource.query(
    `INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES ($1, $3, $4, 'Cfg Lima SAC', 1), ($2, $3, $5, 'Cfg Arequipa SAC', 1)`,
    [organizacion.empresaLima, organizacion.empresaArequipa, tenantId, RUC_LIMA, RUC_AREQUIPA],
  );
  await dataSource.query(
    `INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version) VALUES
       ($1, $4, $5, 'JOCK', 'Food court Jockey', '0000', true, 1),
       ($2, $4, $5, 'MIRA', 'Miraflores', '0001', false, 1),
       ($3, $4, $6, 'CAYM', 'Cayma', '0000', true, 1)`,
    [organizacion.jockey, organizacion.miraflores, organizacion.cayma, tenantId, organizacion.empresaLima, organizacion.empresaArequipa],
  );
  await dataSource.query(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ($1, $2, 'Ana', 'INTERNO', 'ACTIVO')`, [
    organizacion.usuarioId,
    `ana.${sufijo}@gmail.com`,
  ]);
  return organizacion;
}
