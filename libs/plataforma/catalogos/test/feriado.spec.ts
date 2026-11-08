import { chocan } from '../src/domain/feriados/duplicado.js';
import { FeriadoInvalidoError } from '../src/domain/feriados/errores.js';
import { Feriado, type CambiosFeriado, type DatosNuevoFeriado } from '../src/domain/feriados/feriado.js';

const TENANT_A = '0193f3a0-0000-7000-8000-000000000001';
const TENANT_B = '0193f3a0-0000-7000-8000-000000000002';
const CUSCO = '0193f3a0-0000-7000-8000-0000000a0001';
const LIMA = '0193f3a0-0000-7000-8000-0000000a0002';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const AHORA = new Date('2026-11-07T15:00:00Z');
const DESPUES = new Date('2026-11-08T15:00:00Z');

let secuencia = 0;
const crear = (cambios: Partial<DatosNuevoFeriado> = {}): Feriado => {
  secuencia += 1;
  return Feriado.crear({
    id: `0193f3a0-0000-7000-8000-${String(secuencia).padStart(12, '0')}`,
    alcance: 'TENANT',
    tenantId: TENANT_A,
    sucursalId: null,
    fecha: '2026-05-15',
    nombre: 'Aniversario',
    recurrenteAnual: false,
    por: ANA,
    ahora: AHORA,
    ...cambios,
  });
};
const global = (fecha: string, recurrenteAnual: boolean): Feriado =>
  crear({ alcance: 'GLOBAL', tenantId: null, fecha, recurrenteAnual });
const deSucursal = (sucursalId: string, fecha: string): Feriado => crear({ alcance: 'SUCURSAL', sucursalId, fecha });
const cambios = (datos: Partial<CambiosFeriado> = {}): CambiosFeriado => ({
  fecha: '2026-05-15',
  nombre: 'Aniversario',
  recurrenteAnual: false,
  por: ANA,
  ahora: DESPUES,
  ...datos,
});

describe('Feriado.crear (TR-RF-029)', () => {
  it('nace en versión 0 con su alcance, su autor y sin eventos', () => {
    const feriado = crear({ alcance: 'SUCURSAL', sucursalId: CUSCO });
    expect(feriado).toMatchObject({
      version: 0,
      alcance: 'SUCURSAL',
      tenantId: TENANT_A,
      sucursalId: CUSCO,
      fecha: '2026-05-15',
      nombre: 'Aniversario',
      recurrenteAnual: false,
      esGlobal: false,
      creadoPor: ANA,
      modificadoPor: ANA,
      creadoEn: AHORA,
      modificadoEn: AHORA,
      anio: 2026,
      mesDia: '05-15',
    });
    expect(feriado.pullEvents()).toEqual([]);
  });

  it.each(['Ab', 'x'.repeat(101)])('el nombre %p fuera de 3 a 100 caracteres es inválido', (nombre) => {
    expect(() => crear({ nombre })).toThrow(new FeriadoInvalidoError('El nombre debe tener de 3 a 100 caracteres'));
  });

  it.each(['2026-02-30', '15/05/2026', '2026-5-15'])('la fecha %p es inválida', (fecha) => {
    expect(() => crear({ fecha })).toThrow(new FeriadoInvalidoError('La fecha no es válida'));
  });

  it.each([
    { alcance: 'SUCURSAL' as const, sucursalId: null },
    { alcance: 'TENANT' as const, sucursalId: CUSCO },
    { alcance: 'GLOBAL' as const, sucursalId: CUSCO },
  ])('$alcance con sucursal $sucursalId es inválido', ({ alcance, sucursalId }) => {
    expect(() => crear({ alcance, sucursalId })).toThrow(
      new FeriadoInvalidoError('La sucursal solo aplica a feriados de sucursal'),
    );
  });
});

describe('Feriado.actualizar', () => {
  it('sin cambios devuelve false y no emite evento', () => {
    const feriado = crear();
    expect(feriado.actualizar(cambios())).toBe(false);
    expect(feriado.modificadoEn).toBe(AHORA);
    expect(feriado.version).toBe(0);
    expect(feriado.pullEvents()).toEqual([]);
  });

  it('cambia fecha, nombre y recurrencia, y deja el autor de la modificación', () => {
    const feriado = crear();
    const otroUsuario = '0193f3a0-0000-7000-8000-000000000902';
    expect(feriado.actualizar(cambios({ fecha: '2026-05-16', nombre: 'Aniversario de A', recurrenteAnual: true, por: otroUsuario }))).toBe(true);
    expect(feriado).toMatchObject({
      fecha: '2026-05-16',
      nombre: 'Aniversario de A',
      recurrenteAnual: true,
      modificadoPor: otroUsuario,
      modificadoEn: DESPUES,
      creadoPor: ANA,
    });
  });

  it.each([
    { alcance: 'GLOBAL' as const },
    { sucursalId: CUSCO },
  ])('cambiar %p es inválido', (cambio) => {
    expect(() => crear().actualizar(cambios(cambio))).toThrow(new FeriadoInvalidoError('El alcance de un feriado no se cambia'));
  });

  it('mandar el mismo alcance y la misma sucursal se admite', () => {
    const feriado = crear({ alcance: 'SUCURSAL', sucursalId: CUSCO });
    expect(feriado.actualizar(cambios({ alcance: 'SUCURSAL', sucursalId: CUSCO }))).toBe(false);
  });

  it('valida el contenido nuevo', () => {
    expect(() => crear().actualizar(cambios({ nombre: 'No' }))).toThrow(FeriadoInvalidoError);
    expect(() => crear().actualizar(cambios({ fecha: '2026-13-01' }))).toThrow(FeriadoInvalidoError);
  });
});

describe('Feriado.fechaEnAnio', () => {
  it('un recurrente de 2026 aplica en 2027 y no en 2025', () => {
    const fiestasPatrias = global('2026-07-28', true);
    expect(fiestasPatrias.fechaEnAnio(2026)).toBe('2026-07-28');
    expect(fiestasPatrias.fechaEnAnio(2027)).toBe('2027-07-28');
    expect(fiestasPatrias.fechaEnAnio(2025)).toBeNull();
  });

  it('un no recurrente solo aplica en su año', () => {
    const juevesSanto = global('2026-04-02', false);
    expect(juevesSanto.fechaEnAnio(2026)).toBe('2026-04-02');
    expect(juevesSanto.fechaEnAnio(2027)).toBeNull();
  });

  it('un 29 de febrero recurrente solo aplica en años bisiestos', () => {
    const bisiesto = crear({ fecha: '2028-02-29', recurrenteAnual: true });
    expect(bisiesto.fechaEnAnio(2028)).toBe('2028-02-29');
    expect(bisiesto.fechaEnAnio(2029)).toBeNull();
    expect(bisiesto.fechaEnAnio(2032)).toBe('2032-02-29');
  });

  it('reconstituir conserva versión y datos', () => {
    const feriado = Feriado.reconstituir('0193f3a0-0000-7000-8000-00000000f001', 4, {
      alcance: 'GLOBAL',
      tenantId: null,
      sucursalId: null,
      fecha: '2026-10-08',
      nombre: 'Combate de Angamos',
      recurrenteAnual: true,
      creadoPor: null,
      creadoEn: AHORA,
      modificadoPor: null,
      modificadoEn: AHORA,
    });
    expect(feriado).toMatchObject({ version: 4, esGlobal: true, creadoPor: null });
    expect(feriado.fechaEnAnio(2030)).toBe('2030-10-08');
  });
});

describe('chocan (TR-CA-077)', () => {
  describe('niveles', () => {
    it('GLOBAL choca con GLOBAL y no revisa TENANT', () => {
      expect(chocan(global('2026-04-02', false), global('2026-04-02', false))).toBe(true);
      expect(chocan(global('2026-05-15', false), crear())).toBe(false);
    });

    it('TENANT choca con GLOBAL y con TENANT del mismo tenant, no con otro tenant ni con sucursales', () => {
      expect(chocan(crear({ fecha: '2026-04-02' }), global('2026-04-02', false))).toBe(true);
      expect(chocan(crear(), crear())).toBe(true);
      expect(chocan(crear(), crear({ tenantId: TENANT_B }))).toBe(false);
      expect(chocan(crear({ fecha: '2026-09-20' }), deSucursal(CUSCO, '2026-09-20'))).toBe(false);
    });

    it('SUCURSAL choca con GLOBAL, con TENANT y con la misma sucursal, no con otra', () => {
      expect(chocan(deSucursal(CUSCO, '2026-04-02'), global('2026-04-02', false))).toBe(true);
      expect(chocan(deSucursal(CUSCO, '2026-05-15'), crear())).toBe(true);
      expect(chocan(deSucursal(CUSCO, '2026-09-20'), deSucursal(CUSCO, '2026-09-20'))).toBe(true);
      expect(chocan(deSucursal(CUSCO, '2026-09-20'), deSucursal(LIMA, '2026-09-20'))).toBe(false);
    });

    it('un feriado no choca consigo mismo al editarlo', () => {
      const feriado = crear();
      expect(chocan(feriado, feriado)).toBe(false);
    });
  });

  describe('recurrencia', () => {
    it('dos no recurrentes chocan solo con la misma fecha', () => {
      expect(chocan(crear({ fecha: '2027-05-15' }), crear())).toBe(false);
    });

    it('un no recurrente choca con un recurrente si cae en su año o después', () => {
      const recurrente = crear({ fecha: '2026-08-15', recurrenteAnual: true });
      expect(chocan(crear({ fecha: '2027-08-15' }), recurrente)).toBe(true);
      expect(chocan(crear({ fecha: '2025-08-15' }), recurrente)).toBe(false);
      expect(chocan(crear({ fecha: '2027-08-16' }), recurrente)).toBe(false);
    });

    it('un recurrente choca con un no recurrente de su año o posterior', () => {
      expect(chocan(crear({ fecha: '2025-05-15', recurrenteAnual: true }), crear())).toBe(true);
      expect(chocan(crear({ fecha: '2027-05-15', recurrenteAnual: true }), crear())).toBe(false);
    });

    it('dos recurrentes chocan con el mismo día y mes', () => {
      expect(chocan(crear({ fecha: '2020-10-08', recurrenteAnual: true }), global('2026-10-08', true))).toBe(true);
      expect(chocan(crear({ fecha: '2020-10-09', recurrenteAnual: true }), global('2026-10-08', true))).toBe(false);
    });
  });
});
