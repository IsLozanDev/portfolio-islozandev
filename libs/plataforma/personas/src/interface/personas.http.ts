import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ConflictError, DomainError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import type { z } from 'zod';
import { DocumentoInvalidoPersonaError, PersonaDuplicadaError } from '../domain/errores.js';

interface Respuesta {
  status(codigo: number): { json(cuerpo: unknown): unknown };
}

const ESTADOS: ReadonlyArray<readonly [abstract new (...argumentos: never[]) => DomainError, number]> = [
  // DOCUMENTO_INVALIDO, TIPO_DOCUMENTO_NO_ADMITIDO, TIPO_PERSONA_INCOHERENTE, CONTACTO_INVALIDO y PRODUCTO_NO_SUSCRITO.
  [ValidationError, HttpStatus.UNPROCESSABLE_ENTITY],
  [NotFoundError, HttpStatus.NOT_FOUND],
  // PERSONA_DUPLICADA y el conflicto de versión.
  [ConflictError, HttpStatus.CONFLICT],
];

function cuerpoDeError(error: DomainError): Record<string, string> {
  const cuerpo = { codigo: error.code, mensaje: error.message };
  if (error instanceof DocumentoInvalidoPersonaError) return { ...cuerpo, motivo: error.motivo };
  if (error instanceof PersonaDuplicadaError) return { ...cuerpo, persona_id: error.personaId };
  return cuerpo;
}

/** Errores de dominio de /v1/personas como `{ codigo, mensaje }`, igual que cfg, seq, cat e idn. */
@Catch(DomainError)
export class PersonasFiltro implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const estado = ESTADOS.find(([tipo]) => error instanceof tipo)?.[1] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    host.switchToHttp().getResponse<Respuesta>().status(estado).json(cuerpoDeError(error));
  }
}

/** 400 con las rutas de los campos inválidos, nunca sus valores (documento, nombres y contactos son datos personales). */
export function validar<Entrada>(esquema: z.ZodType<Entrada>, entrada: unknown): Entrada {
  const resultado = esquema.safeParse(entrada);
  if (resultado.success) return resultado.data;
  const campos = [...new Set(resultado.error.issues.map((problema) => problema.path.join('.') || '(entrada)'))];
  throw new HttpException({ codigo: 'SOLICITUD_INVALIDA', errores: campos }, HttpStatus.BAD_REQUEST);
}
