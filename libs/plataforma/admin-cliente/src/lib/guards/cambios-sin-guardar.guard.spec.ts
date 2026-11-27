import { TestBed } from '@angular/core/testing';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import type { ConCambiosSinGuardar } from '../models/con-cambios-sin-guardar';
import { MENSAJES_CAMBIOS_SIN_GUARDAR } from '../models/mensajes-admin';
import { cambiosSinGuardarGuard } from './cambios-sin-guardar.guard';

describe('cambiosSinGuardarGuard', () => {
  const confirmar = vi.fn(async () => true);

  beforeEach(() => {
    confirmar.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: AvisosService, useValue: { confirmar } }] });
  });

  const salir = (conCambios: boolean) => {
    const pagina: ConCambiosSinGuardar = { tieneCambiosSinGuardar: () => conCambios };
    const sinUso = {} as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => cambiosSinGuardarGuard(pagina, sinUso, {} as RouterStateSnapshot, {} as RouterStateSnapshot));
  };

  it('sin cambios sale directo, sin preguntar', () => {
    expect(salir(false)).toBe(true);
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('con cambios pide confirmación y sale solo si se confirma', async () => {
    await expect(salir(true)).resolves.toBe(true);
    expect(confirmar).toHaveBeenCalledWith({
      titulo: MENSAJES_CAMBIOS_SIN_GUARDAR.titulo,
      texto: MENSAJES_CAMBIOS_SIN_GUARDAR.texto,
      textoConfirmar: MENSAJES_CAMBIOS_SIN_GUARDAR.salir,
      textoCancelar: MENSAJES_CAMBIOS_SIN_GUARDAR.seguir,
    });

    confirmar.mockResolvedValueOnce(false);
    await expect(salir(true)).resolves.toBe(false);
  });
});
