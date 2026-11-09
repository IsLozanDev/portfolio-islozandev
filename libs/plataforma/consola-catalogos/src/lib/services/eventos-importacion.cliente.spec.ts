import { TestBed } from '@angular/core/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { firstValueFrom, toArray } from 'rxjs';
import { API_URL } from '../../testing/http-de-prueba';
import { CorteDeStream, EventosImportacionCliente, StreamRechazado } from './eventos-importacion.cliente';

const ID = 'imp-1';
const TOKEN = 'token-secreto';
const codificar = (texto: string) => new TextEncoder().encode(texto);

/** Un cuerpo que entrega los fragmentos dados y luego termina, como un `ReadableStream`. */
function cuerpoCon(fragmentos: string[]) {
  const cola = [...fragmentos];
  const cancelar = vi.fn(async () => undefined);
  return {
    cancelar,
    body: {
      getReader: () => ({
        read: async () => {
          const siguiente = cola.shift();
          return siguiente === undefined ? { done: true, value: undefined } : { done: false, value: codificar(siguiente) };
        },
        cancel: cancelar,
      }),
    },
  };
}

describe('EventosImportacionCliente', () => {
  let cliente: EventosImportacionCliente;
  let pedir: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
        { provide: SesionService, useValue: { token: () => TOKEN, sucursalId: () => 'suc-1' } },
      ],
    });
    cliente = TestBed.inject(EventosImportacionCliente);
    pedir = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => pedir.mockRestore());

  it('pide el stream con el Bearer en la cabecera y no en la URL; emite los avisos y completa en el fin', async () => {
    const { body, cancelar } = cuerpoCon([
      'event: avance\ndata: {"tipo":"avance","estado":"EN_PROCESO","avance":42}\n\n: ping\n\n',
      'event: fin\ndata: {"tipo":"fin","estado":"APLICADA","resumen":{"altas":18,"cambios":0,"bajas":0,"sin_cambios":1},"motivo":null}\n\n',
    ]);
    pedir.mockResolvedValue({ ok: true, status: 200, body } as unknown as Response);

    const avisos = await firstValueFrom(cliente.abrir(ID).pipe(toArray()));

    const [url, opciones] = pedir.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/catalogos/importaciones/${ID}/eventos`);
    expect(url).not.toContain(TOKEN);
    expect(opciones.headers).toEqual({ Accept: 'text/event-stream', Authorization: `Bearer ${TOKEN}`, 'X-Sucursal-Id': 'suc-1' });
    expect(avisos).toEqual([
      { tipo: 'avance', estado: 'EN_PROCESO', avance: 42 },
      { tipo: 'fin', estado: 'APLICADA', resumen: { altas: 18, cambios: 0, bajas: 0, sinCambios: 1 }, motivo: null },
    ]);
    expect(cancelar).toHaveBeenCalled();
  });

  it('el cuerpo cerrado sin fin falla con CorteDeStream', async () => {
    pedir.mockResolvedValue({ ok: true, status: 200, body: cuerpoCon([': ping\n\n']).body } as unknown as Response);
    await expect(firstValueFrom(cliente.abrir(ID))).rejects.toBeInstanceOf(CorteDeStream);
  });

  it('un error de red falla con CorteDeStream', async () => {
    pedir.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(firstValueFrom(cliente.abrir(ID))).rejects.toBeInstanceOf(CorteDeStream);
  });

  it('un 404 falla con StreamRechazado(404)', async () => {
    pedir.mockResolvedValue({ ok: false, status: 404, body: null } as unknown as Response);
    await expect(firstValueFrom(cliente.abrir(ID))).rejects.toMatchObject({ estado: 404, name: 'StreamRechazado' });
    expect(new StreamRechazado(404)).toBeInstanceOf(Error);
  });

  it('desuscribirse aborta la petición', () => {
    pedir.mockReturnValue(new Promise(() => undefined));
    const suscripcion = cliente.abrir(ID).subscribe();
    const senal = (pedir.mock.calls[0] as [string, RequestInit])[1].signal as AbortSignal;

    suscripcion.unsubscribe();
    expect(senal.aborted).toBe(true);
  });
});
