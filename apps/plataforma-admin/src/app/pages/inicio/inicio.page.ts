import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';

/** Portada provisional hasta el shell del spec 15. */
@Component({
  selector: 'vit-inicio',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './inicio.page.html',
})
export class InicioPage {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly rutas = inject(CONFIG_AUTH).rutas;

  protected readonly rutaSelector = this.rutas.seleccionarSucursal;
  protected readonly correo = computed(() => this.sesion.sesion()?.user.email ?? '');
  protected readonly sucursalActual = computed(() => {
    const contexto = this.sesion.contexto();
    return contexto?.sucursales.find((sucursal) => sucursal.id === contexto.sucursalActual) ?? null;
  });
  protected readonly puedeCambiarSucursal = computed(() => (this.sesion.contexto()?.sucursales.length ?? 0) > 1);

  protected async salir(): Promise<void> {
    await this.sesion.salir();
    await this.router.navigateByUrl(this.rutas.ingresar);
  }
}
