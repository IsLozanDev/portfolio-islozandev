import { Component, DestroyRef, inject, input, signal, type OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { startWith } from 'rxjs';
import { MENSAJES_FORMULARIO_ITEM } from '../../models/mensajes-formulario-item';
import { ERROR_ATRIBUTOS_GRANDES, mensajeDeErrorItem, type GrupoAtributos } from '../../utils/formulario-item';

/** Atributos del ítem: campos para las claves conocidas y un JSON avanzado plegable para las demás. */
@Component({
  selector: 'vit-editor-atributos',
  imports: [ReactiveFormsModule, MatCheckboxModule, MatExpansionModule, MatFormFieldModule, MatInputModule],
  templateUrl: './editor-atributos.component.html',
})
export class EditorAtributosComponent implements OnInit {
  private readonly destruir = inject(DestroyRef);

  readonly grupo = input.required<GrupoAtributos>();

  protected readonly mensajes = MENSAJES_FORMULARIO_ITEM;
  protected readonly errorAtributosGrandes = ERROR_ATRIBUTOS_GRANDES;
  protected readonly mensajeDeError = mensajeDeErrorItem;
  /** Se abre solo cuando el JSON avanzado tiene algo (p. ej. al editar un ítem con claves libres); no se cierra al borrarlo. */
  protected readonly panelAbierto = signal(false);

  ngOnInit(): void {
    const avanzado = this.grupo().controls.avanzado;
    avanzado.valueChanges.pipe(startWith(avanzado.value), takeUntilDestroyed(this.destruir)).subscribe((texto) => {
      if (texto !== '') this.panelAbierto.set(true);
    });
  }
}
