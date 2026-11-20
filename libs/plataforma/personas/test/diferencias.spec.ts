import { compararConGuardados, porId } from '../src/infrastructure/typeorm/diferencias.js';

interface Elemento {
  id: string;
  principal: boolean;
}

const elemento = (id: string, principal = false): Elemento => ({ id, principal });

describe('compararConGuardados', () => {
  it('sin cambios no hay nada que escribir', () => {
    const guardados = [elemento('a', true), elemento('b')];

    expect(compararConGuardados(guardados, porId(guardados))).toEqual({ eliminados: [], cambiados: [], nuevos: [] });
  });

  it('separa los que ya no están, los que son otra instancia y los que no estaban', () => {
    const [primero, segundo, tercero] = [elemento('a'), elemento('b'), elemento('c')];
    const editado = elemento('b');
    const nuevo = elemento('d');

    const diferencias = compararConGuardados([primero, editado, nuevo], porId([primero, segundo, tercero]));

    expect(diferencias).toEqual({ eliminados: ['c'], cambiados: [editado], nuevos: [nuevo] });
    expect(diferencias.cambiados[0]).toBe(editado);
  });

  it('entre los cambiados van primero los que dejan de ser principales', () => {
    const guardados = [elemento('a', true), elemento('b')];
    const ahoraPrincipal = elemento('b', true);
    const yaNoPrincipal = elemento('a', false);

    const { cambiados } = compararConGuardados([ahoraPrincipal, yaNoPrincipal], porId(guardados));

    expect(cambiados).toEqual([yaNoPrincipal, ahoraPrincipal]);
  });

  it('una persona nueva no tiene guardados: todo es nuevo', () => {
    const actuales = [elemento('a', true), elemento('b')];

    expect(compararConGuardados(actuales, porId([]))).toEqual({ eliminados: [], cambiados: [], nuevos: actuales });
  });
});
