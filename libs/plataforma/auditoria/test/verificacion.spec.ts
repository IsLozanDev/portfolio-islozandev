import { ExportacionDemasiadoGrandeError } from '../src/domain/errores.js';
import {
  aVerificacion,
  estaTruncada,
  HASH_INICIAL,
  puntoDePartida,
  quedanFilas,
  resultadoInicial,
  resultadoTruncado,
  sumarTramo,
  type TramoVerificado,
} from '../src/domain/verificacion.js';

const ULTIMA_OK = { numero: '120', hash: 'a'.repeat(64) };
const tramoSano = (ultimoNumero: string, filas: number): TramoVerificado => ({
  ultimoNumero,
  ultimoHash: 'b'.repeat(64),
  filas,
  numeroRoto: null,
  motivo: null,
});
const DATOS = {
  id: '0193f3a0-0000-7000-8000-00000000a001',
  tenantId: '0193f3a0-0000-7000-8000-000000000001',
  modo: 'INCREMENTAL' as const,
  iniciadaEn: new Date('2026-11-10T08:30:00Z'),
  terminadaEn: new Date('2026-11-10T08:30:05Z'),
};

describe('verificación de integridad (spec 20b)', () => {
  it('INCREMENTAL parte de la última OK; COMPLETA o sin verificaciones, de 0 con 64 ceros', () => {
    expect(puntoDePartida('INCREMENTAL', ULTIMA_OK)).toEqual(ULTIMA_OK);
    expect(puntoDePartida('COMPLETA', ULTIMA_OK)).toEqual({ numero: '0', hash: HASH_INICIAL });
    expect(puntoDePartida('INCREMENTAL', null)).toEqual({ numero: '0', hash: HASH_INICIAL });
  });

  it('está truncada si el máximo número quedó por debajo de lo ya verificado, y la rotura apunta a ese número', () => {
    expect(estaTruncada('118', ULTIMA_OK)).toBe(true);
    expect(estaTruncada('120', ULTIMA_OK)).toBe(false);
    expect(estaTruncada('9007199254740993', { numero: '9007199254740992', hash: HASH_INICIAL })).toBe(false);
    expect(aVerificacion(resultadoTruncado(ULTIMA_OK), DATOS)).toMatchObject({
      estado: 'ROTA',
      motivo: 'TRUNCADA',
      numeroRoto: '120',
      desdeNumero: '120',
      hastaNumero: '120',
      filas: 0,
    });
  });

  it('suma los tramos sanos y sigue mientras el tramo venga lleno', () => {
    const resultado = sumarTramo(sumarTramo(resultadoInicial(ULTIMA_OK), tramoSano('130', 10)), tramoSano('133', 3));
    expect(quedanFilas(tramoSano('130', 10), 10)).toBe(true);
    expect(quedanFilas(tramoSano('133', 3), 10)).toBe(false);
    expect(aVerificacion(resultado, DATOS)).toEqual({
      ...DATOS,
      desdeNumero: '120',
      hastaNumero: '133',
      ultimoHash: 'b'.repeat(64),
      filas: 13,
      estado: 'OK',
      numeroRoto: null,
      motivo: null,
    });
  });

  it('un tramo con falla deja la verificación ROTA con el número y el motivo, y no pide más tramos', () => {
    const conFalla: TramoVerificado = { ...tramoSano('124', 4), numeroRoto: '125', motivo: 'HASH' };
    expect(quedanFilas(conFalla, 4)).toBe(false);
    expect(aVerificacion(sumarTramo(resultadoInicial(ULTIMA_OK), conFalla), DATOS)).toMatchObject({
      estado: 'ROTA',
      motivo: 'HASH',
      numeroRoto: '125',
      hastaNumero: '124',
      filas: 4,
    });
  });

  it('sin filas nuevas queda OK en el mismo punto', () => {
    expect(aVerificacion(resultadoInicial(ULTIMA_OK), DATOS)).toMatchObject({ estado: 'OK', desdeNumero: '120', hastaNumero: '120', filas: 0 });
  });
});

describe('ExportacionDemasiadoGrandeError (spec 20b)', () => {
  it('reutiliza el mensaje del 18b con separador de miles', () => {
    expect(new ExportacionDemasiadoGrandeError(12_345, 10_000).message).toBe(
      'La exportación tiene 12 345 filas; el máximo es 10 000. Acote el rango o los filtros',
    );
  });
});
