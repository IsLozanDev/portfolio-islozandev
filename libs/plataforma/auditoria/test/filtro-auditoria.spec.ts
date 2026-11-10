import { FiltroAuditoriaInvalidoError, RangoInvalidoError } from '../src/domain/errores.js';
import { validarFiltroAuditoria, validarPaginacion, type FiltroAuditoria } from '../src/domain/filtro-auditoria.js';

const OCTUBRE: FiltroAuditoria = { desde: '2026-10-01', hasta: '2026-10-31' };
const SURCO = '0193f3a0-0000-7000-8000-000000000102';

describe('validarFiltroAuditoria (spec 20b)', () => {
  it('acepta un rango de 92 días y devuelve el texto de usuario sin espacios sobrantes', () => {
    expect(validarFiltroAuditoria({ desde: '2026-08-01', hasta: '2026-10-31' })).toEqual({ desde: '2026-08-01', hasta: '2026-10-31' });
    expect(validarFiltroAuditoria({ ...OCTUBRE, usuario: '  rosa ', sucursalId: SURCO, tipo: 'ACCESO_SENSIBLE' })).toEqual({
      ...OCTUBRE,
      usuario: 'rosa',
      sucursalId: SURCO,
      tipo: 'ACCESO_SENSIBLE',
    });
  });

  it('rechaza 93 días, desde posterior a hasta, sin fechas o una fecha que no existe', () => {
    expect(() => validarFiltroAuditoria({ desde: '2026-08-01', hasta: '2026-11-01' })).toThrow(RangoInvalidoError);
    expect(() => validarFiltroAuditoria({ desde: '2026-10-31', hasta: '2026-10-01' })).toThrow(RangoInvalidoError);
    expect(() => validarFiltroAuditoria({ desde: '', hasta: '2026-10-01' })).toThrow(RangoInvalidoError);
    expect(() => validarFiltroAuditoria({ desde: '2026-02-30', hasta: '2026-03-01' })).toThrow(RangoInvalidoError);
  });

  it('rechaza ids que no son uuid', () => {
    expect(() => validarFiltroAuditoria({ ...OCTUBRE, sucursalId: 'surco' })).toThrow(FiltroAuditoriaInvalidoError);
    expect(() => validarFiltroAuditoria({ ...OCTUBRE, personaTitularId: '123' })).toThrow(FiltroAuditoriaInvalidoError);
  });

  it('rechaza textos fuera de sus topes y un tipo desconocido', () => {
    expect(() => validarFiltroAuditoria({ ...OCTUBRE, usuario: ' r ' })).toThrow(FiltroAuditoriaInvalidoError);
    expect(() => validarFiltroAuditoria({ ...OCTUBRE, usuario: 'r'.repeat(101) })).toThrow(FiltroAuditoriaInvalidoError);
    expect(() => validarFiltroAuditoria({ ...OCTUBRE, accion: 'a'.repeat(81) })).toThrow(FiltroAuditoriaInvalidoError);
    expect(() => validarFiltroAuditoria({ ...OCTUBRE, entidadTipo: '' })).toThrow(FiltroAuditoriaInvalidoError);
    expect(() => validarFiltroAuditoria({ ...OCTUBRE, tipo: 'OTRO' as FiltroAuditoria['tipo'] })).toThrow(FiltroAuditoriaInvalidoError);
  });
});

describe('validarPaginacion (spec 20b)', () => {
  it('por defecto la primera página de 20, y hasta 100 por página', () => {
    expect(validarPaginacion({})).toEqual({ pagina: 1, tamano: 20 });
    expect(validarPaginacion({ pagina: 3, tamano: 100 })).toEqual({ pagina: 3, tamano: 100 });
  });

  it('rechaza página 0, tamaño 0 o mayor que 100', () => {
    expect(() => validarPaginacion({ pagina: 0 })).toThrow(FiltroAuditoriaInvalidoError);
    expect(() => validarPaginacion({ tamano: 0 })).toThrow(FiltroAuditoriaInvalidoError);
    expect(() => validarPaginacion({ tamano: 101 })).toThrow(FiltroAuditoriaInvalidoError);
  });
});
