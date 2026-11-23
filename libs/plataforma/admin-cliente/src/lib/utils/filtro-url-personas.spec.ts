import { convertToParamMap } from '@angular/router';
import { criteriosDeFiltroPersonas, filtroPersonasDesdeUrl, parametrosDeFiltroPersonas } from './filtro-url-personas';

describe('filtro de personas en la URL', () => {
  it('lee búsqueda, tipo, producto, rol, página y tamaño', () => {
    const filtro = filtroPersonasDesdeUrl(convertToParamMap({ q: ' baldiviezo ', tipo: 'NATURAL', producto: 'CLI', rol: 'PACIENTE', pagina: '2', tamano: '50' }));
    expect(filtro).toEqual({ q: 'baldiviezo', tipoPersona: 'NATURAL', producto: 'CLI', rol: 'PACIENTE', pagina: 2, tamano: 50 });
  });

  it('un valor fuera de lista se ignora', () => {
    const filtro = filtroPersonasDesdeUrl(convertToParamMap({ tipo: 'OTRA', producto: 'XYZ', rol: 'JEFE', pagina: '0' }));
    expect(filtro).toEqual({ q: '', tipoPersona: null, producto: null, rol: null, pagina: 1, tamano: 20 });
  });

  it('lo vacío y la primera página quedan fuera de la URL; la ida y vuelta conserva el filtro', () => {
    const vacio = filtroPersonasDesdeUrl(convertToParamMap({}));
    expect(parametrosDeFiltroPersonas(vacio)).toEqual({ q: null, tipo: null, producto: null, rol: null, pagina: null, tamano: null });

    const filtro = { q: 'quispe', tipoPersona: 'NATURAL', producto: 'GYM', rol: 'SOCIO', pagina: 3, tamano: 50 } as const;
    const parametros = Object.fromEntries(Object.entries(parametrosDeFiltroPersonas(filtro)).map(([clave, valor]) => [clave, String(valor)]));
    expect(filtroPersonasDesdeUrl(convertToParamMap(parametros))).toEqual(filtro);
  });

  it('pasa a criterios del listado sin los filtros vacíos', () => {
    expect(criteriosDeFiltroPersonas({ q: '', tipoPersona: null, producto: 'CLI', rol: null, pagina: 1, tamano: 20 })).toEqual({
      q: undefined,
      tipoPersona: undefined,
      producto: 'CLI',
      rol: undefined,
      pagina: 1,
      tamano: 20,
    });
  });
});
