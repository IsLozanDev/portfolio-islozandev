import { jest } from '@jest/globals';
import { AvisosEnEspera } from '../src/avisos-en-espera.js';
import { DURACION_MAXIMA_STREAM_MS, PING_CADA_MS, transmitirEventosSse, type RespuestaEnStreaming } from '../src/transmitir-eventos-sse.js';

interface Aviso {
  tipo: 'avance' | 'fin';
  valor: number;
}

class RespuestaFalsa implements RespuestaEnStreaming {
  readonly cabeceras = new Map<string, string>();
  readonly escrito: string[] = [];
  codigo = 0;
  terminada = false;
  cabecerasEnviadas = false;
  private alCerrar: (() => void) | null = null;

  status(codigo: number): void {
    this.codigo = codigo;
  }
  setHeader(nombre: string, valor: string): void {
    this.cabeceras.set(nombre, valor);
  }
  flushHeaders(): void {
    this.cabecerasEnviadas = true;
  }
  write(trozo: string): boolean {
    this.escrito.push(trozo);
    return true;
  }
  end(): void {
    this.terminada = true;
  }
  on(_evento: 'close', alCerrar: () => void): void {
    this.alCerrar = alCerrar;
  }
  cerrarDesdeElCliente(): void {
    this.alCerrar?.();
  }
}

async function* avisosFijos(...avisos: Aviso[]): AsyncGenerator<Aviso> {
  yield* avisos;
}

const pings = (respuesta: RespuestaFalsa) => respuesta.escrito.filter((trozo) => trozo === ': ping\n\n').length;

describe('transmitirEventosSse', () => {
  afterEach(() => jest.useRealTimers());

  it('manda las cabeceras de SSE y un evento por aviso con su tipo, y cierra al acabarse los avisos', async () => {
    const respuesta = new RespuestaFalsa();
    const cierre = new AbortController();

    await transmitirEventosSse(respuesta, avisosFijos({ tipo: 'avance', valor: 1 }, { tipo: 'fin', valor: 2 }), cierre);

    expect(respuesta.codigo).toBe(200);
    expect(respuesta.cabeceras.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(respuesta.cabeceras.get('X-Accel-Buffering')).toBe('no');
    expect(respuesta.cabecerasEnviadas).toBe(true);
    expect(respuesta.escrito).toEqual(['event: avance\ndata: {"tipo":"avance","valor":1}\n\n', 'event: fin\ndata: {"tipo":"fin","valor":2}\n\n']);
    expect(respuesta.terminada).toBe(true);
    expect(cierre.signal.aborted).toBe(true);
  });

  it('manda `: ping` cada 15 s y cierra a los 15 min sin `fin`', async () => {
    jest.useFakeTimers();
    const respuesta = new RespuestaFalsa();
    const cierre = new AbortController();
    const espera = new AvisosEnEspera<Aviso>(cierre.signal);

    const transmision = transmitirEventosSse(respuesta, espera.avisos(), cierre);
    await jest.advanceTimersByTimeAsync(PING_CADA_MS * 2);
    expect(pings(respuesta)).toBe(2);
    expect(respuesta.terminada).toBe(false);

    await jest.advanceTimersByTimeAsync(DURACION_MAXIMA_STREAM_MS - PING_CADA_MS * 2);
    await transmision;
    expect(respuesta.terminada).toBe(true);
  });

  it('cierra cuando el cliente corta la conexión', async () => {
    const respuesta = new RespuestaFalsa();
    const cierre = new AbortController();
    const espera = new AvisosEnEspera<Aviso>(cierre.signal);

    const transmision = transmitirEventosSse(respuesta, espera.avisos(), cierre);
    espera.recibir({ tipo: 'avance', valor: 1 });
    await new Promise((resolver) => setImmediate(resolver));
    respuesta.cerrarDesdeElCliente();
    await transmision;

    expect(respuesta.escrito).toEqual(['event: avance\ndata: {"tipo":"avance","valor":1}\n\n']);
    expect(respuesta.terminada).toBe(true);
  });
});

describe('AvisosEnEspera', () => {
  it('entrega en orden lo recibido antes y después de empezar a leer, y termina al abortar', async () => {
    const cierre = new AbortController();
    const espera = new AvisosEnEspera<number>(cierre.signal);
    espera.recibir(0);
    const leidos: number[] = [];
    const lectura = (async () => {
      for await (const aviso of espera.avisos()) leidos.push(aviso);
    })();

    espera.recibir(1);
    await new Promise((resolver) => setImmediate(resolver));
    cierre.abort();
    await lectura;

    expect(leidos).toEqual([0, 1]);
  });
});
