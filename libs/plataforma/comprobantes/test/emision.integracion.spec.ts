import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { Global, Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { CatalogoPort, ResultadoValidacion } from '@vitrina/plataforma/catalogos';
import {
  CORRELATIVO_PORT,
  CorrelativosModule,
  ENTIDADES_SEQ,
  SERIES_ACTIVAS_PORT,
  type CorrelativoPort,
  type SeriesActivasPort,
} from '@vitrina/plataforma/correlativos';
import type { EventPublisher } from '@vitrina/plataforma/kernel';
import {
  AlsTenantContext,
  EVENT_PUBLISHER,
  InMemoryEventSchemaValidator,
  KernelInfraModule,
  SystemClock,
  TENANT_CONTEXT,
  TypeOrmUnitOfWork,
  uuidV7,
} from '@vitrina/plataforma/kernel-infra';
import { ConsultarSucursal, ENTIDADES_ORG, LecturaOrganizacionTypeOrm } from '@vitrina/plataforma/org';
import { ALCANCE_ACTOR } from '@vitrina/plataforma/seguridad';
import { DataSource } from 'typeorm';
import { ConsultarComprobante } from '../src/application/consultar-comprobante.js';
import { EmitirComprobante } from '../src/application/emitir-comprobante.js';
import type { EmitirComprobanteComando } from '../src/application/ports/comprobante.port.js';
import { Comprobante } from '../src/domain/comprobante/comprobante.js';
import {
  CodigoSunatInvalidoError,
  ComprobanteNoEncontradoError,
  EmisionConcurrenteError,
  EmisorNoEncontradoError,
  IdempotenciaConflictoError,
  TasaIgvNoVigenteError,
} from '../src/domain/errores.js';
import { EVENTOS_FE } from '../src/domain/eventos-fe.js';
import { CatalogosSunatCatalogo } from '../src/infrastructure/catalogos/catalogos-sunat.catalogo.js';
import { TasaIgvCatalogo } from '../src/infrastructure/catalogos/tasa-igv.catalogo.js';
import { registrarEsquemasFe } from '../src/infrastructure/event-schemas.js';
import { PadronAdquirenteOrg } from '../src/infrastructure/org/padron-adquirente.org.js';
import { SucursalesEmisorasOrg } from '../src/infrastructure/org/sucursales-emisoras.org.js';
import { UmbralBoletaParametros } from '../src/infrastructure/parametros/umbral-boleta.parametros.js';
import { RepositorioComprobantesTypeOrm } from '../src/infrastructure/typeorm/comprobantes.repositorio.js';
import { RepositorioEmisoresTypeOrm } from '../src/infrastructure/typeorm/emisores.repositorio.js';
import { ENTIDADES_FE } from '../src/infrastructure/typeorm/entidades.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const RUC_CLIENTE = '20512345671';

interface FilaCruda {
  [columna: string]: unknown;
}

/** CatalogoPort sobre cat.catalogo_item con la vigencia de hoy, sin Redis, en la transacción del caso de uso. */
function catalogoDeLaBase(unidadDeTrabajo: TypeOrmUnitOfWork): CatalogoPort {
  return {
    async validarItem(catalogo: string, codigo: string): Promise<ResultadoValidacion> {
      const [fila] = (await unidadDeTrabajo.manager.query(
        `SELECT i.nombre, i.atributos FROM cat.catalogo_item i JOIN cat.catalogo c ON c.id = i.catalogo_id
          WHERE c.codigo = $1 AND i.codigo = $2 AND i.activo AND i.tenant_id IS NULL
            AND i.vigente_desde <= current_date AND (i.vigente_hasta IS NULL OR i.vigente_hasta >= current_date)`,
        [catalogo, codigo],
      )) as { nombre: string; atributos: Record<string, unknown> }[];
      return fila
        ? { valido: true, motivo: null, atributos: fila.atributos, nombre: fila.nombre }
        : { valido: false, motivo: 'INEXISTENTE', atributos: null, nombre: null };
    },
  };
}

/** CorrelativosModule pide ALCANCE_ACTOR (de SeguridadModule) para sus casos de uso de series: aquí no se usan. */
@Global()
@Module({ providers: [{ provide: ALCANCE_ACTOR, useValue: {} }], exports: [ALCANCE_ACTOR] })
class AlcanceActorDePrueba {}

describeConDb('Emisión de boleta y factura con TypeORM, SEQ y RLS (spec 51, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let app: INestApplicationContext;
  let contexto: AlsTenantContext;
  let unidadDeTrabajo: TypeOrmUnitOfWork;
  let emision: EmitirComprobante;
  let consulta: ConsultarComprobante;
  const usuario = uuidV7();
  const tenantA = uuidV7();
  const tenantB = uuidV7();
  const empresaA = uuidV7();
  const empresaB = uuidV7();
  const sucursalA = uuidV7();
  const sucursalB = uuidV7();
  const sufijo = randomBytes(4).toString('hex');

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>): Promise<Resultado> =>
    contexto.run({ tenantId, actorId: usuario }, trabajo);
  const crudo = (consulta: string, parametros: unknown[] = []): Promise<FilaCruda[]> => dataSource.query(consulta, parametros);
  const ultimoNumero = async (serie: string) =>
    Number((await crudo('SELECT ultimo_numero FROM seq.serie WHERE tenant_id = $1 AND serie = $2', [tenantA, serie]))[0].ultimo_numero);
  const factura = (cambios: Partial<EmitirComprobanteComando> = {}): EmitirComprobanteComando => ({
    tipo: 'FACTURA',
    empresaId: empresaA,
    sucursalId: sucursalA,
    moneda: 'PEN',
    formaPago: 'CONTADO',
    adquirente: { tipoDocumento: 'RUC', numero: RUC_CLIENTE, nombre: 'CLIENTE SAC' },
    lineas: [
      { descripcion: 'Catering', unidad: 'ZZ', cantidad: '1', valorUnitario: '60', afectacionIgv: '10' },
      { descripcion: 'Bebidas', unidad: 'NIU', cantidad: '4', valorUnitario: '10', afectacionIgv: '10' },
    ],
    claveIdempotencia: uuidV7(),
    ...cambios,
  });

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: [...ENTIDADES_FE, ...ENTIDADES_SEQ, ...ENTIDADES_ORG] });
    await dataSource.initialize();
    await crudo(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ($1, $2, 'Caja', 'INTERNO', 'ACTIVO')`, [usuario, `caja-${sufijo}@prueba.pe`]);
    await crudo(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, $3, 'FE A', 'ACTIVO', 1), ($2, $4, 'FE B', 'ACTIVO', 1)`, [
      tenantA,
      tenantB,
      `cpe-a-${sufijo}`,
      `cpe-b-${sufijo}`,
    ]);
    await crudo(`INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES ($1, $2, '20601234561', 'FE A SAC', 1), ($3, $4, '20100070970', 'FE B SAC', 1)`, [
      empresaA,
      tenantA,
      empresaB,
      tenantB,
    ]);
    await crudo(
      `INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version)
       VALUES ($1, $2, $3, 'PRI', 'Principal A', '0000', true, 1), ($4, $5, $6, 'PRI', 'Principal B', '0000', true, 1)`,
      [sucursalA, tenantA, empresaA, sucursalB, tenantB, empresaB],
    );
    await crudo(
      `INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por, estado) VALUES
         ($1, $2, $3, 'SIMULADO', $7, 'VERIFICADO'), ($4, $5, $6, 'SIMULADO', $7, 'VERIFICADO')`,
      [uuidV7(), tenantA, empresaA, uuidV7(), tenantB, empresaB, usuario],
    );
    await crudo(
      `INSERT INTO seq.serie (id, tenant_id, empresa_id, sucursal_id, tipo, serie, digitos, reinicio, ultimo_numero, creado_por, modificado_por) VALUES
         ($1, $2, $3, $4, 'FACTURA', 'F001', 8, 'NUNCA', 99, $9, $9), ($5, $2, $3, $4, 'BOLETA', 'B001', 8, 'NUNCA', 0, $9, $9),
         ($6, $7, $8, $10, 'FACTURA', 'F001', 8, 'NUNCA', 0, $9, $9)`,
      [uuidV7(), tenantA, empresaA, sucursalA, uuidV7(), uuidV7(), tenantB, empresaB, usuario, sucursalB],
    );
    // Lo que el importador carga de docs/datos-oficiales; los atributos de AFECTACION_IGV los suma 01u_fe_comprobante.
    await crudo(
      `INSERT INTO cat.catalogo_item (id, catalogo_id, codigo, nombre, orden, atributos, vigente_desde)
       SELECT gen_random_uuid(), c.id, v.codigo, v.codigo, v.orden, v.atributos::jsonb, '2026-01-01'
         FROM (VALUES ('UNIDAD_MEDIDA', 'NIU', 1, '{}'), ('UNIDAD_MEDIDA', 'ZZ', 2, '{}'), ('MONEDA', 'PEN', 1, '{}'),
                      ('AFECTACION_IGV', '10', 1, '{"grupo": "GRAVADO", "oneroso": true}'),
                      ('AFECTACION_IGV', '20', 2, '{"grupo": "EXONERADO", "oneroso": true}')) AS v (catalogo, codigo, orden, atributos)
         JOIN cat.catalogo c ON c.codigo = v.catalogo`,
    );

    const validador = new InMemoryEventSchemaValidator();
    registrarEsquemasFe(validador);

    @Module({ imports: [KernelInfraModule.register({ dataSource, validator: validador }), AlcanceActorDePrueba, CorrelativosModule.register()] })
    class PruebaModule {}

    app = await NestFactory.createApplicationContext(PruebaModule, { logger: false });
    contexto = app.get(TENANT_CONTEXT);
    unidadDeTrabajo = app.get(TypeOrmUnitOfWork);
    const catalogo = catalogoDeLaBase(unidadDeTrabajo);
    const comprobantes = new RepositorioComprobantesTypeOrm(unidadDeTrabajo, contexto);
    emision = new EmitirComprobante({
      unidadDeTrabajo,
      contexto,
      reloj: new SystemClock(),
      ids: { next: uuidV7 },
      publicador: app.get<EventPublisher>(EVENT_PUBLISHER),
      emisores: new RepositorioEmisoresTypeOrm(unidadDeTrabajo, contexto),
      sucursales: new SucursalesEmisorasOrg(new ConsultarSucursal({ unidadDeTrabajo, lectura: new LecturaOrganizacionTypeOrm(unidadDeTrabajo, contexto) })),
      series: app.get<SeriesActivasPort>(SERIES_ACTIVAS_PORT),
      correlativo: app.get<CorrelativoPort>(CORRELATIVO_PORT),
      catalogos: new CatalogosSunatCatalogo(catalogo),
      tasas: new TasaIgvCatalogo(catalogo),
      umbral: new UmbralBoletaParametros({ valor: async <T>() => ({ valor: 700 as T, origen: 'DEFECTO' as const }) }),
      padron: new PadronAdquirenteOrg({ consultar: async () => null }, () => undefined),
      comprobantes,
    });
    consulta = new ConsultarComprobante({ unidadDeTrabajo, comprobantes });
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('TR-CA-136 de punta a punta: F001 en 99 → F001-00000100 con IGV 18,00 y total 118,00, líneas, SEQ en 100 y un cpe.emitido', async () => {
    const emitido = await enTenant(tenantA, () => emision.emitir(factura()));
    expect([emitido.numeroFormateado, emitido.totales.igv, emitido.totales.total, emitido.estado]).toEqual(['F001-00000100', '18.00', '118.00', 'PENDIENTE_ENVIO']);
    expect(await ultimoNumero('F001')).toBe(100);

    const [fila] = await crudo('SELECT tipo, serie, numero, total, igv, tasa_igv, estado, adquirente_numero FROM fe.comprobante WHERE id = $1', [emitido.comprobanteId]);
    expect(fila).toEqual({ tipo: '01', serie: 'F001', numero: '100', total: '118.00', igv: '18.00', tasa_igv: '0.1800', estado: 'PENDIENTE_ENVIO', adquirente_numero: RUC_CLIENTE });
    const lineas = await crudo('SELECT orden, valor_venta, igv, precio_unitario FROM fe.comprobante_linea WHERE comprobante_id = $1 ORDER BY orden', [emitido.comprobanteId]);
    expect(lineas).toEqual([
      { orden: 1, valor_venta: '60.00', igv: '10.80', precio_unitario: '70.8000' },
      { orden: 2, valor_venta: '40.00', igv: '7.20', precio_unitario: '11.8000' },
    ]);
    const eventos = await crudo(`SELECT event_type, payload FROM sync.outbox WHERE tenant_id = $1 AND aggregate_id = $2`, [tenantA, emitido.comprobanteId]);
    expect(eventos).toEqual([{ event_type: EVENTOS_FE.comprobanteEmitido, payload: expect.objectContaining({ numero: 100, total: '118.00' }) }]);
    expect(JSON.stringify(eventos)).not.toContain(RUC_CLIENTE);

    const detalle = await enTenant(tenantA, () => consulta.ejecutar(emitido.comprobanteId));
    expect([detalle.tasaIgv, detalle.lineas.map((linea) => linea.cantidad), detalle.adquirente.nombre]).toEqual(['0.1800', ['1.0000', '4.0000'], 'CLIENTE SAC']);
  });

  it('TR-CA-138: la misma clave devuelve la misma factura sin avanzar SEQ; con otro contenido → 409', async () => {
    const comando = factura();
    const primera = await enTenant(tenantA, () => emision.emitir(comando));
    const antes = await ultimoNumero('F001');
    const segunda = await enTenant(tenantA, () => emision.emitir(comando));
    expect([segunda.repetido, segunda.comprobanteId, await ultimoNumero('F001')]).toEqual([true, primera.comprobanteId, antes]);
    await expect(enTenant(tenantA, () => emision.emitir({ ...comando, totalEsperado: '118.00' }))).rejects.toThrow(IdempotenciaConflictoError);
  });

  it('código de afectación inexistente → 422 sin consumir número; la boleta sin adquirente va a CLIENTES VARIOS', async () => {
    const antes = await ultimoNumero('F001');
    const comando = factura({ lineas: [{ descripcion: 'X', unidad: 'NIU', cantidad: '1', valorUnitario: '1', afectacionIgv: '99' }] });
    await expect(enTenant(tenantA, () => emision.emitir(comando))).rejects.toThrow(CodigoSunatInvalidoError);
    expect(await ultimoNumero('F001')).toBe(antes);

    const boleta = await enTenant(tenantA, () =>
      emision.emitir({ ...factura(), tipo: 'BOLETA', adquirente: undefined, lineas: [{ descripcion: 'Menú', unidad: 'NIU', cantidad: '1', valorUnitario: '45.50', afectacionIgv: '20' }] }),
    );
    const [fila] = await crudo('SELECT adquirente_tipo_doc, adquirente_numero, adquirente_nombre FROM fe.comprobante WHERE id = $1', [boleta.comprobanteId]);
    expect([boleta.numeroFormateado, fila]).toEqual(['B001-00000001', { adquirente_tipo_doc: 'DOC_0', adquirente_numero: '0', adquirente_nombre: 'CLIENTES VARIOS' }]);
  });

  it('TR-CA-095 desde FE: el rollback de la transacción del llamador no consume número ni deja el comprobante', async () => {
    const antes = await ultimoNumero('F001');
    const comando = factura();
    await expect(
      enTenant(tenantA, () =>
        unidadDeTrabajo.run(async () => {
          await emision.emitir(comando);
          throw new Error('el producto falla después de emitir');
        }),
      ),
    ).rejects.toThrow('el producto falla');
    expect(await ultimoNumero('F001')).toBe(antes);
    expect(await crudo('SELECT 1 FROM fe.comprobante WHERE clave_idempotencia = $1', [comando.claveIdempotencia])).toEqual([]);
  });

  it('la clave repetida en otra transacción choca con uq_comprobante_idempotencia como EMISION_CONCURRENTE', async () => {
    const comando = factura();
    const emitido = await enTenant(tenantA, () => emision.emitir(comando));
    const repositorio = new RepositorioComprobantesTypeOrm(unidadDeTrabajo, contexto);
    const error = await enTenant(tenantA, () =>
      unidadDeTrabajo.run(async () => {
        const existente = await repositorio.porId(emitido.comprobanteId);
        await repositorio.guardar(Comprobante.reconstituir({ ...(existente as Comprobante).datos, id: uuidV7(), numero: 999 }));
      }),
    ).catch((rechazo: unknown) => rechazo);
    expect(error).toBeInstanceOf(EmisionConcurrenteError);
  });

  it('la tasa es la vigente del catálogo para el régimen; sin tasa vigente → TASA_IGV_NO_VIGENTE', async () => {
    await crudo(`UPDATE fe.emisor SET regimen_igv = 'REDUCIDO_RESTAURANTES' WHERE tenant_id = $1`, [tenantA]);
    const vigencia = `UPDATE cat.catalogo_item SET vigente_desde = current_date - $1::int, vigente_hasta = current_date + $2::int, atributos = $3::jsonb
                       WHERE codigo = 'REDUCIDO_RESTAURANTES'`;
    try {
      await crudo(vigencia, [1, 1, '{"tasa": "0.105"}']);
      const reducida = await enTenant(tenantA, () => emision.emitir(factura({ lineas: [{ descripcion: 'Menú', unidad: 'NIU', cantidad: '1', valorUnitario: '100', afectacionIgv: '10' }] })));
      expect(reducida.totales.igv).toBe('10.50');

      await crudo(vigencia, [1, 1, '{"tasa": "0.15"}']);
      const siguiente = await enTenant(tenantA, () => emision.emitir(factura({ lineas: [{ descripcion: 'Menú', unidad: 'NIU', cantidad: '1', valorUnitario: '100', afectacionIgv: '10' }] })));
      expect(siguiente.totales.igv).toBe('15.00');

      await crudo(vigencia, [10, -5, '{"tasa": "0.105"}']);
      await expect(enTenant(tenantA, () => emision.emitir(factura()))).rejects.toThrow(TasaIgvNoVigenteError);
    } finally {
      await crudo(`UPDATE fe.emisor SET regimen_igv = 'GENERAL' WHERE tenant_id = $1`, [tenantA]);
    }
  });

  it('TR-RN-022: cambiar el total o borrar una línea falla en la base; cambiar el estado pasa', async () => {
    const emitido = await enTenant(tenantA, () => emision.emitir(factura()));
    await expect(crudo('UPDATE fe.comprobante SET total = 1 WHERE id = $1', [emitido.comprobanteId])).rejects.toMatchObject({ driverError: { code: '23001' } });
    await expect(crudo('DELETE FROM fe.comprobante_linea WHERE comprobante_id = $1', [emitido.comprobanteId])).rejects.toMatchObject({ driverError: { code: '23001' } });
    await crudo(`UPDATE fe.comprobante SET estado = 'ENVIADO', version = 2 WHERE id = $1`, [emitido.comprobanteId]);
  });

  it('TR-RNF-010: el tenant B no lee el comprobante de A ni numera sobre su empresa; con la misma clave emite lo suyo', async () => {
    const comando = factura();
    const deA = await enTenant(tenantA, () => emision.emitir(comando));
    await expect(enTenant(tenantB, () => consulta.ejecutar(deA.comprobanteId))).rejects.toThrow(ComprobanteNoEncontradoError);
    await expect(enTenant(tenantB, () => emision.emitir(factura()))).rejects.toThrow(EmisorNoEncontradoError);
    const deB = await enTenant(tenantB, () => emision.emitir({ ...comando, empresaId: empresaB, sucursalId: sucursalB }));
    expect([deB.numeroFormateado, deB.repetido]).toEqual(['F001-00000001', false]);
  });
});
