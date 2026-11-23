import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { referenciaDialogoDePrueba } from '../../../testing/dialogo-de-prueba';
import { estable } from '../../../testing/ficha-de-prueba';
import { FICHA_DE_PRUEBA } from '../../../testing/persona-de-prueba';
import type { PersonaDetalle } from '../../models/persona';
import { PersonasCliente } from '../../services/personas.cliente';
import { PanelDatosBasicosComponent } from './panel-datos-basicos.component';

const MISTI: PersonaDetalle = {
  ...FICHA_DE_PRUEBA,
  id: 'per-misti',
  tipoPersona: 'JURIDICA',
  tipoDocumento: 'RUC',
  numeroDocumento: '20554433228',
  nombres: null,
  apellidoPaterno: null,
  apellidoMaterno: null,
  razonSocial: 'Inversiones Misti E.I.R.L.',
};

describe('PanelDatosBasicosComponent', () => {
  let fixture: ComponentFixture<PanelDatosBasicosComponent>;
  let actualizar: ReturnType<typeof vi.fn>;

  function montar(persona: PersonaDetalle): void {
    actualizar = vi.fn(async () => persona);
    TestBed.configureTestingModule({
      providers: [
        referenciaDialogoDePrueba().proveedor,
        { provide: MAT_DIALOG_DATA, useValue: { persona } },
        { provide: PersonasCliente, useValue: { actualizarDatosBasicos: actualizar } },
      ],
    });
    fixture = TestBed.createComponent(PanelDatosBasicosComponent);
    fixture.detectChanges();
  }

  const elemento = () => fixture.nativeElement as HTMLElement;

  function escribir(nombre: string, valor: string): void {
    const campo = elemento().querySelector<HTMLInputElement>(`[data-campo="${nombre}"]`) as HTMLInputElement;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function enviar(): Promise<void> {
    elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
    await estable(fixture);
  }

  it('una natural manda nombres y apellidos con la versión; el materno vacío viaja como null', async () => {
    montar(FICHA_DE_PRUEBA);
    escribir('nombres', ' Juana María ');
    escribir('apellido-materno', '');
    await enviar();

    expect(actualizar).toHaveBeenCalledWith('per-1', { version: 5, nombres: 'Juana María', apellidoPaterno: 'Quispe', apellidoMaterno: null });
  });

  it('una jurídica solo edita la razón social', async () => {
    montar(MISTI);
    expect(elemento().querySelector('[data-campo="nombres"]')).toBeNull();
    escribir('razon-social', 'Inversiones Misti S.A.C.');
    await enviar();

    expect(actualizar).toHaveBeenCalledWith('per-misti', { version: 5, razonSocial: 'Inversiones Misti S.A.C.' });
  });

  it('nombres vacíos no se envían', async () => {
    montar(FICHA_DE_PRUEBA);
    escribir('nombres', '');
    await enviar();
    expect(actualizar).not.toHaveBeenCalled();
  });
});
