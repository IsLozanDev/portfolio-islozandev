import { CdkAccordion } from '@angular/cdk/accordion';
import { Component, computed, contentChildren, effect, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MENSAJES_UI } from '../../models/mensajes-ui';
import { SeccionPlegableComponent } from '../seccion-plegable/seccion-plegable.component';

export const MINIMO_SECCIONES_CONTROLES = 3;

/** Agrupa `vit-seccion-plegable`: varias abiertas a la vez por defecto y «Expandir todo» / «Contraer todo». */
@Component({
  selector: 'vit-grupo-plegable',
  imports: [MatButtonModule, MatIconModule],
  hostDirectives: [CdkAccordion],
  templateUrl: './grupo-plegable.component.html',
  host: { class: 'block' },
})
export class GrupoPlegableComponent {
  /** false: abrir una cierra las demás. */
  readonly multiple = input<boolean>(true);
  /** null: se muestran desde MINIMO_SECCIONES_CONTROLES (3). */
  readonly conControles = input<boolean | null>(null);

  private readonly acordeon = inject(CdkAccordion);
  private readonly secciones = contentChildren(SeccionPlegableComponent, { descendants: true });
  private readonly seccionesHabilitadas = computed(() =>
    this.secciones().filter((seccion) => !seccion.deshabilitada()),
  );

  protected readonly mostrarControles = computed(
    () => this.conControles() ?? this.secciones().length >= MINIMO_SECCIONES_CONTROLES,
  );
  protected readonly todoExpandido = computed(
    () => !this.multiple() || this.seccionesHabilitadas().every((seccion) => seccion.expandida()),
  );
  protected readonly todoContraido = computed(() =>
    this.seccionesHabilitadas().every((seccion) => !seccion.expandida()),
  );
  protected readonly textoExpandirTodo = MENSAJES_UI.expandirTodo;
  protected readonly textoContraerTodo = MENSAJES_UI.contraerTodo;

  constructor() {
    // Antes de que las secciones fijen su estado inicial: con `multi` en false se cerrarían entre sí.
    this.acordeon.multi = true;
    effect(() => {
      this.acordeon.multi = this.multiple();
    });
  }

  expandirTodo(): void {
    this.acordeon.openAll();
  }

  contraerTodo(): void {
    this.acordeon.closeAll();
  }
}
