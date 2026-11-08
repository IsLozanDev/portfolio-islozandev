import { Component, computed, DestroyRef, inject, input, signal, type OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ESTADOS_ITEM,
  ETIQUETAS_ESTADO_ITEM,
  formatearFechaCalendario,
  hoyEnLima,
  solicitudDeItem,
  TONOS_ESTADO_ITEM,
  type EstadoItem,
} from '@vitrina/plataforma/catalogos-ui';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import { AccionSensibleService } from '@vitrina/shared/shell';
import {
  AccionesFilaDirective,
  AvisosService,
  FiltrosComponent,
  TablaComponent,
  type CambioPagina,
  type ColumnaTabla,
  type DefinicionFiltro,
  type TonoEstado,
  type ValorFiltros,
} from '@vitrina/shared/ui';
import { map } from 'rxjs';
import type { Catalogo } from '../../models/catalogo';
import { aErrorCatalogos } from '../../models/error-catalogos';
import type { FilaItem, FiltroItems } from '../../models/fila-item';
import { COLUMNAS_ITEMS, mensajeBorrarItem, MENSAJES_ITEMS, mensajeVigencia } from '../../models/mensajes-catalogos';
import { PERMISOS_CATALOGOS } from '../../models/permisos-catalogos';
import { ItemsCliente } from '../../services/items.cliente';
import { filtroItemsDesdeUrl, PARAMETRO_URL_DETALLE, parametrosUrlItems, valorFiltrosItems } from '../../utils/filtro-url';

const CODIGO_ITEM_REFERENCIADO = 'ITEM_REFERENCIADO';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaTablaItem {
  itemId: string;
  codigo: string;
  codigoExterno: string;
  nombre: string;
  orden: number;
  vigencia: string;
  estado: string;
  tonoEstado: TonoEstado;
  activo: string;
  version: number;
}

const COLUMNAS: ColumnaTabla<FilaTablaItem>[] = [
  { clave: 'codigo', titulo: COLUMNAS_ITEMS.codigo, movil: 'detalle' },
  { clave: 'codigoExterno', titulo: COLUMNAS_ITEMS.codigoExterno },
  { clave: 'nombre', titulo: COLUMNAS_ITEMS.nombre, movil: 'titulo' },
  { clave: 'orden', titulo: COLUMNAS_ITEMS.orden },
  { clave: 'vigencia', titulo: COLUMNAS_ITEMS.vigencia, movil: 'detalle' },
  { clave: 'estado', titulo: COLUMNAS_ITEMS.estado, movil: 'estado', tono: (fila) => fila.tonoEstado },
  { clave: 'activo', titulo: COLUMNAS_ITEMS.activo },
];

const FILTROS: DefinicionFiltro[] = [
  {
    clave: PARAMETRO_URL_DETALLE.estado,
    etiqueta: MENSAJES_ITEMS.estado,
    opciones: ESTADOS_ITEM.map((estado) => ({ valor: estado, etiqueta: ETIQUETAS_ESTADO_ITEM[estado] })),
  },
];

/**
 * Pestaña «Ítems» del detalle (TR-RF-023): solo los globales (`origen=GLOBAL`), con filtro y página en la URL.
 * Borrar un ítem en uso ofrece cerrar su vigencia hoy (TR-CA-061, TR-RN-013).
 */
@Component({
  selector: 'vit-items-catalogo',
  imports: [MatButtonModule, MatIconModule, RouterLink, SiPermisoDirective, AccionesFilaDirective, FiltrosComponent, TablaComponent],
  templateUrl: './items-catalogo.component.html',
})
export class ItemsCatalogoComponent implements OnInit {
  private readonly items = inject(ItemsCliente);
  private readonly accionSensible = inject(AccionSensibleService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly destruir = inject(DestroyRef);

  readonly catalogo = input.required<Catalogo>();

  protected readonly mensajes = MENSAJES_ITEMS;
  protected readonly permisos = PERMISOS_CATALOGOS;
  protected readonly columnas = COLUMNAS;
  protected readonly filtros = FILTROS;

  protected readonly filtro = signal<FiltroItems>(filtroItemsDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly valorInicialFiltros = valorFiltrosItems(this.filtro());
  protected readonly filas = signal<FilaTablaItem[]>([]);
  protected readonly total = signal(0);
  protected readonly cargando = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly soloDelTenant = computed(() => this.catalogo().alcance === 'TENANT');
  /** Solo GLOBAL y MIXTO tienen globales; las tablas importables cambian solo por importación. */
  protected readonly editable = computed(() => !this.soloDelTenant() && !this.catalogo().importable);
  private consultaActual = 0;

  /** En `ngOnInit` y no en el constructor: la URL emite al suscribirse y la carga necesita el `catalogo` del input. */
  ngOnInit(): void {
    this.ruta.queryParamMap.pipe(map(filtroItemsDesdeUrl), takeUntilDestroyed(this.destruir)).subscribe((filtro) => {
      this.filtro.set(filtro);
      void this.cargar();
    });
  }

  /** La página actual otra vez; la usa el detalle cuando termina una importación del catálogo. */
  recargar(): Promise<void> {
    return this.cargar();
  }

  protected filtrar(valor: ValorFiltros): void {
    this.navegar({
      ...this.filtro(),
      texto: valor.busqueda.trim() || undefined,
      estado: (valor[PARAMETRO_URL_DETALLE.estado] as EstadoItem | null) ?? undefined,
      pagina: 1,
    });
  }

  protected paginar({ indice, tamano }: CambioPagina): void {
    this.navegar({ ...this.filtro(), pagina: indice + 1, tamano });
  }

  protected async borrar(fila: FilaTablaItem): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await this.borrarOCerrarVigencia(fila);
    } catch (error) {
      this.error.set(aErrorCatalogos(error).message);
    } finally {
      this.ocupado.set(false);
    }
  }

  private async borrarOCerrarVigencia(fila: FilaTablaItem): Promise<void> {
    if (!(await this.accionSensible.exigirMfa())) return;
    const confirmacion = await this.avisos.confirmarDestructiva({ titulo: mensajeBorrarItem(fila.codigo), textoConfirmar: MENSAJES_ITEMS.confirmarBorrar });
    if (!confirmacion.confirmado) return;

    try {
      await this.items.eliminar(this.catalogo().codigo, fila.itemId, fila.version);
    } catch (error) {
      if (aErrorCatalogos(error).codigo !== CODIGO_ITEM_REFERENCIADO) throw error;
      await this.ofrecerCerrarVigencia(fila);
      return;
    }
    this.avisos.toast('exito', MENSAJES_ITEMS.itemBorrado);
    await this.cargar();
  }

  /** TR-CA-061: el ítem en uso no se borra; se cierra su vigencia hoy con el contenido y la versión que tiene ahora. */
  private async ofrecerCerrarVigencia(fila: FilaTablaItem): Promise<void> {
    const confirmacion = await this.avisos.confirmarDestructiva({ titulo: MENSAJES_ITEMS.enUso, textoConfirmar: MENSAJES_ITEMS.cerrarVigencia });
    if (!confirmacion.confirmado) return;

    const codigoCatalogo = this.catalogo().codigo;
    const item = await this.items.obtener(codigoCatalogo, fila.itemId);
    const hoy = hoyEnLima();
    if (item.vigenteDesde > hoy) {
      this.avisos.toast('advertencia', MENSAJES_ITEMS.aunNoVigente);
      return;
    }
    await this.items.actualizar(codigoCatalogo, item.id, { ...solicitudDeItem(item), vigenteHasta: hoy }, item.version);
    this.avisos.toast('exito', MENSAJES_ITEMS.vigenciaCerrada);
    await this.cargar();
  }

  private navegar(filtro: FiltroItems): void {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: parametrosUrlItems(filtro), queryParamsHandling: 'merge' });
  }

  private async cargar(): Promise<void> {
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const pagina = await this.items.listarAdministracion(this.catalogo().codigo, this.filtro());
      if (consulta !== this.consultaActual) return;
      this.filas.set(pagina.items.map(filaDe));
      this.total.set(pagina.total);
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.filas.set([]);
      this.total.set(0);
      this.error.set(aErrorCatalogos(error).message);
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }
}

function filaDe(item: FilaItem): FilaTablaItem {
  const hasta = item.vigenteHasta === null ? null : formatearFechaCalendario(item.vigenteHasta);
  return {
    itemId: item.itemId,
    codigo: item.codigo,
    codigoExterno: item.codigoExterno ?? MENSAJES_ITEMS.sinValor,
    nombre: item.nombre,
    orden: item.orden,
    vigencia: mensajeVigencia(formatearFechaCalendario(item.vigenteDesde), hasta),
    estado: ETIQUETAS_ESTADO_ITEM[item.estado],
    tonoEstado: TONOS_ESTADO_ITEM[item.estado],
    activo: item.activo ? MENSAJES_ITEMS.si : MENSAJES_ITEMS.no,
    version: item.version,
  };
}
