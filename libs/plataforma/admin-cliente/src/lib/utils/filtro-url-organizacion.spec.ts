import { convertToParamMap } from '@angular/router';
import { activoDeEstado, estadoDesdeUrl, estadoParaUrl, paginaDesdeUrl, paginaParaUrl } from './filtro-url-organizacion';

describe('filtros de organización en la URL', () => {
  it.each([
    [{}, 'activas', true],
    [{ activo: 'false' }, 'inactivas', false],
    [{ activo: 'todas' }, 'todas', undefined],
    [{ activo: 'cualquiera' }, 'activas', true],
  ] as const)('%o es %s y pide activo=%p', (parametros, estado, activo) => {
    expect(estadoDesdeUrl(convertToParamMap(parametros))).toBe(estado);
    expect(activoDeEstado(estado)).toBe(activo);
  });

  it('las activas y la primera página quedan fuera de la URL', () => {
    expect(estadoParaUrl('activas')).toBeNull();
    expect(estadoParaUrl('inactivas')).toBe('false');
    expect(paginaParaUrl(1)).toBeNull();
    expect(paginaParaUrl(3)).toBe(3);
  });

  it.each([
    [{ pagina: '2' }, 2],
    [{ pagina: '0' }, 1],
    [{ pagina: 'x' }, 1],
    [{}, 1],
  ])('la página de %o es %i', (parametros, pagina) => {
    expect(paginaDesdeUrl(convertToParamMap(parametros))).toBe(pagina);
  });
});
