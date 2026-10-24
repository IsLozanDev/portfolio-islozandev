import { Body, Controller, Get, HttpCode, Inject, Param, Post, UseFilters, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { AceptarInvitacion, ConsultarInvitacion } from '../application/aceptar-invitacion.js';
import { InvitarUsuario } from '../application/invitar-usuario.js';
import { ALCANCES } from '../domain/alcance.js';
import { PERMISOS_SEG } from '../domain/permisos-seg.js';
import { mfaVigente, type Principal } from '../domain/principal.js';
import { Permiso, PrincipalActual, Publico } from './decoradores.js';
import { LimiteTasaGuard, MembresiasFiltro, validar } from './membresias.http.js';
import { MFA_MAX_EDAD_SEG } from './mi-contexto.controller.js';

const uuid = z.uuid();
const uuidNulo = uuid.nullable().optional().default(null);

const EsquemaInvitar = z.object({
  correo: z.string().max(255),
  nombre: z.string(),
  rol_id: uuidNulo,
  perfil_id: uuidNulo,
  alcance: z.enum(ALCANCES),
  empresa_id: uuidNulo,
  sucursal_id: uuidNulo,
  unidad_id: uuidNulo,
  vigente_hasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .default(null),
});

const EsquemaAceptar = z.object({ token: z.string().min(1).max(100) });

export class InvitarDto {
  @ApiProperty({ example: 'rosa.huaman@gmail.com' })
  correo!: string;

  @ApiProperty({ minLength: 3, maxLength: 150 })
  nombre!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String, description: 'Rol o perfil, uno de los dos (TR-RN-008)' })
  rol_id?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  perfil_id?: string | null;

  @ApiProperty({ enum: ALCANCES })
  alcance!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  empresa_id?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  sucursal_id?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  unidad_id?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  vigente_hasta?: string | null;
}

export class InvitacionEmitidaDto {
  @ApiProperty({ format: 'uuid' })
  membresia_id!: string;

  @ApiProperty({ format: 'uuid' })
  invitacion_id!: string;

  @ApiProperty({ format: 'date-time' })
  expira_en!: string;

  @ApiProperty({ description: 'El correo no tenía cuenta: Supabase la creó con la invitación' })
  usuario_nuevo!: boolean;

  @ApiProperty({ description: 'false si el enlace a un usuario existente no salió; se reenvía invitando otra vez' })
  correo_enviado!: boolean;
}

export class InvitacionVigenteDto {
  @ApiProperty({ enum: ['VIGENTE'] })
  estado!: string;

  @ApiProperty()
  tenant_nombre!: string;

  @ApiProperty({ format: 'date-time' })
  expira_en!: string;
}

export class AceptarDto {
  @ApiProperty({ description: 'Token del enlace (?token=)' })
  token!: string;
}

export class InvitacionAceptadaDto {
  @ApiProperty({ format: 'uuid' })
  tenant_id!: string;

  @ApiProperty({ format: 'uuid' })
  membresia_id!: string;

  @ApiProperty({ description: 'El cliente debe refrescar la sesión para recibir tenant_id en el token' })
  refrescar_sesion!: boolean;
}

/** TR-RF-009 y TR-RF-010. Las dos rutas de aceptar no llevan `@Permiso`: el invitado aún no tiene tenant. */
@ApiTags('seg')
@UseFilters(MembresiasFiltro)
@Controller('seg/invitaciones')
export class InvitacionesController {
  constructor(
    @Inject(InvitarUsuario) private readonly invitarUsuario: InvitarUsuario,
    @Inject(ConsultarInvitacion) private readonly consultarInvitacion: ConsultarInvitacion,
    @Inject(AceptarInvitacion) private readonly aceptarInvitacion: AceptarInvitacion,
    @Inject(MFA_MAX_EDAD_SEG) private readonly mfaMaxEdadSeg: number,
  ) {}

  @Post()
  @Permiso(PERMISOS_SEG.usuarioInvitar)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Sucursal-Id', required: true })
  @ApiBody({ type: InvitarDto })
  @ApiCreatedResponse({ type: InvitacionEmitidaDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA o validación de TR-RN-008 (ASIGNACION_ROL_O_PERFIL, ALCANCE_INCOHERENTE, VIGENCIA_INVALIDA…)' })
  @ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO o MFA_REQUERIDA (rol con permisos sensibles)' })
  @ApiForbiddenResponse({ description: 'SIN_PERMISO o ALCANCE_SUPERIOR (TR-CA-026)' })
  @ApiNotFoundResponse({ description: 'Rol, perfil, empresa, sucursal o unidad inexistente' })
  @ApiConflictResponse({ description: 'LIMITE_USUARIOS o MEMBRESIA_EXISTENTE' })
  @ApiServiceUnavailableResponse({ description: 'IDENTIDAD_NO_DISPONIBLE: Supabase no respondió; no se escribió nada' })
  async invitar(@PrincipalActual() p: Principal, @Body() cuerpo: unknown): Promise<InvitacionEmitidaDto> {
    const d = validar(EsquemaInvitar, cuerpo);
    const r = await this.invitarUsuario.ejecutar({
      correo: d.correo,
      nombre: d.nombre,
      rolId: d.rol_id,
      perfilId: d.perfil_id,
      alcance: d.alcance,
      empresaId: d.empresa_id,
      sucursalId: d.sucursal_id,
      unidadId: d.unidad_id,
      vigenteHasta: d.vigente_hasta,
      otorgante: { usuarioId: p.usuarioId, mfaVigente: mfaVigente(p, new Date(), this.mfaMaxEdadSeg) },
    });
    return {
      membresia_id: r.membresiaId,
      invitacion_id: r.invitacionId,
      expira_en: r.expiraEn.toISOString(),
      usuario_nuevo: r.usuarioNuevo,
      correo_enviado: r.correoEnviado,
    };
  }

  @Post('aceptar')
  @HttpCode(200)
  @UseGuards(LimiteTasaGuard)
  @ApiBearerAuth()
  @ApiBody({ type: AceptarDto })
  @ApiOkResponse({ type: InvitacionAceptadaDto })
  @ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
  @ApiForbiddenResponse({ description: 'INVITACION_OTRO_CORREO: «Esta invitación pertenece a otro correo» (TR-CA-030)' })
  @ApiNotFoundResponse({ description: 'INVITACION_NO_ENCONTRADA' })
  @ApiConflictResponse({ description: 'INVITACION_NO_DISPONIBLE: ya usada o anulada' })
  @ApiGoneResponse({ description: 'INVITACION_EXPIRADA (TR-CA-029)' })
  @ApiTooManyRequestsResponse({ description: 'DEMASIADAS_SOLICITUDES (TR-RNF-015)' })
  async aceptar(@PrincipalActual() p: Principal, @Body() cuerpo: unknown): Promise<InvitacionAceptadaDto> {
    const { token } = validar(EsquemaAceptar, cuerpo);
    const r = await this.aceptarInvitacion.ejecutar({ token, usuarioId: p.usuarioId });
    return { tenant_id: r.tenantId, membresia_id: r.membresiaId, refrescar_sesion: r.refrescarSesion };
  }

  @Get(':token')
  @Publico()
  @UseGuards(LimiteTasaGuard)
  @ApiOkResponse({ type: InvitacionVigenteDto })
  @ApiNotFoundResponse({ description: 'INVITACION_NO_ENCONTRADA' })
  @ApiConflictResponse({ description: 'INVITACION_NO_DISPONIBLE: ya usada o anulada' })
  @ApiGoneResponse({ description: 'INVITACION_EXPIRADA: «La invitación expiró; solicite una nueva al administrador»' })
  @ApiTooManyRequestsResponse({ description: 'DEMASIADAS_SOLICITUDES (TR-RNF-015)' })
  async consultar(@Param('token') token: string): Promise<InvitacionVigenteDto> {
    const r = await this.consultarInvitacion.ejecutar(token);
    return { estado: r.estado, tenant_nombre: r.tenantNombre, expira_en: r.expiraEn.toISOString() };
  }
}
