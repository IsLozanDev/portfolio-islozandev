import type { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { API_URL, prepararHttpDePrueba } from '../../../testing/http-de-prueba';
import type { ValorUbigeo } from '../../models/ubigeo';
import { UbigeoAutocompletarComponent } from './ubigeo-autocompletar.component';

const ETIQUETA_EMPRESA = 'Ubigeo (departamento / provincia / distrito)';

@Component({
  imports: [UbigeoAutocompletarComponent],
  template: `
    <vit-ubigeo-autocompletar data-prueba="ficha" [control]="ubigeo" />
    <vit-ubigeo-autocompletar data-prueba="empresa" [control]="ubigeo" [etiqueta]="etiquetaEmpresa" />
  `,
})
class UbigeosDePrueba {
  readonly ubigeo = new FormControl<ValorUbigeo>(null);
  readonly etiquetaEmpresa = ETIQUETA_EMPRESA;
}

describe('UbigeoAutocompletarComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
  });

  it('usa «Distrito» por defecto y la etiqueta que se le pase', async () => {
    const fixture = TestBed.createComponent(UbigeosDePrueba);
    await fixture.whenStable();
    http.expectOne(`${API_URL}/catalogos/UBIGEO/items`).flush([]);

    const etiqueta = (campo: string) => fixture.nativeElement.querySelector(`[data-prueba="${campo}"] mat-label`).textContent.trim();
    expect(etiqueta('ficha')).toBe('Distrito');
    expect(etiqueta('empresa')).toBe(ETIQUETA_EMPRESA);
  });
});
