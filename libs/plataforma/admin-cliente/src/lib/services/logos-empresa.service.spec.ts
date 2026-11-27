import { TestBed } from '@angular/core/testing';
import { ArchivosCliente, type UrlDescarga } from '@vitrina/plataforma/archivos-ui';
import { SesionService } from '@vitrina/shared/auth';
import { vi } from 'vitest';
import { DobleSesion } from '../../testing/doble-sesion';
import { LogosEmpresaService } from './logos-empresa.service';

const AHORA = new Date('2026-11-27T15:00:00Z');
const DESCARGAR = 'plat.archivo.descargar';

const firmada = (archivoId: string, segundosDeVida: number): UrlDescarga => ({
  url: `https://storage.ejemplo/${archivoId}?firma=${segundosDeVida}`,
  expiraEn: new Date(AHORA.getTime() + segundosDeVida * 1000).toISOString(),
});

describe('LogosEmpresaService', () => {
  let servicio: LogosEmpresaService;
  let sesion: DobleSesion;
  const urlDescarga = vi.fn<(archivoId: string) => Promise<UrlDescarga>>();

  beforeEach(() => {
    vi.useFakeTimers({ now: AHORA, toFake: ['Date'] });
    urlDescarga.mockReset();
    urlDescarga.mockImplementation(async (archivoId) => firmada(archivoId, 900));
    sesion = new DobleSesion().conPermisos(DESCARGAR);
    TestBed.configureTestingModule({
      providers: [
        { provide: ArchivosCliente, useValue: { urlDescarga } },
        { provide: SesionService, useValue: sesion },
      ],
    });
    servicio = TestBed.inject(LogosEmpresaService);
  });

  afterEach(() => vi.useRealTimers());

  it('pide la URL firmada del logo y la reutiliza mientras no esté por vencer', async () => {
    await expect(servicio.url('logo-1')).resolves.toBe(firmada('logo-1', 900).url);
    await servicio.url('logo-1');

    expect(urlDescarga).toHaveBeenCalledTimes(1);
  });

  it('comparte la petición en curso: la lista no pide dos veces el mismo logo', async () => {
    await Promise.all([servicio.url('logo-1'), servicio.url('logo-1')]);
    expect(urlDescarga).toHaveBeenCalledTimes(1);
  });

  it('una URL a menos de 30 s de vencer se vuelve a pedir', async () => {
    urlDescarga.mockResolvedValueOnce(firmada('logo-1', 20));
    await servicio.url('logo-1');
    await servicio.url('logo-1');

    expect(urlDescarga).toHaveBeenCalledTimes(2);
  });

  it('sin logo o sin plat.archivo.descargar no pide nada y da null', async () => {
    await expect(servicio.url(null)).resolves.toBeNull();

    sesion.conPermisos('plat.organizacion.consultar');
    expect(servicio.puedeVer()).toBe(false);
    await expect(servicio.url('logo-1')).resolves.toBeNull();
    expect(urlDescarga).not.toHaveBeenCalled();
  });

  it('si ARC no entrega el logo da null, sin lanzar, y lo vuelve a intentar después', async () => {
    urlDescarga.mockRejectedValueOnce(new Error('ARCHIVO_NO_DISPONIBLE'));

    await expect(servicio.url('logo-1')).resolves.toBeNull();
    await expect(servicio.url('logo-1')).resolves.toBe(firmada('logo-1', 900).url);
  });
});
