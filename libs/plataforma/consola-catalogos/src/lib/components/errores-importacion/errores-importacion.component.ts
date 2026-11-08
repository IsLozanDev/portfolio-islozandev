import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { filasDePagina, TablaComponent, type CambioPagina, type ColumnaTabla } from '@vitrina/shared/ui';
import { aErrorCatalogos } from '../../models/error-catalogos';
import type { ErrorFila, FilasInvalidas } from '../../models/importacion';
import { MENSAJES_ERRORES_IMPORTACION, mensajeTotalErrores } from '../../models/mensajes-catalogos';
import { ImportacionesCliente } from '../../services/importaciones.cliente';

const COLUMNAS: ColumnaTabla<ErrorFila>[] = [
  { clave: 'fila', titulo: MENSAJES_ERRORES_IMPORTACION.fila, movil: 'detalle' },
  { clave: 'columna', titulo: MENSAJES_ERRORES_IMPORTACION.columna, movil: 'titulo' },
  { clave: 'valor', titulo: MENSAJES_ERRORES_IMPORTACION.valor, movil: 'detalle' },
  { clave: 'mensaje', titulo: MENSAJES_ERRORES_IMPORTACION.mensaje, movil: 'detalle' },
];
const PRIMERA_PAGINA: CambioPagina = { indice: 0, tamano: 20 };

/** TR-CA-073: el archivo rechazado, con el total, los primeros 100 errores y la descarga del CSV completo. */
@Component({
  selector: 'vit-errores-importacion',
  imports: [MatButtonModule, MatIconModule, TablaComponent],
  templateUrl: './errores-importacion.component.html',
})
export class ErroresImportacionComponent {
  private readonly importaciones = inject(ImportacionesCliente);

  readonly filas = input.required<FilasInvalidas>();

  protected readonly mensajes = MENSAJES_ERRORES_IMPORTACION;
  protected readonly columnas = COLUMNAS;
  protected readonly total = computed(() => mensajeTotalErrores(this.filas().totalErrores, this.filas().errores.length));
  protected readonly pagina = signal<CambioPagina>(PRIMERA_PAGINA);
  protected readonly visibles = computed(() => filasDePagina(this.filas().errores, this.pagina()));
  protected readonly descargando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async descargar(): Promise<void> {
    if (this.descargando()) return;
    this.descargando.set(true);
    this.error.set(null);
    try {
      await this.importaciones.descargarErrores(this.filas().importacionId);
    } catch (error) {
      this.error.set(aErrorCatalogos(error).message);
    } finally {
      this.descargando.set(false);
    }
  }
}
