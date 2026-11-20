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
import { AgregarContacto } from '../application/agregar-contacto.js';
import { EditarContacto } from '../application/editar-contacto.js';
import { EliminarContacto } from '../application/eliminar-contacto.js';
import { TIPOS_CONTACTO } from '../domain/contacto.js';
import { PERMISOS_PER } from '../domain/permisos-per.js';
import { AgregarContactoDto, EditarContactoDto } from './contactos.dto.js';
import { EsquemaPersonaId, EsquemaVersionEnConsulta, LONGITUD_MAXIMA_TEXTO, texto, versionLeida } from './esquemas.js';
import { ErrorPersonaDto, PersonaDetalleDto, personaDetalleDto } from './personas.dto.js';
import { PersonasFiltro, validar } from './personas.http.js';

const valor = texto(LONGITUD_MAXIMA_TEXTO);
const EsquemaContactoId = EsquemaPersonaId.extend({ contactoId: z.uuid() });
const EsquemaAgregar = z.object({ tipo: z.enum(TIPOS_CONTACTO), valor, principal: z.boolean().optional() });
const EsquemaEditar = z.object({ version: versionLeida, valor: valor.optional(), principal: z.boolean().optional() });

const NO_ENCONTRADA = 'NO_ENCONTRADA (también si la persona es de otro tenant) o CONTACTO_NO_ENCONTRADO';

/** TR-RF-041: contactos de una persona. Un principal por tipo y siempre un celular principal. */
@ApiTags('personas')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (campos faltantes, demasiado largos o fuera de lista)' })
@UseFilters(PersonasFiltro)
@Controller('personas/:id/contactos')
export class ContactosPersonaController {
  constructor(
    @Inject(AgregarContacto) private readonly agregarContacto: AgregarContacto,
    @Inject(EditarContacto) private readonly editarContacto: EditarContacto,
    @Inject(EliminarContacto) private readonly eliminarContacto: EliminarContacto,
  ) {}

  @Post()
  @Permiso(PERMISOS_PER.editar)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: AgregarContactoDto })
  @ApiCreatedResponse({ type: PersonaDetalleDto, description: 'La persona con el contacto nuevo y su versión nueva' })
  @ApiUnprocessableEntityResponse({ type: ErrorPersonaDto, description: 'CONTACTO_INVALIDO, con el formato esperado en el mensaje' })
  @ApiNotFoundResponse({ type: ErrorPersonaDto, description: 'NO_ENCONTRADA, también si es de otro tenant' })
  @ApiConflictResponse({ type: ErrorPersonaDto, description: 'CONTACTO_DUPLICADO, o conflict si otra operación cambió la persona' })
  async agregar(@Param() parametros: unknown, @Body() cuerpo: unknown): Promise<PersonaDetalleDto> {
    const { id } = validar(EsquemaPersonaId, parametros);
    const datos = validar(EsquemaAgregar, cuerpo);
    return personaDetalleDto(await this.agregarContacto.ejecutar({ personaId: id, ...datos }));
  }

  @Patch(':contactoId')
  @Permiso(PERMISOS_PER.editar)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'contactoId', format: 'uuid' })
  @ApiBody({ type: EditarContactoDto })
  @ApiOkResponse({ type: PersonaDetalleDto, description: 'La persona con su versión nueva; si nada cambió, la misma versión' })
  @ApiUnprocessableEntityResponse({ type: ErrorPersonaDto, description: 'CONTACTO_INVALIDO o CELULAR_PRINCIPAL_OBLIGATORIO' })
  @ApiNotFoundResponse({ type: ErrorPersonaDto, description: NO_ENCONTRADA })
  @ApiConflictResponse({
    type: ErrorPersonaDto,
    description: 'VERSION_OBSOLETA, CONTACTO_DUPLICADO, o conflict si otra operación cambió la persona',
  })
  async editar(@Param() parametros: unknown, @Body() cuerpo: unknown): Promise<PersonaDetalleDto> {
    const { id, contactoId } = validar(EsquemaContactoId, parametros);
    const datos = validar(EsquemaEditar, cuerpo);
    return personaDetalleDto(await this.editarContacto.ejecutar({ personaId: id, contactoId, ...datos }));
  }

  @Delete(':contactoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permiso(PERMISOS_PER.editar)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'contactoId', format: 'uuid' })
  @ApiQuery({ name: 'version', required: true, description: 'Versión de la persona que se leyó' })
  @ApiNoContentResponse({ description: 'Contacto borrado: la fila se elimina y el rastro queda en auditoría' })
  @ApiUnprocessableEntityResponse({ type: ErrorPersonaDto, description: 'CELULAR_PRINCIPAL_OBLIGATORIO' })
  @ApiNotFoundResponse({ type: ErrorPersonaDto, description: NO_ENCONTRADA })
  @ApiConflictResponse({ type: ErrorPersonaDto, description: 'VERSION_OBSOLETA, o conflict si otra operación cambió la persona' })
  async eliminar(@Param() parametros: unknown, @Query() consulta: unknown): Promise<void> {
    const { id, contactoId } = validar(EsquemaContactoId, parametros);
    const { version } = validar(EsquemaVersionEnConsulta, consulta);
    await this.eliminarContacto.ejecutar({ personaId: id, contactoId, version: Number(version) });
  }
}
