import { signal } from '@angular/core';
import type { ContextoUsuario } from '@vitrina/shared/auth';
import { vi } from 'vitest';

/** Doble de `SesionService` con lo que usan `*siPermiso` y la página: sesión y permisos. */
export class DobleSesion {
  readonly contexto = signal<Pick<ContextoUsuario, 'permisos' | 'mfaVigente'> | null>({ permisos: [], mfaVigente: true });
  readonly autenticado = signal(true);
  readonly iniciar = vi.fn(async (): Promise<void> => undefined);

  conPermisos(...permisos: string[]): this {
    this.contexto.set({ permisos, mfaVigente: true });
    return this;
  }

  tiene(permisoOPermisos: string | readonly string[]): boolean {
    const buscados = typeof permisoOPermisos === 'string' ? [permisoOPermisos] : permisoOPermisos;
    return buscados.some((permiso) => this.contexto()?.permisos.includes(permiso) ?? false);
  }
}
