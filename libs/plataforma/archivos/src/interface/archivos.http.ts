import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import type { z } from 'zod';
import {
  AlmacenNoDisponibleError,
  ArchivoNoDisponibleError,
  TamanoExcedidoError,
  VersionEnCursoError,
  VersionNoDisponibleError,
} from '../domain/errores.js';

interface Respuesta {
  status(codigo: number): { json(cuerpo: unknown): unknown };
}

const ESTADOS: ReadonlyArray<readonly [abstract new (...argumentos: never[]) => DomainError, number]> = [
  // CATEGORIA_DESCONOCIDA, MIME_NO_PERMITIDO, TAMANO_EXCEDIDO, DATOS_INVALIDOS y VIGENCIA_INVALIDA.
  [ValidationError, HttpStatus.UNPROCESSABLE_ENTITY],
  [ForbiddenError, HttpStatus.FORBIDDEN],
  [NotFoundError, HttpStatus.NOT_FOUND],
  // ARCHIVO_NO_DISPONIBLE, VERSION_EN_CURSO, VERSION_NO_DISPONIBLE y el conflicto de bloqueo optimista.
  [ConflictError, HttpStatus.CONFLICT],
  [AlmacenNoDisponibleError, HttpStatus.SERVICE_UNAVAILABLE],
];

const MENSAJE_ALMACEN_CAIDO = 'El almacén de archivos no respondió; vuelve a intentarlo';

function cuerpoDeError(error: DomainError): Record<string, string | number> {
  // Sin el código de Storage o de la cola: es detalle interno.
  if (error instanceof AlmacenNoDisponibleError) return { codigo: error.code, mensaje: MENSAJE_ALMACEN_CAIDO };
  const cuerpo = { codigo: error.code, mensaje: error.message };
  if (error instanceof TamanoExcedidoError) return { ...cuerpo, tamano_max_bytes: error.tamanoMaxBytes };
  if (error instanceof ArchivoNoDisponibleError || error instanceof VersionNoDisponibleError) return { ...cuerpo, estado: error.estado };
  if (error instanceof VersionEnCursoError) return { ...cuerpo, numero: error.numero };
  return cuerpo;
}

/** Errores de dominio de /v1/archivos como `{ codigo, mensaje }`, igual que cfg, seq, cat, idn y per. */
@Catch(DomainError)
export class ArchivosFiltro implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const estado = ESTADOS.find(([tipo]) => error instanceof tipo)?.[1] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    host.switchToHttp().getResponse<Respuesta>().status(estado).json(cuerpoDeError(error));
  }
}

/** 400 con las rutas de los campos inválidos, nunca sus valores (el nombre original puede llevar datos personales). */
export function validar<Entrada>(esquema: z.ZodType<Entrada>, entrada: unknown): Entrada {
  const resultado = esquema.safeParse(entrada);
  if (resultado.success) return resultado.data;
  const campos = [...new Set(resultado.error.issues.map((problema) => problema.path.join('.') || '(entrada)'))];
  throw new HttpException({ codigo: 'SOLICITUD_INVALIDA', errores: campos }, HttpStatus.BAD_REQUEST);
}
