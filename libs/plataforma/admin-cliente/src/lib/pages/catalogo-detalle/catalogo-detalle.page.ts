import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule, type MatSlideToggleChange } from '@angular/material/slide-toggle';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ESTADOS_ITEM, ETIQUETAS_ESTADO_ITEM, formatearFechaCalendario, TONOS_ESTADO_ITEM, type EstadoItem } from '@vitrina/plataforma/catalogos-ui';
import { SesionService, SiPermisoDirective } from '@vitrina/shared/auth';
import {
  AccionesFilaDirective,
  AvisosService,
  CargandoComponent,
  CeldaTablaDirective,
  ChipEstadoComponent,
  EstadoVacioComponent,
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
import { PanelAjusteComponent, type DatosPanelAjuste, type ResultadoPanelAjuste } from '../../components/panel-ajuste/panel-ajuste.component';
import { ajusteConVisible, ajusteNeutro, ORIGENES_ITEM, type CatalogoAdmin, type FilaItemAdmin, type FiltroItemsAdmin, type SolicitudAjuste } from '../../models/catalogo-admin';
import { aErrorAdmin, CODIGO_VERSION_OBSOLETA } from '../../models/error-admin';
import {
  COLUMNAS_ITEMS_ADMIN,
  ETIQUETAS_ALCANCE_CATALOGO,
  ETIQUETAS_ORIGEN,
  MENSAJES_DETALLE_CATALOGO_ADMIN,
} from '../../models/mensajes-catalogos-admin';
import { PERMISOS_CATALOGOS_ADMIN } from '../../models/permisos-catalogos-admin';
import { TONOS_ALCANCE_CATALOGO, TONOS_ORIGEN } from '../../models/tonos-catalogos-admin';
import { CatalogosAdminCliente } from '../../services/catalogos-admin.cliente';
import { filtroItemsDesdeUrl, PARAMETRO_URL_CATALOGOS, parametrosUrlItems, valorFiltrosItems } from '../../utils/filtro-url-catalogos';

const PARAMETRO_CODIGO = 'codigo';
const CLAVE_VISIBLE = 'visible';

/** Lo que muestra cada celda, ya como texto, con la fila de la API para ajustar, editar o borrar. */
export interface FilaTablaItemAdmin {
  itemId: string;
  codigo: string;
  /** El alias si hay; si no, el nombre global. */
  nombre: string;
  /** El nombre global, solo si hay alias: va debajo, en texto suave. */
  nombreGlobal: string | null;
  origen: string;
  tonoOrigen: TonoEstado;
  orden: string;
  vigencia: string;
  estado: string;
  tonoEstado: TonoEstado;
  visible: boolean;
  item: FilaItemAdmin;
}

const COLUMNAS_ANTES_DE_VISIBLE: ColumnaTabla<FilaTablaItemAdmin>[] = [
  { clave: 'codigo', titulo: COLUMNAS_ITEMS_ADMIN.codigo, movil: 'detalle' },
  { clave: 'nombre', titulo: COLUMNAS_ITEMS_ADMIN.nombre, movil: 'titulo' },
  { clave: 'origen', titulo: COLUMNAS_ITEMS_ADMIN.origen, tono: (fila) => fila.tonoOrigen },
  { clave: 'orden', titulo: COLUMNAS_ITEMS_ADMIN.orden },
  { clave: 'vigencia', titulo: COLUMNAS_ITEMS_ADMIN.vigencia },
  { clave: 'estado', titulo: COLUMNAS_ITEMS_ADMIN.estado, movil: 'estado', tono: (fila) => fila.tonoEstado },
];
const COLUMNA_VISIBLE: ColumnaTabla<FilaTablaItemAdmin> = { clave: CLAVE_VISIBLE, titulo: COLUMNAS_ITEMS_ADMIN.visible, movil: 'detalle' };

/**
 * Detalle de un catálogo en admin (TR-RF-025 y 026). GLOBAL se consulta (TR-CA-067); en MIXTO, los globales se
 * ocultan con el interruptor o se personalizan en el panel (TR-CA-066); en MIXTO y TENANT se gestionan los propios.
 */
@Component({
  selector: 'vit-catalogo-detalle',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    RouterLink,
    SiPermisoDirective,
    AccionesFilaDirective,
    CargandoComponent,
    CeldaTablaDirective,
    ChipEstadoComponent,
    EstadoVacioComponent,
    FiltrosComponent,
    TablaComponent,
  ],
  templateUrl: './catalogo-detalle.page.html',
})
export class CatalogoDetallePage {
  private readonly catalogos = inject(CatalogosAdminCliente);
  private readonly paneles = inject(PanelLateralService);
  private readonly avisos = inject(AvisosService);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_DETALLE_CATALOGO_ADMIN;
  protected readonly etiquetasAlcance = ETIQUETAS_ALCANCE_CATALOGO;
  protected readonly tonosAlcance = TONOS_ALCANCE_CATALOGO;
  protected readonly permisos = PERMISOS_CATALOGOS_ADMIN;
  /** La ruta que monta la lib (`admin`): la lista cuelga de `catalogos`. */
  protected readonly rutaMontaje = this.ruta.parent;
  protected readonly codigo = this.ruta.snapshot.paramMap.get(PARAMETRO_CODIGO) ?? '';
  protected readonly catalogo = signal<CatalogoAdmin | null>(null);
  protected readonly cargandoCatalogo = signal(true);
  protected readonly noExiste = signal(false);

  protected readonly esGlobal = computed(() => this.catalogo()?.alcance === 'GLOBAL');
  protected readonly esMixto = computed(() => this.catalogo()?.alcance === 'MIXTO');
  protected readonly puedePersonalizar = computed(() => this.esMixto() && this.sesion.tiene(PERMISOS_CATALOGOS_ADMIN.personalizar));
  protected readonly gestionaPropios = computed(() => !this.esGlobal() && this.sesion.tiene(PERMISOS_CATALOGOS_ADMIN.itemPropio));
  protected readonly columnas = computed(() => (this.puedePersonalizar() ? [...COLUMNAS_ANTES_DE_VISIBLE, COLUMNA_VISIBLE] : COLUMNAS_ANTES_DE_VISIBLE));
  protected readonly definicionesFiltro = computed(() => definicionesFiltro(this.esMixto()));

  protected readonly filtro = signal<FiltroItemsAdmin>(filtroItemsDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly valorInicialFiltros = valorFiltrosItems(this.filtro());
  protected readonly filas = signal<FilaTablaItemAdmin[]>([]);
  protected readonly total = signal(0);
  protected readonly cargando = signal(false);
  /** Ítems con un ajuste en viaje: su interruptor queda deshabilitado (TR-RNF-008). */
  protected readonly ajustando = signal<ReadonlySet<string>>(new Set());
  protected readonly error = signal<string | null>(null);
  private consultaActual = 0;

  constructor() {
    this.ruta.queryParamMap.pipe(map(filtroItemsDesdeUrl), takeUntilDestroyed()).subscribe((filtro) => {
      this.filtro.set(filtro);
      if (this.catalogo()) void this.cargarItems();
    });
    void this.cargarCatalogo();
  }

  protected filtrar(valor: ValorFiltros): void {
    this.navegar({
      ...this.filtro(),
      texto: valor.busqueda.trim() || undefined,
      estado: ESTADOS_ITEM.find((estado) => estado === valor[PARAMETRO_URL_CATALOGOS.estado]),
      origen: ORIGENES_ITEM.find((origen) => origen === valor[PARAMETRO_URL_CATALOGOS.origen]),
      pagina: 1,
    });
  }

  protected paginar({ indice, tamano }: CambioPagina): void {
    this.navegar({ ...this.filtro(), pagina: indice + 1, tamano });
  }

  protected esAjustable(fila: FilaTablaItemAdmin): boolean {
    return this.puedePersonalizar() && !fila.item.propio;
  }

  /** TR-CA-066: el interruptor manda el alias, el orden y la versión actuales; si falla, vuelve a su valor. */
  protected async cambiarVisible(fila: FilaTablaItemAdmin, evento: MatSlideToggleChange): Promise<void> {
    const visible = evento.checked;
    const aplicado = await this.ajustar(fila, ajusteConVisible(fila.item, visible));
    if (!aplicado) {
      evento.source.checked = !visible;
      return;
    }
    this.avisos.toast('exito', visible ? MENSAJES_DETALLE_CATALOGO_ADMIN.visibleOtraVez(fila.nombre) : MENSAJES_DETALLE_CATALOGO_ADMIN.oculto(fila.nombre));
  }

  protected personalizar(fila: FilaTablaItemAdmin): void {
    const datos: DatosPanelAjuste = { codigoCatalogo: this.codigo, fila: fila.item };
    this.paneles
      .abrir<PanelAjusteComponent, DatosPanelAjuste, ResultadoPanelAjuste>(PanelAjusteComponent, { datos })
      .afterClosed()
      .subscribe((resultado) => void this.alCerrarPanel(resultado));
  }

  protected async restablecer(fila: FilaTablaItemAdmin): Promise<void> {
    const confirmado = await this.avisos.confirmar({ titulo: MENSAJES_DETALLE_CATALOGO_ADMIN.confirmarRestablecer(fila.nombre) });
    if (!confirmado) return;
    if (await this.ajustar(fila, ajusteNeutro(fila.item))) this.avisos.toast('exito', MENSAJES_DETALLE_CATALOGO_ADMIN.restablecido);
  }

  private async alCerrarPanel(resultado: ResultadoPanelAjuste | undefined): Promise<void> {
    if (resultado === 'obsoleta') {
      await this.avisarVersionObsoleta();
      return;
    }
    if (!resultado) return;
    const guardado = resultado === 'guardado';
    this.avisos.toast(guardado ? 'exito' : 'info', guardado ? MENSAJES_DETALLE_CATALOGO_ADMIN.ajusteGuardado : MENSAJES_DETALLE_CATALOGO_ADMIN.sinCambios);
    if (guardado) await this.cargarItems();
  }

  /** `true` si se aplicó y recargó la página; un error se avisa y no se reintenta. */
  private async ajustar(fila: FilaTablaItemAdmin, solicitud: SolicitudAjuste): Promise<boolean> {
    if (this.ajustando().has(fila.itemId)) return false;
    this.marcarAjuste(fila.itemId, true);
    try {
      await this.catalogos.ajustar(this.codigo, fila.itemId, solicitud);
      await this.cargarItems();
      return true;
    } catch (error) {
      const errorAdmin = aErrorAdmin(error);
      if (errorAdmin.codigo === CODIGO_VERSION_OBSOLETA) await this.avisarVersionObsoleta();
      else this.avisos.toast('error', errorAdmin.message);
      return false;
    } finally {
      this.marcarAjuste(fila.itemId, false);
    }
  }

  private async avisarVersionObsoleta(): Promise<void> {
    await this.avisos.advertencia(MENSAJES_DETALLE_CATALOGO_ADMIN.versionObsoleta);
    await this.cargarItems();
  }

  private marcarAjuste(itemId: string, enViaje: boolean): void {
    this.ajustando.update((actuales) => {
      const siguientes = new Set(actuales);
      if (enViaje) siguientes.add(itemId);
      else siguientes.delete(itemId);
      return siguientes;
    });
  }

  private navegar(filtro: FiltroItemsAdmin): void {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: parametrosUrlItems(filtro) });
  }

  private async cargarCatalogo(): Promise<void> {
    try {
      const catalogo = (await this.catalogos.listar()).find((candidato) => candidato.codigo === this.codigo);
      if (!catalogo) {
        this.noExiste.set(true);
        return;
      }
      this.catalogo.set(catalogo);
      await this.cargarItems();
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.cargandoCatalogo.set(false);
    }
  }

  /** El origen solo filtra en MIXTO: en GLOBAL y TENANT todos los ítems tienen el mismo. */
  private consulta(): FiltroItemsAdmin {
    const filtro = this.filtro();
    return this.esMixto() ? filtro : { ...filtro, origen: undefined };
  }

  private async cargarItems(): Promise<void> {
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const pagina = await this.catalogos.items(this.codigo, this.consulta());
      if (consulta !== this.consultaActual) return;
      this.filas.set(pagina.items.map(filaDe));
      this.total.set(pagina.total);
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.filas.set([]);
      this.total.set(0);
      this.error.set(aErrorAdmin(error).message);
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }
}

function definicionesFiltro(conOrigen: boolean): DefinicionFiltro[] {
  const estado: DefinicionFiltro = {
    clave: PARAMETRO_URL_CATALOGOS.estado,
    etiqueta: MENSAJES_DETALLE_CATALOGO_ADMIN.estado,
    opciones: ESTADOS_ITEM.map((valor: EstadoItem) => ({ valor, etiqueta: ETIQUETAS_ESTADO_ITEM[valor] })),
  };
  if (!conOrigen) return [estado];
  const origen: DefinicionFiltro = {
    clave: PARAMETRO_URL_CATALOGOS.origen,
    etiqueta: MENSAJES_DETALLE_CATALOGO_ADMIN.origen,
    opciones: ORIGENES_ITEM.map((valor) => ({ valor, etiqueta: ETIQUETAS_ORIGEN[valor] })),
  };
  return [estado, origen];
}

function filaDe(item: FilaItemAdmin): FilaTablaItemAdmin {
  const alias = item.ajuste?.alias ?? null;
  const orden = item.ajuste?.orden ?? item.orden;
  const origen = item.propio ? 'PROPIO' : 'GLOBAL';
  const hasta = item.vigenteHasta === null ? null : formatearFechaCalendario(item.vigenteHasta);
  return {
    itemId: item.itemId,
    codigo: item.codigo,
    nombre: alias ?? item.nombre,
    nombreGlobal: alias ? item.nombre : null,
    origen: ETIQUETAS_ORIGEN[origen],
    tonoOrigen: TONOS_ORIGEN[origen],
    orden: orden === null ? MENSAJES_DETALLE_CATALOGO_ADMIN.sinValor : String(orden),
    vigencia: MENSAJES_DETALLE_CATALOGO_ADMIN.vigencia(formatearFechaCalendario(item.vigenteDesde), hasta),
    estado: ETIQUETAS_ESTADO_ITEM[item.estado],
    tonoEstado: TONOS_ESTADO_ITEM[item.estado],
    visible: item.ajuste?.visible ?? true,
    item,
  };
}
