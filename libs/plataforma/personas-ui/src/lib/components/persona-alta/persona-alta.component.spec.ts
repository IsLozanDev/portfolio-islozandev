import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { referenciaDialogoDePrueba } from '../../../testing/dialogo-de-prueba';
import type { PedidoAlta } from '../../models/buscador';
import { ErrorPersonas } from '../../models/error-personas';
import type { PersonaDetalle } from '../../models/persona';
import type { RegistroPersona } from '../../models/solicitudes-persona';
import { PersonasCliente } from '../../services/personas.cliente';
import { PersonaAltaComponent } from './persona-alta.component';

const PRELLENADA: PedidoAlta = {
  tipoDocumento: 'DNI',
  numeroDocumento: '46027193',
  prellenado: { nombres: 'Teresa', apellidoPaterno: 'Condori', apellidoMaterno: 'Apaza', razonSocial: null },
  aviso: null,
};
const JURIDICA: PedidoAlta = {
  tipoDocumento: 'RUC',
  numeroDocumento: '20554433228',
  prellenado: { nombres: null, apellidoPaterno: null, apellidoMaterno: null, razonSocial: 'Inversiones Misti E.I.R.L.' },
  aviso: null,
};
const REGISTRADA = { id: 'per-nueva' } as PersonaDetalle;

describe('PersonaAltaComponent', () => {
  let fixture: ComponentFixture<PersonaAltaComponent>;
  let registrar: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registrar = vi.fn(async () => REGISTRADA);
    TestBed.configureTestingModule({
      providers: [referenciaDialogoDePrueba().proveedor, { provide: PersonasCliente, useValue: { registrar } }],
    });
  });

  async function montar(pedido: PedidoAlta): Promise<void> {
    fixture = TestBed.createComponent(PersonaAltaComponent);
    fixture.componentRef.setInput('pedido', pedido);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const elemento = () => fixture.nativeElement as HTMLElement;
  const campo = (nombre: string) => elemento().querySelector<HTMLInputElement>(`[data-campo="${nombre}"]`);
  const texto = (selector: string) => elemento().querySelector(selector)?.textContent?.trim() ?? '';

  function escribir(nombre: string, valor: string): void {
    const input = campo(nombre) as HTMLInputElement;
    input.value = valor;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  async function enviar(): Promise<void> {
    elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('TR-CA-100: llega prellenada desde RENIEC, natural, con el documento bloqueado', async () => {
    await montar(PRELLENADA);

    expect(texto('[data-prueba="documento"]')).toBe('DNI 46027193');
    expect(texto('[data-prueba="tipo-persona"]')).toBe('Persona natural');
    expect(texto('[data-prueba="fuente"]')).toBe('Datos de RENIEC');
    expect([campo('nombres')?.value, campo('apellido-paterno')?.value, campo('apellido-materno')?.value]).toEqual(['Teresa', 'Condori', 'Apaza']);
    expect(campo('razon-social')).toBeNull();
  });

  it('registra con el celular y emite la persona; correo y materno vacíos no viajan', async () => {
    await montar({ ...PRELLENADA, prellenado: { nombres: 'Teresa', apellidoPaterno: 'Condori', apellidoMaterno: null, razonSocial: null } });
    const registradas: PersonaDetalle[] = [];
    fixture.componentInstance.registrada.subscribe((persona) => registradas.push(persona));
    escribir('celular', '987654321');
    await enviar();

    const registro: RegistroPersona = {
      tipoPersona: 'NATURAL', tipoDocumento: 'DNI', numeroDocumento: '46027193', nombres: 'Teresa', apellidoPaterno: 'Condori',
      apellidoMaterno: undefined, celular: '987654321', correo: undefined,
    };
    expect(registrar).toHaveBeenCalledWith(registro);
    expect(registradas).toEqual([REGISTRADA]);
  });

  it('TR-CA-106: un celular 51987654 muestra el mensaje y no se envía', async () => {
    await montar(PRELLENADA);
    escribir('celular', '51987654');
    await enviar();

    expect(texto('[data-prueba="error-celular"]')).toBe('El celular debe tener 9 dígitos e iniciar con 9');
    expect(registrar).not.toHaveBeenCalled();
  });

  it('un RUC 20 es persona jurídica: solo razón social', async () => {
    await montar(JURIDICA);
    escribir('celular', '974003120');
    await enviar();

    expect(texto('[data-prueba="tipo-persona"]')).toBe('Persona jurídica');
    expect(campo('nombres')).toBeNull();
    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ tipoPersona: 'JURIDICA', tipoDocumento: 'RUC', numeroDocumento: '20554433228', razonSocial: 'Inversiones Misti E.I.R.L.' }),
    );
    expect(registrar.mock.calls[0]?.[0]).not.toHaveProperty('nombres');
  });

  it('TR-CA-102: un CE llega vacío, con el aviso de que no se consulta en línea, y exige nombres', async () => {
    await montar({ tipoDocumento: 'CE', numeroDocumento: '001234567', prellenado: null, aviso: null });
    escribir('celular', '965432187');
    await enviar();

    expect(texto('[data-prueba="aviso"]')).toContain('no se consultan en línea');
    expect(registrar).not.toHaveBeenCalled();

    escribir('nombres', 'Martha');
    escribir('apellido-paterno', 'Jiménez');
    await enviar();
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ tipoDocumento: 'CE', nombres: 'Martha', apellidoPaterno: 'Jiménez' }));
  });

  it('PERSONA_DUPLICADA: avisa y «Abrir su ficha» entrega la persona existente', async () => {
    registrar.mockRejectedValueOnce(new ErrorPersonas('PERSONA_DUPLICADA', 'Ya existe', 409, 'per-existente'));
    await montar(PRELLENADA);
    const existentes: string[] = [];
    fixture.componentInstance.existente.subscribe((id) => existentes.push(id));
    escribir('celular', '987111222');
    await enviar();

    expect(texto('[data-prueba="duplicada"]')).toContain('Ya existe una persona con ese documento en tu organización.');
    (elemento().querySelector('[data-accion="abrir-existente"]') as HTMLButtonElement).click();
    expect(existentes).toEqual(['per-existente']);
  });

  it('otro error de la API se muestra con su mensaje', async () => {
    registrar.mockRejectedValueOnce(new ErrorPersonas('CONTACTO_INVALIDO', 'El correo no tiene un formato válido', 422));
    await montar(PRELLENADA);
    escribir('celular', '987654321');
    await enviar();

    expect(texto('[data-prueba="error"]')).toBe('El correo no tiene un formato válido');
  });

  it('«Volver a la búsqueda» lo avisa', async () => {
    await montar(PRELLENADA);
    let volvio = false;
    fixture.componentInstance.volver.subscribe(() => (volvio = true));
    (elemento().querySelector('[data-accion="volver"]') as HTMLButtonElement).click();
    expect(volvio).toBe(true);
  });
});
