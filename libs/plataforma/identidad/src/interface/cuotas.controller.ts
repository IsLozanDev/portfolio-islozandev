import { Body, Controller, Get, Inject, Param, Patch, Query, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
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
import { Permiso, PrincipalActual, type Principal } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { AjustarCuota } from '../application/ajustar-cuota.js';
import { ConsultarCuotaActual } from '../application/consultar-cuota-actual.js';
import { DetalleDeCuota } from '../application/detalle-cuota.js';
import { ListarCuotas } from '../application/listar-cuotas.js';
import { PeriodoInvalidoError } from '../domain/errores.js';
import { esPeriodoValido, type Periodo } from '../domain/periodo.js';
import { PERMISOS_IDN } from '../domain/permisos-idn.js';
import {
  AjusteCuotaDto,
  CuotaActualDto,
  CuotaDto,
  DetalleCuotaDto,
  PaginaCuotasDto,
  cuotaActualDto,
  cuotaDto,
  detalleCuotaDto,
  filaCuotaDto,
} from './cuotas.dto.js';
import { ErrorIdentidadDto } from './identidad.dto.js';
import { IdentidadFiltro, validar } from './identidad.http.js';

const PAGINA_POR_DEFECTO = 1;
const TAMANO_POR_DEFECTO = 25;
const TAMANO_MAXIMO = 100;
const LONGITUD_MAXIMA_BUSQUEDA = 100;
/** Tope de cordura de la columna integer: nadie contrata un millón de consultas al mes. */
const INCLUIDAS_MAXIMAS = 1_000_000;

const EsquemaListado = z.object({
  periodo: z.string().optional(),
  q: z.string().trim().min(1).max(LONGITUD_MAXIMA_BUSQUEDA).optional(),
  pagina: z.coerce.number().int().min(1).default(PAGINA_POR_DEFECTO),
  tamano: z.coerce.number().int().min(1).max(TAMANO_MAXIMO).default(TAMANO_POR_DEFECTO),
});
const EsquemaCuotaDeTenant = z.object({ tenantId: z.uuid(), periodo: z.string() });
const EsquemaAjuste = z.object({
  incluidas: z.number().int().min(0).max(INCLUIDAS_MAXIMAS),
  version: z.number().int().min(1),
});

/** 422 PERIODO_INVALIDO, no 400: el formato AAAA-MM es una regla del dominio (`esPeriodoValido`). */
function exigirPeriodo(texto: string): Periodo {
  if (!esPeriodoValido(texto)) throw new PeriodoInvalidoError();
  return texto;
}

/** TR-RF-047: cuota propia y consola del operador. `cuota-actual` es un segmento propio para no chocar con `{tipo}/{numero}`. */
@ApiTags('identidad')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO o MFA_REQUERIDA (permiso sensible sin aal2)' })
@ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
@UseFilters(IdentidadFiltro)
@Controller('identidad')
export class CuotasController {
  constructor(
    @Inject(ConsultarCuotaActual) private readonly consultarCuotaActual: ConsultarCuotaActual,
    @Inject(ListarCuotas) private readonly listarCuotas: ListarCuotas,
    @Inject(DetalleDeCuota) private readonly detalleDeCuota: DetalleDeCuota,
    @Inject(AjustarCuota) private readonly ajustarCuota: AjustarCuota,
  ) {}

  @Get('cuota-actual')
  @Permiso(PERMISOS_IDN.cuota)
  @ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
  @ApiOkResponse({ type: CuotaActualDto, description: 'La del tenant del token en el mes actual; sin fila responde la que tendría, sin crearla' })
  async actual(): Promise<CuotaActualDto> {
    return cuotaActualDto(await this.consultarCuotaActual.ejecutar());
  }

  @Get('cuotas')
  @Permiso(PERMISOS_IDN.cuotaGestionar)
  @ApiForbiddenResponse({ description: 'SIN_PERMISO, SUCURSAL_NO_ASIGNADA u OPERADOR_REQUERIDO' })
  @ApiQuery({ name: 'periodo', required: false, example: '2026-11', description: 'AAAA-MM; por defecto, el mes actual en Lima' })
  @ApiQuery({ name: 'q', required: false, description: 'Busca en el nombre o el código del tenant' })
  @ApiQuery({ name: 'pagina', required: false, example: PAGINA_POR_DEFECTO, description: 'Desde 1' })
  @ApiQuery({ name: 'tamano', required: false, example: TAMANO_POR_DEFECTO, description: `De 1 a ${TAMANO_MAXIMO}` })
  @ApiOkResponse({ type: PaginaCuotasDto })
  @ApiUnprocessableEntityResponse({ type: ErrorIdentidadDto, description: 'PERIODO_INVALIDO' })
  async listar(@Query() consulta: unknown): Promise<PaginaCuotasDto> {
    const { periodo, q, pagina, tamano } = validar(EsquemaListado, consulta);
    const resultado = await this.listarCuotas.ejecutar({ periodo: periodo === undefined ? undefined : exigirPeriodo(periodo), q, pagina, tamano });
    return { periodo: resultado.periodo, items: resultado.filas.map(filaCuotaDto), total: resultado.total, pagina, tamano };
  }

  @Get('cuotas/:tenantId/:periodo')
  @Permiso(PERMISOS_IDN.cuotaGestionar)
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiParam({ name: 'periodo', example: '2026-11' })
  @ApiForbiddenResponse({ description: 'SIN_PERMISO, SUCURSAL_NO_ASIGNADA u OPERADOR_REQUERIDO' })
  @ApiOkResponse({ type: DetalleCuotaDto })
  @ApiNotFoundResponse({ type: ErrorIdentidadDto, description: 'CUOTA_NO_ENCONTRADA' })
  @ApiUnprocessableEntityResponse({ type: ErrorIdentidadDto, description: 'PERIODO_INVALIDO' })
  async detalle(@Param() parametros: unknown): Promise<DetalleCuotaDto> {
    const { tenantId, periodo } = validar(EsquemaCuotaDeTenant, parametros);
    return detalleCuotaDto(await this.detalleDeCuota.ejecutar(tenantId, exigirPeriodo(periodo)));
  }

  @Patch('cuotas/:tenantId/:periodo')
  @Permiso(PERMISOS_IDN.cuotaGestionar)
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiParam({ name: 'periodo', example: '2026-11' })
  @ApiBody({ type: AjusteCuotaDto })
  @ApiForbiddenResponse({ description: 'SIN_PERMISO, SUCURSAL_NO_ASIGNADA u OPERADOR_REQUERIDO' })
  @ApiOkResponse({ type: CuotaDto, description: 'Las incluidas valen solo para ese periodo; publica cuota.ajustada' })
  @ApiUnprocessableEntityResponse({ type: ErrorIdentidadDto, description: 'INCLUIDAS_MENOR_QUE_CONSUMIDAS, PERIODO_CERRADO o PERIODO_INVALIDO' })
  @ApiConflictResponse({ type: ErrorIdentidadDto, description: 'VERSION_OBSOLETA' })
  async ajustar(@PrincipalActual() principal: Principal, @Param() parametros: unknown, @Body() cuerpo: unknown): Promise<CuotaDto> {
    const { tenantId, periodo } = validar(EsquemaCuotaDeTenant, parametros);
    const { incluidas, version } = validar(EsquemaAjuste, cuerpo);
    const comando = { tenantId, periodo: exigirPeriodo(periodo), incluidas, version, actorId: principal.usuarioId };
    return cuotaDto(await this.ajustarCuota.ejecutar(comando));
  }
}
