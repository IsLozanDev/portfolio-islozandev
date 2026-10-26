import { NotFoundError } from '@vitrina/plataforma/kernel';
import { ActorSinAlcanceError } from '@vitrina/plataforma/seguridad';
import { CambiarEstadoSerie } from '../src/application/cambiar-estado-serie.js';
import { CrearSerie, type CrearSerieComando } from '../src/application/crear-serie.js';
import { SembrarSeriesIniciales } from '../src/application/sembrar-series-iniciales.js';
import { AmbitoSerieInvalidoError, SerieDuplicadaError } from '../src/domain/errores.js';
import { crearEntornoSeries, type EntornoSeries, type Organizacion } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

describeConDb('CrearSerie y CambiarEstadoSerie (TR-RF-035, PostgreSQL 16)', () => {
  let entorno: EntornoSeries;
  let organizacion: Organizacion;
  let otra: Organizacion;
  let crear: CrearSerie;
  let cambiarEstado: CambiarEstadoSerie;
  const comoAna = <T>(trabajo: () => Promise<T>) => entorno.en(organizacion.tenantId, trabajo);
  const comando = (cambios: Partial<CrearSerieComando>): CrearSerieComando => ({
    empresaId: organizacion.empresaId,
    sucursalId: organizacion.cayma,
    tipo: 'BOLETA',
    codigo: 'B002',
    reinicio: 'NUNCA',
    ultimoNumero: 0,
    actorId: organizacion.usuarioId,
    ...cambios,
  });
  const fila = async (serieId: string) =>
    (await entorno.dataSource.query(`SELECT sucursal_id, unidad_id, reinicio, ultimo_numero, periodo, activa, version, modificado_por FROM seq.serie WHERE id = $1`, [serieId]))[0];

  beforeAll(async () => {
    entorno = await crearEntornoSeries();
    organizacion = await entorno.organizacion();
    otra = await entorno.organizacion();
    crear = new CrearSerie(entorno.dependencias);
    cambiarEstado = new CambiarEstadoSerie(entorno.dependencias);
  });

  afterAll(() => entorno?.cerrar());

  it('TR-CA-090: B002 de BOLETA en «Cayma» (0002) queda asociada a Cayma con último número 0', async () => {
    const serie = await comoAna(() => crear.ejecutar(comando({})));
    expect(await fila(serie.id)).toMatchObject({ sucursal_id: organizacion.cayma, unidad_id: null, ultimo_numero: '0', periodo: null, activa: true, version: '1' });
  });

  it('serie.creada entra al outbox en la misma transacción', async () => {
    const serie = await comoAna(() => crear.ejecutar(comando({ tipo: 'FACTURA', codigo: 'F001', ultimoNumero: 80 })));
    const [evento] = await entorno.eventosDe(serie.id);
    expect(evento).toMatchObject({ event_type: 'serie.creada', aggregate_type: 'serie', version: '1' });
    expect(evento.payload).toMatchObject({ serie: 'F001', tipo: 'FACTURA', sucursal_id: organizacion.cayma, ultimo_numero: 80, por: organizacion.usuarioId });
  });

  it('TR-CA-092: la serie A de TICKET en «Ventanilla 1» guarda la sucursal de la unidad, reinicio DIARIO y el periodo del día', async () => {
    const serie = await comoAna(() =>
      crear.ejecutar(comando({ sucursalId: null, unidadId: organizacion.ventanilla, tipo: 'TICKET', codigo: 'A', digitos: 3, reinicio: 'DIARIO' })),
    );
    const [{ hoy }] = await entorno.dataSource.query(`SELECT to_char(now() AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS hoy`);
    expect(await fila(serie.id)).toMatchObject({ sucursal_id: organizacion.cayma, unidad_id: organizacion.ventanilla, reinicio: 'DIARIO', periodo: hoy });
  });

  it('repetir empresa, tipo y serie da SERIE_DUPLICADA y no deja evento', async () => {
    await expect(comoAna(() => crear.ejecutar(comando({ sucursalId: organizacion.central })))).rejects.toThrow(SerieDuplicadaError);
  });

  it('una unidad de otra sucursal da 400', async () => {
    await expect(
      comoAna(() => crear.ejecutar(comando({ sucursalId: organizacion.central, unidadId: organizacion.ventanilla, tipo: 'TICKET', codigo: 'X' }))),
    ).rejects.toThrow(AmbitoSerieInvalidoError);
  });

  it('una sucursal o unidad de otro tenant no se ve: 404', async () => {
    await expect(comoAna(() => crear.ejecutar(comando({ sucursalId: otra.cayma, codigo: 'B009' })))).rejects.toThrow(NotFoundError);
    await expect(comoAna(() => crear.ejecutar(comando({ unidadId: otra.ventanilla, tipo: 'TICKET', codigo: 'Y' })))).rejects.toThrow(NotFoundError);
  });

  it('un actor con alcance en otra sucursal da 403 y no escribe', async () => {
    entorno.negar.sucursales.add(organizacion.cayma);
    try {
      await expect(comoAna(() => crear.ejecutar(comando({ codigo: 'B005' })))).rejects.toThrow(ActorSinAlcanceError);
    } finally {
      entorno.negar.sucursales.clear();
    }
    const [{ total }] = await entorno.dataSource.query(`SELECT count(*)::int AS total FROM seq.serie WHERE serie = 'B005'`);
    expect(total).toBe(0);
  });

  it('desactivar publica serie.estado_cambiado y repetirlo no escribe', async () => {
    const serie = await comoAna(() => crear.ejecutar(comando({ codigo: 'B003' })));
    expect(await comoAna(() => cambiarEstado.ejecutar({ serieId: serie.id, activa: false, actorId: organizacion.usuarioId }))).toMatchObject({ cambiado: true, activa: false });
    expect(await comoAna(() => cambiarEstado.ejecutar({ serieId: serie.id, activa: false, actorId: organizacion.usuarioId }))).toMatchObject({ cambiado: false });
    expect((await entorno.eventosDe(serie.id)).map((evento) => evento.event_type)).toEqual(['serie.creada', 'serie.estado_cambiado']);
    expect(await fila(serie.id)).toMatchObject({ activa: false, version: '2' });
  });

  it('cambiar el estado no pisa un número emitido por otra transacción entre la lectura y la escritura', async () => {
    const serie = await comoAna(() => crear.ejecutar(comando({ codigo: 'B004', ultimoNumero: 124 })));
    const { series } = entorno.dependencias;
    const enTransaccion = <T>(trabajo: () => Promise<T>) => comoAna(() => entorno.unidadDeTrabajo.run(trabajo));

    const leida = await enTransaccion(() => series.buscar(serie.id));
    if (!leida) throw new Error('la serie debía existir');
    // Otra caja numera y commitea después de la lectura: la serie leída sigue con último 124.
    await enTransaccion(() =>
      entorno.unidadDeTrabajo.manager.query(`SELECT * FROM seq.siguiente($1, $2, 'BOLETA', 'B004')`, [organizacion.tenantId, organizacion.empresaId]),
    );
    leida.cambiarEstado(false, organizacion.usuarioId, new Date());
    await enTransaccion(() => series.guardarEstado(leida));

    expect(await fila(serie.id)).toMatchObject({ ultimo_numero: '125', activa: false });
  });

  describe('SembrarSeriesIniciales (alta de tenant, spec 12)', () => {
    it('crea B001 y F001 de 8 dígitos en la sucursal, con serie.creada; repetirlo da SERIE_DUPLICADA sin escribir', async () => {
      const nueva = await entorno.organizacion();
      const sembrar = new SembrarSeriesIniciales(entorno.dependencias);
      const comandoSiembra = { empresaId: nueva.empresaId, sucursalId: nueva.central, creadoPor: nueva.usuarioId };

      const series = await entorno.en(nueva.tenantId, () => sembrar.ejecutar(comandoSiembra));

      const filas = await entorno.dataSource.query(
        `SELECT tipo, serie, digitos, reinicio, ultimo_numero, sucursal_id FROM seq.serie WHERE tenant_id = $1 ORDER BY serie`,
        [nueva.tenantId],
      );
      expect(filas).toEqual([
        { tipo: 'BOLETA', serie: 'B001', digitos: 8, reinicio: 'NUNCA', ultimo_numero: '0', sucursal_id: nueva.central },
        { tipo: 'FACTURA', serie: 'F001', digitos: 8, reinicio: 'NUNCA', ultimo_numero: '0', sucursal_id: nueva.central },
      ]);
      for (const serie of series) expect((await entorno.eventosDe(serie.id)).map((evento) => evento.event_type)).toEqual(['serie.creada']);

      await expect(entorno.en(nueva.tenantId, () => sembrar.ejecutar(comandoSiembra))).rejects.toThrow(SerieDuplicadaError);
      const [{ total }] = await entorno.dataSource.query(`SELECT count(*)::int AS total FROM seq.serie WHERE tenant_id = $1`, [nueva.tenantId]);
      expect(total).toBe(2);
    });
  });
});
