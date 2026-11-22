import type { Categoria } from '../models/categoria';
import { MENSAJES_VALIDACION_ARCHIVO, validarArchivo } from './validar-archivo';

const MEGABYTE = 1024 * 1024;
const IMAGEN: Categoria = { codigo: 'IMAGEN', mimesPermitidos: ['image/jpeg', 'image/png'], tamanoMaxBytes: 10 * MEGABYTE };

const archivoDe = (bytes: number, tipo: string) => new File([new Uint8Array(bytes)], 'foto', { type: tipo });

describe('validarArchivo', () => {
  it('acepta un MIME de la categoría dentro del máximo, incluido el máximo exacto', () => {
    expect(validarArchivo(archivoDe(1024, 'image/png'), IMAGEN)).toBeNull();
    expect(validarArchivo(archivoDe(IMAGEN.tamanoMaxBytes, 'image/jpeg'), IMAGEN)).toBeNull();
  });

  it('rechaza un MIME fuera de la categoría', () => {
    expect(validarArchivo(archivoDe(1024, 'application/x-msdownload'), IMAGEN)).toEqual({ motivo: 'MIME', mensaje: MENSAJES_VALIDACION_ARCHIVO.mime });
  });

  it('rechaza un archivo vacío antes que su tipo', () => {
    expect(validarArchivo(archivoDe(0, ''), IMAGEN)).toEqual({ motivo: 'VACIO', mensaje: MENSAJES_VALIDACION_ARCHIVO.vacio });
  });

  it('rechaza uno mayor que el máximo con el máximo de la categoría en el mensaje', () => {
    expect(validarArchivo(archivoDe(11 * MEGABYTE, 'image/png'), IMAGEN)).toEqual({ motivo: 'TAMANO', mensaje: 'El archivo supera el máximo de 10 MB' });
  });
});
