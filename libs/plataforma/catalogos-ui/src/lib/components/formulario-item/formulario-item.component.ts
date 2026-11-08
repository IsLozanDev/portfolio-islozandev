import { Component, computed, effect, input, output, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AccionesFormularioComponent } from '@vitrina/shared/ui';
import { startWith } from 'rxjs';
import type { ItemCatalogo, SolicitudItem } from '../../models/item';
import { mensajeFormularioDe, MENSAJES_FORMULARIO_ITEM, mensajeVigenciaFutura } from '../../models/mensajes-formulario-item';
import { formatearFechaCalendario } from '../../utils/fecha-lima';
import {
  aSolicitudItem,
  cargarItem,
  crearGrupoItem,
  ERROR_API,
  inicioFuturo,
  mensajeDeErrorItem,
  revalidarVigenciaFinal,
  type GrupoItem,
} from '../../utils/formulario-item';
import { EditorAtributosComponent } from '../editor-atributos/editor-atributos.component';

/** El catálogo al que pertenece el ítem; solo para los textos. */
export interface CatalogoDelItem {
  codigo: string;
}

type CampoItem = keyof GrupoItem['controls'];

/**
 * Formulario de un ítem de catálogo, global o propio (TR-RF-023, 025). No hace HTTP: emite la solicitud y
 * la página decide la ruta. El datepicker necesita que la página provea el `DateAdapter`.
 */
@Component({
  selector: 'vit-formulario-item',
  imports: [ReactiveFormsModule, MatCheckboxModule, MatDatepickerModule, MatFormFieldModule, MatInputModule, AccionesFormularioComponent, EditorAtributosComponent],
  templateUrl: './formulario-item.component.html',
})
export class FormularioItemComponent {
  readonly catalogo = input.required<CatalogoDelItem>();
  /** null al crear. */
  readonly item = input<ItemCatalogo | null>(null);
  readonly enviando = input<boolean>(false);
  readonly guardar = output<SolicitudItem>();
  readonly cancelar = output<void>();

  protected readonly mensajes = MENSAJES_FORMULARIO_ITEM;
  protected readonly mensajeDeError = mensajeDeErrorItem;
  protected readonly grupo = crearGrupoItem();
  protected readonly etiquetaFormulario = computed(() => mensajeFormularioDe(this.catalogo().codigo));
  private readonly desde = toSignal(this.grupo.controls.vigenteDesde.valueChanges.pipe(startWith(this.grupo.controls.vigenteDesde.value)));
  /** TR-CA-062: el aviso de un ítem que aún no entra en vigencia. */
  protected readonly notaVigenciaFutura = computed(() => {
    this.desde();
    const inicio = inicioFuturo(this.grupo);
    return inicio === null ? null : mensajeVigenciaFutura(formatearFechaCalendario(inicio));
  });

  constructor() {
    this.grupo.controls.vigenteDesde.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => revalidarVigenciaFinal(this.grupo));
    effect(() => {
      const item = this.item();
      if (item) untracked(() => cargarItem(this.grupo, item));
    });
  }

  /** Error de un campo que devolvió la API, p. ej. CODIGO_DUPLICADO en `codigo`. */
  marcarError(campo: CampoItem, mensaje: string): void {
    const control = this.grupo.controls[campo];
    control.setErrors({ [ERROR_API]: mensaje });
    control.markAsTouched();
  }

  protected enviar(): void {
    if (this.enviando()) return;
    if (this.grupo.invalid) {
      this.grupo.markAllAsTouched();
      return;
    }
    this.guardar.emit(aSolicitudItem(this.grupo));
  }
}
