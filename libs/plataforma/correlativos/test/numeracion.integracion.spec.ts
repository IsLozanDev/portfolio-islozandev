import { NoActiveTransactionError } from '@vitrina/plataforma/kernel';
import { CambiarEstadoSerie } from '../src/application/cambiar-estado-serie.js';
import { CrearSerie, type CrearSerieComando } from '../src/application/crear-serie.js';
import { ObtenerSiguiente } from '../src/application/obtener-siguiente.js';
import type { SolicitudNumero } from '../src/application/ports/correlativo.port.js';
import { SerieAgotadaError, SerieInactivaError, SerieNoEncontradaError } from '../src/domain/errores.js';
import { NumeracionSqlTypeOrm } from '../src/infrastructure/typeorm/numeracion-sql.typeorm.js';
import { crearEntornoSeries, type EntornoSeries, type Organizacion } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const CAJAS = 50;
const NUMEROS_POR_CAJA = 20;
const NUMEROS_POR_SEGUNDO_MINIMO = 200;
const MILISEGUNDOS_POR_SEGUNDO = 1000;
const TIMEOUT_CONCURRENCIA_MS = 120_000;

describeConDb('CorrelativoPort (TR-RF-036, TR-RF-037, PostgreSQL 16)', () => {
  let entorno: EntornoSeries;
  let organizacion: Organizacion;
  let otra: Organizacion;
  let puerto: ObtenerSiguiente;
  let instante = new Date();

  const en = <T>(org: Organizacion, trabajo: () => Promise<T>) => entorno.en(org.tenantId, trabajo);
  const comoAna = <T>(trabajo: () => Promise<T>) => en(organizacion, trabajo);
  /** Cada número en su propia transacción, como una venta. */
  const emitir = (solicitud: SolicitudNumero, org: Organizacion = organizacion) =>
    en(org, () => entorno.unidadDeTrabajo.run(() => puerto.siguiente(solicitud)));
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
  const solicitud = (tipo: SolicitudNumero['tipo'], serie: string, org: Organizacion = organizacion): SolicitudNumero => ({
    empresaId: org.empresaId,
    tipo,
    serie,
  });
  const ultimoNumero = async (org: Organizacion, serie: string) =>
    (await entorno.dataSource.query(`SELECT ultimo_numero FROM seq.serie WHERE tenant_id = $1 AND serie = $2`, [org.tenantId, serie]))[0].ultimo_numero;

  beforeAll(async () => {
    entorno = await crearEntornoSeries({ conexiones: CAJAS + 5 });
    organizacion = await entorno.organizacion();
    otra = await entorno.organizacion();
    puerto = new ObtenerSiguiente(entorno.contexto, { now: () => instante }, new NumeracionSqlTypeOrm(entorno.unidadDeTrabajo));
  });

  beforeEach(() => {
    instante = new Date();
  });

  afterAll(() => entorno?.cerrar());

  it('TR-CA-093: con B002 en 124 devuelve 125 y B002-00000125', async () => {
    await crearSerie({ ultimoNumero: 124 });
    expect(await emitir(solicitud('BOLETA', 'B002'))).toEqual({ serie: 'B002', numero: 125n, numeroFormateado: 'B002-00000125' });
  });

  it('TR-CA-095: con F001 en 80, una venta que pide número y se revierte deja la siguiente en 81', async () => {
    await crearSerie({ tipo: 'FACTURA', codigo: 'F001', ultimoNumero: 80 });
    await expect(
      comoAna(() =>
        entorno.unidadDeTrabajo.run(async () => {
          await puerto.siguiente(solicitud('FACTURA', 'F001'));
          throw new Error('la venta falla');
        }),
      ),
    ).rejects.toThrow('la venta falla');
    expect((await emitir(solicitud('FACTURA', 'F001'))).numero).toBe(81n);
  });

  it('TR-CA-097 y TR-CA-096: el ticket A sigue a las 23:30 de Lima y reinicia a las 08:01 del día siguiente', async () => {
    // Terminó el 09/10/2026 en 342: creada ese día (12:00 de Lima) con ese último número.
    await crearSerie(
      { sucursalId: null, unidadId: organizacion.ventanilla, tipo: 'TICKET', codigo: 'A', digitos: 3, reinicio: 'DIARIO', ultimoNumero: 342 },
      organizacion,
      new Date('2026-10-09T17:00:00Z'),
    );
    instante = new Date('2026-10-10T04:30:00Z');
    expect(await emitir(solicitud('TICKET', 'A'))).toMatchObject({ numero: 343n, numeroFormateado: 'A-343' });
    instante = new Date('2026-10-10T13:01:00Z');
    expect(await emitir(solicitud('TICKET', 'A'))).toMatchObject({ numero: 1n, numeroFormateado: 'A-001' });
  });

  it('una serie ANUAL reinicia a 1 en el primer número del año nuevo y no antes', async () => {
    await crearSerie(
      { sucursalId: null, tipo: 'KARDEX', codigo: 'K', reinicio: 'ANUAL', ultimoNumero: 57 },
      organizacion,
      new Date('2026-12-31T20:00:00Z'),
    );
    instante = new Date('2027-01-01T04:59:00Z');
    expect((await emitir(solicitud('KARDEX', 'K'))).numero).toBe(58n);
    instante = new Date('2027-01-01T05:00:00Z');
    expect((await emitir(solicitud('KARDEX', 'K'))).numero).toBe(1n);
  });

  it('fuera de una transacción del UnitOfWork lanza NoActiveTransactionError', async () => {
    await expect(comoAna(() => puerto.siguiente(solicitud('BOLETA', 'B002')))).rejects.toThrow(NoActiveTransactionError);
  });

  it('una serie inactiva, inexistente o en su máximo lanza su error y no avanza', async () => {
    const inactiva = await crearSerie({ codigo: 'B006' });
    await comoAna(() => new CambiarEstadoSerie(entorno.dependencias).ejecutar({ serieId: inactiva.id, activa: false, actorId: organizacion.usuarioId }));
    await expect(emitir(solicitud('BOLETA', 'B006'))).rejects.toThrow(SerieInactivaError);
    await expect(emitir(solicitud('BOLETA', 'B999'))).rejects.toThrow(SerieNoEncontradaError);

    await crearSerie({ sucursalId: null, tipo: 'TICKET', codigo: 'Z', digitos: 1, ultimoNumero: 9 });
    await expect(emitir(solicitud('TICKET', 'Z'))).rejects.toThrow(SerieAgotadaError);
    expect(await ultimoNumero(organizacion, 'Z')).toBe('9');
  });

  it('el tenant A no numera series del tenant B', async () => {
    await crearSerie({ codigo: 'B007', ultimoNumero: 10 }, otra);
    await expect(emitir(solicitud('BOLETA', 'B007', otra), otra)).resolves.toMatchObject({ numero: 11n });
    await expect(emitir(solicitud('BOLETA', 'B007', otra), organizacion)).rejects.toThrow(SerieNoEncontradaError);
    expect(await ultimoNumero(otra, 'B007')).toBe('11');
  });

  it(
    'TR-CA-094 y TR-RNF-103: 50 cajas a la vez reciben 201 a 250, y luego 1 000 números salen sin duplicados ni huecos a ≥ 200/s',
    async () => {
      const cajas = await entorno.organizacion();
      await crearSerie({ ultimoNumero: 200 }, cajas);
      const b002 = solicitud('BOLETA', 'B002', cajas);

      const simultaneos = await Promise.all(Array.from({ length: CAJAS }, () => emitir(b002, cajas)));
      expect(ordenados(simultaneos.map((emitido) => emitido.numero))).toEqual(consecutivos(201n, CAJAS));

      const inicio = performance.now();
      const porCaja = await Promise.all(
        Array.from({ length: CAJAS }, async () => {
          const propios: bigint[] = [];
          for (let venta = 0; venta < NUMEROS_POR_CAJA; venta++) propios.push((await emitir(b002, cajas)).numero);
          return propios;
        }),
      );
      const segundos = (performance.now() - inicio) / MILISEGUNDOS_POR_SEGUNDO;
      const total = CAJAS * NUMEROS_POR_CAJA;

      expect(ordenados(porCaja.flat())).toEqual(consecutivos(251n, total));
      expect(total / segundos).toBeGreaterThanOrEqual(NUMEROS_POR_SEGUNDO_MINIMO);
    },
    TIMEOUT_CONCURRENCIA_MS,
  );
});

function ordenados(numeros: bigint[]): bigint[] {
  return [...numeros].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function consecutivos(desde: bigint, cantidad: number): bigint[] {
  return Array.from({ length: cantidad }, (_, indice) => desde + BigInt(indice));
}
