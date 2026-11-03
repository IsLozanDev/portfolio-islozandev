import { filasDePagina } from './filas-de-pagina';

describe('filasDePagina', () => {
  const filas = Array.from({ length: 45 }, (_, indice) => indice);

  it('devuelve las filas de la página pedida', () => {
    expect(filasDePagina(filas, { indice: 0, tamano: 20 })).toEqual(filas.slice(0, 20));
    expect(filasDePagina(filas, { indice: 2, tamano: 20 })).toEqual([40, 41, 42, 43, 44]);
  });

  it('una página fuera de rango queda vacía', () => {
    expect(filasDePagina(filas, { indice: 1, tamano: 50 })).toEqual([]);
  });
});
