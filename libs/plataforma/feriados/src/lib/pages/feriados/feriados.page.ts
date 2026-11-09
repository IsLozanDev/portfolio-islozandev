import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { SesionService } from '@vitrina/shared/auth';
import {
  AccionesFilaDirective,
  AvisosService,
  FiltrosComponent,
  PanelLateralService,
  TablaComponent,
  type CambioPagina,
  type ColumnaTabla,
  type DefinicionFiltro,
  type TonoEstado,
  type ValorFiltros,
} from '@vitrina/shared/ui';
import { map } from 'rxjs';
import {
  FormularioFeriadoComponent,
  type DatosFormularioFeriado,
  type ResultadoFormularioFeriado,
} from '../../components/formulario-feriado/formulario-feriado.component';
import { SelectorAnioComponent } from '../../components/selector-anio/selector-anio.component';
import { ALCANCE_GLOBAL, alcancesDeRuta, esModoGlobal } from '../../config/datos-ruta-feriados';
import { aErrorFeriados } from '../../models/error-feriados';
import { ALCANCES_FERIADO, type AlcanceFeriado, type FeriadoDelAnio, type FiltroFeriados, type SucursalFeriado } from '../../models/feriado';
import { COLUMNAS_FERIADOS, ETIQUETAS_ALCANCE_FERIADO, MENSAJES_FERIADOS } from '../../models/mensajes-feriados';
import { TONOS_ALCANCE_FERIADO } from '../../models/tonos-alcance';
import { FeriadosCliente } from '../../services/feriados.cliente';
import { diaDeLaSemana } from '../../utils/dia-semana';
import { anioEnLima, formatearFechaCalendario } from '../../utils/fecha';
import { filtroFeriadosDesdeUrl, PARAMETRO_URL, PRIMERA_PAGINA, parametrosUrlFeriados, valorFiltrosFeriados } from '../../utils/filtro-url';

/** Lo que muestra cada celda, ya como texto, con el feriado para editarlo o borrarlo. */
export interface FilaFeriado {
  id: string;
  fecha: string;
  dia: string;
  nombre: string;
  alcance: string;
  tonoAlcance: TonoEstado;
  sucursal: string;
  recurrente: string;
  gestionable: boolean;
  feriado: FeriadoDelAnio;
}

const COLUMNA_SUCURSAL: ColumnaTabla<FilaFeriado> = { clave: 'sucursal', titulo: COLUMNAS_FERIADOS.sucursal };
const COLUMNAS_ANTES_DE_SUCURSAL: ColumnaTabla<FilaFeriado>[] = [
  { clave: 'fecha', titulo: COLUMNAS_FERIADOS.fecha, movil: 'detalle' },
  { clave: 'dia', titulo: COLUMNAS_FERIADOS.dia, movil: 'detalle' },
  { clave: 'nombre', titulo: COLUMNAS_FERIADOS.nombre, movil: 'titulo' },
  { clave: 'alcance', titulo: COLUMNAS_FERIADOS.alcance, movil: 'estado', tono: (fila) => fila.tonoAlcance },
];
const COLUMNA_RECURRENTE: ColumnaTabla<FilaFeriado> = { clave: 'recurrente', titulo: COLUMNAS_FERIADOS.recurrente };

/**
 * Feriados de un año (TR-RF-029) con paginación en el servidor. El modo sale de `data.alcances`: la consola
 * lista y crea solo globales; admin ve todos, filtra por sucursal y alcance y gestiona los del tenant y de sucursal.
 */
@Component({
  selector: 'vit-feriados',
  imports: [MatButtonModule, MatIconModule, AccionesFilaDirective, FiltrosComponent, TablaComponent, SelectorAnioComponent],
  templateUrl: './feriados.page.html',
})
export class FeriadosPage {
  private readonly feriados = inject(FeriadosCliente);
  private readonly paneles = inject(PanelLateralService);
  private readonly avisos = inject(AvisosService);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_FERIADOS;
  protected readonly alcances = alcancesDeRuta(this.ruta.snapshot.data);
  protected readonly modoGlobal = esModoGlobal(this.alcances);
  protected readonly columnas: ColumnaTabla<FilaFeriado>[] = [
    ...COLUMNAS_ANTES_DE_SUCURSAL,
    ...(this.modoGlobal ? [] : [COLUMNA_SUCURSAL]),
    COLUMNA_RECURRENTE,
  ];
  protected readonly sucursales = computed<SucursalFeriado[]>(() =>
    (this.sesion.contexto()?.sucursales ?? []).map((sucursal) => ({ id: sucursal.id, nombre: sucursal.nombre })),
  );
  protected readonly definicionesFiltro = computed<DefinicionFiltro[]>(() => definicionesFiltro(this.sucursales()));

  private readonly anioPorDefecto = anioEnLima();
  protected readonly filtro = signal<FiltroFeriados>(filtroFeriadosDesdeUrl(this.ruta.snapshot.queryParamMap, this.anioPorDefecto));
  protected readonly valorInicialFiltros = valorFiltrosFeriados(this.filtro());
  protected readonly textoVacio = computed(() => MENSAJES_FERIADOS.sinFeriados(this.filtro().anio));
  protected readonly filas = signal<FilaFeriado[]>([]);
  protected readonly total = signal(0);
  protected readonly cargando = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);
  private consultaActual = 0;

  constructor() {
    this.ruta.queryParamMap
      .pipe(
        map((parametros) => filtroFeriadosDesdeUrl(parametros, this.anioPorDefecto)),
        takeUntilDestroyed(),
      )
      .subscribe((filtro) => {
        this.filtro.set(filtro);
        void this.cargar();
      });
  }

  protected cambiarAnio(anio: number): void {
    this.navegar({ ...this.filtro(), anio, pagina: PRIMERA_PAGINA });
  }

  protected filtrar(valor: ValorFiltros): void {
    this.navegar({
      ...this.filtro(),
      sucursalId: valor[PARAMETRO_URL.sucursal] ?? undefined,
      alcance: ALCANCES_FERIADO.find((alcance) => alcance === valor[PARAMETRO_URL.alcance]),
      pagina: PRIMERA_PAGINA,
    });
  }

  protected paginar({ indice, tamano }: CambioPagina): void {
    this.navegar({ ...this.filtro(), pagina: indice + 1, tamano });
  }

  protected nuevo(): void {
    this.abrirPanel(null);
  }

  protected editar(fila: FilaFeriado): void {
    this.abrirPanel(fila.feriado);
  }

  protected async borrar(fila: FilaFeriado): Promise<void> {
    if (this.ocupado()) return;
    const { feriado } = fila;
    const confirmacion = await this.avisos.confirmarDestructiva({
      titulo: MENSAJES_FERIADOS.borrarFeriado(feriado.nombre, fila.fecha),
      texto: feriado.recurrenteAnual ? MENSAJES_FERIADOS.borrarRecurrente : undefined,
      textoConfirmar: MENSAJES_FERIADOS.confirmarBorrar,
    });
    if (!confirmacion.confirmado) return;

    this.ocupado.set(true);
    this.error.set(null);
    try {
      await this.feriados.eliminar(feriado.id, feriado.version);
      this.avisos.toast('exito', MENSAJES_FERIADOS.borrado);
      await this.cargar();
    } catch (error) {
      this.error.set(aErrorFeriados(error).message);
    } finally {
      this.ocupado.set(false);
    }
  }

  private abrirPanel(feriado: FeriadoDelAnio | null): void {
    const datos: DatosFormularioFeriado = { alcances: this.alcances, sucursales: this.sucursales(), feriado };
    this.paneles
      .abrir<FormularioFeriadoComponent, DatosFormularioFeriado, ResultadoFormularioFeriado>(FormularioFeriadoComponent, { datos })
      .afterClosed()
      .subscribe((resultado) => {
        if (!resultado) return;
        this.avisos.toast(resultado === 'sin-cambios' ? 'info' : 'exito', MENSAJE_POR_RESULTADO[resultado]);
        void this.cargar();
      });
  }

  private navegar(filtro: FiltroFeriados): void {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: parametrosUrlFeriados(filtro) });
  }

  /** La consola pide siempre `alcance=GLOBAL` y sin sucursal: el filtro de la URL no aplica. */
  private consulta(): FiltroFeriados {
    const filtro = this.filtro();
    if (!this.modoGlobal) return filtro;
    return { anio: filtro.anio, alcance: ALCANCE_GLOBAL, pagina: filtro.pagina, tamano: filtro.tamano };
  }

  private async cargar(): Promise<void> {
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const pagina = await this.feriados.listar(this.consulta());
      if (consulta !== this.consultaActual) return;
      const nombresSucursal = new Map(this.sucursales().map((sucursal) => [sucursal.id, sucursal.nombre]));
      this.filas.set(pagina.items.map((feriado) => filaDe(feriado, this.alcances, nombresSucursal)));
      this.total.set(pagina.total);
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.filas.set([]);
      this.total.set(0);
      this.error.set(aErrorFeriados(error).message);
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }
}

const MENSAJE_POR_RESULTADO: Readonly<Record<ResultadoFormularioFeriado, string>> = {
  creado: MENSAJES_FERIADOS.creado,
  actualizado: MENSAJES_FERIADOS.actualizado,
  'sin-cambios': MENSAJES_FERIADOS.sinCambios,
};

function definicionesFiltro(sucursales: readonly SucursalFeriado[]): DefinicionFiltro[] {
  return [
    {
      clave: PARAMETRO_URL.sucursal,
      etiqueta: MENSAJES_FERIADOS.sucursal,
      textoTodos: MENSAJES_FERIADOS.todas,
      opciones: sucursales.map((sucursal) => ({ valor: sucursal.id, etiqueta: sucursal.nombre })),
    },
    {
      clave: PARAMETRO_URL.alcance,
      etiqueta: MENSAJES_FERIADOS.alcance,
      opciones: ALCANCES_FERIADO.map((alcance) => ({ valor: alcance, etiqueta: ETIQUETAS_ALCANCE_FERIADO[alcance] })),
    },
  ];
}

/** Editar y borrar solo si el back lo permite y el alcance es de esta app: en admin, un global es de solo lectura también para el operador. */
function filaDe(feriado: FeriadoDelAnio, alcances: readonly AlcanceFeriado[], nombresSucursal: ReadonlyMap<string, string>): FilaFeriado {
  return {
    id: feriado.id,
    fecha: formatearFechaCalendario(feriado.fechaEnAnio),
    dia: diaDeLaSemana(feriado.fechaEnAnio),
    nombre: feriado.nombre,
    alcance: ETIQUETAS_ALCANCE_FERIADO[feriado.alcance],
    tonoAlcance: TONOS_ALCANCE_FERIADO[feriado.alcance],
    sucursal: (feriado.sucursalId && nombresSucursal.get(feriado.sucursalId)) || MENSAJES_FERIADOS.sinSucursal,
    recurrente: feriado.recurrenteAnual ? MENSAJES_FERIADOS.si : MENSAJES_FERIADOS.no,
    gestionable: feriado.editable && alcances.includes(feriado.alcance),
    feriado,
  };
}
