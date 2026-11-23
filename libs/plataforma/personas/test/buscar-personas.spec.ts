import { BuscarPersonas } from '../src/application/buscar-personas.js';
import { clasificarConsulta, normalizarTexto } from '../src/domain/consulta-personas.js';
import { denominacionVisible } from '../src/domain/denominacion.js';
import { ConsultaMuyCortaError } from '../src/domain/errores.js';
import { crearDobles } from './support/dobles.js';

describe('clasificarConsulta', () => {
  it('vacío o solo espacios → sin filtro de texto', () => {
    expect(clasificarConsulta(undefined)).toBeNull();
    expect(clasificarConsulta('   ')).toBeNull();
  });

  it('dígitos, con espacios o guiones, son NUMERO desde 4', () => {
    expect(clasificarConsulta('4578')).toEqual({ clase: 'NUMERO', valor: '4578', palabras: [] });
    expect(clasificarConsulta('987 654-321')).toEqual({ clase: 'NUMERO', valor: '987654321', palabras: [] });
    expect(() => clasificarConsulta('123')).toThrow(ConsultaMuyCortaError);
  });

  it('con @ es CORREO en minúsculas', () => {
    expect(clasificarConsulta(' Juana.Q@ ')).toEqual({ clase: 'CORREO', valor: 'juana.q@', palabras: [] });
    expect(() => clasificarConsulta('a@')).toThrow(ConsultaMuyCortaError);
  });

  it('el resto es TEXTO normalizado, palabra por palabra, desde 3 letras', () => {
    expect(clasificarConsulta('Quíspe  JUANA')).toEqual({ clase: 'TEXTO', valor: 'quispe juana', palabras: ['quispe', 'juana'] });
    expect(clasificarConsulta('Núñez')).toEqual({ clase: 'TEXTO', valor: 'nunez', palabras: ['nunez'] });
    expect(() => clasificarConsulta('ju')).toThrow(ConsultaMuyCortaError);
    expect(() => clasificarConsulta('j.u')).toThrow(ConsultaMuyCortaError);
  });

  it('el error no lleva el texto buscado', () => {
    expect(() => clasificarConsulta('ju')).toThrow('Escriba al menos 3 letras o 4 dígitos');
  });
});

describe('normalizarTexto', () => {
  it('quita tildes, diéresis y signos como la base', () => {
    expect(normalizarTexto('Ñúñez  Pérez')).toBe('nunez perez');
    expect(normalizarTexto('Distribuidora Andina S.A.C.')).toBe('distribuidora andina s a c');
    expect(normalizarTexto('Güemes')).toBe('guemes');
  });
});

describe('denominacionVisible', () => {
  it('natural: apellidos y nombres; jurídica: razón social', () => {
    expect(denominacionVisible({ nombres: 'Juana', apellidoPaterno: 'Quispe', apellidoMaterno: 'Mamani', razonSocial: null })).toBe(
      'Quispe Mamani, Juana',
    );
    expect(denominacionVisible({ nombres: 'John', apellidoPaterno: 'Smith', apellidoMaterno: null, razonSocial: null })).toBe('Smith, John');
    expect(denominacionVisible({ nombres: null, apellidoPaterno: null, apellidoMaterno: null, razonSocial: 'Inversiones Misti E.I.R.L.' })).toBe(
      'Inversiones Misti E.I.R.L.',
    );
  });
});

describe('BuscarPersonas', () => {
  it('pasa la consulta clasificada y los filtros, y devuelve la página con su número y tamaño', async () => {
    const dobles = crearDobles();
    dobles.consultaPersonas.pagina = { items: [], total: 41 };

    const listado = await new BuscarPersonas(dobles).ejecutar({ q: 'quispe', producto: 'CLI', rol: 'PACIENTE', pagina: 3, tamano: 20 });

    expect(listado).toEqual({ items: [], total: 41, pagina: 3, tamano: 20 });
    expect(dobles.consultaPersonas.criterios).toEqual([
      { consulta: { clase: 'TEXTO', valor: 'quispe', palabras: ['quispe'] }, producto: 'CLI', rol: 'PACIENTE', pagina: 3, tamano: 20 },
    ]);
  });

  it('una consulta muy corta no llega al adaptador', async () => {
    const dobles = crearDobles();

    await expect(new BuscarPersonas(dobles).ejecutar({ q: 'ju', pagina: 1, tamano: 20 })).rejects.toThrow(ConsultaMuyCortaError);
    expect(dobles.consultaPersonas.criterios).toEqual([]);
  });
});
