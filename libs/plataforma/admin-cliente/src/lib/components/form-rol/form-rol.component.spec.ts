import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { estable } from '../../../testing/estable';
import { aFormularioRol, crearGrupoRol } from '../../utils/formulario-rol';
import { FormRolComponent } from './form-rol.component';

@Component({
  imports: [FormRolComponent],
  template: '<vit-form-rol [grupo]="grupo" />',
})
class Anfitrion {
  readonly grupo = crearGrupoRol();
}

describe('FormRolComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;

  const elemento = () => fixture.nativeElement as HTMLElement;
  const grupo = () => fixture.componentInstance.grupo;
  const escribir = (campo: string, valor: string) => {
    const entrada = elemento().querySelector<HTMLInputElement>(`[data-campo=${campo}]`);
    if (!entrada) throw new Error(`No hay campo ${campo}`);
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    entrada.dispatchEvent(new Event('blur'));
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Anfitrion] });
    fixture = TestBed.createComponent(Anfitrion);
    await estable(fixture);
  });

  it('código y nombre vacíos dejan el grupo inválido', () => {
    expect(grupo().invalid).toBe(true);
  });

  it.each([
    ['codigo', 'MO', 'Ingrese al menos 3 caracteres.'],
    ['codigo', 'X'.repeat(51), 'Ingrese como máximo 50 caracteres.'],
    ['nombre', 'x'.repeat(101), 'Ingrese como máximo 100 caracteres.'],
  ])('%s con «%s» muestra «%s»', async (campo, valor, mensaje) => {
    escribir(campo, valor);
    await estable(fixture);

    expect(elemento().querySelector('mat-error')?.textContent?.trim()).toBe(mensaje);
  });

  it('con datos válidos queda válido y el formulario sale sin espacios a los lados', async () => {
    escribir('codigo', ' MOZO_TERRAZA ');
    escribir('nombre', 'Mozo terraza');
    await estable(fixture);

    expect(grupo().valid).toBe(true);
    expect(aFormularioRol(grupo())).toEqual({ codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza' });
  });
});
