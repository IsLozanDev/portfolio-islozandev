import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EstadoVacioComponent, ICONO_ESTADO_VACIO } from './estado-vacio.component';

@Component({
  imports: [EstadoVacioComponent],
  template: '<vit-estado-vacio icono="group" titulo="No hay usuarios" texto="Invite al primero."><button>Invitar</button></vit-estado-vacio>',
})
class ConContenido {}

describe('EstadoVacioComponent', () => {
  it('muestra icono, título, texto y el contenido proyectado', async () => {
    const fixture = TestBed.createComponent(ConContenido);
    await fixture.whenStable();
    const elemento: HTMLElement = fixture.nativeElement;
    expect(elemento.querySelector('mat-icon')?.textContent?.trim()).toBe('group');
    expect(elemento.textContent).toContain('No hay usuarios');
    expect(elemento.textContent).toContain('Invite al primero.');
    expect(elemento.querySelector('button')?.textContent).toBe('Invitar');
  });

  it('sin texto ni icono usa el icono por defecto y omite el párrafo', async () => {
    const fixture = TestBed.createComponent(EstadoVacioComponent);
    fixture.componentRef.setInput('titulo', 'Sin datos');
    await fixture.whenStable();
    const elemento: HTMLElement = fixture.nativeElement;
    expect(elemento.querySelector('mat-icon')?.textContent?.trim()).toBe(ICONO_ESTADO_VACIO);
    expect(elemento.querySelectorAll('p')).toHaveLength(1);
  });
});
