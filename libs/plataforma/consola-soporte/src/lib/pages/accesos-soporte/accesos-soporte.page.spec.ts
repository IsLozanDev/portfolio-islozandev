import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { DATO_URL_ADMINISTRACION } from '../../config/url-administracion';
import type { AccesoDelAgente } from '../../models/acceso-del-agente';
import { ErrorSoporte } from '../../models/error-soporte';
import { MENSAJES_SOPORTE } from '../../models/mensajes-soporte';
import { EntradaSoporteService } from '../../services/entrada-soporte.service';
import { SoporteAgenteCliente } from '../../services/soporte-agente.cliente';
import { AccesosSoportePage } from './accesos-soporte.page';

const URL_ADMINISTRACION = 'http://127.0.0.1:4200';
const UNA_HORA_MS = 3_600_000;

/** La primera prueba compila la tabla de Material; con la máquina ocupada pasa los 5 s. */
const ESPERA_PRIMERA_CARGA_MS = 30_000;

function acceso(cambios: Partial<AccesoDelAgente>): AccesoDelAgente {
  return {
    id: 'a-1',
    tenantId: 't-1',
    tenantNombre: 'Pollería Doña Rosa',
    ticket: 'SOP-000001',
    modo: 'LECTURA',
    estado: 'APROBADO',
    horasSolicitadas: 2,
    solicitadoEn: new Date(),
    hasta: new Date(Date.now() + UNA_HORA_MS),
    ...cambios,
  };
}

describe('AccesosSoportePage', { timeout: ESPERA_PRIMERA_CARGA_MS }, () => {
  let harness: RouterTestingHarness;
  let cliente: { misAccesos: ReturnType<typeof vi.fn> };
  let entrada: { entrar: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const botonesEntrar = () => elemento().querySelectorAll<HTMLButtonElement>('[data-accion=entrar]');

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(accesos: AccesoDelAgente[]): Promise<void> {
    cliente.misAccesos.mockResolvedValue(accesos);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'consola/soporte', component: AccesosSoportePage, data: { [DATO_URL_ADMINISTRACION]: URL_ADMINISTRACION } }]),
        { provide: SoporteAgenteCliente, useValue: cliente },
        { provide: EntradaSoporteService, useValue: entrada },
      ],
    });
    harness = await RouterTestingHarness.create('/consola/soporte');
    await estable();
  }

  beforeEach(() => {
    cliente = { misAccesos: vi.fn() };
    entrada = { entrar: vi.fn(async () => undefined) };
  });

  it('lista los accesos con su estado y solo deja entrar al vigente', async () => {
    await abrir([
      acceso({ id: 'a-1' }),
      acceso({ id: 'a-2', tenantNombre: 'Cevichería', estado: 'PENDIENTE', hasta: null }),
      acceso({ id: 'a-3', tenantNombre: 'Chifa', hasta: new Date(Date.now() - UNA_HORA_MS) }),
    ]);

    const texto = elemento().textContent ?? '';
    expect(texto).toContain('Pollería Doña Rosa');
    expect(texto).toContain('Pendiente');
    expect(texto).toContain('Chifa');
    expect(botonesEntrar()).toHaveLength(1);
    expect(botonesEntrar()[0].getAttribute('aria-label')).toBe(`${MENSAJES_SOPORTE.entrar}: Pollería Doña Rosa`);
  });

  it('sin accesos muestra el vacío', async () => {
    await abrir([]);

    expect(elemento().textContent).toContain(MENSAJES_SOPORTE.sinAccesos);
  });

  it('«Entrar» abre administración con la URL de la ruta', async () => {
    await abrir([acceso({ id: 'a-1' })]);

    botonesEntrar()[0].click();
    await estable();

    expect(entrada.entrar).toHaveBeenCalledWith('a-1', URL_ADMINISTRACION);
  });

  it('si la entrada falla muestra el mensaje de la API y vuelve a habilitar el botón', async () => {
    entrada.entrar.mockRejectedValueOnce(new ErrorSoporte('SOPORTE_NO_VIGENTE', 'El acceso ya no está vigente', 409));
    await abrir([acceso({ id: 'a-1' })]);

    botonesEntrar()[0].click();
    await estable();

    expect(elemento().querySelector('[role=alert]')?.textContent).toContain('El acceso ya no está vigente');
    expect(botonesEntrar()[0].disabled).toBe(false);
  });

  it('si la carga falla muestra el error', async () => {
    cliente.misAccesos.mockRejectedValueOnce(new ErrorSoporte('DESCONOCIDO', 'No se pudo completar la acción. Inténtelo de nuevo.', 500));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'consola/soporte', component: AccesosSoportePage }]),
        { provide: SoporteAgenteCliente, useValue: cliente },
        { provide: EntradaSoporteService, useValue: entrada },
      ],
    });
    harness = await RouterTestingHarness.create('/consola/soporte');
    await estable();

    expect(elemento().querySelector('[role=alert]')?.textContent).toContain('No se pudo completar');
  });
});
