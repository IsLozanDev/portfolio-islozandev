import { Component, inject, signal, type OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router } from '@angular/router';
import { CONFIG_AUTH, PARAMETRO_RETORNO, rutaDeRetorno, SesionService, type ContextoUsuario } from '@vitrina/shared/auth';
import { CargandoComponent } from '@vitrina/shared/ui';
import { MENSAJES_SHELL } from '../../models/mensajes-shell';

type Sucursal = ContextoUsuario['sucursales'][number];

/** TR-RF-016: la sucursal actual es la última que recuerda el servidor y sale marcada. */
@Component({
  selector: 'vit-seleccionar-sucursal',
  imports: [MatButtonModule, CargandoComponent],
  templateUrl: './seleccionar-sucursal.page.html',
})
export class SeleccionarSucursalPage implements OnInit {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly rutas = inject(CONFIG_AUTH).rutas;
  private readonly retorno = inject(ActivatedRoute).snapshot.queryParamMap.get(PARAMETRO_RETORNO);

  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly sucursales = signal<Sucursal[] | null>(null);
  protected readonly sucursalActual = signal<string | null>(null);
  protected readonly eligiendo = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const contexto = this.sesion.contexto() ?? (await this.sesion.cargarContexto());
      if (contexto.sinAccesos) {
        await this.router.navigateByUrl(this.rutas.sinAccesos);
        return;
      }
      this.sucursales.set(contexto.sucursales);
      this.sucursalActual.set(contexto.sucursalActual);
    } catch {
      this.error.set(MENSAJES_SHELL.errorCargarSucursales);
    }
  }

  protected async elegir(sucursalId: string): Promise<void> {
    this.eligiendo.set(sucursalId);
    this.error.set(null);
    try {
      await this.sesion.seleccionarSucursal(sucursalId);
      await this.router.navigateByUrl(rutaDeRetorno(this.retorno, this.rutas.inicio));
    } catch {
      this.error.set(MENSAJES_SHELL.errorCargarSucursales);
    } finally {
      this.eligiendo.set(null);
    }
  }
}
