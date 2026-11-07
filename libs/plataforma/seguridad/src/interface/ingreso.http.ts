import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { DomainError, ValidationError } from '@vitrina/plataforma/kernel';
import { z } from 'zod';
import type { SesionEmitida } from '../application/ports/proveedor-ingreso.port.js';
import { CredencialesInvalidasError, IngresoBloqueadoError, ProveedorIngresoNoDisponibleError } from '../domain/errores.js';

const LONGITUD_MINIMA_CORREO = 3;
const LONGITUD_MAXIMA_CORREO = 254;
/** bcrypt, que usa GoTrue, ignora lo que pasa de 72 bytes. */
const LONGITUD_MAXIMA_CLAVE = 72;
const DIGITOS_TOTP = /^\d{6}$/;

export const EsquemaIngresar = z.object({
  correo: z.string().trim().min(LONGITUD_MINIMA_CORREO).max(LONGITUD_MAXIMA_CORREO),
  clave: z.string().min(1).max(LONGITUD_MAXIMA_CLAVE),
});

export const EsquemaVerificarMfa = z.object({
  factorId: z.uuid(),
  codigo: z.string().regex(DIGITOS_TOTP),
});

export class IngresarDto {
  @ApiProperty({ minLength: LONGITUD_MINIMA_CORREO, maxLength: LONGITUD_MAXIMA_CORREO, example: 'ana.torres@saboresdelsur.pe' })
  correo!: string;

  @ApiProperty({ minLength: 1, maxLength: LONGITUD_MAXIMA_CLAVE, format: 'password' })
  clave!: string;
}

export class VerificarMfaDto {
  @ApiProperty({ format: 'uuid', description: 'Factor TOTP del usuario' })
  factorId!: string;

  @ApiProperty({ pattern: '^\\d{6}$', example: '123456' })
  codigo!: string;
}

/** Lo que recibe `supabase.auth.setSession` en el front. */
export class SesionEmitidaDto {
  @ApiProperty()
  access_token!: string;

  @ApiProperty()
  refresh_token!: string;

  @ApiProperty({ description: 'Segundos de vida del access token' })
  expires_in!: number;

  @ApiProperty({ enum: ['bearer'] })
  token_type!: 'bearer';
}

export function sesionEmitidaDto(sesion: SesionEmitida): SesionEmitidaDto {
  return { access_token: sesion.accessToken, refresh_token: sesion.refreshToken, expires_in: sesion.expiraEn, token_type: sesion.tipoToken };
}

interface Respuesta {
  status(code: number): { json(body: unknown): unknown };
  setHeader(nombre: string, valor: string): void;
}

const HTTP_NO_AUTORIZADO = 401;
const HTTP_DEMASIADAS_PETICIONES = 429;
const HTTP_NO_DISPONIBLE = 503;
const HTTP_SOLICITUD_INVALIDA = 400;
const HTTP_ERROR_INTERNO = 500;

const ESTADOS: ReadonlyArray<readonly [abstract new (...args: never[]) => DomainError, number]> = [
  [CredencialesInvalidasError, HTTP_NO_AUTORIZADO],
  [IngresoBloqueadoError, HTTP_DEMASIADAS_PETICIONES],
  [ProveedorIngresoNoDisponibleError, HTTP_NO_DISPONIBLE],
  [ValidationError, HTTP_SOLICITUD_INVALIDA],
];

/** `{ codigo, mensaje }` como el resto de seg; el bloqueo suma `Retry-After` y `reintentarEnSeg`. */
@Catch(DomainError)
export class IngresoFiltro implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const respuesta = host.switchToHttp().getResponse<Respuesta>();
    const estado = ESTADOS.find(([tipo]) => error instanceof tipo)?.[1] ?? HTTP_ERROR_INTERNO;
    const cuerpo: Record<string, unknown> = { codigo: error.code, mensaje: error.message };
    if (error instanceof IngresoBloqueadoError) {
      respuesta.setHeader('Retry-After', String(error.reintentarEnSeg));
      cuerpo['reintentarEnSeg'] = error.reintentarEnSeg;
    }
    respuesta.status(estado).json(cuerpo);
  }
}
