import type { Categoria } from '../models/categoria';
import { validarArchivo } from './validar-archivo';

const MEGABYTE = 1024 * 1024;
const IMAGEN: Categoria = { codigo: 'IMAGEN', mimesPermitidos: ['image/jpeg', 'image/png', 'image/webp'], tamanoMaxBytes: 10 * MEGABYTE };

const archivoDe = (bytes: number, tipo: string, nombre = 'foto.png') => new File([new Uint8Array(bytes)], nombre, { type: tipo });

describe('validarArchivo', () => {
  it('acepta un MIME de la categoría dentro del máximo, incluido el máximo exacto', () => {
    expect(validarArchivo(archivoDe(1024, 'image/png'), IMAGEN)).toBeNull();
    expect(validarArchivo(archivoDe(IMAGEN.tamanoMaxBytes, 'image/jpeg'), IMAGEN)).toBeNull();
  });

  it('rechaza un MIME fuera de la categoría con el nombre y los tipos permitidos', () => {
    expect(validarArchivo(archivoDe(1024, 'application/x-msdownload', 'instalador.exe'), IMAGEN)).toEqual({
      motivo: 'MIME',
      mensaje: 'Tipo de archivo no permitido: «instalador.exe». Solo JPG, PNG o WEBP.',
    });
  });

  it('rechaza un archivo vacío antes que su tipo', () => {
    expect(validarArchivo(archivoDe(0, '', 'vacio.txt'), IMAGEN)).toEqual({ motivo: 'VACIO', mensaje: 'El archivo «vacio.txt» está vacío.' });
  });

  it('rechaza uno mayor que el máximo con el máximo de la categoría en el mensaje', () => {
    expect(validarArchivo(archivoDe(11 * MEGABYTE, 'image/png'), IMAGEN)).toEqual({ motivo: 'TAMANO', mensaje: 'El archivo «foto.png» supera el máximo de 10 MB.' });
  });
});
