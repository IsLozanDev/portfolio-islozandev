import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { NotFoundError } from '@vitrina/plataforma/kernel';
import { Permiso, PrincipalActual, type Principal } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { CambiarEstadoSerie, type EstadoSerieCambiado } from '../application/cambiar-estado-serie.js';
import { CrearSerie } from '../application/crear-serie.js';
import { ConsultarSerie, ListarSeries, type ConSiguiente } from '../application/lecturas-series.js';
import type { SerieDetalle, SerieListada } from '../application/ports/lectura-series.js';
import { PERMISOS_SEQ } from '../domain/permisos-seq.js';
import { DIGITOS_MAXIMOS, DIGITOS_MINIMOS, REINICIOS, TIPOS_DOCUMENTO } from '../domain/tipos.js';
import { SeriesFiltro, validar } from './series.http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Cota de entrada: el formato real de la serie lo valida el dominio, con su mensaje (TR-CA-091). */
const LONGITUD_MAXIMA_ENTRADA_SERIE = 20;
/** Los query params llegan como texto. */
const BOOLEANOS_TEXTO = ['true', 'false'] as const;

const uuid = z.string().regex(UUID);
const uuidOpcional = uuid.nullish();

const EsquemaListar = z.object({
  empresa_id: uuid.optional(),
  sucursal_id: uuid.optional(),
  tipo: z.enum(TIPOS_DOCUMENTO).optional(),
  activa: z.enum(BOOLEANOS_TEXTO).optional(),
});
const EsquemaCrear = z.object({
  empresa_id: uuid,
  sucursal_id: uuidOpcional,
  unidad_id: uuidOpcional,
  tipo: z.enum(TIPOS_DOCUMENTO),
  serie: z.string().max(LONGITUD_MAXIMA_ENTRADA_SERIE),
  digitos: z.number().int().optional(),
  reinicio: z.enum(REINICIOS),
  ultimo_numero: z.number().int(),
});
const EsquemaEstado = z.object({ activa: z.boolean() });

class SerieDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  empresa_id!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  sucursal_id!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  unidad_id!: string | null;

  @ApiProperty({ enum: TIPOS_DOCUMENTO })
  tipo!: string;

  @ApiProperty({ example: 'B002' })
  serie!: string;

  @ApiProperty({ minimum: DIGITOS_MINIMOS, maximum: DIGITOS_MAXIMOS, example: 8 })
  digitos!: number;

  @ApiProperty({ enum: REINICIOS })
  reinicio!: string;

  @ApiProperty({ description: 'Último número emitido', example: 124 })
  ultimo_numero!: number;

  @ApiProperty({ nullable: true, description: "'2026' (ANUAL), '2026-10-10' (DIARIO) o null (NUNCA)" })
  periodo!: string | null;

  @ApiProperty()
  activa!: boolean;

  @ApiProperty({ example: 'B002-00000125', description: 'Vista previa: no reserva el número' })
  siguiente_formateado!: string;
}

class SerieDetalleDto extends SerieDto {
  @ApiProperty()
  empresa_nombre!: string;

  @ApiProperty({ nullable: true })
  sucursal_nombre!: string | null;

  @ApiProperty({ nullable: true })
  unidad_nombre!: string | null;

  @ApiProperty({ format: 'uuid' })
  creado_por!: string;

  @ApiProperty({ format: 'date-time' })
  creado_en!: string;

  @ApiProperty({ format: 'uuid' })
  modificado_por!: string;

  @ApiProperty({ format: 'date-time' })
  modificado_en!: string;
}

class CrearSerieDto {
  @ApiProperty({ format: 'uuid' })
  empresa_id!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Obligatoria para comprobantes; con unidad, se toma la de la unidad' })
  sucursal_id?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  unidad_id?: string;

  @ApiProperty({ enum: TIPOS_DOCUMENTO })
  tipo!: string;

  @ApiProperty({ example: 'B002', description: 'F### para facturas, B### para boletas, F### o B### para notas (TR-RN-017)' })
  serie!: string;

  @ApiPropertyOptional({ minimum: DIGITOS_MINIMOS, maximum: DIGITOS_MAXIMOS, default: 8, description: '8 en comprobantes' })
  digitos?: number;

  @ApiProperty({ enum: REINICIOS })
  reinicio!: string;

  @ApiProperty({ minimum: 0, description: 'Último número ya emitido: 0 en una serie nueva' })
  ultimo_numero!: number;
}

class CambiarEstadoDto {
  @ApiProperty()
  activa!: boolean;
}

class EstadoSerieDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  activa!: boolean;

  @ApiProperty({ format: 'date-time' })
  modificado_en!: string;

  @ApiProperty({ description: 'false si ya estaba en ese estado: no se escribió ni se publicó' })
  cambiado!: boolean;
}

/** TR-RF-035. Todas con `plat.serie.gestionar`, que es sensible: PermisoGuard exige MFA (TR-RN-009). */
@ApiTags('seq')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO o MFA_REQUERIDA (permiso sensible, TR-RN-009)' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO, SUCURSAL_NO_ASIGNADA o ACTOR_SIN_ALCANCE' })
@UseFilters(SeriesFiltro)
@Controller('seq/series')
export class SeriesController {
  constructor(
    @Inject(ListarSeries) private readonly listarSeries: ListarSeries,
    @Inject(ConsultarSerie) private readonly consultarSerie: ConsultarSerie,
    @Inject(CrearSerie) private readonly crearSerie: CrearSerie,
    @Inject(CambiarEstadoSerie) private readonly cambiarEstadoSerie: CambiarEstadoSerie,
  ) {}

  @Get()
  @Permiso(PERMISOS_SEQ.serieGestionar)
  @ApiQuery({ name: 'empresa_id', required: false })
  @ApiQuery({ name: 'sucursal_id', required: false })
  @ApiQuery({ name: 'tipo', required: false, enum: TIPOS_DOCUMENTO })
  @ApiQuery({ name: 'activa', required: false, enum: [...BOOLEANOS_TEXTO] })
  @ApiOkResponse({ type: [SerieDto] })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  async listar(@Query() consulta: unknown): Promise<SerieDto[]> {
    const filtro = validar(EsquemaListar, consulta);
    const series = await this.listarSeries.ejecutar({
      empresaId: filtro.empresa_id,
      sucursalId: filtro.sucursal_id,
      tipo: filtro.tipo,
      activa: filtro.activa === undefined ? undefined : filtro.activa === 'true',
    });
    return series.map(serieDto);
  }

  @Get(':id')
  @Permiso(PERMISOS_SEQ.serieGestionar)
  @ApiOkResponse({ type: SerieDetalleDto })
  @ApiNotFoundResponse({ description: 'SERIE_NO_ENCONTRADA o NO_ENCONTRADO (id que no es UUID)' })
  async consultar(@Param('id') id: string): Promise<SerieDetalleDto> {
    return serieDetalleDto(await this.consultarSerie.ejecutar(exigirUuid(id)));
  }

  @Post()
  @Permiso(PERMISOS_SEQ.serieGestionar)
  @ApiBody({ type: CrearSerieDto })
  @ApiCreatedResponse({ type: SerieDetalleDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA, SERIE_INVALIDA (TR-CA-091) o AMBITO_INVALIDO' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO (empresa, sucursal o unidad de otro tenant)' })
  @ApiConflictResponse({ description: 'SERIE_DUPLICADA' })
  async crear(@PrincipalActual() principal: Principal, @Body() cuerpo: unknown): Promise<SerieDetalleDto> {
    const datos = validar(EsquemaCrear, cuerpo);
    const serie = await this.crearSerie.ejecutar({
      empresaId: datos.empresa_id,
      sucursalId: datos.sucursal_id,
      unidadId: datos.unidad_id,
      tipo: datos.tipo,
      codigo: datos.serie,
      digitos: datos.digitos,
      reinicio: datos.reinicio,
      ultimoNumero: datos.ultimo_numero,
      actorId: principal.usuarioId,
    });
    // Se relee para devolver el periodo que fijó la base y la vista previa del siguiente número.
    return serieDetalleDto(await this.consultarSerie.ejecutar(serie.id));
  }

  @Put(':id/estado')
  @Permiso(PERMISOS_SEQ.serieGestionar)
  @HttpCode(200)
  @ApiBody({ type: CambiarEstadoDto })
  @ApiOkResponse({ type: EstadoSerieDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  @ApiNotFoundResponse({ description: 'SERIE_NO_ENCONTRADA o NO_ENCONTRADO (id que no es UUID)' })
  @ApiConflictResponse({ description: 'Cambio concurrente' })
  async cambiarEstado(@PrincipalActual() principal: Principal, @Param('id') id: string, @Body() cuerpo: unknown): Promise<EstadoSerieDto> {
    const serieId = exigirUuid(id);
    const datos = validar(EsquemaEstado, cuerpo);
    return estadoDto(await this.cambiarEstadoSerie.ejecutar({ serieId, activa: datos.activa, actorId: principal.usuarioId }));
  }
}

/** Un id que no es UUID no puede existir: 404 sin llegar al caso de uso. */
function exigirUuid(id: string): string {
  if (!UUID.test(id)) throw new NotFoundError('La serie no existe');
  return id;
}

function serieDto(serie: ConSiguiente<SerieListada>): SerieDto {
  return {
    id: serie.id,
    empresa_id: serie.empresaId,
    sucursal_id: serie.sucursalId,
    unidad_id: serie.unidadId,
    tipo: serie.tipo,
    serie: serie.serie,
    digitos: serie.digitos,
    reinicio: serie.reinicio,
    ultimo_numero: serie.ultimoNumero,
    periodo: serie.periodo,
    activa: serie.activa,
    siguiente_formateado: serie.siguienteFormateado,
  };
}

function serieDetalleDto(serie: ConSiguiente<SerieDetalle>): SerieDetalleDto {
  return {
    ...serieDto(serie),
    empresa_nombre: serie.empresaNombre,
    sucursal_nombre: serie.sucursalNombre,
    unidad_nombre: serie.unidadNombre,
    creado_por: serie.creadoPor,
    creado_en: serie.creadoEn.toISOString(),
    modificado_por: serie.modificadoPor,
    modificado_en: serie.modificadoEn.toISOString(),
  };
}

function estadoDto(estado: EstadoSerieCambiado): EstadoSerieDto {
  return { id: estado.id, activa: estado.activa, modificado_en: estado.modificadoEn.toISOString(), cambiado: estado.cambiado };
}
