import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { referenciaDialogoDePrueba } from '../../../testing/dialogo-de-prueba';
import { estable } from '../../../testing/ficha-de-prueba';
import { FICHA_DE_PRUEBA } from '../../../testing/persona-de-prueba';
import { ErrorPersonas } from '../../models/error-personas';
import { ContactosCliente } from '../../services/contactos.cliente';
import { PanelContactoComponent, type DatosPanelContacto } from './panel-contacto.component';

describe('PanelContactoComponent', () => {
  let fixture: ComponentFixture<PanelContactoComponent>;
  let cerrar: ReturnType<typeof vi.fn>;
  let contactos: { agregar: ReturnType<typeof vi.fn>; editar: ReturnType<typeof vi.fn> };

  function montar(datos: DatosPanelContacto): void {
    const dialogo = referenciaDialogoDePrueba();
    cerrar = dialogo.referencia.close;
    contactos = { agregar: vi.fn(async () => FICHA_DE_PRUEBA), editar: vi.fn(async () => FICHA_DE_PRUEBA) };
    TestBed.configureTestingModule({
      providers: [dialogo.proveedor, { provide: MAT_DIALOG_DATA, useValue: datos }, { provide: ContactosCliente, useValue: contactos }],
    });
    fixture = TestBed.createComponent(PanelContactoComponent);
    fixture.detectChanges();
  }

  const elemento = () => fixture.nativeElement as HTMLElement;

  function escribirValor(valor: string): void {
    const campo = elemento().querySelector<HTMLInputElement>('[data-campo="valor"]') as HTMLInputElement;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    campo.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  async function enviar(): Promise<void> {
    elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
    await estable(fixture);
  }

  it('TR-CA-106: un celular 51987654 muestra el mensaje de la API y no se envía', async () => {
    montar({ persona: FICHA_DE_PRUEBA });
    escribirValor('51987654');
    await enviar();

    expect(elemento().querySelector('[data-prueba="error-valor"]')?.textContent?.trim()).toBe('El celular debe tener 9 dígitos e iniciar con 9');
    expect(contactos.agregar).not.toHaveBeenCalled();
  });

  it('agregar envía tipo, valor y principal, y cierra con la persona', async () => {
    montar({ persona: FICHA_DE_PRUEBA });
    escribirValor(' 956778120 ');
    await enviar();

    expect(contactos.agregar).toHaveBeenCalledWith('per-1', { tipo: 'CELULAR', valor: '956778120', principal: false });
    expect(cerrar).toHaveBeenCalledWith({ tipo: 'guardada', persona: FICHA_DE_PRUEBA });
  });

  it('editar no deja cambiar el tipo, valida con su formato y manda la versión', async () => {
    const whatsapp = FICHA_DE_PRUEBA.contactos[3];
    montar({ persona: FICHA_DE_PRUEBA, contacto: whatsapp });
    expect(fixture.componentInstance['formulario'].controls.tipo.disabled).toBe(true);

    escribirValor('987654321');
    await enviar();
    expect(elemento().querySelector('[data-prueba="error-valor"]')?.textContent?.trim()).toBe(
      'El WhatsApp debe ir en formato internacional: + y de 8 a 15 dígitos',
    );

    escribirValor('+14155552671');
    await enviar();
    expect(contactos.editar).toHaveBeenCalledWith('per-1', 'c4', { version: 5, valor: '+14155552671', principal: false });
  });

  it('VERSION_OBSOLETA cierra pidiendo recargar; CONTACTO_DUPLICADO se muestra en el panel', async () => {
    montar({ persona: FICHA_DE_PRUEBA });
    contactos.agregar.mockRejectedValueOnce(new ErrorPersonas('CONTACTO_DUPLICADO', 'x', 409));
    escribirValor('956778120');
    await enviar();
    expect(elemento().querySelector('[data-prueba="error"]')?.textContent?.trim()).toBe('La persona ya tiene ese contacto.');

    contactos.agregar.mockRejectedValueOnce(new ErrorPersonas('VERSION_OBSOLETA', 'x', 409));
    await enviar();
    expect(cerrar).toHaveBeenCalledWith({ tipo: 'obsoleta' });
  });
});
