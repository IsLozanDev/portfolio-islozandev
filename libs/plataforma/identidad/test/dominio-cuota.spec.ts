import { validarAjuste } from '../src/domain/ajuste-cuota.js';
import { avisosPendientes } from '../src/domain/aviso-cuota.js';
import { porcentajeConsumo, type EstadoCuota } from '../src/domain/estado-cuota.js';
import {
  IncluidasMenorQueConsumidasError,
  PeriodoCerradoError,
  UltimoProveedorActivoError,
} from '../src/domain/errores.js';
import { compararPeriodos, esPeriodoValido, periodoDe } from '../src/domain/periodo.js';
import { esPlanCuota, incluidasDe, planMasAlto } from '../src/domain/plan-cuota.js';
import { aplicarCambiosProveedor, type ProveedorEditable } from '../src/domain/proveedor-editable.js';

const UMBRAL_POR_DEFECTO = 80;

function cuota(cambios: Partial<EstadoCuota> = {}): EstadoCuota {
  return {
    tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
    periodo: '2026-10',
    plan: 'PRO',
    incluidas: 500,
    consumidas: 0,
    avisadoUmbralEn: null,
    avisadoAgotadaEn: null,
    version: 1,
    ...cambios,
  };
}

describe('periodoDe', () => {
  it('cambia de mes a medianoche de Lima, no de UTC', () => {
    expect(periodoDe(new Date('2026-11-01T04:59:59Z'))).toBe('2026-10');
    expect(periodoDe(new Date('2026-11-01T05:00:00Z'))).toBe('2026-11');
  });

  it('el 1 de enero en Lima ya es el año nuevo', () => {
    expect(periodoDe(new Date('2026-12-31T23:30:00-05:00'))).toBe('2026-12');
    expect(periodoDe(new Date('2027-01-01T00:00:00-05:00'))).toBe('2027-01');
  });
});

describe('esPeriodoValido y compararPeriodos', () => {
  it.each(['2026-01', '2026-12'])('%s es válido', (texto) => {
    expect(esPeriodoValido(texto)).toBe(true);
  });

  it.each(['2026-13', '2026-00', '2026-1', '26-10', '2026/10', ''])('%s no es válido', (texto) => {
    expect(esPeriodoValido(texto)).toBe(false);
  });

  it('ordena por fecha, incluso al cruzar el año', () => {
    expect(compararPeriodos('2026-12', '2027-01')).toBeLessThan(0);
    expect(compararPeriodos('2026-11', '2026-10')).toBeGreaterThan(0);
    expect(compararPeriodos('2026-10', '2026-10')).toBe(0);
  });
});

describe('planMasAlto', () => {
  it('BASICO y EMPRESA dan EMPRESA, en cualquier orden', () => {
    expect(planMasAlto(['BASICO', 'EMPRESA'])).toBe('EMPRESA');
    expect(planMasAlto(['EMPRESA', 'PRO'])).toBe('EMPRESA');
  });

  it('sin planes vigentes es BASICO', () => {
    expect(planMasAlto([])).toBe('BASICO');
  });

  it('incluidasDe toma la del plan', () => {
    expect(incluidasDe('PRO', { BASICO: 200, PRO: 500, EMPRESA: 2000 })).toBe(500);
  });

  it('esPlanCuota reconoce solo los tres planes', () => {
    expect(esPlanCuota('EMPRESA')).toBe(true);
    expect(esPlanCuota('GRATIS')).toBe(false);
  });
});

describe('avisosPendientes', () => {
  it('TR-CA-120: 400 de 500 alcanza el umbral de 80 %', () => {
    expect(avisosPendientes(cuota({ consumidas: 400 }), UMBRAL_POR_DEFECTO)).toEqual(['UMBRAL']);
    expect(porcentajeConsumo(cuota({ consumidas: 400 }))).toBe(80);
  });

  it('399 de 500 todavía no', () => {
    expect(avisosPendientes(cuota({ consumidas: 399 }), UMBRAL_POR_DEFECTO)).toEqual([]);
  });

  it('con umbral 90 el aviso pasa a 450 de 500', () => {
    expect(avisosPendientes(cuota({ consumidas: 449 }), 90)).toEqual([]);
    expect(avisosPendientes(cuota({ consumidas: 450 }), 90)).toEqual(['UMBRAL']);
  });

  it('el umbral ya avisado no se repite', () => {
    expect(avisosPendientes(cuota({ consumidas: 450, avisadoUmbralEn: new Date() }), UMBRAL_POR_DEFECTO)).toEqual([]);
  });

  it('500 de 500 sin avisos previos da los dos', () => {
    expect(avisosPendientes(cuota({ consumidas: 500 }), UMBRAL_POR_DEFECTO)).toEqual(['UMBRAL', 'AGOTADA']);
  });

  it('la agotada ya avisada no se repite', () => {
    const avisada = cuota({ consumidas: 500, avisadoUmbralEn: new Date(), avisadoAgotadaEn: new Date() });
    expect(avisosPendientes(avisada, UMBRAL_POR_DEFECTO)).toEqual([]);
  });

  it('con 0 incluidas solo hay aviso de agotada y el consumo es 100 %', () => {
    const sinIncluidas = cuota({ incluidas: 0, consumidas: 0 });
    expect(avisosPendientes(sinIncluidas, UMBRAL_POR_DEFECTO)).toEqual(['AGOTADA']);
    expect(porcentajeConsumo(sinIncluidas)).toBe(100);
  });

  it('el porcentaje se trunca', () => {
    expect(porcentajeConsumo(cuota({ incluidas: 3, consumidas: 2 }))).toBe(66);
  });
});

describe('validarAjuste', () => {
  const ajusteValido = { incluidasNuevas: 600, consumidas: 400, periodo: '2026-11', periodoActual: '2026-11' };

  it('acepta el periodo actual o uno futuro con incluidas >= consumidas', () => {
    expect(() => validarAjuste(ajusteValido)).not.toThrow();
    expect(() => validarAjuste({ ...ajusteValido, incluidasNuevas: 400 })).not.toThrow();
    expect(() => validarAjuste({ ...ajusteValido, periodo: '2026-12', consumidas: 0 })).not.toThrow();
  });

  it('por debajo de las consumidas es INCLUIDAS_MENOR_QUE_CONSUMIDAS', () => {
    expect(() => validarAjuste({ ...ajusteValido, incluidasNuevas: 399 })).toThrow(IncluidasMenorQueConsumidasError);
  });

  it('un periodo anterior al actual es PERIODO_CERRADO', () => {
    expect(() => validarAjuste({ ...ajusteValido, periodo: '2026-10' })).toThrow(PeriodoCerradoError);
  });
});

describe('aplicarCambiosProveedor', () => {
  const decolecta: ProveedorEditable = {
    codigo: 'DECOLECTA',
    tiposDoc: ['DNI', 'RUC'],
    prioridad: 1,
    ttlDias: 30,
    timeoutMs: 3000,
    activo: true,
    version: 3,
  };
  const soloDni: ProveedorEditable = { ...decolecta, codigo: 'RENIEC_DIRECTO', tiposDoc: ['DNI'], prioridad: 2 };

  it('aplica solo los cambios presentes y conserva la versión', () => {
    expect(aplicarCambiosProveedor(decolecta, { prioridad: 2, ttlDias: undefined }, [])).toEqual({
      ...decolecta,
      prioridad: 2,
    });
  });

  it('desactivar el único proveedor de RUC es ULTIMO_PROVEEDOR_ACTIVO', () => {
    expect(() => aplicarCambiosProveedor(decolecta, { activo: false }, [soloDni])).toThrow(UltimoProveedorActivoError);
  });

  it('un respaldo inactivo no cuenta', () => {
    const decolectaDos = { ...decolecta, codigo: 'OTRO', activo: false };
    expect(() => aplicarCambiosProveedor(decolecta, { activo: false }, [decolectaDos])).toThrow(UltimoProveedorActivoError);
  });

  it('se puede desactivar si cada tipo tiene otro activo', () => {
    expect(aplicarCambiosProveedor(soloDni, { activo: false }, [decolecta]).activo).toBe(false);
  });

  it('un proveedor ya inactivo se edita sin exigir respaldo', () => {
    const inactivo = { ...soloDni, activo: false };
    expect(aplicarCambiosProveedor(inactivo, { timeoutMs: 2000 }, []).timeoutMs).toBe(2000);
  });
});
