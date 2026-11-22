import { Catch, HttpStatus, PayloadTooLargeException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { RespuestaEnStreaming } from '@vitrina/plataforma/kernel-infra';
import { ArchivoDemasiadoGrandeError } from '../domain/importacion/errores.js';

interface Respuesta {
  status(codigo: number): { json(cuerpo: unknown): unknown };
}

/** El límite de multer (`limits.fileSize`) responde 413 con el mismo código que el dominio. */
@Catch(PayloadTooLargeException)
export class ArchivoGrandeFiltro implements ExceptionFilter {
  catch(_error: PayloadTooLargeException, host: ArgumentsHost): void {
    const error = new ArchivoDemasiadoGrandeError();
    host.switchToHttp().getResponse<Respuesta>().status(HttpStatus.PAYLOAD_TOO_LARGE).json({ codigo: error.code, mensaje: error.message });
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
