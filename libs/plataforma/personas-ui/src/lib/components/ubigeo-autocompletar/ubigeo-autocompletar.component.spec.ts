import type { HttpTestingController } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { API_URL, prepararHttpDePrueba } from '../../../testing/http-de-prueba';
import type { TextosUbigeo, ValorUbigeo } from '../../models/ubigeo';
import { UbigeoAutocompletarComponent } from './ubigeo-autocompletar.component';

const URL_UBIGEOS = `${API_URL}/catalogos/UBIGEO/items`;
const ETIQUETA_EMPRESA = 'Ubigeo (departamento / provincia / distrito)';
const MIRAFLORES = { codigo: '150122', distrito: 'MIRAFLORES', provincia: 'LIMA', departamento: 'LIMA' };
const TEXTOS_DE_USTED: TextosUbigeo = {
  ayuda: 'Escriba el distrito y elija de la lista.',
  ayudaElegido: (ubigeo) => `Se guarda el código ${ubigeo.codigo}.`,
  error: 'Elija un distrito de la lista',
  errorCarga: 'No se pudo cargar el catálogo de ubigeos.',
  sinPermiso: 'No tiene permiso para ver el catálogo de ubigeos',
};

@Component({
  imports: [UbigeoAutocompletarComponent],
  template: `
    <vit-ubigeo-autocompletar data-prueba="ficha" [control]="ficha" />
    <vit-ubigeo-autocompletar
      data-prueba="empresa"
      [control]="empresa"
      [etiqueta]="etiquetaEmpresa"
      [textos]="textos"
      [sinPermiso]="sinPermiso()"
    />
  `,
})
class UbigeosDePrueba {
  readonly ficha = new FormControl<ValorUbigeo>(null);
  readonly empresa = new FormControl<ValorUbigeo>(null);
  readonly etiquetaEmpresa = ETIQUETA_EMPRESA;
  readonly textos = TEXTOS_DE_USTED;
  readonly sinPermiso = signal(false);
}

describe('UbigeoAutocompletarComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<UbigeosDePrueba>;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    fixture = TestBed.createComponent(UbigeosDePrueba);
  });

  afterEach(() => http.verify());

  const texto = (campo: string, selector: string) =>
    fixture.nativeElement.querySelector(`[data-prueba="${campo}"] ${selector}`)?.textContent.trim();

  it('usa «Distrito» y los textos de la ficha por defecto, y los que se le pasen', async () => {
    await fixture.whenStable();
    http.expectOne(URL_UBIGEOS).flush([]);
    await fixture.whenStable();

    expect(texto('ficha', 'mat-label')).toBe('Distrito');
    expect(texto('ficha', '[data-prueba="ayuda-ubigeo"]')).toBe('Escribe el distrito, la provincia o el departamento');
    expect(texto('empresa', 'mat-label')).toBe(ETIQUETA_EMPRESA);
    expect(texto('empresa', '[data-prueba="ayuda-ubigeo"]')).toBe(TEXTOS_DE_USTED.ayuda);
  });

  it('con un distrito elegido muestra la ayuda de elegido con su código', async () => {
    fixture.componentInstance.empresa.setValue(MIRAFLORES);
    await fixture.whenStable();
    http.expectOne(URL_UBIGEOS).flush([]);
    await fixture.whenStable();

    expect(texto('empresa', '[data-prueba="ayuda-ubigeo"]')).toBe('Se guarda el código 150122.');
  });

  it('texto escrito sin elegir muestra el error que se le pase', async () => {
    const { empresa } = fixture.componentInstance;
    empresa.setValidators((control) => (typeof control.value === 'string' && control.value !== '' ? { ubigeo: true } : null));
    empresa.setValue('mira');
    empresa.markAsTouched();
    await fixture.whenStable();
    http.expectOne(URL_UBIGEOS).flush([]);
    await fixture.whenStable();

    expect(texto('empresa', 'mat-error')).toBe(TEXTOS_DE_USTED.error);
  });

  it('sin permiso no pide el catálogo y muestra su aviso', async () => {
    TestBed.resetTestingModule();
    http = prepararHttpDePrueba();
    fixture = TestBed.createComponent(UbigeosDePrueba);
    fixture.componentInstance.sinPermiso.set(true);
    await fixture.whenStable();

    // Solo la ficha pide el catálogo; el campo sin permiso no.
    http.expectOne(URL_UBIGEOS).flush([]);
    await fixture.whenStable();
    expect(texto('empresa', '[data-prueba="ayuda-ubigeo"]')).toBe(TEXTOS_DE_USTED.sinPermiso);
  });
});
