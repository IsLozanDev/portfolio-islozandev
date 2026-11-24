import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Query, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
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
import { CompararPar } from '../application/duplicados/comparar-par.js';
import { DescartarPar } from '../application/duplicados/descartar-par.js';
import { ListarDuplicados, TAMANO_PAGINA_DUPLICADOS } from '../application/duplicados/listar-duplicados.js';
import { QuitarDescarte } from '../application/duplicados/quitar-descarte.js';
import { PERMISOS_PER } from '../domain/permisos-per.js';
import {
  ComparacionParDto,
  comparacionParDto,
  PaginaDuplicadosDto,
  paginaDuplicadosDto,
  ParPersonasDto,
} from './duplicados.dto.js';
import { ErrorPersonaDto } from './personas.dto.js';
import { PersonasFiltro, validar } from './personas.http.js';

const PRIMERA_PAGINA = 1;
const EsquemaPagina = z.object({
  pagina: z.coerce.number().int().min(PRIMERA_PAGINA).default(PRIMERA_PAGINA),
  tamano: z.coerce.number().int().min(1).max(TAMANO_PAGINA_DUPLICADOS.maximo).default(TAMANO_PAGINA_DUPLICADOS.porDefecto),
});
const EsquemaParEnRuta = z.object({ a: z.uuid(), b: z.uuid() });
const EsquemaParEnCuerpo = z.object({ persona_a_id: z.uuid(), persona_b_id: z.uuid() });

const NO_ENCONTRADA = 'NO_ENCONTRADA, también si alguna persona es de otro tenant';
const MISMA_PERSONA = 'MISMA_PERSONA: los dos ids son el mismo';

/** TR-RF-042, pasos 1 y 2: pares candidatos con puntaje, comparación y descartes («no son la misma persona»). */
@ApiTags('personas')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO; o MFA requerida (aal2) para descartar' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (ids que no son uuid o paginación fuera de rango)' })
@UseFilters(PersonasFiltro)
@Controller('personas/duplicados')
export class DuplicadosController {
  constructor(
    @Inject(ListarDuplicados) private readonly listarDuplicados: ListarDuplicados,
    @Inject(CompararPar) private readonly compararPar: CompararPar,
    @Inject(DescartarPar) private readonly descartarPar: DescartarPar,
    @Inject(QuitarDescarte) private readonly quitarDescarte: QuitarDescarte,
  ) {}

  @Get()
  @Permiso(PERMISOS_PER.leer)
  @ApiQuery({ name: 'pagina', required: false, example: PRIMERA_PAGINA, description: 'Desde 1' })
  @ApiQuery({ name: 'tamano', required: false, example: TAMANO_PAGINA_DUPLICADOS.porDefecto, description: `De 1 a ${TAMANO_PAGINA_DUPLICADOS.maximo}` })
  @ApiOkResponse({
    type: PaginaDuplicadosDto,
    description: 'Personas activas sin fusionar, del mismo tipo, sin documentos distintos del mismo tipo ni descarte; por puntaje',
  })
  async listar(@Query() consulta: unknown): Promise<PaginaDuplicadosDto> {
    const { pagina, tamano } = validar(EsquemaPagina, consulta);
    return paginaDuplicadosDto(await this.listarDuplicados.ejecutar({ pagina, tamano }), pagina, tamano);
  }

  @Get(':a/:b')
  @Permiso(PERMISOS_PER.leer)
  @ApiParam({ name: 'a', format: 'uuid' })
  @ApiParam({ name: 'b', format: 'uuid' })
  @ApiOkResponse({ type: ComparacionParDto, description: 'Aunque el par esté descartado, bloqueado o bajo el umbral' })
  @ApiNotFoundResponse({ type: ErrorPersonaDto, description: NO_ENCONTRADA })
  @ApiUnprocessableEntityResponse({ type: ErrorPersonaDto, description: MISMA_PERSONA })
  async comparar(@Param() parametros: unknown): Promise<ComparacionParDto> {
    const { a, b } = validar(EsquemaParEnRuta, parametros);
    return comparacionParDto(await this.compararPar.ejecutar(a, b));
  }

  @Post('descartes')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permiso(PERMISOS_PER.fusionar)
  @ApiBody({ type: ParPersonasDto })
  @ApiNoContentResponse({ description: 'El par no se vuelve a proponer; descartar dos veces responde igual' })
  @ApiNotFoundResponse({ type: ErrorPersonaDto, description: NO_ENCONTRADA })
  @ApiUnprocessableEntityResponse({ type: ErrorPersonaDto, description: MISMA_PERSONA })
  async descartar(@Body() cuerpo: unknown): Promise<void> {
    const { persona_a_id: personaA, persona_b_id: personaB } = validar(EsquemaParEnCuerpo, cuerpo);
    await this.descartarPar.ejecutar(personaA, personaB);
  }

  @Delete('descartes/:a/:b')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permiso(PERMISOS_PER.fusionar)
  @ApiParam({ name: 'a', format: 'uuid' })
  @ApiParam({ name: 'b', format: 'uuid' })
  @ApiNoContentResponse({ description: 'El par vuelve a la lista si cumple alguna regla' })
  @ApiNotFoundResponse({ type: ErrorPersonaDto, description: `${NO_ENCONTRADA}, o DESCARTE_NO_ENCONTRADO` })
  @ApiUnprocessableEntityResponse({ type: ErrorPersonaDto, description: MISMA_PERSONA })
  async quitar(@Param() parametros: unknown): Promise<void> {
    const { a, b } = validar(EsquemaParEnRuta, parametros);
    await this.quitarDescarte.ejecutar(a, b);
  }
}
