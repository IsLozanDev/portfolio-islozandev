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

  it('pinta el menú del contexto, el contenido y el nombre por defecto', async () => {
    await abrir(true);
    expect(elemento().querySelector('vit-menu-lateral')?.textContent).toContain('Usuarios');
    expect(elemento().querySelector('main')?.textContent).toContain('contenido');
    expect(elemento().querySelector('mat-toolbar')?.textContent).toContain('Plataforma');
  });

  it('usa el nombre de la app de data de la ruta', async () => {
    await abrir(true, { [CLAVE_NOMBRE_APP]: 'SazónPOS' });
    expect(elemento().querySelector('mat-toolbar')?.textContent).toContain('SazónPOS');
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
});
