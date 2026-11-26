import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SeccionPlegableComponent } from '../seccion-plegable/seccion-plegable.component';
import { GrupoPlegableComponent } from './grupo-plegable.component';

@Component({
  imports: [GrupoPlegableComponent, SeccionPlegableComponent],
  template: `
    <vit-grupo-plegable [multiple]="multiple()">
      <vit-seccion-plegable titulo="Uno" />
      <vit-seccion-plegable titulo="Dos" [expandida]="false" />
      @if (conTercera()) {
        <vit-seccion-plegable titulo="Tres" [expandida]="false" />
      }
    </vit-grupo-plegable>
  `,
})
class GrupoDePrueba {
  readonly multiple = signal(true);
  readonly conTercera = signal(true);
}

describe('GrupoPlegableComponent', () => {
  let fixture: ComponentFixture<GrupoDePrueba>;
  let anfitrion: GrupoDePrueba;

  beforeEach(async () => {
    fixture = TestBed.createComponent(GrupoDePrueba);
    anfitrion = fixture.componentInstance;
    await fixture.whenStable();
  });

  function elemento(): HTMLElement {
    return fixture.nativeElement;
  }

  function control(texto: string): HTMLButtonElement | undefined {
    return [...elemento().querySelectorAll<HTMLButtonElement>('.vit-controles-plegables button')].find((boton) =>
      boton.textContent?.includes(texto),
    );
  }

  function estados(): (string | null)[] {
    return [...elemento().querySelectorAll('.disparador')].map((boton) => boton.getAttribute('aria-expanded'));
  }

  it('respeta el estado inicial de cada sección con varias abiertas', () => {
    expect(estados()).toEqual(['true', 'false', 'false']);
  });

  it('con tres secciones muestra los controles; con dos no', async () => {
    expect(control('Expandir todo')).toBeDefined();
    expect(control('Contraer todo')).toBeDefined();

    anfitrion.conTercera.set(false);
    await fixture.whenStable();

    expect(control('Expandir todo')).toBeUndefined();
    expect(control('Contraer todo')).toBeUndefined();
  });

  it('«Contraer todo» cierra todas y queda deshabilitado; «Expandir todo» las abre', async () => {
    control('Contraer todo')?.click();
    await fixture.whenStable();
    expect(estados()).toEqual(['false', 'false', 'false']);
    expect(control('Contraer todo')?.disabled).toBe(true);
    expect(control('Expandir todo')?.disabled).toBe(false);

    control('Expandir todo')?.click();
    await fixture.whenStable();
    expect(estados()).toEqual(['true', 'true', 'true']);
    expect(control('Expandir todo')?.disabled).toBe(true);
  });

  it('con multiple en false, abrir una cierra la otra', async () => {
    anfitrion.multiple.set(false);
    await fixture.whenStable();

    (elemento().querySelectorAll<HTMLButtonElement>('.disparador')[1]).click();
    await fixture.whenStable();

    expect(estados()).toEqual(['false', 'true', 'false']);
  });
});
