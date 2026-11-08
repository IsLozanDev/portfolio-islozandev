import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import type { z } from 'zod';
import { ArchivoDemasiadoGrandeError, ColaNoDisponibleError, FilasInvalidasError } from '../domain/importacion/errores.js';

interface Respuesta {
  status(codigo: number): { json(cuerpo: unknown): unknown };
}

// Los específicos van antes que su clase base: gana el primero que coincide.
const ESTADOS: ReadonlyArray<readonly [abstract new (...argumentos: never[]) => DomainError, number]> = [
  [FilasInvalidasError, HttpStatus.UNPROCESSABLE_ENTITY],
  [ArchivoDemasiadoGrandeError, HttpStatus.PAYLOAD_TOO_LARGE],
  [ColaNoDisponibleError, HttpStatus.SERVICE_UNAVAILABLE],
  [ValidationError, HttpStatus.BAD_REQUEST],
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ConflictError, HttpStatus.CONFLICT],
  [ForbiddenError, HttpStatus.FORBIDDEN],
];

const CODIGOS_GENERICOS: Readonly<Record<string, string>> = { not_found: 'NO_ENCONTRADO', conflict: 'CONFLICTO', forbidden: 'PROHIBIDO' };

/**
 * Errores de dominio de /v1/catalogos como `{ codigo, mensaje }`, igual que seq, cfg y seg. El 403
 * OPERADOR_REQUERIDO llega por el puerto VerificadorOperador. Lo demás sigue al filtro global.
 */
@Catch(DomainError)
export class CatalogosFiltro implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const estado = ESTADOS.find(([tipo]) => error instanceof tipo)?.[1] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    host
      .switchToHttp()
      .getResponse<Respuesta>()
      .status(estado)
      .json({ codigo: CODIGOS_GENERICOS[error.code] ?? error.code, mensaje: error.message, ...detalleDe(error) });
  }
}

/** 422: la importación RECHAZADA y los primeros errores; el reporte completo se descarga en CSV. */
function detalleDe(error: DomainError): Record<string, unknown> {
  if (!(error instanceof FilasInvalidasError)) return {};
  return { importacion_id: error.importacionId, total_errores: error.totalErrores, errores: error.errores };
}

/** 400 con las rutas de los campos inválidos, nunca sus valores. */
export function validar<T>(esquema: z.ZodType<T>, entrada: unknown): T {
  const resultado = esquema.safeParse(entrada);
  if (resultado.success) return resultado.data;
  const campos = [...new Set(resultado.error.issues.map((problema) => problema.path.join('.') || '(cuerpo)'))];
  throw new HttpException({ codigo: 'SOLICITUD_INVALIDA', errores: campos }, HttpStatus.BAD_REQUEST);
}
