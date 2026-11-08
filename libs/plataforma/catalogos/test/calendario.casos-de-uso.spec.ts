import { CrearFeriado } from '../src/application/feriados/crear-feriado.js';
import { EsDiaHabil } from '../src/application/feriados/es-dia-habil.js';
import { SumarDiasHabiles } from '../src/application/feriados/sumar-dias-habiles.js';
import { FeriadoInvalidoError } from '../src/domain/feriados/errores.js';
import { ANA } from './support/dobles.js';
import { CUSCO, LIMA, escenarioFeriados, type EscenarioFeriados } from './support/dobles-feriados.js';

describe('CalendarioPort: SumarDiasHabiles y EsDiaHabil (TR-RF-029)', () => {
  let actual: EscenarioFeriados;
  const sumar = (fecha: string, dias: number, sucursalId?: string) =>
    new SumarDiasHabiles(actual.calendario).sumarDiasHabiles(fecha, dias, sucursalId);
  const esHabil = (fecha: string, sucursalId?: string) => new EsDiaHabil(actual.calendario).esDiaHabil(fecha, sucursalId);
  const feriadoDeSucursal = (sucursalId: string, fecha: string) =>
    new CrearFeriado(actual.dependencias).ejecutar({ alcance: 'SUCURSAL', sucursalId, fecha, nombre: 'Feriado local', recurrenteAnual: false, actorId: ANA });

  beforeEach(() => {
    actual = escenarioFeriados();
  });

  it('TR-CA-075: desde el 2026-10-07, 3 días con la semilla y sabado_habil por defecto dan 2026-10-12, en una sola lectura', async () => {
    await expect(sumar('2026-10-07', 3)).resolves.toBe('2026-10-12');
    expect(actual.lectura.lecturas).toEqual([{ desde: '2026-10-07', hasta: '2026-11-15', sucursalId: null }]);
  });

  it('TR-CA-076: un feriado de Cusco cambia el cálculo de Cusco y no el de Lima', async () => {
    await feriadoDeSucursal(CUSCO, '2026-10-09');
    await expect(sumar('2026-10-07', 3, CUSCO)).resolves.toBe('2026-10-13');
    await expect(sumar('2026-10-07', 3, LIMA)).resolves.toBe('2026-10-12');
  });

  it('sabado_habil = false fijado en una sucursal cambia el resultado solo para esa sucursal', async () => {
    actual.parametros.porSucursal.set(CUSCO, false);
    await expect(sumar('2026-10-07', 3, CUSCO)).resolves.toBe('2026-10-13');
    await expect(sumar('2026-10-07', 3, LIMA)).resolves.toBe('2026-10-12');
    expect(actual.parametros.consultas).toEqual([CUSCO, LIMA]);
  });

  it('sin sucursal usa la del contexto para los feriados y para sabado_habil', async () => {
    await feriadoDeSucursal(CUSCO, '2026-10-09');
    actual.parametros.porSucursal.set(CUSCO, false);
    actual.enSucursal(CUSCO);
    await expect(sumar('2026-10-07', 3)).resolves.toBe('2026-10-14');
    expect(actual.lectura.lecturas.at(-1)?.sucursalId).toBe(CUSCO);
    expect(actual.parametros.consultas).toEqual([CUSCO]);
  });

  it('si el resultado se sale del tramo leído, lee el tramo siguiente y vuelve a calcular', async () => {
    // n = 0 lee 30 días: un mes entero de feriados de Cusco obliga a leer el tramo siguiente.
    for (let dia = 1; dia <= 31; dia += 1) await feriadoDeSucursal(CUSCO, `2026-12-${String(dia).padStart(2, '0')}`);
    // La semilla de los dobles no trae Año Nuevo: el viernes 2027-01-01 es hábil.
    await expect(sumar('2026-12-01', 0, CUSCO)).resolves.toBe('2027-01-01');
    expect(actual.lectura.lecturas).toEqual([
      { desde: '2026-12-01', hasta: '2026-12-31', sucursalId: CUSCO },
      { desde: '2027-01-01', hasta: '2027-01-30', sucursalId: CUSCO },
    ]);
  });

  it('n fuera de 0 a 366 lanza FeriadoInvalidoError sin leer nada', async () => {
    await expect(sumar('2026-10-07', 367)).rejects.toThrow(new FeriadoInvalidoError('Los días hábiles deben estar entre 0 y 366'));
    await expect(sumar('2026-10-07', -1)).rejects.toThrow(FeriadoInvalidoError);
    expect(actual.lectura.lecturas).toEqual([]);
  });

  it('esDiaHabil: Fiestas Patrias no es hábil y el día anterior sí', async () => {
    await expect(esHabil('2026-07-28')).resolves.toBe(false);
    await expect(esHabil('2026-07-27')).resolves.toBe(true);
  });

  it('esDiaHabil: el domingo nunca es hábil y el sábado depende del parámetro de la sucursal', async () => {
    actual.parametros.porSucursal.set(CUSCO, false);
    await expect(esHabil('2026-10-11')).resolves.toBe(false);
    await expect(esHabil('2026-10-10')).resolves.toBe(true);
    await expect(esHabil('2026-10-10', CUSCO)).resolves.toBe(false);
  });

  it('esDiaHabil con un feriado de otra sucursal sigue siendo hábil', async () => {
    await feriadoDeSucursal(CUSCO, '2026-10-09');
    await expect(esHabil('2026-10-09', CUSCO)).resolves.toBe(false);
    await expect(esHabil('2026-10-09', LIMA)).resolves.toBe(true);
  });
});
