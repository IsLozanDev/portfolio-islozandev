import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { NodoMenu } from '../../models/nodo-menu';
import type { ResultadoBusquedaMenu } from '../../models/resultado-busqueda-menu';
import { BuscadorMenuComponent } from './buscador-menu.component';

const MENU: NodoMenu[] = [
  { codigo: 'caja', nombre: 'Caja', ruta: '/caja', icono: 'payments', hijos: [] },
  {
    codigo: 'salon',
    nombre: 'Salón',
    ruta: null,
    icono: 'table_restaurant',
    hijos: [
      { codigo: 'mesas', nombre: 'Mesas', ruta: '/salon/mesas', icono: 'circle', hijos: [] },
      { codigo: 'reservas', nombre: 'Reservas', ruta: '/salon/reservas', icono: 'circle', hijos: [] },
    ],
  },
];

@Component({
  imports: [BuscadorMenuComponent],
  template: `<vit-buscador-menu [nodos]="nodos" (elegido)="elegidos.update((previos) => [...previos, $event])">
    <p id="arbol">Árbol del menú</p>
  </vit-buscador-menu>`,
})
class Anfitrion {
  readonly nodos = MENU;
  readonly elegidos = signal<ResultadoBusquedaMenu[]>([]);
}

describe('BuscadorMenuComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;
  let elemento: HTMLElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Anfitrion);
    await fixture.whenStable();
    elemento = fixture.nativeElement;
  });

  const caja = () => elemento.querySelector<HTMLInputElement>('input[role="combobox"]') as HTMLInputElement;
  const opciones = () => [...elemento.querySelectorAll<HTMLElement>('[role="option"]')];
  const anuncio = () => elemento.querySelector('[aria-live="polite"]')?.textContent?.trim();

  async function escribir(texto: string): Promise<void> {
    caja().value = texto;
    caja().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function pulsar(tecla: string): Promise<KeyboardEvent> {
    const evento = new KeyboardEvent('keydown', { key: tecla, bubbles: true, cancelable: true });
    caja().dispatchEvent(evento);
    await fixture.whenStable();
    return evento;
  }

  it('sin texto proyecta el árbol, muestra la pista Ctrl K y no anuncia nada', () => {
    expect(elemento.querySelector('#arbol')).not.toBeNull();
    expect(elemento.querySelector('kbd')?.textContent).toContain('Ctrl K');
    expect(elemento.querySelector('[aria-label="Borrar búsqueda"]')).toBeNull();
    expect(caja().getAttribute('aria-expanded')).toBe('false');
    expect(anuncio()).toBe('');
  });

  it('al escribir muestra solo los resultados con la coincidencia marcada y la ruta de grupos', async () => {
    await escribir('salon');

    expect(elemento.querySelector('#arbol')).toBeNull();
    expect(opciones().map((opcion) => opcion.textContent)).toEqual([expect.stringContaining('Mesas'), expect.stringContaining('Reservas')]);
    expect(opciones()[0].textContent).toContain('Salón');
    expect(opciones()[0].querySelector('mark')).toBeNull();
    expect(caja().getAttribute('aria-expanded')).toBe('true');
    expect(elemento.querySelector('kbd')).toBeNull();
    expect(elemento.querySelector('[aria-label="Borrar búsqueda"]')).not.toBeNull();
  });

  it('marca el tramo del nombre que coincide', async () => {
    await escribir('serv');

    expect(opciones()[0].querySelector('mark')?.textContent).toBe('serv');
  });

  it('anuncia el número de resultados en la región aria-live', async () => {
    await escribir('salon');
    expect(anuncio()).toBe('2 opciones');

    await escribir('caja');
    expect(anuncio()).toBe('1 opción');
  });

  it('sin resultados muestra el mensaje con la consulta y la ayuda', async () => {
    await escribir('zzz');

    expect(opciones()).toHaveLength(0);
    expect(elemento.querySelector('[role="listbox"]')).toBeNull();
    expect(caja().hasAttribute('aria-controls')).toBe(false);
    expect(elemento.textContent).toContain('Ninguna opción coincide con «zzz»');
    expect(elemento.textContent).toContain('Revise cómo lo escribió');
    expect(anuncio()).toBe('0 opciones');
  });

  it('↓ y ↑ recorren los resultados con aria-activedescendant sin salir de la lista', async () => {
    await escribir('salon');

    const abajo = await pulsar('ArrowDown');
    expect(abajo.defaultPrevented).toBe(true);
    expect(caja().getAttribute('aria-activedescendant')).toBe(opciones()[0].id);
    expect(opciones()[0].getAttribute('aria-selected')).toBe('true');

    await pulsar('ArrowDown');
    await pulsar('ArrowDown');
    expect(caja().getAttribute('aria-activedescendant')).toBe(opciones()[1].id);

    await pulsar('ArrowUp');
    await pulsar('ArrowUp');
    expect(caja().getAttribute('aria-activedescendant')).toBe(opciones()[0].id);
  });

  it('Enter emite el resultado activo y borra la búsqueda', async () => {
    await escribir('salon');
    await pulsar('ArrowDown');
    await pulsar('ArrowDown');

    const enter = await pulsar('Enter');

    expect(enter.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.elegidos().map((resultado) => resultado.ruta)).toEqual(['/salon/reservas']);
    expect(caja().value).toBe('');
    expect(elemento.querySelector('#arbol')).not.toBeNull();
  });

  it('Enter sin resultado activo no emite', async () => {
    await escribir('salon');
    await pulsar('Enter');

    expect(fixture.componentInstance.elegidos()).toEqual([]);
  });

  it('pulsar un resultado lo emite', async () => {
    await escribir('caja');
    opciones()[0].click();
    await fixture.whenStable();

    expect(fixture.componentInstance.elegidos().map((resultado) => resultado.codigo)).toEqual(['caja']);
  });

  it('Esc con texto borra la búsqueda y no deja pasar la tecla', async () => {
    await escribir('salon');
    const esc = await pulsar('Escape');

    expect(esc.defaultPrevented).toBe(true);
    expect(caja().value).toBe('');
    expect(elemento.querySelector('#arbol')).not.toBeNull();
  });

  it('Esc sin texto deja pasar la tecla', async () => {
    const esc = await pulsar('Escape');

    expect(esc.defaultPrevented).toBe(false);
  });

  it('«Borrar búsqueda» vacía la caja y le devuelve el foco', async () => {
    await escribir('salon');
    elemento.querySelector<HTMLButtonElement>('[aria-label="Borrar búsqueda"]')?.click();
    await fixture.whenStable();

    expect(caja().value).toBe('');
    expect(document.activeElement).toBe(caja());
  });

  it('enfocar() pone el foco en la caja', () => {
    fixture.debugElement.children[0].componentInstance.enfocar();

    expect(document.activeElement).toBe(caja());
  });
});
