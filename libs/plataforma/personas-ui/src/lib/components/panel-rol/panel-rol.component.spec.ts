import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { referenciaDialogoDePrueba } from '../../../testing/dialogo-de-prueba';
import { estable } from '../../../testing/ficha-de-prueba';
import { FICHA_DE_PRUEBA } from '../../../testing/persona-de-prueba';
import { PersonasCliente } from '../../services/personas.cliente';
import { PanelRolComponent } from './panel-rol.component';

describe('PanelRolComponent', () => {
  let fixture: ComponentFixture<PanelRolComponent>;
  let cerrar: ReturnType<typeof vi.fn>;
  let personas: { productosSuscritos: ReturnType<typeof vi.fn>; asignarRol: ReturnType<typeof vi.fn> };

  async function montar(): Promise<void> {
    const dialogo = referenciaDialogoDePrueba();
    cerrar = dialogo.referencia.close;
    personas = { productosSuscritos: vi.fn(async () => ['CLI', 'GYM']), asignarRol: vi.fn(async () => ({ asignado: true })) };
    TestBed.configureTestingModule({
      providers: [dialogo.proveedor, { provide: MAT_DIALOG_DATA, useValue: { persona: FICHA_DE_PRUEBA } }, { provide: PersonasCliente, useValue: personas }],
    });
    fixture = TestBed.createComponent(PanelRolComponent);
    fixture.detectChanges();
    await estable(fixture);
  }

  const elemento = () => fixture.nativeElement as HTMLElement;

  async function elegir(campo: string, valor: string): Promise<void> {
    (elemento().querySelector(`[data-campo="${campo}"] .mat-mdc-select-trigger`) as HTMLElement).click();
    fixture.detectChanges();
    const opcion = Array.from(document.querySelectorAll<HTMLElement>('mat-option')).find((candidata) => candidata.textContent?.trim() === valor);
    opcion?.click();
    await estable(fixture);
  }

  async function enviar(): Promise<void> {
    elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
    await estable(fixture);
  }

  it('TR-CA-104: solo ofrece los productos con suscripción vigente; ECO no está', async () => {
    await montar();
    (elemento().querySelector('[data-campo="producto"] .mat-mdc-select-trigger') as HTMLElement).click();
    fixture.detectChanges();

    expect(Array.from(document.querySelectorAll('mat-option[data-producto]')).map((opcion) => opcion.getAttribute('data-producto'))).toEqual(['CLI', 'GYM']);
  });

  it('TR-CA-103: asignar SOCIO de GYM cierra pidiendo recargar con «Rol asignado»', async () => {
    await montar();
    await elegir('producto', 'GYM');
    await elegir('rol', 'Socio');
    await enviar();

    expect(personas.asignarRol).toHaveBeenCalledWith('per-1', { productoCodigo: 'GYM', rol: 'SOCIO' });
    expect(cerrar).toHaveBeenCalledWith({ tipo: 'recargar', aviso: 'Rol asignado' });
  });

  it('un rol ya vigente avisa que la persona ya lo tenía', async () => {
    await montar();
    personas.asignarRol.mockResolvedValueOnce({ asignado: false });
    await elegir('producto', 'CLI');
    await elegir('rol', 'Paciente');
    await enviar();

    expect(cerrar).toHaveBeenCalledWith({ tipo: 'recargar', aviso: 'La persona ya tenía ese rol' });
  });

  it('sin producto ni rol elegidos no se envía', async () => {
    await montar();
    await enviar();
    expect(personas.asignarRol).not.toHaveBeenCalled();
  });
});
