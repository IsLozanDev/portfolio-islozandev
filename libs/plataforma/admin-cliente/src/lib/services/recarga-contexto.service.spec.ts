import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SesionService } from '@vitrina/shared/auth';
import { vi } from 'vitest';
import { RecargaContextoService } from './recarga-contexto.service';

describe('RecargaContextoService', () => {
  let sesion: { sucursalId: ReturnType<typeof signal<string | null>>; cargarContexto: ReturnType<typeof vi.fn> };
  let recarga: RecargaContextoService;

  beforeEach(() => {
    sesion = { sucursalId: signal<string | null>('s-centro'), cargarContexto: vi.fn(async () => undefined) };
    TestBed.configureTestingModule({ providers: [{ provide: SesionService, useValue: sesion }] });
    recarga = TestBed.inject(RecargaContextoService);
  });

  it('TR-CA-007: recarga mi-contexto con la sucursal de trabajo y sin aviso de error', async () => {
    await recarga.recargar();
    expect(sesion.cargarContexto).toHaveBeenCalledWith('s-centro', { omitirAvisoError: true });
  });

  it('si se inactivó la sucursal de trabajo, recarga sin sucursal', async () => {
    await recarga.recargar('s-centro');
    expect(sesion.cargarContexto).toHaveBeenCalledWith(undefined, { omitirAvisoError: true });
  });

  it('inactivar otra sucursal conserva la de trabajo', async () => {
    await recarga.recargar('s-cayma');
    expect(sesion.cargarContexto).toHaveBeenCalledWith('s-centro', { omitirAvisoError: true });
  });

  it('un fallo de la recarga no se propaga: el cambio ya se guardó', async () => {
    sesion.cargarContexto.mockRejectedValueOnce(new Error('sin conexión'));
    await expect(recarga.recargar()).resolves.toBeUndefined();
  });
});
