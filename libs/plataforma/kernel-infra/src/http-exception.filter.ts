import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';

interface HttpResponse {
  status(code: number): { json(body: unknown): unknown };
}

const ESTADO_POR_ERROR: ReadonlyArray<readonly [abstract new (...args: never[]) => DomainError, number]> = [
  [ValidationError, 422],
  [NotFoundError, 404],
  [ConflictError, 409],
  [ForbiddenError, 403],
];

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();

    if (error instanceof HttpException) {
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }

    if (error instanceof DomainError) {
      const estado = ESTADO_POR_ERROR.find(([tipo]) => error instanceof tipo)?.[1];
      if (estado) {
        response.status(estado).json({ statusCode: estado, code: error.code, message: error.message });
        return;
      }
    }

    // Solo el nombre del error: mensaje y stack pueden traer datos personales (RNF-026).
    this.logger.error(`Error no controlado: ${error instanceof Error ? error.name : typeof error}`);
    response.status(500).json({ statusCode: 500, code: 'internal_error', message: 'Error interno' });
  }
}
