import { convertToParamMap } from '@angular/router';
import { filtroDesdeUrl, parametrosUrlDe, valorFiltrosDe } from './filtro-url';

describe('filtro de tenants en la URL', () => {
  it('lee búsqueda, estado, producto y página', () => {
    const filtro = filtroDesdeUrl(convertToParamMap({ q: ' gym ', estado: 'SUSPENDIDO', producto: 'GYM', pagina: '3' }));

    expect(filtro).toEqual({ q: 'gym', estado: 'SUSPENDIDO', producto: 'GYM', pagina: 3, tamano: 20 });
  });

  it('ignora valores fuera del catálogo y páginas inválidas', () => {
    const filtro = filtroDesdeUrl(convertToParamMap({ q: '  ', estado: 'BORRADO', producto: 'XYZ', pagina: '-2' }));

    expect(filtro).toEqual({ q: undefined, estado: undefined, producto: undefined, pagina: 1, tamano: 20 });
  });

  it('deja fuera de la URL los filtros vacíos y la primera página', () => {
    expect(parametrosUrlDe({ pagina: 1, tamano: 20 })).toEqual({ q: null, estado: null, producto: null, pagina: null });
    expect(parametrosUrlDe({ estado: 'PRUEBA', pagina: 2, tamano: 20 })).toEqual({ q: null, estado: 'PRUEBA', producto: null, pagina: 2 });
  });

  it('arma el valor inicial de vit-filtros', () => {
    expect(valorFiltrosDe({ q: 'rosa', estado: 'PRUEBA', pagina: 1, tamano: 20 })).toEqual({ busqueda: 'rosa', estado: 'PRUEBA', producto: null });
  });
});
