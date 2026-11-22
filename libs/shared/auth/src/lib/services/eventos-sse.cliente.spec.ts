import { TestBed } from '@angular/core/testing';
import { firstValueFrom, toArray } from 'rxjs';
import { CONFIG_AUTH } from '../config/config';
import { CorteDeStream, StreamRechazado } from '../models/errores-sse';
import type { EventoSse } from '../utils/lector-eventos-sse';
import { EventosSseCliente } from './eventos-sse.cliente';
import { SesionService } from './sesion.service';

const API_URL = 'http://api.prueba/v1';
const RUTA = '/archivos/arc-1/eventos';
const TOKEN = 'token-secreto';
const codificar = (texto: string) => new TextEncoder().encode(texto);
const esFin = (evento: EventoSse) => evento.evento === 'fin';

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

describe('EventosSseCliente', () => {
  let cliente: EventosSseCliente;
  let pedir: ReturnType<typeof vi.spyOn>;
  let sucursalId: string | null;

  beforeEach(() => {
    sucursalId = 'suc-1';
    TestBed.configureTestingModule({
      providers: [
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
        { provide: SesionService, useValue: { token: () => TOKEN, sucursalId: () => sucursalId } },
      ],
    });
    cliente = TestBed.inject(EventosSseCliente);
    pedir = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => pedir.mockRestore());

  it('pide la ruta de la API con el Bearer en la cabecera y no en la URL; emite los eventos y completa en el fin', async () => {
    const { body, cancelar } = cuerpoCon(['event: estado\ndata: {"a":1}\n\n: ping\n\n', 'event: fin\ndata: {"b":2}\n\nevent: otro\ndata: 3\n\n']);
    pedir.mockResolvedValue({ ok: true, status: 200, body } as unknown as Response);

    const eventos = await firstValueFrom(cliente.abrir(RUTA, esFin).pipe(toArray()));

    const [url, opciones] = pedir.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}${RUTA}`);
    expect(url).not.toContain(TOKEN);
    expect(opciones.headers).toEqual({ Accept: 'text/event-stream', Authorization: `Bearer ${TOKEN}`, 'X-Sucursal-Id': 'suc-1' });
    expect(eventos).toEqual([
      { evento: 'estado', datos: '{"a":1}' },
      { evento: 'fin', datos: '{"b":2}' },
    ]);
    expect(cancelar).toHaveBeenCalled();
  });

  it('sin sucursal no manda X-Sucursal-Id', async () => {
    sucursalId = null;
    pedir.mockResolvedValue({ ok: true, status: 200, body: cuerpoCon(['event: fin\ndata: 1\n\n']).body } as unknown as Response);

    await firstValueFrom(cliente.abrir(RUTA, esFin));

    expect((pedir.mock.calls[0] as [string, RequestInit])[1].headers).toEqual({ Accept: 'text/event-stream', Authorization: `Bearer ${TOKEN}` });
  });

  it('el cuerpo cerrado sin fin falla con CorteDeStream', async () => {
    pedir.mockResolvedValue({ ok: true, status: 200, body: cuerpoCon([': ping\n\n']).body } as unknown as Response);
    await expect(firstValueFrom(cliente.abrir(RUTA, esFin))).rejects.toBeInstanceOf(CorteDeStream);
  });

  it('un error de red falla con CorteDeStream con la causa', async () => {
    const red = new TypeError('Failed to fetch');
    pedir.mockRejectedValue(red);
    await expect(firstValueFrom(cliente.abrir(RUTA, esFin))).rejects.toMatchObject({ name: 'CorteDeStream', cause: red });
  });

  it('un 404 falla con StreamRechazado(404)', async () => {
    pedir.mockResolvedValue({ ok: false, status: 404, body: null } as unknown as Response);
    await expect(firstValueFrom(cliente.abrir(RUTA, esFin))).rejects.toMatchObject({ estado: 404, name: 'StreamRechazado' });
    expect(new StreamRechazado(404)).toBeInstanceOf(Error);
  });

  it('desuscribirse aborta la petición', () => {
    pedir.mockReturnValue(new Promise(() => undefined));
    const suscripcion = cliente.abrir(RUTA, esFin).subscribe();
    const senal = (pedir.mock.calls[0] as [string, RequestInit])[1].signal as AbortSignal;

    suscripcion.unsubscribe();
    expect(senal.aborted).toBe(true);
  });
});
