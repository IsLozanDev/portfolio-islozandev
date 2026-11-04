import { DOCUMENT, effect, inject, Injectable, signal } from '@angular/core';
import { SesionService } from '@vitrina/shared/auth';
import { InsigniasMenuService } from '@vitrina/shared/shell';
import { PERMISOS_ADMIN } from '../models/permisos-admin';
import { SoporteCliente } from './soporte.cliente';

/** Código de la opción «Soporte» del manifiesto PLAT 1.7.0. */
export const OPCION_MENU_SOPORTE = 'plat.seguridad.soporte';
const SIN_PENDIENTES = 0;

/**
 * Solicitudes de soporte pendientes junto a «Soporte» en el menú (spec 18). Se cargan al tener contexto,
 * al volver a la pestaña y tras aprobar o rechazar. Si falla, no muestra número: es solo un aviso.
 * La app lo arranca con un import dinámico: la lib se carga de forma diferida (`iniciarInsigniasSoporte`).
 */
@Injectable({ providedIn: 'root' })
export class InsigniasSoporteService {
  private readonly sesion = inject(SesionService);
  private readonly soporte = inject(SoporteCliente);
  private readonly documento = inject(DOCUMENT);
  private readonly menu = inject(InsigniasMenuService);
  private readonly cantidad = signal(SIN_PENDIENTES);
  private consultaActual = 0;

  /** Para la pestaña «Pendientes» de la bandeja. */
  readonly pendientes = this.cantidad.asReadonly();

  constructor() {
    // Cambia el tenant o el permiso: el contexto nuevo dice si corresponde contar.
    effect(() => {
      this.sesion.contexto();
      void this.actualizar();
    });
    this.documento.addEventListener('visibilitychange', () => {
      if (this.documento.visibilityState === 'visible') void this.actualizar();
    });
  }

  async actualizar(): Promise<void> {
    const consulta = ++this.consultaActual;
    if (!this.sesion.tiene(PERMISOS_ADMIN.soporteAutorizar)) {
      this.fijar(SIN_PENDIENTES);
      return;
    }
    try {
      const pendientes = await this.soporte.pendientes();
      if (consulta === this.consultaActual) this.fijar(pendientes);
    } catch {
      if (consulta === this.consultaActual) this.fijar(SIN_PENDIENTES);
    }
  }

  private fijar(cantidad: number): void {
    this.cantidad.set(cantidad);
    this.menu.fijar(OPCION_MENU_SOPORTE, cantidad);
  }
}
