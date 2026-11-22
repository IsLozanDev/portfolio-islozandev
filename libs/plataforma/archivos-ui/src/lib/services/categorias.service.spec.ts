import { TestBed } from '@angular/core/testing';
import type { Categoria } from '../models/categoria';
import { ArchivosCliente } from './archivos.cliente';
import { CategoriasService } from './categorias.service';

const DOCUMENTO: Categoria = { codigo: 'DOCUMENTO', mimesPermitidos: ['application/pdf'], tamanoMaxBytes: 100 };
const IMAGEN: Categoria = { codigo: 'IMAGEN', mimesPermitidos: ['image/png'], tamanoMaxBytes: 50 };

describe('CategoriasService', () => {
  let servicio: CategoriasService;
  let categorias: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    categorias = vi.fn(async () => [DOCUMENTO, IMAGEN]);
    TestBed.configureTestingModule({ providers: [{ provide: ArchivosCliente, useValue: { categorias } }] });
    servicio = TestBed.inject(CategoriasService);
  });

  it('pide las categorías una sola vez, aunque se carguen a la vez, y las deja en el signal', async () => {
    expect(servicio.categorias()).toBeNull();

    const [primera, segunda] = await Promise.all([servicio.cargar(), servicio.cargar()]);
    await servicio.cargar();

    expect(categorias).toHaveBeenCalledTimes(1);
    expect(primera).toEqual([DOCUMENTO, IMAGEN]);
    expect(segunda).toBe(primera);
    expect(servicio.categorias()).toEqual([DOCUMENTO, IMAGEN]);
  });

  it('buscar devuelve la categoría por código o undefined', async () => {
    expect(await servicio.buscar('IMAGEN')).toEqual(IMAGEN);
    expect(await servicio.buscar('OTRA')).toBeUndefined();
  });

  it('si la petición falla, la siguiente carga reintenta', async () => {
    categorias.mockRejectedValueOnce(new Error('sin red'));

    await expect(servicio.cargar()).rejects.toThrow('sin red');
    expect(await servicio.cargar()).toEqual([DOCUMENTO, IMAGEN]);
    expect(categorias).toHaveBeenCalledTimes(2);
  });
});
