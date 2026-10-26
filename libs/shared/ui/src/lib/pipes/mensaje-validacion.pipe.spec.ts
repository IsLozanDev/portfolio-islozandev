import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MensajeValidacionPipe } from './mensaje-validacion.pipe';

@Component({
  imports: [ReactiveFormsModule, MensajeValidacionPipe],
  template: '<input [formControl]="nombre" /><p>{{ nombre.errors | mensajeValidacion }}</p>',
})
class FormularioDePrueba {
  readonly nombre = new FormControl('', [Validators.required, Validators.minLength(3)]);
}

describe('MensajeValidacionPipe', () => {
  it('muestra el mensaje del error actual y se actualiza al escribir', async () => {
    const fixture = TestBed.createComponent(FormularioDePrueba);
    await fixture.whenStable();
    const mensaje = (): string => fixture.nativeElement.querySelector('p').textContent;
    expect(mensaje()).toBe('Este campo es obligatorio.');

    fixture.componentInstance.nombre.setValue('a');
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(mensaje()).toBe('Ingrese al menos 3 caracteres.');

    fixture.componentInstance.nombre.setValue('abc');
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(mensaje()).toBe('');
  });
});
