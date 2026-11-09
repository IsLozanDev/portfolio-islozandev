import { Component, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormularioItemComponent, type ItemCatalogo, type SolicitudItem } from '@vitrina/plataforma/catalogos-ui';
import { AccionSensibleService } from '@vitrina/shared/shell';
import { AvisosService, CargandoComponent, EstadoVacioComponent } from '@vitrina/shared/ui';
import { provideFechaPeru } from '../../config/provide-fecha-peru';
import { aErrorCatalogos, type ErrorCatalogos } from '../../models/error-catalogos';
import { mensajeCatalogoDelItem, MENSAJES_FORMULARIO_ITEM_CONSOLA } from '../../models/mensajes-catalogos';
import { ItemsCliente } from '../../services/items.cliente';
import { PARAMETRO_URL_DETALLE, PESTANA_POR_DEFECTO } from '../../utils/filtro-url';

const PARAMETRO_CODIGO = 'codigo';
const PARAMETRO_ITEM = 'id';
const CODIGO_VERSION_OBSOLETA = 'VERSION_OBSOLETA';
const CODIGO_ITEM_NO_ENCONTRADO = 'ITEM_NO_ENCONTRADO';
const CAMPO_CODIGO = 'codigo';

/** Alta (`:codigo/items/nuevo`) y edición (`:codigo/items/:id/editar`) de un ítem global (TR-RF-023, TR-CA-060 y 062). */
@Component({
  selector: 'vit-item-formulario',
  imports: [MatButtonModule, RouterLink, CargandoComponent, EstadoVacioComponent, FormularioItemComponent],
  providers: [provideFechaPeru()],
  templateUrl: './item-formulario.page.html',
})
export class ItemFormularioPage {
  private readonly items = inject(ItemsCliente);
  private readonly accionSensible = inject(AccionSensibleService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly formulario = viewChild(FormularioItemComponent);

  protected readonly mensajes = MENSAJES_FORMULARIO_ITEM_CONSOLA;
  /** La ruta que monta la lib (`consola/catalogos`): el detalle cuelga de ella. */
  protected readonly rutaMontaje = this.ruta.parent;
  protected readonly codigoCatalogo = this.ruta.snapshot.paramMap.get(PARAMETRO_CODIGO) ?? '';
  /** null en el alta. */
  protected readonly itemId = this.ruta.snapshot.paramMap.get(PARAMETRO_ITEM);
  protected readonly catalogo = { codigo: this.codigoCatalogo };
  protected readonly subtitulo = mensajeCatalogoDelItem(this.codigoCatalogo);
  protected readonly parametrosDetalle = { [PARAMETRO_URL_DETALLE.pestana]: PESTANA_POR_DEFECTO };
  protected readonly item = signal<ItemCatalogo | null>(null);
  protected readonly cargando = signal(this.itemId !== null);
  protected readonly noExiste = signal(false);
  protected readonly versionObsoleta = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    if (this.itemId) void this.cargar(this.itemId);
  }

  /** TR-RNF-008: trae lo que guardó el otro usuario y descarta lo editado aquí. */
  protected recargar(): void {
    if (this.itemId) void this.cargar(this.itemId);
  }

  protected async guardar(solicitud: SolicitudItem): Promise<void> {
    if (this.guardando()) return;
    this.guardando.set(true);
    this.error.set(null);
    this.versionObsoleta.set(false);
    try {
      if (!(await this.accionSensible.exigirMfa())) return;
      await this.enviar(solicitud);
    } catch (error) {
      this.mostrarError(aErrorCatalogos(error));
    } finally {
      this.guardando.set(false);
    }
  }

  protected volverAlDetalle(): Promise<boolean> {
    return this.router.navigate([this.codigoCatalogo], { relativeTo: this.rutaMontaje, queryParams: this.parametrosDetalle });
  }

  private async enviar(solicitud: SolicitudItem): Promise<void> {
    const item = this.item();
    if (item) {
      await this.items.actualizar(this.codigoCatalogo, item.id, solicitud, item.version);
      this.avisos.toast('exito', MENSAJES_FORMULARIO_ITEM_CONSOLA.actualizado);
    } else {
      await this.items.crear(this.codigoCatalogo, solicitud);
      this.avisos.toast('exito', MENSAJES_FORMULARIO_ITEM_CONSOLA.creado);
    }
    await this.volverAlDetalle();
  }

  private mostrarError(error: ErrorCatalogos): void {
    if (error.codigo === CODIGO_VERSION_OBSOLETA) {
      this.versionObsoleta.set(true);
      return;
    }
    const formulario = this.formulario();
    if (error.campo === CAMPO_CODIGO && formulario) {
      formulario.marcarError(CAMPO_CODIGO, error.message);
      return;
    }
    this.error.set(error.message);
  }

  private async cargar(itemId: string): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.versionObsoleta.set(false);
    try {
      this.item.set(await this.items.obtener(this.codigoCatalogo, itemId));
    } catch (error) {
      const errorCatalogos = aErrorCatalogos(error);
      if (errorCatalogos.codigo === CODIGO_ITEM_NO_ENCONTRADO) this.noExiste.set(true);
      else this.error.set(errorCatalogos.message);
    } finally {
      this.cargando.set(false);
    }
  }
}
