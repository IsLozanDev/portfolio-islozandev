import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DomainError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import { z } from 'zod';
import type { EventoAuditoriaListado, ListadoAuditoria } from '../application/consultar-auditoria.js';
import type { DetalleEventoAuditoria } from '../application/obtener-evento-auditoria.js';
import { FINALIDADES } from '../domain/entradas.js';
import { AuditoriaNoDisponibleError, ExportacionDemasiadoGrandeError } from '../domain/errores.js';
import {
  LONGITUD_MAXIMA_ACCION,
  LONGITUD_MAXIMA_ENTIDAD_ID,
  LONGITUD_MAXIMA_ENTIDAD_TIPO,
  LONGITUD_MAXIMA_USUARIO,
  LONGITUD_MINIMA_USUARIO,
  TAMANO_PAGINA_DEFECTO,
  TAMANO_PAGINA_MAXIMO,
  TIPOS_EVENTO_AUDITORIA,
  type FiltroAuditoria,
} from '../domain/filtro-auditoria.js';

interface Respuesta {
  status(codigo: number): { json(cuerpo: unknown): unknown };
}

// Los específicos van antes que su clase base: gana el primero que coincide.
const ESTADOS: ReadonlyArray<readonly [abstract new (...argumentos: never[]) => DomainError, number]> = [
  [ExportacionDemasiadoGrandeError, HttpStatus.UNPROCESSABLE_ENTITY],
  [AuditoriaNoDisponibleError, HttpStatus.SERVICE_UNAVAILABLE],
  [ValidationError, HttpStatus.BAD_REQUEST],
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ForbiddenError, HttpStatus.FORBIDDEN],
];

/** Errores de dominio de /v1/aud como `{ codigo, mensaje }`, igual que seg y cat. */
@Catch(DomainError)
export class AuditoriaFiltro implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const estado = ESTADOS.find(([tipo]) => error instanceof tipo)?.[1] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    host.switchToHttp().getResponse<Respuesta>().status(estado).json({ codigo: error.code, mensaje: error.message });
  }
}

/** 400 con las rutas de los campos inválidos; nunca los valores (el filtro `usuario` puede traer un correo). */
export function validar<T>(esquema: z.ZodType<T>, valor: unknown): T {
  const resultado = esquema.safeParse(valor);
  if (!resultado.success) {
    const errores = [...new Set(resultado.error.issues.map((problema) => problema.path.join('.') || '(consulta)'))];
    throw new HttpException({ codigo: 'SOLICITUD_INVALIDA', errores }, HttpStatus.BAD_REQUEST);
  }
  return resultado.data;
}

const textoOpcional = (maximo: number) => z.string().trim().min(1).max(maximo).optional();

// desde y hasta van sin forma: su ausencia, su orden y los 92 días dan RANGO_INVALIDO en el dominio.
export const EsquemaFiltroAuditoria = z.object({
  desde: z.string().trim().optional(),
  hasta: z.string().trim().optional(),
  usuario: z.string().trim().min(LONGITUD_MINIMA_USUARIO).max(LONGITUD_MAXIMA_USUARIO).optional(),
  accion: textoOpcional(LONGITUD_MAXIMA_ACCION),
  entidad_tipo: textoOpcional(LONGITUD_MAXIMA_ENTIDAD_TIPO),
  entidad_id: textoOpcional(LONGITUD_MAXIMA_ENTIDAD_ID),
  sucursal_id: z.uuid().optional(),
  tipo: z.enum(TIPOS_EVENTO_AUDITORIA).optional(),
  persona_titular_id: z.uuid().optional(),
});

export const EsquemaConsultarAuditoria = EsquemaFiltroAuditoria.extend({
  pagina: z.coerce.number().int().min(1).default(1),
  tamano: z.coerce.number().int().min(1).max(TAMANO_PAGINA_MAXIMO).default(TAMANO_PAGINA_DEFECTO),
});

export function filtroDe(consulta: z.infer<typeof EsquemaFiltroAuditoria>): FiltroAuditoria {
  return {
    desde: consulta.desde ?? '',
    hasta: consulta.hasta ?? '',
    usuario: consulta.usuario,
    accion: consulta.accion,
    entidadTipo: consulta.entidad_tipo,
    entidadId: consulta.entidad_id,
    sucursalId: consulta.sucursal_id,
    tipo: consulta.tipo,
    personaTitularId: consulta.persona_titular_id,
  };
}

export class UsuarioAuditoriaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty()
  correo!: string;
}

export class SucursalAuditoriaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  codigo!: string;

  @ApiProperty()
  nombre!: string;
}

export class EventoAuditoriaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Posición en la cadena del tenant (bigint como texto)' })
  numero!: string;

  @ApiProperty({ enum: TIPOS_EVENTO_AUDITORIA })
  tipo!: string;

  @ApiProperty({ enum: ['DIRECTO', 'EVENTO'] })
  origen!: string;

  @ApiProperty({ example: 'rest.venta.anular' })
  accion!: string;

  @ApiProperty()
  entidad_tipo!: string;

  @ApiProperty()
  entidad_id!: string;

  @ApiPropertyOptional({ type: UsuarioAuditoriaDto, nullable: true, description: 'null si actuó el sistema' })
  usuario!: UsuarioAuditoriaDto | null;

  @ApiPropertyOptional({ type: SucursalAuditoriaDto, nullable: true, description: 'null en operaciones de todo el tenant' })
  sucursal!: SucursalAuditoriaDto | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  motivo!: string | null;

  @ApiPropertyOptional({ enum: FINALIDADES, nullable: true })
  finalidad!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  ticket!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  persona_titular_id!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  ip!: string | null;

  @ApiProperty({ format: 'date-time' })
  ocurrido_en!: string;
}

export class CambioDto {
  @ApiProperty({ example: 'items[0].monto' })
  campo!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Valor anterior; null si el campo no estaba' })
  antes!: unknown;

  @ApiPropertyOptional({ nullable: true, description: 'Valor nuevo; null si el campo ya no está' })
  despues!: unknown;
}

export class EventoAuditoriaDetalleDto extends EventoAuditoriaDto {
  @ApiPropertyOptional({ nullable: true, description: 'JSON enmascarado antes del cambio' })
  antes!: unknown;

  @ApiPropertyOptional({ nullable: true, description: 'JSON enmascarado después del cambio' })
  despues!: unknown;

  @ApiProperty({ type: [CambioDto], description: 'Campos que difieren, ordenados por ruta; hasta 200' })
  cambios!: CambioDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  trace_id!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  event_id!: string | null;

  @ApiProperty()
  hash_anterior!: string;

  @ApiProperty()
  hash!: string;
}

export class ListadoAuditoriaDto {
  @ApiProperty({ type: [EventoAuditoriaDto] })
  items!: EventoAuditoriaDto[];

  @ApiProperty()
  total!: number;
}

export function eventoAuditoriaDto(evento: EventoAuditoriaListado): EventoAuditoriaDto {
  return {
    id: evento.id,
    numero: evento.numero,
    tipo: evento.tipo,
    origen: evento.origen,
    accion: evento.accion,
    entidad_tipo: evento.entidadTipo,
    entidad_id: evento.entidadId,
    usuario: evento.usuario && { id: evento.usuario.id, nombre: evento.usuario.nombre, correo: evento.usuario.correo },
    sucursal: evento.sucursal && { id: evento.sucursal.id, codigo: evento.sucursal.codigo, nombre: evento.sucursal.nombre },
    motivo: evento.motivo,
    finalidad: evento.finalidad,
    ticket: evento.ticket,
    persona_titular_id: evento.personaTitularId,
    ip: evento.ip,
    ocurrido_en: evento.ocurridoEn.toISOString(),
  };
}

export function eventoAuditoriaDetalleDto(evento: DetalleEventoAuditoria): EventoAuditoriaDetalleDto {
  return {
    ...eventoAuditoriaDto(evento),
    antes: evento.antes ?? null,
    despues: evento.despues ?? null,
    cambios: evento.cambios,
    trace_id: evento.traceId,
    event_id: evento.eventId,
    hash_anterior: evento.hashAnterior,
    hash: evento.hash,
  };
}

export function listadoAuditoriaDto(listado: ListadoAuditoria): ListadoAuditoriaDto {
  return { items: listado.items.map(eventoAuditoriaDto), total: listado.total };
}
