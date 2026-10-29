import { Component, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CONFIG_AUTH, SesionService, type ContextoUsuario } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { MENSAJES_SHELL } from '../models/mensajes-shell';
import { AccionSensibleService } from './accion-sensible.service';

const RUTA_MFA = '/auth/mfa';

@Component({ template: '' })
class Destino {}

describe('AccionSensibleService', () => {
  let sesion: { contexto: WritableSignal<Pick<ContextoUsuario, 'mfaVigente'> | null> };
  let avisos: { advertencia: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(async () => {
    sesion = { contexto: signal<Pick<ContextoUsuario, 'mfaVigente'> | null>({ mfaVigente: false }) };
    avisos = { advertencia: vi.fn(async () => undefined) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Destino }]),
        { provide: SesionService, useValue: sesion },
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { rutas: { mfa: RUTA_MFA } } },
      ],
    });
    router = TestBed.inject(Router);
    await router.navigateByUrl('/admin/usuarios/m-luis');
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  it('con MFA vigente deja seguir sin avisar ni navegar', async () => {
    sesion.contexto.set({ mfaVigente: true });

    await expect(TestBed.inject(AccionSensibleService).exigirMfa()).resolves.toBe(true);

    expect(avisos.advertencia).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('sin MFA vigente avisa y lleva a /auth/mfa con la ruta actual como retorno', async () => {
    await expect(TestBed.inject(AccionSensibleService).exigirMfa()).resolves.toBe(false);

    expect(avisos.advertencia).toHaveBeenCalledWith(MENSAJES_SHELL.tituloMfaRequerida, MENSAJES_SHELL.mfaRequerida);
    expect(router.navigate).toHaveBeenCalledWith([RUTA_MFA], { queryParams: { returnUrl: '/admin/usuarios/m-luis' } });
  });
});
