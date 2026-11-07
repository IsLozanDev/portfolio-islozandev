import { Body, Controller, Headers, HttpCode, Inject, Ip, Post, Req, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IngresarConClave } from '../application/ingresar-con-clave.js';
import { VerificarMfa } from '../application/verificar-mfa.js';
import type { Principal } from '../domain/principal.js';
import { EscrituraPermitidaEnSoporte, PrincipalActual, Publico } from './decoradores.js';
import { EsquemaIngresar, EsquemaVerificarMfa, IngresarDto, IngresoFiltro, SesionEmitidaDto, sesionEmitidaDto, VerificarMfaDto } from './ingreso.http.js';
import { validar } from './membresias.http.js';
import { tokenBearer } from './respuestas.js';

const HTTP_OK = 200;
const BLOQUEO = 'INGRESO_BLOQUEADO, con Retry-After y reintentarEnSeg';
const NO_DISPONIBLE = 'INGRESO_NO_DISPONIBLE: Supabase Auth no respondió';

interface SolicitudConCabeceras {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Ingreso con contraseña y MFA a través de la API, para registrar los fallos y bloquear la fuerza
 * bruta (spec 18b). El cuerpo trae la clave o el código: nunca se loguea ni se devuelve en un error.
 */
@ApiTags('seg')
@UseFilters(IngresoFiltro)
@Controller('seg/auth')
export class IngresoController {
  constructor(
    @Inject(IngresarConClave) private readonly ingresarConClave: IngresarConClave,
    @Inject(VerificarMfa) private readonly verificarMfa: VerificarMfa,
  ) {}

  @Post('ingresar')
  @Publico()
  @HttpCode(HTTP_OK)
  @ApiBody({ type: IngresarDto })
  @ApiOkResponse({ type: SesionEmitidaDto, description: 'Sesión aal1 para supabase.auth.setSession' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (solo los nombres de los campos)' })
  @ApiUnauthorizedResponse({ description: 'CREDENCIALES_INVALIDAS: no revela si la cuenta existe' })
  @ApiTooManyRequestsResponse({ description: BLOQUEO })
  @ApiServiceUnavailableResponse({ description: NO_DISPONIBLE })
  async ingresar(@Body() cuerpo: unknown, @Ip() ip: string, @Headers('user-agent') agente: string | undefined): Promise<SesionEmitidaDto> {
    const datos = validar(EsquemaIngresar, cuerpo);
    const sesion = await this.ingresarConClave.ejecutar({ correo: datos.correo, clave: datos.clave, ip, agente: agente ?? null });
    return sesionEmitidaDto(sesion);
  }

  @Post('mfa/verificar')
  @HttpCode(HTTP_OK)
  // Una sesión de soporte de solo lectura también confirma su segundo factor; se audita igual (spec 18).
  @EscrituraPermitidaEnSoporte()
  @ApiBearerAuth()
  @ApiBody({ type: VerificarMfaDto })
  @ApiOkResponse({ type: SesionEmitidaDto, description: 'Sesión aal2 para supabase.auth.setSession' })
  @ApiBadRequestResponse({ description: 'CODIGO_MFA_INVALIDO o SOLICITUD_INVALIDA' })
  @ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
  @ApiTooManyRequestsResponse({ description: BLOQUEO })
  @ApiServiceUnavailableResponse({ description: NO_DISPONIBLE })
  async verificar(
    @PrincipalActual() principal: Principal,
    @Req() solicitud: SolicitudConCabeceras,
    @Body() cuerpo: unknown,
    @Ip() ip: string,
    @Headers('user-agent') agente: string | undefined,
  ): Promise<SesionEmitidaDto> {
    const datos = validar(EsquemaVerificarMfa, cuerpo);
    const sesion = await this.verificarMfa.ejecutar({
      usuarioId: principal.usuarioId,
      tenantId: principal.tenantId,
      // AutenticacionGuard ya verificó este mismo token.
      accessToken: tokenBearer(solicitud) ?? '',
      factorId: datos.factorId,
      codigo: datos.codigo,
      ip,
      agente: agente ?? null,
    });
    return sesionEmitidaDto(sesion);
  }
}
