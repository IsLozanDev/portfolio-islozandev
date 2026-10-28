import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import { IdentidadNoDisponibleError } from '@vitrina/plataforma/seguridad';

interface Respuesta {
  status(codigo: number): { json(cuerpo: unknown): unknown };
}

const ESTADOS: ReadonlyArray<readonly [abstract new (...argumentos: never[]) => DomainError, number]> = [
  [ValidationError, HttpStatus.BAD_REQUEST],
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ConflictError, HttpStatus.CONFLICT],
  [ForbiddenError, HttpStatus.FORBIDDEN],
  [IdentidadNoDisponibleError, HttpStatus.SERVICE_UNAVAILABLE],
];

const CODIGOS_GENERICOS: Readonly<Record<string, string>> = {
  validation_error: 'SOLICITUD_INVALIDA',
  not_found: 'NO_ENCONTRADO',
  conflict: 'CONFLICTO',
  forbidden: 'PROHIBIDO',
};

/** Errores de dominio de /v1/org como `{ codigo, mensaje }`, igual que seg, cfg, seq y evt. */
@Catch(DomainError)
export class OrgFiltro implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const estado = ESTADOS.find(([tipo]) => error instanceof tipo)?.[1] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    host
      .switchToHttp()
      .getResponse<Respuesta>()
      .status(estado)
      .json({ codigo: CODIGOS_GENERICOS[error.code] ?? error.code, mensaje: error.message });
  }
}
