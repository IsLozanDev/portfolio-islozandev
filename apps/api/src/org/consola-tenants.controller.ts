import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ESTADOS_TENANT, PERMISOS_ORG, PRODUCTOS } from '@vitrina/plataforma/org';
import { Permiso, PrincipalActual, type Principal } from '@vitrina/plataforma/seguridad';
import { validar } from '../eventos/fallidos.http.js';
import {
  CambiarEstadoDto,
  EsquemaCambiarEstado,
  EsquemaListarTenants,
  EstadoCambiadoDto,
  ListadoTenantsDto,
  TenantDetalleDto,
  tenantDetalleDto,
  tenantListadoDto,
} from './consola-tenants.http.js';
import { ConsolaTenants } from './consulta-tenants.js';
import { actorDe } from './operador.js';
import { OrgFiltro } from './org.filtro.js';
import { exigirUuid, listadoDto, paginaDe, TAMANO_PAGINA_DEFECTO, TAMANO_PAGINA_MAXIMO } from './organizacion.http.js';

const TENANT_NO_EXISTE = 'El tenant no existe';

/** Consola del operador (TR-RF-001 y 006). Además del permiso, el actor debe ser del tenant operador. */
@ApiTags('org')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true, description: 'Sucursal del tenant operador' })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO, SUCURSAL_NO_ASIGNADA u OPERADOR_REQUERIDO (el actor no es del tenant operador)' })
@UseFilters(OrgFiltro)
@Controller('org/tenants')
export class ConsolaTenantsController {
  constructor(@Inject(ConsolaTenants) private readonly consola: ConsolaTenants) {}

  @Get()
  @Permiso(PERMISOS_ORG.tenantConsultar)
  @ApiQuery({ name: 'q', required: false, description: 'Busca en código o nombre' })
  @ApiQuery({ name: 'estado', required: false, enum: ESTADOS_TENANT })
  @ApiQuery({ name: 'producto', required: false, enum: PRODUCTOS })
  @ApiQuery({ name: 'pagina', required: false, example: 1 })
  @ApiQuery({ name: 'tamano', required: false, example: TAMANO_PAGINA_DEFECTO, description: `Máximo ${TAMANO_PAGINA_MAXIMO}` })
  @ApiOkResponse({ type: ListadoTenantsDto, description: 'Por código' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  async listar(@PrincipalActual() principal: Principal, @Query() consulta: unknown): Promise<ListadoTenantsDto> {
    const filtro = validar(EsquemaListarTenants, consulta);
    const tenants = await this.consola.listar(actorDe(principal), { ...paginaDe(filtro), q: filtro.q, estado: filtro.estado, producto: filtro.producto });
    return listadoDto(tenants, tenantListadoDto);
  }

  @Get(':id')
  @Permiso(PERMISOS_ORG.tenantConsultar)
  @ApiOkResponse({ type: TenantDetalleDto })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO' })
  async detalle(@PrincipalActual() principal: Principal, @Param('id') id: string): Promise<TenantDetalleDto> {
    return tenantDetalleDto(await this.consola.detalle(actorDe(principal), exigirUuid(id, TENANT_NO_EXISTE)));
  }

  @Post(':id/estado')
  @Permiso(PERMISOS_ORG.tenantCambiarEstado)
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: CambiarEstadoDto })
  @ApiOkResponse({ type: EstadoCambiadoDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA («El motivo es obligatorio y debe tener de 10 a 500 caracteres», TR-CA-018)' })
  @ApiUnauthorizedResponse({ description: 'MFA_REQUERIDA (permiso sensible, TR-RN-009)' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO' })
  @ApiConflictResponse({ description: 'CONFLICTO (transición no permitida, por ejemplo BAJA → ACTIVO, TR-CA-017)' })
  async cambiarEstado(@PrincipalActual() principal: Principal, @Param('id') id: string, @Body() cuerpo: unknown): Promise<EstadoCambiadoDto> {
    const tenantId = exigirUuid(id, TENANT_NO_EXISTE);
    const datos = validar(EsquemaCambiarEstado, cuerpo);
    return this.consola.cambiarEstado(actorDe(principal), { tenantId, estado: datos.estado, motivo: datos.motivo });
  }
}
