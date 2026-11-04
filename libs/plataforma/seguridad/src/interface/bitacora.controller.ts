import { Controller, Get, HttpException, Inject, Param, Query, UseFilters } from '@nestjs/common';
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
import { ConsultarBitacora, ConsultarEventoSeguridad, DIAS_MAXIMOS_BITACORA } from '../application/lecturas-bitacora.js';
import { TIPOS_EVENTO_SEGURIDAD } from '../application/ports/repositorios.js';
import { PERMISOS_SEG } from '../domain/permisos-seg.js';
import {
  consultaBitacoraDe,
  EsquemaConsultarBitacora,
  EventoBitacoraDetalleDto,
  eventoBitacoraDetalleDto,
  ID_EVENTO,
  ListadoBitacoraDto,
  listadoBitacoraDto,
} from './bitacora.http.js';
import { Permiso } from './decoradores.js';
import { MembresiasFiltro, validar } from './membresias.http.js';
import { TAMANO_PAGINA_DEFECTO, TAMANO_PAGINA_MAXIMO } from './miembros.http.js';

const HTTP_NO_ENCONTRADO = 404;

/** Bitácora de seguridad del tenant del token (spec 18, TR-RF-019). Sin exportación: va con TR-REP. */
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
  ) {}

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

  @Get(':id')
  @Permiso(PERMISOS_SEG.seguridadBitacora)
  @ApiOkResponse({ type: EventoBitacoraDetalleDto })
  @ApiNotFoundResponse({ description: 'NO_ENCONTRADO: no existe en el tenant del token' })
  async consultar(@Param('id') id: string): Promise<EventoBitacoraDetalleDto> {
    if (!ID_EVENTO.test(id)) throw new HttpException({ codigo: 'NO_ENCONTRADO', mensaje: 'El evento no existe' }, HTTP_NO_ENCONTRADO);
    return eventoBitacoraDetalleDto(await this.consultarEvento.ejecutar(id));
  }
}
