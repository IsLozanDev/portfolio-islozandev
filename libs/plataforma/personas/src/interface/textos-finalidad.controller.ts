import { Body, Controller, Get, Inject, Post, Query, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Permiso } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { ConsultarTextos } from '../application/consentimientos/consultar-textos.js';
import { PublicarTextoFinalidad } from '../application/consentimientos/publicar-texto-finalidad.js';
import { FINALIDADES } from '../domain/consentimiento.js';
import { PERMISOS_PER } from '../domain/permisos-per.js';
import { LONGITUD_MAXIMA_TEXTO_LEGAL } from '../domain/texto-finalidad.js';
import { ErrorConsentimientoDto, PublicarTextoDto, TextoPublicadoDto, textoPublicadoDto } from './consentimientos.dto.js';
import { texto } from './esquemas.js';
import { PersonasFiltro, validar } from './personas.http.js';

// Cotas de entrada: el formato de la versión y el largo del texto los valida el dominio con DATOS_INVALIDOS.
const LONGITUD_MAXIMA_VERSION = 40;
/** zod cuenta unidades UTF-16 y el dominio caracteres: un carácter fuera del plano básico ocupa dos. */
const COTA_TEXTO_EN_UNIDADES = 2 * LONGITUD_MAXIMA_TEXTO_LEGAL;

const EsquemaPublicar = z.object({
  finalidad: z.enum(FINALIDADES),
  version: texto(LONGITUD_MAXIMA_VERSION),
  texto: texto(COTA_TEXTO_EN_UNIDADES),
});
const EsquemaConsulta = z.object({ finalidad: z.enum(FINALIDADES).optional() });

/** Textos de consentimiento por finalidad del tenant. Publicado no se edita: una corrección es otra versión. */
@ApiTags('personas')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (campos faltantes, demasiado largos o fuera de lista)' })
@UseFilters(PersonasFiltro)
@Controller('consentimientos/textos')
export class TextosFinalidadController {
  constructor(
    @Inject(ConsultarTextos) private readonly consultar: ConsultarTextos,
    @Inject(PublicarTextoFinalidad) private readonly publicarTexto: PublicarTextoFinalidad,
  ) {}

  @Get()
  @Permiso(PERMISOS_PER.leer)
  @ApiQuery({ name: 'finalidad', required: false, enum: FINALIDADES, description: 'Con finalidad: su historial, del más reciente al más antiguo' })
  @ApiOkResponse({ type: [TextoPublicadoDto], description: 'Sin finalidad: el vigente de cada finalidad publicada' })
  async leer(@Query() consulta: unknown): Promise<TextoPublicadoDto[]> {
    const { finalidad } = validar(EsquemaConsulta, consulta);
    const textos = finalidad ? await this.consultar.historial(finalidad) : await this.consultar.vigentes();
    return textos.map(textoPublicadoDto);
  }

  @Post()
  @Permiso(PERMISOS_PER.textoFinalidad)
  @ApiBody({ type: PublicarTextoDto })
  @ApiCreatedResponse({ type: TextoPublicadoDto, description: 'Vigente desde ya; los consentimientos aceptados con otra versión siguen vigentes' })
  @ApiUnprocessableEntityResponse({ type: ErrorConsentimientoDto, description: 'DATOS_INVALIDOS (versión o largo del texto)' })
  @ApiConflictResponse({ type: ErrorConsentimientoDto, description: 'VERSION_TEXTO_DUPLICADA' })
  async publicar(@Body() cuerpo: unknown): Promise<TextoPublicadoDto> {
    return textoPublicadoDto(await this.publicarTexto.ejecutar(validar(EsquemaPublicar, cuerpo)));
  }
}
