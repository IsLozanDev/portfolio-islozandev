import type { VariableDeclarada } from '../models/plantilla';
import { insertarEnCursor, marcadorDe, marcadoresNoDeclarados } from './marcadores-plantilla';

const VARIABLES: VariableDeclarada[] = [
  { nombre: 'tenant', tipo: 'texto', ejemplo: 'Restaurante El Buen Sabor' },
  { nombre: 'dias', tipo: 'numero', ejemplo: '3' },
];

describe('marcadoresNoDeclarados', () => {
  it('acepta los declarados, también con espacios dentro de las llaves', () => {
    expect(marcadoresNoDeclarados('Hola {{tenant}}, vence en {{ dias }} días', VARIABLES)).toEqual([]);
  });

  it('TR-CA-185: {{diagnostico}} no declarada sale una sola vez, en orden de aparición', () => {
    expect(marcadoresNoDeclarados('{{diagnostico}} {{tenant}} {{ otro }} {{diagnostico}}', VARIABLES)).toEqual(['diagnostico', 'otro']);
  });

  it('ignora llaves que no son marcadores', () => {
    expect(marcadoresNoDeclarados('{ tenant } {{}} {{1x}}', VARIABLES)).toEqual([]);
  });
});

describe('insertarEnCursor', () => {
  it('inserta en la posición del cursor y deja el cursor después', () => {
    expect(insertarEnCursor('Hola :', 5, 5, '{{tenant}}')).toEqual({ texto: 'Hola {{tenant}}:', cursor: 15 });
  });

  it('reemplaza la selección', () => {
    expect(insertarEnCursor('Hola XXX:', 5, 8, '{{tenant}}')).toEqual({ texto: 'Hola {{tenant}}:', cursor: 15 });
  });

  it('acota posiciones fuera del texto al final', () => {
    expect(insertarEnCursor('Hola', 99, 120, '!')).toEqual({ texto: 'Hola!', cursor: 5 });
  });

  it('marcadorDe arma {{nombre}}', () => {
    expect(marcadorDe('dias')).toBe('{{dias}}');
  });
});
