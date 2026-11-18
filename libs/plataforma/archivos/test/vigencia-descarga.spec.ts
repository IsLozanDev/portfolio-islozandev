import {
  AccesoEntidadDenegadoError,
  AlmacenNoDisponibleError,
  ArchivoNoDisponibleError,
  ArchivoNoEncontradoError,
  CategoriaDesconocidaError,
  VigenciaInvalidaError,
} from '../src/domain/errores.js';
import {
  resolverVigenciaDescarga,
  VIGENCIA_MAXIMA_SEGUNDOS,
  VIGENCIA_MINIMA_SEGUNDOS,
} from '../src/domain/vigencia-descarga.js';

describe('resolverVigenciaDescarga', () => {
  it('sin valor usa la máxima: 15 minutos', () => {
    expect(resolverVigenciaDescarga()).toBe(900);
    expect(VIGENCIA_MAXIMA_SEGUNDOS).toBe(900);
  });

  it.each([VIGENCIA_MINIMA_SEGUNDOS, 300, VIGENCIA_MAXIMA_SEGUNDOS])('admite %i segundos', (vigencia) => {
    expect(resolverVigenciaDescarga(vigencia)).toBe(vigencia);
  });

  it.each([59, 901, 0, -60, 120.5, Number.NaN])('rechaza %d segundos con VIGENCIA_INVALIDA', (vigencia) => {
    expect(() => resolverVigenciaDescarga(vigencia)).toThrow(VigenciaInvalidaError);
  });
});

describe('errores de archivos', () => {
  it('llevan el código que la API devuelve', () => {
    expect(new CategoriaDesconocidaError().code).toBe('CATEGORIA_DESCONOCIDA');
    expect(new VigenciaInvalidaError(60, 900).code).toBe('VIGENCIA_INVALIDA');
    expect(new ArchivoNoEncontradoError().code).toBe('NO_ENCONTRADO');
    expect(new AccesoEntidadDenegadoError().code).toBe('ACCESO_ENTIDAD_DENEGADO');
    expect(new AlmacenNoDisponibleError().code).toBe('ALMACEN_NO_DISPONIBLE');
  });

  it('el archivo no disponible lleva su estado', () => {
    expect(new ArchivoNoDisponibleError('CUARENTENA')).toMatchObject({ code: 'ARCHIVO_NO_DISPONIBLE', estado: 'CUARENTENA' });
  });

  it('el almacén caído lleva solo el código del origen', () => {
    expect(new AlmacenNoDisponibleError('StorageUnknownError')).toMatchObject({ codigoOrigen: 'StorageUnknownError' });
  });
});
