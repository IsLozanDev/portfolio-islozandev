import { Component, signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Session } from '@supabase/supabase-js';
import { CONFIG_AUTH, SesionService, type ContextoUsuario, type OpcionesCargaContexto, type RutasAuth } from '@vitrina/shared/auth';
import { vi } from 'vitest';

export const RUTAS_DE_PRUEBA: RutasAuth = {
  ingresar: '/auth/ingresar',
  mfa: '/auth/mfa',
  callback: '/auth/callback',
  nuevaClave: '/auth/nueva-clave',
  seleccionarSucursal: '/seleccionar-sucursal',
  sinAccesos: '/sin-accesos',
  prohibido: '/403',
  inicio: '/',
};

export const MIRAFLORES = { id: 'sucursal-miraflores', empresaId: 'empresa-1', codigo: 'MIR', nombre: 'Miraflores' };
export const SURCO = { id: 'sucursal-surco', empresaId: 'empresa-1', codigo: 'SUR', nombre: 'Surco' };

export function contextoDePrueba(cambios: Partial<ContextoUsuario> = {}): ContextoUsuario {
  return {
    usuarioId: 'u-1',
    tenantId: 't-1',
    tipoUsuario: 'EXTERNO',
    aal: 'aal1',
    mfaVigente: false,
    mfaEn: null,
    sucursales: [MIRAFLORES, SURCO],
    sucursalActual: MIRAFLORES.id,
    requiereSeleccion: false,
    sinAccesos: false,
    permisos: [],
    menu: [],
    ...cambios,
  };
}

@Component({ template: '' })
class DestinoDePrueba {}

/** Doble de `SesionService` con el estado en signals, como el real. */
export class DobleSesion {
  readonly sesion = signal<Session | null>({ user: { email: 'carmen@correo.pe' } } as Session);
  readonly contexto = signal<ContextoUsuario | null>(contextoDePrueba());
  readonly salir = vi.fn(async (): Promise<void> => undefined);
  readonly cargarContexto = vi.fn<(sucursalId?: string, opciones?: OpcionesCargaContexto) => Promise<ContextoUsuario>>(async () => contextoDePrueba());
  readonly seleccionarSucursal = vi.fn<(sucursalId: string, opciones?: OpcionesCargaContexto) => Promise<void>>(async () => undefined);
}

/** Monta una página de la app en su ruta con el doble de sesión; el resto de rutas cae en una página vacía. */
export class PaginaDePrueba {
  readonly sesion = new DobleSesion();
  private harness: RouterTestingHarness | null = null;

  constructor(
    private readonly ruta: string,
    private readonly pagina: Type<unknown>,
  ) {}

  async abrir(url: string): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: this.ruta, pathMatch: 'full', component: this.pagina },
          { path: '**', component: DestinoDePrueba },
        ]),
        { provide: SesionService, useValue: this.sesion },
        { provide: CONFIG_AUTH, useValue: { rutas: RUTAS_DE_PRUEBA } },
      ],
    });
    this.harness = await RouterTestingHarness.create(url);
    await this.estable();
  }

  get elemento(): HTMLElement {
    if (!this.harness) throw new Error('Abrir la página antes de usarla');
    return this.harness.fixture.nativeElement as HTMLElement;
  }

  urlActual(): string {
    return TestBed.inject(Router).url;
  }

  texto(): string {
    return this.elemento.textContent ?? '';
  }

  textoDe(selector: string): string | undefined {
    return this.elemento.querySelector(selector)?.textContent?.trim();
  }

  async pulsar(textoDelBoton: string): Promise<void> {
    const candidatos = [...this.elemento.querySelectorAll<HTMLElement>('button, a')];
    const boton = candidatos.find((candidato) => candidato.textContent?.trim() === textoDelBoton);
    if (!boton) throw new Error(`No hay botón «${textoDelBoton}»`);
    boton.click();
    await this.estable();
  }

  async estable(): Promise<void> {
    await vi.waitFor(async () => {
      await this.harness?.fixture.whenStable();
    });
    await this.harness?.fixture.whenStable();
  }
}
