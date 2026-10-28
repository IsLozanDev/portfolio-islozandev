import { Location } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router } from '@angular/router';
import { AccionesFormularioComponent, AvisosService, CargandoComponent, MensajeValidacionPipe } from '@vitrina/shared/ui';
import { FormAsignacionComponent } from '../../components/form-asignacion/form-asignacion.component';
import type { Asignables } from '../../models/asignable';
import { aErrorAdmin } from '../../models/error-admin';
import type { EstadoReenvio } from '../../models/invitacion';
import { MENSAJES_ADMIN } from '../../models/mensajes-admin';
import { AccionSensibleService } from '../../services/accion-sensible.service';
import { AsignacionesCliente } from '../../services/asignaciones.cliente';
import { InvitacionesCliente } from '../../services/invitaciones.cliente';
import { aFormularioAsignacion, crearGrupoAsignacion, esAsignableSensible } from '../../utils/formulario-asignacion';

// Cotas de la API de invitar (spec 08): nombre 3-150 y correo como `seg.usuario.email`.
const LONGITUD_MINIMA_NOMBRE = 3;
const LONGITUD_MAXIMA_NOMBRE = 150;
const LONGITUD_MAXIMA_CORREO = 255;

/** Invitar o reinvitar a un usuario con su primera asignación (U-03, TR-RF-009). */
@Component({
  selector: 'vit-usuarios-invitar',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, AccionesFormularioComponent, CargandoComponent, MensajeValidacionPipe, FormAsignacionComponent],
  templateUrl: './usuarios-invitar.page.html',
})
export class UsuariosInvitarPage {
  private readonly invitaciones = inject(InvitacionesCliente);
  private readonly asignacionesCliente = inject(AsignacionesCliente);
  private readonly accionSensible = inject(AccionSensibleService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_ADMIN;
  protected readonly formulario = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(LONGITUD_MINIMA_NOMBRE), Validators.maxLength(LONGITUD_MAXIMA_NOMBRE)],
    }),
    correo: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(LONGITUD_MAXIMA_CORREO)] }),
    asignacion: crearGrupoAsignacion(),
  });
  protected readonly asignables = signal<Asignables | null>(null);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const reenvio = (inject(Location).getState() as EstadoReenvio | null)?.reenviar;
    if (reenvio) this.formulario.patchValue(reenvio);
    void this.cargarAsignables();
  }

  protected async invitar(): Promise<void> {
    const asignables = this.asignables();
    if (this.formulario.invalid || !asignables) {
      this.formulario.markAllAsTouched();
      return;
    }
    const { asignacion } = this.formulario.controls;
    if (esAsignableSensible(asignables, asignacion.controls.asignable.value) && !(await this.accionSensible.exigirMfa())) return;

    this.guardando.set(true);
    this.error.set(null);
    try {
      const { nombre, correo } = this.formulario.getRawValue();
      const emitida = await this.invitaciones.invitar({ nombre: nombre.trim(), correo: correo.trim(), asignacion: aFormularioAsignacion(asignacion) });
      await this.avisarResultado(emitida.correoEnviado);
      await this.router.navigate(['..', emitida.membresiaId], { relativeTo: this.ruta });
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.guardando.set(false);
    }
  }

  protected cancelar(): void {
    void this.router.navigate(['..'], { relativeTo: this.ruta });
  }

  /** `correo_enviado: false`: la invitación existe, pero hay que reenviarla (spec 08). */
  private async avisarResultado(correoEnviado: boolean): Promise<void> {
    if (correoEnviado) {
      this.avisos.toast('exito', MENSAJES_ADMIN.invitacionEnviada);
      return;
    }
    await this.avisos.advertencia(MENSAJES_ADMIN.tituloCorreoNoEnviado, MENSAJES_ADMIN.correoNoEnviado);
  }

  private async cargarAsignables(): Promise<void> {
    try {
      this.asignables.set(await this.asignacionesCliente.asignables());
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    }
  }
}
