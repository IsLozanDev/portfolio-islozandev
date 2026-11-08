import { Catch, HttpStatus, PayloadTooLargeException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { AvisoImportacion } from '../application/ports/importacion.js';
import { ArchivoDemasiadoGrandeError } from '../domain/importacion/errores.js';

const PING_CADA_MS = 15_000;
const MINUTOS_MAXIMOS_STREAM = 15;
const MILISEGUNDOS_POR_MINUTO = 60_000;
const PING = ': ping\n\n';

interface Respuesta {
  status(codigo: number): { json(cuerpo: unknown): unknown };
}

/** Lo que el SSE y la descarga usan de la respuesta de Express. */
export interface RespuestaEnStreaming {
  status(codigo: number): unknown;
  setHeader(nombre: string, valor: string): unknown;
  flushHeaders(): void;
  write(trozo: string): boolean;
  end(): void;
  on(evento: 'close', alCerrar: () => void): unknown;
}

/** El límite de multer (`limits.fileSize`) responde 413 con el mismo código que el dominio. */
@Catch(PayloadTooLargeException)
export class ArchivoGrandeFiltro implements ExceptionFilter {
  catch(_error: PayloadTooLargeException, host: ArgumentsHost): void {
    const error = new ArchivoDemasiadoGrandeError();
    host.switchToHttp().getResponse<Respuesta>().status(HttpStatus.PAYLOAD_TOO_LARGE).json({ codigo: error.code, mensaje: error.message });
  }
}

/**
 * SSE a mano y no con `@Sse`: hace falta el comentario `: ping` cada 15 s para los proxies que cortan por
 * inactividad. Cierra al llegar el `fin`, cuando el cliente corta o a los 15 minutos (el front reconecta).
 */
export async function transmitirAvisos(respuesta: RespuestaEnStreaming, avisos: AsyncIterable<AvisoImportacion>, cierre: AbortController): Promise<void> {
  respuesta.status(HttpStatus.OK);
  respuesta.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  respuesta.setHeader('Cache-Control', 'no-cache');
  respuesta.setHeader('Connection', 'keep-alive');
  respuesta.setHeader('X-Accel-Buffering', 'no');
  respuesta.flushHeaders();
  respuesta.on('close', () => cierre.abort());
  const ping = setInterval(() => respuesta.write(PING), PING_CADA_MS);
  const limite = setTimeout(() => cierre.abort(), MINUTOS_MAXIMOS_STREAM * MILISEGUNDOS_POR_MINUTO);
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

/** Descarga en streaming: una escritura por línea, sin armar el archivo entero en memoria. */
export function descargarCsv(respuesta: RespuestaEnStreaming, nombreArchivo: string, lineas: Iterable<string>): void {
  respuesta.status(HttpStatus.OK);
  respuesta.setHeader('Content-Type', 'text/csv; charset=utf-8');
  respuesta.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  for (const linea of lineas) respuesta.write(linea);
  respuesta.end();
}
