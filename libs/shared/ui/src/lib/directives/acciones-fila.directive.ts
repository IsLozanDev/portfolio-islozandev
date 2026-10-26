import { Directive, inject, TemplateRef } from '@angular/core';

export interface ContextoAccionesFila<Fila> {
  $implicit: Fila;
}

/** `<ng-template vitAccionesFila let-fila>…</ng-template>` dentro de `vit-tabla`: columna final «Acciones». */
@Directive({ selector: 'ng-template[vitAccionesFila]' })
export class AccionesFilaDirective<Fila> {
  readonly plantilla = inject<TemplateRef<ContextoAccionesFila<Fila>>>(TemplateRef);
}
