import { applyDecorators, Controller, Get, Inject, Logger, Param, Query, Res, UseFilters } from '@nestjs/common';
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
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Permiso } from '@vitrina/plataforma/seguridad';
import { ConsultarAuditoria } from '../application/consultar-auditoria.js';
import { ExportarAuditoria } from '../application/exportar-auditoria.js';
import { ObtenerEventoAuditoria } from '../application/obtener-evento-auditoria.js';
import { ObtenerUltimaVerificacion } from '../application/obtener-ultima-verificacion.js';
import { FABRICA_ESCRITOR_AUDITORIA, type EscritorAuditoria, type FabricaEscritorAuditoria } from '../application/ports/escritor-auditoria.port.js';
import { MAXIMO_DIAS_RANGO, MAXIMO_FILAS_EXPORTACION, TAMANO_PAGINA_DEFECTO, TAMANO_PAGINA_MAXIMO, TIPOS_EVENTO_AUDITORIA } from '../domain/filtro-auditoria.js';
import { PERMISOS_AUD } from '../domain/permisos-aud.js';
import {
  AuditoriaFiltro,
  EsquemaConsultarAuditoria,
  EsquemaFiltroAuditoria,
  EventoAuditoriaDetalleDto,
  eventoAuditoriaDetalleDto,
  filtroDe,
  ListadoAuditoriaDto,
  listadoAuditoriaDto,
  nombreArchivoExportacion,
  validar,
  VerificacionDto,
  verificacionDto,
} from './auditoria.http.js';

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** La respuesta de Express como destino del archivo. */
type RespuestaDescarga = NodeJS.WritableStream & {
  setHeader(nombre: string, valor: string): void;
  headersSent: boolean;
  destroy(error?: Error): void;
};

const DESCRIPCION_403 = 'SIN_PERMISO, SUCURSAL_NO_ASIGNADA o SUCURSAL_FUERA_DE_ALCANCE (sucursal_id de otra sucursal sin alcance TENANT)';

/** Filtros comunes de la lista y la exportación. */
const FiltrosDeAuditoria = () =>
  applyDecorators(
    ApiQuery({ name: 'desde', required: true, example: '2026-10-01', description: 'Día en America/Lima, incluido' }),
    ApiQuery({ name: 'hasta', required: true, example: '2026-10-31', description: `Incluido; ${MAXIMO_DIAS_RANGO} días como máximo` }),
    ApiQuery({ name: 'usuario', required: false, description: 'Parte del correo o del nombre de quien actuó (2 a 100 caracteres)' }),
    ApiQuery({ name: 'accion', required: false, example: 'rest.venta.anular', description: 'Exacta' }),
    ApiQuery({ name: 'entidad_tipo', required: false }),
    ApiQuery({ name: 'entidad_id', required: false }),
    ApiQuery({ name: 'sucursal_id', required: false, description: 'Sin alcance TENANT solo la de X-Sucursal-Id' }),
    ApiQuery({ name: 'tipo', required: false, enum: TIPOS_EVENTO_AUDITORIA }),
    ApiQuery({ name: 'persona_titular_id', required: false, description: 'Titular de los datos de un acceso sensible' }),
  );

/**
 * Auditoría del tenant del token (spec 20b, TR-RF-086). Con alcance TENANT se ve todo el tenant; sin él,
 * solo la sucursal de X-Sucursal-Id (TR-CA-214).
 */
@ApiTags('aud')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: DESCRIPCION_403 })
@UseFilters(AuditoriaFiltro)
@Controller('aud')
export class AuditoriaController {
  constructor(
    @Inject(ConsultarAuditoria) private readonly consultarAuditoria: ConsultarAuditoria,
    @Inject(ObtenerEventoAuditoria) private readonly obtenerEvento: ObtenerEventoAuditoria,
    @Inject(ExportarAuditoria) private readonly exportarAuditoria: ExportarAuditoria,
    @Inject(FABRICA_ESCRITOR_AUDITORIA) private readonly crearEscritor: FabricaEscritorAuditoria,
    @Inject(ObtenerUltimaVerificacion) private readonly obtenerUltimaVerificacion: ObtenerUltimaVerificacion,
  ) {}

  private readonly logger = new Logger('Auditoria');

  @Get('eventos')
  @Permiso(PERMISOS_AUD.consultar)
  @FiltrosDeAuditoria()
  @ApiQuery({ name: 'pagina', required: false, example: 1 })
  @ApiQuery({ name: 'tamano', required: false, example: TAMANO_PAGINA_DEFECTO, description: `Máximo ${TAMANO_PAGINA_MAXIMO}` })
  @ApiOkResponse({ type: ListadoAuditoriaDto, description: 'Del más reciente al más antiguo, sin antes ni despues' })
  @ApiBadRequestResponse({ description: 'RANGO_INVALIDO o SOLICITUD_INVALIDA' })
  async listar(@Query() consulta: unknown): Promise<ListadoAuditoriaDto> {
    const { pagina, tamano, ...filtros } = validar(EsquemaConsultarAuditoria, consulta);
    return listadoAuditoriaDto(await this.consultarAuditoria.ejecutar(filtroDe(filtros), { pagina, tamano }));
  }

  // Antes de ':id': si no, «exportar» se tomaría como un id.
  @Get('eventos/exportar')
  @Permiso(PERMISOS_AUD.exportar)
  @FiltrosDeAuditoria()
  @ApiProduces(TIPO_XLSX)
  @ApiOkResponse({ description: 'Hoja «Auditoría» en XLSX, sin el JSON de antes ni despues. Queda una fila plat.auditoria.exportar' })
  @ApiBadRequestResponse({ description: 'RANGO_INVALIDO o SOLICITUD_INVALIDA' })
  @ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO o MFA_REQUERIDA (plat.auditoria.exportar es sensible, TR-RN-009)' })
  @ApiUnprocessableEntityResponse({ description: `EXPORTACION_DEMASIADO_GRANDE: más de ${MAXIMO_FILAS_EXPORTACION} filas` })
  @ApiServiceUnavailableResponse({ description: 'AUDITORIA_NO_DISPONIBLE: no se pudo registrar la exportación; no se envía archivo' })
  async exportar(@Query() consulta: unknown, @Res() respuesta: RespuestaDescarga): Promise<void> {
    const filtro = filtroDe(validar(EsquemaFiltroAuditoria, consulta));
    const escritor = this.escritorConCabeceras(respuesta, filtro.desde, filtro.hasta);
    try {
      await this.exportarAuditoria.ejecutar(filtro, escritor);
    } catch (error) {
      if (!respuesta.headersSent) throw error;
      // El archivo ya empezó a salir: se corta la conexión. La fila de auditoría queda (se intentó exportar).
      this.logger.error({ evento: 'aud.exportacion.error', error: error instanceof Error ? error.name : typeof error });
      respuesta.destroy();
    }
  }

  /** Las cabeceras de descarga van recién al abrir el archivo: antes, un 4xx o 503 sale como JSON. */
  private escritorConCabeceras(respuesta: RespuestaDescarga, desde: string, hasta: string): EscritorAuditoria {
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

  @Get('integridad')
  @Permiso(PERMISOS_AUD.consultar)
  @ApiOkResponse({ type: VerificacionDto, description: 'Último resultado de la verificación diaria de la cadena de hash del tenant' })
  @ApiNotFoundResponse({ description: 'SIN_VERIFICACIONES: todavía no se verificó la cadena del tenant' })
  async integridad(): Promise<VerificacionDto> {
    return verificacionDto(await this.obtenerUltimaVerificacion.ejecutar());
  }

  @Get('eventos/:id')
  @Permiso(PERMISOS_AUD.consultar)
  @ApiOkResponse({ type: EventoAuditoriaDetalleDto, description: 'Con antes, despues y los campos que cambiaron' })
  @ApiNotFoundResponse({ description: 'EVENTO_NO_ENCONTRADO: no existe en el tenant o está fuera del alcance' })
  async consultar(@Param('id') id: string): Promise<EventoAuditoriaDetalleDto> {
    return eventoAuditoriaDetalleDto(await this.obtenerEvento.ejecutar(id));
  }
}
