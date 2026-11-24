import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ConflictError, DomainError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import type { z } from 'zod';
import { VariableNoPermitidaError } from '../domain/errores.js';

interface Respuesta {
  status(codigo: number): { json(cuerpo: unknown): unknown };
}

const ESTADOS: ReadonlyArray<readonly [abstract new (...argumentos: never[]) => DomainError, number]> = [
  // VARIABLE_NO_PERMITIDA, CONTENIDO_PLANTILLA_INVALIDO, CANAL_NO_HABILITADO y ASUNTO_DEMASIADO_LARGO.
  [ValidationError, HttpStatus.BAD_REQUEST],
  // PLANTILLA_NO_ENCONTRADA y SIN_PERSONALIZACION.
  [NotFoundError, HttpStatus.NOT_FOUND],
  // VERSION_OBSOLETA.
  [ConflictError, HttpStatus.CONFLICT],
];

const CODIGO_SOLICITUD_INVALIDA = 'SOLICITUD_INVALIDA';
const RUTA_DE_LA_ENTRADA = '(cuerpo)';

/** Errores de dominio de /v1/notificaciones/plantillas como `{ codigo, mensaje }`, igual que cat, per y fe. */
@Catch(DomainError)
export class PlantillasFiltro implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const estado = ESTADOS.find(([tipo]) => error instanceof tipo)?.[1] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    host
      .switchToHttp()
      .getResponse<Respuesta>()
      .status(estado)
      .json({ codigo: error.code, mensaje: error.message, ...detalleDe(error) });
  }
}

/** TR-CA-185: los nombres no declarados, para que la UI marque el campo. */
function detalleDe(error: DomainError): Record<string, unknown> {
  if (!(error instanceof VariableNoPermitidaError)) return {};
  return { variables: [...error.nombres] };
}

/** 400 con las rutas de los campos inválidos, nunca sus valores. */
export function validar<Entrada>(esquema: z.ZodType<Entrada>, entrada: unknown): Entrada {
  const resultado = esquema.safeParse(entrada);
  if (resultado.success) return resultado.data;
  const campos = [...new Set(resultado.error.issues.map((problema) => problema.path.join('.') || RUTA_DE_LA_ENTRADA))];
  throw new HttpException({ codigo: CODIGO_SOLICITUD_INVALIDA, errores: campos }, HttpStatus.BAD_REQUEST);
}
