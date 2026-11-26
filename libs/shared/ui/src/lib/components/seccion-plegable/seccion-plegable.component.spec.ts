import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SeccionFinDirective } from '../../directives/seccion-fin.directive';
import { SeccionPieDirective } from '../../directives/seccion-pie.directive';
import { SeccionPlegableComponent } from './seccion-plegable.component';

@Component({
  imports: [SeccionPlegableComponent, SeccionFinDirective, SeccionPieDirective],
  template: `
    <vit-seccion-plegable
      titulo="Contactos"
      resumen="3 contactos · principal: correo"
      [deshabilitada]="deshabilitada()"
      [(expandida)]="expandida"
    >
      <button vitSeccionFin type="button" class="accion-fin">Agregar</button>
      <input class="campo" />
      <button vitSeccionPie type="button">Guardar</button>
    </vit-seccion-plegable>
  `,
})
class SeccionDePrueba {
  readonly expandida = signal(true);
  readonly deshabilitada = signal(false);
}

describe('SeccionPlegableComponent', () => {
  let fixture: ComponentFixture<SeccionDePrueba>;
  let anfitrion: SeccionDePrueba;

  beforeEach(async () => {
    fixture = TestBed.createComponent(SeccionDePrueba);
    anfitrion = fixture.componentInstance;
    await fixture.whenStable();
  });

  function elemento(): HTMLElement {
    return fixture.nativeElement;
  }

  function disparador(): HTMLButtonElement {
    return elemento().querySelector('.disparador') as HTMLButtonElement;
  }

  function contenido(): HTMLElement {
    return elemento().querySelector('[role="region"]') as HTMLElement;
  }

  async function pulsar(objetivo: HTMLElement): Promise<void> {
    objetivo.click();
    await fixture.whenStable();
  }

  it('la cabecera es un botón nativo con aria-expanded y aria-controls hacia la región', () => {
    expect(disparador().tagName).toBe('BUTTON');
    expect(disparador().type).toBe('button');
    expect(disparador().getAttribute('aria-expanded')).toBe('true');
    expect(disparador().getAttribute('aria-controls')).toBe(contenido().id);
    expect(contenido().getAttribute('aria-labelledby')).toBe(disparador().id);
    expect(elemento().querySelector('[role="heading"]')?.getAttribute('aria-level')).toBe('2');
  });

  it('pulsar la cabecera contrae y expande, y actualiza el model', async () => {
    await pulsar(disparador());
    expect(disparador().getAttribute('aria-expanded')).toBe('false');
    expect(anfitrion.expandida()).toBe(false);

    await pulsar(disparador());
    expect(disparador().getAttribute('aria-expanded')).toBe('true');
    expect(anfitrion.expandida()).toBe(true);
  });

  it('contraída deja el contenido inert y muestra el resumen', async () => {
    expect(contenido().hasAttribute('inert')).toBe(false);
    expect(elemento().querySelector('.resumen')).toBeNull();

    anfitrion.expandida.set(false);
    await fixture.whenStable();

    expect(contenido().hasAttribute('inert')).toBe(true);
    expect(elemento().querySelector('.resumen')?.textContent).toContain('3 contactos · principal: correo');
  });

  it('pulsar la acción del fin no pliega', async () => {
    await pulsar(elemento().querySelector('.accion-fin') as HTMLElement);
    expect(disparador().getAttribute('aria-expanded')).toBe('true');
  });

  it('deshabilitada se muestra contraída y no se expande', async () => {
    anfitrion.deshabilitada.set(true);
    await fixture.whenStable();
    expect(disparador().getAttribute('aria-expanded')).toBe('false');
    expect(disparador().getAttribute('aria-disabled')).toBe('true');

    await pulsar(disparador());
    expect(disparador().getAttribute('aria-expanded')).toBe('false');
    expect(contenido().hasAttribute('inert')).toBe(true);
  });

  it('un campo conserva lo escrito tras contraer y expandir', async () => {
    const campo = elemento().querySelector('.campo') as HTMLInputElement;
    campo.value = 'texto a medio llenar';

    await pulsar(disparador());
    await pulsar(disparador());

    expect(elemento().querySelector('.campo')).toBe(campo);
    expect(campo.value).toBe('texto a medio llenar');
  });

  it('proyecta el pie dentro de la región', () => {
    expect(contenido().textContent).toContain('Guardar');
  });
});
