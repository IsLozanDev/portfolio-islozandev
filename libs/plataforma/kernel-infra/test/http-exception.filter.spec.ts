import 'reflect-metadata';
import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import {
  ConflictError,
  EventSchemaValidationError,
  ForbiddenError,
  MissingTenantContextError,
  NotFoundError,
  ValidationError,
} from '@vitrina/plataforma/kernel';
import { HttpExceptionFilter } from '../src/http-exception.filter.js';

function responder(error: unknown): { status: number; body: unknown } {
  const salida = { status: 0, body: undefined as unknown };
  const response = {
    status(code: number) {
      salida.status = code;
      return { json: (body: unknown) => (salida.body = body) };
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(error, host);
  return salida;
}

describe('HttpExceptionFilter', () => {
  it.each([
    ['ValidationError', new ValidationError('dato inválido'), 422, 'validation_error'],
    ['EventSchemaValidationError', new EventSchemaValidationError('fuera de esquema'), 422, 'event_schema_invalid'],
    ['NotFoundError', new NotFoundError('no existe'), 404, 'not_found'],
    ['ConflictError', new ConflictError('duplicado'), 409, 'conflict'],
    ['ForbiddenError', new ForbiddenError('sin permiso'), 403, 'forbidden'],
  ])('%s responde %i con su código', (_nombre, error, status, code) => {
    expect(responder(error)).toEqual({ status, body: { statusCode: status, code, message: error.message } });
  });

  it('un DomainError sin mapeo (error de programación) responde 500 sin detalle', () => {
    expect(responder(new MissingTenantContextError())).toEqual({
      status: 500,
      body: { statusCode: 500, code: 'internal_error', message: 'Error interno' },
    });
  });

  it('un Error desconocido responde 500 y no filtra su mensaje', () => {
    const { status, body } = responder(new Error('connection to db.host:5432 password=secreto'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('secreto');
  });

  it('una HttpException de Nest conserva su estado', () => {
    expect(responder(new BadRequestException('mal')).status).toBe(400);
  });
});
