import { CdkCopyToClipboard } from '@angular/cdk/clipboard';
import { Component, inject, signal, type OnInit } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { CONFIG_AUTH, MfaService, PARAMETRO_RETORNO, rutaDeRetorno, SesionService, type EnrolamientoTotp } from '@vitrina/shared/auth';
import { mensajeDeError } from '../../utils/mensaje-de-error';

const PATRON_CODIGO_TOTP = /^\d{6}$/;

type EstadoPaginaMfa = 'cargando' | 'verificar' | 'enrolar' | 'sin-estado';

/** Segundo factor al ingresar y en el step-up: verifica si hay TOTP; si no, lo enrola primero. */
@Component({
  selector: 'vit-mfa',
  imports: [ReactiveFormsModule, CdkCopyToClipboard, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule],
  templateUrl: './mfa.page.html',
})
export class MfaPage implements OnInit {
  private readonly mfa = inject(MfaService);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly rutas = inject(CONFIG_AUTH).rutas;
  private readonly retorno = inject(ActivatedRoute).snapshot.queryParamMap.get(PARAMETRO_RETORNO);
  private factorId: string | null = null;

  protected readonly estado = signal<EstadoPaginaMfa>('cargando');
  protected readonly enrolamiento = signal<EnrolamientoTotp | null>(null);
  protected readonly secretoCopiado = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formulario = inject(NonNullableFormBuilder).group({
    codigo: ['', [Validators.required, Validators.pattern(PATRON_CODIGO_TOTP)]],
  });

  async ngOnInit(): Promise<void> {
    try {
      const { factorTotpId } = await this.mfa.estado();
      if (factorTotpId) {
        this.factorId = factorTotpId;
        this.estado.set('verificar');
        return;
      }
      await this.enrolar();
    } catch (error) {
      this.error.set(mensajeDeError(error));
      this.estado.set('sin-estado');
    }
  }

  protected async verificar(): Promise<void> {
    if (this.formulario.invalid || !this.factorId) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    try {
      await this.mfa.verificarTotp(this.factorId, this.formulario.getRawValue().codigo);
      await this.router.navigateByUrl(rutaDeRetorno(this.retorno, this.rutas.inicio));
    } catch (error) {
      this.error.set(mensajeDeError(error));
      this.formulario.reset();
    } finally {
      this.enviando.set(false);
    }
  }

  protected async salir(): Promise<void> {
    await this.sesion.salir();
    await this.router.navigateByUrl(this.rutas.ingresar);
  }

  private async enrolar(): Promise<void> {
    const enrolamiento = await this.mfa.enrolarTotp();
    this.factorId = enrolamiento.factorId;
    this.enrolamiento.set(enrolamiento);
    this.estado.set('enrolar');
  }
}
