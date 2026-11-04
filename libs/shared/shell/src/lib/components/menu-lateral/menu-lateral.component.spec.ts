import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { INSIGNIAS_MENU, type InsigniasMenu } from '../../config/insignias-menu';
import type { NodoMenu } from '../../models/nodo-menu';
import { MenuLateralComponent } from './menu-lateral.component';

@Component({ selector: 'vit-pagina-menu', template: '' })
class Pagina {}

const MENU: NodoMenu[] = [
  { codigo: 'inicio', nombre: 'Inicio', ruta: '/', icono: 'home', hijos: [] },
  {
    codigo: 'admin',
    nombre: 'Administración',
    ruta: null,
    icono: 'admin_panel_settings',
    hijos: [{ codigo: 'usuarios', nombre: 'Usuarios', ruta: '/usuarios', icono: 'group', hijos: [] }],
  },
  {
    codigo: 'ventas',
    nombre: 'Ventas',
    ruta: null,
    icono: 'receipt_long',
    hijos: [{ codigo: 'pedidos', nombre: 'Pedidos', ruta: '/ventas/pedidos', icono: 'list', hijos: [] }],
  },
];

describe('MenuLateralComponent', () => {
  let fixture: ComponentFixture<MenuLateralComponent>;

  async function abrir(nodos: NodoMenu[], urlInicial?: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', component: Pagina }])] });
    if (urlInicial) await TestBed.inject(Router).navigateByUrl(urlInicial);
    fixture = TestBed.createComponent(MenuLateralComponent);
    fixture.componentRef.setInput('nodos', nodos);
    fixture.componentRef.setInput('nombreApp', 'Administración');
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  function grupo(elemento: HTMLElement, nombre = 'Administración'): HTMLButtonElement {
    const boton = [...elemento.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find((candidato) =>
      candidato.textContent?.includes(nombre),
    );
    if (!boton) throw new Error(`No hay grupo ${nombre}`);
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

  it('al entrar por URL expande el grupo de la página actual', async () => {
    const elemento = await abrir(MENU, '/usuarios/42');

    expect(grupo(elemento).getAttribute('aria-expanded')).toBe('true');
    expect(grupo(elemento, 'Ventas').getAttribute('aria-expanded')).toBe('false');
  });

  it('al navegar expande el grupo nuevo y deja abiertos los que abrió el usuario', async () => {
    const elemento = await abrir(MENU, '/');
    grupo(elemento).click();
    await fixture.whenStable();

    await TestBed.inject(Router).navigateByUrl('/ventas/pedidos');
    await fixture.whenStable();

    expect(grupo(elemento).getAttribute('aria-expanded')).toBe('true');
    expect(grupo(elemento, 'Ventas').getAttribute('aria-expanded')).toBe('true');
  });

  it('elegir un resultado de la búsqueda navega y expande su grupo', async () => {
    const elemento = await abrir(MENU, '/');
    const caja = elemento.querySelector<HTMLInputElement>('input[role="combobox"]') as HTMLInputElement;
    caja.value = 'pedi';
    caja.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    elemento.querySelector<HTMLElement>('[role="option"]')?.click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/ventas/pedidos');
    expect(caja.value).toBe('');
    expect(grupo(elemento, 'Ventas').getAttribute('aria-expanded')).toBe('true');
  });

  it('muestra la marca y el nombre de la app arriba', async () => {
    const elemento = await abrir(MENU);

    expect(elemento.textContent).toContain('Vitrina');
    expect(elemento.textContent).toContain('Administración');
  });

  it('sin opciones muestra el estado vacío', async () => {
    const elemento = await abrir([]);

    expect(elemento.querySelector('nav')).toBeNull();
    expect(elemento.textContent).toContain('No tiene opciones de menú');
  });
});

describe('MenuLateralComponent: insignias (spec 18)', () => {
  const insignias = signal<InsigniasMenu>({ usuarios: 3 });

  async function abrir(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Pagina }]), { provide: INSIGNIAS_MENU, useValue: insignias.asReadonly() }],
    });
    const fixture = TestBed.createComponent(MenuLateralComponent);
    fixture.componentRef.setInput('nodos', MENU);
    fixture.componentRef.setInput('nombreApp', 'Administración');
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  const textoDe = (elemento: Element | null | undefined) => elemento?.textContent?.replace(/\s+/g, ' ').trim();

  it('con el grupo cerrado la suma va en el grupo, con texto para el lector de pantalla', async () => {
    insignias.set({ usuarios: 3 });
    const elemento = await abrir();

    const grupo = [...elemento.querySelectorAll('button[aria-expanded]')].find((boton) => boton.textContent?.includes('Administración'));
    expect(textoDe(grupo?.querySelector('.vit-insignia-menu'))).toBe('3');
    expect(textoDe(grupo?.querySelector('.sr-only'))).toBe('3 pendientes');
  });

  it('con el grupo abierto la insignia pasa a la opción y se actualiza con la señal', async () => {
    insignias.set({ usuarios: 3 });
    const elemento = await abrir();
    const grupo = [...elemento.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find((boton) => boton.textContent?.includes('Administración'));
    grupo?.click();
    TestBed.tick();

    const usuarios = [...elemento.querySelectorAll('a')].find((enlace) => enlace.textContent?.includes('Usuarios'));
    expect(textoDe(grupo?.querySelector('.vit-insignia-menu'))).toBeUndefined();
    expect(textoDe(usuarios?.querySelector('.vit-insignia-menu'))).toBe('3');

    insignias.set({ usuarios: 1 });
    TestBed.tick();
    expect(textoDe(usuarios?.querySelector('.sr-only'))).toBe('1 pendiente');
  });

  it('en 0 no muestra nada', async () => {
    insignias.set({ usuarios: 0 });
    const elemento = await abrir();
    expect(elemento.querySelector('.vit-insignia-menu')).toBeNull();
  });
});
