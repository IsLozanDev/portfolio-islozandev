import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import type { AccesoDelAgente } from '../application/ports/lectura-soporte.js';

export const MODOS_SOPORTE = ['LECTURA', 'ESCRITURA'] as const;
export const ESTADOS_SOPORTE = ['PENDIENTE', 'APROBADO', 'RECHAZADO', 'REVOCADO', 'EXPIRADO'] as const;
const CAUSAS_CIERRE = ['RECHAZO', 'ADMINISTRADOR', 'TICKET_CERRADO', 'VENCIMIENTO'] as const;
/** Topes del cuerpo; el formato del ticket, el motivo de 10 a 300 y las horas de 1 a 4 los valida el dominio. */
const LONGITUD_MAXIMA_TEXTO = 400;

// Solo la forma: ticket, motivo y horas tienen mensajes propios del dominio (TR-CA-054).
export const EsquemaSolicitarSoporte = z.object({
  tenant_id: z.uuid(),
  ticket: z.string().max(LONGITUD_MAXIMA_TEXTO),
  motivo: z.string().max(LONGITUD_MAXIMA_TEXTO),
  modo: z.enum(MODOS_SOPORTE),
  horas: z.number(),
});

export class SolicitarSoporteDto {
  @ApiProperty({ format: 'uuid', description: 'Tenant del cliente' })
  tenant_id!: string;

  @ApiProperty({ example: 'SOP-000245' })
  ticket!: string;

  @ApiProperty({ minLength: 10, maxLength: 300 })
  motivo!: string;

  @ApiProperty({ enum: MODOS_SOPORTE })
  modo!: string;

  @ApiProperty({ minimum: 1, maximum: 4, description: 'Horas que pide el agente; el administrador las confirma' })
  horas!: number;
}

export class SolicitudCreadaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class AccesoDelAgenteDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenant_id!: string;

  @ApiProperty()
  tenant_nombre!: string;

  @ApiProperty()
  ticket!: string;

  @ApiProperty({ enum: MODOS_SOPORTE })
  modo!: string;

  @ApiProperty({ enum: ESTADOS_SOPORTE })
  estado!: string;

  @ApiProperty()
  horas_solicitadas!: number;

  @ApiProperty({ format: 'date-time' })
  solicitado_en!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  desde!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  hasta!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  motivo_cierre!: string | null;

  @ApiPropertyOptional({ enum: CAUSAS_CIERRE, nullable: true })
  causa_cierre!: string | null;
}

export const iso = (fecha: Date | null): string | null => fecha?.toISOString() ?? null;

export function accesoDelAgenteDto(acceso: AccesoDelAgente): AccesoDelAgenteDto {
  return {
    id: acceso.id,
    tenant_id: acceso.tenantId,
    tenant_nombre: acceso.tenantNombre,
    ticket: acceso.ticket,
    modo: acceso.modo,
    estado: acceso.estado,
    horas_solicitadas: acceso.horasSolicitadas,
    solicitado_en: acceso.solicitadoEn.toISOString(),
    desde: iso(acceso.desde),
    hasta: iso(acceso.hasta),
    motivo_cierre: acceso.motivoCierre,
    causa_cierre: acceso.causaCierre,
  };
}
