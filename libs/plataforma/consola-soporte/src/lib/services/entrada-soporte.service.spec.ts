import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SesionService } from '@vitrina/shared/auth';
import { vi } from 'vitest';
import { EntradaSoporteService } from './entrada-soporte.service';
import { SoporteAgenteCliente } from './soporte-agente.cliente';

const PAGINA_ACTUAL = 'http://127.0.0.1:4201/consola/soporte';
const URL_ADMINISTRACION = 'http://127.0.0.1:4200';

describe('EntradaSoporteService', () => {
  const pasos: string[] = [];
  const cliente = { entrar: vi.fn(async () => void pasos.push('entrar')) };
  const sesion = { refrescarSesion: vi.fn(async () => void pasos.push('refrescar')) };
  const documento = { location: { href: PAGINA_ACTUAL, assign: vi.fn((url: string) => void pasos.push(`abrir ${url}`)) } };

  beforeEach(() => {
    pasos.length = 0;
    TestBed.configureTestingModule({
      providers: [
        { provide: SoporteAgenteCliente, useValue: cliente },
        { provide: SesionService, useValue: sesion },
        { provide: DOCUMENT, useValue: documento },
      ],
    });
  });

  it('fija el tenant, renueva el token y abre administración con «Volver a»', async () => {
    await TestBed.inject(EntradaSoporteService).entrar('a-1', URL_ADMINISTRACION);

    expect(cliente.entrar).toHaveBeenCalledWith('a-1');
    expect(pasos).toEqual(['entrar', 'refrescar', `abrir ${URL_ADMINISTRACION}/?volverA=${encodeURIComponent(PAGINA_ACTUAL)}`]);
  });

  it('si la API rechaza la entrada no renueva ni navega', async () => {
    cliente.entrar.mockRejectedValueOnce(new Error('no vigente'));

    await expect(TestBed.inject(EntradaSoporteService).entrar('a-1', URL_ADMINISTRACION)).rejects.toThrow('no vigente');
    expect(pasos).toEqual([]);
  });
});
