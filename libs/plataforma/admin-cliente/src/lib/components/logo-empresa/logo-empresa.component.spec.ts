import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { LogoEmpresaComponent, type TamanoLogo } from './logo-empresa.component';

const URL_LOGO = 'https://storage.ejemplo/logo.png';

@Component({
  imports: [LogoEmpresaComponent],
  template: '<vit-logo-empresa [url]="url()" nombre="sabores del Sur SAC" [tamano]="tamano()" />',
})
class LogoDePrueba {
  readonly url = signal<string | null>(null);
  readonly tamano = signal<TamanoLogo>(32);
}

describe('LogoEmpresaComponent', () => {
  let fixture: ComponentFixture<LogoDePrueba>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(LogoDePrueba);
    await fixture.whenStable();
  });

  const elemento = (selector: string): HTMLElement | null => fixture.nativeElement.querySelector(selector);

  async function conUrl(url: string | null): Promise<void> {
    fixture.componentInstance.url.set(url);
    await fixture.whenStable();
  }

  it('sin URL muestra la inicial de la razón social en mayúscula', () => {
    expect(elemento('img')).toBeNull();
    expect(elemento('[data-prueba="inicial-logo"]')?.textContent?.trim()).toBe('S');
  });

  it('con URL muestra la imagen con su texto alternativo', async () => {
    await conUrl(URL_LOGO);

    const imagen = elemento('img') as HTMLImageElement;
    expect(imagen.src).toBe(URL_LOGO);
    expect(imagen.alt).toBe('Logo de sabores del Sur SAC');
    expect(imagen.classList).toContain('object-contain');
  });

  it('si la imagen no carga vuelve a la inicial, y lo intenta de nuevo con otra URL', async () => {
    await conUrl(URL_LOGO);
    elemento('img')?.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(elemento('img')).toBeNull();
    expect(elemento('[data-prueba="inicial-logo"]')).not.toBeNull();

    await conUrl(`${URL_LOGO}?firma=nueva`);
    expect(elemento('img')).not.toBeNull();
  });

  it('mide 32 px en la lista y 96 px en el formulario', async () => {
    expect(elemento('[data-prueba="logo-empresa"]')?.classList).toContain('size-8');

    fixture.componentInstance.tamano.set(96);
    await fixture.whenStable();
    expect(elemento('[data-prueba="logo-empresa"]')?.classList).toContain('size-24');
  });
});
