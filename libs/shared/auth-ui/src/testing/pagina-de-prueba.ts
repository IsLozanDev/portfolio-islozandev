import { Component, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, MfaService, SesionService, type RutasAuth } from '@vitrina/shared/auth';
import { vi } from 'vitest';

const RUTAS_DE_PRUEBA: RutasAuth = {
  ingresar: '/auth/ingresar',
  mfa: '/auth/mfa',
  callback: '/auth/callback',
  nuevaClave: '/auth/nueva-clave',
  seleccionarSucursal: '/seleccionar-sucursal',
  sinAccesos: '/sin-accesos',
  prohibido: '/403',
  inicio: '/',
};

@Component({ template: '' })
class DestinoDePrueba {}

/** Doble de `SesionService` con solo lo que usan las páginas. */
export class DobleSesion {
  readonly ingresarConClave = vi.fn<(correo: string, clave: string) => Promise<void>>(async () => undefined);
  readonly ingresarConProveedor = vi.fn<(proveedor: string, retorno?: string) => Promise<void>>(async () => undefined);
  readonly completarCallback = vi.fn(async (): Promise<void> => undefined);
  readonly recuperarClave = vi.fn<(correo: string) => Promise<void>>(async () => undefined);
  readonly verificarEnlace = vi.fn<(tokenHash: string, tipo: string) => Promise<void>>(async () => undefined);
  readonly actualizarClave = vi.fn<(nueva: string) => Promise<void>>(async () => undefined);
}

export class DobleMfa {
  readonly requiereVerificacion = vi.fn(async (): Promise<boolean> => false);
}

/** Monta una página en su ruta real con dobles de sesión y MFA; el resto de rutas cae en una página vacía. */
export class PaginaDePrueba {
  readonly sesion = new DobleSesion();
  readonly mfa = new DobleMfa();
  private harness: RouterTestingHarness | null = null;

  constructor(
    private readonly ruta: string,
    private readonly pagina: Type<unknown>,
  ) {}

  async abrir(url: string): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: this.ruta, component: this.pagina },
          { path: '**', component: DestinoDePrueba },
        ]),
        { provide: SesionService, useValue: this.sesion },
        { provide: MfaService, useValue: this.mfa },
        { provide: CONFIG_AUTH, useValue: { rutas: RUTAS_DE_PRUEBA } },
      ],
    });
    this.harness = await RouterTestingHarness.create(url);
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

  escribir(selector: string, valor: string): void {
    const campo = this.buscar<HTMLInputElement>(selector);
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
  }

  async pulsar(textoDelBoton: string): Promise<void> {
    const boton = [...this.elemento.querySelectorAll('button')].find((candidato) => candidato.textContent?.trim() === textoDelBoton);
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

  private buscar<T extends Element>(selector: string): T {
    const elemento = this.elemento.querySelector<T>(selector);
    if (!elemento) throw new Error(`No hay elemento ${selector}`);
    return elemento;
  }
}
