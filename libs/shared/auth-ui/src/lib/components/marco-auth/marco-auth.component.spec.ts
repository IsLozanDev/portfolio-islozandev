import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MarcoAuthComponent, RUTA_ILUSTRACION_VITRINA } from './marco-auth.component';

@Component({
  imports: [MarcoAuthComponent],
  template: '<vit-marco-auth [destacado]="destacado()"><h1>Ingresar</h1></vit-marco-auth>',
})
class PaginaConMarco {
  readonly destacado = signal<string | null>(null);
}

describe('MarcoAuthComponent', () => {
  async function abrir(destacado: string | null = null): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(PaginaConMarco);
    fixture.componentInstance.destacado.set(destacado);
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  it('proyecta el contenido dentro del main y muestra la marca', async () => {
    const elemento = await abrir();

    expect(elemento.querySelector('main h1')?.textContent).toBe('Ingresar');
    expect(elemento.querySelector('aside')?.textContent).toContain('Vitrina');
  });

  it('el panel es decorativo: oculto al árbol de accesibilidad y con la ilustración sin texto alternativo', async () => {
    const elemento = await abrir();
    const ilustracion = elemento.querySelector('aside img');

    expect(elemento.querySelector('aside')?.getAttribute('aria-hidden')).toBe('true');
    expect(ilustracion?.getAttribute('alt')).toBe('');
    expect(ilustracion?.getAttribute('src')).toBe(RUTA_ILUSTRACION_VITRINA);
  });

  it('sin destacado no muestra «Invitación de»', async () => {
    const elemento = await abrir();

    expect(elemento.textContent).not.toContain('Invitación de');
  });

  it('con destacado muestra «Invitación de» y el nombre', async () => {
    const elemento = await abrir('Pollería El Sabor');

    expect(elemento.querySelector('aside')?.textContent).toContain('Invitación de');
    expect(elemento.querySelector('aside')?.textContent).toContain('Pollería El Sabor');
  });
});
