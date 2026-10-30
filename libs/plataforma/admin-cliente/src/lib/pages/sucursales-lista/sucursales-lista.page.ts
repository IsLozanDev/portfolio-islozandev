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
import { ETIQUETAS_ESTADO_FILTRO, MENSAJES_ORGANIZACION, MENSAJES_SUCURSALES } from '../../models/mensajes-organizacion';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import type { Sucursal } from '../../models/sucursal';
import type { Ubicacion } from '../../models/ubicacion';
import { OrganizacionCliente } from '../../services/organizacion.cliente';
import { RecargaContextoService } from '../../services/recarga-contexto.service';
import { SucursalesCliente } from '../../services/sucursales.cliente';
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

/** Lo que muestra cada celda, ya como texto; `sucursal` va entera para las acciones. */
export interface FilaSucursal {
  id: string;
  codigo: string;
  nombre: string;
  establecimiento: string;
  ubigeo: string;
  principal: string;
  estado: string;
  sucursal: Sucursal;
}

interface FiltroSucursalesUrl {
  empresaId: string | null;
  estado: EstadoFiltro;
  pagina: number;
}

const COLUMNAS: ColumnaTabla<FilaSucursal>[] = [
  { clave: 'codigo', titulo: MENSAJES_SUCURSALES.codigo },
  { clave: 'nombre', titulo: MENSAJES_SUCURSALES.nombre },
  { clave: 'establecimiento', titulo: MENSAJES_SUCURSALES.establecimiento },
  { clave: 'ubigeo', titulo: MENSAJES_SUCURSALES.ubigeo },
  { clave: 'principal', titulo: MENSAJES_SUCURSALES.principal },
  { clave: 'estado', titulo: MENSAJES_SUCURSALES.estado },
];

const RUTA_NUEVA_EMPRESA = '../empresas/nueva';

/** Sucursales de una empresa con filtros en la URL, principal, inactivar y reactivar (U-05, TR-RF-003). */
@Component({
  selector: 'vit-sucursales-lista',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatSelectModule, RouterLink, SiPermisoDirective, AccionesFilaDirective, EstadoVacioComponent, TablaComponent],
  templateUrl: './sucursales-lista.page.html',
})
export class SucursalesListaPage {
  private readonly sucursales = inject(SucursalesCliente);
  private readonly organizacion = inject(OrganizacionCliente);
  private readonly recargaContexto = inject(RecargaContextoService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_SUCURSALES;
  protected readonly comunes = MENSAJES_ORGANIZACION;
  protected readonly permisos = PERMISOS_ADMIN;
  protected readonly columnas = COLUMNAS;
  protected readonly tamanosPagina = [TAMANO_PAGINA_ORGANIZACION];
  protected readonly estados = ESTADOS_FILTRO;
  protected readonly etiquetasEstado = ETIQUETAS_ESTADO_FILTRO;
  protected readonly rutaNuevaEmpresa = RUTA_NUEVA_EMPRESA;

  protected readonly empresas = signal<Ubicacion[] | null>(null);
  protected readonly filtro = signal<FiltroSucursalesUrl>(filtroDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly listado = signal<Listado<FilaSucursal>>({ items: [], total: 0 });
  protected readonly cargando = signal(false);
  protected readonly procesando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Solo se pinta la respuesta de la última consulta: un filtro rápido no la pisa con una vieja. */
  private consultaActual = 0;

  constructor() {
    void this.cargarEmpresas();
    this.ruta.queryParamMap.pipe(takeUntilDestroyed()).subscribe((parametros) => {
      this.filtro.set(filtroDesdeUrl(parametros));
      void this.cargar();
    });
  }

  protected elegirEmpresa(empresaId: string): void {
    this.navegar({ ...this.filtro(), empresaId, pagina: 1 });
  }

  protected elegirEstado(estado: EstadoFiltro): void {
    this.navegar({ ...this.filtro(), estado, pagina: 1 });
  }

  protected paginar({ indice }: CambioPagina): void {
    this.navegar({ ...this.filtro(), pagina: indice + 1 });
  }

  protected parametrosDeNueva(): Params {
    return { [PARAMETRO_URL_ORGANIZACION.empresa]: this.filtro().empresaId };
  }

  protected parametrosDeUnidades(sucursal: Sucursal): Params {
    return { [PARAMETRO_URL_ORGANIZACION.empresa]: sucursal.empresaId, [PARAMETRO_URL_ORGANIZACION.sucursal]: sucursal.id };
  }

  /** TR-CA-009: la API traslada la marca y el 0000 en la misma operación. */
  protected async marcarPrincipal(sucursal: Sucursal): Promise<void> {
    const actual = this.listado().items.find((fila) => fila.sucursal.esPrincipal)?.nombre ?? MENSAJES_SUCURSALES.principalActual;
    const { confirmado } = await this.avisos.confirmarDestructiva({
      titulo: MENSAJES_SUCURSALES.tituloMarcarPrincipal,
      texto: MENSAJES_SUCURSALES.textoMarcarPrincipal(sucursal.nombre, actual),
      textoConfirmar: MENSAJES_SUCURSALES.marcarPrincipal,
    });
    if (!confirmado) return;
    await this.ejecutar(() => this.sucursales.marcarPrincipal(sucursal.id), MENSAJES_SUCURSALES.principalCambiada);
  }

  /** La principal no se inactiva (TR-RN-003): se avisa sin llamar a la API, que repite la regla. */
  protected async inactivar(sucursal: Sucursal): Promise<void> {
    if (sucursal.esPrincipal) {
      await this.avisos.advertencia(MENSAJES_SUCURSALES.tituloPrincipalNoInactivable, MENSAJES_SUCURSALES.principalNoInactivable);
      return;
    }
    const { confirmado } = await this.avisos.confirmarDestructiva({
      titulo: MENSAJES_SUCURSALES.tituloInactivar,
      texto: MENSAJES_SUCURSALES.textoInactivar(sucursal.nombre),
      textoConfirmar: MENSAJES_SUCURSALES.inactivar,
    });
    if (!confirmado) return;
    await this.ejecutar(() => this.sucursales.inactivar(sucursal.id), MENSAJES_SUCURSALES.inactivada, sucursal.id);
  }

  protected async reactivar(sucursal: Sucursal): Promise<void> {
    await this.ejecutar(() => this.sucursales.reactivar(sucursal), MENSAJES_SUCURSALES.reactivada);
  }

  /** Acción, aviso, contexto del selector al día (TR-CA-007) y lista recargada. */
  private async ejecutar(accion: () => Promise<void>, mensajeExito: string, sucursalInactivadaId?: string): Promise<void> {
    if (this.procesando()) return;
    this.procesando.set(true);
    this.error.set(null);
    try {
      await accion();
      this.avisos.toast('exito', mensajeExito);
      await this.recargaContexto.recargar(sucursalInactivadaId);
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

  private navegar(filtro: FiltroSucursalesUrl, reemplazar = false): void {
    const queryParams = {
      [PARAMETRO_URL_ORGANIZACION.empresa]: filtro.empresaId,
      [PARAMETRO_URL_ORGANIZACION.activo]: estadoParaUrl(filtro.estado),
      [PARAMETRO_URL_ORGANIZACION.pagina]: paginaParaUrl(filtro.pagina),
    };
    void this.router.navigate([], { relativeTo: this.ruta, queryParams, replaceUrl: reemplazar });
  }

  private async cargar(): Promise<void> {
    const { empresaId, estado, pagina } = this.filtro();
    if (!empresaId) return;
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    try {
      const listado = await this.sucursales.listar(empresaId, { activo: activoDeEstado(estado), pagina, tamano: TAMANO_PAGINA_ORGANIZACION });
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: listado.items.map(filaDe), total: listado.total });
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: [], total: 0 });
      this.error.set(aErrorAdmin(error).message);
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }
}

function filtroDesdeUrl(parametros: ParamMap): FiltroSucursalesUrl {
  return { empresaId: parametros.get(PARAMETRO_URL_ORGANIZACION.empresa), estado: estadoDesdeUrl(parametros), pagina: paginaDesdeUrl(parametros) };
}

function filaDe(sucursal: Sucursal): FilaSucursal {
  return {
    id: sucursal.id,
    codigo: sucursal.codigo,
    nombre: sucursal.nombre,
    establecimiento: sucursal.codigoEstablecimientoSunat ?? MENSAJES_SUCURSALES.sinEstablecimiento,
    ubigeo: sucursal.ubigeo ?? MENSAJES_ORGANIZACION.sinDato,
    principal: sucursal.esPrincipal ? MENSAJES_SUCURSALES.principal : '',
    estado: sucursal.activo ? MENSAJES_SUCURSALES.activa : MENSAJES_SUCURSALES.inactiva,
    sucursal,
  };
}
