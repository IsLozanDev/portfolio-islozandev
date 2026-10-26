import { Component, inject, signal, type OnInit } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ErrorAuth, SesionService } from '@vitrina/shared/auth';
import { DestinoTrasIngresoService } from '../../services/destino-tras-ingreso.service';
import { mensajeDeError } from '../../utils/mensaje-de-error';
import { clavesCoinciden, ERROR_CLAVES_DISTINTAS, LONGITUD_MINIMA_CLAVE } from '../../utils/validadores-clave';

const PARAMETRO_TOKEN_HASH = 'token_hash';
const PARAMETRO_TIPO = 'type';
const TIPO_RECUPERACION = 'recovery';

type EstadoNuevaClave = 'verificando' | 'formulario' | 'enlace-invalido';

/** Destino del correo de recuperación: canjea el `token_hash` y pide la clave nueva. */
@Component({
  selector: 'vit-nueva-clave',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule],
  templateUrl: './nueva-clave.page.html',
})
export class NuevaClavePage implements OnInit {
  private readonly sesion = inject(SesionService);
  private readonly destino = inject(DestinoTrasIngresoService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly longitudMinima = LONGITUD_MINIMA_CLAVE;
  protected readonly errorClavesDistintas = ERROR_CLAVES_DISTINTAS;
  protected readonly estado = signal<EstadoNuevaClave>('verificando');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formulario = inject(NonNullableFormBuilder).group(
    {
      clave: ['', [Validators.required, Validators.minLength(LONGITUD_MINIMA_CLAVE)]],
      confirmacion: ['', Validators.required],
    },
    { validators: clavesCoinciden },
  );

  async ngOnInit(): Promise<void> {
    const parametros = this.ruta.snapshot.queryParamMap;
    const tokenHash = parametros.get(PARAMETRO_TOKEN_HASH);
    try {
      if (!tokenHash || parametros.get(PARAMETRO_TIPO) !== TIPO_RECUPERACION) throw new ErrorAuth('ENLACE_INVALIDO');
      await this.sesion.verificarEnlace(tokenHash, TIPO_RECUPERACION);
      await this.quitarTokenDeLaUrl();
      this.estado.set('formulario');
    } catch (error) {
      this.error.set(mensajeDeError(error));
      this.estado.set('enlace-invalido');
    }
  }

  protected async guardar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    try {
      await this.sesion.actualizarClave(this.formulario.getRawValue().clave);
      await this.destino.irAlDestino(null);
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.enviando.set(false);
    }
  }

  /** El `token_hash` ya se usó: que no quede en el historial ni en capturas. */
  private quitarTokenDeLaUrl(): Promise<boolean> {
    return this.router.navigate([], { relativeTo: this.ruta, queryParams: {}, replaceUrl: true });
  }
}
