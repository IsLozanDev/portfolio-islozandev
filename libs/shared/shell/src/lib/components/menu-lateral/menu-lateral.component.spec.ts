import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { NodoMenu } from '../../models/nodo-menu';
import { MenuLateralComponent } from './menu-lateral.component';

const MENU: NodoMenu[] = [
  { codigo: 'inicio', nombre: 'Inicio', ruta: '/', icono: 'home', hijos: [] },
  {
    codigo: 'admin',
    nombre: 'Administración',
    ruta: null,
    icono: 'admin_panel_settings',
    hijos: [{ codigo: 'usuarios', nombre: 'Usuarios', ruta: '/usuarios', icono: 'group', hijos: [] }],
  },
];

describe('MenuLateralComponent', () => {
  let fixture: ComponentFixture<MenuLateralComponent>;

  async function abrir(nodos: NodoMenu[]): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(MenuLateralComponent);
    fixture.componentRef.setInput('nodos', nodos);
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  function grupo(elemento: HTMLElement): HTMLButtonElement {
    const boton = elemento.querySelector<HTMLButtonElement>('button[aria-expanded]');
    if (!boton) throw new Error('No hay grupo');
    return boton;
  }

  it('pinta los enlaces con su ruta y los grupos cerrados', async () => {
    const elemento = await abrir(MENU);

    const enlaces = [...elemento.querySelectorAll('a')].map((enlace) => enlace.getAttribute('href'));
    expect(enlaces).toEqual(['/']);
    expect(grupo(elemento).textContent).toContain('Administración');
    expect(grupo(elemento).getAttribute('aria-expanded')).toBe('false');
    expect(elemento.textContent).not.toContain('Usuarios');
  });

  it('al pulsar un grupo muestra sus hijos y marca aria-expanded', async () => {
    const elemento = await abrir(MENU);

    grupo(elemento).click();
    await fixture.whenStable();

    expect(grupo(elemento).getAttribute('aria-expanded')).toBe('true');
    expect(elemento.querySelector('a[href="/usuarios"]')?.textContent).toContain('Usuarios');
  });

  it('sin opciones muestra el estado vacío', async () => {
    const elemento = await abrir([]);

    expect(elemento.querySelector('nav')).toBeNull();
    expect(elemento.textContent).toContain('No tiene opciones de menú');
  });
});
