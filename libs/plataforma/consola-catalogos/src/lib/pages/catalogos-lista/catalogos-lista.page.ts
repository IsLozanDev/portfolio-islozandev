import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SiPermisoDirective } from '@vitrina/shared/auth';
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
import { ALCANCES_CATALOGO, type AlcanceCatalogo, type Catalogo } from '../../models/catalogo';
import { aErrorCatalogos } from '../../models/error-catalogos';
import { COLUMNAS_CATALOGOS, ETIQUETAS_ALCANCE, MENSAJES_CATALOGOS } from '../../models/mensajes-catalogos';
import { PERMISOS_CATALOGOS } from '../../models/permisos-catalogos';
import { TONOS_ALCANCE } from '../../models/tonos';
import { CatalogosCliente } from '../../services/catalogos.cliente';
import { filtroCatalogosDesdeUrl, PARAMETRO_URL, parametrosUrlCatalogos, valorFiltrosCatalogos, type FiltroCatalogos } from '../../utils/filtro-url';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaCatalogo {
  codigo: string;
  nombre: string;
  alcance: string;
  tonoAlcance: TonoEstado;
  fuente: string;
  version: number;
  importable: string;
  esImportable: boolean;
}

const ICONO_IMPORTABLE = 'upload_file';

const COLUMNAS: ColumnaTabla<FilaCatalogo>[] = [
  { clave: 'codigo', titulo: COLUMNAS_CATALOGOS.codigo, movil: 'titulo' },
  { clave: 'nombre', titulo: COLUMNAS_CATALOGOS.nombre, movil: 'detalle' },
  { clave: 'alcance', titulo: COLUMNAS_CATALOGOS.alcance, movil: 'estado', tono: (fila) => fila.tonoAlcance },
  { clave: 'fuente', titulo: COLUMNAS_CATALOGOS.fuente },
  { clave: 'version', titulo: COLUMNAS_CATALOGOS.version },
  { clave: 'importable', titulo: COLUMNAS_CATALOGOS.importable, icono: (fila) => (fila.esImportable ? ICONO_IMPORTABLE : null) },
];

const FILTROS: DefinicionFiltro[] = [
  {
    clave: PARAMETRO_URL.alcance,
    etiqueta: COLUMNAS_CATALOGOS.alcance,
    opciones: ALCANCES_CATALOGO.map((alcance) => ({ valor: alcance, etiqueta: ETIQUETAS_ALCANCE[alcance] })),
  },
];

/** Catálogos de la plataforma (TR-RF-022). La API no pagina: el filtro y la página son del cliente, en la URL. */
@Component({
  selector: 'vit-catalogos-lista',
  imports: [MatButtonModule, MatIconModule, RouterLink, SiPermisoDirective, AccionesFilaDirective, FiltrosComponent, TablaComponent],
  templateUrl: './catalogos-lista.page.html',
})
export class CatalogosListaPage {
  private readonly catalogos = inject(CatalogosCliente);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_CATALOGOS;
  protected readonly permisos = PERMISOS_CATALOGOS;
  protected readonly columnas = COLUMNAS;
  protected readonly filtros = FILTROS;

  protected readonly filtro = signal<FiltroCatalogos>(filtroCatalogosDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly valorInicialFiltros = valorFiltrosCatalogos(this.filtro());
  private readonly todos = signal<Catalogo[]>([]);
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
      alcance: (valor[PARAMETRO_URL.alcance] as AlcanceCatalogo | null) ?? undefined,
      pagina: 1,
    });
  }

  protected paginar({ indice, tamano }: CambioPagina): void {
    this.navegar({ ...this.filtro(), pagina: indice + 1, tamano });
  }

  private navegar(filtro: FiltroCatalogos): void {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: parametrosUrlCatalogos(filtro) });
  }

  private async cargar(): Promise<void> {
    try {
      this.todos.set(await this.catalogos.listar());
    } catch (error) {
      this.error.set(aErrorCatalogos(error).message);
    } finally {
      this.cargando.set(false);
    }
  }
}

function cumpleFiltro(filtro: FiltroCatalogos): (catalogo: Catalogo) => boolean {
  const busqueda = filtro.q?.toLocaleLowerCase('es-PE');
  return (catalogo) => {
    if (filtro.alcance && catalogo.alcance !== filtro.alcance) return false;
    if (!busqueda) return true;
    return catalogo.codigo.toLocaleLowerCase('es-PE').includes(busqueda) || catalogo.nombre.toLocaleLowerCase('es-PE').includes(busqueda);
  };
}

function filaDe(catalogo: Catalogo): FilaCatalogo {
  return {
    codigo: catalogo.codigo,
    nombre: catalogo.nombre,
    alcance: ETIQUETAS_ALCANCE[catalogo.alcance],
    tonoAlcance: TONOS_ALCANCE[catalogo.alcance],
    fuente: catalogo.fuente ?? MENSAJES_CATALOGOS.sinFuente,
    version: catalogo.version,
    importable: catalogo.importable ? MENSAJES_CATALOGOS.importable : MENSAJES_CATALOGOS.noImportable,
    esImportable: catalogo.importable,
  };
}
