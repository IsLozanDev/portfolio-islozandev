import { Component, signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, MfaService, SesionService, type EnrolamientoTotp, type RutasAuth } from '@vitrina/shared/auth';
import { vi } from 'vitest';
import type { EstadoInvitacion, InvitacionAceptada } from '../lib/models/invitacion';
import { InvitacionCliente } from '../lib/services/invitacion.cliente';

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
  readonly autenticado = signal(false);
  readonly ingresarConClave = vi.fn<(correo: string, clave: string) => Promise<void>>(async () => undefined);
  readonly ingresarConProveedor = vi.fn<(proveedor: string, retorno?: string) => Promise<void>>(async () => undefined);
  readonly completarCallback = vi.fn(async (): Promise<void> => undefined);
  readonly recuperarClave = vi.fn<(correo: string) => Promise<void>>(async () => undefined);
  readonly verificarEnlace = vi.fn<(tokenHash: string, tipo: string) => Promise<void>>(async () => undefined);
  readonly actualizarClave = vi.fn<(nueva: string) => Promise<void>>(async () => undefined);
  readonly salir = vi.fn(async (): Promise<void> => undefined);
  readonly refrescarSesion = vi.fn(async (): Promise<void> => undefined);
}

export const ENROLAMIENTO_DE_PRUEBA: EnrolamientoTotp = {
  factorId: 'factor-nuevo',
  qr: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"/>',
  secreto: 'JBSWY3DPEHPK3PXP',
};

export const INVITACION_DE_PRUEBA: EstadoInvitacion = {
  estado: 'VIGENTE',
  tenantNombre: 'Sazón Miraflores',
  expiraEn: new Date('2026-10-29T15:00:00.000Z'),
};

export class DobleInvitacion {
  readonly consultar = vi.fn<(token: string) => Promise<EstadoInvitacion>>(async () => INVITACION_DE_PRUEBA);
  readonly aceptar = vi.fn<(token: string) => Promise<InvitacionAceptada>>(async () => ({
    tenantId: 't-1',
    membresiaId: 'm-1',
    refrescarSesion: true,
  }));
}

export class DobleMfa {
  readonly requiereVerificacion = vi.fn(async (): Promise<boolean> => false);
  readonly estado = vi.fn(async () => ({ nivelActual: 'aal1', nivelSiguiente: 'aal2', factorTotpId: 'factor-1' as string | null }));
  readonly enrolarTotp = vi.fn(async (): Promise<EnrolamientoTotp> => ENROLAMIENTO_DE_PRUEBA);
  readonly verificarTotp = vi.fn<(factorId: string, codigo: string) => Promise<void>>(async () => undefined);
}

/** Monta una página en su ruta real con dobles de sesión y MFA; el resto de rutas cae en una página vacía. */
export class PaginaDePrueba {
  readonly sesion = new DobleSesion();
  readonly mfa = new DobleMfa();
  readonly invitaciones = new DobleInvitacion();
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
        { provide: InvitacionCliente, useValue: this.invitaciones },
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
