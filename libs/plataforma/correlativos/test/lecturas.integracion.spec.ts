import { CrearSerie, type CrearSerieComando } from '../src/application/crear-serie.js';
import { ConsultarSerie, ListarSeries } from '../src/application/lecturas-series.js';
import { SerieNoEncontradaError } from '../src/domain/errores.js';
import { LecturaSeriesTypeOrm } from '../src/infrastructure/typeorm/lectura-series.typeorm.js';
import { crearEntornoSeries, type EntornoSeries, type Organizacion } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

describeConDb('ListarSeries y ConsultarSerie (TR-RF-035, PostgreSQL 16)', () => {
  let entorno: EntornoSeries;
  let organizacion: Organizacion;
  let otra: Organizacion;
  let listar: ListarSeries;
  let consultar: ConsultarSerie;
  let instante = new Date();

  const en = <T>(org: Organizacion, trabajo: () => Promise<T>) => entorno.en(org.tenantId, trabajo);
  const crearSerie = (cambios: Partial<CrearSerieComando>, org: Organizacion = organizacion, creadaEn = new Date()) =>
    en(org, () =>
      new CrearSerie({ ...entorno.dependencias, reloj: { now: () => creadaEn } }).ejecutar({
        empresaId: org.empresaId,
        sucursalId: org.cayma,
        tipo: 'BOLETA',
        codigo: 'B002',
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
    const dependencias = {
      unidadDeTrabajo: entorno.unidadDeTrabajo,
      reloj: { now: () => instante },
      lectura: new LecturaSeriesTypeOrm(entorno.unidadDeTrabajo, entorno.contexto),
    };
    listar = new ListarSeries(dependencias);
    consultar = new ConsultarSerie(dependencias);

    await crearSerie({ ultimoNumero: 124 });
    await crearSerie({ tipo: 'FACTURA', codigo: 'F001', sucursalId: organizacion.central, ultimoNumero: 80 });
    await crearSerie(
      { sucursalId: null, unidadId: organizacion.ventanilla, tipo: 'TICKET', codigo: 'A', digitos: 3, reinicio: 'DIARIO', ultimoNumero: 342 },
      organizacion,
      new Date('2026-10-09T17:00:00Z'),
    );
    await crearSerie({ codigo: 'B999', ultimoNumero: 5 }, otra);
  });

  afterAll(() => entorno?.cerrar());

  it('lista las series del tenant ordenadas por tipo y serie, con la vista previa del siguiente número', async () => {
    instante = new Date('2026-10-10T04:30:00Z');
    const series = await en(organizacion, () => listar.ejecutar({}));
    expect(series.map((serie) => [serie.tipo, serie.serie, serie.ultimoNumero, serie.siguienteFormateado])).toEqual([
      ['BOLETA', 'B002', 124, 'B002-00000125'],
      ['FACTURA', 'F001', 80, 'F001-00000081'],
      ['TICKET', 'A', 342, 'A-343'],
    ]);
  });

  it('la vista previa aplica el reinicio del periodo como seq.siguiente, sin consumir el número', async () => {
    instante = new Date('2026-10-10T13:01:00Z');
    const [ticket] = await en(organizacion, () => listar.ejecutar({ tipo: 'TICKET' }));
    expect(ticket).toMatchObject({ ultimoNumero: 342, periodo: '2026-10-09', siguienteFormateado: 'A-001' });
  });

  it('filtra por sucursal, tipo y estado', async () => {
    const enCentral = await en(organizacion, () => listar.ejecutar({ sucursalId: organizacion.central }));
    expect(enCentral.map((serie) => serie.serie)).toEqual(['F001']);
    expect(await en(organizacion, () => listar.ejecutar({ activa: false }))).toEqual([]);
    expect((await en(organizacion, () => listar.ejecutar({ empresaId: organizacion.empresaId, tipo: 'BOLETA' }))).map((serie) => serie.serie)).toEqual(['B002']);
  });

  it('el detalle trae los nombres de empresa, sucursal y unidad, y el actor', async () => {
    const [ticket] = await en(organizacion, () => listar.ejecutar({ tipo: 'TICKET' }));
    const detalle = await en(organizacion, () => consultar.ejecutar(ticket.id));
    expect(detalle).toMatchObject({
      empresaNombre: 'Seq Arequipa SAC',
      sucursalNombre: 'Cayma',
      unidadNombre: 'Ventanilla 1',
      creadoPor: organizacion.usuarioId,
      modificadoPor: organizacion.usuarioId,
    });
  });

  it('el tenant A no ve series de B: no salen en la lista y el detalle da SERIE_NO_ENCONTRADA', async () => {
    const [deOtra] = await en(otra, () => listar.ejecutar({}));
    expect((await en(organizacion, () => listar.ejecutar({}))).map((serie) => serie.id)).not.toContain(deOtra.id);
    await expect(en(organizacion, () => consultar.ejecutar(deOtra.id))).rejects.toThrow(SerieNoEncontradaError);
  });
});
