import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import type { z } from 'zod';

interface Respuesta {
  status(codigo: number): { json(cuerpo: unknown): unknown };
}

const ESTADOS: ReadonlyArray<readonly [abstract new (...argumentos: never[]) => DomainError, number]> = [
  [ValidationError, HttpStatus.BAD_REQUEST],
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ConflictError, HttpStatus.CONFLICT],
  [ForbiddenError, HttpStatus.FORBIDDEN],
];

/** El NotFoundError genérico (p. ej. sucursal de otro tenant al verificar alcance) sale como NO_ENCONTRADO. */
const CODIGOS_GENERICOS: Readonly<Record<string, string>> = { not_found: 'NO_ENCONTRADO', conflict: 'CONFLICTO' };

/** Errores de dominio de /v1/cfg como `{ codigo, mensaje }`, igual que las rutas de seg. Lo demás sigue al filtro global. */
@Catch(DomainError)
export class ParametrosFiltro implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const estado = ESTADOS.find(([tipo]) => error instanceof tipo)?.[1] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    host
      .switchToHttp()
      .getResponse<Respuesta>()
      .status(estado)
      .json({ codigo: CODIGOS_GENERICOS[error.code] ?? error.code, mensaje: error.message });
  }
}

/** 400 con las rutas de los campos inválidos, nunca sus valores. */
export function validar<T>(esquema: z.ZodType<T>, entrada: unknown): T {
  const resultado = esquema.safeParse(entrada);
  if (resultado.success) return resultado.data;
  const campos = [...new Set(resultado.error.issues.map((problema) => problema.path.join('.') || '(cuerpo)'))];
  throw new HttpException({ codigo: 'SOLICITUD_INVALIDA', errores: campos }, HttpStatus.BAD_REQUEST);
}
