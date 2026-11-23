import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { cambiosDe, dependenciasDeFicha, estable } from '../../../testing/ficha-de-prueba';
import { FICHA_DE_PRUEBA } from '../../../testing/persona-de-prueba';
import type { CambioFicha } from '../../models/ficha';
import { PanelRolComponent } from '../panel-rol/panel-rol.component';
import { PersonaRolesComponent } from './persona-roles.component';

describe('PersonaRolesComponent', () => {
  let fixture: ComponentFixture<PersonaRolesComponent>;
  let dobles: ReturnType<typeof dependenciasDeFicha>;
  let cambios: CambioFicha[];

  function montar(permisos: string[]): void {
    dobles = dependenciasDeFicha(new Set(permisos));
    TestBed.configureTestingModule({ providers: dobles.proveedores });
    fixture = TestBed.createComponent(PersonaRolesComponent);
    fixture.componentRef.setInput('persona', FICHA_DE_PRUEBA);
    cambios = cambiosDe(fixture);
    fixture.detectChanges();
  }

  it('lista los roles vigentes con su fecha de Lima', () => {
    montar([]);
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Paciente');
    expect(texto).toContain('Socio');
    expect(texto).toContain('18/11/2026');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-accion="asignar-rol"]')).toBeNull();
  });

  it('«Asignar rol» abre el panel y, al asignar, pide recargar con el aviso', async () => {
    montar(['plat.persona.rol']);
    dobles.panel.resultado = { tipo: 'recargar', aviso: 'Rol asignado' };
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-accion="asignar-rol"]')?.click();
    await estable(fixture);

    expect(dobles.panel.abrir).toHaveBeenCalledWith(PanelRolComponent, { datos: { persona: FICHA_DE_PRUEBA } });
    expect(cambios).toEqual([{ tipo: 'recargar', aviso: 'Rol asignado' }]);
  });
});
