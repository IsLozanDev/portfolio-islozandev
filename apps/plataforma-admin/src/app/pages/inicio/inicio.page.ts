import { NgComponentOutlet } from '@angular/common';
import { Component, computed, effect, inject, signal, type Type } from '@angular/core';
import { SesionService, SiPermisoDirective } from '@vitrina/shared/auth';

/** Consumo DNI/RUC del propio tenant (spec 30). */
export const PERMISO_CUOTA_IDENTIDAD = 'plat.identidad.cuota';

/** Portada dentro del layout: el cambio de sucursal y la salida están en el encabezado del shell. */
@Component({
  selector: 'vit-inicio',
  imports: [NgComponentOutlet, SiPermisoDirective],
  templateUrl: './inicio.page.html',
})
export class InicioPage {
  private readonly sesion = inject(SesionService);

  protected readonly permisoCuotaIdentidad = PERMISO_CUOTA_IDENTIDAD;
  protected readonly correo = computed(() => this.sesion.sesion()?.user.email ?? '');
  protected readonly sucursalActual = computed(() => {
    const contexto = this.sesion.contexto();
    return contexto?.sucursales.find((sucursal) => sucursal.id === contexto.sucursalActual) ?? null;
  });
  protected readonly tarjetaConsumo = signal<Type<unknown> | null>(null);

  constructor() {
    effect(() => this.cargarTarjetaConsumo());
  }

  /** `admin-cliente` es lazy (sus rutas): la tarjeta se trae con `import()` y solo con el permiso, así no baja el chunk ni pide cuota-actual. */
  private cargarTarjetaConsumo(): void {
    if (this.tarjetaConsumo() || !this.sesion.tiene(PERMISO_CUOTA_IDENTIDAD)) return;
    void import('@vitrina/plataforma/admin-cliente').then(({ TarjetaConsumoIdentidadComponent }) => this.tarjetaConsumo.set(TarjetaConsumoIdentidadComponent));
  }
}
