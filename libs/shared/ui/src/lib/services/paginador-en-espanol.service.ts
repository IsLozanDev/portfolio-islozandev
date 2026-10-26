import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { MENSAJES_UI } from '../models/mensajes-ui';

/** Textos de `MatPaginator` en español; `vit-tabla` lo provee para sí misma. */
@Injectable()
export class PaginadorEnEspanol extends MatPaginatorIntl {
  override itemsPerPageLabel = MENSAJES_UI.filasPorPagina;
  override firstPageLabel = MENSAJES_UI.primeraPagina;
  override previousPageLabel = MENSAJES_UI.paginaAnterior;
  override nextPageLabel = MENSAJES_UI.paginaSiguiente;
  override lastPageLabel = MENSAJES_UI.ultimaPagina;

  override getRangeLabel = (pagina: number, tamano: number, total: number): string => {
    if (total === 0) return '0 de 0';
    const desde = pagina * tamano + 1;
    const hasta = Math.min(desde + tamano - 1, total);
    return `${desde} – ${hasta} de ${total}`;
  };
}
