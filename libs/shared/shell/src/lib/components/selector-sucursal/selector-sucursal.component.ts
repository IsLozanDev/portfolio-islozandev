import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { CONFIG_AUTH, SesionService, type ContextoUsuario } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { mensajeAhoraTrabajaEn, MENSAJES_SHELL } from '../../models/mensajes-shell';

type Sucursal = ContextoUsuario['sucursales'][number];

/** El selector muestra su propio error: el interceptor no abre su modal. */
const ERROR_PROPIO = { omitirAvisoError: true };

/**
 * TR-RF-016 en el encabezado. Tras cambiar va al inicio: ninguna página queda con
 * datos de la sucursal anterior (TR-RNF-010) y la ruta abierta puede no existir en el menú nuevo.
 */
@Component({
  selector: 'vit-selector-sucursal',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './selector-sucursal.component.html',
})
export class SelectorSucursalComponent {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly avisos = inject(AvisosService);
  private readonly rutaInicio = inject(CONFIG_AUTH).rutas.inicio;

  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly cambiando = signal(false);
  protected readonly sucursales = computed(() =>
    [...(this.sesion.contexto()?.sucursales ?? [])].sort((una, otra) => una.nombre.localeCompare(otra.nombre, 'es')),
  );
  protected readonly actual = computed(() => this.sucursales().find((sucursal) => sucursal.id === this.sesion.contexto()?.sucursalActual) ?? null);

  protected async elegir(sucursal: Sucursal): Promise<void> {
    if (sucursal.id === this.actual()?.id) return;
    this.cambiando.set(true);
    try {
      await this.sesion.seleccionarSucursal(sucursal.id, ERROR_PROPIO);
      await this.router.navigateByUrl(this.rutaInicio);
      this.avisos.toast('exito', mensajeAhoraTrabajaEn(sucursal.nombre));
    } catch {
      void this.avisos.error(MENSAJES_SHELL.errorCambiarSucursal);
    } finally {
      this.cambiando.set(false);
    }
  }
}
