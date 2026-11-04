import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { INSIGNIAS_MENU } from '../../config/insignias-menu';
import type { NodoMenu } from '../../models/nodo-menu';
import { RielMenuComponent } from './riel-menu.component';

@Component({ selector: 'vit-pagina-riel', template: '' })
class Pagina {}

const MENU: NodoMenu[] = [
  { codigo: 'inicio', nombre: 'Inicio', ruta: '/', icono: 'home', hijos: [] },
  {
    codigo: 'ventas',
    nombre: 'Ventas',
    ruta: null,
    icono: 'point_of_sale',
    hijos: [
      { codigo: 'pedidos', nombre: 'Pedidos', ruta: '/ventas/pedidos', icono: 'list', hijos: [] },
      {
        codigo: 'comprobantes',
        nombre: 'Comprobantes',
        ruta: null,
        icono: 'receipt',
        hijos: [{ codigo: 'boletas', nombre: 'Boletas', ruta: '/ventas/comprobantes/boletas', icono: 'receipt', hijos: [] }],
      },
    ],
  },
];

describe('RielMenuComponent', () => {
  let fixture: ComponentFixture<RielMenuComponent>;
  let elemento: HTMLElement;

  async function abrir(urlInicial = '/'): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', component: Pagina }])] });
    await TestBed.inject(Router).navigateByUrl(urlInicial);
    fixture = TestBed.createComponent(RielMenuComponent);
    fixture.componentRef.setInput('nodos', MENU);
    await fixture.whenStable();
    elemento = fixture.nativeElement;
  }

  const botonDe = (nombre: string) => elemento.querySelector<HTMLElement>(`nav [aria-label="${nombre}"]`) as HTMLElement;
  const panelSubmenu = () => document.querySelector<HTMLElement>('.vit-submenu-riel');

  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((contenedor) => contenedor.replaceChildren()));

  it('pinta un botón por nodo de primer nivel con su nombre como aria-label', async () => {
    await abrir();

    const nombres = [...elemento.querySelectorAll('nav [aria-label]')].map((boton) => boton.getAttribute('aria-label'));
    expect(nombres).toEqual(['Inicio', 'Ventas']);
    expect(elemento.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Vitrina');
  });

  it('un nodo con ruta es un enlace que navega', async () => {
    await abrir('/ventas/pedidos');

    botonDe('Inicio').click();
    await fixture.whenStable();

    expect(botonDe('Inicio').getAttribute('href')).toBe('/');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('un grupo abre el submenú con todo su subárbol y la sangría por nivel', async () => {
    await abrir();

    botonDe('Ventas').click();
    await fixture.whenStable();

    const panel = panelSubmenu();
    expect(panel?.textContent).toContain('Ventas');
    const enlaces = [...(panel?.querySelectorAll<HTMLAnchorElement>('a[mat-menu-item]') ?? [])];
    expect(enlaces.map((enlace) => enlace.getAttribute('href'))).toEqual(['/ventas/pedidos', '/ventas/comprobantes/boletas']);
    expect(panel?.querySelector('.vit-grupo-submenu')?.textContent).toContain('Comprobantes');
    expect(enlaces[1].style.paddingInlineStart).toBe('28px');
    expect(botonDe('Ventas').getAttribute('aria-expanded')).toBe('true');
  });

  it('elegir una opción del submenú navega y lo cierra', async () => {
    await abrir();
    botonDe('Ventas').click();
    await fixture.whenStable();

    panelSubmenu()?.querySelector<HTMLAnchorElement>('a[href="/ventas/pedidos"]')?.click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/ventas/pedidos');
    expect(botonDe('Ventas').getAttribute('aria-expanded')).toBe('false');
  });

  it('el módulo que contiene la página actual lleva la cápsula', async () => {
    await abrir('/ventas/comprobantes/boletas');

    expect(botonDe('Ventas').classList).toContain('vit-riel-activo');
    expect(botonDe('Inicio').classList).not.toContain('vit-riel-activo');
  });

  it('la raíz solo lleva la cápsula en sí misma', async () => {
    await abrir('/');
    expect(botonDe('Inicio').classList).toContain('vit-riel-activo');

    await TestBed.inject(Router).navigateByUrl('/ventas/pedidos');
    await fixture.whenStable();
    expect(botonDe('Inicio').classList).not.toContain('vit-riel-activo');
    expect(botonDe('Ventas').classList).toContain('vit-riel-activo');
  });

  it('el botón de búsqueda emite buscar', async () => {
    await abrir();
    let pedidos = 0;
    fixture.componentInstance.buscar.subscribe(() => pedidos++);

    elemento.querySelector<HTMLButtonElement>('button[aria-label="Buscar en el menú"]')?.click();

    expect(pedidos).toBe(1);
  });
});

describe('RielMenuComponent: insignias (spec 18)', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((contenedor) => contenedor.replaceChildren()));

  it('el grupo lleva la suma sobre el ícono y en su nombre accesible; el submenú, la de cada opción', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Pagina }]), { provide: INSIGNIAS_MENU, useValue: signal({ pedidos: 2, boletas: 1 }).asReadonly() }],
    });
    const fixture = TestBed.createComponent(RielMenuComponent);
    fixture.componentRef.setInput('nodos', MENU);
    await fixture.whenStable();
    const elemento: HTMLElement = fixture.nativeElement;

    const ventas = elemento.querySelector<HTMLButtonElement>('nav [aria-label="Ventas, 3 pendientes"]');
    expect(ventas?.querySelector('.vit-insignia-riel')?.textContent?.trim()).toBe('3');
    expect(elemento.querySelector('nav [aria-label="Inicio"] .vit-insignia-riel')).toBeNull();

    ventas?.click();
    await fixture.whenStable();
    const pedidos = [...document.querySelectorAll('.vit-submenu-riel a')].find((enlace) => enlace.textContent?.includes('Pedidos'));
    expect(pedidos?.querySelector('.vit-insignia-menu')?.textContent?.trim()).toBe('2');
  });
});
