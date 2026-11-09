import { Component, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormularioItemComponent, type ItemCatalogo, type SolicitudItem } from '@vitrina/plataforma/catalogos-ui';
import { AvisosService, CargandoComponent, EstadoVacioComponent } from '@vitrina/shared/ui';
import { provideFechaPeru } from '../../config/provide-fecha-peru';
import type { OrigenItem } from '../../models/catalogo-admin';
import { aErrorAdmin, CODIGO_VERSION_OBSOLETA, type ErrorAdmin } from '../../models/error-admin';
import { MENSAJES_FORMULARIO_ITEM_PROPIO } from '../../models/mensajes-catalogos-admin';
import { CatalogosAdminCliente } from '../../services/catalogos-admin.cliente';
import { PARAMETRO_URL_CATALOGOS } from '../../utils/filtro-url-catalogos';

const PARAMETRO_CODIGO = 'codigo';
const PARAMETRO_ITEM = 'id';
const CODIGO_ITEM_NO_ENCONTRADO = 'ITEM_NO_ENCONTRADO';
/** TR-CA-069: el código repite un global o un propio del tenant. */
const CODIGO_DUPLICADO = 'CODIGO_DUPLICADO';
const CAMPO_CODIGO = 'codigo';
const ORIGEN_PROPIO: OrigenItem = 'PROPIO';

/** Alta (`catalogos/:codigo/items/nuevo`) y edición (`.../items/:id/editar`) de un ítem propio del tenant (TR-RF-026). */
@Component({
  selector: 'vit-item-propio-formulario',
  imports: [MatButtonModule, RouterLink, CargandoComponent, EstadoVacioComponent, FormularioItemComponent],
  providers: [provideFechaPeru()],
  templateUrl: './item-propio-formulario.page.html',
})
export class ItemPropioFormularioPage {
  private readonly catalogos = inject(CatalogosAdminCliente);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly formulario = viewChild(FormularioItemComponent);

  protected readonly mensajes = MENSAJES_FORMULARIO_ITEM_PROPIO;
  /** La ruta que monta la lib (`admin`): el detalle cuelga de `catalogos/:codigo`. */
  protected readonly rutaMontaje = this.ruta.parent;
  protected readonly codigoCatalogo = this.ruta.snapshot.paramMap.get(PARAMETRO_CODIGO) ?? '';
  /** null en el alta. */
  protected readonly itemId = this.ruta.snapshot.paramMap.get(PARAMETRO_ITEM);
  protected readonly catalogo = { codigo: this.codigoCatalogo };
  protected readonly subtitulo = MENSAJES_FORMULARIO_ITEM_PROPIO.catalogo(this.codigoCatalogo);
  protected readonly rutaDetalle = ['catalogos', this.codigoCatalogo];
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
      await this.enviar(solicitud);
    } catch (error) {
      this.mostrarError(aErrorAdmin(error));
    } finally {
      this.guardando.set(false);
    }
  }

  /** Vuelve al detalle con el filtro «Propio»: ahí aparece el ítem recién guardado (TR-CA-068). */
  protected volverAlDetalle(): Promise<boolean> {
    return this.router.navigate(this.rutaDetalle, { relativeTo: this.rutaMontaje, queryParams: { [PARAMETRO_URL_CATALOGOS.origen]: ORIGEN_PROPIO } });
  }

  private async enviar(solicitud: SolicitudItem): Promise<void> {
    const item = this.item();
    if (item) {
      await this.catalogos.actualizarPropio(this.codigoCatalogo, item.id, solicitud, item.version);
      this.avisos.toast('exito', MENSAJES_FORMULARIO_ITEM_PROPIO.actualizado);
    } else {
      await this.catalogos.crearPropio(this.codigoCatalogo, solicitud);
      this.avisos.toast('exito', MENSAJES_FORMULARIO_ITEM_PROPIO.creado);
    }
    await this.volverAlDetalle();
  }

  private mostrarError(error: ErrorAdmin): void {
    if (error.codigo === CODIGO_VERSION_OBSOLETA) {
      this.versionObsoleta.set(true);
      return;
    }
    const formulario = this.formulario();
    if (error.codigo === CODIGO_DUPLICADO && formulario) {
      formulario.marcarError(CAMPO_CODIGO, MENSAJES_FORMULARIO_ITEM_PROPIO.codigoDuplicado);
      return;
    }
    this.error.set(error.message);
  }

  private async cargar(itemId: string): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.versionObsoleta.set(false);
    try {
      this.item.set(await this.catalogos.obtenerPropio(this.codigoCatalogo, itemId));
    } catch (error) {
      const errorAdmin = aErrorAdmin(error);
      if (errorAdmin.codigo === CODIGO_ITEM_NO_ENCONTRADO) this.noExiste.set(true);
      else this.error.set(errorAdmin.message);
    } finally {
      this.cargando.set(false);
    }
  }
}
