import { Directive, effect, inject, input, TemplateRef, ViewContainerRef } from '@angular/core';
import { SesionService } from './sesion.service';

/** <button *siPermiso="'plat.usuario.invitar'">Invitar</button>  — solo oculta; la API decide. */
@Directive({ selector: '[siPermiso]' })
export class SiPermisoDirective {
  readonly siPermiso = input.required<string>();
  private readonly tpl = inject(TemplateRef<unknown>);
  private readonly vcr = inject(ViewContainerRef);
  private readonly sesion = inject(SesionService);
  private visible = false;
  constructor() {
    effect(() => {
      const ok = this.sesion.permisos().has(this.siPermiso());
      if (ok && !this.visible) { this.vcr.createEmbeddedView(this.tpl); this.visible = true; }
      if (!ok && this.visible) { this.vcr.clear(); this.visible = false; }
    });
  }
}
