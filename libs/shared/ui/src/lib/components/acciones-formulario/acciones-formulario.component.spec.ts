import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { AccionesFormularioComponent } from './acciones-formulario.component';

@Component({
  imports: [AccionesFormularioComponent],
  template: `
    <form (submit)="enviado = enviado + 1; $event.preventDefault()">
      <vit-acciones-formulario [guardando]="guardando()" textoGuardar="Crear" (cancelar)="cancelado = cancelado + 1" />
    </form>
  `,
})
class FormularioDePrueba {
  readonly guardando = signal(false);
  enviado = 0;
  cancelado = 0;
}

function boton(fixture: ComponentFixture<FormularioDePrueba>, tipo: 'submit' | 'button'): HTMLButtonElement {
  return fixture.nativeElement.querySelector(`button[type="${tipo}"]`);
}

describe('AccionesFormularioComponent', () => {
  let fixture: ComponentFixture<FormularioDePrueba>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(FormularioDePrueba);
    await fixture.whenStable();
  });

  it('«Guardar» envía el formulario y «Cancelar» emite cancelar sin enviarlo', () => {
    expect(boton(fixture, 'submit').textContent?.trim()).toBe('Crear');

    boton(fixture, 'submit').click();
    boton(fixture, 'button').click();

    expect(fixture.componentInstance.enviado).toBe(1);
    expect(fixture.componentInstance.cancelado).toBe(1);
  });

  it('con guardando deshabilita «Guardar» y muestra el indicador', async () => {
    fixture.componentInstance.guardando.set(true);
    await fixture.whenStable();

    const guardar = boton(fixture, 'submit');
    expect(guardar.disabled).toBe(true);
    expect(guardar.getAttribute('aria-busy')).toBe('true');
    expect(guardar.querySelector('mat-progress-spinner')?.getAttribute('aria-label')).toBe('Guardando');
  });
});
