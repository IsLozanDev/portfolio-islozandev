import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { telefonoPeru } from '../utils/telefono-peru';
import { TelefonoDirective } from './telefono.directive';

@Component({
  imports: [ReactiveFormsModule, TelefonoDirective],
  template: '<input vitTelefono [formControl]="telefono" />',
})
class TelefonoDePrueba {
  readonly telefono = new FormControl<string | null>(null, telefonoPeru);
}

describe('TelefonoDirective (vitTelefono)', () => {
  let fixture: ComponentFixture<TelefonoDePrueba>;
  let control: FormControl<string | null>;
  let campo: HTMLInputElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(TelefonoDePrueba);
    control = fixture.componentInstance.telefono;
    await fixture.whenStable();
    campo = fixture.nativeElement.querySelector('input');
  });

  function disparar(inputType: string): void {
    campo.dispatchEvent(new InputEvent('input', { inputType }));
  }

  /** Como el navegador: inserta en el cursor, lo mueve y avisa. */
  function escribir(texto: string): void {
    for (const caracter of texto) {
      const cursor = campo.selectionStart ?? campo.value.length;
      campo.value = campo.value.slice(0, cursor) + caracter + campo.value.slice(cursor);
      campo.setSelectionRange(cursor + 1, cursor + 1);
      disparar('insertText');
    }
  }

  function pegar(texto: string): void {
    campo.value = texto;
    campo.setSelectionRange(texto.length, texto.length);
    disparar('insertFromPaste');
  }

  function borrarAntesDe(cursor: number): void {
    campo.value = campo.value.slice(0, cursor - 1) + campo.value.slice(cursor);
    campo.setSelectionRange(cursor - 1, cursor - 1);
    disparar('deleteContentBackward');
  }

  function ponerCursor(posicion: number): void {
    campo.setSelectionRange(posicion, posicion);
  }

  it('pide el teclado de teléfono y el autocompletado del navegador', () => {
    expect(campo.getAttribute('inputmode')).toBe('tel');
    expect(campo.getAttribute('autocomplete')).toBe('tel');
  });

  it.each([
    ['987654321', '987 654 321', '+51987654321'],
    ['015550101', '(01) 555-0101', '+5115550101'],
    ['054123456', '(054) 123-456', '+5154123456'],
  ])('al escribir «%s» se ve «%s» y el formulario recibe %s', (digitos, visto, e164) => {
    escribir(digitos);

    expect(campo.value).toBe(visto);
    expect(control.value).toBe(e164);
    expect(control.valid).toBe(true);
  });

  it('solo deja dígitos', () => {
    escribir('9a8-7b');
    expect(campo.value).toBe('987');
  });

  it('pegar «+51 987-654-321» deja «987 654 321» y entrega el E.164', () => {
    pegar('+51 987-654-321');

    expect(campo.value).toBe('987 654 321');
    expect(control.value).toBe('+51987654321');
  });

  it('un celular incompleto llega tal cual y el validador lo marca', () => {
    escribir('98765');

    expect(control.value).toBe('987 65');
    expect(control.hasError('telefonoPeru')).toBe(true);
  });

  it('vaciar el campo entrega null', () => {
    escribir('9');
    borrarAntesDe(1);

    expect(campo.value).toBe('');
    expect(control.value).toBeNull();
  });

  it('al insertar en medio, el cursor queda después del dígito escrito', () => {
    escribir('98765');
    ponerCursor(3);
    escribir('1');

    expect(campo.value).toBe('987 165');
    expect(campo.selectionStart).toBe(5);
  });

  it('borrar un espacio borra el dígito anterior, no se traba', () => {
    escribir('987654');
    borrarAntesDe(4);

    expect(campo.value).toBe('986 54');
    expect(campo.selectionStart).toBe(2);
  });

  it('muestra con formato el E.164 guardado, y tal cual un teléfono viejo', () => {
    control.setValue('+5115550101');
    expect(campo.value).toBe('(01) 555-0101');

    control.setValue('anexo 12');
    expect(campo.value).toBe('anexo 12');
    expect(control.hasError('telefonoPeru')).toBe(true);
  });

  it('se deshabilita con el control y marca tocado al salir', () => {
    control.disable();
    expect(campo.disabled).toBe(true);

    control.enable();
    campo.dispatchEvent(new Event('blur'));
    expect(control.touched).toBe(true);
  });
});
