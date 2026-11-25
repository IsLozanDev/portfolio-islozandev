import { Component, input, output } from '@angular/core';
import { MatRadioModule } from '@angular/material/radio';
import { ChipEstadoComponent } from '@vitrina/shared/ui';
import type { OpcionFusion } from '../../utils/vista-comparacion';

/**
 * Una fila de la comparación (spec 40): la etiqueta del dato y su valor en cada ficha, con un radio por ficha.
 * Bajo `md:` las opciones se apilan con la etiqueta de su ficha. Si los valores son iguales, se muestra uno.
 */
@Component({
  selector: 'vit-opcion-fusion',
  imports: [MatRadioModule, ChipEstadoComponent],
  templateUrl: './opcion-fusion.component.html',
})
export class OpcionFusionComponent {
  readonly etiqueta = input.required<string>();
  /** Nombre del grupo de radios, único en la página. */
  readonly nombre = input.required<string>();
  readonly opciones = input.required<readonly OpcionFusion[]>();
  readonly iguales = input<boolean>(false);
  /** Sin radios: solo los valores. */
  readonly editable = input<boolean>(true);
  readonly deshabilitada = input<boolean>(false);
  readonly textoIgual = input.required<string>();
  readonly textoSinDato = input.required<string>();
  readonly elegir = output<OpcionFusion>();

  protected seleccionada(): OpcionFusion | undefined {
    return this.opciones().find((opcion) => opcion.marcada);
  }

  protected elegirPorId(personaId: string): void {
    const opcion = this.opciones().find((candidata) => candidata.personaId === personaId);
    if (opcion) this.elegir.emit(opcion);
  }
}
