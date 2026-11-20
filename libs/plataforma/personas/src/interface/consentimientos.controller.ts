import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query, UseFilters } from '@nestjs/common';
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
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Permiso } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { ConsultarConsentimientos } from '../application/consentimientos/consultar-consentimientos.js';
import { RegistrarConsentimientos } from '../application/consentimientos/registrar-consentimientos.js';
import { RevocarConsentimiento } from '../application/consentimientos/revocar-consentimiento.js';
import { CANALES, FINALIDADES } from '../domain/consentimiento.js';
import { PERMISOS_PER } from '../domain/permisos-per.js';
import {
  ConsentimientosPersonaDto,
  DecisionesRegistradasDto,
  DecisionRegistradaDto,
  decisionPorFinalidadDto,
  decisionRegistradaDto,
  ErrorConsentimientoDto,
  MAXIMO_DECISIONES_POR_LOTE,
  RegistrarConsentimientosDto,
  RevocarConsentimientoDto,
} from './consentimientos.dto.js';
import { EsquemaPersonaId, texto } from './esquemas.js';
import { PersonasFiltro, validar } from './personas.http.js';

/** Cotas de entrada: la lista de decisiones y el formato de la versión los valida el dominio, con su código. */
const LONGITUD_MAXIMA_DECISION = 10;
const LONGITUD_MAXIMA_VERSION = 40;

// `decision` y `accion_expresa` pueden faltar aquí: el dominio responde 422 DATOS_INVALIDOS o ACCION_EXPRESA_REQUERIDA.
const EsquemaDecision = z.object({
  finalidad: z.enum(FINALIDADES),
  decision: texto(LONGITUD_MAXIMA_DECISION).optional(),
  version_texto: texto(LONGITUD_MAXIMA_VERSION),
  accion_expresa: z.boolean().optional(),
});
const EsquemaRegistrar = z.object({
  canal: z.enum(CANALES),
  evidencia_archivo_id: z.uuid().optional(),
  decisiones: z.array(EsquemaDecision).min(1).max(MAXIMO_DECISIONES_POR_LOTE),
});
const EsquemaRevocar = z.object({ canal: z.enum(CANALES) });
const EsquemaFinalidadEnRuta = EsquemaPersonaId.extend({ finalidad: z.enum(FINALIDADES) });
const EsquemaConsulta = z.object({ historial: z.enum(['true', 'false']).optional() });

const NO_ENCONTRADA = 'NO_ENCONTRADA, también si la persona es de otro tenant';

/** TR-RF-043: decisiones de consentimiento de una persona por finalidad, con revocación. */
@ApiTags('personas')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (campos faltantes, demasiado largos o fuera de lista)' })
@UseFilters(PersonasFiltro)
@Controller('personas/:id/consentimientos')
export class ConsentimientosPersonaController {
  constructor(
    @Inject(ConsultarConsentimientos) private readonly consultar: ConsultarConsentimientos,
    @Inject(RegistrarConsentimientos) private readonly registrarDecisiones: RegistrarConsentimientos,
    @Inject(RevocarConsentimiento) private readonly revocarConsentimiento: RevocarConsentimiento,
  ) {}

  @Get()
  @Permiso(PERMISOS_PER.leer)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiQuery({ name: 'historial', required: false, enum: ['true', 'false'], description: 'true: todas las decisiones, revocadas incluidas' })
  @ApiOkResponse({ type: ConsentimientosPersonaDto })
  @ApiNotFoundResponse({ type: ErrorConsentimientoDto, description: NO_ENCONTRADA })
  async leer(@Param() parametros: unknown, @Query() consulta: unknown): Promise<ConsentimientosPersonaDto> {
    const { id } = validar(EsquemaPersonaId, parametros);
    const { historial } = validar(EsquemaConsulta, consulta);
    if (historial === 'true') return { persona_id: id, historial: (await this.consultar.historial(id)).map(decisionRegistradaDto) };
    return { persona_id: id, vigentes: (await this.consultar.vigentes(id)).map(decisionPorFinalidadDto) };
  }

  @Post()
  @Permiso(PERMISOS_PER.consentimiento)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: RegistrarConsentimientosDto })
  @ApiCreatedResponse({ type: DecisionesRegistradasDto, description: 'Las decisiones nuevas; un RECHAZA sobre un ACEPTA vigente lo revoca' })
  @ApiUnprocessableEntityResponse({
    type: ErrorConsentimientoDto,
    description: 'ACCION_EXPRESA_REQUERIDA, DATOS_INVALIDOS, FINALIDAD_REPETIDA o EVIDENCIA_INVALIDA (motivo NO_DISPONIBLE o CATEGORIA)',
  })
  @ApiNotFoundResponse({ type: ErrorConsentimientoDto, description: `${NO_ENCONTRADA}, o EVIDENCIA_NO_ENCONTRADA` })
  @ApiConflictResponse({
    type: ErrorConsentimientoDto,
    description: 'VERSION_TEXTO_NO_VIGENTE (con la vigente), TEXTO_NO_PUBLICADO, o conflict si otra operación decidió lo mismo',
  })
  async registrar(@Param() parametros: unknown, @Body() cuerpo: unknown): Promise<DecisionesRegistradasDto> {
    const { id } = validar(EsquemaPersonaId, parametros);
    const datos = validar(EsquemaRegistrar, cuerpo);
    const decisiones = await this.registrarDecisiones.ejecutar({
      personaId: id,
      canal: datos.canal,
      evidenciaArchivoId: datos.evidencia_archivo_id,
      decisiones: datos.decisiones.map((decision) => ({
        finalidad: decision.finalidad,
        decision: decision.decision,
        versionTexto: decision.version_texto,
        accionExpresa: decision.accion_expresa,
      })),
    });
    return { persona_id: id, decisiones: decisiones.map(decisionRegistradaDto) };
  }

  @Post(':finalidad/revocar')
  @HttpCode(HttpStatus.OK)
  @Permiso(PERMISOS_PER.consentimiento)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'finalidad', enum: FINALIDADES })
  @ApiBody({ type: RevocarConsentimientoDto })
  @ApiOkResponse({ type: DecisionRegistradaDto, description: 'La decisión revocada; publica consentimiento.revocado' })
  @ApiNotFoundResponse({ type: ErrorConsentimientoDto, description: NO_ENCONTRADA })
  @ApiConflictResponse({ type: ErrorConsentimientoDto, description: 'SIN_CONSENTIMIENTO_VIGENTE, o conflict si otra operación la revocó' })
  async revocar(@Param() parametros: unknown, @Body() cuerpo: unknown): Promise<DecisionRegistradaDto> {
    const { id, finalidad } = validar(EsquemaFinalidadEnRuta, parametros);
    const { canal } = validar(EsquemaRevocar, cuerpo);
    return decisionRegistradaDto(await this.revocarConsentimiento.ejecutar({ personaId: id, finalidad, canal }));
  }
}
