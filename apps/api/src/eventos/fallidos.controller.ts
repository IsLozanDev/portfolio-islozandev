import { Body, Controller, Get, HttpCode, Inject, Post, Query, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiProperty,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ESTADOS_FALLIDO,
  LIMITE_FALLIDOS_POR_DEFECTO,
  LIMITE_MAXIMO_FALLIDOS,
  ListarFallidos,
  PERMISOS_EVT,
  ReprocesarFallidos,
  type EventoFallido,
  type MotivoOmision,
} from '@vitrina/plataforma/eventos';
import { Permiso, PrincipalActual, type Principal } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { FallidosFiltro, validar } from './fallidos.http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `sync.evento_fallido.consumidor` es varchar(40); `event_type` llega hasta 60 en el outbox. */
const LONGITUD_MAXIMA_CONSUMIDOR = 40;
const LONGITUD_MAXIMA_TIPO = 60;
const MINIMO_IDS = 1;
const MAXIMO_IDS = 100;
const MOTIVOS_OMISION: MotivoOmision[] = ['NO_ENCONTRADO', 'NO_FALLIDO'];

const EsquemaListar = z.object({
  consumidor: z.string().max(LONGITUD_MAXIMA_CONSUMIDOR).optional(),
  event_type: z.string().max(LONGITUD_MAXIMA_TIPO).optional(),
  estado: z.enum(ESTADOS_FALLIDO).optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO_FALLIDOS).optional(),
});
const EsquemaReprocesar = z.object({ ids: z.array(z.string().regex(UUID)).min(MINIMO_IDS).max(MAXIMO_IDS) });

/** Sin el payload del evento (TR-RNF-026). */
class FallidoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'prueba-a' })
  consumidor!: string;

  @ApiProperty({ format: 'uuid' })
  event_id!: string;

  @ApiProperty({ example: 'cita.creada' })
  event_type!: string;

  @ApiProperty({ example: 'cita' })
  aggregate_type!: string;

  @ApiProperty({ format: 'uuid' })
  aggregate_id!: string;

  @ApiProperty({ description: 'Último error, hasta 1 000 caracteres' })
  error!: string;

  @ApiProperty({ description: 'Intentos acumulados, reprocesos incluidos' })
  intentos!: number;

  @ApiProperty({ enum: ESTADOS_FALLIDO })
  estado!: string;

  @ApiProperty({ format: 'date-time' })
  fallido_en!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  reprocesado_por!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  reprocesado_en!: string | null;
}

class ReprocesarDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: MINIMO_IDS, maxItems: MAXIMO_IDS })
  ids!: string[];
}

class OmitidoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: MOTIVOS_OMISION, description: 'NO_ENCONTRADO: no existe, es de otro tenant o su evento ya no está en el outbox' })
  motivo!: string;
}

class ResultadoReprocesoDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Ids que se volvieron a encolar' })
  reprocesados!: string[];

  @ApiProperty({ type: [OmitidoDto] })
  omitidos!: OmitidoDto[];
}

/** TR-RF-095. Vive en apps/api: comp:evt no puede importar seguridad (PL-10). PermisoGuard exige X-Sucursal-Id. */
@ApiTags('evt')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO o MFA_REQUERIDA (permiso sensible, TR-RN-009)' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@UseFilters(FallidosFiltro)
@Controller('evt/fallidos')
export class FallidosController {
  constructor(
    @Inject(ListarFallidos) private readonly listarFallidos: ListarFallidos,
    @Inject(ReprocesarFallidos) private readonly reprocesarFallidos: ReprocesarFallidos,
  ) {}

  @Get()
  @Permiso(PERMISOS_EVT.eventoConsultar)
  @ApiQuery({ name: 'consumidor', required: false, example: 'prueba-a' })
  @ApiQuery({ name: 'event_type', required: false, example: 'cita.creada' })
  @ApiQuery({ name: 'estado', required: false, enum: ESTADOS_FALLIDO, description: 'FALLIDO por defecto' })
  @ApiQuery({ name: 'limite', required: false, description: `${LIMITE_FALLIDOS_POR_DEFECTO} por defecto, hasta ${LIMITE_MAXIMO_FALLIDOS}` })
  @ApiOkResponse({ type: [FallidoDto], description: 'Del tenant del token, los más recientes primero' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  async listar(@Query() consulta: unknown): Promise<FallidoDto[]> {
    const filtro = validar(EsquemaListar, consulta);
    const fallidos = await this.listarFallidos.ejecutar({ consumidor: filtro.consumidor, eventType: filtro.event_type, estado: filtro.estado, limite: filtro.limite });
    return fallidos.map(fallidoDto);
  }

  @Post('reprocesar')
  @Permiso(PERMISOS_EVT.eventoReprocesar)
  @HttpCode(200)
  @ApiBody({ type: ReprocesarDto })
  @ApiOkResponse({ type: ResultadoReprocesoDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (de 1 a 100 ids UUID)' })
  @ApiConflictResponse({ description: 'CONFLICTO: otro reproceso cambió un fallido a la vez' })
  reprocesar(@PrincipalActual() principal: Principal, @Body() cuerpo: unknown): Promise<ResultadoReprocesoDto> {
    const { ids } = validar(EsquemaReprocesar, cuerpo);
    return this.reprocesarFallidos.ejecutar({ ids, actorId: principal.usuarioId });
  }
}

function fallidoDto(fallido: EventoFallido): FallidoDto {
  return {
    id: fallido.id,
    consumidor: fallido.consumidor,
    event_id: fallido.eventId,
    event_type: fallido.eventType,
    aggregate_type: fallido.aggregateType,
    aggregate_id: fallido.aggregateId,
    error: fallido.error,
    intentos: fallido.intentos,
    estado: fallido.estado,
    fallido_en: fallido.fallidoEn.toISOString(),
    reprocesado_por: fallido.reprocesadoPor,
    reprocesado_en: fallido.reprocesadoEn?.toISOString() ?? null,
  };
}
