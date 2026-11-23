import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SesionService } from '@vitrina/shared/auth';
import { Observable, of, throwError } from 'rxjs';
import type { PedidoAlta, PersonaElegida } from '../../models/buscador';
import type { ListadoPersonas, PersonaListada, ResultadoBusquedaDocumento } from '../../models/busqueda';
import { ErrorPersonas } from '../../models/error-personas';
import { PersonasCliente } from '../../services/personas.cliente';
import { ESPERA_BUSQUEDA_MS, PersonaBuscadorComponent } from './persona-buscador.component';

const JUANA: PersonaListada = {
  id: 'per-juana',
  tipoPersona: 'NATURAL',
  tipoDocumento: 'DNI',
  numeroDocumento: '45781236',
  denominacion: 'Quispe Mamani, Juana',
  celularPrincipal: '987654321',
  correoPrincipal: null,
  roles: [{ productoCodigo: 'CLI', rol: 'PACIENTE' }],
  coincidencia: 'NOMBRE',
};
const ROSA: PersonaListada = { ...JUANA, id: 'per-rosa', numeroDocumento: '40236718', denominacion: 'Valdivieso Chávez, Rosa', roles: [] };
const JUANA_RESUMEN = {
  id: 'per-juana', tipoPersona: 'NATURAL', tipoDocumento: 'DNI', numeroDocumento: '45781236', nombres: 'Juana',
  apellidoPaterno: 'Quispe', apellidoMaterno: 'Mamani', razonSocial: null, activo: true,
} as const;
const TERESA = { nombres: 'Teresa', apellidoPaterno: 'Condori', apellidoMaterno: 'Apaza', razonSocial: null };

describe('PersonaBuscadorComponent', () => {
  let fixture: ComponentFixture<PersonaBuscadorComponent>;
  let listados: { q?: string; tamano?: number }[];
  let documentos: [string, string][];
  let cancelaciones: number;
  let respuestaListado: () => Observable<ListadoPersonas>;
  let respuestaDocumento: () => Observable<ResultadoBusquedaDocumento>;
  let permisos: Set<string>;

  /** Una petición que cuenta si alguien la abortó. */
  function peticionLenta<T>(valor: T): Observable<T> {
    return new Observable<T>((suscriptor) => {
      let respondida = false;
      const espera = setTimeout(() => {
        respondida = true;
        suscriptor.next(valor);
        suscriptor.complete();
      }, 1000);
      return () => {
        if (!respondida) cancelaciones++;
        clearTimeout(espera);
      };
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    listados = [];
    documentos = [];
    cancelaciones = 0;
    permisos = new Set(['plat.persona.leer', 'plat.persona.registrar']);
    respuestaListado = () => of({ items: [JUANA, ROSA], total: 2, pagina: 1, tamano: 8 });
    respuestaDocumento = () => of({ encontrada: true, persona: JUANA_RESUMEN });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PersonasCliente,
          useValue: {
            observarListado: (criterios: { q?: string; tamano?: number }) => {
              listados.push(criterios);
              return respuestaListado();
            },
            observarBusquedaDocumento: (tipo: string, numero: string) => {
              documentos.push([tipo, numero]);
              return respuestaDocumento();
            },
          },
        },
        { provide: SesionService, useValue: { tiene: (permiso: string) => permisos.has(permiso) } },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  function montar(entradas: Record<string, unknown> = {}): void {
    fixture = TestBed.createComponent(PersonaBuscadorComponent);
    for (const [nombre, valor] of Object.entries(entradas)) fixture.componentRef.setInput(nombre, valor);
    fixture.detectChanges();
  }

  const elemento = () => fixture.nativeElement as HTMLElement;
  const campo = () => elemento().querySelector<HTMLInputElement>('[data-campo="buscador"]') as HTMLInputElement;
  const texto = (selector: string) => elemento().querySelector(selector)?.textContent?.trim() ?? '';

  function escribir(valor: string): void {
    campo().value = valor;
    campo().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function esperar(milisegundos = ESPERA_BUSQUEDA_MS): Promise<void> {
    await vi.advanceTimersByTimeAsync(milisegundos);
    fixture.detectChanges();
  }

  function pulsar(tecla: string): void {
    campo().dispatchEvent(new KeyboardEvent('keydown', { key: tecla, bubbles: true }));
    fixture.detectChanges();
  }

  function clic(selector: string): void {
    elemento().querySelector<HTMLButtonElement>(selector)?.click();
    fixture.detectChanges();
  }

  it('teclear rápido hace una sola petición, 300 ms después de la última tecla', async () => {
    montar();
    escribir('qui');
    await esperar(100);
    escribir('quis');
    await esperar(100);
    escribir('quispe');
    await esperar(ESPERA_BUSQUEDA_MS - 1);
    expect(listados).toEqual([]);

    await esperar(1);
    expect(listados).toEqual([{ q: 'quispe', tamano: 8 }]);
  });

  it('una búsqueda nueva aborta la anterior', async () => {
    respuestaListado = () => peticionLenta({ items: [JUANA], total: 1, pagina: 1, tamano: 8 });
    montar();
    escribir('quispe');
    await esperar();
    escribir('quispe ju');
    await esperar();

    expect(listados).toHaveLength(2);
    expect(cancelaciones).toBe(1);
  });

  it('muestra las sugerencias con documento, celular y roles; Enter elige la activa', async () => {
    montar();
    const elegidas: PersonaElegida[] = [];
    fixture.componentInstance.seleccionada.subscribe((persona) => elegidas.push(persona));
    escribir('quispe');
    await esperar();

    const sugerencias = elemento().querySelectorAll('[data-prueba="sugerencia"]');
    expect(sugerencias).toHaveLength(2);
    expect(sugerencias[0]?.textContent).toContain('Quispe Mamani, Juana');
    expect(sugerencias[0]?.textContent).toContain('DNI 45781236');
    expect(sugerencias[0]?.textContent).toContain('987 654 321');
    expect(sugerencias[0]?.textContent).toContain('CLI · Paciente');
    expect(texto('[data-prueba="cantidad"]')).toBe('2 personas');
    expect(campo().getAttribute('aria-expanded')).toBe('true');

    pulsar('ArrowDown');
    expect(elemento().querySelectorAll('[data-prueba="sugerencia"]')[1]?.getAttribute('aria-selected')).toBe('true');
    pulsar('Enter');
    expect(elegidas).toEqual([{ id: 'per-rosa', denominacion: 'Valdivieso Chávez, Rosa', tipoDocumento: 'DNI', numeroDocumento: '40236718' }]);
  });

  it('TR-CA-101: un DNI registrado muestra la persona y «Usar» la entrega, sin ofrecer registrar', async () => {
    montar({ etiquetaUsar: 'Abrir ficha' });
    const elegidas: PersonaElegida[] = [];
    fixture.componentInstance.seleccionada.subscribe((persona) => elegidas.push(persona));
    escribir('45781236');
    await esperar();

    expect(documentos).toEqual([['DNI', '45781236']]);
    expect(listados).toEqual([]);
    expect(texto('[data-prueba="encontrada"]')).toContain('Quispe Mamani, Juana');
    expect(elemento().querySelector('[data-accion="registrar"]')).toBeNull();
    expect(texto('[data-accion="usar"]')).toContain('Abrir ficha');

    clic('[data-accion="usar"]');
    expect(elegidas).toEqual([{ id: 'per-juana', denominacion: 'Quispe Mamani, Juana', tipoDocumento: 'DNI', numeroDocumento: '45781236' }]);
  });

  it('TR-CA-100: un DNI nuevo con datos de RENIEC ofrece «Registrar a Teresa Condori Apaza» y pide el alta prellenada', async () => {
    respuestaDocumento = () => of({ encontrada: false, prellenado: TERESA, aviso: null });
    montar();
    const pedidos: PedidoAlta[] = [];
    fixture.componentInstance.registrar.subscribe((pedido) => pedidos.push(pedido));
    escribir('46027193');
    await esperar();

    expect(texto('[data-prueba="nueva"]')).toContain('Datos de RENIEC');
    expect(texto('[data-accion="registrar"]')).toContain('Registrar a Teresa Condori Apaza');
    clic('[data-accion="registrar"]');
    expect(pedidos).toEqual([{ tipoDocumento: 'DNI', numeroDocumento: '46027193', prellenado: TERESA, aviso: null }]);
  });

  it('TR-CA-102: con CE elegido espera Enter, no consulta en línea y ofrece registrar a mano', async () => {
    respuestaDocumento = () => of({ encontrada: false, prellenado: null, aviso: null });
    montar();
    clic('[data-accion="tipo"]');
    (document.querySelector('[data-tipo="CE"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    escribir('001234567');
    await esperar();
    expect(documentos).toEqual([]);
    expect(texto('[data-prueba="ayuda"]')).toBe('Pulsa Enter para buscar el documento');

    pulsar('Enter');
    await esperar();
    expect(documentos).toEqual([['CE', '001234567']]);
    expect(texto('[data-prueba="aviso"]')).toContain('no se consultan en línea');
    expect(texto('[data-accion="registrar"]')).toContain('Registrar a mano');
  });

  it('TR-CA-121: si RENIEC no responde, avisa y deja registrar a mano', async () => {
    respuestaDocumento = () => of({ encontrada: false, prellenado: null, aviso: 'IDENTIDAD_NO_DISPONIBLE' });
    montar();
    const pedidos: PedidoAlta[] = [];
    fixture.componentInstance.registrar.subscribe((pedido) => pedidos.push(pedido));
    escribir('47120983');
    await esperar();

    expect(texto('[data-prueba="aviso"]')).toContain('No se pudo consultar RENIEC en este momento. Completa los datos a mano.');
    clic('[data-accion="registrar"]');
    expect(pedidos).toEqual([{ tipoDocumento: 'DNI', numeroDocumento: '47120983', prellenado: null, aviso: 'IDENTIDAD_NO_DISPONIBLE' }]);
  });

  it('un RUC inválido muestra el motivo al escribir y no llama a la API', async () => {
    montar();
    escribir('20100070971');
    await esperar();

    expect(texto('[data-prueba="invalido"]')).toBe('El RUC no es válido: revisa el dígito verificador');
    expect(documentos).toEqual([]);
    expect(listados).toEqual([]);
  });

  it('sin plat.persona.registrar se ve el resultado pero no «Registrar»', async () => {
    permisos.delete('plat.persona.registrar');
    respuestaDocumento = () => of({ encontrada: false, prellenado: null, aviso: null });
    montar();
    escribir('47120983');
    await esperar();

    expect(elemento().querySelector('[data-prueba="nueva"]')).not.toBeNull();
    expect(elemento().querySelector('[data-accion="registrar"]')).toBeNull();
  });

  it('sin coincidencias lo dice, y un error de la API se muestra sin romper el campo', async () => {
    respuestaListado = () => of({ items: [], total: 0, pagina: 1, tamano: 8 });
    montar();
    escribir('zevallos');
    await esperar();
    expect(texto('[data-prueba="sin-resultados"]')).toContain('No hay personas que coincidan con «zevallos».');

    respuestaListado = () => throwError(() => new ErrorPersonas('DESCONOCIDO', 'Falló', 500));
    escribir('zevallo');
    await esperar();
    expect(texto('[data-prueba="error"]')).toBe('Falló');
  });

  it('en modo lista no llama a la API: emite el texto tras la espera y vacío al limpiar', async () => {
    montar({ modo: 'lista' });
    const consultas: string[] = [];
    fixture.componentInstance.consulta.subscribe((consulta) => consultas.push(consulta));
    expect(elemento().querySelector('[data-accion="tipo"]')).toBeNull();

    escribir('baldiviezo');
    await esperar();
    clic('[data-accion="limpiar"]');
    await esperar();

    expect(consultas).toEqual(['baldiviezo', '']);
    expect(listados).toEqual([]);
    expect(documentos).toEqual([]);
  });
});
