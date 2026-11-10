import { applyDecorators, Controller, Get, Inject, Param, Query, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permiso } from '@vitrina/plataforma/seguridad';
import { ConsultarAuditoria } from '../application/consultar-auditoria.js';
import { ObtenerEventoAuditoria } from '../application/obtener-evento-auditoria.js';
import { MAXIMO_DIAS_RANGO, TAMANO_PAGINA_DEFECTO, TAMANO_PAGINA_MAXIMO, TIPOS_EVENTO_AUDITORIA } from '../domain/filtro-auditoria.js';
import { PERMISOS_AUD } from '../domain/permisos-aud.js';
import {
  AuditoriaFiltro,
  EsquemaConsultarAuditoria,
  EventoAuditoriaDetalleDto,
  eventoAuditoriaDetalleDto,
  filtroDe,
  ListadoAuditoriaDto,
  listadoAuditoriaDto,
  validar,
} from './auditoria.http.js';

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
  ) {}

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

  @Get('eventos/:id')
  @Permiso(PERMISOS_AUD.consultar)
  @ApiOkResponse({ type: EventoAuditoriaDetalleDto, description: 'Con antes, despues y los campos que cambiaron' })
  @ApiNotFoundResponse({ description: 'EVENTO_NO_ENCONTRADO: no existe en el tenant o está fuera del alcance' })
  async consultar(@Param('id') id: string): Promise<EventoAuditoriaDetalleDto> {
    return eventoAuditoriaDetalleDto(await this.obtenerEvento.ejecutar(id));
  }
}
