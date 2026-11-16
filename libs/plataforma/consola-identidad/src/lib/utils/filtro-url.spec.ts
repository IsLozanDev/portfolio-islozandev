import { convertToParamMap } from '@angular/router';
import { filtroCuotasDesdeUrl, parametrosUrlCuotas, valorFiltrosCuotas } from './filtro-url';

const AHORA = new Date('2026-11-16T15:00:00Z');

describe('filtro de la lista de cuotas', () => {
  it('sin parámetros usa el mes actual y la primera página', () => {
    expect(filtroCuotasDesdeUrl(convertToParamMap({}), AHORA)).toEqual({ periodo: '2026-11', q: undefined, pagina: 1 });
  });

  it('lee periodo, búsqueda y página', () => {
    const parametros = convertToParamMap({ periodo: '2026-03', q: ' pollo ', pagina: '2' });

    expect(filtroCuotasDesdeUrl(parametros, AHORA)).toEqual({ periodo: '2026-03', q: 'pollo', pagina: 2 });
  });

  it('un periodo fuera de los seleccionables o inválido vuelve al actual', () => {
    expect(filtroCuotasDesdeUrl(convertToParamMap({ periodo: '2025-11' }), AHORA).periodo).toBe('2026-11');
    expect(filtroCuotasDesdeUrl(convertToParamMap({ periodo: '2026-12' }), AHORA).periodo).toBe('2026-11');
    expect(filtroCuotasDesdeUrl(convertToParamMap({ periodo: 'basura' }), AHORA).periodo).toBe('2026-11');
  });

  it('una página inválida vuelve a la primera', () => {
    expect(filtroCuotasDesdeUrl(convertToParamMap({ pagina: '0' }), AHORA).pagina).toBe(1);
    expect(filtroCuotasDesdeUrl(convertToParamMap({ pagina: 'x' }), AHORA).pagina).toBe(1);
  });

  it('a la URL va el periodo siempre; la búsqueda vacía y la primera página no', () => {
    expect(parametrosUrlCuotas({ periodo: '2026-11', pagina: 1 })).toEqual({ periodo: '2026-11', q: null, pagina: null });
    expect(parametrosUrlCuotas({ periodo: '2026-10', q: 'pollo', pagina: 3 })).toEqual({ periodo: '2026-10', q: 'pollo', pagina: 3 });
  });

  it('precarga la búsqueda de vit-filtros', () => {
    expect(valorFiltrosCuotas({ periodo: '2026-11', q: 'pollo', pagina: 1 })).toEqual({ busqueda: 'pollo' });
    expect(valorFiltrosCuotas({ periodo: '2026-11', pagina: 1 })).toEqual({ busqueda: '' });
  });
});
