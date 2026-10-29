import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, UseFilters } from '@nestjs/common';
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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ConsultarRol, ListarRoles } from '../application/lecturas-roles.js';
import { CambiarPermisosRol, CopiarRol, CrearRol, InactivarRol } from '../application/rol.casos-de-uso.js';
import { PERMISOS_SEG } from '../domain/permisos-seg.js';
import { Permiso } from './decoradores.js';
import { exigirUuid, MembresiasFiltro, validar } from './membresias.http.js';
import {
  CambiarPermisosRolDto,
  CopiarRolDto,
  CrearRolDto,
  EsquemaCambiarPermisosRol,
  EsquemaCopiarRol,
  EsquemaCrearRol,
  EsquemaInactivarRol,
  InactivarRolDto,
  ListadoRolesDto,
  listadoRolesDto,
  ResultadoInactivarDto,
  resultadoInactivarDto,
  RolCreadoDto,
  RolDetalleDto,
  rolDetalleDto,
} from './roles.http.js';

const RECURSO_ROL = 'El rol';

/** Roles propios del tenant (spec 16b, TR-RF-011). Todas las rutas con `plat.rol.gestionar`. */
@ApiTags('seg')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@UseFilters(MembresiasFiltro)
@Controller('seg/roles')
export class RolesController {
  constructor(
    @Inject(ListarRoles) private readonly listarRoles: ListarRoles,
    @Inject(ConsultarRol) private readonly consultarRol: ConsultarRol,
    @Inject(CrearRol) private readonly crearRol: CrearRol,
    @Inject(CopiarRol) private readonly copiarRol: CopiarRol,
    @Inject(CambiarPermisosRol) private readonly cambiarPermisosRol: CambiarPermisosRol,
    @Inject(InactivarRol) private readonly inactivarRol: InactivarRol,
  ) {}

  @Get()
  @Permiso(PERMISOS_SEG.rolGestionar)
  @ApiOkResponse({ type: ListadoRolesDto })
  async listar(): Promise<ListadoRolesDto> {
    return listadoRolesDto(await this.listarRoles.ejecutar());
  }

  @Get(':rolId')
  @Permiso(PERMISOS_SEG.rolGestionar)
  @ApiOkResponse({ type: RolDetalleDto })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO: no existe o es de otro tenant' })
  async consultar(@Param('rolId') rolId: string): Promise<RolDetalleDto> {
    return rolDetalleDto(await this.consultarRol.ejecutar(exigirUuid(rolId, RECURSO_ROL)));
  }

  @Post()
  @Permiso(PERMISOS_SEG.rolGestionar)
  @ApiBody({ type: CrearRolDto })
  @ApiCreatedResponse({ type: RolCreadoDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA, PERMISO_AJENO_AL_PRODUCTO o PRODUCTO_NO_CONTRATADO' })
  @ApiConflictResponse({ description: 'CONFLICTO: código repetido en el tenant' })
  async crear(@Body() cuerpo: unknown): Promise<RolCreadoDto> {
    const datos = validar(EsquemaCrearRol, cuerpo);
    const { rolId } = await this.crearRol.ejecutar({ productoCodigo: datos.producto_codigo, codigo: datos.codigo, nombre: datos.nombre, permisos: datos.permisos });
    return { rol_id: rolId };
  }

  @Post(':rolId/copia')
  @Permiso(PERMISOS_SEG.rolGestionar)
  @ApiBody({ type: CopiarRolDto })
  @ApiCreatedResponse({ type: RolCreadoDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA, PERMISO_AJENO_AL_PRODUCTO o PRODUCTO_NO_CONTRATADO' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO: el rol de origen no existe o es de otro tenant' })
  @ApiConflictResponse({ description: 'CONFLICTO: código repetido o rol de origen inactivo' })
  async copiar(@Param('rolId') rolId: string, @Body() cuerpo: unknown): Promise<RolCreadoDto> {
    const origenId = exigirUuid(rolId, RECURSO_ROL);
    const datos = validar(EsquemaCopiarRol, cuerpo);
    const { rolId: copiaId } = await this.copiarRol.ejecutar({ origenId, codigo: datos.codigo, nombre: datos.nombre, permisos: datos.permisos });
    return { rol_id: copiaId };
  }

  @Put(':rolId/permisos')
  @HttpCode(204)
  @Permiso(PERMISOS_SEG.rolGestionar)
  @ApiBody({ type: CambiarPermisosRolDto })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA o PERMISO_AJENO_AL_PRODUCTO' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO' })
  @ApiConflictResponse({ description: 'ROL_PREDEFINIDO_NO_EDITABLE (TR-CA-032) o CONFLICTO (versión cambiada)' })
  async cambiarPermisos(@Param('rolId') rolId: string, @Body() cuerpo: unknown): Promise<void> {
    const id = exigirUuid(rolId, RECURSO_ROL);
    const { permisos } = validar(EsquemaCambiarPermisosRol, cuerpo);
    await this.cambiarPermisosRol.ejecutar({ rolId: id, permisos });
  }

  @Post(':rolId/inactivar')
  @HttpCode(200)
  @Permiso(PERMISOS_SEG.rolGestionar)
  @ApiBody({ type: InactivarRolDto })
  @ApiOkResponse({ type: ResultadoInactivarDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO' })
  @ApiConflictResponse({ description: 'ROL_PREDEFINIDO_NO_EDITABLE' })
  async inactivar(@Param('rolId') rolId: string, @Body() cuerpo: unknown): Promise<ResultadoInactivarDto> {
    const id = exigirUuid(rolId, RECURSO_ROL);
    const { confirmado } = validar(EsquemaInactivarRol, cuerpo);
    return resultadoInactivarDto(await this.inactivarRol.ejecutar({ rolId: id, confirmado }));
  }
}
