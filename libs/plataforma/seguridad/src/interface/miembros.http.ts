import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ORDENES_MIEMBROS,
  type AsignacionDelMiembro,
  type Asignables,
  type FiltroMiembros,
  type Listado,
  type MiembroDetalle,
  type MiembroListado,
  type Referencia,
} from '../application/ports/lectura-miembros.js';
import { ALCANCES } from '../domain/alcance.js';
import { ESTADOS_ASIGNACION } from '../domain/asignacion.js';

export const TAMANO_PAGINA_DEFECTO = 20;
export const TAMANO_PAGINA_MAXIMO = 100;
export const ESTADOS_MEMBRESIA = ['INVITADO', 'ACTIVO', 'SUSPENDIDO', 'FINALIZADO'] as const;
export const DIRECCIONES = ['asc', 'desc'] as const;
/** Igual que `seg.usuario.email`, la columna más larga en la que se busca. */
const LONGITUD_MAXIMA_BUSQUEDA = 255;

const uuidNulo = z.uuid().nullable().optional().default(null);
// Solo la forma: la fecha calendario y TR-RN-008 las valida el dominio, con sus mensajes.
const fechaNula = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional()
  .default(null);

export const EsquemaOtorgarAsignacion = z.object({
  membresia_id: z.uuid(),
  rol_id: uuidNulo,
  perfil_id: uuidNulo,
  alcance: z.enum(ALCANCES),
  empresa_id: uuidNulo,
  sucursal_id: uuidNulo,
  unidad_id: uuidNulo,
  vigente_desde: fechaNula,
  vigente_hasta: fechaNula,
});

export const EsquemaListarMiembros = z.object({
  estado: z.enum(ESTADOS_MEMBRESIA).optional(),
  busqueda: z.string().trim().max(LONGITUD_MAXIMA_BUSQUEDA).optional(),
  orden: z.enum(ORDENES_MIEMBROS).default('nombre'),
  direccion: z.enum(DIRECCIONES).default('asc'),
  pagina: z.coerce.number().int().min(1).default(1),
  tamano: z.coerce.number().int().min(1).max(TAMANO_PAGINA_MAXIMO).default(TAMANO_PAGINA_DEFECTO),
});

export function filtroMiembrosDe(consulta: z.infer<typeof EsquemaListarMiembros>): FiltroMiembros {
  return {
    estado: consulta.estado,
    busqueda: consulta.busqueda || undefined,
    orden: consulta.orden,
    direccion: consulta.direccion,
    pagina: consulta.pagina,
    tamano: consulta.tamano,
  };
}

export class MiembroDto {
  @ApiProperty({ format: 'uuid' })
  membresia_id!: string;

  @ApiProperty({ format: 'uuid' })
  usuario_id!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty()
  correo!: string;

  @ApiProperty({ enum: ESTADOS_MEMBRESIA })
  estado!: string;

  @ApiProperty()
  es_propietario!: boolean;

  @ApiProperty({ description: 'No revocadas y vigentes hoy (America/Lima)' })
  asignaciones_vigentes!: number;

  @ApiProperty({ format: 'date-time', nullable: true, type: String, description: 'Solo con una invitación pendiente' })
  invitacion_expira_en!: string | null;
}

export class ListadoMiembrosDto {
  @ApiProperty({ type: [MiembroDto] })
  items!: MiembroDto[];

  @ApiProperty()
  total!: number;
}

export class ReferenciaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  nombre!: string;
}

export class AsignacionDelMiembroDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: ReferenciaDto, nullable: true })
  rol!: ReferenciaDto | null;

  @ApiPropertyOptional({ type: ReferenciaDto, nullable: true })
  perfil!: ReferenciaDto | null;

  @ApiProperty({ enum: ALCANCES })
  alcance!: string;

  @ApiPropertyOptional({ type: ReferenciaDto, nullable: true, description: 'El nombre es la razón social' })
  empresa!: ReferenciaDto | null;

  @ApiPropertyOptional({ type: ReferenciaDto, nullable: true })
  sucursal!: ReferenciaDto | null;

  @ApiPropertyOptional({ type: ReferenciaDto, nullable: true })
  unidad!: ReferenciaDto | null;

  @ApiProperty({ format: 'date' })
  vigente_desde!: string;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  vigente_hasta!: string | null;

  @ApiProperty({ enum: ESTADOS_ASIGNACION })
  estado!: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  revocada_en!: string | null;

  @ApiProperty({ nullable: true, type: String })
  motivo_revocacion!: string | null;
}

export class MiembroDetalleDto extends MiembroDto {
  @ApiProperty({ format: 'date-time' })
  desde!: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  hasta!: string | null;

  @ApiProperty({ type: [AsignacionDelMiembroDto], description: 'Por estado (VIGENTE, FUTURA, VENCIDA, REVOCADA) y de la más reciente a la más antigua' })
  asignaciones!: AsignacionDelMiembroDto[];
}

export class PerfilAsignableDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  codigo!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty({ description: 'Tiene algún permiso sensible: asignarlo exige MFA reciente (TR-RN-009)' })
  sensible!: boolean;
}

export class RolAsignableDto extends PerfilAsignableDto {
  @ApiProperty()
  producto_codigo!: string;
}

export class AsignablesDto {
  @ApiProperty({ type: [RolAsignableDto] })
  roles!: RolAsignableDto[];

  @ApiProperty({ type: [PerfilAsignableDto] })
  perfiles!: PerfilAsignableDto[];
}

export class OtorgarAsignacionDto {
  @ApiProperty({ format: 'uuid' })
  membresia_id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String, description: 'Rol o perfil, uno de los dos (TR-RN-008)' })
  rol_id?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  perfil_id?: string | null;

  @ApiProperty({ enum: ALCANCES })
  alcance!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  empresa_id?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  sucursal_id?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  unidad_id?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String, description: 'Por defecto, hoy en America/Lima' })
  vigente_desde?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String, description: 'No anterior a vigente_desde' })
  vigente_hasta?: string | null;
}

export class AsignacionOtorgadaDto {
  @ApiProperty({ format: 'uuid' })
  asignacion_id!: string;
}

function instante(fecha: Date | null): string | null {
  return fecha === null ? null : fecha.toISOString();
}

function referenciaDto(referencia: Referencia | null): ReferenciaDto | null {
  return referencia === null ? null : { id: referencia.id, nombre: referencia.nombre };
}

export function miembroDto(miembro: MiembroListado): MiembroDto {
  return {
    membresia_id: miembro.membresiaId,
    usuario_id: miembro.usuarioId,
    nombre: miembro.nombre,
    correo: miembro.correo,
    estado: miembro.estado,
    es_propietario: miembro.esPropietario,
    asignaciones_vigentes: miembro.asignacionesVigentes,
    invitacion_expira_en: instante(miembro.invitacionExpiraEn),
  };
}

export function listadoMiembrosDto(listado: Listado<MiembroListado>): ListadoMiembrosDto {
  return { items: listado.items.map(miembroDto), total: listado.total };
}

function asignacionDelMiembroDto(asignacion: AsignacionDelMiembro): AsignacionDelMiembroDto {
  return {
    id: asignacion.id,
    rol: referenciaDto(asignacion.rol),
    perfil: referenciaDto(asignacion.perfil),
    alcance: asignacion.alcance,
    empresa: referenciaDto(asignacion.empresa),
    sucursal: referenciaDto(asignacion.sucursal),
    unidad: referenciaDto(asignacion.unidad),
    vigente_desde: asignacion.vigenteDesde,
    vigente_hasta: asignacion.vigenteHasta,
    estado: asignacion.estado,
    revocada_en: instante(asignacion.revocadaEn),
    motivo_revocacion: asignacion.motivoRevocacion,
  };
}

export function miembroDetalleDto(detalle: MiembroDetalle): MiembroDetalleDto {
  return {
    ...miembroDto(detalle),
    desde: detalle.desde.toISOString(),
    hasta: instante(detalle.hasta),
    asignaciones: detalle.asignaciones.map(asignacionDelMiembroDto),
  };
}

export function asignablesDto(asignables: Asignables): AsignablesDto {
  return {
    roles: asignables.roles.map((rol) => ({ id: rol.id, codigo: rol.codigo, nombre: rol.nombre, producto_codigo: rol.productoCodigo, sensible: rol.sensible })),
    perfiles: asignables.perfiles.map((perfil) => ({ id: perfil.id, codigo: perfil.codigo, nombre: perfil.nombre, sensible: perfil.sensible })),
  };
}
