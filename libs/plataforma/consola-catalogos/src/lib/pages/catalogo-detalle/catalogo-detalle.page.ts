import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import { CargandoComponent, ChipEstadoComponent, EstadoVacioComponent } from '@vitrina/shared/ui';
import { map } from 'rxjs';
import { HistorialImportacionesComponent } from '../../components/historial-importaciones/historial-importaciones.component';
import { ItemsCatalogoComponent } from '../../components/items-catalogo/items-catalogo.component';
import type { Catalogo } from '../../models/catalogo';
import { aErrorCatalogos } from '../../models/error-catalogos';
import { ETIQUETAS_ALCANCE, MENSAJES_DETALLE_CATALOGO, MENSAJES_CATALOGOS } from '../../models/mensajes-catalogos';
import { PERMISOS_CATALOGOS } from '../../models/permisos-catalogos';
import { TONOS_ALCANCE } from '../../models/tonos';
import { CatalogosCliente } from '../../services/catalogos.cliente';
import { PARAMETRO_URL_DETALLE, PESTANA_POR_DEFECTO, pestanaDesdeUrl, type PestanaDetalle } from '../../utils/filtro-url';

const PARAMETRO_CODIGO = 'codigo';

/** Detalle de un catálogo con sus pestañas «Ítems» e «Importaciones» (esta, solo si es importable); la pestaña va en la URL. */
@Component({
  selector: 'vit-catalogo-detalle',
  imports: [MatButtonModule, MatIconModule, MatTabsModule, RouterLink, SiPermisoDirective, CargandoComponent, ChipEstadoComponent, EstadoVacioComponent, HistorialImportacionesComponent, ItemsCatalogoComponent],
  templateUrl: './catalogo-detalle.page.html',
})
export class CatalogoDetallePage {
  private readonly catalogos = inject(CatalogosCliente);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_DETALLE_CATALOGO;
  protected readonly sinFuente = MENSAJES_CATALOGOS.sinFuente;
  protected readonly etiquetasAlcance = ETIQUETAS_ALCANCE;
  protected readonly tonosAlcance = TONOS_ALCANCE;
  protected readonly permisos = PERMISOS_CATALOGOS;
  /** La ruta que monta la lib (`consola/catalogos`): la lista cuelga de ella. */
  protected readonly rutaMontaje = this.ruta.parent;
  protected readonly codigo = this.ruta.snapshot.paramMap.get(PARAMETRO_CODIGO) ?? '';
  protected readonly catalogo = signal<Catalogo | null>(null);
  protected readonly cargando = signal(true);
  protected readonly noExiste = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly pestanaPedida = toSignal(this.ruta.queryParamMap.pipe(map(pestanaDesdeUrl)), { initialValue: PESTANA_POR_DEFECTO });
  /** «Importaciones» solo existe en las tablas importables: en las demás se queda en «Ítems». */
  protected readonly pestana = computed<PestanaDetalle>(() => (this.catalogo()?.importable ? this.pestanaPedida() : PESTANA_POR_DEFECTO));

  constructor() {
    void this.cargar();
  }

  protected parametrosDePestana(pestana: PestanaDetalle): Record<string, string> {
    return { [PARAMETRO_URL_DETALLE.pestana]: pestana };
  }

  private async cargar(): Promise<void> {
    try {
      const catalogo = (await this.catalogos.listar()).find((candidato) => candidato.codigo === this.codigo);
      if (catalogo) this.catalogo.set(catalogo);
      else this.noExiste.set(true);
    } catch (error) {
      this.error.set(aErrorCatalogos(error).message);
    } finally {
      this.cargando.set(false);
    }
  }
}
