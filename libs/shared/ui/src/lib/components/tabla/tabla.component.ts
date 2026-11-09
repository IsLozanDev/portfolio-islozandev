import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, contentChild, contentChildren, inject, input, output, type TemplateRef } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorIntl, MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSortModule, type Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { map } from 'rxjs';
import { AccionesFilaDirective } from '../../directives/acciones-fila.directive';
import { CeldaTablaDirective, type ContextoCeldaTabla } from '../../directives/celda-tabla.directive';
import type { CambioOrden, CambioPagina, ColumnaTabla, RolMovil } from '../../models/columna-tabla';
import { MENSAJES_UI } from '../../models/mensajes-ui';
import { PaginadorEnEspanol } from '../../services/paginador-en-espanol.service';
import { TAMANOS_PAGINA } from '../../utils/tamano-pagina';
import { CargandoComponent } from '../cargando/cargando.component';
import { ChipEstadoComponent } from '../chip-estado/chip-estado.component';
import { EstadoVacioComponent } from '../estado-vacio/estado-vacio.component';

export const COLUMNA_ACCIONES = 'acciones';
export const BREAKPOINT_MOVIL = '(max-width: 599.98px)';

/** Tabla con paginación y orden del lado del servidor: recibe la página actual y el total, y emite los cambios. En celular se pinta como lista. */
@Component({
  selector: 'vit-tabla',
  imports: [NgTemplateOutlet, MatIconModule, MatTableModule, MatSortModule, MatPaginatorModule, CargandoComponent, ChipEstadoComponent, EstadoVacioComponent],
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
  readonly tamanosPagina = input<readonly number[]>(TAMANOS_PAGINA);
  /** Tamaño elegido, p. ej. el de la URL; sin él, la primera opción. */
  readonly tamanoPagina = input<number | undefined>(undefined);
  readonly textoVacio = input<string>(MENSAJES_UI.sinRegistros);
  readonly pagina = output<CambioPagina>();
  readonly orden = output<CambioOrden>();

  protected readonly accionesFila = contentChild<AccionesFilaDirective<Fila>>(AccionesFilaDirective);
  private readonly celdas = contentChildren<CeldaTablaDirective<Fila>>(CeldaTablaDirective);
  private readonly plantillasCelda = computed(() => new Map(this.celdas().map((celda) => [celda.clave(), celda.plantilla])));
  protected readonly tituloAcciones = MENSAJES_UI.acciones;
  protected readonly columnaAcciones = COLUMNA_ACCIONES;
  protected readonly esMovil = toSignal(
    inject(BreakpointObserver)
      .observe(BREAKPOINT_MOVIL)
      .pipe(map((estado) => estado.matches)),
    { initialValue: false },
  );
  protected readonly tamanoActual = computed(() => this.tamanoPagina() ?? this.tamanosPagina()[0]);
  protected readonly columnaTitulo = computed(() => this.columnaConRol('titulo'));
  protected readonly columnaEstado = computed(() => this.columnaConRol('estado'));
  protected readonly columnasDetalle = computed(() => this.columnas().filter((columna) => columna.movil === 'detalle'));
  protected readonly columnasVisibles = computed(() => {
    const claves: string[] = this.columnas().map((columna) => columna.clave);
    return this.accionesFila() ? [...claves, COLUMNA_ACCIONES] : claves;
  });

  private columnaConRol(rol: RolMovil): ColumnaTabla<Fila> | undefined {
    return this.columnas().find((columna) => columna.movil === rol);
  }

  protected plantillaDe(clave: string): TemplateRef<ContextoCeldaTabla<Fila>> | undefined {
    return this.plantillasCelda().get(clave);
  }

  protected valorDe(fila: Fila, clave: keyof Fila): unknown {
    return fila[clave];
  }

  protected textoDe(fila: Fila, clave: keyof Fila): string {
    return String(fila[clave]);
  }

  protected cambiarPagina(evento: PageEvent): void {
    this.pagina.emit({ indice: evento.pageIndex, tamano: evento.pageSize });
  }

  protected cambiarOrden(evento: Sort): void {
    this.orden.emit({ clave: evento.active, direccion: evento.direction });
  }
}
