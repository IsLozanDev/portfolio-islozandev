import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { type PreferenciaTema, TemaService } from '@vitrina/shared/ui';
import { MENSAJES_SHELL } from '../../models/mensajes-shell';
import { VolverAService } from '../../services/volver-a.service';

interface OpcionTema {
  readonly valor: PreferenciaTema;
  readonly etiqueta: string;
  readonly icono: string;
}

const OPCIONES_TEMA: readonly OpcionTema[] = [
  { valor: 'sistema', etiqueta: MENSAJES_SHELL.temaSistema, icono: 'contrast' },
  { valor: 'claro', etiqueta: MENSAJES_SHELL.temaClaro, icono: 'light_mode' },
  { valor: 'oscuro', etiqueta: MENSAJES_SHELL.temaOscuro, icono: 'dark_mode' },
];

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
  private readonly tema = inject(TemaService);

  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly opcionesTema = OPCIONES_TEMA;
  protected readonly preferenciaTema = this.tema.preferencia;
  protected readonly correo = computed(() => this.sesion.sesion()?.user.email ?? '');
  protected readonly inicial = computed(() => this.correo().charAt(0).toLocaleUpperCase('es-PE'));

  protected elegirTema(preferencia: PreferenciaTema): void {
    this.tema.elegir(preferencia);
  }

  protected async salir(): Promise<void> {
    this.volverA.limpiar();
    await this.sesion.salir();
    await this.router.navigateByUrl(this.rutas.ingresar);
  }
}
