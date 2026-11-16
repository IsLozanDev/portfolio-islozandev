import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import type { z } from 'zod';
import { CuotaAgotadaError, DocumentoInvalidoError, ProveedorNoDisponibleError, TipoNoConsultableError } from '../domain/errores.js';

interface Respuesta {
  status(codigo: number): { json(cuerpo: unknown): unknown };
}

// Los específicos van antes que su clase base: gana el primero que coincide.
const ESTADOS: ReadonlyArray<readonly [abstract new (...argumentos: never[]) => DomainError, number]> = [
  [DocumentoInvalidoError, HttpStatus.UNPROCESSABLE_ENTITY],
  [TipoNoConsultableError, HttpStatus.UNPROCESSABLE_ENTITY],
  // Cuotas y proveedores (spec 29): PERIODO_INVALIDO, PERIODO_CERRADO, INCLUIDAS_MENOR_QUE_CONSUMIDAS, ULTIMO_PROVEEDOR_ACTIVO.
  [ValidationError, HttpStatus.UNPROCESSABLE_ENTITY],
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ConflictError, HttpStatus.CONFLICT],
  // OPERADOR_REQUERIDO llega por el puerto VerificadorOperador.
  [ForbiddenError, HttpStatus.FORBIDDEN],
  // TR-RNF-007: el cliente sigue con el registro manual.
  [ProveedorNoDisponibleError, HttpStatus.SERVICE_UNAVAILABLE],
  // Sin Retry-After: la cuota no vuelve hasta el mes siguiente y el cliente pasa a ingreso manual.
  [CuotaAgotadaError, HttpStatus.TOO_MANY_REQUESTS],
];

function cuerpoDeError(error: DomainError): Record<string, string> {
  const cuerpo = { codigo: error.code, mensaje: error.message };
  return error instanceof DocumentoInvalidoError ? { ...cuerpo, motivo: error.motivo } : cuerpo;
}

/** Errores de dominio de /v1/identidad como `{ codigo, mensaje }`, igual que cfg, seq y cat. */
@Catch(DomainError)
export class IdentidadFiltro implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const estado = ESTADOS.find(([tipo]) => error instanceof tipo)?.[1] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    host.switchToHttp().getResponse<Respuesta>().status(estado).json(cuerpoDeError(error));
  }
}

/** 400 con las rutas de los campos inválidos, nunca sus valores (el número es un dato personal). */
export function validar<T>(esquema: z.ZodType<T>, entrada: unknown): T {
  const resultado = esquema.safeParse(entrada);
  if (resultado.success) return resultado.data;
  const campos = [...new Set(resultado.error.issues.map((problema) => problema.path.join('.') || '(entrada)'))];
  throw new HttpException({ codigo: 'SOLICITUD_INVALIDA', errores: campos }, HttpStatus.BAD_REQUEST);
}
