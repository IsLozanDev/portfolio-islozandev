import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PARAMETRO_RETORNO, rutaDeRetorno, SesionService, type ProveedorExterno } from '@vitrina/shared/auth';
import { DestinoTrasIngresoService } from '../../services/destino-tras-ingreso.service';
import { mensajeDeError } from '../../utils/mensaje-de-error';

const PARAMETRO_MOTIVO = 'motivo';
const MOTIVO_INACTIVIDAD = 'inactividad';
const SIN_RETORNO = '';

export const AVISO_INACTIVIDAD = 'Su sesión se cerró por inactividad. Ingrese de nuevo.';

@Component({
  selector: 'vit-ingresar',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule],
  templateUrl: './ingresar.page.html',
})
export class IngresarPage {
  private readonly sesion = inject(SesionService);
  private readonly destino = inject(DestinoTrasIngresoService);
  private readonly parametros = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly retorno = this.parametros.get(PARAMETRO_RETORNO);

  protected readonly avisoInactividad = AVISO_INACTIVIDAD;
  protected readonly cerradaPorInactividad = this.parametros.get(PARAMETRO_MOTIVO) === MOTIVO_INACTIVIDAD;
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formulario = inject(NonNullableFormBuilder).group({
    correo: ['', [Validators.required, Validators.email]],
    clave: ['', Validators.required],
  });

  protected async ingresar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const { correo, clave } = this.formulario.getRawValue();
    await this.ejecutar(async () => {
      await this.sesion.ingresarConClave(correo, clave);
      await this.destino.irAlDestino(this.retorno);
    });
  }

  /** Supabase saca al navegador hacia el proveedor; el regreso lo atiende la página de callback. */
  protected async ingresarCon(proveedor: ProveedorExterno): Promise<void> {
    const retornoSeguro = rutaDeRetorno(this.retorno, SIN_RETORNO) || undefined;
    await this.ejecutar(() => this.sesion.ingresarConProveedor(proveedor, retornoSeguro));
  }

  private async ejecutar(accion: () => Promise<unknown>): Promise<void> {
    this.enviando.set(true);
    this.error.set(null);
    try {
      await accion();
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.enviando.set(false);
    }
  }
}
