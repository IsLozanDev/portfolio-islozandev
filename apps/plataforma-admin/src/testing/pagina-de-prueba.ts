import { signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Session } from '@supabase/supabase-js';
import { SesionService, type ContextoUsuario } from '@vitrina/shared/auth';
import { vi } from 'vitest';

const MIRAFLORES = { id: 'sucursal-miraflores', empresaId: 'empresa-1', codigo: 'MIR', nombre: 'Miraflores' };
const SURCO = { id: 'sucursal-surco', empresaId: 'empresa-1', codigo: 'SUR', nombre: 'Surco' };

const CONTEXTO_DE_PRUEBA: ContextoUsuario = {
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
};

/** Doble de `SesionService` con el estado en signals, como el real. */
class DobleSesion {
  readonly sesion = signal<Session | null>({ user: { email: 'carmen@correo.pe' } } as Session);
  readonly contexto = signal<ContextoUsuario | null>(CONTEXTO_DE_PRUEBA);
}

/** Monta una página de la app en su ruta con el doble de sesión. */
export class PaginaDePrueba {
  private harness: RouterTestingHarness | null = null;

  constructor(
    private readonly ruta: string,
    private readonly pagina: Type<unknown>,
  ) {}

  async abrir(url: string): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: this.ruta, pathMatch: 'full', component: this.pagina }]),
        { provide: SesionService, useValue: new DobleSesion() },
      ],
    });
    this.harness = await RouterTestingHarness.create(url);
    await this.estable();
  }

  texto(): string {
    if (!this.harness) throw new Error('Abrir la página antes de usarla');
    const elemento = this.harness.fixture.nativeElement as HTMLElement;
    return elemento.textContent ?? '';
  }

  private async estable(): Promise<void> {
    await vi.waitFor(async () => {
      await this.harness?.fixture.whenStable();
    });
    await this.harness?.fixture.whenStable();
  }
}
