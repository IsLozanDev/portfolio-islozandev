import { Body, Controller, Inject, Post, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PERMISOS_ORG } from '@vitrina/plataforma/org';
import { Permiso, PrincipalActual, type Principal } from '@vitrina/plataforma/seguridad';
import { validar } from '../eventos/fallidos.http.js';
import { AltaTenant, type TenantDadoDeAlta } from './alta-tenant.js';
import { AltaTenantDto, EsquemaAltaTenant, TenantDadoDeAltaDto } from './alta-tenant.http.js';
import { OrgFiltro } from './org.filtro.js';

/** TR-RF-001. Vive en apps/api: orquesta org, seguridad y correlativos (PL-10). PermisoGuard exige X-Sucursal-Id. */
@ApiTags('org')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true, description: 'Sucursal del tenant operador' })
@UseFilters(OrgFiltro)
@Controller('org/tenants')
export class AltaTenantController {
  constructor(@Inject(AltaTenant) private readonly altaTenant: AltaTenant) {}

  @Post()
  @Permiso(PERMISOS_ORG.tenantCrear)
  @ApiBody({ type: AltaTenantDto })
  @ApiCreatedResponse({ type: TenantDadoDeAltaDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (campos, o ACTIVO sin vigente_hasta futuro) o RUC_INVALIDO («RUC inválido»)' })
  @ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO o MFA_REQUERIDA (permiso sensible, TR-RN-009)' })
  @ApiForbiddenResponse({ description: 'SIN_PERMISO, SUCURSAL_NO_ASIGNADA u OPERADOR_REQUERIDO (el actor no es del tenant operador)' })
  @ApiConflictResponse({ description: 'TENANT_DUPLICADO («El código de tenant ya existe»)' })
  @ApiServiceUnavailableResponse({ description: 'IDENTIDAD_NO_DISPONIBLE: Supabase no respondió; no se escribió nada' })
  async crear(@PrincipalActual() principal: Principal, @Body() cuerpo: unknown): Promise<TenantDadoDeAltaDto> {
    const entrada = validar(EsquemaAltaTenant, cuerpo);
    const alta = await this.altaTenant.ejecutar({
      codigo: entrada.codigo,
      nombre: entrada.nombre,
      productoCodigo: entrada.producto_codigo,
      plan: entrada.plan,
      modalidad: entrada.modalidad,
      vigenteHasta: entrada.vigente_hasta ?? null,
      ruc: entrada.ruc,
      razonSocial: entrada.razon_social,
      nombreComercial: entrada.nombre_comercial ?? null,
      correoPropietario: entrada.correo_propietario,
      nombrePropietario: entrada.nombre_propietario,
      actor: { usuarioId: principal.usuarioId, tenantId: principal.tenantId ?? '' },
    });
    return tenantDadoDeAltaDto(alta);
  }
}

function tenantDadoDeAltaDto(alta: TenantDadoDeAlta): TenantDadoDeAltaDto {
  return {
    tenant_id: alta.tenantId,
    estado: alta.estado,
    suscripcion_id: alta.suscripcionId,
    vigente_hasta: alta.vigenteHasta,
    empresa_id: alta.empresaId,
    sucursal_id: alta.sucursalId,
    membresia_id: alta.membresiaId,
    invitacion_id: alta.invitacionId,
    expira_en: alta.expiraEn.toISOString(),
    usuario_nuevo: alta.usuarioNuevo,
    correo_enviado: alta.correoEnviado,
  };
}
