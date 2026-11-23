import type { ComponentFixture } from '@angular/core/testing';
import { SesionService } from '@vitrina/shared/auth';
import { AvisosService, PanelLateralService, type ResultadoConfirmacionDestructiva } from '@vitrina/shared/ui';
import { of } from 'rxjs';
import type { CambioFicha, ResultadoPanelFicha } from '../lib/models/ficha';

/**
 * Dobles de lo que usa una sección de la ficha: permisos del usuario, el panel lateral (devuelve el resultado
 * que fije la prueba) y la confirmación destructiva (acepta por defecto).
 */
export function dependenciasDeFicha(permisos: Set<string>) {
  const panel = { resultado: undefined as ResultadoPanelFicha | undefined, abrir: vi.fn() };
  panel.abrir.mockImplementation(() => ({ afterClosed: () => of(panel.resultado) }));
  const avisos = {
    confirmarDestructiva: vi.fn(async (): Promise<ResultadoConfirmacionDestructiva> => ({ confirmado: true, motivo: null })),
    toast: vi.fn(),
  };
  return {
    panel,
    avisos,
    proveedores: [
      { provide: SesionService, useValue: { tiene: (permiso: string) => permisos.has(permiso) } },
      { provide: PanelLateralService, useValue: panel },
      { provide: AvisosService, useValue: avisos },
    ],
  };
}

/** Los `cambio` que emite la sección. */
export function cambiosDe(fixture: ComponentFixture<{ cambio: { subscribe(alEmitir: (cambio: CambioFicha) => void): unknown } }>): CambioFicha[] {
  const cambios: CambioFicha[] = [];
  fixture.componentInstance.cambio.subscribe((cambio) => cambios.push(cambio));
  return cambios;
}

/** Espera a que terminen las promesas y vuelve a pintar. */
export async function estable(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver));
  fixture.detectChanges();
  await fixture.whenStable();
}
