import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { provideRouter, Router } from '@angular/router';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
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

    await menu.open();
    expect(document.querySelector('.mat-mdc-menu-panel')?.textContent).toContain('carmen@correo.pe');
    await menu.clickItem({ text: /Salir/ });

    expect(volverA.limpiar).toHaveBeenCalledTimes(1);
    expect(sesion.salir).toHaveBeenCalledTimes(1);
    expect(navegar).toHaveBeenCalledWith('/auth/ingresar');
  });
});
