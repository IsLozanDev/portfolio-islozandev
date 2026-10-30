import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { MENSAJES_SHELL } from '../../models/mensajes-shell';
import { VolverAService } from '../../services/volver-a.service';

@Component({
  selector: 'vit-menu-usuario',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './menu-usuario.component.html',
})
export class MenuUsuarioComponent {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly rutas = inject(CONFIG_AUTH).rutas;
  private readonly volverA = inject(VolverAService);

  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly correo = computed(() => this.sesion.sesion()?.user.email ?? '');

  protected async salir(): Promise<void> {
    this.volverA.limpiar();
    await this.sesion.salir();
    await this.router.navigateByUrl(this.rutas.ingresar);
  }
}
