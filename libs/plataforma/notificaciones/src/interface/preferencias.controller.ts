import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Put, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiOkResponse, ApiOperation, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { LimiteTasaGuard, Publico } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { ConsultarPreferencias } from '../application/preferencias/consultar-preferencias.js';
import { RegistrarBaja } from '../application/preferencias/registrar-baja.js';
import { ALCANCES_BAJA } from '../domain/baja.js';
import { BajasDto, bajasDto, ConsultarPreferenciasDto, ErrorPreferenciasDto, PreferenciasDto, preferenciasDto, RegistrarBajaDto } from './preferencias.dto.js';
import { PlantillasFiltro, validar } from './plantillas.http.js';

/** Cota de entrada: un token real mide unos 250 caracteres. */
const TOKEN_MAXIMO = 2048;
const ENLACE_INVALIDO = 'ENLACE_INVALIDO «Enlace inválido o vencido»: firma alterada, vencido o de otra clave, sin datos (TR-CA-194)';
const DEMASIADAS_SOLICITUDES = 'DEMASIADAS_SOLICITUDES con Retry-After: más de 10 por minuto desde la misma IP';

const EsquemaToken = z.string().min(1).max(TOKEN_MAXIMO);
const EsquemaConsultar = z.object({ token: EsquemaToken });
const EsquemaRegistrar = z.object({ token: EsquemaToken, baja: z.enum(ALCANCES_BAJA) });

/**
 * TR-RF-077: la página pública `/preferencias` de plataforma-admin. Sin sesión: la autoriza el token firmado del
 * enlace del pie, que solo deja ver el destino enmascarado y darse de baja. El token va en el cuerpo para que no
 * quede en logs de acceso. No es un permiso asignable.
 */
@ApiTags('notificaciones')
@UseFilters(PlantillasFiltro)
@UseGuards(LimiteTasaGuard)
@ApiBadRequestResponse({ type: ErrorPreferenciasDto, description: `${ENLACE_INVALIDO} o SOLICITUD_INVALIDA` })
@ApiTooManyRequestsResponse({ type: ErrorPreferenciasDto, description: DEMASIADAS_SOLICITUDES })
@Controller('notificaciones/preferencias')
export class PreferenciasController {
  constructor(
    @Inject(ConsultarPreferencias) private readonly consultarPreferencias: ConsultarPreferencias,
    @Inject(RegistrarBaja) private readonly registrarBaja: RegistrarBaja,
  ) {}

  @Post('consultar')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Destino enmascarado y bajas vigentes del enlace de preferencias' })
  @ApiBody({ type: ConsultarPreferenciasDto })
  @ApiOkResponse({ type: PreferenciasDto })
  async consultar(@Body() cuerpo: unknown): Promise<PreferenciasDto> {
    const { token } = validar(EsquemaConsultar, cuerpo);
    return preferenciasDto(await this.consultarPreferencias.ejecutar(token));
  }

  @Put()
  @Publico()
  @ApiOperation({ summary: 'Darse de baja de las promociones o de todo el correo desde el enlace del pie' })
  @ApiBody({ type: RegistrarBajaDto })
  @ApiOkResponse({ type: BajasDto, description: 'Bajas vigentes tras registrar; repetir la misma no duplica' })
  async registrar(@Body() cuerpo: unknown): Promise<BajasDto> {
    const { token, baja } = validar(EsquemaRegistrar, cuerpo);
    return bajasDto(await this.registrarBaja.ejecutar(token, baja));
  }
}
