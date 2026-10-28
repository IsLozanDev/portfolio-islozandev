import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PLANES, PRODUCTOS } from '@vitrina/plataforma/org';
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
