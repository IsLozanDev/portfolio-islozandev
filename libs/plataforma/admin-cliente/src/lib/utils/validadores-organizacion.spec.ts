import { FormControl } from '@angular/forms';
import { completarEsquemaWeb, ERROR_SITIO_WEB, validarSitioWeb } from './validadores-organizacion';

describe('validadores de organización: sitio web (spec 17d)', () => {
  it.each([
    ['www.empresa.pe', 'https://www.empresa.pe'],
    ['  empresa.pe/tienda ', 'https://empresa.pe/tienda'],
    ['https://empresa.pe', 'https://empresa.pe'],
    ['http://empresa.pe', 'http://empresa.pe'],
    ['', ''],
    ['   ', ''],
  ])('completarEsquemaWeb(«%s») es «%s»', (escrito, completo) => {
    expect(completarEsquemaWeb(escrito)).toBe(completo);
  });

  it.each([
    ['', null],
    ['https://ejemplo.pe', null],
    ['http://empresa.pe', { [ERROR_SITIO_WEB]: true }],
    ['www.empresa.pe', { [ERROR_SITIO_WEB]: true }],
    ['https://', { [ERROR_SITIO_WEB]: true }],
    ['https://mi empresa.pe', { [ERROR_SITIO_WEB]: true }],
  ])('validarSitioWeb(«%s»)', (sitio, errores) => {
    expect(validarSitioWeb(new FormControl(sitio, { nonNullable: true }))).toEqual(errores);
  });
});
