import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Query, UseFilters } from '@nestjs/common';
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
import { ConsultarUnidad, EditarUnidad, InactivarUnidad, ListarUnidades, PERMISOS_ORG, RegistrarUnidad, TIPOS_UNIDAD } from '@vitrina/plataforma/org';
import { Permiso } from '@vitrina/plataforma/seguridad';
import { validar } from '../eventos/fallidos.http.js';
import { OrgFiltro } from './org.filtro.js';
import {
  activoDe,
  EditarUnidadDto,
  EsquemaEditarUnidad,
  EsquemaListarUnidades,
  EsquemaRegistrarUnidad,
  exigirUuid,
  ListadoUnidadesDto,
  listadoDto,
  paginaDe,
  RegistrarUnidadDto,
  TAMANO_PAGINA_DEFECTO,
  TAMANO_PAGINA_MAXIMO,
  UnidadDto,
  unidadDto,
  UnidadRegistradaDto,
} from './organizacion.http.js';

const UNIDAD_NO_EXISTE = 'La unidad no existe';

/** TR-RF-004 en el tenant del token. Vive en apps/api: org no importa seguridad (PL-10). */
@ApiTags('org')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@UseFilters(OrgFiltro)
@Controller('org/unidades')
export class UnidadesController {
  constructor(
    @Inject(ListarUnidades) private readonly listarUnidades: ListarUnidades,
    @Inject(ConsultarUnidad) private readonly consultarUnidad: ConsultarUnidad,
    @Inject(RegistrarUnidad) private readonly registrarUnidad: RegistrarUnidad,
    @Inject(EditarUnidad) private readonly editarUnidad: EditarUnidad,
    @Inject(InactivarUnidad) private readonly inactivarUnidad: InactivarUnidad,
  ) {}

  @Get()
  @Permiso(PERMISOS_ORG.organizacionConsultar)
  @ApiQuery({ name: 'empresa_id', required: false })
  @ApiQuery({ name: 'sucursal_id', required: false })
  @ApiQuery({ name: 'tipo', required: false, enum: TIPOS_UNIDAD })
  @ApiQuery({ name: 'activo', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'pagina', required: false, example: 1 })
  @ApiQuery({ name: 'tamano', required: false, example: TAMANO_PAGINA_DEFECTO, description: `Máximo ${TAMANO_PAGINA_MAXIMO}` })
  @ApiOkResponse({ type: ListadoUnidadesDto, description: 'Por tipo y código' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  async listar(@Query() consulta: unknown): Promise<ListadoUnidadesDto> {
    const filtro = validar(EsquemaListarUnidades, consulta);
    const unidades = await this.listarUnidades.ejecutar({
      ...paginaDe(filtro),
      empresaId: filtro.empresa_id,
      sucursalId: filtro.sucursal_id,
      tipo: filtro.tipo,
      activo: activoDe(filtro.activo),
    });
    return listadoDto(unidades, unidadDto);
  }

  @Get(':id')
  @Permiso(PERMISOS_ORG.organizacionConsultar)
  @ApiOkResponse({ type: UnidadDto, description: 'La misma fila que la lista, con su versión' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO (inexistente, de otro tenant o id no UUID)' })
  async consultar(@Param('id') id: string): Promise<UnidadDto> {
    return unidadDto(await this.consultarUnidad.ejecutar(exigirUuid(id, UNIDAD_NO_EXISTE)));
  }

  @Post()
  @Permiso(PERMISOS_ORG.unidadGestionar)
  @ApiBody({ type: RegistrarUnidadDto })
  @ApiCreatedResponse({ type: UnidadRegistradaDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (campos, «Solo los almacenes pueden registrarse sin sucursal»)' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO (empresa, sucursal o padre inexistente o de otro tenant)' })
  @ApiConflictResponse({ description: 'CONFLICTO (padre de otra empresa, sucursal de otra empresa o inactiva, código repetido)' })
  async registrar(@Body() cuerpo: unknown): Promise<UnidadRegistradaDto> {
    const datos = validar(EsquemaRegistrarUnidad, cuerpo);
    const { unidadId } = await this.registrarUnidad.ejecutar({
      empresaId: datos.empresa_id,
      sucursalId: datos.sucursal_id ?? null,
      tipo: datos.tipo,
      codigo: datos.codigo,
      nombre: datos.nombre,
      padreId: datos.padre_id ?? null,
      atributos: datos.atributos,
    });
    return { unidad_id: unidadId };
  }

  @Put(':id')
  @Permiso(PERMISOS_ORG.unidadGestionar)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ type: EditarUnidadDto })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (campos, padre que es descendiente)' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO (inexistente o de otro tenant)' })
  @ApiConflictResponse({ description: 'VERSION_OBSOLETA o CONFLICTO (padre de otra empresa)' })
  async editar(@Param('id') id: string, @Body() cuerpo: unknown): Promise<void> {
    const unidadId = exigirUuid(id, UNIDAD_NO_EXISTE);
    const datos = validar(EsquemaEditarUnidad, cuerpo);
    await this.editarUnidad.ejecutar({
      unidadId,
      version: datos.version,
      codigo: datos.codigo,
      nombre: datos.nombre,
      padreId: datos.padre_id ?? null,
      atributos: datos.atributos,
      activo: datos.activo,
    });
  }

  @Post(':id/inactivar')
  @Permiso(PERMISOS_ORG.unidadGestionar)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO (inexistente o de otro tenant)' })
  async inactivar(@Param('id') id: string): Promise<void> {
    await this.inactivarUnidad.ejecutar({ unidadId: exigirUuid(id, UNIDAD_NO_EXISTE) });
  }
}
