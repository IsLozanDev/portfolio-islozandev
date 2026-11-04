import { Injectable, signal } from '@angular/core';

/** Código de opción del menú (`seg.opcion.codigo`) → número que se muestra junto a ella. */
export type InsigniasMenu = Readonly<Record<string, number>>;

/**
 * Números junto a las opciones del menú (spec 18: solicitudes de soporte pendientes). Los fija la lib
 * que sabe contarlos; el shell solo los pinta. En raíz: el layout es padre de las rutas y no ve sus
 * proveedores, y la lib que cuenta puede cargarse de forma diferida.
 */
@Injectable({ providedIn: 'root' })
export class InsigniasMenuService {
  private readonly actuales = signal<InsigniasMenu>({});

  readonly insignias = this.actuales.asReadonly();

  /** 0 la quita. */
  fijar(codigoOpcion: string, cantidad: number): void {
    this.actuales.update((anteriores) => ({ ...anteriores, [codigoOpcion]: cantidad }));
  }
}
