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
import { EditarSucursal, InactivarSucursal, ListarSucursales, MarcarSucursalPrincipal, PERMISOS_ORG, RegistrarSucursal } from '@vitrina/plataforma/org';
import { Permiso } from '@vitrina/plataforma/seguridad';
import type { z } from 'zod';
import { validar } from '../eventos/fallidos.http.js';
import { OrgFiltro } from './org.filtro.js';
import {
  activoDe,
  EditarSucursalDto,
  EsquemaEditarSucursal,
  EsquemaListarActivos,
  EsquemaRegistrarSucursal,
  exigirUuid,
  ListadoSucursalesDto,
  listadoDto,
  paginaDe,
  RegistrarSucursalDto,
  sucursalDto,
  SucursalRegistradaDto,
  TAMANO_PAGINA_DEFECTO,
  TAMANO_PAGINA_MAXIMO,
} from './organizacion.http.js';

const EMPRESA_NO_EXISTE = 'La empresa no existe';
const SUCURSAL_NO_EXISTE = 'La sucursal no existe';

/** TR-RF-003 en el tenant del token. Vive en apps/api: org no importa seguridad (PL-10). */
@ApiTags('org')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@UseFilters(OrgFiltro)
@Controller('org')
export class SucursalesController {
  constructor(
    @Inject(ListarSucursales) private readonly listarSucursales: ListarSucursales,
    @Inject(RegistrarSucursal) private readonly registrarSucursal: RegistrarSucursal,
    @Inject(EditarSucursal) private readonly editarSucursal: EditarSucursal,
    @Inject(InactivarSucursal) private readonly inactivarSucursal: InactivarSucursal,
    @Inject(MarcarSucursalPrincipal) private readonly marcarSucursalPrincipal: MarcarSucursalPrincipal,
  ) {}

  @Get('empresas/:id/sucursales')
  @Permiso(PERMISOS_ORG.organizacionConsultar)
  @ApiQuery({ name: 'activo', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'pagina', required: false, example: 1 })
  @ApiQuery({ name: 'tamano', required: false, example: TAMANO_PAGINA_DEFECTO, description: `Máximo ${TAMANO_PAGINA_MAXIMO}` })
  @ApiOkResponse({ type: ListadoSucursalesDto, description: 'La principal primero, luego por código' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO (empresa inexistente o de otro tenant)' })
  async listar(@Param('id') id: string, @Query() consulta: unknown): Promise<ListadoSucursalesDto> {
    const empresaId = exigirUuid(id, EMPRESA_NO_EXISTE);
    const filtro = validar(EsquemaListarActivos, consulta);
    const sucursales = await this.listarSucursales.ejecutar(empresaId, { ...paginaDe(filtro), activo: activoDe(filtro.activo) });
    return listadoDto(sucursales, sucursalDto);
  }

  @Post('empresas/:id/sucursales')
  @Permiso(PERMISOS_ORG.sucursalGestionar)
  @ApiBody({ type: RegistrarSucursalDto })
  @ApiCreatedResponse({ type: SucursalRegistradaDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (campos, establecimiento 0000 fuera de la principal, zona horaria)' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO (empresa inexistente o de otro tenant)' })
  @ApiConflictResponse({ description: 'CONFLICTO («Su plan permite N sucursales; amplíe su plan», código o establecimiento repetido)' })
  async registrar(@Param('id') id: string, @Body() cuerpo: unknown): Promise<SucursalRegistradaDto> {
    const empresaId = exigirUuid(id, EMPRESA_NO_EXISTE);
    const datos = validar(EsquemaRegistrarSucursal, cuerpo);
    const { sucursalId } = await this.registrarSucursal.ejecutar({ empresaId, ...datosSucursal(datos) });
    return { sucursal_id: sucursalId };
  }

  @Put('sucursales/:id')
  @Permiso(PERMISOS_ORG.sucursalGestionar)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ type: EditarSucursalDto })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO (inexistente o de otro tenant)' })
  @ApiConflictResponse({ description: 'VERSION_OBSOLETA o CONFLICTO (tope del plan al reactivar, principal sin reemplazo)' })
  async editar(@Param('id') id: string, @Body() cuerpo: unknown): Promise<void> {
    const sucursalId = exigirUuid(id, SUCURSAL_NO_EXISTE);
    const datos = validar(EsquemaEditarSucursal, cuerpo);
    await this.editarSucursal.ejecutar({ sucursalId, version: datos.version, activo: datos.activo, ...datosSucursal(datos) });
  }

  @Post('sucursales/:id/inactivar')
  @Permiso(PERMISOS_ORG.sucursalGestionar)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO (inexistente o de otro tenant)' })
  @ApiConflictResponse({ description: 'CONFLICTO («Marque otra sucursal como principal antes de inactivar esta»)' })
  async inactivar(@Param('id') id: string): Promise<void> {
    await this.inactivarSucursal.ejecutar({ sucursalId: exigirUuid(id, SUCURSAL_NO_EXISTE) });
  }

  @Post('sucursales/:id/principal')
  @Permiso(PERMISOS_ORG.sucursalGestionar)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'La sucursal queda como principal con 0000 y la anterior lo pierde (TR-CA-009)' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO (inexistente o de otro tenant)' })
  @ApiConflictResponse({ description: 'CONFLICTO (sucursal inactiva)' })
  async marcarPrincipal(@Param('id') id: string): Promise<void> {
    await this.marcarSucursalPrincipal.ejecutar({ sucursalId: exigirUuid(id, SUCURSAL_NO_EXISTE) });
  }
}

function datosSucursal(datos: z.infer<typeof EsquemaRegistrarSucursal>) {
  return {
    codigo: datos.codigo,
    nombre: datos.nombre,
    codigoEstablecimientoSunat: datos.codigo_establecimiento_sunat ?? null,
    direccion: datos.direccion ?? null,
    ubigeo: datos.ubigeo ?? null,
    telefono: datos.telefono ?? null,
    zonaHoraria: datos.zona_horaria,
  };
}
