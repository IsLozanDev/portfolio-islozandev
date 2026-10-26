import { TestBed } from '@angular/core/testing';
import { CargandoComponent } from './cargando.component';

describe('CargandoComponent', () => {
  it('anuncia «Cargando…» por defecto con role="status"', async () => {
    const fixture = TestBed.createComponent(CargandoComponent);
    await fixture.whenStable();
    const estado: HTMLElement = fixture.nativeElement.querySelector('[role="status"]');
    expect(estado.textContent?.trim()).toBe('Cargando…');
    expect(estado.querySelector('mat-progress-spinner')).not.toBeNull();
  });

  it('usa el texto dado', async () => {
    const fixture = TestBed.createComponent(CargandoComponent);
    fixture.componentRef.setInput('texto', 'Cargando usuarios…');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent.trim()).toBe('Cargando usuarios…');
  });
});
