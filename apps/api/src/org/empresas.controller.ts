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
import { EditarEmpresa, ListarEmpresas, PERMISOS_ORG, RegistrarEmpresa } from '@vitrina/plataforma/org';
import { Permiso } from '@vitrina/plataforma/seguridad';
import { validar } from '../eventos/fallidos.http.js';
import { OrgFiltro } from './org.filtro.js';
import {
  activoDe,
  EditarEmpresaDto,
  empresaDto,
  EmpresaRegistradaDto,
  EsquemaEditarEmpresa,
  EsquemaListarActivos,
  EsquemaRegistrarEmpresa,
  exigirUuid,
  ListadoEmpresasDto,
  listadoDto,
  paginaDe,
  RegistrarEmpresaDto,
  TAMANO_PAGINA_DEFECTO,
  TAMANO_PAGINA_MAXIMO,
} from './organizacion.http.js';

const EMPRESA_NO_EXISTE = 'La empresa no existe';

/** TR-RF-002 en el tenant del token. Vive en apps/api: org no importa seguridad (PL-10). */
@ApiTags('org')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@UseFilters(OrgFiltro)
@Controller('org/empresas')
export class EmpresasController {
  constructor(
    @Inject(ListarEmpresas) private readonly listarEmpresas: ListarEmpresas,
    @Inject(RegistrarEmpresa) private readonly registrarEmpresa: RegistrarEmpresa,
    @Inject(EditarEmpresa) private readonly editarEmpresa: EditarEmpresa,
  ) {}

  @Get()
  @Permiso(PERMISOS_ORG.organizacionConsultar)
  @ApiQuery({ name: 'activo', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'pagina', required: false, example: 1 })
  @ApiQuery({ name: 'tamano', required: false, example: TAMANO_PAGINA_DEFECTO, description: `Máximo ${TAMANO_PAGINA_MAXIMO}` })
  @ApiOkResponse({ type: ListadoEmpresasDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  async listar(@Query() consulta: unknown): Promise<ListadoEmpresasDto> {
    const filtro = validar(EsquemaListarActivos, consulta);
    const empresas = await this.listarEmpresas.ejecutar({ ...paginaDe(filtro), activo: activoDe(filtro.activo) });
    return listadoDto(empresas, empresaDto);
  }

  @Post()
  @Permiso(PERMISOS_ORG.empresaCrear)
  @ApiBody({ type: RegistrarEmpresaDto })
  @ApiCreatedResponse({ type: EmpresaRegistradaDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (campos, «RUC inválido», razón social, ubigeo)' })
  @ApiConflictResponse({ description: 'CONFLICTO («La empresa ya está registrada en este tenant», tope de sucursales o tenant no operativo)' })
  async registrar(@Body() cuerpo: unknown): Promise<EmpresaRegistradaDto> {
    const datos = validar(EsquemaRegistrarEmpresa, cuerpo);
    const { empresaId, sucursalPrincipalId } = await this.registrarEmpresa.ejecutar({
      ruc: datos.ruc,
      razonSocial: datos.razon_social,
      nombreComercial: datos.nombre_comercial ?? null,
      direccionFiscal: datos.direccion_fiscal ?? null,
      ubigeo: datos.ubigeo ?? null,
    });
    return { empresa_id: empresaId, sucursal_principal_id: sucursalPrincipalId };
  }

  @Put(':id')
  @Permiso(PERMISOS_ORG.empresaCrear)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ type: EditarEmpresaDto })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO (inexistente o de otro tenant)' })
  @ApiConflictResponse({ description: 'VERSION_OBSOLETA o CONFLICTO' })
  async editar(@Param('id') id: string, @Body() cuerpo: unknown): Promise<void> {
    const empresaId = exigirUuid(id, EMPRESA_NO_EXISTE);
    const datos = validar(EsquemaEditarEmpresa, cuerpo);
    await this.editarEmpresa.ejecutar({
      empresaId,
      version: datos.version,
      razonSocial: datos.razon_social,
      nombreComercial: datos.nombre_comercial ?? null,
      direccionFiscal: datos.direccion_fiscal ?? null,
      ubigeo: datos.ubigeo ?? null,
    });
  }
}
