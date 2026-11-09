import { Component, inject, input, signal, type OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { formatearFechaCalendario } from '@vitrina/plataforma/catalogos-ui';
import { AccionesFilaDirective, TablaComponent, type CambioPagina, type ColumnaTabla, type TonoEstado } from '@vitrina/shared/ui';
import { aErrorCatalogos } from '../../models/error-catalogos';
import type { ImportacionListada } from '../../models/importacion';
import { ETIQUETAS_ESTADO_IMPORTACION, MENSAJES_HISTORIAL } from '../../models/mensajes-catalogos';
import { TONOS_ESTADO_IMPORTACION } from '../../models/tonos';
import { ImportacionesCliente } from '../../services/importaciones.cliente';
import { formatearFechaHora } from '../../utils/formato';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaHistorial {
  id: string;
  fecha: string;
  versionOficial: string;
  fechaVigencia: string;
  estado: string;
  tonoEstado: TonoEstado;
  altas: number;
  cambios: number;
  bajas: number;
  errores: number;
  motivo: string;
  conErrores: boolean;
}

const COLUMNAS: ColumnaTabla<FilaHistorial>[] = [
  { clave: 'fecha', titulo: MENSAJES_HISTORIAL.fecha, movil: 'titulo' },
  { clave: 'versionOficial', titulo: MENSAJES_HISTORIAL.versionOficial, movil: 'detalle' },
  { clave: 'fechaVigencia', titulo: MENSAJES_HISTORIAL.fechaVigencia },
  { clave: 'estado', titulo: MENSAJES_HISTORIAL.estado, movil: 'estado', tono: (fila) => fila.tonoEstado },
  { clave: 'altas', titulo: MENSAJES_HISTORIAL.altas },
  { clave: 'cambios', titulo: MENSAJES_HISTORIAL.cambios },
  { clave: 'bajas', titulo: MENSAJES_HISTORIAL.bajas },
  { clave: 'errores', titulo: MENSAJES_HISTORIAL.errores },
  { clave: 'motivo', titulo: MENSAJES_HISTORIAL.motivo, movil: 'detalle' },
];
const TAMANO_PAGINA = 20;
const PRIMERA_PAGINA: CambioPagina = { indice: 0, tamano: TAMANO_PAGINA };

/** Pestaña «Importaciones» del detalle: el historial de la tabla oficial, el más reciente primero. */
@Component({
  selector: 'vit-historial-importaciones',
  imports: [MatButtonModule, MatIconModule, AccionesFilaDirective, TablaComponent],
  templateUrl: './historial-importaciones.component.html',
})
export class HistorialImportacionesComponent implements OnInit {
  private readonly importaciones = inject(ImportacionesCliente);

  readonly codigoCatalogo = input.required<string>();

  protected readonly mensajes = MENSAJES_HISTORIAL;
  protected readonly columnas = COLUMNAS;
  protected readonly tamanosPagina = [TAMANO_PAGINA];
  protected readonly pagina = signal<CambioPagina>(PRIMERA_PAGINA);
  protected readonly filas = signal<FilaHistorial[]>([]);
  protected readonly total = signal(0);
  protected readonly cargando = signal(false);
  protected readonly descargando = signal(false);
  protected readonly error = signal<string | null>(null);
  private consultaActual = 0;

  ngOnInit(): void {
    void this.cargar();
  }

  /** La página actual otra vez; la usa el detalle cuando termina una importación del catálogo. */
  recargar(): Promise<void> {
    return this.cargar();
  }

  protected paginar(cambio: CambioPagina): void {
    this.pagina.set(cambio);
    void this.cargar();
  }

  protected async descargarErrores(fila: FilaHistorial): Promise<void> {
    if (this.descargando()) return;
    this.descargando.set(true);
    this.error.set(null);
    try {
      await this.importaciones.descargarErrores(fila.id);
    } catch (error) {
      this.error.set(aErrorCatalogos(error).message);
    } finally {
      this.descargando.set(false);
    }
  }

  private async cargar(): Promise<void> {
    const consulta = ++this.consultaActual;
    const { indice, tamano } = this.pagina();
    this.cargando.set(true);
    this.error.set(null);
    try {
      const historial = await this.importaciones.historial(this.codigoCatalogo(), { pagina: indice + 1, tamano });
      if (consulta !== this.consultaActual) return;
      this.filas.set(historial.items.map(filaDe));
      this.total.set(historial.total);
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.error.set(aErrorCatalogos(error).message);
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }
}

function filaDe(importacion: ImportacionListada): FilaHistorial {
  return {
    id: importacion.id,
    fecha: formatearFechaHora(importacion.creadoEn),
    versionOficial: importacion.versionOficial,
    fechaVigencia: formatearFechaCalendario(importacion.fechaVigencia),
    estado: ETIQUETAS_ESTADO_IMPORTACION[importacion.estado],
    tonoEstado: TONOS_ESTADO_IMPORTACION[importacion.estado],
    altas: importacion.resumen.altas,
    cambios: importacion.resumen.cambios,
    bajas: importacion.resumen.bajas,
    errores: importacion.totalErrores,
    motivo: importacion.motivoFallo ?? MENSAJES_HISTORIAL.sinMotivo,
    conErrores: importacion.estado === 'RECHAZADA',
  };
}
