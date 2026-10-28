import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import { AccionSensibleService } from '@vitrina/shared/shell';
import {
  AccionesFilaDirective,
  FiltrosComponent,
  TablaComponent,
  type CambioPagina,
  type ColumnaTabla,
  type DefinicionFiltro,
  type ValorFiltros,
} from '@vitrina/shared/ui';
import { map } from 'rxjs';
import { ESTADOS_TENANT, PRODUCTOS, type EstadoTenant, type ProductoCodigo } from '../../models/catalogos';
import { aErrorConsola } from '../../models/error-consola';
import { TAMANO_PAGINA, type Listado } from '../../models/listado';
import { COLUMNAS_TENANTS, ETIQUETAS_ESTADO_TENANT, MENSAJES_CONSOLA } from '../../models/mensajes-consola';
import { PERMISOS_CONSOLA } from '../../models/permisos-consola';
import type { FiltroTenants, TenantListado } from '../../models/tenant';
import { TenantsCliente } from '../../services/tenants.cliente';
import { filtroDesdeUrl, PARAMETRO_URL, parametrosUrlDe, valorFiltrosDe } from '../../utils/filtro-url';
import { formatearFecha } from '../../utils/formato';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaTenant {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
  suscripciones: string;
  creadoEn: string;
}

const COLUMNAS: ColumnaTabla<FilaTenant>[] = [
  { clave: 'codigo', titulo: COLUMNAS_TENANTS.codigo },
  { clave: 'nombre', titulo: COLUMNAS_TENANTS.nombre },
  { clave: 'estado', titulo: COLUMNAS_TENANTS.estado },
  { clave: 'suscripciones', titulo: COLUMNAS_TENANTS.suscripciones },
  { clave: 'creadoEn', titulo: COLUMNAS_TENANTS.creadoEn },
];

const FILTROS: DefinicionFiltro[] = [
  {
    clave: PARAMETRO_URL.estado,
    etiqueta: COLUMNAS_TENANTS.estado,
    opciones: ESTADOS_TENANT.map((estado) => ({ valor: estado, etiqueta: ETIQUETAS_ESTADO_TENANT[estado] })),
  },
  {
    clave: PARAMETRO_URL.producto,
    etiqueta: COLUMNAS_TENANTS.producto,
    opciones: PRODUCTOS.map((producto) => ({ valor: producto, etiqueta: producto })),
  },
];

const RUTA_NUEVO = 'nuevo';

/** Lista de tenants del operador con filtros y página en la URL (O-04, TR-RF-001 y 006). */
@Component({
  selector: 'vit-tenants-lista',
  imports: [MatButtonModule, MatIconModule, RouterLink, SiPermisoDirective, AccionesFilaDirective, FiltrosComponent, TablaComponent],
  templateUrl: './tenants-lista.page.html',
})
export class TenantsListaPage {
  private readonly tenants = inject(TenantsCliente);
  private readonly accionSensible = inject(AccionSensibleService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_CONSOLA;
  protected readonly permisos = PERMISOS_CONSOLA;
  protected readonly columnas = COLUMNAS;
  protected readonly filtros = FILTROS;
  protected readonly tamanosPagina = [TAMANO_PAGINA];

  protected readonly filtro = signal<FiltroTenants>(filtroDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly valorInicialFiltros = valorFiltrosDe(this.filtro());
  protected readonly listado = signal<Listado<FilaTenant>>({ items: [], total: 0 });
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Solo se pinta la respuesta de la última consulta: un filtro rápido no la pisa con una vieja. */
  private consultaActual = 0;

  constructor() {
    this.ruta.queryParamMap.pipe(map(filtroDesdeUrl), takeUntilDestroyed()).subscribe((filtro) => {
      this.filtro.set(filtro);
      void this.cargar();
    });
  }

  protected filtrar(valor: ValorFiltros): void {
    this.navegar({
      ...this.filtro(),
      q: valor.busqueda.trim() || undefined,
      estado: (valor[PARAMETRO_URL.estado] as EstadoTenant | null) ?? undefined,
      producto: (valor[PARAMETRO_URL.producto] as ProductoCodigo | null) ?? undefined,
      pagina: 1,
    });
  }

  protected paginar({ indice }: CambioPagina): void {
    this.navegar({ ...this.filtro(), pagina: indice + 1 });
  }

  protected async nuevoTenant(): Promise<void> {
    if (!(await this.accionSensible.exigirMfa())) return;
    await this.router.navigate([RUTA_NUEVO], { relativeTo: this.ruta });
  }

  private navegar(filtro: FiltroTenants): void {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: parametrosUrlDe(filtro) });
  }

  private async cargar(): Promise<void> {
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const listado = await this.tenants.listar(this.filtro());
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: listado.items.map(filaDe), total: listado.total });
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: [], total: 0 });
      this.error.set(aErrorConsola(error).message);
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }
}

function filaDe(tenant: TenantListado): FilaTenant {
  const suscripciones = tenant.suscripciones.map((suscripcion) => `${suscripcion.productoCodigo} ${suscripcion.plan}`).join(', ');
  return {
    id: tenant.id,
    codigo: tenant.codigo,
    nombre: tenant.nombre,
    estado: ETIQUETAS_ESTADO_TENANT[tenant.estado],
    suscripciones: suscripciones || MENSAJES_CONSOLA.sinSuscripciones,
    creadoEn: formatearFecha(tenant.creadoEn),
  };
}
