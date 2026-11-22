import { HttpStatus } from '@nestjs/common';

export const PING_CADA_MS = 15_000;
export const DURACION_MAXIMA_STREAM_MS = 15 * 60_000;
const PING = ': ping\n\n';

/** Lo que el SSE y las descargas en streaming usan de la respuesta de Express. */
export interface RespuestaEnStreaming {
  status(codigo: number): unknown;
  setHeader(nombre: string, valor: string): unknown;
  flushHeaders(): void;
  write(trozo: string): boolean;
  end(): void;
  on(evento: 'close', alCerrar: () => void): unknown;
}

/**
 * SSE a mano y no con `@Sse`: hace falta el comentario `: ping` cada 15 s para los proxies que cortan por
 * inactividad. Cada aviso sale con su `tipo` como nombre de evento. Cierra cuando se acaban los avisos,
 * cuando el cliente corta o a los 15 minutos (el front reconecta).
 */
export async function transmitirEventosSse<T extends { tipo: string }>(
  respuesta: RespuestaEnStreaming,
  avisos: AsyncIterable<T>,
  cierre: AbortController,
): Promise<void> {
  respuesta.status(HttpStatus.OK);
  respuesta.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  respuesta.setHeader('Cache-Control', 'no-cache');
  respuesta.setHeader('Connection', 'keep-alive');
  respuesta.setHeader('X-Accel-Buffering', 'no');
  respuesta.flushHeaders();
  respuesta.on('close', () => cierre.abort());
  const ping = setInterval(() => respuesta.write(PING), PING_CADA_MS);
  const limite = setTimeout(() => cierre.abort(), DURACION_MAXIMA_STREAM_MS);
  try {
    for await (const aviso of avisos) {
      if (cierre.signal.aborted) break;
      respuesta.write(`event: ${aviso.tipo}\ndata: ${JSON.stringify(aviso)}\n\n`);
    }
  } finally {
    clearInterval(ping);
    clearTimeout(limite);
    cierre.abort();
    respuesta.end();
  }
}
