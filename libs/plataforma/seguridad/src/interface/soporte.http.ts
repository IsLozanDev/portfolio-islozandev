import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import type { AccesoAprobado } from '../application/aprobar-acceso-soporte.js';
import type { Listado } from '../application/ports/lectura-miembros.js';
import type { AccesoDelAgente, FiltroSolicitudesSoporte, SolicitudSoporte } from '../application/ports/lectura-soporte.js';
import { UsuarioDelEventoDto } from './bitacora.http.js';
import { TAMANO_PAGINA_DEFECTO, TAMANO_PAGINA_MAXIMO } from './miembros.http.js';

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

// Bandeja y acciones del administrador del cliente.

/** `estado` admite varios separados por coma: la pestaña Historial pide RECHAZADO,REVOCADO,EXPIRADO. */
export const EsquemaListarSolicitudes = z.object({
  estado: z
    .string()
    .optional()
    .transform((valor) => (valor ? valor.split(',').map((estado) => estado.trim()) : undefined))
    .pipe(z.array(z.enum(ESTADOS_SOPORTE)).optional()),
  pagina: z.coerce.number().int().min(1).default(1),
  tamano: z.coerce.number().int().min(1).max(TAMANO_PAGINA_MAXIMO).default(TAMANO_PAGINA_DEFECTO),
});

export function filtroSolicitudesDe(consulta: z.infer<typeof EsquemaListarSolicitudes>): FiltroSolicitudesSoporte {
  return { estados: consulta.estado, pagina: consulta.pagina, tamano: consulta.tamano };
}

const uuidNulo = z.uuid().nullable().optional().default(null);

// Las horas van sin rango: 1-4 y «La vigencia máxima es 4 horas» los da el dominio (TR-CA-054).
export const EsquemaAprobarSoporte = z.object({ horas: z.number(), rol_id: uuidNulo, perfil_id: uuidNulo });
export const EsquemaRechazarSoporte = z.object({ motivo: z.string().max(LONGITUD_MAXIMA_TEXTO) });
export const EsquemaRevocarSoporte = z.object({ motivo: z.string().max(LONGITUD_MAXIMA_TEXTO), confirmar: z.boolean().optional().default(false) });

export class AprobarSoporteDto {
  @ApiProperty({ minimum: 1, maximum: 4 })
  horas!: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String, description: 'Rol o perfil, no ambos' })
  rol_id!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  perfil_id!: string | null;
}

export class RechazarSoporteDto {
  @ApiProperty({ minLength: 4, maxLength: 300 })
  motivo!: string;
}

export class RevocarSoporteDto extends RechazarSoporteDto {
  @ApiProperty({ description: 'Debe ser true (TR-RNF-021)' })
  confirmar!: boolean;
}

export class AccesoAprobadoDto {
  @ApiProperty({ format: 'date-time' })
  desde!: string;

  @ApiProperty({ format: 'date-time' })
  hasta!: string;
}

export class TotalPendientesDto {
  @ApiProperty()
  total!: number;
}

export class SolicitudSoporteDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: UsuarioDelEventoDto })
  agente!: UsuarioDelEventoDto;

  @ApiProperty()
  ticket!: string;

  @ApiProperty()
  motivo!: string;

  @ApiProperty({ enum: MODOS_SOPORTE })
  modo!: string;

  @ApiProperty()
  horas_solicitadas!: number;

  @ApiProperty({ enum: ESTADOS_SOPORTE })
  estado!: string;

  @ApiProperty({ format: 'date-time' })
  solicitado_en!: string;

  @ApiProperty({ format: 'date-time' })
  caduca_en!: string;

  @ApiPropertyOptional({ nullable: true, type: Number })
  horas_aprobadas!: number | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  desde!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  hasta!: string | null;

  @ApiPropertyOptional({ type: UsuarioDelEventoDto, nullable: true })
  aprobado_por!: UsuarioDelEventoDto | null;

  @ApiPropertyOptional({ type: UsuarioDelEventoDto, nullable: true, description: 'NULL si venció o la cerró TR-SOP' })
  cerrado_por!: UsuarioDelEventoDto | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  cerrado_en!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  motivo_cierre!: string | null;

  @ApiPropertyOptional({ enum: CAUSAS_CIERRE, nullable: true })
  causa_cierre!: string | null;
}

export class ListadoSolicitudesDto {
  @ApiProperty({ type: [SolicitudSoporteDto] })
  items!: SolicitudSoporteDto[];

  @ApiProperty()
  total!: number;
}

export function solicitudSoporteDto(solicitud: SolicitudSoporte): SolicitudSoporteDto {
  return {
    id: solicitud.id,
    agente: solicitud.agente,
    ticket: solicitud.ticket,
    motivo: solicitud.motivo,
    modo: solicitud.modo,
    horas_solicitadas: solicitud.horasSolicitadas,
    estado: solicitud.estado,
    solicitado_en: solicitud.solicitadoEn.toISOString(),
    caduca_en: solicitud.caducaEn.toISOString(),
    horas_aprobadas: solicitud.horasAprobadas,
    desde: iso(solicitud.desde),
    hasta: iso(solicitud.hasta),
    aprobado_por: solicitud.aprobadoPor,
    cerrado_por: solicitud.cerradoPor,
    cerrado_en: iso(solicitud.cerradoEn),
    motivo_cierre: solicitud.motivoCierre,
    causa_cierre: solicitud.causaCierre,
  };
}

export function listadoSolicitudesDto(listado: Listado<SolicitudSoporte>): ListadoSolicitudesDto {
  return { items: listado.items.map(solicitudSoporteDto), total: listado.total };
}

export function accesoAprobadoDto(acceso: AccesoAprobado): AccesoAprobadoDto {
  return { desde: acceso.desde.toISOString(), hasta: acceso.hasta.toISOString() };
}

export class EntradaASoporteDto {
  @ApiProperty({ format: 'uuid', description: 'Tenant que pondrá el próximo token: hacer refreshSession()' })
  tenant_id!: string;

  @ApiProperty({ format: 'date-time' })
  hasta!: string;
}
