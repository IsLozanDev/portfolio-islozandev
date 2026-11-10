import 'reflect-metadata';
import { BadRequestException, ServiceUnavailableException, type ArgumentsHost } from '@nestjs/common';
import {
  ConflictError,
  EventSchemaValidationError,
  ForbiddenError,
  MissingTenantContextError,
  NotFoundError,
  ValidationError,
} from '@vitrina/plataforma/kernel';
import { HttpExceptionFilter } from '../src/http-exception.filter.js';
import type { ReportadorErrores } from '../src/reportador-errores.js';

function responder(error: unknown, reportador?: ReportadorErrores): { status: number; body: unknown } {
  const salida = { status: 0, body: undefined as unknown };
  const response = {
    status(code: number) {
      salida.status = code;
      return { json: (body: unknown) => (salida.body = body) };
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  new HttpExceptionFilter(reportador).catch(error, host);
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

  describe('ReportadorErrores (spec 21)', () => {
    const reportados = (error: unknown) => {
      const errores: unknown[] = [];
      responder(error, { reportar: (reportado) => void errores.push(reportado) });
      return errores;
    };

    it('un error no controlado se reporta', () => {
      const error = new Error('falla');
      expect(reportados(error)).toEqual([error]);
    });

    it('una HttpException 5xx se reporta', () => {
      expect(reportados(new ServiceUnavailableException())).toHaveLength(1);
    });

    it.each([
      ['un 4xx de Nest', new BadRequestException('mal')],
      ['un DomainError mapeado', new NotFoundError('no existe')],
    ])('%s no se reporta', (_caso, error) => {
      expect(reportados(error)).toEqual([]);
    });
  });
});
