import { Component, computed, effect, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SesionService } from '@vitrina/shared/auth';
import { MENSAJES_SHELL, mensajeTerminaA, mensajeTicketSoporte } from '../../models/mensajes-shell';
import { SesionSoporteService } from '../../services/sesion-soporte.service';
import { horaEnLima } from '../../utils/hora-lima';

/** `setTimeout` no admite más de 2^31 - 1 ms; una vigencia de 4 h cabe de sobra. */
const ESPERA_MAXIMA_MS = 2_147_483_647;

/**
 * Franja de la sesión de soporte (TR-RNF-110): a todo el ancho y encima del menú, en todas las pantallas
 * del shell, mientras `mi-contexto` traiga un acceso vigente. Al llegar `hasta` refresca la sesión sola.
 */
@Component({
  selector: 'vit-banner-soporte',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './banner-soporte.component.html',
  styleUrl: './banner-soporte.component.css',
})
export class BannerSoporteComponent {
  private readonly sesion = inject(SesionService);
  private readonly sesionSoporte = inject(SesionSoporteService);

  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly soporte = computed(() => this.sesion.contexto()?.soporte ?? null);
  protected readonly saliendo = this.sesionSoporte.saliendo;
  protected readonly ticket = computed(() => mensajeTicketSoporte(this.soporte()?.ticket ?? ''));
  protected readonly modo = computed(() => (this.soporte()?.modo === 'ESCRITURA' ? MENSAJES_SHELL.lecturaYEscritura : MENSAJES_SHELL.soloLectura));
  protected readonly termina = computed(() => {
    const hasta = this.soporte()?.hasta;
    return hasta ? mensajeTerminaA(horaEnLima(hasta)) : '';
  });

  constructor() {
    effect((alLimpiar) => {
      const hasta = this.soporte()?.hasta;
      if (!hasta) return;
      const espera = Math.min(Math.max(hasta.getTime() - Date.now(), 0), ESPERA_MAXIMA_MS);
      const temporizador = setTimeout(() => void this.sesionSoporte.terminar(), espera);
      alLimpiar(() => clearTimeout(temporizador));
    });
  }

  protected salir(): void {
    void this.sesionSoporte.salir();
  }
}
