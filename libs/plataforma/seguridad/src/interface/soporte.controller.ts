import { Body, Controller, Get, HttpCode, Inject, Ip, Param, Post, Query, UseFilters } from '@nestjs/common';
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
import { AprobarAccesoSoporte } from '../application/aprobar-acceso-soporte.js';
import { RechazarAccesoSoporte, RevocarAccesoSoporte } from '../application/cerrar-acceso-soporte.js';
import { ContarSolicitudesPendientes, ListarSolicitudesSoporte } from '../application/lecturas-soporte.js';
import { ListarMisAccesosSoporte, SolicitarAccesoSoporte } from '../application/solicitar-acceso-soporte.js';
import { PERMISOS_SEG } from '../domain/permisos-seg.js';
import type { Principal } from '../domain/principal.js';
import { Permiso, PrincipalActual } from './decoradores.js';
import { exigirUuid, MembresiasFiltro, validar } from './membresias.http.js';
import { TAMANO_PAGINA_DEFECTO, TAMANO_PAGINA_MAXIMO } from './miembros.http.js';
import {
  AccesoAprobadoDto,
  accesoAprobadoDto,
  AccesoDelAgenteDto,
  accesoDelAgenteDto,
  AprobarSoporteDto,
  EsquemaAprobarSoporte,
  EsquemaListarSolicitudes,
  EsquemaRechazarSoporte,
  EsquemaRevocarSoporte,
  EsquemaSolicitarSoporte,
  ESTADOS_SOPORTE,
  filtroSolicitudesDe,
  ListadoSolicitudesDto,
  listadoSolicitudesDto,
  RechazarSoporteDto,
  RevocarSoporteDto,
  SolicitarSoporteDto,
  SolicitudCreadaDto,
  TotalPendientesDto,
} from './soporte.http.js';

const HTTP_CREADO = 201;
const HTTP_OK = 200;
const HTTP_SIN_CONTENIDO = 204;
const SOLICITUD = 'La solicitud de soporte';
const ACCESO = 'El acceso de soporte';
const SENSIBLE = 'TOKEN_INVALIDO o MFA_REQUERIDA (plat.soporte.autorizar es sensible, TR-RN-009)';

/** Acceso temporal de soporte (spec 18, TR-RF-020, TR-RN-011). */
@ApiTags('seg')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@UseFilters(MembresiasFiltro)
@Controller('seg/soporte')
export class SoporteController {
  constructor(
    @Inject(SolicitarAccesoSoporte) private readonly solicitarAcceso: SolicitarAccesoSoporte,
    @Inject(ListarMisAccesosSoporte) private readonly listarMisAccesos: ListarMisAccesosSoporte,
    @Inject(ListarSolicitudesSoporte) private readonly listarSolicitudes: ListarSolicitudesSoporte,
    @Inject(ContarSolicitudesPendientes) private readonly contarPendientes: ContarSolicitudesPendientes,
    @Inject(AprobarAccesoSoporte) private readonly aprobarAcceso: AprobarAccesoSoporte,
    @Inject(RechazarAccesoSoporte) private readonly rechazarAcceso: RechazarAccesoSoporte,
    @Inject(RevocarAccesoSoporte) private readonly revocarAcceso: RevocarAccesoSoporte,
  ) {}

  @Post('solicitudes')
  @HttpCode(HTTP_CREADO)
  @Permiso(PERMISOS_SEG.soporteSolicitar)
  @ApiBody({ type: SolicitarSoporteDto })
  @ApiCreatedResponse({ type: SolicitudCreadaDto })
  @ApiBadRequestResponse({ description: 'TICKET_INVALIDO, MOTIVO_SOPORTE_INVALIDO, VIGENCIA_SOPORTE_EXCEDIDA, VIGENCIA_SOPORTE_INVALIDA o SOLICITUD_INVALIDA' })
  @ApiForbiddenResponse({ description: 'SIN_PERMISO u OPERADOR_REQUERIDO (el agente no está en el tenant operador)' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO: el tenant no existe' })
  @ApiConflictResponse({ description: 'SOPORTE_ABIERTO_EXISTENTE o SOPORTE_AGENTE_ES_MIEMBRO' })
  async solicitar(@PrincipalActual() principal: Principal, @Body() cuerpo: unknown, @Ip() ip: string): Promise<SolicitudCreadaDto> {
    const datos = validar(EsquemaSolicitarSoporte, cuerpo);
    return this.solicitarAcceso.ejecutar({
      tenantId: datos.tenant_id,
      ticket: datos.ticket,
      motivo: datos.motivo,
      modo: datos.modo,
      horas: datos.horas,
      agenteId: principal.usuarioId,
      tenantActual: principal.tenantId ?? '',
      ip: ip || null,
    });
  }

  @Get('mis-accesos')
  @Permiso(PERMISOS_SEG.soporteSolicitar)
  @ApiOkResponse({ type: [AccesoDelAgenteDto], description: 'Los 50 más recientes, en todos los tenants' })
  @ApiForbiddenResponse({ description: 'SIN_PERMISO' })
  async misAccesos(@PrincipalActual() principal: Principal): Promise<AccesoDelAgenteDto[]> {
    return (await this.listarMisAccesos.ejecutar(principal.usuarioId)).map(accesoDelAgenteDto);
  }

  @Get('solicitudes')
  @Permiso(PERMISOS_SEG.soporteAutorizar)
  @ApiQuery({ name: 'estado', required: false, description: `Uno o varios separados por coma: ${ESTADOS_SOPORTE.join(', ')}` })
  @ApiQuery({ name: 'pagina', required: false, example: 1 })
  @ApiQuery({ name: 'tamano', required: false, example: TAMANO_PAGINA_DEFECTO, description: `Máximo ${TAMANO_PAGINA_MAXIMO}` })
  @ApiOkResponse({ type: ListadoSolicitudesDto, description: 'De la más reciente a la más antigua' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  @ApiForbiddenResponse({ description: 'SIN_PERMISO' })
  async solicitudes(@Query() consulta: unknown): Promise<ListadoSolicitudesDto> {
    const filtro = filtroSolicitudesDe(validar(EsquemaListarSolicitudes, consulta));
    return listadoSolicitudesDto(await this.listarSolicitudes.ejecutar(filtro));
  }

  @Get('solicitudes/pendientes')
  @Permiso(PERMISOS_SEG.soporteAutorizar)
  @ApiOkResponse({ type: TotalPendientesDto, description: 'PENDIENTE sin caducar: la insignia del menú' })
  @ApiForbiddenResponse({ description: 'SIN_PERMISO' })
  async pendientes(): Promise<TotalPendientesDto> {
    return { total: await this.contarPendientes.ejecutar() };
  }

  @Post('solicitudes/:id/aprobar')
  @HttpCode(HTTP_OK)
  @Permiso(PERMISOS_SEG.soporteAutorizar)
  @ApiBody({ type: AprobarSoporteDto })
  @ApiOkResponse({ type: AccesoAprobadoDto })
  @ApiBadRequestResponse({ description: 'VIGENCIA_SOPORTE_EXCEDIDA (TR-CA-054), VIGENCIA_SOPORTE_INVALIDA, ASIGNACION_ROL_O_PERFIL, ROL_FUERA_DEL_TECHO o SOLICITUD_INVALIDA' })
  @ApiUnauthorizedResponse({ description: SENSIBLE })
  @ApiForbiddenResponse({ description: 'SIN_PERMISO o SOPORTE_AUTOAPROBACION' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO o SOPORTE_NO_ENCONTRADO' })
  @ApiConflictResponse({ description: 'TRANSICION_SOPORTE_INVALIDA (ya cerrada o caducada) o SOPORTE_AGENTE_ES_MIEMBRO' })
  async aprobar(@PrincipalActual() principal: Principal, @Param('id') id: string, @Body() cuerpo: unknown, @Ip() ip: string): Promise<AccesoAprobadoDto> {
    const datos = validar(EsquemaAprobarSoporte, cuerpo);
    const aprobado = await this.aprobarAcceso.ejecutar({
      accesoId: exigirUuid(id, SOLICITUD),
      horas: datos.horas,
      rolId: datos.rol_id,
      perfilId: datos.perfil_id,
      aprobadoPor: principal.usuarioId,
      ip: ip || null,
    });
    return accesoAprobadoDto(aprobado);
  }

  @Post('solicitudes/:id/rechazar')
  @HttpCode(HTTP_SIN_CONTENIDO)
  @Permiso(PERMISOS_SEG.soporteAutorizar)
  @ApiBody({ type: RechazarSoporteDto })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'MOTIVO_INVALIDO o SOLICITUD_INVALIDA' })
  @ApiUnauthorizedResponse({ description: SENSIBLE })
  @ApiForbiddenResponse({ description: 'SIN_PERMISO' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO o SOPORTE_NO_ENCONTRADO' })
  @ApiConflictResponse({ description: 'TRANSICION_SOPORTE_INVALIDA' })
  async rechazar(@PrincipalActual() principal: Principal, @Param('id') id: string, @Body() cuerpo: unknown, @Ip() ip: string): Promise<void> {
    const datos = validar(EsquemaRechazarSoporte, cuerpo);
    await this.rechazarAcceso.ejecutar({ accesoId: exigirUuid(id, SOLICITUD), motivo: datos.motivo, actorId: principal.usuarioId, ip: ip || null });
  }

  @Post('accesos/:id/revocar')
  @HttpCode(HTTP_SIN_CONTENIDO)
  @Permiso(PERMISOS_SEG.soporteAutorizar)
  @ApiBody({ type: RevocarSoporteDto })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'CONFIRMACION_REQUERIDA, MOTIVO_INVALIDO o SOLICITUD_INVALIDA' })
  @ApiUnauthorizedResponse({ description: SENSIBLE })
  @ApiForbiddenResponse({ description: 'SIN_PERMISO' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO o SOPORTE_NO_ENCONTRADO' })
  @ApiConflictResponse({ description: 'TRANSICION_SOPORTE_INVALIDA' })
  async revocar(@PrincipalActual() principal: Principal, @Param('id') id: string, @Body() cuerpo: unknown, @Ip() ip: string): Promise<void> {
    const datos = validar(EsquemaRevocarSoporte, cuerpo);
    await this.revocarAcceso.ejecutar({
      accesoId: exigirUuid(id, ACCESO),
      motivo: datos.motivo,
      confirmar: datos.confirmar,
      actorId: principal.usuarioId,
      ip: ip || null,
    });
  }
}
