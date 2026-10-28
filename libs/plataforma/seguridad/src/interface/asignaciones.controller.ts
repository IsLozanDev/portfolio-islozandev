import { Body, Controller, Inject, Post, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OtorgarAsignacion } from '../application/otorgar-asignacion.js';
import { PERMISOS_SEG } from '../domain/permisos-seg.js';
import { mfaVigente, type Principal } from '../domain/principal.js';
import { Permiso, PrincipalActual } from './decoradores.js';
import { MembresiasFiltro, validar } from './membresias.http.js';
import { MFA_MAX_EDAD_SEG } from './mi-contexto.controller.js';
import { AsignacionOtorgadaDto, EsquemaOtorgarAsignacion, OtorgarAsignacionDto } from './miembros.http.js';

/** TR-RF-013. `plat.asignacion.otorgar` es sensible: PermisoGuard exige MFA reciente (TR-RN-009). */
@ApiTags('seg')
@ApiBearerAuth()
@UseFilters(MembresiasFiltro)
@Controller('seg/asignaciones')
export class AsignacionesController {
  constructor(
    @Inject(OtorgarAsignacion) private readonly otorgarAsignacion: OtorgarAsignacion,
    @Inject(MFA_MAX_EDAD_SEG) private readonly mfaMaxEdadSeg: number,
  ) {}

  @Post()
  @Permiso(PERMISOS_SEG.asignacionOtorgar)
  @ApiHeader({ name: 'X-Sucursal-Id', required: true })
  @ApiBody({ type: OtorgarAsignacionDto })
  @ApiCreatedResponse({ type: AsignacionOtorgadaDto })
  @ApiBadRequestResponse({
    description: 'SOLICITUD_INVALIDA, ASIGNACION_ROL_O_PERFIL (TR-CA-037), VIGENCIA_INVALIDA (TR-CA-038), ALCANCE_INCOHERENTE o ALCANCE_INSUFICIENTE',
  })
  @ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO o MFA_REQUERIDA' })
  @ApiForbiddenResponse({ description: 'SIN_PERMISO, SUCURSAL_NO_ASIGNADA u OTORGANTE_SIN_ALCANCE' })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO: membresía, rol, perfil, empresa, sucursal o unidad inexistente en el tenant' })
  @ApiConflictResponse({ description: 'MEMBRESIA_NO_ASIGNABLE (SUSPENDIDO o FINALIZADO) o CONFLICTO (rol inactivo u obsoleto)' })
  async otorgar(@PrincipalActual() principal: Principal, @Body() cuerpo: unknown): Promise<AsignacionOtorgadaDto> {
    const datos = validar(EsquemaOtorgarAsignacion, cuerpo);
    const { asignacionId } = await this.otorgarAsignacion.ejecutar({
      membresiaId: datos.membresia_id,
      rolId: datos.rol_id,
      perfilId: datos.perfil_id,
      alcance: datos.alcance,
      empresaId: datos.empresa_id,
      sucursalId: datos.sucursal_id,
      unidadId: datos.unidad_id,
      vigenteDesde: datos.vigente_desde,
      vigenteHasta: datos.vigente_hasta,
      otorgante: { usuarioId: principal.usuarioId, mfaVigente: mfaVigente(principal, new Date(), this.mfaMaxEdadSeg) },
    });
    return { asignacion_id: asignacionId };
  }
}
