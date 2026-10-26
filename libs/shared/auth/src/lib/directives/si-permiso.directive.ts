import { Directive, effect, inject, input, TemplateRef, ViewContainerRef } from '@angular/core';
import { SesionService } from '../services/sesion.service';

/**
 * Muestra el contenido solo si el usuario tiene el permiso; con una lista, cualquiera (OR).
 * Uso: `*siPermiso="'rest.caja.abrir'"` o `*siPermiso="['rest.caja.abrir', 'rest.caja.cerrar']"`.
 */
@Directive({ selector: '[siPermiso]' })
export class SiPermisoDirective {
  private readonly sesion = inject(SesionService);
  private readonly plantilla = inject(TemplateRef<unknown>);
  private readonly contenedor = inject(ViewContainerRef);
  private visible = false;

  readonly siPermiso = input.required<string | readonly string[]>();

  constructor() {
    effect(() => this.mostrar(this.sesion.tiene(this.siPermiso())));
  }

  private mostrar(permitido: boolean): void {
    if (permitido === this.visible) return;
    this.visible = permitido;
    if (permitido) {
      this.contenedor.createEmbeddedView(this.plantilla);
      return;
    }
    this.contenedor.clear();
  }
}
