import { Controller, Get, HttpException, Inject, Ip, Logger, Param, Query, Res, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiUnprocessableEntityResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ExportarBitacora, MAXIMO_FILAS_EXPORTACION } from '../application/exportar-bitacora.js';
import { ConsultarBitacora, ConsultarEventoSeguridad, DIAS_MAXIMOS_BITACORA } from '../application/lecturas-bitacora.js';
import { FABRICA_ESCRITOR_BITACORA, type EscritorBitacora, type FabricaEscritorBitacora } from '../application/ports/escritor-bitacora.port.js';
import { TIPOS_EVENTO_SEGURIDAD } from '../application/ports/repositorios.js';
import { PERMISOS_SEG } from '../domain/permisos-seg.js';
import type { Principal } from '../domain/principal.js';
import {
  consultaBitacoraDe,
  EsquemaConsultarBitacora,
  EsquemaExportarBitacora,
  nombreArchivoExportacion,
  EventoBitacoraDetalleDto,
  eventoBitacoraDetalleDto,
  ID_EVENTO,
  ListadoBitacoraDto,
  listadoBitacoraDto,
} from './bitacora.http.js';
import { Permiso, PrincipalActual } from './decoradores.js';
import { MembresiasFiltro, validar } from './membresias.http.js';
import { TAMANO_PAGINA_DEFECTO, TAMANO_PAGINA_MAXIMO } from './miembros.http.js';

const HTTP_NO_ENCONTRADO = 404;
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** La respuesta de Express como destino del archivo. */
type RespuestaDescarga = NodeJS.WritableStream & {
  setHeader(nombre: string, valor: string): void;
  headersSent: boolean;
  destroy(error?: Error): void;
};

/** Bitácora de seguridad del tenant del token (spec 18, TR-RF-019) y su exportación XLSX (spec 18b). */
@ApiTags('seg')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@UseFilters(MembresiasFiltro)
@Controller('seg/bitacora')
export class BitacoraController {
  constructor(
    @Inject(ConsultarBitacora) private readonly consultarBitacora: ConsultarBitacora,
    @Inject(ConsultarEventoSeguridad) private readonly consultarEvento: ConsultarEventoSeguridad,
    @Inject(ExportarBitacora) private readonly exportarBitacora: ExportarBitacora,
    @Inject(FABRICA_ESCRITOR_BITACORA) private readonly crearEscritor: FabricaEscritorBitacora,
  ) {}

  private readonly logger = new Logger('Seguridad');

  @Get()
  @Permiso(PERMISOS_SEG.seguridadBitacora)
  @ApiQuery({ name: 'desde', required: true, example: '2026-10-27', description: 'Día en America/Lima, incluido' })
  @ApiQuery({ name: 'hasta', required: true, example: '2026-11-02', description: `Incluido; ${DIAS_MAXIMOS_BITACORA} días como máximo` })
  @ApiQuery({ name: 'tipo', required: false, enum: TIPOS_EVENTO_SEGURIDAD })
  @ApiQuery({ name: 'usuario', required: false, description: 'Parte del correo o del nombre de quien actuó o de quien recibió la asignación (2 a 100 caracteres)' })
  @ApiQuery({ name: 'pagina', required: false, example: 1 })
  @ApiQuery({ name: 'tamano', required: false, example: TAMANO_PAGINA_DEFECTO, description: `Máximo ${TAMANO_PAGINA_MAXIMO}` })
  @ApiOkResponse({ type: ListadoBitacoraDto, description: 'Del más reciente al más antiguo' })
  @ApiBadRequestResponse({ description: 'RANGO_BITACORA_INVALIDO o SOLICITUD_INVALIDA' })
  async listar(@Query() consulta: unknown): Promise<ListadoBitacoraDto> {
    const filtro = consultaBitacoraDe(validar(EsquemaConsultarBitacora, consulta));
    return listadoBitacoraDto(await this.consultarBitacora.ejecutar(filtro));
  }

  // Antes de ':id': si no, «exportar» se tomaría como un id.
  @Get('exportar')
  @Permiso(PERMISOS_SEG.seguridadBitacoraExportar)
  @ApiProduces(TIPO_XLSX)
  @ApiQuery({ name: 'desde', required: true, example: '2026-10-27', description: 'Día en America/Lima, incluido' })
  @ApiQuery({ name: 'hasta', required: true, example: '2026-11-02', description: `Incluido; ${DIAS_MAXIMOS_BITACORA} días como máximo` })
  @ApiQuery({ name: 'tipo', required: false, enum: TIPOS_EVENTO_SEGURIDAD })
  @ApiQuery({ name: 'usuario', required: false, description: 'Parte del correo o del nombre (2 a 100 caracteres)' })
  @ApiOkResponse({ description: 'Hoja «Bitácora» en XLSX, en el orden de la lista. Queda un evento EXPORTACION' })
  @ApiBadRequestResponse({ description: 'RANGO_BITACORA_INVALIDO o SOLICITUD_INVALIDA' })
  @ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO o MFA_REQUERIDA (plat.seguridad.bitacora_exportar es sensible, TR-RN-009)' })
  @ApiUnprocessableEntityResponse({ description: `EXPORTACION_DEMASIADO_GRANDE: más de ${MAXIMO_FILAS_EXPORTACION} filas` })
  @ApiServiceUnavailableResponse({ description: 'AUDITORIA_NO_DISPONIBLE: no se pudo registrar la exportación; no se envía archivo' })
  async exportar(@PrincipalActual() principal: Principal, @Query() consulta: unknown, @Ip() ip: string, @Res() respuesta: RespuestaDescarga): Promise<void> {
    const filtro = consultaBitacoraDe({ ...validar(EsquemaExportarBitacora, consulta), pagina: 1, tamano: 1 });
    const escritor = this.escritorConCabeceras(respuesta, filtro.desde ?? '', filtro.hasta ?? '');
    try {
      await this.exportarBitacora.ejecutar({ desde: filtro.desde, hasta: filtro.hasta, tipo: filtro.tipo, usuario: filtro.usuario, usuarioId: principal.usuarioId, ip: ip || null }, escritor);
    } catch (error) {
      if (!respuesta.headersSent) throw error;
      // El archivo ya empezó a salir: se corta la conexión. La fila EXPORTACION queda (se intentó exportar).
      this.logger.error({ evento: 'seg.exportacion.error', error: error instanceof Error ? error.name : typeof error });
      respuesta.destroy();
    }
  }

  /** Las cabeceras de descarga van recién al abrir el archivo: antes, un 4xx o 503 sale como JSON. */
  private escritorConCabeceras(respuesta: RespuestaDescarga, desde: string, hasta: string): EscritorBitacora {
    const escritor = this.crearEscritor(respuesta);
    return {
      abrir: () => {
        respuesta.setHeader('Content-Type', TIPO_XLSX);
        respuesta.setHeader('Content-Disposition', `attachment; filename="${nombreArchivoExportacion(desde, hasta)}"`);
        escritor.abrir();
      },
      escribir: (eventos) => escritor.escribir(eventos),
      terminar: () => escritor.terminar(),
    };
  }

  @Get(':id')
  @Permiso(PERMISOS_SEG.seguridadBitacora)
  @ApiOkResponse({ type: EventoBitacoraDetalleDto })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO: no existe en el tenant del token' })
  async consultar(@Param('id') id: string): Promise<EventoBitacoraDetalleDto> {
    if (!ID_EVENTO.test(id)) throw new HttpException({ codigo: 'NO_ENCONTRADO', mensaje: 'El evento no existe' }, HTTP_NO_ENCONTRADO);
    return eventoBitacoraDetalleDto(await this.consultarEvento.ejecutar(id));
  }
}
