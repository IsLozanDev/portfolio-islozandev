import { Component, inject, signal } from '@angular/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SesionService, SiPermisoDirective } from '@vitrina/shared/auth';
import {
  AccionesFilaDirective,
  CeldaTablaDirective,
  ChipEstadoComponent,
  FiltrosComponent,
  PanelLateralService,
  TablaComponent,
  type CambioPagina,
  type ColumnaTabla,
  type TonoEstado,
  type ValorFiltros,
} from '@vitrina/shared/ui';
import { map } from 'rxjs';
import {
  PlantillaVistaRapidaComponent,
  type DatosVistaRapida,
  type ResultadoVistaRapida,
} from '../../components/plantilla-vista-rapida/plantilla-vista-rapida.component';
import { aErrorAdmin } from '../../models/error-admin';
import type { Listado } from '../../models/listado';
import {
  COLUMNAS_PLANTILLAS,
  ETIQUETAS_CANAL_PLANTILLA,
  ETIQUETAS_ORIGEN_PLANTILLA,
  etiquetaOrigenConVersion,
  ICONOS_CANAL_PLANTILLA,
  MENSAJES_PLANTILLAS,
} from '../../models/mensajes-plantillas';
import { PERMISOS_PLANTILLAS } from '../../models/permisos-plantillas';
import type { FiltroPlantillas, ResumenPlantilla } from '../../models/plantilla';
import { TONOS_ORIGEN_PLANTILLA } from '../../models/tonos-plantilla';
import { PlantillasCliente } from '../../services/plantillas.cliente';
import { formatearFechaCorta } from '../../utils/formato';
import { filtroPlantillasDesdeUrl, parametrosUrlPlantillas, PRIMERA_PAGINA_PLANTILLAS } from '../../utils/filtro-url-plantillas';

/** Lo que muestra cada celda, ya como texto; `plantilla` lleva el resumen para la vista rápida y el editor. */
export interface FilaPlantilla {
  plantilla: ResumenPlantilla;
  nombre: string;
  codigo: string;
  asunto: string;
  canal: string;
  iconoCanal: string;
  origen: string;
  tonoOrigen: TonoEstado;
  version: string;
  actualizada: string;
  /** Celular: el chip de origen lleva la versión y el detalle junta código y fecha (canvas «47 · Plantillas»). */
  origenConVersion: string;
  codigoYFecha: string;
}

/** En escritorio el código va bajo el nombre y el canal es un chip con ícono: plantillas `vitCeldaTabla`. */
const COLUMNAS_ESCRITORIO: ColumnaTabla<FilaPlantilla>[] = [
  { clave: 'nombre', titulo: COLUMNAS_PLANTILLAS.plantilla },
  { clave: 'asunto', titulo: COLUMNAS_PLANTILLAS.asunto },
  { clave: 'canal', titulo: COLUMNAS_PLANTILLAS.canal },
  { clave: 'origen', titulo: COLUMNAS_PLANTILLAS.origen, tono: (fila) => fila.tonoOrigen },
  { clave: 'version', titulo: COLUMNAS_PLANTILLAS.version },
  { clave: 'actualizada', titulo: COLUMNAS_PLANTILLAS.actualizada },
];

const COLUMNAS_MOVIL: ColumnaTabla<FilaPlantilla>[] = [
  { clave: 'nombre', titulo: COLUMNAS_PLANTILLAS.plantilla, movil: 'titulo' },
  { clave: 'origenConVersion', titulo: COLUMNAS_PLANTILLAS.origen, movil: 'estado', tono: (fila) => fila.tonoOrigen },
  { clave: 'codigoYFecha', titulo: COLUMNAS_PLANTILLAS.plantilla, movil: 'detalle' },
];

/** Plantillas de notificación que el tenant puede personalizar (TR-RF-074, spec 47). Filtro y página en la URL. */
@Component({
  selector: 'vit-plantillas-lista',
  imports: [
    MatButtonModule,
    MatIconModule,
    RouterLink,
    SiPermisoDirective,
    AccionesFilaDirective,
    CeldaTablaDirective,
    ChipEstadoComponent,
    FiltrosComponent,
    TablaComponent,
  ],
  templateUrl: './plantillas-lista.page.html',
})
export class PlantillasListaPage {
  private readonly plantillas = inject(PlantillasCliente);
  private readonly panel = inject(PanelLateralService);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_PLANTILLAS;
  protected readonly permisos = PERMISOS_PLANTILLAS;
  protected readonly columnas = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.XSmall)
      .pipe(map((estado) => (estado.matches ? COLUMNAS_MOVIL : COLUMNAS_ESCRITORIO))),
    { initialValue: COLUMNAS_ESCRITORIO },
  );

  protected readonly filtro = signal<FiltroPlantillas>(filtroPlantillasDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly valorInicialFiltros = { busqueda: this.filtro().q ?? '' };
  protected readonly listado = signal<Listado<FilaPlantilla>>({ items: [], total: 0 });
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Solo se pinta la respuesta de la última consulta: escribir rápido no la pisa con una vieja. */
  private consultaActual = 0;

  constructor() {
    this.ruta.queryParamMap.pipe(takeUntilDestroyed()).subscribe((parametros) => {
      this.filtro.set(filtroPlantillasDesdeUrl(parametros));
      void this.cargar();
    });
  }

  protected filtrar(valor: ValorFiltros): void {
    this.navegar({ ...this.filtro(), q: valor.busqueda.trim() || undefined, pagina: PRIMERA_PAGINA_PLANTILLAS });
  }

  protected paginar({ indice, tamano }: CambioPagina): void {
    this.navegar({ ...this.filtro(), pagina: indice + 1, tamano });
  }

  protected ver(fila: FilaPlantilla): void {
    const datos: DatosVistaRapida = { plantilla: fila.plantilla, puedeEditar: this.sesion.tiene(PERMISOS_PLANTILLAS.gestionar) };
    this.panel
      .abrir<PlantillaVistaRapidaComponent, DatosVistaRapida, ResultadoVistaRapida>(PlantillaVistaRapidaComponent, { datos })
      .afterClosed()
      .subscribe((resultado) => {
        if (resultado === 'editar') void this.router.navigate(this.rutaEditor(fila), { relativeTo: this.ruta });
      });
  }

  protected rutaEditor(fila: FilaPlantilla): string[] {
    return [fila.plantilla.codigo, fila.plantilla.canal];
  }

  private navegar(filtro: FiltroPlantillas): void {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: parametrosUrlPlantillas(filtro) });
  }

  private async cargar(): Promise<void> {
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const pagina = await this.plantillas.listar(this.filtro());
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: pagina.items.map(filaDe), total: pagina.total });
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: [], total: 0 });
      this.error.set(aErrorAdmin(error).message);
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }
}

function filaDe(plantilla: ResumenPlantilla): FilaPlantilla {
  const actualizada = formatearFechaCorta(new Date(plantilla.actualizadoEn));
  return {
    plantilla,
    nombre: plantilla.nombre,
    codigo: plantilla.codigo,
    asunto: plantilla.asunto,
    canal: ETIQUETAS_CANAL_PLANTILLA[plantilla.canal],
    iconoCanal: ICONOS_CANAL_PLANTILLA[plantilla.canal],
    origen: ETIQUETAS_ORIGEN_PLANTILLA[plantilla.origen],
    tonoOrigen: TONOS_ORIGEN_PLANTILLA[plantilla.origen],
    version: plantilla.version === null ? MENSAJES_PLANTILLAS.sinVersion : String(plantilla.version),
    actualizada,
    origenConVersion: etiquetaOrigenConVersion(plantilla.origen, plantilla.version),
    codigoYFecha: MENSAJES_PLANTILLAS.codigoYFecha(plantilla.codigo, actualizada),
  };
}
