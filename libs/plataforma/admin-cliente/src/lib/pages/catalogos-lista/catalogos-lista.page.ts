import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AccionesFilaDirective,
  filasDePagina,
  FiltrosComponent,
  TablaComponent,
  type CambioPagina,
  type ColumnaTabla,
  type DefinicionFiltro,
  type TonoEstado,
  type ValorFiltros,
} from '@vitrina/shared/ui';
import { map } from 'rxjs';
import { ALCANCES_CATALOGO, type CatalogoAdmin } from '../../models/catalogo-admin';
import { aErrorAdmin } from '../../models/error-admin';
import { COLUMNAS_CATALOGOS_ADMIN, ETIQUETAS_ALCANCE_CATALOGO, MENSAJES_CATALOGOS_ADMIN, PERMITE_POR_ALCANCE } from '../../models/mensajes-catalogos-admin';
import { TONOS_ALCANCE_CATALOGO } from '../../models/tonos-catalogos-admin';
import { CatalogosAdminCliente } from '../../services/catalogos-admin.cliente';
import {
  filtroCatalogosDesdeUrl,
  PARAMETRO_URL_CATALOGOS,
  parametrosUrlCatalogos,
  PRIMERA_PAGINA,
  valorFiltrosCatalogos,
  type FiltroCatalogosAdmin,
} from '../../utils/filtro-url-catalogos';

const LOCALE_PERU = 'es-PE';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaCatalogoAdmin {
  codigo: string;
  nombre: string;
  alcance: string;
  tonoAlcance: TonoEstado;
  permite: string;
}

const COLUMNAS: ColumnaTabla<FilaCatalogoAdmin>[] = [
  { clave: 'codigo', titulo: COLUMNAS_CATALOGOS_ADMIN.codigo, movil: 'detalle' },
  { clave: 'nombre', titulo: COLUMNAS_CATALOGOS_ADMIN.nombre, movil: 'titulo' },
  { clave: 'alcance', titulo: COLUMNAS_CATALOGOS_ADMIN.alcance, movil: 'estado', tono: (fila) => fila.tonoAlcance },
  { clave: 'permite', titulo: COLUMNAS_CATALOGOS_ADMIN.permite, movil: 'detalle' },
];

const FILTROS: DefinicionFiltro[] = [
  {
    clave: PARAMETRO_URL_CATALOGOS.alcance,
    etiqueta: MENSAJES_CATALOGOS_ADMIN.alcance,
    opciones: ALCANCES_CATALOGO.map((alcance) => ({ valor: alcance, etiqueta: ETIQUETAS_ALCANCE_CATALOGO[alcance] })),
  },
];

/** Catálogos que ve el tenant (TR-RF-025 y 026). La API no pagina: el filtro y la página son del cliente, en la URL. */
@Component({
  selector: 'vit-catalogos-lista',
  imports: [MatButtonModule, MatIconModule, RouterLink, AccionesFilaDirective, FiltrosComponent, TablaComponent],
  templateUrl: './catalogos-lista.page.html',
})
export class CatalogosListaPage {
  private readonly catalogos = inject(CatalogosAdminCliente);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_CATALOGOS_ADMIN;
  protected readonly columnas = COLUMNAS;
  protected readonly filtros = FILTROS;

  protected readonly filtro = signal<FiltroCatalogosAdmin>(filtroCatalogosDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly valorInicialFiltros = valorFiltrosCatalogos(this.filtro());
  private readonly todos = signal<CatalogoAdmin[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly filas = computed(() => this.todos().filter(cumpleFiltro(this.filtro())).map(filaDe));
  protected readonly filasVisibles = computed(() => filasDePagina(this.filas(), { indice: this.filtro().pagina - 1, tamano: this.filtro().tamano }));

  constructor() {
    this.ruta.queryParamMap.pipe(map(filtroCatalogosDesdeUrl), takeUntilDestroyed()).subscribe((filtro) => this.filtro.set(filtro));
    void this.cargar();
  }

  protected filtrar(valor: ValorFiltros): void {
    this.navegar({
      ...this.filtro(),
      q: valor.busqueda.trim() || undefined,
      alcance: ALCANCES_CATALOGO.find((alcance) => alcance === valor[PARAMETRO_URL_CATALOGOS.alcance]),
      pagina: PRIMERA_PAGINA,
    });
  }

  protected paginar({ indice, tamano }: CambioPagina): void {
    this.navegar({ ...this.filtro(), pagina: indice + 1, tamano });
  }

  private navegar(filtro: FiltroCatalogosAdmin): void {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: parametrosUrlCatalogos(filtro) });
  }

  private async cargar(): Promise<void> {
    try {
      this.todos.set(await this.catalogos.listar());
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.cargando.set(false);
    }
  }
}

function cumpleFiltro(filtro: FiltroCatalogosAdmin): (catalogo: CatalogoAdmin) => boolean {
  const busqueda = filtro.q?.toLocaleLowerCase(LOCALE_PERU);
  return (catalogo) => {
    if (filtro.alcance && catalogo.alcance !== filtro.alcance) return false;
    if (!busqueda) return true;
    return catalogo.codigo.toLocaleLowerCase(LOCALE_PERU).includes(busqueda) || catalogo.nombre.toLocaleLowerCase(LOCALE_PERU).includes(busqueda);
  };
}

function filaDe(catalogo: CatalogoAdmin): FilaCatalogoAdmin {
  return {
    codigo: catalogo.codigo,
    nombre: catalogo.nombre,
    alcance: ETIQUETAS_ALCANCE_CATALOGO[catalogo.alcance],
    tonoAlcance: TONOS_ALCANCE_CATALOGO[catalogo.alcance],
    permite: PERMITE_POR_ALCANCE[catalogo.alcance],
  };
}
