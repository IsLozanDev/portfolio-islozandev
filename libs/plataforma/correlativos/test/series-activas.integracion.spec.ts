import { CambiarEstadoSerie } from '../src/application/cambiar-estado-serie.js';
import { CrearSerie, type CrearSerieComando } from '../src/application/crear-serie.js';
import { SeriesActivasTypeOrm } from '../src/infrastructure/typeorm/series-activas.typeorm.js';
import { crearEntornoSeries, type EntornoSeries, type Organizacion } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

describeConDb('SERIES_ACTIVAS_PORT (spec 51, PostgreSQL 16)', () => {
  let entorno: EntornoSeries;
  let organizacion: Organizacion;
  let otra: Organizacion;
  let series: SeriesActivasTypeOrm;

  const en = <T>(org: Organizacion, trabajo: () => Promise<T>) => entorno.en(org.tenantId, trabajo);
  const crearSerie = (cambios: Partial<CrearSerieComando>, org: Organizacion = organizacion) =>
    en(org, () =>
      new CrearSerie(entorno.dependencias).ejecutar({
        empresaId: org.empresaId,
        sucursalId: org.cayma,
        tipo: 'FACTURA',
        codigo: 'F001',
        reinicio: 'NUNCA',
        ultimoNumero: 0,
        actorId: org.usuarioId,
        ...cambios,
      }),
    );

  beforeAll(async () => {
    entorno = await crearEntornoSeries();
    organizacion = await entorno.organizacion();
    otra = await entorno.organizacion();
    series = new SeriesActivasTypeOrm(entorno.unidadDeTrabajo, entorno.contexto);

    await crearSerie({ codigo: 'F002' });
    await crearSerie({});
    await crearSerie({ tipo: 'BOLETA', codigo: 'B001' });
    await crearSerie({ codigo: 'F003', sucursalId: organizacion.central });
    const inactiva = await crearSerie({ codigo: 'F009' });
    await en(organizacion, () =>
      new CambiarEstadoSerie(entorno.dependencias).ejecutar({ serieId: inactiva.id, activa: false, actorId: organizacion.usuarioId }),
    );
    await crearSerie({ codigo: 'F004' }, otra);
  });

  afterAll(() => entorno?.cerrar());

  it('devuelve las activas del tipo en la sucursal, ordenadas, sin las inactivas ni las de otra sucursal', async () => {
    expect(await en(organizacion, () => series.deSucursal(organizacion.cayma, 'FACTURA'))).toEqual(['F001', 'F002']);
    expect(await en(organizacion, () => series.deSucursal(organizacion.cayma, 'BOLETA'))).toEqual(['B001']);
    expect(await en(organizacion, () => series.deSucursal(organizacion.central, 'FACTURA'))).toEqual(['F003']);
  });

  it('no ve las series de otro tenant (TR-RNF-010)', async () => {
    expect(await en(organizacion, () => series.deSucursal(otra.cayma, 'FACTURA'))).toEqual([]);
    expect(await en(otra, () => series.deSucursal(otra.cayma, 'FACTURA'))).toEqual(['F004']);
  });
});
