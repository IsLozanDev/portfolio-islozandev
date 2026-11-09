import { convertToParamMap } from '@angular/router';
import { filtroFeriadosDesdeUrl, parametrosUrlFeriados } from './filtro-url';

const ANIO_LIMA = 2026;

describe('filtro de feriados en la URL', () => {
  it('lee año, sucursal, alcance, página y tamaño', () => {
    const parametros = convertToParamMap({ anio: '2027', sucursal: 's-1', alcance: 'SUCURSAL', pagina: '2', tamano: '50' });
    expect(filtroFeriadosDesdeUrl(parametros, ANIO_LIMA)).toEqual({ anio: 2027, sucursalId: 's-1', alcance: 'SUCURSAL', pagina: 2, tamano: 50 });
  });

  it('sin año, o fuera de 2000-2100, usa el de Lima; un alcance desconocido se ignora', () => {
    expect(filtroFeriadosDesdeUrl(convertToParamMap({}), ANIO_LIMA)).toMatchObject({ anio: 2026, pagina: 1, tamano: 20 });
    expect(filtroFeriadosDesdeUrl(convertToParamMap({ anio: '1999' }), ANIO_LIMA).anio).toBe(2026);
    expect(filtroFeriadosDesdeUrl(convertToParamMap({ anio: '2101' }), ANIO_LIMA).anio).toBe(2026);
    expect(filtroFeriadosDesdeUrl(convertToParamMap({ alcance: 'REGIONAL' }), ANIO_LIMA).alcance).toBeUndefined();
  });

  it('el año siempre va en la URL; la primera página y el tamaño por defecto no', () => {
    expect(parametrosUrlFeriados({ anio: 2026, pagina: 1, tamano: 20 })).toEqual({ anio: 2026, sucursal: null, alcance: null, pagina: null, tamano: null });
    expect(parametrosUrlFeriados({ anio: 2027, sucursalId: 's-1', alcance: 'TENANT', pagina: 3, tamano: 50 })).toEqual({
      anio: 2027,
      sucursal: 's-1',
      alcance: 'TENANT',
      pagina: 3,
      tamano: 50,
    });
  });
});
