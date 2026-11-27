import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Query, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permiso } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { ConsultarPlantilla } from '../application/plantillas/consultar-plantilla.js';
import { ListarPlantillas } from '../application/plantillas/listar-plantillas.js';
import { ListarVersionesPlantilla } from '../application/plantillas/listar-versiones-plantilla.js';
import { PersonalizarPlantilla } from '../application/plantillas/personalizar-plantilla.js';
import { RestaurarPlantillaBase } from '../application/plantillas/restaurar-plantilla-base.js';
import { VistaPreviaPlantilla } from '../application/plantillas/vista-previa-plantilla.js';
import { CANALES_HABILITADOS } from '../domain/canal.js';
import { PERMISOS_PLANTILLAS } from '../domain/permisos-not.js';
import {
  ErrorPlantillaDto,
  PaginaPlantillasDto,
  paginaPlantillasDto,
  PersonalizarPlantillaDto,
  PlantillaDto,
  plantillaDto,
  VersionPlantillaDto,
  versionPlantillaDto,
  VistaPreviaDto,
  vistaPreviaDto,
  VistaPreviaSolicitudDto,
} from './plantillas.dto.js';
import { PlantillasFiltro, validar } from './plantillas.http.js';

const PAGINA_POR_DEFECTO = 1;
const TAMANO_POR_DEFECTO = 25;
const TAMANO_MAXIMO = 100;
const TEXTO_BUSQUEDA_MAXIMO = 60;
const CANAL_MAXIMO = 10;
/** Cota de entrada antes de sanear: el largo real del cuerpo (100 000) lo valida el dominio con su código. */
const CUERPO_RECIBIDO_MAXIMO = 1_000_000;
const ASUNTO_RECIBIDO_MAXIMO = 10_000;

const EsquemaListar = z.object({
  canal: z.string().max(CANAL_MAXIMO).optional(),
  q: z.string().max(TEXTO_BUSQUEDA_MAXIMO).optional(),
  pagina: z.coerce.number().int().min(1).default(PAGINA_POR_DEFECTO),
  tamano: z.coerce.number().int().min(1).max(TAMANO_MAXIMO).default(TAMANO_POR_DEFECTO),
});
const EsquemaPersonalizar = z.object({
  asunto: z.string().max(ASUNTO_RECIBIDO_MAXIMO),
  cuerpo: z.string().max(CUERPO_RECIBIDO_MAXIMO),
  version: z.number().int().positive().nullable(),
});
const EsquemaVistaPrevia = z.object({
  asunto: z.string().max(ASUNTO_RECIBIDO_MAXIMO).optional(),
  cuerpo: z.string().max(CUERPO_RECIBIDO_MAXIMO).optional(),
});

const CODIGO_EJEMPLO = 'PRUEBA_CORREO';
const CANAL_NO_HABILITADO = 'CANAL_NO_HABILITADO: canal distinto de CORREO';
const SIN_BASE = 'PLANTILLA_NO_ENCONTRADA: el código no tiene base o no es personalizable';
const VALIDACION_CONTENIDO = `VARIABLE_NO_PERMITIDA (con \`variables\`), CONTENIDO_PLANTILLA_INVALIDO, ASUNTO_DEMASIADO_LARGO, ${CANAL_NO_HABILITADO} o SOLICITUD_INVALIDA`;

/**
 * TR-RF-074 (parte back): el tenant personaliza las plantillas base de plataforma. Cada PUT guarda una versión
 * nueva con el HTML saneado; restaurar desactiva las del tenant y vuelve a regir la base. Solo CORREO e idioma es.
 */
@ApiTags('notificaciones')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@UseFilters(PlantillasFiltro)
@Controller('notificaciones/plantillas')
export class PlantillasController {
  constructor(
    @Inject(ListarPlantillas) private readonly listarPlantillas: ListarPlantillas,
    @Inject(ConsultarPlantilla) private readonly consultarPlantilla: ConsultarPlantilla,
    @Inject(ListarVersionesPlantilla) private readonly listarVersiones: ListarVersionesPlantilla,
    @Inject(VistaPreviaPlantilla) private readonly vistaPrevia: VistaPreviaPlantilla,
    @Inject(PersonalizarPlantilla) private readonly personalizarPlantilla: PersonalizarPlantilla,
    @Inject(RestaurarPlantillaBase) private readonly restaurarBase: RestaurarPlantillaBase,
  ) {}

  @Get()
  @Permiso(PERMISOS_PLANTILLAS.consultar)
  @ApiQuery({ name: 'canal', required: false, enum: CANALES_HABILITADOS })
  @ApiQuery({ name: 'q', required: false, description: `Busca en nombre, código y asunto, sin distinguir mayúsculas; hasta ${TEXTO_BUSQUEDA_MAXIMO} caracteres` })
  @ApiQuery({ name: 'pagina', required: false, example: PAGINA_POR_DEFECTO, description: 'Desde 1' })
  @ApiQuery({ name: 'tamano', required: false, example: TAMANO_POR_DEFECTO, description: `De 1 a ${TAMANO_MAXIMO}` })
  @ApiOkResponse({ type: PaginaPlantillasDto, description: 'Una fila por código: la personalizada vigente o la base' })
  @ApiBadRequestResponse({ type: ErrorPlantillaDto, description: `${CANAL_NO_HABILITADO} o SOLICITUD_INVALIDA` })
  async listar(@Query() consulta: unknown): Promise<PaginaPlantillasDto> {
    const datos = validar(EsquemaListar, consulta);
    return paginaPlantillasDto(await this.listarPlantillas.ejecutar(datos));
  }

  @Get(':codigo/:canal')
  @Permiso(PERMISOS_PLANTILLAS.consultar)
  @ApiParam({ name: 'codigo', example: CODIGO_EJEMPLO })
  @ApiParam({ name: 'canal', enum: CANALES_HABILITADOS })
  @ApiOkResponse({ type: PlantillaDto, description: 'La vigente para el tenant, sus variables y el texto de la base' })
  @ApiBadRequestResponse({ type: ErrorPlantillaDto, description: CANAL_NO_HABILITADO })
  @ApiNotFoundResponse({ type: ErrorPlantillaDto, description: SIN_BASE })
  async consultar(@Param('codigo') codigo: string, @Param('canal') canal: string): Promise<PlantillaDto> {
    return plantillaDto(await this.consultarPlantilla.ejecutar(codigo, canal));
  }

  @Get(':codigo/:canal/versiones')
  @Permiso(PERMISOS_PLANTILLAS.consultar)
  @ApiParam({ name: 'codigo', example: CODIGO_EJEMPLO })
  @ApiParam({ name: 'canal', enum: CANALES_HABILITADOS })
  @ApiOkResponse({ type: [VersionPlantillaDto], description: 'Personalizaciones del tenant, de la más nueva a la más vieja, sin texto' })
  @ApiBadRequestResponse({ type: ErrorPlantillaDto, description: CANAL_NO_HABILITADO })
  async versiones(@Param('codigo') codigo: string, @Param('canal') canal: string): Promise<VersionPlantillaDto[]> {
    return (await this.listarVersiones.ejecutar(codigo, canal)).map(versionPlantillaDto);
  }

  @Post(':codigo/:canal/vista-previa')
  @HttpCode(HttpStatus.OK)
  @Permiso(PERMISOS_PLANTILLAS.consultar)
  @ApiParam({ name: 'codigo', example: CODIGO_EJEMPLO })
  @ApiParam({ name: 'canal', enum: CANALES_HABILITADOS })
  @ApiBody({ type: VistaPreviaSolicitudDto })
  @ApiOkResponse({ type: VistaPreviaDto, description: 'Renderizada con los valores de ejemplo; no guarda ni envía nada' })
  @ApiBadRequestResponse({ type: ErrorPlantillaDto, description: VALIDACION_CONTENIDO })
  @ApiNotFoundResponse({ type: ErrorPlantillaDto, description: SIN_BASE })
  async previsualizar(@Param('codigo') codigo: string, @Param('canal') canal: string, @Body() cuerpo: unknown): Promise<VistaPreviaDto> {
    const texto = validar(EsquemaVistaPrevia, cuerpo ?? {});
    return vistaPreviaDto(await this.vistaPrevia.ejecutar(codigo, canal, texto));
  }

  @Put(':codigo/:canal')
  @Permiso(PERMISOS_PLANTILLAS.gestionar)
  @ApiParam({ name: 'codigo', example: CODIGO_EJEMPLO })
  @ApiParam({ name: 'canal', enum: CANALES_HABILITADOS })
  @ApiBody({ type: PersonalizarPlantillaDto })
  @ApiOkResponse({ type: PlantillaDto, description: 'La versión nueva, con el cuerpo saneado' })
  @ApiBadRequestResponse({ type: ErrorPlantillaDto, description: VALIDACION_CONTENIDO })
  @ApiNotFoundResponse({ type: ErrorPlantillaDto, description: SIN_BASE })
  @ApiConflictResponse({ type: ErrorPlantillaDto, description: 'VERSION_OBSOLETA: otra personalización se guardó desde la lectura' })
  async personalizar(@Param('codigo') codigo: string, @Param('canal') canal: string, @Body() cuerpo: unknown): Promise<PlantillaDto> {
    const contenido = validar(EsquemaPersonalizar, cuerpo);
    return plantillaDto(await this.personalizarPlantilla.ejecutar(codigo, canal, contenido));
  }

  @Delete(':codigo/:canal/personalizacion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permiso(PERMISOS_PLANTILLAS.gestionar)
  @ApiParam({ name: 'codigo', example: CODIGO_EJEMPLO })
  @ApiParam({ name: 'canal', enum: CANALES_HABILITADOS })
  @ApiNoContentResponse({ description: 'Vuelve a regir la base; las versiones del tenant quedan inactivas en el historial' })
  @ApiBadRequestResponse({ type: ErrorPlantillaDto, description: CANAL_NO_HABILITADO })
  @ApiNotFoundResponse({ type: ErrorPlantillaDto, description: `SIN_PERSONALIZACION: no hay versión activa del tenant. ${SIN_BASE}` })
  async restaurar(@Param('codigo') codigo: string, @Param('canal') canal: string): Promise<void> {
    await this.restaurarBase.ejecutar(codigo, canal);
  }
}
