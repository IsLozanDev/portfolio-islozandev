import { vi } from 'vitest';
import { descargarArchivo, nombreDeArchivo } from './descarga';

describe('nombreDeArchivo', () => {
  it.each([
    ['attachment; filename="bitacora-20261027-20261102.xlsx"', 'bitacora-20261027-20261102.xlsx'],
    ['attachment; filename=bitacora.xlsx', 'bitacora.xlsx'],
    ['attachment', null],
    [null, null],
  ])('%s da %s', (cabecera, esperado) => {
    expect(nombreDeArchivo(cabecera)).toBe(esperado);
  });
});

describe('descargarArchivo', () => {
  it('hace clic en un enlace temporal con el nombre y libera la URL del blob', () => {
    const crear = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:prueba');
    const liberar = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('bitacora.xlsx');
      expect(this.href).toBe('blob:prueba');
    });

    descargarArchivo(document, new Blob(['x']), 'bitacora.xlsx');

    expect(clic).toHaveBeenCalledOnce();
    expect(liberar).toHaveBeenCalledWith('blob:prueba');
    expect(document.querySelector('a[download]')).toBeNull();
    crear.mockRestore();
    liberar.mockRestore();
    clic.mockRestore();
  });
});
