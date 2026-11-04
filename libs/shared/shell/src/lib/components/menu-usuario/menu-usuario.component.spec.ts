import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { provideRouter, Router } from '@angular/router';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { type PreferenciaTema, TemaService } from '@vitrina/shared/ui';
import { DobleSesion, RUTAS_DE_PRUEBA } from '../../../testing/pagina-de-prueba';
import { VolverAService } from '../../services/volver-a.service';
import { MenuUsuarioComponent } from './menu-usuario.component';

describe('MenuUsuarioComponent', () => {
  it('muestra el correo y «Salir» quita el enlace de vuelta, cierra la sesión y va a ingresar', async () => {
    const sesion = new DobleSesion();
    const volverA = { limpiar: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SesionService, useValue: sesion },
        { provide: CONFIG_AUTH, useValue: { rutas: RUTAS_DE_PRUEBA } },
        { provide: VolverAService, useValue: volverA },
      ],
    });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(MenuUsuarioComponent);
    const menu = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatMenuHarness);
    const disparador: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(disparador.textContent?.trim()).toBe('C');
    expect(disparador.getAttribute('aria-label')).toBe('Menú de usuario');

    await menu.open();
    expect(document.querySelector('.mat-mdc-menu-panel')?.textContent).toContain('carmen@correo.pe');
    await menu.clickItem({ text: /Salir/ });

    expect(volverA.limpiar).toHaveBeenCalledTimes(1);
    expect(sesion.salir).toHaveBeenCalledTimes(1);
    expect(navegar).toHaveBeenCalledWith('/auth/ingresar');
  });

  it('sin correo muestra el ícono de cuenta en lugar de la inicial', async () => {
    const sesion = new DobleSesion();
    sesion.sesion.set(null);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SesionService, useValue: sesion }, { provide: CONFIG_AUTH, useValue: { rutas: RUTAS_DE_PRUEBA } }],
    });
    const fixture = TestBed.createComponent(MenuUsuarioComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('button mat-icon')?.textContent?.trim()).toBe('account_circle');
  });

  it('las opciones de tema marcan la preferencia guardada y elegir otra llama a elegir', async () => {
    const tema = { preferencia: signal<PreferenciaTema>('claro'), elegir: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SesionService, useValue: new DobleSesion() },
        { provide: CONFIG_AUTH, useValue: { rutas: RUTAS_DE_PRUEBA } },
        { provide: TemaService, useValue: tema },
      ],
    });
    const fixture = TestBed.createComponent(MenuUsuarioComponent);
    const menu = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatMenuHarness);
    await menu.open();
    const opciones = [...document.querySelectorAll('[role="menuitemradio"]')];

    expect(opciones.map((opcion) => opcion.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['contrast Sistema', 'light_mode Claro check', 'dark_mode Oscuro']);
    expect(opciones.map((opcion) => opcion.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(document.querySelector('[role="group"]')?.getAttribute('aria-labelledby')).toBe('vit-etiqueta-tema');

    await menu.clickItem({ text: /Oscuro/ });

    expect(tema.elegir).toHaveBeenCalledWith('oscuro');
  });
});
