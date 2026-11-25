import { Catch, HttpException, HttpStatus, PayloadTooLargeException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import { BovedaNoConfiguradaError } from '@vitrina/plataforma/secretos';
import type { z } from 'zod';
import { KB_MAXIMOS_CERTIFICADO } from '../application/cargar-certificado.js';
import { CertificadoNoAceptadoError, ComprobanteNoAceptadoError } from '../domain/errores.js';

interface Respuesta {
  status(codigo: number): { json(cuerpo: unknown): unknown };
}

const ESTADOS: ReadonlyArray<readonly [abstract new (...argumentos: never[]) => DomainError, number]> = [
  // CERTIFICADO_OTRO_RUC, CERTIFICADO_VENCIDO y CERTIFICADO_NO_VIGENTE: el archivo se leyó, pero no sirve.
  [CertificadoNoAceptadoError, HttpStatus.UNPROCESSABLE_ENTITY],
  // Los errores normativos de la emisión (spec 51): la solicitud se entendió, pero la norma no la admite.
  [ComprobanteNoAceptadoError, HttpStatus.UNPROCESSABLE_ENTITY],
  // DATOS_COMPROBANTE_INVALIDOS, PROVEEDOR_FE_INVALIDO, DATOS_EMISOR_INVALIDOS, ARCHIVO_CERTIFICADO_INVALIDO, CLAVE_CERTIFICADO_INCORRECTA y CERTIFICADO_SIN_RUC.
  [ValidationError, HttpStatus.BAD_REQUEST],
  [ForbiddenError, HttpStatus.FORBIDDEN],
  // EMISOR_NO_ENCONTRADO y EMPRESA_NO_ENCONTRADA (también si es de otro tenant).
  [NotFoundError, HttpStatus.NOT_FOUND],
  // VERSION_OBSOLETA y EMPRESA_INACTIVA.
  [ConflictError, HttpStatus.CONFLICT],
  // Sin claves maestras la bóveda no guarda: es configuración del servidor, no del cliente.
  [BovedaNoConfiguradaError, HttpStatus.SERVICE_UNAVAILABLE],
];

/** Errores de dominio de /v1/fe como `{ codigo, mensaje }`, igual que cfg, seq, cat, idn, per y arc. */
@Catch(DomainError)
export class ComprobantesFiltro implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const estado = ESTADOS.find(([tipo]) => error instanceof tipo)?.[1] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    host.switchToHttp().getResponse<Respuesta>().status(estado).json({ codigo: error.code, mensaje: error.message });
  }
}

export const CODIGO_CERTIFICADO_GRANDE = 'ARCHIVO_DEMASIADO_GRANDE';
const CODIGO_SOLICITUD_INVALIDA = 'SOLICITUD_INVALIDA';
const RUTA_DE_LA_ENTRADA = '(entrada)';

/** El límite de multer (`limits.fileSize`) responde 413 sin registrar el cuerpo multipart. */
@Catch(PayloadTooLargeException)
export class CertificadoGrandeFiltro implements ExceptionFilter {
  catch(_error: PayloadTooLargeException, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Respuesta>()
      .status(HttpStatus.PAYLOAD_TOO_LARGE)
      .json({ codigo: CODIGO_CERTIFICADO_GRANDE, mensaje: `El certificado supera ${KB_MAXIMOS_CERTIFICADO} KB` });
  }
}

/** 400 con las rutas de los campos inválidos, nunca sus valores (la clave no debe volver ni en un error). */
export function solicitudInvalida(campos: string[]): HttpException {
  return new HttpException({ codigo: CODIGO_SOLICITUD_INVALIDA, errores: campos }, HttpStatus.BAD_REQUEST);
}

export function validar<Entrada>(esquema: z.ZodType<Entrada>, entrada: unknown): Entrada {
  const resultado = esquema.safeParse(entrada);
  if (resultado.success) return resultado.data;
  const campos = [...new Set(resultado.error.issues.map((problema) => problema.path.join('.') || RUTA_DE_LA_ENTRADA))];
  throw solicitudInvalida(campos);
}
