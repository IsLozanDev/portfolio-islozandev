import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query, Res, UseFilters } from '@nestjs/common';
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
  ApiProduces,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { transmitirEventosSse, type RespuestaEnStreaming } from '@vitrina/plataforma/kernel-infra';
import { Permiso, PrincipalActual, type Principal } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { ConfirmarCarga } from '../application/confirmar-carga.js';
import { ConfirmarVersion } from '../application/confirmar-version.js';
import { ConsultarEstadoArchivo } from '../application/consultar-estado.js';
import { EmitirUrlDescarga } from '../application/emitir-url-descarga.js';
import { ListarCategorias } from '../application/listar-categorias.js';
import { ListarVersiones } from '../application/listar-versiones.js';
import { MarcarVersionVigente } from '../application/marcar-version-vigente.js';
import { SeguirAnalisis } from '../application/seguir-analisis.js';
import { SolicitarCarga } from '../application/solicitar-carga.js';
import { SolicitarVersion } from '../application/solicitar-version.js';
import { NUMERO_PRIMERA_VERSION } from '../domain/archivo.js';
import { PERMISOS_ARC } from '../domain/permisos-arc.js';
import { DISPOSICIONES, VIGENCIA_MAXIMA_SEGUNDOS, VIGENCIA_MINIMA_SEGUNDOS } from '../domain/vigencia-descarga.js';
import {
  CargaSolicitadaDto,
  CategoriaDto,
  AvisoAnalisisDto,
  ErrorArchivoDto,
  EstadoArchivoDto,
  MarcarVigenteDto,
  SolicitarCargaDto,
  SolicitarVersionDto,
  UrlDescargaDto,
  VersionDto,
  VersionesArchivoDto,
  VersionSolicitadaDto,
  cargaSolicitadaDto,
  categoriaDto,
  estadoArchivoDto,
  urlDescargaDto,
  versionDto,
  versionesArchivoDto,
  versionSolicitadaDto,
} from './archivos.dto.js';
import { ArchivosFiltro, validar } from './archivos.http.js';

/** Cotas de entrada: el formato, las longitudes y los rangos reales los valida el dominio, con su código de error. */
const LONGITUD_MAXIMA_CODIGO = 100;
const LONGITUD_MAXIMA_TEXTO = 1000;

const texto = (maximo: number) => z.string().max(maximo);
const numeroDeVersion = z.coerce.number().int().positive();

const EsquemaArchivoId = z.object({ id: z.uuid() });
const EsquemaVersionDeArchivo = z.object({ id: z.uuid(), numero: numeroDeVersion });
const EsquemaCarga = z.object({
  categoria: texto(LONGITUD_MAXIMA_CODIGO),
  nombre_original: texto(LONGITUD_MAXIMA_TEXTO),
  tamano: z.number(),
  mime: texto(LONGITUD_MAXIMA_CODIGO),
  entidad_tipo: texto(LONGITUD_MAXIMA_CODIGO),
  entidad_id: texto(LONGITUD_MAXIMA_TEXTO),
});
const EsquemaNuevaVersion = z.object({ tamano: z.number(), mime: texto(LONGITUD_MAXIMA_CODIGO) });
const EsquemaVersionVigente = z.object({ version: z.number().int().positive() });
const EsquemaDescarga = z.object({
  version: numeroDeVersion.optional(),
  disposicion: z.enum(DISPOSICIONES).optional(),
  vigencia_segundos: z.coerce.number().optional(),
});

const NO_ENCONTRADO = 'NO_ENCONTRADO, también si es de otro tenant';
const VERSION_NO_ENCONTRADA = 'NO_ENCONTRADO (también si es de otro tenant) o VERSION_NO_ENCONTRADA';
const EVENTOS_ANALISIS =
  'Eventos `estado` (EN_ANALISIS) y `fin` (DISPONIBLE, CUARENTENA o RECHAZADO con `motivo` y `mensaje`), data = aviso en JSON; `: ping` cada 15 s; cierra con el `fin` o a los 15 min';
const SOLO_QUIEN_SUBIO = 'NO_ENCONTRADO (también si es de otro tenant o la subió otro usuario) o VERSION_NO_ENCONTRADA';
const ANALISIS_NO_INICIADO = 'ANALISIS_NO_INICIADO: falta confirmar la subida';

/** TR-RF-080, 081 y 082. El navegador sube y baja directo a Storage con las URL firmadas que emiten estas rutas. */
@ApiTags('archivos')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO, SUCURSAL_NO_ASIGNADA o ACCESO_ENTIDAD_DENEGADO' })
@ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (campos faltantes, de otro tipo o demasiado largos)' })
@UseFilters(ArchivosFiltro)
@Controller('archivos')
export class ArchivosController {
  constructor(
    @Inject(SolicitarCarga) private readonly solicitarCarga: SolicitarCarga,
    @Inject(ConfirmarCarga) private readonly confirmarCarga: ConfirmarCarga,
    @Inject(ConsultarEstadoArchivo) private readonly consultarEstado: ConsultarEstadoArchivo,
    @Inject(EmitirUrlDescarga) private readonly emitirUrlDescarga: EmitirUrlDescarga,
    @Inject(SolicitarVersion) private readonly solicitarVersion: SolicitarVersion,
    @Inject(ConfirmarVersion) private readonly confirmarVersion: ConfirmarVersion,
    @Inject(ListarVersiones) private readonly listarVersiones: ListarVersiones,
    @Inject(MarcarVersionVigente) private readonly marcarVersionVigente: MarcarVersionVigente,
    @Inject(ListarCategorias) private readonly listarCategorias: ListarCategorias,
    @Inject(SeguirAnalisis) private readonly seguirAnalisis: SeguirAnalisis,
  ) {}

  // Antes de las rutas con `:id`: si no, `categorias` caería en `GET :id`.
  @Get('categorias')
  @Permiso(PERMISOS_ARC.subir)
  @ApiOkResponse({ type: [CategoriaDto], description: 'Las categorías con sus MIME y su tamaño máximo, por código' })
  async categorias(): Promise<CategoriaDto[]> {
    return (await this.listarCategorias.ejecutar()).map(categoriaDto);
  }

  @Post('cargas')
  @Permiso(PERMISOS_ARC.subir)
  @ApiBody({ type: SolicitarCargaDto })
  @ApiCreatedResponse({ type: CargaSolicitadaDto, description: 'El archivo queda PENDIENTE_CARGA hasta que se confirme la subida' })
  @ApiUnprocessableEntityResponse({
    type: ErrorArchivoDto,
    description: 'CATEGORIA_DESCONOCIDA, MIME_NO_PERMITIDO, TAMANO_EXCEDIDO (con `tamano_max_bytes`) o DATOS_INVALIDOS',
  })
  @ApiServiceUnavailableResponse({ type: ErrorArchivoDto, description: 'ALMACEN_NO_DISPONIBLE: Storage no firmó la carga' })
  async solicitar(@Body() cuerpo: unknown): Promise<CargaSolicitadaDto> {
    const datos = validar(EsquemaCarga, cuerpo);
    const solicitada = await this.solicitarCarga.ejecutar({
      categoria: datos.categoria,
      nombreOriginal: datos.nombre_original,
      tamano: datos.tamano,
      mime: datos.mime,
      entidadTipo: datos.entidad_tipo,
      entidadId: datos.entidad_id,
    });
    return cargaSolicitadaDto(solicitada);
  }

  @Post(':id/confirmar')
  @HttpCode(HttpStatus.OK)
  @Permiso(PERMISOS_ARC.subir)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    type: EstadoArchivoDto,
    description: 'Idempotente. El archivo pasa a EN_ANALISIS; si ya se había confirmado, devuelve su estado actual',
  })
  @ApiNotFoundResponse({ type: ErrorArchivoDto, description: NO_ENCONTRADO })
  @ApiConflictResponse({ type: ErrorArchivoDto, description: 'conflict: otra operación cambió el archivo' })
  @ApiServiceUnavailableResponse({ type: ErrorArchivoDto, description: 'ALMACEN_NO_DISPONIBLE: no se pudo encolar el análisis; se confirma otra vez' })
  async confirmar(@Param() parametros: unknown): Promise<EstadoArchivoDto> {
    const { id } = validar(EsquemaArchivoId, parametros);
    return estadoArchivoDto(await this.confirmarCarga.ejecutar(id));
  }

  @Get(':id/eventos')
  @Permiso(PERMISOS_ARC.subir)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ type: AvisoAnalisisDto, description: `${EVENTOS_ANALISIS}. Solo para quien subió la carga` })
  @ApiNotFoundResponse({ type: ErrorArchivoDto, description: SOLO_QUIEN_SUBIO })
  @ApiConflictResponse({ type: ErrorArchivoDto, description: ANALISIS_NO_INICIADO })
  async eventosCarga(@PrincipalActual() principal: Principal, @Param() parametros: unknown, @Res() respuesta: RespuestaEnStreaming): Promise<void> {
    const { id } = validar(EsquemaArchivoId, parametros);
    await this.transmitirAnalisis(respuesta, id, NUMERO_PRIMERA_VERSION, principal.usuarioId);
  }

  @Get(':id/versiones/:numero/eventos')
  @Permiso(PERMISOS_ARC.versionar)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'numero', type: Number, description: 'Número de la versión que se subió' })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ type: AvisoAnalisisDto, description: `${EVENTOS_ANALISIS}. Solo para quien subió la versión` })
  @ApiNotFoundResponse({ type: ErrorArchivoDto, description: SOLO_QUIEN_SUBIO })
  @ApiConflictResponse({ type: ErrorArchivoDto, description: ANALISIS_NO_INICIADO })
  async eventosVersion(@PrincipalActual() principal: Principal, @Param() parametros: unknown, @Res() respuesta: RespuestaEnStreaming): Promise<void> {
    const { id, numero } = validar(EsquemaVersionDeArchivo, parametros);
    await this.transmitirAnalisis(respuesta, id, numero, principal.usuarioId);
  }

  @Post(':id/versiones')
  @Permiso(PERMISOS_ARC.versionar)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: SolicitarVersionDto })
  @ApiCreatedResponse({
    type: VersionSolicitadaDto,
    description: 'La versión queda PENDIENTE_CARGA hasta que se confirme la subida; el archivo sigue DISPONIBLE con su vigente',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorArchivoDto,
    description: 'MIME_NO_PERMITIDO, TAMANO_EXCEDIDO (con `tamano_max_bytes`) o DATOS_INVALIDOS',
  })
  @ApiNotFoundResponse({ type: ErrorArchivoDto, description: NO_ENCONTRADO })
  @ApiConflictResponse({
    type: ErrorArchivoDto,
    description: 'ARCHIVO_NO_DISPONIBLE (con `estado`), VERSION_EN_CURSO (con `numero`) o conflict: otra operación cambió el archivo',
  })
  @ApiServiceUnavailableResponse({ type: ErrorArchivoDto, description: 'ALMACEN_NO_DISPONIBLE: Storage no firmó la carga' })
  async nuevaVersion(@Param() parametros: unknown, @Body() cuerpo: unknown): Promise<VersionSolicitadaDto> {
    const { id } = validar(EsquemaArchivoId, parametros);
    const { tamano, mime } = validar(EsquemaNuevaVersion, cuerpo);
    return versionSolicitadaDto(await this.solicitarVersion.ejecutar({ archivoId: id, tamano, mime }));
  }

  @Post(':id/versiones/:numero/confirmar')
  @HttpCode(HttpStatus.OK)
  @Permiso(PERMISOS_ARC.versionar)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'numero', type: Number, description: 'Número de la versión nueva (2 en adelante)' })
  @ApiOkResponse({
    type: VersionDto,
    description: 'Idempotente. La versión pasa a EN_ANALISIS; si ya se había confirmado, devuelve su estado actual',
  })
  @ApiNotFoundResponse({ type: ErrorArchivoDto, description: `${VERSION_NO_ENCONTRADA} (rechazada o limpiada)` })
  @ApiConflictResponse({ type: ErrorArchivoDto, description: 'conflict: otra operación cambió el archivo' })
  @ApiServiceUnavailableResponse({ type: ErrorArchivoDto, description: 'ALMACEN_NO_DISPONIBLE: no se pudo encolar el análisis; se confirma otra vez' })
  async confirmarNuevaVersion(@Param() parametros: unknown): Promise<VersionDto> {
    const { id, numero } = validar(EsquemaVersionDeArchivo, parametros);
    return versionDto(await this.confirmarVersion.ejecutar(id, numero));
  }

  @Get(':id/versiones')
  @Permiso(PERMISOS_ARC.descargar)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: VersionesArchivoDto })
  @ApiNotFoundResponse({ type: ErrorArchivoDto, description: NO_ENCONTRADO })
  async versiones(@Param() parametros: unknown): Promise<VersionesArchivoDto> {
    const { id } = validar(EsquemaArchivoId, parametros);
    return versionesArchivoDto(await this.listarVersiones.ejecutar(id));
  }

  @Patch(':id/version-vigente')
  @Permiso(PERMISOS_ARC.versionar)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: MarcarVigenteDto })
  @ApiOkResponse({ type: EstadoArchivoDto, description: 'Idempotente: marcar la que ya es vigente no cambia nada ni publica evento' })
  @ApiNotFoundResponse({ type: ErrorArchivoDto, description: VERSION_NO_ENCONTRADA })
  @ApiConflictResponse({
    type: ErrorArchivoDto,
    description: 'ARCHIVO_NO_DISPONIBLE o VERSION_NO_DISPONIBLE (con `estado`), o conflict: otra operación cambió el archivo',
  })
  async marcarVigente(@Param() parametros: unknown, @Body() cuerpo: unknown): Promise<EstadoArchivoDto> {
    const { id } = validar(EsquemaArchivoId, parametros);
    const { version } = validar(EsquemaVersionVigente, cuerpo);
    return estadoArchivoDto(await this.marcarVersionVigente.ejecutar(id, version));
  }

  @Get(':id')
  @Permiso(PERMISOS_ARC.descargar)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: EstadoArchivoDto })
  @ApiNotFoundResponse({ type: ErrorArchivoDto, description: NO_ENCONTRADO })
  async estado(@Param() parametros: unknown): Promise<EstadoArchivoDto> {
    const { id } = validar(EsquemaArchivoId, parametros);
    return estadoArchivoDto(await this.consultarEstado.ejecutar(id));
  }

  @Get(':id/descarga')
  @Permiso(PERMISOS_ARC.descargar)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiQuery({ name: 'version', required: false, type: Number, minimum: 1, description: 'Por defecto la vigente' })
  @ApiQuery({ name: 'disposicion', required: false, enum: DISPOSICIONES, description: 'Por defecto attachment: descarga con el nombre original' })
  @ApiQuery({
    name: 'vigencia_segundos',
    required: false,
    type: Number,
    minimum: VIGENCIA_MINIMA_SEGUNDOS,
    maximum: VIGENCIA_MAXIMA_SEGUNDOS,
    description: 'Por defecto 900',
  })
  @ApiOkResponse({ type: UrlDescargaDto, description: 'La descarga de una categoría sensible queda auditada, con el número de versión' })
  @ApiUnprocessableEntityResponse({ type: ErrorArchivoDto, description: 'VIGENCIA_INVALIDA' })
  @ApiNotFoundResponse({ type: ErrorArchivoDto, description: VERSION_NO_ENCONTRADA })
  @ApiConflictResponse({ type: ErrorArchivoDto, description: 'ARCHIVO_NO_DISPONIBLE o VERSION_NO_DISPONIBLE, con su `estado`' })
  @ApiServiceUnavailableResponse({ type: ErrorArchivoDto, description: 'ALMACEN_NO_DISPONIBLE: Storage no firmó la descarga' })
  async descargar(@Param() parametros: unknown, @Query() consulta: unknown): Promise<UrlDescargaDto> {
    const { id } = validar(EsquemaArchivoId, parametros);
    const { version, disposicion, vigencia_segundos: vigenciaSegundos } = validar(EsquemaDescarga, consulta);
    return urlDescargaDto(await this.emitirUrlDescarga.ejecutar({ archivoId: id, version, disposicion, vigenciaSegundos }));
  }

  /** Los errores (404, 409) salen antes de abrir el stream, con el filtro de archivos. */
  private async transmitirAnalisis(respuesta: RespuestaEnStreaming, archivoId: string, numero: number, usuarioId: string): Promise<void> {
    const cierre = new AbortController();
    const avisos = await this.seguirAnalisis.ejecutar({ archivoId, numero, usuarioId, senal: cierre.signal });
    await transmitirEventosSse(respuesta, avisos, cierre);
  }
}
