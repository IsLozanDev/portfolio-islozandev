import { TAMANO_PAGINA_POR_DEFECTO, tamanoPaginaDesdeTexto, tamanoPaginaParaUrl } from './tamano-pagina';

describe('tamaño de página en la URL', () => {
  it('acepta solo 20, 50 y 100; el resto vuelve a 20', () => {
    expect(tamanoPaginaDesdeTexto('50')).toBe(50);
    expect(tamanoPaginaDesdeTexto('100')).toBe(100);
    expect(tamanoPaginaDesdeTexto('30')).toBe(TAMANO_PAGINA_POR_DEFECTO);
    expect(tamanoPaginaDesdeTexto(null)).toBe(TAMANO_PAGINA_POR_DEFECTO);
  });

  it('el tamaño por defecto no va en la URL', () => {
    expect(tamanoPaginaParaUrl(20)).toBeNull();
    expect(tamanoPaginaParaUrl(50)).toBe(50);
  });
});
