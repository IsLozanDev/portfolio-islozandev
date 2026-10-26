import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import { PLANES, PRODUCTOS } from '@vitrina/plataforma/org';
import { IdentidadNoDisponibleError } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RUC = /^\d{11}$/;

export const EsquemaAltaTenant = z.object({
  codigo: z.string().min(3).max(30),
  nombre: z.string().min(3).max(150),
  producto_codigo: z.enum(PRODUCTOS),
  plan: z.enum(PLANES),
  modalidad: z.enum(['PRUEBA', 'ACTIVO']),
  vigente_hasta: z.string().regex(FECHA).optional(),
  ruc: z.string().regex(RUC),
  razon_social: z.string().min(1).max(200),
  nombre_comercial: z.string().max(150).optional(),
  correo_propietario: z.string().min(3).max(255),
  nombre_propietario: z.string().min(3).max(150),
});

export class AltaTenantDto {
  @ApiProperty({ example: 'polleria-dona-rosa', description: '3 a 30: minúsculas, dígitos y guiones' })
  codigo!: string;

  @ApiProperty({ example: 'Pollería Doña Rosa' })
  nombre!: string;

  @ApiProperty({ enum: PRODUCTOS })
  producto_codigo!: string;

  @ApiProperty({ enum: PLANES })
  plan!: string;

  @ApiProperty({ enum: ['PRUEBA', 'ACTIVO'] })
  modalidad!: string;

  @ApiPropertyOptional({ format: 'date', description: 'Obligatoria en ACTIVO. En PRUEBA, por defecto hoy + plat.suscripcion.dias_prueba' })
  vigente_hasta?: string;

  @ApiProperty({ example: '20601234565', description: '11 dígitos con dígito verificador de SUNAT' })
  ruc!: string;

  @ApiProperty({ example: 'Pollería Doña Rosa SAC' })
  razon_social!: string;

  @ApiPropertyOptional()
  nombre_comercial?: string;

  @ApiProperty({ format: 'email' })
  correo_propietario!: string;

  @ApiProperty({ example: 'Rosa Quispe' })
  nombre_propietario!: string;
}

/** Sin el token de invitación, el correo ni el RUC (TR-RNF-026). */
export class TenantDadoDeAltaDto {
  @ApiProperty({ format: 'uuid' })
  tenant_id!: string;

  @ApiProperty({ enum: ['PRUEBA', 'ACTIVO'] })
  estado!: string;

  @ApiProperty({ format: 'uuid' })
  suscripcion_id!: string;

  @ApiProperty({ format: 'date' })
  vigente_hasta!: string;

  @ApiProperty({ format: 'uuid' })
  empresa_id!: string;

  @ApiProperty({ format: 'uuid', description: 'Sucursal principal, establecimiento 0000' })
  sucursal_id!: string;

  @ApiProperty({ format: 'uuid' })
  membresia_id!: string;

  @ApiProperty({ format: 'uuid' })
  invitacion_id!: string;

  @ApiProperty({ format: 'date-time' })
  expira_en!: string;

  @ApiProperty({ description: 'false si el correo ya tenía usuario en Supabase' })
  usuario_nuevo!: boolean;

  @ApiProperty({ description: 'false si el enlace a un usuario existente no salió; el alta queda hecha' })
  correo_enviado!: boolean;
}

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
export class AltaTenantFiltro implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const estado = ESTADOS.find(([tipo]) => error instanceof tipo)?.[1] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    host
      .switchToHttp()
      .getResponse<Respuesta>()
      .status(estado)
      .json({ codigo: CODIGOS_GENERICOS[error.code] ?? error.code, mensaje: error.message });
  }
}
