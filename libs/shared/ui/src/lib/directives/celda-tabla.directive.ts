import { Directive, inject, input, TemplateRef } from '@angular/core';

export interface ContextoCeldaTabla<Fila> {
  $implicit: Fila;
}

/**
 * `<ng-template vitCeldaTabla="clave" let-fila>…</ng-template>` dentro de `vit-tabla`: reemplaza el texto de esa
 * columna (p. ej. un interruptor o dos líneas). En celular aplica si la columna tiene rol `detalle`.
 */
@Directive({ selector: 'ng-template[vitCeldaTabla]' })
export class CeldaTablaDirective<Fila> {
  readonly clave = input.required<string>({ alias: 'vitCeldaTabla' });
  readonly plantilla = inject<TemplateRef<ContextoCeldaTabla<Fila>>>(TemplateRef);
}
