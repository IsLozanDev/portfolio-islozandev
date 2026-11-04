import { BreakpointObserver } from '@angular/cdk/layout';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSidenav } from '@angular/material/sidenav';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { of } from 'rxjs';
import { contextoDePrueba, DobleSesion, RUTAS_DE_PRUEBA } from '../../../testing/pagina-de-prueba';
import { ORIGENES_VOLVER_A } from '../../config/volver-a.config';
import { CLAVE_NOMBRE_APP, CLAVE_PREFIJO_MENU } from '../../models/datos-ruta-shell';
import { CLAVE_MENU_COLAPSADO } from '../../services/preferencia-menu.service';
import { LayoutComponent } from './layout.component';

@Component({ template: '<p>contenido</p>' })
class PaginaHija {}

type OpcionMenu = ReturnType<typeof contextoDePrueba>['menu'][number];

const MENU_ADMIN: OpcionMenu[] = [{ codigo: 'usuarios', padre: null, nombre: 'Usuarios', ruta: '/usuarios', icono: 'group', orden: 1 }];

describe('LayoutComponent', () => {
  let sesion: DobleSesion;
  let harness: RouterTestingHarness;

  async function abrir(escritorio: boolean, datos: Record<string, string> = {}, origenesVolverA: Record<string, string> = {}): Promise<void> {
    sesion = new DobleSesion();
    sesion.contexto.set(contextoDePrueba({ menu: MENU_ADMIN }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '', component: LayoutComponent, data: datos, children: [{ path: '**', component: PaginaHija }] }]),
        { provide: SesionService, useValue: sesion },
        { provide: CONFIG_AUTH, useValue: { rutas: RUTAS_DE_PRUEBA } },
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: escritorio, breakpoints: {} }) } },
        { provide: ORIGENES_VOLVER_A, useValue: origenesVolverA },
      ],
    });
    harness = await RouterTestingHarness.create('/');
    await harness.fixture.whenStable();
  }

  function elemento(): HTMLElement {
    return harness.fixture.nativeElement;
  }

  function menuLateral(): MatSidenav {
    return harness.fixture.debugElement.query(By.directive(MatSidenav)).componentInstance;
  }

  const botonAlternar = () => elemento().querySelector<HTMLButtonElement>('[data-accion="alternar-menu"]');
  const anchoMenu = () => elemento().querySelector<HTMLElement>('mat-sidenav-container')?.style.getPropertyValue('--mat-sidenav-container-width');
  const cajaBusqueda = () => elemento().querySelector<HTMLInputElement>('input[role="combobox"]');

  async function pulsarAtajo(opciones: KeyboardEventInit): Promise<KeyboardEvent> {
    const evento = new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true, ...opciones });
    document.dispatchEvent(evento);
    await harness.fixture.whenStable();
    return evento;
  }

  beforeEach(() => localStorage.clear());

  it('pinta el menú del contexto, el contenido, la marca y el nombre por defecto en el menú lateral', async () => {
    await abrir(true);
    const menu = elemento().querySelector('vit-menu-lateral')?.textContent;
    expect(menu).toContain('Usuarios');
    expect(menu).toContain('Vitrina');
    expect(menu).toContain('Plataforma');
    expect(elemento().querySelector('main')?.textContent).toContain('contenido');
  });

  it('usa el nombre de la app de data de la ruta', async () => {
    await abrir(true, { [CLAVE_NOMBRE_APP]: 'SazónPOS' });
    expect(elemento().querySelector('vit-menu-lateral')?.textContent).toContain('SazónPOS');
  });

  it('en escritorio la barra es clara y sin marca; en móvil es noche y muestra «Vitrina»', async () => {
    await abrir(true);
    const barraEscritorio = elemento().querySelector('mat-toolbar');
    expect(barraEscritorio?.classList).toContain('vit-barra-clara');
    expect(barraEscritorio?.textContent).not.toContain('Vitrina');

    TestBed.resetTestingModule();
    await abrir(false);
    const barraMovil = elemento().querySelector('mat-toolbar');
    expect(barraMovil?.classList).toContain('vit-barra-noche');
    expect(barraMovil?.textContent).toContain('Vitrina');
  });

  it('con prefijo de menú muestra solo las opciones de la app', async () => {
    await abrir(true, { [CLAVE_PREFIJO_MENU]: '/consola' });
    sesion.contexto.set(contextoDePrueba({ menu: [...MENU_ADMIN, { codigo: 'tenants', padre: null, nombre: 'Tenants', ruta: '/consola/tenants', icono: 'apartment', orden: 2 }] }));
    await harness.fixture.whenStable();

    const menu = elemento().querySelector('vit-menu-lateral')?.textContent;
    expect(menu).toContain('Tenants');
    expect(menu).not.toContain('Usuarios');
  });

  it('reemplaza el menú cuando cambia el contexto', async () => {
    await abrir(true);
    sesion.contexto.set(contextoDePrueba({ menu: [{ ...MENU_ADMIN[0], codigo: 'roles', nombre: 'Roles', ruta: '/roles' }] }));
    await harness.fixture.whenStable();

    const menu = elemento().querySelector('vit-menu-lateral')?.textContent;
    expect(menu).toContain('Roles');
    expect(menu).not.toContain('Usuarios');
  });

  describe('enlace «Volver a» (U-06)', () => {
    const CONSOLA = 'http://consola.vitrina.test:4201';
    const enlaceVolverA = () => elemento().querySelector<HTMLAnchorElement>('[data-accion=volver-a]');

    beforeEach(() => sessionStorage.clear());

    it('una entrada con volverA de la lista blanca muestra «Volver a <app>» hacia esa URL, también como ícono', async () => {
      await abrir(true, {}, { [CONSOLA]: 'Consola de plataforma' });
      await TestBed.inject(Router).navigateByUrl(`/usuarios?volverA=${encodeURIComponent(`${CONSOLA}/consola/tenants`)}`);
      await harness.fixture.whenStable();

      expect(enlaceVolverA()?.textContent).toContain('Volver a Consola de plataforma');
      expect(enlaceVolverA()?.getAttribute('href')).toBe(`${CONSOLA}/consola/tenants`);
      expect(elemento().querySelector('[data-accion=volver-a-icono]')?.getAttribute('aria-label')).toBe('Volver a Consola de plataforma');
    });

    it('un volverA ajeno no muestra enlace', async () => {
      await abrir(true, {}, { [CONSOLA]: 'Consola de plataforma' });
      await TestBed.inject(Router).navigateByUrl(`/usuarios?volverA=${encodeURIComponent('https://malo.test/')}`);
      await harness.fixture.whenStable();

      expect(enlaceVolverA()).toBeNull();
    });
  });

  it('en escritorio el menú está fijo y abierto, sin botón de menú', async () => {
    await abrir(true);
    expect(menuLateral().mode).toBe('side');
    expect(menuLateral().opened).toBe(true);
    expect(elemento().querySelector('button[aria-label="Abrir menú"]')).toBeNull();
  });

  it('en móvil el menú empieza cerrado, se abre con el botón y se cierra al navegar', async () => {
    await abrir(false);
    expect(menuLateral().mode).toBe('over');
    expect(menuLateral().opened).toBe(false);

    elemento().querySelector<HTMLButtonElement>('button[aria-label="Abrir menú"]')?.click();
    await harness.fixture.whenStable();
    expect(menuLateral().opened).toBe(true);

    await TestBed.inject(Router).navigateByUrl('/usuarios');
    await harness.fixture.whenStable();
    expect(menuLateral().opened).toBe(false);
  });

  describe('menú oculto o visible en escritorio (15d)', () => {
    it('arranca visible a 272 px con «Ocultar menú» y aria-expanded', async () => {
      await abrir(true);

      expect(botonAlternar()?.getAttribute('aria-label')).toBe('Ocultar menú');
      expect(botonAlternar()?.getAttribute('aria-expanded')).toBe('true');
      expect(botonAlternar()?.textContent).toContain('menu_open');
      expect(anchoMenu()).toBe('272px');
      expect(elemento().querySelector('vit-menu-lateral')).not.toBeNull();
      expect(elemento().querySelector('mat-sidenav-content')?.classList).toContain('vit-contenido-escritorio');
    });

    it('«Ocultar menú» deja la franja de 72 px y lo recuerda; «Mostrar menú» vuelve a 272 px', async () => {
      await abrir(true);

      botonAlternar()?.click();
      await harness.fixture.whenStable();
      expect(anchoMenu()).toBe('72px');
      expect(elemento().querySelector('vit-riel-menu')).not.toBeNull();
      expect(elemento().querySelector('vit-menu-lateral')).toBeNull();
      expect(botonAlternar()?.getAttribute('aria-label')).toBe('Mostrar menú');
      expect(botonAlternar()?.getAttribute('aria-expanded')).toBe('false');
      expect(botonAlternar()?.textContent).toContain('menu');
      expect(localStorage.getItem(CLAVE_MENU_COLAPSADO)).toBe('true');

      botonAlternar()?.click();
      await harness.fixture.whenStable();
      expect(anchoMenu()).toBe('272px');
      expect(elemento().querySelector('vit-menu-lateral')).not.toBeNull();
    });

    it('con la preferencia guardada arranca oculto', async () => {
      localStorage.setItem(CLAVE_MENU_COLAPSADO, 'true');
      await abrir(true);

      expect(elemento().querySelector('vit-riel-menu')).not.toBeNull();
      expect(anchoMenu()).toBe('72px');
    });

    it('en móvil no hay franja ni botón de ocultar aunque la preferencia esté guardada', async () => {
      localStorage.setItem(CLAVE_MENU_COLAPSADO, 'true');
      await abrir(false);

      expect(elemento().querySelector('vit-riel-menu')).toBeNull();
      expect(elemento().querySelector('vit-menu-lateral')).not.toBeNull();
      expect(botonAlternar()).toBeNull();
      expect(elemento().querySelector('mat-sidenav-content')?.classList).not.toContain('vit-contenido-escritorio');
    });

    it('el botón de búsqueda de la franja muestra el menú con el foco en la búsqueda', async () => {
      localStorage.setItem(CLAVE_MENU_COLAPSADO, 'true');
      await abrir(true);

      elemento().querySelector<HTMLButtonElement>('vit-riel-menu button[aria-label="Buscar en el menú"]')?.click();
      await harness.fixture.whenStable();

      expect(elemento().querySelector('vit-riel-menu')).toBeNull();
      expect(document.activeElement).toBe(cajaBusqueda());
    });
  });

  it('en escritorio Esc dentro del menú no lo cierra; en móvil sí', async () => {
    const pulsarEsc = () =>
      elemento().querySelector('mat-sidenav')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    await abrir(true);
    pulsarEsc();
    await harness.fixture.whenStable();
    expect(menuLateral().opened).toBe(true);

    TestBed.resetTestingModule();
    await abrir(false);
    await menuLateral().open();
    pulsarEsc();
    await harness.fixture.whenStable();
    expect(menuLateral().opened).toBe(false);
  });

  describe('atajo Ctrl K (15d)', () => {
    it('con el menú oculto lo muestra, enfoca la búsqueda y evita la acción del navegador', async () => {
      localStorage.setItem(CLAVE_MENU_COLAPSADO, 'true');
      await abrir(true);

      const evento = await pulsarAtajo({ ctrlKey: true });

      expect(evento.defaultPrevented).toBe(true);
      expect(elemento().querySelector('vit-menu-lateral')).not.toBeNull();
      expect(document.activeElement).toBe(cajaBusqueda());
      expect(localStorage.getItem(CLAVE_MENU_COLAPSADO)).toBe('false');
    });

    it('Cmd K hace lo mismo', async () => {
      await abrir(true);

      const evento = await pulsarAtajo({ metaKey: true, key: 'K' });

      expect(evento.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(cajaBusqueda());
    });

    it('K sin modificador, o con Alt o Mayúsculas, no hace nada', async () => {
      await abrir(true);

      expect((await pulsarAtajo({})).defaultPrevented).toBe(false);
      expect((await pulsarAtajo({ ctrlKey: true, altKey: true })).defaultPrevented).toBe(false);
      expect((await pulsarAtajo({ ctrlKey: true, shiftKey: true })).defaultPrevented).toBe(false);
    });

    it('en móvil abre el menú con el foco en la búsqueda', async () => {
      await abrir(false);

      await pulsarAtajo({ ctrlKey: true });
      // jsdom no anima: `MatSidenav.open()` resuelve con el fin de la transición.
      elemento().querySelector('mat-sidenav')?.dispatchEvent(new Event('transitionend'));
      await harness.fixture.whenStable();

      expect(menuLateral().opened).toBe(true);
      expect(document.activeElement).toBe(cajaBusqueda());
    });
  });
});
