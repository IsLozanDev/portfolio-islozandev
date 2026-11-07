import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Query, Res, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Permiso, PrincipalActual, type Principal } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { AplicarImportacion } from '../application/importacion/aplicar-importacion.js';
import { ConsultarImportacion } from '../application/importacion/consultar-importacion.js';
import { DescargarErrores } from '../application/importacion/descargar-errores.js';
import { ListarImportaciones, TAMANO_PAGINA_MAXIMO } from '../application/importacion/listar-importaciones.js';
import { PrevisualizarImportacion } from '../application/importacion/previsualizar-importacion.js';
import { SeguirImportacion } from '../application/importacion/seguir-importacion.js';
import { ImportacionNoEncontradaError } from '../domain/importacion/errores.js';
import { TAMANO_MAXIMO_ARCHIVO } from '../domain/importacion/tipos.js';
import { PERMISOS_CAT } from '../domain/permisos-cat.js';
import { esFecha } from '../domain/vigencia.js';
import { CatalogosFiltro, validar } from './catalogos.http.js';
import {
  AplicarImportacionDto,
  AvisoImportacionDto,
  DetalleImportacionDto,
  FilasInvalidasDto,
  HistorialImportacionesDto,
  ImportacionActivaDto,
  ImportacionEncoladaDto,
  PrevisualizacionDto,
  PrevisualizarImportacionDto,
} from './importaciones.dto.js';
import { ArchivoGrandeFiltro, descargarCsv, transmitirAvisos, type RespuestaEnStreaming } from './importaciones.http.js';
import { activaDto, detalleDto, historialDto, previsualizacionDto } from './importaciones.respuestas.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTERO_POSITIVO = /^[1-9][0-9]*$/;
const VERSION_OFICIAL_MAXIMA = 40;
const PAGINA_POR_DEFECTO = 1;
const TAMANO_POR_DEFECTO = 20;
const CAMPO_ARCHIVO = 'archivo';
/** El resto del multipart son dos campos de texto: nada más pasa. */
const LIMITES_MULTIPART = { fileSize: TAMANO_MAXIMO_ARCHIVO, files: 1, fields: 2 };

const EsquemaPrevisualizar = z.object({
  version_oficial: z.string().min(1).max(VERSION_OFICIAL_MAXIMA),
  fecha_vigencia: z.string().refine(esFecha),
});
const EsquemaHistorial = z.object({
  pagina: z.string().regex(ENTERO_POSITIVO).optional(),
  tamano: z
    .string()
    .regex(ENTERO_POSITIVO)
    .refine((tamano) => Number(tamano) <= TAMANO_PAGINA_MAXIMO)
    .optional(),
});
const EsquemaActivas = z.object({ activas: z.literal('true') });
const EsquemaAplicar = z.object({ version: z.number().int().min(0) });

/** Lo que deja multer en memoria: nada toca el disco. */
interface ArchivoSubido {
  originalname: string;
  buffer: Buffer;
}

/**
 * Importación de las tablas oficiales (TR-RF-028). Todas exigen `plat.catalogo.importar` (sensible: MFA) y
 * el tenant operador. Va antes que CatalogosController: las rutas `importaciones` no deben tomarse por un `{codigo}`.
 */
@ApiTags('catalogos')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO o MFA_REQUERIDA (permiso sensible, TR-RN-009)' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO, SUCURSAL_NO_ASIGNADA u OPERADOR_REQUERIDO' })
@UseFilters(CatalogosFiltro, ArchivoGrandeFiltro)
@Controller('catalogos')
export class ImportacionesController {
  constructor(
    @Inject(PrevisualizarImportacion) private readonly previsualizarImportacion: PrevisualizarImportacion,
    @Inject(ListarImportaciones) private readonly listarImportaciones: ListarImportaciones,
    @Inject(ConsultarImportacion) private readonly consultarImportacion: ConsultarImportacion,
    @Inject(DescargarErrores) private readonly descargarErrores: DescargarErrores,
    @Inject(AplicarImportacion) private readonly aplicarImportacion: AplicarImportacion,
    @Inject(SeguirImportacion) private readonly seguirImportacion: SeguirImportacion,
  ) {}

  @Get('importaciones')
  @Permiso(PERMISOS_CAT.importar)
  @ApiQuery({ name: 'activas', required: true, enum: ['true'] })
  @ApiOkResponse({ type: [ImportacionActivaDto], description: 'Las EN_COLA que lanzó el usuario, con estado y avance desde Redis' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  async activas(@PrincipalActual() principal: Principal, @Query() consulta: unknown): Promise<ImportacionActivaDto[]> {
    validar(EsquemaActivas, consulta);
    return (await this.listarImportaciones.activas({ actorId: principal.usuarioId })).map(activaDto);
  }

  @Get('importaciones/:id/errores.csv')
  @Permiso(PERMISOS_CAT.importar)
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'BOM UTF-8, separador `;`, `fila;columna;valor;mensaje`, hasta 10 000 líneas' })
  @ApiNotFoundResponse({ description: 'IMPORTACION_NO_ENCONTRADA' })
  @ApiConflictResponse({ description: 'IMPORTACION_NO_APLICABLE: no está RECHAZADA' })
  async errores(@Param('id') id: string, @Res() respuesta: RespuestaEnStreaming): Promise<void> {
    const reporte = await this.descargarErrores.ejecutar({ id: exigirUuid(id) });
    descargarCsv(respuesta, reporte.nombreArchivo, reporte.lineas);
  }

  @Get('importaciones/:id/eventos')
  @Permiso(PERMISOS_CAT.importar)
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    type: AvisoImportacionDto,
    description: 'Eventos `avance` y `fin` (data = aviso en JSON), `: ping` cada 15 s; cierra con el `fin` o a los 15 min',
  })
  @ApiNotFoundResponse({ description: 'IMPORTACION_NO_ENCONTRADA: no existe o la lanzó otro usuario' })
  @ApiConflictResponse({ description: 'IMPORTACION_NO_APLICABLE: no está en cola ni terminó de aplicarse' })
  async eventos(@PrincipalActual() principal: Principal, @Param('id') id: string, @Res() respuesta: RespuestaEnStreaming): Promise<void> {
    const cierre = new AbortController();
    const avisos = await this.seguirImportacion.ejecutar({ id: exigirUuid(id), actorId: principal.usuarioId, senal: cierre.signal });
    await transmitirAvisos(respuesta, avisos, cierre);
  }

  @Get('importaciones/:id')
  @Permiso(PERMISOS_CAT.importar)
  @ApiOkResponse({ type: DetalleImportacionDto })
  @ApiNotFoundResponse({ description: 'IMPORTACION_NO_ENCONTRADA' })
  async detalle(@Param('id') id: string): Promise<DetalleImportacionDto> {
    return detalleDto(await this.consultarImportacion.ejecutar({ id: exigirUuid(id) }));
  }

  @Post('importaciones/:id/aplicar')
  @Permiso(PERMISOS_CAT.importar)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({ type: AplicarImportacionDto })
  @ApiAcceptedResponse({ type: ImportacionEncoladaDto, description: 'Encolada: la aplica el worker y el avance llega por SSE' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  @ApiNotFoundResponse({ description: 'IMPORTACION_NO_ENCONTRADA' })
  @ApiConflictResponse({ description: 'IMPORTACION_NO_APLICABLE (también si venció a las 24 h), IMPORTACION_EN_CURSO o VERSION_OBSOLETA' })
  @ApiServiceUnavailableResponse({ description: 'COLA_NO_DISPONIBLE: la importación sigue PREVISUALIZADA' })
  async aplicar(@PrincipalActual() principal: Principal, @Param('id') id: string, @Body() cuerpo: unknown): Promise<ImportacionEncoladaDto> {
    const { version } = validar(EsquemaAplicar, cuerpo);
    return this.aplicarImportacion.ejecutar({ id: exigirUuid(id), version, actorId: principal.usuarioId });
  }

  @Post(':codigo/importaciones')
  @Permiso(PERMISOS_CAT.importar)
  @UseInterceptors(FileInterceptor(CAMPO_ARCHIVO, { limits: LIMITES_MULTIPART }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: PrevisualizarImportacionDto })
  @ApiCreatedResponse({ type: PrevisualizacionDto, description: 'Valida el archivo completo sin tocar ningún ítem' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA, TABLA_NO_IMPORTABLE, ARCHIVO_INVALIDO o COLUMNAS_INVALIDAS (TR-CA-073)' })
  @ApiNotFoundResponse({ description: 'CATALOGO_NO_EXISTE' })
  @ApiPayloadTooLargeResponse({ description: 'ARCHIVO_DEMASIADO_GRANDE: más de 20 MB' })
  @ApiUnprocessableEntityResponse({ type: FilasInvalidasDto, description: 'FILAS_INVALIDAS: queda RECHAZADA y no se importó nada' })
  async previsualizar(
    @PrincipalActual() principal: Principal,
    @Param('codigo') codigo: string,
    @UploadedFile() archivo: ArchivoSubido | undefined,
    @Body() cuerpo: unknown,
  ): Promise<PrevisualizacionDto> {
    const datos = validar(EsquemaPrevisualizar, cuerpo);
    if (!archivo) throw new HttpException({ codigo: 'SOLICITUD_INVALIDA', errores: [CAMPO_ARCHIVO] }, HttpStatus.BAD_REQUEST);
    const previsualizacion = await this.previsualizarImportacion.ejecutar({
      catalogo: codigo,
      archivo: { nombre: archivo.originalname, contenido: archivo.buffer },
      versionOficial: datos.version_oficial,
      fechaVigencia: datos.fecha_vigencia,
      actorId: principal.usuarioId,
    });
    return previsualizacionDto(previsualizacion);
  }

  @Get(':codigo/importaciones')
  @Permiso(PERMISOS_CAT.importar)
  @ApiQuery({ name: 'pagina', required: false })
  @ApiQuery({ name: 'tamano', required: false, description: 'Hasta 50' })
  @ApiOkResponse({ type: HistorialImportacionesDto, description: 'La más reciente primero, con las RECHAZADA y su total de errores' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  @ApiNotFoundResponse({ description: 'CATALOGO_NO_EXISTE' })
  async historial(@Param('codigo') codigo: string, @Query() consulta: unknown): Promise<HistorialImportacionesDto> {
    const { pagina, tamano } = validar(EsquemaHistorial, consulta);
    const listado = await this.listarImportaciones.historial({
      catalogo: codigo,
      pagina: pagina ? Number(pagina) : PAGINA_POR_DEFECTO,
      tamano: tamano ? Number(tamano) : TAMANO_POR_DEFECTO,
    });
    return historialDto(listado);
  }
}

/** Un id que no es UUID no puede existir: 404 sin llegar al caso de uso. */
function exigirUuid(id: string): string {
  if (!UUID.test(id)) throw new ImportacionNoEncontradaError();
  return id;
}
