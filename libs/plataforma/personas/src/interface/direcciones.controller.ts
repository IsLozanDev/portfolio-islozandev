import { Body, Controller, Delete, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query, UseFilters } from '@nestjs/common';
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
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Permiso } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { AgregarDireccion } from '../application/agregar-direccion.js';
import { EditarDireccion } from '../application/editar-direccion.js';
import { EliminarDireccion } from '../application/eliminar-direccion.js';
import { PERMISOS_PER } from '../domain/permisos-per.js';
import { AgregarDireccionDto, EditarDireccionDto } from './direcciones.dto.js';
import {
  EsquemaPersonaId,
  EsquemaVersionEnConsulta,
  LONGITUD_MAXIMA_NUMERO,
  LONGITUD_MAXIMA_TEXTO,
  texto,
  textoOpcional,
  versionLeida,
} from './esquemas.js';
import { ErrorPersonaDto, PersonaDetalleDto, personaDetalleDto } from './personas.dto.js';
import { PersonasFiltro, validar } from './personas.http.js';

const direccion = texto(LONGITUD_MAXIMA_TEXTO);
const ubigeo = texto(LONGITUD_MAXIMA_NUMERO);
const EsquemaDireccionId = EsquemaPersonaId.extend({ direccionId: z.uuid() });
const EsquemaAgregar = z.object({ direccion, referencia: textoOpcional, ubigeo, principal: z.boolean().optional() });
const EsquemaEditar = z.object({
  version: versionLeida,
  direccion: direccion.optional(),
  referencia: textoOpcional,
  ubigeo: ubigeo.optional(),
  principal: z.boolean().optional(),
});

const NO_ENCONTRADA = 'NO_ENCONTRADA (también si la persona es de otro tenant) o DIRECCION_NO_ENCONTRADA';
const DIRECCION_RECHAZADA = 'DIRECCION_INVALIDA (longitudes o ubigeo sin 6 dígitos) o UBIGEO_NO_VIGENTE (no está vigente en el catálogo)';

/** TR-RF-041: direcciones de una persona, con ubigeo del catálogo `UBIGEO` y una sola principal. */
@ApiTags('personas')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (campos faltantes, demasiado largos o fuera de lista)' })
@UseFilters(PersonasFiltro)
@Controller('personas/:id/direcciones')
export class DireccionesPersonaController {
  constructor(
    @Inject(AgregarDireccion) private readonly agregarDireccion: AgregarDireccion,
    @Inject(EditarDireccion) private readonly editarDireccion: EditarDireccion,
    @Inject(EliminarDireccion) private readonly eliminarDireccion: EliminarDireccion,
  ) {}

  @Post()
  @Permiso(PERMISOS_PER.editar)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: AgregarDireccionDto })
  @ApiCreatedResponse({
    type: PersonaDetalleDto,
    description: 'La persona con la dirección nueva, su distrito, provincia y departamento, y su versión nueva',
  })
  @ApiUnprocessableEntityResponse({ type: ErrorPersonaDto, description: DIRECCION_RECHAZADA })
  @ApiNotFoundResponse({ type: ErrorPersonaDto, description: 'NO_ENCONTRADA, también si es de otro tenant' })
  @ApiConflictResponse({ type: ErrorPersonaDto, description: 'conflict: otra operación cambió la persona' })
  async agregar(@Param() parametros: unknown, @Body() cuerpo: unknown): Promise<PersonaDetalleDto> {
    const { id } = validar(EsquemaPersonaId, parametros);
    const datos = validar(EsquemaAgregar, cuerpo);
    return personaDetalleDto(await this.agregarDireccion.ejecutar({ personaId: id, ...datos }));
  }

  @Patch(':direccionId')
  @Permiso(PERMISOS_PER.editar)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'direccionId', format: 'uuid' })
  @ApiBody({ type: EditarDireccionDto })
  @ApiOkResponse({ type: PersonaDetalleDto, description: 'La persona con su versión nueva; si nada cambió, la misma versión' })
  @ApiUnprocessableEntityResponse({ type: ErrorPersonaDto, description: DIRECCION_RECHAZADA })
  @ApiNotFoundResponse({ type: ErrorPersonaDto, description: NO_ENCONTRADA })
  @ApiConflictResponse({ type: ErrorPersonaDto, description: 'VERSION_OBSOLETA, o conflict si otra operación cambió la persona' })
  async editar(@Param() parametros: unknown, @Body() cuerpo: unknown): Promise<PersonaDetalleDto> {
    const { id, direccionId } = validar(EsquemaDireccionId, parametros);
    const datos = validar(EsquemaEditar, cuerpo);
    return personaDetalleDto(await this.editarDireccion.ejecutar({ personaId: id, direccionId, ...datos }));
  }

  @Delete(':direccionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permiso(PERMISOS_PER.editar)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'direccionId', format: 'uuid' })
  @ApiQuery({ name: 'version', required: true, description: 'Versión de la persona que se leyó' })
  @ApiNoContentResponse({ description: 'Dirección borrada: la fila se elimina y el rastro queda en auditoría' })
  @ApiNotFoundResponse({ type: ErrorPersonaDto, description: NO_ENCONTRADA })
  @ApiConflictResponse({ type: ErrorPersonaDto, description: 'VERSION_OBSOLETA, o conflict si otra operación cambió la persona' })
  async eliminar(@Param() parametros: unknown, @Query() consulta: unknown): Promise<void> {
    const { id, direccionId } = validar(EsquemaDireccionId, parametros);
    const { version } = validar(EsquemaVersionEnConsulta, consulta);
    await this.eliminarDireccion.ejecutar({ personaId: id, direccionId, version: Number(version) });
  }
}
