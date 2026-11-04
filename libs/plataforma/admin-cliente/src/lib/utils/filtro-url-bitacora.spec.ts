import { convertToParamMap } from '@angular/router';
import { diaEnLima, filtroBitacoraDesdeUrl, filtroBitacoraParaUrl, rangoPorDefecto } from './filtro-url-bitacora';

/** 03/11 a las 23:30 en Lima ya es 04/11 en UTC. */
const AHORA = new Date('2026-11-04T04:30:00Z');

describe('filtro de la bitácora en la URL', () => {
  it('el día se toma en Lima, no en UTC', () => {
    expect(diaEnLima(AHORA)).toBe('2026-11-03');
  });

  it('sin rango, la última semana: hoy y los 6 días anteriores', () => {
    expect(rangoPorDefecto(AHORA)).toEqual({ desde: '2026-10-28', hasta: '2026-11-03' });
    expect(filtroBitacoraDesdeUrl(convertToParamMap({}), AHORA)).toEqual({ desde: '2026-10-28', hasta: '2026-11-03', pagina: 1, tamano: 20 });
  });

  it('lee rango, tipo, usuario y página de la URL', () => {
    const parametros = convertToParamMap({ desde: '2026-09-01', hasta: '2026-09-30', tipo: 'ACCESO_SOPORTE', usuario: ' ana ', pagina: '3', tamano: '50' });
    expect(filtroBitacoraDesdeUrl(parametros, AHORA)).toEqual({
      desde: '2026-09-01',
      hasta: '2026-09-30',
      tipo: 'ACCESO_SOPORTE',
      usuario: 'ana',
      pagina: 3,
      tamano: 50,
    });
  });

  it.each([
    ['un tipo fuera del catálogo', { tipo: 'OTRO' }, { tipo: undefined }],
    ['un usuario de 1 carácter', { usuario: 'a' }, { usuario: undefined }],
    ['un rango incompleto', { desde: '2026-09-01' }, { desde: '2026-10-28', hasta: '2026-11-03' }],
    ['un rango mal escrito', { desde: '01/09/2026', hasta: '2026-09-30' }, { desde: '2026-10-28', hasta: '2026-11-03' }],
  ])('%s se ignora', (_caso, parametros, esperado) => {
    expect(filtroBitacoraDesdeUrl(convertToParamMap(parametros), AHORA)).toMatchObject(esperado);
  });

  it('a la URL: el rango siempre va; lo vacío, la primera página y el tamaño por defecto, no', () => {
    expect(filtroBitacoraParaUrl({ desde: '2026-10-28', hasta: '2026-11-03', pagina: 1, tamano: 20 })).toEqual({
      desde: '2026-10-28',
      hasta: '2026-11-03',
      tipo: null,
      usuario: null,
      pagina: null,
      tamano: null,
    });
    expect(filtroBitacoraParaUrl({ desde: '2026-10-28', hasta: '2026-11-03', tipo: 'ACCESO_DENEGADO', usuario: 'ana', pagina: 2, tamano: 50 })).toMatchObject({
      tipo: 'ACCESO_DENEGADO',
      usuario: 'ana',
      pagina: 2,
      tamano: 50,
    });
  });
});
