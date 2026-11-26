import { CdkAccordionItem } from '@angular/cdk/accordion';
import { Component, computed, contentChild, effect, inject, input, model } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { SeccionPieDirective } from '../../directives/seccion-pie.directive';
import { MENSAJES_UI } from '../../models/mensajes-ui';

/**
 * Tarjeta con cabecera que pliega y despliega su contenido. El contenido contraído sigue en el DOM (no se pierde lo
 * escrito) y queda `inert`. Dentro de `vit-grupo-plegable` comparte estado con las demás.
 */
@Component({
  selector: 'vit-seccion-plegable',
  imports: [MatIconModule],
  hostDirectives: [CdkAccordionItem],
  templateUrl: './seccion-plegable.component.html',
  styleUrl: './seccion-plegable.component.css',
  host: { class: 'block' },
})
export class SeccionPlegableComponent {
  readonly titulo = input.required<string>();
  /** Texto corto que se ve contraída: «3 contactos · principal: correo». */
  readonly resumen = input<string>('');
  readonly expandida = model<boolean>(true);
  readonly deshabilitada = input<boolean>(false);
  /** Nivel del título para la jerarquía de la página. */
  readonly nivelTitulo = input<2 | 3>(2);

  private readonly itemAcordeon = inject(CdkAccordionItem);
  protected readonly idCabecera = `${this.itemAcordeon.id}-cabecera`;
  protected readonly idContenido = `${this.itemAcordeon.id}-contenido`;
  protected readonly pie = contentChild(SeccionPieDirective);
  protected readonly abierta = computed(() => this.expandida() && !this.deshabilitada());
  protected readonly etiquetaGalon = computed(() =>
    this.abierta() ? MENSAJES_UI.contraerSeccion(this.titulo()) : MENSAJES_UI.expandirSeccion(this.titulo()),
  );

  constructor() {
    this.itemAcordeon.expandedChange
      .pipe(takeUntilDestroyed())
      .subscribe((expandida) => this.expandida.set(expandida));
    effect(() => {
      this.itemAcordeon.disabled = this.deshabilitada();
      this.itemAcordeon.expanded = this.abierta();
    });
  }

  protected alternar(): void {
    this.itemAcordeon.toggle();
  }
}
