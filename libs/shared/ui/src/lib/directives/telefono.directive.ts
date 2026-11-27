import { Directive, ElementRef, forwardRef, inject } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { aE164, contarDigitos, formatoMientrasEscribe, formatoTelefono, normalizarTelefono, posicionTrasDigitos } from '../utils/telefono-peru';

const BORRADO = 'delete';

/**
 * Teléfono peruano con máscara (spec 17d): solo deja dígitos (y quita un +51 pegado), da formato de celular o fijo
 * mientras se escribe y entrega al formulario el E.164, o el texto tal cual si no está completo, para que
 * `telefonoPeru` lo marque. Un valor guardado que no es E.164 se muestra sin tocar.
 */
@Directive({
  selector: 'input[vitTelefono]',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TelefonoDirective), multi: true }],
  host: {
    inputmode: 'tel',
    autocomplete: 'tel',
    '(input)': 'alEscribir($event)',
    '(blur)': 'alSalir()',
  },
})
export class TelefonoDirective implements ControlValueAccessor {
  private readonly campo: HTMLInputElement = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private ultimoVisto = '';
  private alCambiar: (valor: string | null) => void = () => undefined;
  private alTocar: () => void = () => undefined;

  writeValue(valor: string | null): void {
    this.mostrar(valor ? formatoTelefono(valor) : '');
  }

  registerOnChange(alCambiar: (valor: string | null) => void): void {
    this.alCambiar = alCambiar;
  }

  registerOnTouched(alTocar: () => void): void {
    this.alTocar = alTocar;
  }

  setDisabledState(deshabilitado: boolean): void {
    this.campo.disabled = deshabilitado;
  }

  alSalir(): void {
    this.alTocar();
  }

  alEscribir(evento: Event): void {
    const { texto, cursor } = this.textoEscrito(evento as InputEvent);
    const { nacional, desplazamiento } = normalizarTelefono(texto);
    const visto = formatoMientrasEscribe(texto);
    const digitosAntesDelCursor = Math.min(contarDigitos(texto.slice(0, cursor)) + desplazamiento, nacional.length);

    this.mostrar(visto);
    const posicion = posicionTrasDigitos(visto, digitosAntesDelCursor);
    this.campo.setSelectionRange(posicion, posicion);
    this.alCambiar(nacional ? (aE164(visto) ?? visto) : null);
  }

  /** Borrar un espacio, paréntesis o guion no cambia los dígitos: se borra el dígito anterior, como espera quien borra. */
  private textoEscrito(evento: InputEvent): { texto: string; cursor: number } {
    const texto = this.campo.value;
    const cursor = this.campo.selectionStart ?? texto.length;
    const borroSoloUnSeparador = evento.inputType?.startsWith(BORRADO) && contarDigitos(texto) === contarDigitos(this.ultimoVisto);
    if (!borroSoloUnSeparador) return { texto, cursor };

    const antes = texto.slice(0, cursor);
    const ultimoDigito = antes.search(/\d\D*$/);
    if (ultimoDigito < 0) return { texto, cursor };
    return { texto: texto.slice(0, ultimoDigito) + texto.slice(ultimoDigito + 1), cursor: ultimoDigito };
  }

  private mostrar(visto: string): void {
    this.campo.value = visto;
    this.ultimoVisto = visto;
  }
}
