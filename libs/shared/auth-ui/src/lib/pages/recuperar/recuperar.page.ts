import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { SesionService } from '@vitrina/shared/auth';
import { mensajeDeError } from '../../utils/mensaje-de-error';

/** Igual exista o no la cuenta (TR-RNF-012). */
export const CONFIRMACION_RECUPERAR = 'Si el correo está registrado, le enviamos un enlace para elegir una clave nueva.';

@Component({
  selector: 'vit-recuperar',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule],
  templateUrl: './recuperar.page.html',
})
export class RecuperarPage {
  private readonly sesion = inject(SesionService);

  protected readonly confirmacion = CONFIRMACION_RECUPERAR;
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formulario = inject(NonNullableFormBuilder).group({
    correo: ['', [Validators.required, Validators.email]],
  });

  /** `recuperarClave` solo falla por límite de intentos o red; lo demás se calla en la lib. */
  protected async enviar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    try {
      await this.sesion.recuperarClave(this.formulario.getRawValue().correo);
      this.enviado.set(true);
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.enviando.set(false);
    }
  }
}
