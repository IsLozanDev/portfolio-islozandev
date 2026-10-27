import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, contentChild, input, output } from '@angular/core';
import { MatPaginatorIntl, MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSortModule, type Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { AccionesFilaDirective } from '../../directives/acciones-fila.directive';
import type { CambioOrden, CambioPagina, ColumnaTabla } from '../../models/columna-tabla';
import { MENSAJES_UI } from '../../models/mensajes-ui';
import { PaginadorEnEspanol } from '../../services/paginador-en-espanol.service';
import { CargandoComponent } from '../cargando/cargando.component';
import { EstadoVacioComponent } from '../estado-vacio/estado-vacio.component';

export const COLUMNA_ACCIONES = 'acciones';
export const TAMANOS_PAGINA_POR_DEFECTO = [10, 25, 50];

/** Tabla con paginación y orden del lado del servidor: recibe la página actual y el total, y emite los cambios. */
@Component({
  selector: 'vit-tabla',
  imports: [NgTemplateOutlet, MatTableModule, MatSortModule, MatPaginatorModule, CargandoComponent, EstadoVacioComponent],
  providers: [{ provide: MatPaginatorIntl, useClass: PaginadorEnEspanol }],
  templateUrl: './tabla.component.html',
})
export class TablaComponent<Fila extends object> {
  readonly columnas = input.required<ColumnaTabla<Fila>[]>();
  readonly filas = input.required<readonly Fila[]>();
  readonly total = input.required<number>();
  readonly cargando = input<boolean>(false);
  /** Lo fija quien consume, p. ej. a 0 al cambiar un filtro, para que el paginador no quede desfasado del servidor. */
  readonly indicePagina = input<number>(0);
  readonly tamanosPagina = input<number[]>(TAMANOS_PAGINA_POR_DEFECTO);
  readonly textoVacio = input<string>(MENSAJES_UI.sinRegistros);
  readonly pagina = output<CambioPagina>();
  readonly orden = output<CambioOrden>();

  protected readonly accionesFila = contentChild<AccionesFilaDirective<Fila>>(AccionesFilaDirective);
  protected readonly tituloAcciones = MENSAJES_UI.acciones;
  protected readonly columnaAcciones = COLUMNA_ACCIONES;
  protected readonly columnasVisibles = computed(() => {
    const claves: string[] = this.columnas().map((columna) => columna.clave);
    return this.accionesFila() ? [...claves, COLUMNA_ACCIONES] : claves;
  });

  protected valorDe(fila: Fila, clave: keyof Fila): unknown {
    return fila[clave];
  }

  protected cambiarPagina(evento: PageEvent): void {
    this.pagina.emit({ indice: evento.pageIndex, tamano: evento.pageSize });
  }

  protected cambiarOrden(evento: Sort): void {
    this.orden.emit({ clave: evento.active, direccion: evento.direction });
  }
}
