import { celdasDeAtributos, clavesDeAtributos, tituloDeAtributo } from './columnas-atributos';

describe('columnas de atributos', () => {
  it('junta las claves de la página, sin repetir y en orden alfabético', () => {
    expect(clavesDeAtributos([{ provincia: 'CHACHAPOYAS', departamento: 'AMAZONAS' }, { departamento: 'LIMA', provincia: 'LIMA' }, {}])).toEqual(['departamento', 'provincia']);
    expect(clavesDeAtributos([{}, {}])).toEqual([]);
  });

  it('el título pone mayúscula inicial y cambia el guion bajo por espacio', () => {
    expect(tituloDeAtributo('departamento')).toBe('Departamento');
    expect(tituloDeAtributo('valida_reniec')).toBe('Valida reniec');
  });

  it('las celdas van como texto; la clave que falta queda en «—»', () => {
    expect(celdasDeAtributos(['departamento', 'longitud', 'valida_reniec', 'provincia'], { departamento: 'AMAZONAS', longitud: 8, valida_reniec: true })).toEqual({
      'atributo.departamento': 'AMAZONAS',
      'atributo.longitud': '8',
      'atributo.valida_reniec': 'Sí',
      'atributo.provincia': '—',
    });
  });
});
