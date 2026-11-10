import { signal } from '@angular/core';
import type { ContextoUsuario } from '@vitrina/shared/auth';
import { vi } from 'vitest';

export const RUTA_PROHIBIDO = '/403';

/** Lo que usan las páginas del contexto; las sucursales solo las piden los filtros que las listan (spec 20c). */
type ContextoDePrueba = Pick<ContextoUsuario, 'permisos' | 'mfaVigente'> & Partial<Pick<ContextoUsuario, 'sucursales'>>;

/** Doble de `SesionService` con lo que usan `permisoGuard`, `*siPermiso` y el step-up: sesión, permisos y MFA. */
export class DobleSesion {
  readonly contexto = signal<ContextoDePrueba | null>({ permisos: [], mfaVigente: false });
  readonly autenticado = signal(true);
  readonly iniciar = vi.fn(async (): Promise<void> => undefined);

  conPermisos(...permisos: string[]): this {
    this.contexto.set({ permisos, mfaVigente: this.contexto()?.mfaVigente ?? false });
    return this;
  }

  tiene(permisoOPermisos: string | readonly string[]): boolean {
    const buscados = typeof permisoOPermisos === 'string' ? [permisoOPermisos] : permisoOPermisos;
    return buscados.some((permiso) => this.contexto()?.permisos.includes(permiso) ?? false);
  }
}
