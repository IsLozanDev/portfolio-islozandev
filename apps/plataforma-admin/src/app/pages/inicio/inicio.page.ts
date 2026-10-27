import { Component, computed, inject } from '@angular/core';
import { SesionService } from '@vitrina/shared/auth';

/** Portada dentro del layout: el cambio de sucursal y la salida están en el encabezado del shell. */
@Component({
  selector: 'vit-inicio',
  templateUrl: './inicio.page.html',
})
export class InicioPage {
  private readonly sesion = inject(SesionService);

  protected readonly correo = computed(() => this.sesion.sesion()?.user.email ?? '');
  protected readonly sucursalActual = computed(() => {
    const contexto = this.sesion.contexto();
    return contexto?.sucursales.find((sucursal) => sucursal.id === contexto.sucursalActual) ?? null;
  });
}
