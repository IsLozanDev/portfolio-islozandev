import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { cambiosDe, dependenciasDeFicha, estable } from '../../../testing/ficha-de-prueba';
import { FICHA_DE_PRUEBA } from '../../../testing/persona-de-prueba';
import { ErrorPersonas } from '../../models/error-personas';
import type { CambioFicha } from '../../models/ficha';
import { ContactosCliente } from '../../services/contactos.cliente';
import { PanelContactoComponent } from '../panel-contacto/panel-contacto.component';
import { PersonaContactosComponent } from './persona-contactos.component';

const EDITAR = 'plat.persona.editar';

describe('PersonaContactosComponent', () => {
  let fixture: ComponentFixture<PersonaContactosComponent>;
  let dobles: ReturnType<typeof dependenciasDeFicha>;
  let contactos: { editar: ReturnType<typeof vi.fn>; eliminar: ReturnType<typeof vi.fn> };
  let cambios: CambioFicha[];

  function montar(permisos: string[] = [EDITAR]): void {
    dobles = dependenciasDeFicha(new Set(permisos));
    contactos = { editar: vi.fn(async () => ({ ...FICHA_DE_PRUEBA, version: 6 })), eliminar: vi.fn(async () => undefined) };
    TestBed.configureTestingModule({ providers: [...dobles.proveedores, { provide: ContactosCliente, useValue: contactos }] });
    fixture = TestBed.createComponent(PersonaContactosComponent);
    fixture.componentRef.setInput('persona', FICHA_DE_PRUEBA);
    cambios = cambiosDe(fixture);
    fixture.detectChanges();
  }

  const elemento = () => fixture.nativeElement as HTMLElement;
  const botones = (accion: string) => elemento().querySelectorAll<HTMLButtonElement>(`[data-accion="${accion}"]`);

  it('lista los contactos con el celular en grupos y la estrella del principal', () => {
    montar();
    const texto = elemento().textContent ?? '';
    expect(texto).toContain('987 654 321');
    expect(texto).toContain('juana.quispe@correo.pe');
    expect(texto).toContain('WhatsApp');
    expect(elemento().querySelectorAll('mat-icon')).not.toHaveLength(0);
  });

  it('el celular principal no se puede borrar; los demás sí', () => {
    montar();
    expect(botones('eliminar-contacto')).toHaveLength(3);
    expect(botones('marcar-principal')).toHaveLength(2);
  });

  it('marcar principal envía la versión y emite la persona actualizada', async () => {
    montar();
    botones('marcar-principal')[0]?.click();
    await estable(fixture);

    expect(contactos.editar).toHaveBeenCalledWith('per-1', 'c2', { version: 5, principal: true });
    expect(cambios).toEqual([{ tipo: 'actualizada', persona: { ...FICHA_DE_PRUEBA, version: 6 } }]);
  });

  it('borrar pide confirmación y pide recargar; sin confirmar no borra', async () => {
    montar();
    dobles.avisos.confirmarDestructiva.mockResolvedValueOnce({ confirmado: false });
    botones('eliminar-contacto')[0]?.click();
    await estable(fixture);
    expect(contactos.eliminar).not.toHaveBeenCalled();

    botones('eliminar-contacto')[0]?.click();
    await estable(fixture);
    expect(dobles.avisos.confirmarDestructiva).toHaveBeenLastCalledWith({
      titulo: '¿Eliminar este contacto?',
      texto: 'Se borrará el celular 956 778 120 de la ficha. El cambio queda en la auditoría.',
    });
    expect(contactos.eliminar).toHaveBeenCalledWith('per-1', 'c2', 5);
    expect(cambios).toEqual([{ tipo: 'recargar', aviso: null }]);
  });

  it('VERSION_OBSOLETA pide recargar con aviso; otro error se muestra', async () => {
    montar();
    contactos.editar.mockRejectedValueOnce(new ErrorPersonas('VERSION_OBSOLETA', 'cambió', 409));
    botones('marcar-principal')[0]?.click();
    await estable(fixture);
    expect(cambios).toEqual([{ tipo: 'recargar', aviso: 'La persona cambió; se recargaron sus datos' }]);

    contactos.editar.mockRejectedValueOnce(new ErrorPersonas('CELULAR_PRINCIPAL_OBLIGATORIO', 'x', 422));
    botones('marcar-principal')[0]?.click();
    await estable(fixture);
    expect(elemento().querySelector('[data-prueba="error"]')?.textContent?.trim()).toBe('La persona debe conservar un celular principal.');
  });

  it('agregar abre el panel y emite lo que devuelve', async () => {
    montar();
    dobles.panel.resultado = { tipo: 'guardada', persona: { ...FICHA_DE_PRUEBA, version: 7 } };
    botones('agregar-contacto')[0]?.click();
    await estable(fixture);

    expect(dobles.panel.abrir).toHaveBeenCalledWith(PanelContactoComponent, { datos: { persona: FICHA_DE_PRUEBA } });
    expect(cambios).toEqual([{ tipo: 'actualizada', persona: { ...FICHA_DE_PRUEBA, version: 7 } }]);
  });

  it('sin plat.persona.editar no hay acciones', () => {
    montar([]);
    expect(botones('agregar-contacto')).toHaveLength(0);
    expect(botones('editar-contacto')).toHaveLength(0);
    expect(botones('eliminar-contacto')).toHaveLength(0);
  });
});
