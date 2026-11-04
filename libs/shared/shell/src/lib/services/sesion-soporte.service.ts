import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { MENSAJES_SHELL } from '../models/mensajes-shell';

const RUTA_INICIO = '/';

/**
 * Salida y fin de la sesión de soporte (spec 18). Tras cualquiera de los dos el token nuevo vuelve al
 * tenant operador: se recarga el contexto y se va al inicio, porque la página actual era del cliente.
 */
@Injectable({ providedIn: 'root' })
export class SesionSoporteService {
  private readonly sesion = inject(SesionService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ocupado = signal(false);

  /** Mientras sale o refresca, el botón queda deshabilitado: un doble clic no repite la salida. */
  readonly saliendo = this.ocupado.asReadonly();

  async salir(): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    try {
      await this.sesion.salirDeSoporte();
      this.avisos.toast('info', MENSAJES_SHELL.saliDeSoporte);
      await this.router.navigateByUrl(RUTA_INICIO);
    } catch {
      this.avisos.toast('error', MENSAJES_SHELL.errorSalirDeSoporte);
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Llegó `hasta`: la API ya niega; se refresca la sesión sin que el agente haga nada (TR-RNF-014). */
  async terminar(): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    try {
      await this.sesion.refrescarSesion();
    } catch {
      // Si el refresh falla, al menos se deja de mostrar un banner vencido: el contexto viejo ya no vale.
      await this.sesion.intentarCargarContexto();
    } finally {
      this.ocupado.set(false);
    }
    this.avisos.toast('info', MENSAJES_SHELL.soporteTermino);
    await this.router.navigateByUrl(RUTA_INICIO);
  }
}
