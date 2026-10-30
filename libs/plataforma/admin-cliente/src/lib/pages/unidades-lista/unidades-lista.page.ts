import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink, type ParamMap, type Params } from '@angular/router';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import { AccionesFilaDirective, AvisosService, EstadoVacioComponent, TablaComponent, type CambioPagina, type ColumnaTabla } from '@vitrina/shared/ui';
import { aErrorAdmin, CODIGO_VERSION_OBSOLETA } from '../../models/error-admin';
import type { Listado } from '../../models/listado';
import { ETIQUETAS_ESTADO_FILTRO, MENSAJES_ORGANIZACION, MENSAJES_UNIDADES } from '../../models/mensajes-organizacion';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { ETIQUETAS_TIPO_UNIDAD, TIPOS_UNIDAD, type TipoUnidad } from '../../models/tipos-unidad';
import type { Ubicacion } from '../../models/ubicacion';
import type { Unidad } from '../../models/unidad';
import { OrganizacionCliente } from '../../services/organizacion.cliente';
import { UnidadesCliente } from '../../services/unidades.cliente';
import {
  activoDeEstado,
  ESTADOS_FILTRO,
  estadoDesdeUrl,
  estadoParaUrl,
  PARAMETRO_URL_ORGANIZACION,
  paginaDesdeUrl,
  paginaParaUrl,
  TAMANO_PAGINA_ORGANIZACION,
  type EstadoFiltro,
} from '../../utils/filtro-url-organizacion';

/** Lo que muestra cada celda, ya como texto; `unidad` va entera para las acciones. */
export interface FilaUnidad {
  id: string;
  tipo: string;
  codigo: string;
  nombre: string;
  sucursal: string;
  estado: string;
  unidad: Unidad;
}

interface FiltroUnidadesUrl {
  empresaId: string | null;
  sucursalId: string | null;
  tipo: TipoUnidad | null;
  estado: EstadoFiltro;
  pagina: number;
}

const COLUMNAS: ColumnaTabla<FilaUnidad>[] = [
  { clave: 'tipo', titulo: MENSAJES_UNIDADES.tipo },
  { clave: 'codigo', titulo: MENSAJES_UNIDADES.codigo },
  { clave: 'nombre', titulo: MENSAJES_UNIDADES.nombre },
  { clave: 'sucursal', titulo: MENSAJES_UNIDADES.sucursal },
  { clave: 'estado', titulo: MENSAJES_UNIDADES.estado },
];

const RUTA_NUEVA_EMPRESA = '../empresas/nueva';

/** Unidades operativas de una empresa con filtros en la URL, inactivar y reactivar (U-05, TR-RF-004). */
@Component({
  selector: 'vit-unidades-lista',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatSelectModule, RouterLink, SiPermisoDirective, AccionesFilaDirective, EstadoVacioComponent, TablaComponent],
  templateUrl: './unidades-lista.page.html',
})
export class UnidadesListaPage {
  private readonly unidades = inject(UnidadesCliente);
  private readonly organizacion = inject(OrganizacionCliente);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_UNIDADES;
  protected readonly comunes = MENSAJES_ORGANIZACION;
  protected readonly permisos = PERMISOS_ADMIN;
  protected readonly columnas = COLUMNAS;
  protected readonly tamanosPagina = [TAMANO_PAGINA_ORGANIZACION];
  protected readonly estados = ESTADOS_FILTRO;
  protected readonly etiquetasEstado = ETIQUETAS_ESTADO_FILTRO;
  protected readonly tipos = TIPOS_UNIDAD;
  protected readonly etiquetasTipo = ETIQUETAS_TIPO_UNIDAD;
  protected readonly rutaNuevaEmpresa = RUTA_NUEVA_EMPRESA;

  protected readonly empresas = signal<Ubicacion[] | null>(null);
  /** Sucursales activas de la empresa elegida: opciones del filtro y nombre de cada fila. */
  protected readonly sucursales = signal<Ubicacion[]>([]);
  protected readonly filtro = signal<FiltroUnidadesUrl>(filtroDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly listado = signal<Listado<FilaUnidad>>({ items: [], total: 0 });
  protected readonly cargando = signal(false);
  protected readonly procesando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Solo se pinta la respuesta de la última consulta: un filtro rápido no la pisa con una vieja. */
  private consultaActual = 0;
  private empresaDeLasSucursales: string | null = null;

  constructor() {
    void this.cargarEmpresas();
    this.ruta.queryParamMap.pipe(takeUntilDestroyed()).subscribe((parametros) => {
      this.filtro.set(filtroDesdeUrl(parametros));
      void this.cargar();
    });
  }

  /** Otra empresa, otras sucursales: el filtro de sucursal se limpia. */
  protected elegirEmpresa(empresaId: string): void {
    this.navegar({ ...this.filtro(), empresaId, sucursalId: null, pagina: 1 });
  }

  protected elegirSucursal(sucursalId: string | null): void {
    this.navegar({ ...this.filtro(), sucursalId, pagina: 1 });
  }

  protected elegirTipo(tipo: TipoUnidad | null): void {
    this.navegar({ ...this.filtro(), tipo, pagina: 1 });
  }

  protected elegirEstado(estado: EstadoFiltro): void {
    this.navegar({ ...this.filtro(), estado, pagina: 1 });
  }

  protected paginar({ indice }: CambioPagina): void {
    this.navegar({ ...this.filtro(), pagina: indice + 1 });
  }

  protected parametrosDeNueva(): Params {
    const { empresaId, sucursalId } = this.filtro();
    return { [PARAMETRO_URL_ORGANIZACION.empresa]: empresaId, [PARAMETRO_URL_ORGANIZACION.sucursal]: sucursalId };
  }

  /** TR-RNF-021: confirmación sin motivo (el 03 no lo guarda). */
  protected async inactivar(unidad: Unidad): Promise<void> {
    const { confirmado } = await this.avisos.confirmarDestructiva({
      titulo: MENSAJES_UNIDADES.tituloInactivar,
      texto: MENSAJES_UNIDADES.textoInactivar(`${unidad.codigo} · ${unidad.nombre}`),
      textoConfirmar: MENSAJES_UNIDADES.inactivar,
    });
    if (!confirmado) return;
    await this.ejecutar(() => this.unidades.inactivar(unidad.id), MENSAJES_UNIDADES.inactivada);
  }

  protected async reactivar(unidad: Unidad): Promise<void> {
    await this.ejecutar(() => this.unidades.reactivar(unidad), MENSAJES_UNIDADES.reactivada);
  }

  private async ejecutar(accion: () => Promise<void>, mensajeExito: string): Promise<void> {
    if (this.procesando()) return;
    this.procesando.set(true);
    this.error.set(null);
    try {
      await accion();
      this.avisos.toast('exito', mensajeExito);
    } catch (error) {
      const errorAdmin = aErrorAdmin(error);
      this.error.set(errorAdmin.codigo === CODIGO_VERSION_OBSOLETA ? MENSAJES_ORGANIZACION.versionObsoleta : errorAdmin.message);
    } finally {
      this.procesando.set(false);
    }
    await this.cargar();
  }

  /** Sin empresa en la URL, la primera activa por razón social, sin dejar una entrada extra en el historial. */
  private async cargarEmpresas(): Promise<void> {
    try {
      const empresas = await this.organizacion.empresas();
      this.empresas.set(empresas);
      if (!this.filtro().empresaId && empresas.length > 0) this.navegar({ ...this.filtro(), empresaId: empresas[0].id }, true);
    } catch (error) {
      this.empresas.set([]);
      this.error.set(aErrorAdmin(error).message);
    }
  }

  private navegar(filtro: FiltroUnidadesUrl, reemplazar = false): void {
    const queryParams = {
      [PARAMETRO_URL_ORGANIZACION.empresa]: filtro.empresaId,
      [PARAMETRO_URL_ORGANIZACION.sucursal]: filtro.sucursalId,
      [PARAMETRO_URL_ORGANIZACION.tipo]: filtro.tipo,
      [PARAMETRO_URL_ORGANIZACION.activo]: estadoParaUrl(filtro.estado),
      [PARAMETRO_URL_ORGANIZACION.pagina]: paginaParaUrl(filtro.pagina),
    };
    void this.router.navigate([], { relativeTo: this.ruta, queryParams, replaceUrl: reemplazar });
  }

  private async cargar(): Promise<void> {
    const { empresaId, sucursalId, tipo, estado, pagina } = this.filtro();
    if (!empresaId) return;
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    try {
      const [listado, sucursales] = await Promise.all([
        this.unidades.listar({
          empresaId,
          sucursalId: sucursalId ?? undefined,
          tipo: tipo ?? undefined,
          activo: activoDeEstado(estado),
          pagina,
          tamano: TAMANO_PAGINA_ORGANIZACION,
        }),
        this.sucursalesDe(empresaId),
      ]);
      if (consulta !== this.consultaActual) return;
      const nombres = new Map(sucursales.map((sucursal) => [sucursal.id, sucursal.nombre]));
      this.listado.set({ items: listado.items.map((unidad) => filaDe(unidad, nombres)), total: listado.total });
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: [], total: 0 });
      this.error.set(aErrorAdmin(error).message);
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }

  /** Las sucursales se piden una vez por empresa, no en cada cambio de filtro o página. */
  private async sucursalesDe(empresaId: string): Promise<Ubicacion[]> {
    if (this.empresaDeLasSucursales !== empresaId) {
      this.sucursales.set(await this.organizacion.sucursales(empresaId));
      this.empresaDeLasSucursales = empresaId;
    }
    return this.sucursales();
  }
}

function filtroDesdeUrl(parametros: ParamMap): FiltroUnidadesUrl {
  const tipo = parametros.get(PARAMETRO_URL_ORGANIZACION.tipo);
  return {
    empresaId: parametros.get(PARAMETRO_URL_ORGANIZACION.empresa),
    sucursalId: parametros.get(PARAMETRO_URL_ORGANIZACION.sucursal),
    tipo: (TIPOS_UNIDAD as readonly string[]).includes(tipo ?? '') ? (tipo as TipoUnidad) : null,
    estado: estadoDesdeUrl(parametros),
    pagina: paginaDesdeUrl(parametros),
  };
}

function filaDe(unidad: Unidad, nombresDeSucursal: ReadonlyMap<string, string>): FilaUnidad {
  const sucursal = unidad.sucursalId === null ? MENSAJES_UNIDADES.nivelEmpresa : (nombresDeSucursal.get(unidad.sucursalId) ?? MENSAJES_ORGANIZACION.sinDato);
  return {
    id: unidad.id,
    tipo: ETIQUETAS_TIPO_UNIDAD[unidad.tipo],
    codigo: unidad.codigo,
    nombre: unidad.nombre,
    sucursal,
    estado: unidad.activo ? MENSAJES_UNIDADES.activa : MENSAJES_UNIDADES.inactiva,
    unidad,
  };
}
