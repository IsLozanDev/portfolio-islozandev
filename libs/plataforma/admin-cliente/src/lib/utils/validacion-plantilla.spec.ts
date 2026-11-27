import type { VariableDeclarada } from '../models/plantilla';
import { errorDelAsunto, errorDelCuerpo, variablesPorCampo } from './validacion-plantilla';

const VARIABLES: VariableDeclarada[] = [{ nombre: 'dias', tipo: 'numero', ejemplo: '3' }];

describe('validación local de la plantilla', () => {
  it('asunto: obligatorio, hasta 150, una línea y solo variables declaradas', () => {
    expect(errorDelAsunto('  ', VARIABLES)).toBe('El asunto es obligatorio');
    expect(errorDelAsunto('a'.repeat(151), VARIABLES)).toBe('El asunto pasa de 150 caracteres');
    expect(errorDelAsunto('a'.repeat(150), VARIABLES)).toBeNull();
    expect(errorDelAsunto('Dos\nlíneas', VARIABLES)).toBe('El asunto debe ir en una sola línea');
    expect(errorDelAsunto('Vence en {{ dias }} días {{diagnostico}}', VARIABLES)).toBe('Variable no permitida: diagnostico');
  });

  it('cuerpo: obligatorio y TR-CA-185', () => {
    expect(errorDelCuerpo('', VARIABLES)).toBe('El cuerpo es obligatorio');
    expect(errorDelCuerpo('<p>{{diagnostico}} {{otro}}</p>', VARIABLES)).toBe('Variable no permitida: diagnostico, otro');
    expect(errorDelCuerpo('<p>{{dias}}</p>', VARIABLES)).toBeNull();
  });

  it('reparte los nombres del 400 según el campo donde aparecen; los que no aparecen van al cuerpo', () => {
    expect(variablesPorCampo(['a', 'b', 'c'], 'Hola {{a}}', '<p>{{b}}</p>')).toEqual({ asunto: ['a'], cuerpo: ['b', 'c'] });
  });
});
