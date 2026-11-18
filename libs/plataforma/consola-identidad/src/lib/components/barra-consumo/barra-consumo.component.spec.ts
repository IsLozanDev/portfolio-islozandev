import { TestBed } from '@angular/core/testing';
import { BarraConsumoComponent } from './barra-consumo.component';

describe('BarraConsumoComponent', () => {
  function pintar(porcentaje: number, tono: string, grande = false): HTMLElement {
    const fixture = TestBed.createComponent(BarraConsumoComponent);
    fixture.componentRef.setInput('porcentaje', porcentaje);
    fixture.componentRef.setInput('tono', tono);
    fixture.componentRef.setInput('etiqueta', 'Consumo de Pollería');
    fixture.componentRef.setInput('grande', grande);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('mat-progress-bar');
  }

  it('es determinada, con el valor, el nombre accesible y la clase del tono', () => {
    const barra = pintar(24, 'exito');

    expect(barra.getAttribute('mode')).toBe('determinate');
    expect(barra.getAttribute('aria-valuenow')).toBe('24');
    expect(barra.getAttribute('aria-label')).toBe('Consumo de Pollería');
    expect(barra.classList).toContain('vit-barra-exito');
    expect(barra.classList).not.toContain('vit-barra-grande');
  });

  it('no pasa de llena y en el detalle es grande', () => {
    const barra = pintar(120, 'error', true);

    expect(barra.getAttribute('aria-valuenow')).toBe('100');
    expect(barra.classList).toContain('vit-barra-error');
    expect(barra.classList).toContain('vit-barra-grande');
  });
});
