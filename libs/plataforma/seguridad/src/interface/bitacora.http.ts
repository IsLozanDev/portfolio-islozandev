import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import type { ConsultaBitacora } from '../application/lecturas-bitacora.js';
import type { AsignadoDelEvento, EventoBitacora, EventoBitacoraDetalle, UsuarioDelEvento } from '../application/ports/lectura-bitacora.js';
import type { Listado } from '../application/ports/lectura-miembros.js';
import { TIPOS_EVENTO_SEGURIDAD } from '../application/ports/repositorios.js';
import { TAMANO_PAGINA_DEFECTO, TAMANO_PAGINA_MAXIMO } from './miembros.http.js';

const LONGITUD_MINIMA_USUARIO = 2;
const LONGITUD_MAXIMA_USUARIO = 100;
/** bigserial: solo dígitos y dentro de bigint. Otro valor no puede existir en el tenant. */
export const ID_EVENTO = /^\d{1,18}$/;

// desde y hasta van sin forma: su ausencia, su orden y los 92 días dan RANGO_BITACORA_INVALIDO en la aplicación.
export const EsquemaConsultarBitacora = z.object({
  desde: z.string().trim().optional(),
  hasta: z.string().trim().optional(),
  tipo: z.enum(TIPOS_EVENTO_SEGURIDAD).optional(),
  usuario: z.string().trim().min(LONGITUD_MINIMA_USUARIO).max(LONGITUD_MAXIMA_USUARIO).optional().or(z.literal('')),
  pagina: z.coerce.number().int().min(1).default(1),
  tamano: z.coerce.number().int().min(1).max(TAMANO_PAGINA_MAXIMO).default(TAMANO_PAGINA_DEFECTO),
});

export function consultaBitacoraDe(consulta: z.infer<typeof EsquemaConsultarBitacora>): ConsultaBitacora {
  return {
    desde: consulta.desde || undefined,
    hasta: consulta.hasta || undefined,
    tipo: consulta.tipo,
    usuario: consulta.usuario || undefined,
    pagina: consulta.pagina,
    tamano: consulta.tamano,
  };
}

export class UsuarioDelEventoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty()
  correo!: string;
}

export class EventoBitacoraDto {
  @ApiProperty({ description: 'bigserial como texto' })
  id!: string;

  @ApiProperty({ enum: TIPOS_EVENTO_SEGURIDAD })
  tipo!: string;

  @ApiProperty({ format: 'date-time' })
  ocurrido_en!: string;

  @ApiPropertyOptional({ type: UsuarioDelEventoDto, nullable: true })
  usuario!: UsuarioDelEventoDto | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Permiso faltante, ticket, o «rol → destinatario» en las asignaciones' })
  resumen!: string | null;
}

const TIPOS_ASIGNADO = ['ROL', 'PERFIL'] as const;

export class AsignadoDelEventoDto {
  @ApiProperty({ enum: TIPOS_ASIGNADO })
  tipo!: string;

  @ApiProperty()
  nombre!: string;
}

export class EventoBitacoraDetalleDto extends EventoBitacoraDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  ip!: string | null;

  @ApiPropertyOptional({ type: UsuarioDelEventoDto, nullable: true, description: 'A quién se le otorgó o revocó, en las asignaciones' })
  destinatario!: UsuarioDelEventoDto | null;

  @ApiPropertyOptional({ type: AsignadoDelEventoDto, nullable: true, description: 'Rol o perfil otorgado o revocado' })
  asignado!: AsignadoDelEventoDto | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  detalle!: Record<string, unknown>;
}

export class ListadoBitacoraDto {
  @ApiProperty({ type: [EventoBitacoraDto] })
  items!: EventoBitacoraDto[];

  @ApiProperty()
  total!: number;
}

const usuarioDto = (usuario: UsuarioDelEvento | null): UsuarioDelEventoDto | null =>
  usuario ? { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo } : null;

const asignadoDto = (asignado: AsignadoDelEvento | null): AsignadoDelEventoDto | null => (asignado ? { tipo: asignado.tipo, nombre: asignado.nombre } : null);

export function eventoBitacoraDto(evento: EventoBitacora): EventoBitacoraDto {
  return {
    id: evento.id,
    tipo: evento.tipo,
    ocurrido_en: evento.ocurridoEn.toISOString(),
    usuario: usuarioDto(evento.usuario),
    resumen: evento.resumen,
  };
}

export function eventoBitacoraDetalleDto(evento: EventoBitacoraDetalle): EventoBitacoraDetalleDto {
  return {
    ...eventoBitacoraDto(evento),
    ip: evento.ip,
    destinatario: usuarioDto(evento.destinatario),
    asignado: asignadoDto(evento.asignado),
    detalle: evento.detalle,
  };
}

export function listadoBitacoraDto(listado: Listado<EventoBitacora>): ListadoBitacoraDto {
  return { items: listado.items.map(eventoBitacoraDto), total: listado.total };
}
