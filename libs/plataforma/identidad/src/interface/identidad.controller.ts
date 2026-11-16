import { Controller, Get, Inject, Param, Query, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiExtraModels,
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
  getSchemaPath,
} from '@nestjs/swagger';
import { Permiso } from '@vitrina/plataforma/seguridad';
import { validarDocumento, type TipoDocumento } from '@vitrina/shared/util';
import { z } from 'zod';
import { ConsultarDocumento } from '../application/consultar-documento.js';
import { MOTIVOS_CONSULTA } from '../domain/motivo-consulta.js';
import { PERMISOS_IDN } from '../domain/permisos-idn.js';
import { DniDto, ErrorIdentidadDto, RucDto, ValidezDto, respuestaDto } from './identidad.dto.js';
import { IdentidadFiltro, validar } from './identidad.http.js';

const TIPOS_DOCUMENTO = ['DNI', 'RUC', 'CE', 'PAS'] as const satisfies readonly TipoDocumento[];
/** Cota de entrada: el formato real lo valida validarDocumento, con su motivo. */
const LONGITUD_MAXIMA_NUMERO = 20;
const PRODUCTO = /^[A-Z]{2,10}$/;

const EsquemaDocumento = z.object({
  tipo: z.enum(TIPOS_DOCUMENTO),
  numero: z.string().max(LONGITUD_MAXIMA_NUMERO),
});
const EsquemaConsulta = z.object({
  motivo: z.enum(MOTIVOS_CONSULTA),
  producto: z.string().regex(PRODUCTO).optional(),
});

/** TR-RF-044 a 046. */
@ApiTags('identidad')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (tipo, número demasiado largo, motivo o producto)' })
@ApiParam({ name: 'tipo', enum: [...TIPOS_DOCUMENTO] })
@ApiParam({ name: 'numero', example: '20512345671' })
@ApiExtraModels(DniDto, RucDto)
@UseFilters(IdentidadFiltro)
@Controller('identidad')
export class IdentidadController {
  constructor(@Inject(ConsultarDocumento) private readonly consultarDocumento: ConsultarDocumento) {}

  @Get(':tipo/:numero/validez')
  @Permiso(PERMISOS_IDN.validar)
  @ApiOkResponse({ type: ValidezDto, description: 'Siempre 200, también si es inválido. Sin costo ni bitácora.' })
  validez(@Param() parametros: unknown): ValidezDto {
    const { tipo, numero } = validar(EsquemaDocumento, parametros);
    return validarDocumento(tipo, numero);
  }

  @Get(':tipo/:numero')
  @Permiso(PERMISOS_IDN.consultar)
  @ApiQuery({ name: 'motivo', enum: MOTIVOS_CONSULTA })
  @ApiQuery({ name: 'producto', required: false, example: 'POS', description: 'Código del producto que consulta' })
  @ApiOkResponse({
    description: 'DNI: nombres y apellidos. RUC: datos del padrón y apto_factura.',
    schema: { oneOf: [{ $ref: getSchemaPath(DniDto) }, { $ref: getSchemaPath(RucDto) }] },
  })
  @ApiUnprocessableEntityResponse({ type: ErrorIdentidadDto, description: 'DOCUMENTO_INVALIDO (con motivo) o TIPO_NO_CONSULTABLE (CE y PAS)' })
  @ApiNotFoundResponse({ type: ErrorIdentidadDto, description: 'NO_ENCONTRADO en el proveedor' })
  @ApiServiceUnavailableResponse({ type: ErrorIdentidadDto, description: 'PROVEEDOR_NO_DISPONIBLE: seguir con registro manual' })
  async consultar(@Param() parametros: unknown, @Query() consulta: unknown): Promise<DniDto | RucDto> {
    const { tipo, numero } = validar(EsquemaDocumento, parametros);
    const { motivo, producto } = validar(EsquemaConsulta, consulta);
    const respuesta = await this.consultarDocumento.ejecutar({ tipo, numero, motivo, productoCodigo: producto });
    return respuestaDto(respuesta);
  }
}
