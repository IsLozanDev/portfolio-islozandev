import { Component, inject, signal, type OnInit } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { AccionesFormularioComponent, CargandoComponent, MensajeValidacionPipe, PanelLateralComponent } from '@vitrina/shared/ui';
import { ETIQUETAS_ROL } from '../../models/etiquetas-personas';
import type { ResultadoPanelFicha } from '../../models/ficha';
import { MENSAJES_FICHA } from '../../models/mensajes-ficha';
import { ROLES_PERSONA, type PersonaDetalle, type ProductoCodigo, type RolPersona } from '../../models/persona';
import { PersonasCliente } from '../../services/personas.cliente';
import { esPersonaCambiada, mensajeDe } from '../../utils/cambios-ficha';

export interface DatosPanelRol {
  persona: PersonaDetalle;
}

/**
 * Panel «Asignar rol» (TR-RF-040): solo ofrece los productos con suscripción vigente (TR-CA-104). La API no
 * devuelve la persona: al asignar, la ficha se relee; si el rol ya estaba vigente, lo avisa.
 */
@Component({
  selector: 'vit-panel-rol',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatIconModule, MatSelectModule, AccionesFormularioComponent, CargandoComponent, MensajeValidacionPipe, PanelLateralComponent],
  templateUrl: './panel-rol.component.html',
})
export class PanelRolComponent implements OnInit {
  private readonly referencia = inject<MatDialogRef<PanelRolComponent, ResultadoPanelFicha>>(MatDialogRef);
  private readonly personas = inject(PersonasCliente);
  private readonly persona = inject<DatosPanelRol>(MAT_DIALOG_DATA).persona;

  protected readonly mensajes = MENSAJES_FICHA.roles;
  protected readonly roles = ROLES_PERSONA.map((codigo) => ({ codigo, texto: ETIQUETAS_ROL[codigo] }));
  protected readonly formulario = inject(NonNullableFormBuilder).group({
    producto: ['' as ProductoCodigo | '', Validators.required],
    rol: ['' as RolPersona | '', Validators.required],
  });
  protected readonly productos = signal<readonly ProductoCodigo[]>([]);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.productos.set(await this.personas.productosSuscritos());
    } catch (error) {
      this.error.set(mensajeDe(error));
    } finally {
      this.cargando.set(false);
    }
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const { producto, rol } = this.formulario.getRawValue();
    this.guardando.set(true);
    this.error.set(null);
    try {
      const { asignado } = await this.personas.asignarRol(this.persona.id, { productoCodigo: producto as ProductoCodigo, rol: rol as RolPersona });
      this.referencia.close({ tipo: 'recargar', aviso: asignado ? this.mensajes.asignado : this.mensajes.yaTenia });
    } catch (error) {
      if (esPersonaCambiada(error)) this.referencia.close({ tipo: 'obsoleta' });
      else this.error.set(mensajeDe(error));
    } finally {
      this.guardando.set(false);
    }
  }

  protected cerrar(): void {
    this.referencia.close();
  }
}
