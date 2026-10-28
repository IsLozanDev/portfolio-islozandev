import { Controller, Get, Inject, Param, Query, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ConsultarMiembro, ListarAsignables, ListarMiembros } from '../application/lecturas-miembros.js';
import { ORDENES_MIEMBROS } from '../application/ports/lectura-miembros.js';
import { PERMISOS_SEG } from '../domain/permisos-seg.js';
import { Permiso } from './decoradores.js';
import { exigirUuid, MembresiasFiltro, validar } from './membresias.http.js';
import {
  AsignablesDto,
  asignablesDto,
  EsquemaListarMiembros,
  filtroMiembrosDe,
  ListadoMiembrosDto,
  listadoMiembrosDto,
  MiembroDetalleDto,
  miembroDetalleDto,
  TAMANO_PAGINA_DEFECTO,
  TAMANO_PAGINA_MAXIMO,
} from './miembros.http.js';

/**
 * Lecturas de la administración de usuarios (spec 16a, TR-RF-009 y 013). Todas con `plat.usuario.invitar`:
 * así el administrador de SUCURSAL también las usa, y el manifiesto no cambia.
 */
@ApiTags('seg')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@UseFilters(MembresiasFiltro)
@Controller('seg')
export class MiembrosController {
  constructor(
    @Inject(ListarMiembros) private readonly listarMiembros: ListarMiembros,
    @Inject(ConsultarMiembro) private readonly consultarMiembro: ConsultarMiembro,
    @Inject(ListarAsignables) private readonly listarAsignables: ListarAsignables,
  ) {}

  @Get('miembros')
  @Permiso(PERMISOS_SEG.usuarioInvitar)
  @ApiQuery({ name: 'estado', required: false, enum: ['INVITADO', 'ACTIVO', 'SUSPENDIDO', 'FINALIZADO'] })
  @ApiQuery({ name: 'busqueda', required: false, description: 'Parte del nombre o del correo' })
  @ApiQuery({ name: 'orden', required: false, enum: ORDENES_MIEMBROS })
  @ApiQuery({ name: 'direccion', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'pagina', required: false, example: 1 })
  @ApiQuery({ name: 'tamano', required: false, example: TAMANO_PAGINA_DEFECTO, description: `Máximo ${TAMANO_PAGINA_MAXIMO}` })
  @ApiOkResponse({ type: ListadoMiembrosDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  async listar(@Query() consulta: unknown): Promise<ListadoMiembrosDto> {
    const filtro = filtroMiembrosDe(validar(EsquemaListarMiembros, consulta));
    return listadoMiembrosDto(await this.listarMiembros.ejecutar(filtro));
  }

  @Get('miembros/:membresiaId')
  @Permiso(PERMISOS_SEG.usuarioInvitar)
  @ApiOkResponse({ type: MiembroDetalleDto })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO: no existe en el tenant del token' })
  async consultar(@Param('membresiaId') membresiaId: string): Promise<MiembroDetalleDto> {
    return miembroDetalleDto(await this.consultarMiembro.ejecutar(exigirUuid(membresiaId, 'La membresía')));
  }

  @Get('asignables')
  @Permiso(PERMISOS_SEG.usuarioInvitar)
  @ApiOkResponse({ type: AsignablesDto })
  async asignables(): Promise<AsignablesDto> {
    return asignablesDto(await this.listarAsignables.ejecutar());
  }
}
