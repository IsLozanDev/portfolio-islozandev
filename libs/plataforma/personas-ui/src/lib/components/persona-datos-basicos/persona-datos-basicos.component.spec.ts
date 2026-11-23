import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { cambiosDe, dependenciasDeFicha, estable } from '../../../testing/ficha-de-prueba';
import { FICHA_DE_PRUEBA } from '../../../testing/persona-de-prueba';
import type { CambioFicha } from '../../models/ficha';
import { PanelDatosBasicosComponent } from '../panel-datos-basicos/panel-datos-basicos.component';
import { PersonaDatosBasicosComponent } from './persona-datos-basicos.component';

describe('PersonaDatosBasicosComponent', () => {
  let fixture: ComponentFixture<PersonaDatosBasicosComponent>;
  let dobles: ReturnType<typeof dependenciasDeFicha>;
  let cambios: CambioFicha[];

  function montar(permisos: string[]): void {
    dobles = dependenciasDeFicha(new Set(permisos));
    TestBed.configureTestingModule({ providers: dobles.proveedores });
    fixture = TestBed.createComponent(PersonaDatosBasicosComponent);
    fixture.componentRef.setInput('persona', FICHA_DE_PRUEBA);
    cambios = cambiosDe(fixture);
    fixture.detectChanges();
  }

  const elemento = () => fixture.nativeElement as HTMLElement;

  it('muestra nombres, apellidos y documento; sin plat.persona.editar no hay «Editar»', () => {
    montar([]);
    expect(elemento().querySelector('[data-prueba="nombres"]')?.textContent?.trim()).toBe('Juana');
    expect(elemento().querySelector('[data-prueba="apellido-materno"]')?.textContent?.trim()).toBe('Mamani');
    expect(elemento().textContent).toContain('45781236');
    expect(elemento().querySelector('[data-accion="editar-datos"]')).toBeNull();
  });

  it('«Editar» abre el panel; si otro cambió la persona, pide recargar con aviso', async () => {
    montar(['plat.persona.editar']);
    dobles.panel.resultado = { tipo: 'obsoleta' };
    elemento().querySelector<HTMLButtonElement>('[data-accion="editar-datos"]')?.click();
    await estable(fixture);

    expect(dobles.panel.abrir).toHaveBeenCalledWith(PanelDatosBasicosComponent, { datos: { persona: FICHA_DE_PRUEBA } });
    expect(cambios).toEqual([{ tipo: 'recargar', aviso: 'La persona cambió; se recargaron sus datos' }]);
  });
});
