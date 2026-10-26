import { Component, inject, signal, type OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { CONFIG_AUTH, PARAMETRO_RETORNO, rutaDeRetorno, SesionService, type ContextoUsuario } from '@vitrina/shared/auth';

type Sucursal = ContextoUsuario['sucursales'][number];

export const ERROR_CARGAR_SUCURSALES = 'No se pudieron cargar sus sucursales. Inténtelo de nuevo.';

/** Selector provisional (TR-RF-016); el real, con la última usada preseleccionada en el encabezado, es del spec 15. */
@Component({
  selector: 'vit-seleccionar-sucursal',
  imports: [MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './seleccionar-sucursal.page.html',
})
export class SeleccionarSucursalPage implements OnInit {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly rutas = inject(CONFIG_AUTH).rutas;
  private readonly retorno = inject(ActivatedRoute).snapshot.queryParamMap.get(PARAMETRO_RETORNO);

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
      this.error.set(ERROR_CARGAR_SUCURSALES);
    }
  }

  protected async elegir(sucursalId: string): Promise<void> {
    this.eligiendo.set(sucursalId);
    this.error.set(null);
    try {
      await this.sesion.seleccionarSucursal(sucursalId);
      await this.router.navigateByUrl(rutaDeRetorno(this.retorno, this.rutas.inicio));
    } catch {
      this.error.set(ERROR_CARGAR_SUCURSALES);
    } finally {
      this.eligiendo.set(null);
    }
  }
}
