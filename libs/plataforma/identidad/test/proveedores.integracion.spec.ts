import { AlsTenantContext, InMemoryEventSchemaValidator, OutboxPublisher, SystemClock, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import { ActualizarProveedor } from '../src/application/actualizar-proveedor.js';
import { ConsultarDocumento } from '../src/application/consultar-documento.js';
import { ListarProveedores } from '../src/application/listar-proveedores.js';
import { UltimoProveedorActivoError } from '../src/domain/errores.js';
import { agregadoDeProveedor } from '../src/domain/eventos-idn.js';
import { CuotaNula } from '../src/infrastructure/cuota.nula.js';
import { registrarEsquemasIdn } from '../src/infrastructure/event-schemas.js';
import { ProveedorFalso } from '../src/infrastructure/falso/proveedor.falso.js';
import { ProveedorConRespaldo } from '../src/infrastructure/respaldo/proveedor-con-respaldo.js';
import { BitacoraConsultasTypeOrm } from '../src/infrastructure/typeorm/bitacora-consultas.repositorio.js';
import { CacheIdentidadRepositorioTypeOrm } from '../src/infrastructure/typeorm/cache-identidad.repositorio.js';
import { ConfiguracionProveedoresTypeOrm } from '../src/infrastructure/typeorm/configuracion-proveedores.repositorio.js';
import { ENTIDADES_IDN } from '../src/infrastructure/typeorm/entidades.js';
import { RepositorioProveedoresTypeOrm } from '../src/infrastructure/typeorm/proveedores.repositorio.js';
import { HasherPrueba } from './support/dobles.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const RESPALDO = 'RESPALDO';
const DNI_JUANA = '45781236';
const DNI_LUIS = '10293847';

describeConDb('Proveedores de identidad editables (spec 29, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let contexto: AlsTenantContext;
  let consultarDocumento: ConsultarDocumento;
  let listarProveedores: ListarProveedores;
  let actualizarProveedor: ActualizarProveedor;
  const operador = uuidV7();
  const actor = uuidV7();
  const comoOperador = <T>(trabajo: () => Promise<T>) => contexto.run({ tenantId: operador, actorId: actor }, trabajo);
  const versionDe = async (codigo: string) => (await comoOperador(() => listarProveedores.ejecutar())).find((proveedor) => proveedor.codigo === codigo)?.version ?? 0;

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_IDN });
    await dataSource.initialize();
    // Un segundo proveedor solo de DNI, detrás de DECOLECTA. Como superusuario: la app no inserta proveedores.
    await dataSource.query(`INSERT INTO idn.proveedor (codigo, tipos_doc, prioridad, ttl_dias, timeout_ms, activo) VALUES ($1, '{DNI}', 2, 15, 3000, true)`, [
      RESPALDO,
    ]);

    contexto = new AlsTenantContext();
    const unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
    const reloj = new SystemClock();
    const validador = new InMemoryEventSchemaValidator();
    registrarEsquemasIdn(validador);
    const verificador = { exigir: async () => undefined };
    const repositorio = new RepositorioProveedoresTypeOrm(unidadDeTrabajo);
    listarProveedores = new ListarProveedores({ unidadDeTrabajo, verificador, repositorio });
    actualizarProveedor = new ActualizarProveedor({
      unidadDeTrabajo,
      reloj,
      verificador,
      repositorio,
      publicador: new OutboxPublisher(unidadDeTrabajo, contexto, validador, { next: uuidV7 }),
    });
    consultarDocumento = new ConsultarDocumento({
      unidadDeTrabajo,
      contexto,
      reloj,
      cache: new CacheIdentidadRepositorioTypeOrm(unidadDeTrabajo),
      bitacora: new BitacoraConsultasTypeOrm(unidadDeTrabajo),
      configuracion: new ConfiguracionProveedoresTypeOrm(unidadDeTrabajo),
      consultor: new ProveedorConRespaldo([new ProveedorFalso(), new ProveedorFalso({ codigo: RESPALDO })], reloj),
      cuota: new CuotaNula(),
      hasher: new HasherPrueba(),
    });
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('cambiar las prioridades cambia el proveedor que responde en la consulta siguiente', async () => {
    const cliente = uuidV7();
    const consultar = (numero: string) =>
      contexto.run({ tenantId: cliente }, () => consultarDocumento.ejecutar({ tipo: 'DNI', numero, motivo: 'REGISTRO_CLIENTE' }));

    expect((await consultar(DNI_JUANA)).proveedor).toBe('DECOLECTA');

    await comoOperador(() => actualizarProveedor.ejecutar({ codigo: RESPALDO, cambios: { prioridad: 1 }, version: 1, actorId: actor }));
    await comoOperador(() => actualizarProveedor.ejecutar({ codigo: 'DECOLECTA', cambios: { prioridad: 2 }, version: 1, actorId: actor }));

    expect((await consultar(DNI_LUIS)).proveedor).toBe(RESPALDO);
    expect((await comoOperador(() => listarProveedores.ejecutar())).map((proveedor) => [proveedor.codigo, proveedor.prioridad, proveedor.version])).toEqual([
      [RESPALDO, 1, 2],
      ['DECOLECTA', 2, 2],
    ]);
  });

  it('cada cambio deja proveedor_identidad.actualizado en el outbox con el agregado del código', async () => {
    const eventos = await dataSource.query(
      `SELECT aggregate_id, version, actor_id, payload FROM sync.outbox WHERE event_type = 'proveedor_identidad.actualizado' AND payload->>'codigo' = $1`,
      [RESPALDO],
    );
    expect(eventos).toEqual([
      {
        aggregate_id: agregadoDeProveedor(RESPALDO),
        version: '2',
        actor_id: actor,
        payload: { codigo: RESPALDO, prioridad: 1, ttl_dias: 15, timeout_ms: 3000, activo: true, actor_id: actor },
      },
    ]);
  });

  it('desactivar DECOLECTA, el único de RUC, es ULTIMO_PROVEEDOR_ACTIVO y no cambia la fila', async () => {
    const version = await versionDe('DECOLECTA');

    await expect(
      comoOperador(() => actualizarProveedor.ejecutar({ codigo: 'DECOLECTA', cambios: { activo: false }, version, actorId: actor })),
    ).rejects.toThrow(UltimoProveedorActivoError);

    expect(await versionDe('DECOLECTA')).toBe(version);
  });
});
