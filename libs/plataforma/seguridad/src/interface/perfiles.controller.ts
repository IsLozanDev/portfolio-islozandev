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
import { ConsultarPerfil, ListarPerfiles, ListarRolesDisponibles } from '../application/lecturas-perfiles.js';
import { CambiarRolesPerfil, CopiarPerfil, CrearPerfil } from '../application/perfil.casos-de-uso.js';
import { PERMISOS_SEG } from '../domain/permisos-seg.js';
import { Permiso } from './decoradores.js';
import { exigirUuid, MembresiasFiltro, validar } from './membresias.http.js';
import {
  CambiarRolesPerfilDto,
  CopiarPerfilDto,
  CrearPerfilDto,
  EsquemaCambiarRolesPerfil,
  EsquemaCopiarPerfil,
  EsquemaCrearPerfil,
  ListadoPerfilesDto,
  listadoPerfilesDto,
  ListadoRolesDisponiblesDto,
  listadoRolesDisponiblesDto,
  PerfilCreadoDto,
  PerfilDetalleDto,
  perfilDetalleDto,
} from './perfiles.http.js';

const RECURSO_PERFIL = 'El perfil';
const ERRORES_DE_ROLES = 'SOLICITUD_INVALIDA, PRODUCTO_NO_CONTRATADO (TR-CA-035) o ROL_FUERA_DEL_TECHO';

/** Perfiles de puesto del tenant (spec 16c, TR-RF-012). Todas las rutas con `plat.perfil.gestionar`. */
@ApiTags('seg')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@UseFilters(MembresiasFiltro)
@Controller('seg/perfiles')
export class PerfilesController {
  constructor(
    @Inject(ListarPerfiles) private readonly listarPerfiles: ListarPerfiles,
    @Inject(ConsultarPerfil) private readonly consultarPerfil: ConsultarPerfil,
    @Inject(ListarRolesDisponibles) private readonly listarRolesDisponibles: ListarRolesDisponibles,
    @Inject(CrearPerfil) private readonly crearPerfil: CrearPerfil,
    @Inject(CopiarPerfil) private readonly copiarPerfil: CopiarPerfil,
    @Inject(CambiarRolesPerfil) private readonly cambiarRolesPerfil: CambiarRolesPerfil,
  ) {}

  @Get()
  @Permiso(PERMISOS_SEG.perfilGestionar)
  @ApiOkResponse({ type: ListadoPerfilesDto })
  async listar(): Promise<ListadoPerfilesDto> {
    return listadoPerfilesDto(await this.listarPerfiles.ejecutar());
  }

  // Antes de ':perfilId' para que la ruta con parámetro no la capture.
  @Get('roles-disponibles')
  @Permiso(PERMISOS_SEG.perfilGestionar)
  @ApiOkResponse({ type: ListadoRolesDisponiblesDto })
  async rolesDisponibles(): Promise<ListadoRolesDisponiblesDto> {
    return listadoRolesDisponiblesDto(await this.listarRolesDisponibles.ejecutar());
  }

  @Get(':perfilId')
  @Permiso(PERMISOS_SEG.perfilGestionar)
  @ApiOkResponse({ type: PerfilDetalleDto })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO: no existe o es de otro tenant' })
  async consultar(@Param('perfilId') perfilId: string): Promise<PerfilDetalleDto> {
    return perfilDetalleDto(await this.consultarPerfil.ejecutar(exigirUuid(perfilId, RECURSO_PERFIL)));
  }

  @Post()
  @Permiso(PERMISOS_SEG.perfilGestionar)
  @ApiBody({ type: CrearPerfilDto })
  @ApiCreatedResponse({ type: PerfilCreadoDto })
  @ApiBadRequestResponse({ description: ERRORES_DE_ROLES })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO: algún rol no existe o es de otro tenant' })
  @ApiConflictResponse({ description: 'CONFLICTO: código repetido en el tenant o rol inactivo' })
  async crear(@Body() cuerpo: unknown): Promise<PerfilCreadoDto> {
    const datos = validar(EsquemaCrearPerfil, cuerpo);
    const { perfilId } = await this.crearPerfil.ejecutar({ codigo: datos.codigo, nombre: datos.nombre, roles: datos.roles });
    return { perfil_id: perfilId };
  }

  @Post(':perfilId/copia')
  @Permiso(PERMISOS_SEG.perfilGestionar)
  @ApiBody({ type: CopiarPerfilDto })
  @ApiCreatedResponse({ type: PerfilCreadoDto })
  @ApiBadRequestResponse({ description: ERRORES_DE_ROLES })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO: el perfil de origen o algún rol no existe o es de otro tenant' })
  @ApiConflictResponse({ description: 'CONFLICTO: código repetido o rol inactivo' })
  async copiar(@Param('perfilId') perfilId: string, @Body() cuerpo: unknown): Promise<PerfilCreadoDto> {
    const origenId = exigirUuid(perfilId, RECURSO_PERFIL);
    const datos = validar(EsquemaCopiarPerfil, cuerpo);
    const { perfilId: copiaId } = await this.copiarPerfil.ejecutar({ origenId, codigo: datos.codigo, nombre: datos.nombre, roles: datos.roles });
    return { perfil_id: copiaId };
  }

  @Put(':perfilId/roles')
  @HttpCode(204)
  @Permiso(PERMISOS_SEG.perfilGestionar)
  @ApiBody({ type: CambiarRolesPerfilDto })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: ERRORES_DE_ROLES })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO' })
  @ApiConflictResponse({ description: 'PERFIL_PREDEFINIDO_NO_EDITABLE o CONFLICTO (rol inactivo o versión cambiada)' })
  async cambiarRoles(@Param('perfilId') perfilId: string, @Body() cuerpo: unknown): Promise<void> {
    const id = exigirUuid(perfilId, RECURSO_PERFIL);
    const { roles } = validar(EsquemaCambiarRolesPerfil, cuerpo);
    await this.cambiarRolesPerfil.ejecutar({ perfilId: id, roles });
  }
}
