import { Body, Controller, Get, HttpCode, Inject, Ip, Post, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ListarMisAccesosSoporte, SolicitarAccesoSoporte } from '../application/solicitar-acceso-soporte.js';
import { PERMISOS_SEG } from '../domain/permisos-seg.js';
import type { Principal } from '../domain/principal.js';
import { Permiso, PrincipalActual } from './decoradores.js';
import { MembresiasFiltro, validar } from './membresias.http.js';
import { AccesoDelAgenteDto, accesoDelAgenteDto, EsquemaSolicitarSoporte, SolicitarSoporteDto, SolicitudCreadaDto } from './soporte.http.js';

const HTTP_CREADO = 201;

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
}
