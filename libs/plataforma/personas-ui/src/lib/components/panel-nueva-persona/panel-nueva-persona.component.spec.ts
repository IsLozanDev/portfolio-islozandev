import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { SesionService } from '@vitrina/shared/auth';
import { referenciaDialogoDePrueba } from '../../../testing/dialogo-de-prueba';
import type { PedidoAlta } from '../../models/buscador';
import type { PersonaDetalle } from '../../models/persona';
import { PersonasCliente } from '../../services/personas.cliente';
import { PersonaAltaComponent } from '../persona-alta/persona-alta.component';
import { PersonaBuscadorComponent } from '../persona-buscador/persona-buscador.component';
import { PanelNuevaPersonaComponent } from './panel-nueva-persona.component';

const PEDIDO: PedidoAlta = { tipoDocumento: 'CE', numeroDocumento: '001234567', prellenado: null, aviso: null };

describe('PanelNuevaPersonaComponent', () => {
  let fixture: ComponentFixture<PanelNuevaPersonaComponent>;
  let cerrar: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const dialogo = referenciaDialogoDePrueba();
    cerrar = dialogo.referencia.close;
    TestBed.configureTestingModule({
      providers: [
        dialogo.proveedor,
        { provide: MAT_DIALOG_DATA, useValue: { etiquetaUsar: 'Abrir ficha' } },
        { provide: PersonasCliente, useValue: {} },
        { provide: SesionService, useValue: { tiene: () => true } },
      ],
    });
    fixture = TestBed.createComponent(PanelNuevaPersonaComponent);
    fixture.detectChanges();
  });

  const buscador = () => fixture.debugElement.query(By.directive(PersonaBuscadorComponent))?.componentInstance as PersonaBuscadorComponent | undefined;
  const alta = () => fixture.debugElement.query(By.directive(PersonaAltaComponent))?.componentInstance as PersonaAltaComponent | undefined;
  const titulo = () => (fixture.nativeElement as HTMLElement).querySelector('h2')?.textContent?.trim();

  it('arranca buscando, con «Abrir ficha» para las personas que ya existen', () => {
    expect(titulo()).toBe('Nueva persona');
    expect(buscador()?.etiquetaUsar()).toBe('Abrir ficha');
    expect(alta()).toBeUndefined();
  });

  it('elegir una persona cierra con ella, sin registrar', () => {
    buscador()?.seleccionada.emit({ id: 'per-juana', denominacion: 'Quispe Mamani, Juana', tipoDocumento: 'DNI', numeroDocumento: '45781236' });
    expect(cerrar).toHaveBeenCalledWith({ personaId: 'per-juana', registrada: false });
  });

  it('pedir el alta pasa al paso «Registrar persona» en el mismo panel; volver regresa a la búsqueda', () => {
    buscador()?.registrar.emit(PEDIDO);
    fixture.detectChanges();
    expect(titulo()).toBe('Registrar persona');
    expect(alta()?.pedido()).toEqual(PEDIDO);

    alta()?.volver.emit();
    fixture.detectChanges();
    expect(titulo()).toBe('Nueva persona');
  });

  it('registrar cierra con la persona nueva; una duplicada, con la existente; cancelar, sin resultado', () => {
    buscador()?.registrar.emit(PEDIDO);
    fixture.detectChanges();

    alta()?.registrada.emit({ id: 'per-nueva' } as PersonaDetalle);
    expect(cerrar).toHaveBeenLastCalledWith({ personaId: 'per-nueva', registrada: true });

    alta()?.existente.emit('per-existente');
    expect(cerrar).toHaveBeenLastCalledWith({ personaId: 'per-existente', registrada: false });

    alta()?.cancelar.emit();
    expect(cerrar).toHaveBeenLastCalledWith();
  });
});
