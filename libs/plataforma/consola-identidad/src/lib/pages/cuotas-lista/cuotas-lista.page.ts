import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AccionesFilaDirective,
  CeldaTablaDirective,
  EstadoVacioComponent,
  FiltrosComponent,
  TablaComponent,
  type CambioPagina,
  type ColumnaTabla,
  type TonoEstado,
  type ValorFiltros,
} from '@vitrina/shared/ui';
import { BarraConsumoComponent } from '../../components/barra-consumo/barra-consumo.component';
import type { FilaCuota } from '../../models/cuota';
import { aErrorIdentidad, CODIGO_OPERADOR_REQUERIDO, type ErrorIdentidad } from '../../models/error-identidad';
import { COLUMNAS_CUOTAS, ETIQUETAS_ESTADO_CUOTA, MENSAJES_CUOTAS, MENSAJES_POR_CODIGO, textoSinCuotas } from '../../models/mensajes-identidad';
import { TONOS_ESTADO_CUOTA } from '../../models/tonos';
import { CuotasCliente, TAMANO_PAGINA_CUOTAS } from '../../services/cuotas.cliente';
import { estadoDeFila } from '../../utils/estado-cuota';
import { filtroCuotasDesdeUrl, parametrosUrlCuotas, PRIMERA_PAGINA, valorFiltrosCuotas, type FiltroCuotas } from '../../utils/filtro-url';
import { etiquetaPeriodo, periodosSeleccionables } from '../../utils/periodo';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaCuotaVista {
  tenantId: string;
  tenant: string;
  plan: string;
  consumo: string;
  porcentaje: number;
  estado: string;
  tonoEstado: TonoEstado;
}

interface ListadoCuotas {
  filas: FilaCuotaVista[];
  total: number;
}

const COLUMNAS: ColumnaTabla<FilaCuotaVista>[] = [
  { clave: 'tenant', titulo: COLUMNAS_CUOTAS.tenant, movil: 'titulo' },
  { clave: 'plan', titulo: COLUMNAS_CUOTAS.plan },
  { clave: 'consumo', titulo: COLUMNAS_CUOTAS.consumo, movil: 'detalle' },
  { clave: 'estado', titulo: COLUMNAS_CUOTAS.estado, movil: 'estado', tono: (fila) => fila.tonoEstado },
];

const LISTADO_VACIO: ListadoCuotas = { filas: [], total: 0 };

/** Cuotas DNI/RUC por tenant y mes (spec 30, TR-RF-047; pantalla tipo «Lista»). Filtro en la URL; gana la última consulta. */
@Component({
  selector: 'vit-cuotas-lista',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    RouterLink,
    AccionesFilaDirective,
    CeldaTablaDirective,
    EstadoVacioComponent,
    FiltrosComponent,
    TablaComponent,
    BarraConsumoComponent,
  ],
  templateUrl: './cuotas-lista.page.html',
})
export class CuotasListaPage {
  private readonly cuotas = inject(CuotasCliente);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_CUOTAS;
  protected readonly mensajeSoloOperador = MENSAJES_POR_CODIGO[CODIGO_OPERADOR_REQUERIDO];
  protected readonly columnas = COLUMNAS;
  protected readonly tamanosPagina = [TAMANO_PAGINA_CUOTAS];
  protected readonly periodos = periodosSeleccionables(new Date()).map((periodo) => ({ valor: periodo, etiqueta: etiquetaPeriodo(periodo) }));

  protected readonly filtro = signal<FiltroCuotas>(filtroCuotasDesdeUrl(this.ruta.snapshot.queryParamMap, new Date()));
  /** `vit-filtros` lo lee una vez al iniciar. */
  protected readonly valorInicialFiltros = valorFiltrosCuotas(this.filtro());
  protected readonly listado = signal<ListadoCuotas>(LISTADO_VACIO);
  protected readonly cargando = signal(false);
  protected readonly error = signal<ErrorIdentidad | null>(null);
  protected readonly soloOperador = computed(() => this.error()?.codigo === CODIGO_OPERADOR_REQUERIDO);
  protected readonly textoVacio = computed(() =>
    this.filtro().q ? MENSAJES_CUOTAS.sinCoincidencias : textoSinCuotas(etiquetaPeriodo(this.filtro().periodo)),
  );
  /** Solo se pinta la respuesta de la última consulta: un filtro rápido no la pisa con una vieja. */
  private consultaActual = 0;

  constructor() {
    this.ruta.queryParamMap.pipe(takeUntilDestroyed()).subscribe((parametros) => {
      this.filtro.set(filtroCuotasDesdeUrl(parametros, new Date()));
      void this.cargar();
    });
  }

  protected elegirPeriodo(periodo: string): void {
    this.navegar({ ...this.filtro(), periodo, pagina: PRIMERA_PAGINA });
  }

  protected filtrar(valor: ValorFiltros): void {
    this.navegar({ ...this.filtro(), q: valor.busqueda.trim() || undefined, pagina: PRIMERA_PAGINA });
  }

  protected paginar({ indice }: CambioPagina): void {
    this.navegar({ ...this.filtro(), pagina: indice + 1 });
  }

  private navegar(filtro: FiltroCuotas): void {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: parametrosUrlCuotas(filtro) });
  }

  private async cargar(): Promise<void> {
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const pagina = await this.cuotas.listar(this.filtro());
      if (consulta !== this.consultaActual) return;
      this.listado.set({ filas: pagina.items.map(filaDe), total: pagina.total });
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.listado.set(LISTADO_VACIO);
      this.error.set(aErrorIdentidad(error));
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }
}

function filaDe(cuota: FilaCuota): FilaCuotaVista {
  const estado = estadoDeFila(cuota);
  return {
    tenantId: cuota.tenantId,
    tenant: cuota.tenantNombre,
    plan: cuota.plan,
    consumo: `${cuota.consumidas} / ${cuota.incluidas}`,
    porcentaje: cuota.porcentaje,
    estado: ETIQUETAS_ESTADO_CUOTA[estado],
    tonoEstado: TONOS_ESTADO_CUOTA[estado],
  };
}
