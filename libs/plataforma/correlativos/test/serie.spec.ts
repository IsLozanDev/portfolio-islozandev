import type { AmbitoSerie } from '../src/domain/ambito-serie.js';
import { AmbitoSerieInvalidoError, SerieInvalidaError } from '../src/domain/errores.js';
import { Serie, type DatosNuevaSerie } from '../src/domain/serie.js';

const ID = '0193f3a0-0000-7000-8000-00000000b001';
const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const EMPRESA = '0193f3a0-0000-7000-8000-000000000011';
const CAYMA = '0193f3a0-0000-7000-8000-000000000102';
const VENTANILLA = '0193f3a0-0000-7000-8000-000000000201';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const LUIS = '0193f3a0-0000-7000-8000-000000000902';
const AHORA = new Date('2026-10-24T15:00:00Z');

const EN_CAYMA: AmbitoSerie = { empresaId: EMPRESA, sucursalId: CAYMA, unidadId: null };
const DE_EMPRESA: AmbitoSerie = { empresaId: EMPRESA, sucursalId: null, unidadId: null };

const crear = (cambios: Partial<DatosNuevaSerie> = {}): Serie =>
  Serie.crear({
    id: ID,
    tenantId: TENANT,
    ambito: EN_CAYMA,
    tipo: 'BOLETA',
    codigo: 'B002',
    reinicio: 'NUNCA',
    ultimoNumero: 0,
    por: ANA,
    ahora: AHORA,
    ...cambios,
  });

const mensajeDe = (accion: () => unknown): string => {
  try {
    accion();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('no falló');
};

describe('Serie.crear (TR-RF-035, TR-RN-017)', () => {
  it('TR-CA-090: B002 de BOLETA en Cayma queda con último 0, 8 dígitos y activa', () => {
    const serie = crear();
    expect(serie).toMatchObject({ codigo: 'B002', tipo: 'BOLETA', digitos: 8, ultimoNumero: 0, activa: true, reinicio: 'NUNCA' });
    expect(serie.ambito).toEqual(EN_CAYMA);
    expect(serie.creadoPor).toBe(ANA);
    expect(serie.modificadoEn).toEqual(AHORA);
  });

  it('publica serie.creada con el ámbito y el último número', () => {
    const [evento] = crear({ ultimoNumero: 124 }).pullEvents();
    expect(evento).toMatchObject({
      eventType: 'serie.creada',
      aggregateType: 'serie',
      aggregateId: ID,
      schemaVersion: 1,
      payload: {
        serie_id: ID,
        empresa_id: EMPRESA,
        sucursal_id: CAYMA,
        unidad_id: null,
        tipo: 'BOLETA',
        serie: 'B002',
        digitos: 8,
        reinicio: 'NUNCA',
        ultimo_numero: 124,
        por: ANA,
      },
    });
  });

  it('TR-CA-092: la serie A de TICKET con reinicio DIARIO y 3 dígitos en la ventanilla', () => {
    const serie = crear({
      ambito: { empresaId: EMPRESA, sucursalId: CAYMA, unidadId: VENTANILLA },
      tipo: 'TICKET',
      codigo: 'A',
      digitos: 3,
      reinicio: 'DIARIO',
    });
    expect(serie).toMatchObject({ codigo: 'A', digitos: 3, reinicio: 'DIARIO' });
    expect(serie.ambito.unidadId).toBe(VENTANILLA);
  });

  it('sin dígitos toma 8 por defecto', () => {
    expect(crear({ tipo: 'KARDEX', codigo: 'K', ambito: DE_EMPRESA }).digitos).toBe(8);
  });

  it('un tipo no SUNAT admite serie de empresa sin sucursal', () => {
    expect(crear({ tipo: 'EXPEDIENTE', codigo: 'EXP2026', ambito: DE_EMPRESA }).ambito.sucursalId).toBeNull();
  });

  it.each([
    ['vacía', 'TICKET', ''],
    ['en minúsculas', 'TICKET', 'a01'],
    ['de más de 10', 'TICKET', 'ABCDEFGHIJK'],
    ['con guion', 'TICKET', 'A-1'],
  ])('rechaza una serie %s', (_caso, tipo, codigo) => {
    expect(mensajeDe(() => crear({ tipo: tipo as DatosNuevaSerie['tipo'], codigo }))).toBe(
      'La serie debe tener de 1 a 10 letras mayúsculas o dígitos',
    );
  });

  it('TR-CA-091: «B001» como FACTURA se rechaza con el mensaje exacto', () => {
    const accion = () => crear({ tipo: 'FACTURA', codigo: 'B001' });
    expect(accion).toThrow(SerieInvalidaError);
    expect(mensajeDe(accion)).toBe('Las series de factura deben iniciar con F y tener 4 caracteres');
  });

  it('una boleta que no empieza con B o no tiene 4 caracteres se rechaza', () => {
    expect(mensajeDe(() => crear({ codigo: 'F002' }))).toBe('Las series de boleta deben iniciar con B y tener 4 caracteres');
    expect(mensajeDe(() => crear({ codigo: 'B02' }))).toBe('Las series de boleta deben iniciar con B y tener 4 caracteres');
  });

  it('las notas aceptan F### y B###, y rechazan otra letra', () => {
    expect(crear({ tipo: 'NOTA_CREDITO', codigo: 'FC01' }).codigo).toBe('FC01');
    expect(crear({ tipo: 'NOTA_DEBITO', codigo: 'BD01' }).codigo).toBe('BD01');
    expect(mensajeDe(() => crear({ tipo: 'NOTA_CREDITO', codigo: 'NC01' }))).toBe(
      'Las series de notas deben iniciar con F o B y tener 4 caracteres',
    );
  });

  it('un comprobante con dígitos distintos de 8 se rechaza', () => {
    expect(mensajeDe(() => crear({ digitos: 6 }))).toBe('Los comprobantes electrónicos usan 8 dígitos');
  });

  it('un comprobante sin sucursal se rechaza', () => {
    const accion = () => crear({ tipo: 'FACTURA', codigo: 'F001', ambito: DE_EMPRESA });
    expect(accion).toThrow(AmbitoSerieInvalidoError);
    expect(mensajeDe(accion)).toBe('Las series de comprobantes se asocian a una sucursal');
  });

  it.each([0, 11, 2.5])('rechaza %p dígitos', (digitos) => {
    expect(mensajeDe(() => crear({ tipo: 'TICKET', codigo: 'A', digitos }))).toBe('Los dígitos deben estar entre 1 y 10');
  });

  it.each([-1, 1000, 1.5])('rechaza el último número %p con 3 dígitos', (ultimoNumero) => {
    expect(mensajeDe(() => crear({ tipo: 'TICKET', codigo: 'A', digitos: 3, ultimoNumero }))).toBe(
      'El último número no cabe en 3 dígitos',
    );
  });

  it('acepta el máximo que cabe en sus dígitos', () => {
    expect(crear({ tipo: 'TICKET', codigo: 'A', digitos: 3, ultimoNumero: 999 }).ultimoNumero).toBe(999);
  });
});

describe('Serie.cambiarEstado', () => {
  const reconstituida = (activa: boolean) =>
    Serie.reconstituir(ID, 4, {
      tenantId: TENANT,
      ambito: EN_CAYMA,
      tipo: 'BOLETA',
      codigo: 'B002',
      digitos: 8,
      reinicio: 'NUNCA',
      ultimoNumero: 124,
      activa,
      creadoPor: ANA,
      creadoEn: AHORA,
      modificadoPor: ANA,
      modificadoEn: AHORA,
    });

  it('desactivar cambia actor y fecha y publica serie.estado_cambiado', () => {
    const serie = reconstituida(true);
    const despues = new Date('2026-10-24T16:00:00Z');
    expect(serie.cambiarEstado(false, LUIS, despues)).toBe(true);
    expect(serie).toMatchObject({ activa: false, modificadoPor: LUIS, modificadoEn: despues, version: 5 });
    expect(serie.pullEvents()).toEqual([
      expect.objectContaining({
        eventType: 'serie.estado_cambiado',
        aggregateType: 'serie',
        aggregateVersion: 5,
        payload: { serie_id: ID, tipo: 'BOLETA', serie: 'B002', activa: false, por: LUIS },
      }),
    ]);
  });

  it('al mismo estado no cambia ni emite evento (TR-RNF-008)', () => {
    const serie = reconstituida(true);
    expect(serie.cambiarEstado(true, LUIS, new Date())).toBe(false);
    expect(serie).toMatchObject({ activa: true, modificadoPor: ANA, version: 4 });
    expect(serie.pullEvents()).toEqual([]);
  });

  it('no toca el último número', () => {
    const serie = reconstituida(false);
    serie.cambiarEstado(true, LUIS, new Date());
    expect(serie.ultimoNumero).toBe(124);
  });
});
