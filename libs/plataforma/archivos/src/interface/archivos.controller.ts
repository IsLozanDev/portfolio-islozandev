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
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Permiso } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { ConfirmarCarga } from '../application/confirmar-carga.js';
import { ConsultarEstadoArchivo } from '../application/consultar-estado.js';
import { EmitirUrlDescarga } from '../application/emitir-url-descarga.js';
import { SolicitarCarga } from '../application/solicitar-carga.js';
import { PERMISOS_ARC } from '../domain/permisos-arc.js';
import { DISPOSICIONES, VIGENCIA_MAXIMA_SEGUNDOS, VIGENCIA_MINIMA_SEGUNDOS } from '../domain/vigencia-descarga.js';
import {
  CargaSolicitadaDto,
  ErrorArchivoDto,
  EstadoArchivoDto,
  SolicitarCargaDto,
  UrlDescargaDto,
  cargaSolicitadaDto,
  estadoArchivoDto,
  urlDescargaDto,
} from './archivos.dto.js';
import { ArchivosFiltro, validar } from './archivos.http.js';

/** Cotas de entrada: el formato, las longitudes y los rangos reales los valida el dominio, con su código de error. */
const LONGITUD_MAXIMA_CODIGO = 100;
const LONGITUD_MAXIMA_TEXTO = 1000;

const texto = (maximo: number) => z.string().max(maximo);

const EsquemaArchivoId = z.object({ id: z.uuid() });
const EsquemaCarga = z.object({
  categoria: texto(LONGITUD_MAXIMA_CODIGO),
  nombre_original: texto(LONGITUD_MAXIMA_TEXTO),
  tamano: z.number(),
  mime: texto(LONGITUD_MAXIMA_CODIGO),
  entidad_tipo: texto(LONGITUD_MAXIMA_CODIGO),
  entidad_id: texto(LONGITUD_MAXIMA_TEXTO),
});
const EsquemaDescarga = z.object({
  disposicion: z.enum(DISPOSICIONES).optional(),
  vigencia_segundos: z.coerce.number().optional(),
});

const NO_ENCONTRADO = 'NO_ENCONTRADO, también si es de otro tenant';

/** TR-RF-080 y 082. El navegador sube y baja directo a Storage con las URL firmadas que emiten estas rutas. */
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
  ) {}

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
  @ApiQuery({ name: 'disposicion', required: false, enum: DISPOSICIONES, description: 'Por defecto attachment: descarga con el nombre original' })
  @ApiQuery({
    name: 'vigencia_segundos',
    required: false,
    type: Number,
    minimum: VIGENCIA_MINIMA_SEGUNDOS,
    maximum: VIGENCIA_MAXIMA_SEGUNDOS,
    description: 'Por defecto 900',
  })
  @ApiOkResponse({ type: UrlDescargaDto, description: 'La descarga de una categoría sensible queda auditada' })
  @ApiUnprocessableEntityResponse({ type: ErrorArchivoDto, description: 'VIGENCIA_INVALIDA' })
  @ApiNotFoundResponse({ type: ErrorArchivoDto, description: NO_ENCONTRADO })
  @ApiConflictResponse({ type: ErrorArchivoDto, description: 'ARCHIVO_NO_DISPONIBLE, con su `estado`' })
  @ApiServiceUnavailableResponse({ type: ErrorArchivoDto, description: 'ALMACEN_NO_DISPONIBLE: Storage no firmó la descarga' })
  async descargar(@Param() parametros: unknown, @Query() consulta: unknown): Promise<UrlDescargaDto> {
    const { id } = validar(EsquemaArchivoId, parametros);
    const { disposicion, vigencia_segundos: vigenciaSegundos } = validar(EsquemaDescarga, consulta);
    return urlDescargaDto(await this.emitirUrlDescarga.ejecutar({ archivoId: id, disposicion, vigenciaSegundos }));
  }
}
