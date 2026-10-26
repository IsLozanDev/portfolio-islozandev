import { Component, inject, signal, type OnInit } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PARAMETRO_RETORNO, SesionService } from '@vitrina/shared/auth';
import { DestinoTrasIngresoService } from '../../services/destino-tras-ingreso.service';
import { mensajeDeError } from '../../utils/mensaje-de-error';

/** Regreso de Google o Microsoft: el canje PKCE ya ocurrió al iniciar la sesión. */
@Component({
  selector: 'vit-callback',
  imports: [RouterLink, MatProgressSpinnerModule],
  templateUrl: './callback.page.html',
})
export class CallbackPage implements OnInit {
  private readonly sesion = inject(SesionService);
  private readonly destino = inject(DestinoTrasIngresoService);
  private readonly retorno = inject(ActivatedRoute).snapshot.queryParamMap.get(PARAMETRO_RETORNO);

  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      await this.sesion.completarCallback();
      await this.destino.irAlDestino(this.retorno);
    } catch (error) {
      this.error.set(mensajeDeError(error));
    }
  }
}
