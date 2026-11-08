import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Query, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permiso, PrincipalActual, type Principal } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { ActualizarFeriado } from '../application/feriados/actualizar-feriado.js';
import { CrearFeriado } from '../application/feriados/crear-feriado.js';
import { EliminarFeriado } from '../application/feriados/eliminar-feriado.js';
import { ListarFeriados } from '../application/feriados/listar-feriados.js';
import type { FeriadoDelAnio, FeriadoGuardado } from '../application/feriados/resultados.js';
import type { Actualizado } from '../application/resultados.js';
import { FeriadoNoEncontradoError } from '../domain/feriados/errores.js';
import { ALCANCES_FERIADO } from '../domain/feriados/tipos.js';
import { PERMISOS_CAT } from '../domain/permisos-cat.js';
import { CatalogosFiltro, validar } from './catalogos.http.js';
import { ActualizarFeriadoDto, CrearFeriadoDto, FeriadoActualizadoDto, FeriadoDelAnioDto, FeriadoDto } from './feriados.dto.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ANIO_MINIMO = 2000;
const ANIO_MAXIMO = 2100;
// Cota de entrada: el mínimo de 3 lo valida el dominio, con su mensaje.
const NOMBRE_MAXIMO = 100;

const uuid = z.string().regex(UUID);
const fecha = z.string().regex(FECHA);
const nombre = z.string().max(NOMBRE_MAXIMO);

const EsquemaListar = z.object({
  anio: z.coerce.number().int().min(ANIO_MINIMO).max(ANIO_MAXIMO),
  sucursal_id: uuid.optional(),
});
const EsquemaCrear = z.object({
  alcance: z.enum(ALCANCES_FERIADO),
  sucursal_id: uuid.nullish(),
  fecha,
  nombre,
  recurrente_anual: z.boolean(),
});
const EsquemaActualizar = z.object({
  fecha,
  nombre,
  recurrente_anual: z.boolean(),
  version: z.number().int().min(0),
  alcance: z.enum(ALCANCES_FERIADO).optional(),
  sucursal_id: uuid.nullish(),
});
const EsquemaEliminar = z.object({ version: z.string().regex(/^\d+$/) });

/**
 * TR-RF-029. Los feriados del tenant y de sus sucursales los gestiona el tenant del token; los GLOBAL, solo el
 * tenant operador (TR-RN-012): crearlos fuera de él da 403 y editarlos o borrarlos, 404.
 */
@ApiTags('feriados')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO, SUCURSAL_NO_ASIGNADA u OPERADOR_REQUERIDO (crear un GLOBAL)' })
@UseFilters(CatalogosFiltro)
@Controller('feriados')
export class FeriadosController {
  constructor(
    @Inject(ListarFeriados) private readonly listarFeriados: ListarFeriados,
    @Inject(CrearFeriado) private readonly crearFeriado: CrearFeriado,
    @Inject(ActualizarFeriado) private readonly actualizarFeriado: ActualizarFeriado,
    @Inject(EliminarFeriado) private readonly eliminarFeriado: EliminarFeriado,
  ) {}

  @Get()
  @Permiso(PERMISOS_CAT.feriadoGestionar)
  @ApiQuery({ name: 'anio', required: true, example: 2027, description: 'De 2000 a 2100' })
  @ApiQuery({ name: 'sucursal_id', required: false, description: 'Sin ella, los de todas las sucursales del tenant' })
  @ApiOkResponse({ type: [FeriadoDelAnioDto], description: 'Los que aplican en el año, con los recurrentes proyectados y por fecha' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  async listar(@Query() consulta: unknown): Promise<FeriadoDelAnioDto[]> {
    const datos = validar(EsquemaListar, consulta);
    const feriados = await this.listarFeriados.ejecutar({ anio: datos.anio, sucursalId: datos.sucursal_id ?? null });
    return feriados.map(feriadoDelAnioDto);
  }

  @Post()
  @Permiso(PERMISOS_CAT.feriadoGestionar)
  @ApiBody({ type: CrearFeriadoDto })
  @ApiCreatedResponse({ type: FeriadoDto, description: 'Nace en versión 0' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA o FERIADO_INVALIDO' })
  @ApiNotFoundResponse({ description: 'SUCURSAL_NO_ENCONTRADA (no existe o es de otro tenant)' })
  @ApiConflictResponse({ description: 'FERIADO_DUPLICADO: «La fecha ya está registrada como feriado» (TR-CA-077)' })
  async crear(@PrincipalActual() principal: Principal, @Body() cuerpo: unknown): Promise<FeriadoDto> {
    const datos = validar(EsquemaCrear, cuerpo);
    const feriado = await this.crearFeriado.ejecutar({
      alcance: datos.alcance,
      sucursalId: datos.sucursal_id ?? null,
      fecha: datos.fecha,
      nombre: datos.nombre,
      recurrenteAnual: datos.recurrente_anual,
      actorId: principal.usuarioId,
    });
    return feriadoDto(feriado);
  }

  @Put(':id')
  @Permiso(PERMISOS_CAT.feriadoGestionar)
  @ApiBody({ type: ActualizarFeriadoDto })
  @ApiOkResponse({ type: FeriadoActualizadoDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA o FERIADO_INVALIDO (también al cambiar el alcance)' })
  @ApiNotFoundResponse({ description: 'FERIADO_NO_ENCONTRADO (de otro tenant, o GLOBAL fuera del operador)' })
  @ApiConflictResponse({ description: 'FERIADO_DUPLICADO o VERSION_OBSOLETA' })
  async actualizar(@PrincipalActual() principal: Principal, @Param('id') id: string, @Body() cuerpo: unknown): Promise<FeriadoActualizadoDto> {
    const feriadoId = exigirUuid(id);
    const datos = validar(EsquemaActualizar, cuerpo);
    const feriado = await this.actualizarFeriado.ejecutar({
      feriadoId,
      fecha: datos.fecha,
      nombre: datos.nombre,
      recurrenteAnual: datos.recurrente_anual,
      version: datos.version,
      alcance: datos.alcance,
      sucursalId: datos.sucursal_id,
      actorId: principal.usuarioId,
    });
    return feriadoActualizadoDto(feriado);
  }

  @Delete(':id')
  @Permiso(PERMISOS_CAT.feriadoGestionar)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiQuery({ name: 'version', required: true })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  @ApiNotFoundResponse({ description: 'FERIADO_NO_ENCONTRADO (de otro tenant, o GLOBAL fuera del operador)' })
  @ApiConflictResponse({ description: 'VERSION_OBSOLETA' })
  async eliminar(@PrincipalActual() principal: Principal, @Param('id') id: string, @Query() consulta: unknown): Promise<void> {
    const feriadoId = exigirUuid(id);
    const { version } = validar(EsquemaEliminar, consulta);
    await this.eliminarFeriado.ejecutar({ feriadoId, version: Number(version), actorId: principal.usuarioId });
  }
}

/** Un id que no es UUID no puede existir: 404 sin llegar al caso de uso. */
function exigirUuid(id: string): string {
  if (!UUID.test(id)) throw new FeriadoNoEncontradoError();
  return id;
}

function feriadoDto(feriado: FeriadoGuardado): FeriadoDto {
  return {
    id: feriado.id,
    alcance: feriado.alcance,
    sucursal_id: feriado.sucursalId,
    fecha: feriado.fecha,
    nombre: feriado.nombre,
    recurrente_anual: feriado.recurrenteAnual,
    version: feriado.version,
  };
}

function feriadoDelAnioDto(feriado: FeriadoDelAnio): FeriadoDelAnioDto {
  return { ...feriadoDto(feriado), fecha_en_anio: feriado.fechaEnAnio, editable: feriado.editable };
}

function feriadoActualizadoDto(feriado: Actualizado<FeriadoGuardado>): FeriadoActualizadoDto {
  return { ...feriadoDto(feriado), cambiado: feriado.cambiado };
}
