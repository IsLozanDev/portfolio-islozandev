import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccionSensibleService } from '@vitrina/shared/shell';
import { AccionesFormularioComponent, AvisosService, CargandoComponent } from '@vitrina/shared/ui';
import { FormAsignacionComponent } from '../../components/form-asignacion/form-asignacion.component';
import type { Asignables } from '../../models/asignable';
import { aErrorAdmin } from '../../models/error-admin';
import { MENSAJES_ADMIN } from '../../models/mensajes-admin';
import { AsignacionesCliente } from '../../services/asignaciones.cliente';
import { aFormularioAsignacion, crearGrupoAsignacion } from '../../utils/formulario-asignacion';

const PARAMETRO_MEMBRESIA = 'membresiaId';

/** Otorgar un rol o perfil con alcance y vigencia a un miembro (U-03, TR-RF-013). */
@Component({
  selector: 'vit-asignacion-nueva',
  imports: [ReactiveFormsModule, AccionesFormularioComponent, CargandoComponent, FormAsignacionComponent],
  templateUrl: './asignacion-nueva.page.html',
})
export class AsignacionNuevaPage {
  private readonly asignaciones = inject(AsignacionesCliente);
  private readonly accionSensible = inject(AccionSensibleService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly membresiaId = this.ruta.snapshot.paramMap.get(PARAMETRO_MEMBRESIA) ?? '';

  protected readonly mensajes = MENSAJES_ADMIN;
  /** Vigente desde: hoy por defecto (TR-RF-013). */
  protected readonly grupo = crearGrupoAsignacion();
  protected readonly asignables = signal<Asignables | null>(null);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.grupo.controls.vigenteDesde.setValue(new Date());
    void this.cargarAsignables();
  }

  /** `plat.asignacion.otorgar` siempre es sensible: el MFA pudo vencer mientras se llenaba el formulario. */
  protected async asignar(): Promise<void> {
    if (this.grupo.invalid) {
      this.grupo.markAllAsTouched();
      return;
    }
    if (!(await this.accionSensible.exigirMfa())) return;

    this.guardando.set(true);
    this.error.set(null);
    try {
      await this.asignaciones.otorgar(this.membresiaId, aFormularioAsignacion(this.grupo));
      this.avisos.toast('exito', MENSAJES_ADMIN.asignacionOtorgada);
      await this.volver();
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.guardando.set(false);
    }
  }

  protected cancelar(): void {
    void this.volver();
  }

  private async volver(): Promise<void> {
    await this.router.navigate(['..'], { relativeTo: this.ruta });
  }

  private async cargarAsignables(): Promise<void> {
    try {
      this.asignables.set(await this.asignaciones.asignables());
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    }
  }
}
