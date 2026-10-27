import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { provideRouter, Router } from '@angular/router';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { contextoDePrueba, DobleSesion, MIRAFLORES, RUTAS_DE_PRUEBA, SURCO } from '../../../testing/pagina-de-prueba';
import { MENSAJES_SHELL } from '../../models/mensajes-shell';
import { SelectorSucursalComponent } from './selector-sucursal.component';

describe('SelectorSucursalComponent (TR-RF-016)', () => {
  let sesion: DobleSesion;
  let avisos: { toast: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let navegar: ReturnType<typeof vi.spyOn>;
  let fixture: ComponentFixture<SelectorSucursalComponent>;

  async function abrir(sucursales = [MIRAFLORES, SURCO]): Promise<void> {
    sesion = new DobleSesion();
    sesion.contexto.set(contextoDePrueba({ sucursales, sucursalActual: MIRAFLORES.id }));
    avisos = { toast: vi.fn(), error: vi.fn(async () => undefined) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SesionService, useValue: sesion },
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { rutas: RUTAS_DE_PRUEBA } },
      ],
    });
    navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(SelectorSucursalComponent);
    await fixture.whenStable();
  }

  async function elegir(nombre: string): Promise<void> {
    const menu = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatMenuHarness);
    await menu.open();
    await menu.clickItem({ text: new RegExp(nombre) });
    await fixture.whenStable();
  }

  it('TR-CA-044: con una sola sucursal muestra su nombre sin menú', async () => {
    await abrir([MIRAFLORES]);

    expect(fixture.nativeElement.textContent).toContain('Miraflores');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('con varias muestra la actual y la lista ordenada con la actual marcada', async () => {
    await abrir([SURCO, MIRAFLORES]);
    const menu = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatMenuHarness);

    expect(await menu.getTriggerText()).toContain('Miraflores');
    await menu.open();
    const opciones = await menu.getItems();
    expect(await Promise.all(opciones.map((opcion) => opcion.getText()))).toEqual(['checkMiraflores', 'storeSurco']);
    expect(document.querySelector('[mat-menu-item][aria-current="true"]')?.textContent).toContain('Miraflores');
  });

  it('TR-CA-045: elegir «Surco» recarga el contexto, va al inicio y avisa con un toast', async () => {
    await abrir();

    await elegir('Surco');

    expect(sesion.seleccionarSucursal).toHaveBeenCalledWith(SURCO.id, { omitirAvisoError: true });
    expect(navegar).toHaveBeenCalledWith('/');
    expect(avisos.toast).toHaveBeenCalledWith('exito', 'Ahora trabaja en Surco');
  });

  it('elegir la sucursal actual no hace nada', async () => {
    await abrir();

    await elegir('Miraflores');

    expect(sesion.seleccionarSucursal).not.toHaveBeenCalled();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('si falla muestra el error, no navega y se queda la actual', async () => {
    await abrir();
    sesion.seleccionarSucursal.mockRejectedValueOnce(new Error('500'));

    await elegir('Surco');

    expect(avisos.error).toHaveBeenCalledWith(MENSAJES_SHELL.errorCambiarSucursal);
    expect(navegar).not.toHaveBeenCalled();
    const menu = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatMenuHarness);
    expect(await menu.getTriggerText()).toContain('Miraflores');
    expect(await menu.isDisabled()).toBe(false);
  });

  it('mientras cambia deshabilita el botón', async () => {
    await abrir();
    let terminar: () => void = () => undefined;
    sesion.seleccionarSucursal.mockImplementationOnce(() => new Promise<void>((resolver) => (terminar = resolver)));

    const menu = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatMenuHarness);
    await menu.open();
    const [, surco] = await menu.getItems();
    void surco.click();
    await vi.waitFor(() => expect(sesion.seleccionarSucursal).toHaveBeenCalled());
    await fixture.whenStable();

    expect(await menu.isDisabled()).toBe(true);
    terminar();
  });
});
