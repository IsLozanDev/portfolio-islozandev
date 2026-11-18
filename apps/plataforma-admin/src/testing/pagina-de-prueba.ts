import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Session } from '@supabase/supabase-js';
import { CONFIG_AUTH, SesionService, type ContextoUsuario } from '@vitrina/shared/auth';
import { vi } from 'vitest';

export const API_URL = 'https://api.test/v1';

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
  soporte: null,
};

/** Doble de `SesionService` con el estado en signals, como el real; `tiene` para `*siPermiso`. */
class DobleSesion {
  readonly sesion = signal<Session | null>({ user: { email: 'carmen@correo.pe' } } as Session);
  readonly contexto: ReturnType<typeof signal<ContextoUsuario | null>>;

  constructor(permisos: string[]) {
    this.contexto = signal<ContextoUsuario | null>({ ...CONTEXTO_DE_PRUEBA, permisos });
  }

  tiene(permisoOPermisos: string | readonly string[]): boolean {
    const buscados = typeof permisoOPermisos === 'string' ? [permisoOPermisos] : permisoOPermisos;
    return buscados.some((permiso) => this.contexto()?.permisos.includes(permiso) ?? false);
  }
}

/** Monta una página de la app en su ruta con el doble de sesión y HTTP de prueba. */
export class PaginaDePrueba {
  private harness: RouterTestingHarness | null = null;

  constructor(
    private readonly ruta: string,
    private readonly pagina: Type<unknown>,
  ) {}

  async abrir(url: string, permisos: string[] = []): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: this.ruta, pathMatch: 'full', component: this.pagina }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
        { provide: SesionService, useValue: new DobleSesion(permisos) },
      ],
    });
    this.harness = await RouterTestingHarness.create(url);
    await this.estable();
  }

  get http(): HttpTestingController {
    return TestBed.inject(HttpTestingController);
  }

  texto(): string {
    return this.elemento().textContent ?? '';
  }

  elemento(): HTMLElement {
    if (!this.harness) throw new Error('Abrir la página antes de usarla');
    return this.harness.fixture.nativeElement as HTMLElement;
  }

  async estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await vi.waitFor(async () => {
      await this.harness?.fixture.whenStable();
    });
    await this.harness?.fixture.whenStable();
  }
}
