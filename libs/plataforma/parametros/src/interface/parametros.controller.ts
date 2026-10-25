import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put, Query, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Permiso, PrincipalActual, type Principal } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { ConsultarNiveles, type NivelConsultado } from '../application/consultar-niveles.js';
import { FijarValor, type ValorFijado } from '../application/fijar-valor.js';
import { ListarParametros, type ParametroListado } from '../application/listar-parametros.js';
import type { ValorEfectivo } from '../application/ports/repositorios.js';
import { RestablecerValor } from '../application/restablecer-valor.js';
import type { DefinicionParametro } from '../domain/definicion-parametro.js';
import { PERMISOS_CFG } from '../domain/permisos-cfg.js';
import { ALCANCES_PARAMETRO, TIPOS_PARAMETRO } from '../domain/tipos.js';
import { ParametrosFiltro, validar } from './parametros.http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONGITUD_MAXIMA_PRODUCTO = 5;
const LONGITUD_MAXIMA_BUSQUEDA = 100;
/** Los query params llegan como texto. */
const BOOLEANOS_TEXTO = ['true', 'false'] as const;

const uuidOpcional = z.string().regex(UUID).optional();
const booleanoTextoOpcional = z.enum(BOOLEANOS_TEXTO).optional();
const camposNivel = { alcance: z.enum(ALCANCES_PARAMETRO), empresa_id: uuidOpcional, sucursal_id: uuidOpcional };

const EsquemaFijar = z.object({ ...camposNivel, valor: z.unknown() }).refine((cuerpo) => cuerpo.valor !== undefined, { path: ['valor'] });
const EsquemaRestablecer = z.object({ ...camposNivel, confirmar: booleanoTextoOpcional });
const EsquemaListar = z.object({
  producto: z.string().max(LONGITUD_MAXIMA_PRODUCTO).optional(),
  q: z.string().max(LONGITUD_MAXIMA_BUSQUEDA).optional(),
  obsoletos: booleanoTextoOpcional,
});

class EfectivoDto {
  @ApiProperty({ description: 'JSON del tipo de la definición' })
  valor!: unknown;

  @ApiProperty({ enum: ['SUCURSAL', 'EMPRESA', 'TENANT', 'DEFECTO'] })
  origen!: string;
}

class DefinicionDto {
  @ApiProperty({ example: 'rest.propina.porcentaje' })
  codigo!: string;

  @ApiProperty({ example: 'REST' })
  producto_codigo!: string;

  @ApiProperty()
  descripcion!: string;

  @ApiProperty({ enum: TIPOS_PARAMETRO })
  tipo!: string;

  @ApiProperty({ enum: ALCANCES_PARAMETRO })
  alcance_maximo!: string;

  @ApiProperty()
  valor_defecto!: unknown;

  @ApiPropertyOptional({ type: Object, nullable: true, description: 'Subconjunto de JSON Schema' })
  esquema!: object | null;

  @ApiProperty()
  obsoleto!: boolean;
}

class ParametroListadoDto extends DefinicionDto {
  @ApiProperty({ type: EfectivoDto, nullable: true, description: 'En la sucursal de X-Sucursal-Id' })
  efectivo!: EfectivoDto | null;
}

class NivelDto {
  @ApiProperty({ enum: ALCANCES_PARAMETRO })
  alcance!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  empresa_id!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  sucursal_id!: string | null;

  @ApiProperty({ nullable: true })
  entidad_nombre!: string | null;

  @ApiProperty()
  valor!: unknown;

  @ApiProperty({ format: 'uuid' })
  modificado_por!: string;

  @ApiProperty({ format: 'date-time' })
  modificado_en!: string;

  @ApiProperty({ description: 'Más específico que el alcance máximo actual: se ignora al resolver' })
  fuera_de_alcance!: boolean;
}

class NivelesDto {
  @ApiProperty({ type: DefinicionDto })
  definicion!: DefinicionDto;

  @ApiProperty({ type: [NivelDto] })
  niveles!: NivelDto[];
}

class FijarValorDto {
  @ApiProperty({ enum: ALCANCES_PARAMETRO })
  alcance!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Solo con alcance EMPRESA' })
  empresa_id?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Solo con alcance SUCURSAL' })
  sucursal_id?: string;

  @ApiProperty({ description: 'JSON del tipo de la definición', example: 0 })
  valor!: unknown;
}

class ValorFijadoDto {
  @ApiProperty({ enum: ALCANCES_PARAMETRO })
  alcance!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  empresa_id!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  sucursal_id!: string | null;

  @ApiProperty()
  valor!: unknown;

  @ApiProperty({ format: 'date-time' })
  modificado_en!: string;

  @ApiProperty({ description: 'false si ya tenía ese valor: no se escribió ni se publicó' })
  cambiado!: boolean;
}

class RestablecidoDto {
  @ApiProperty({ type: EfectivoDto, description: 'Lo que hereda ahora el nivel restablecido' })
  efectivo!: EfectivoDto;
}

/** TR-RF-031 a 033. PermisoGuard exige X-Sucursal-Id; ParametroPort es la vía interna de los productos. */
@ApiTags('cfg')
@ApiBearerAuth()
@ApiExtraModels(EfectivoDto)
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiForbiddenResponse({ description: 'SIN_PERMISO, SUCURSAL_NO_ASIGNADA o ACTOR_SIN_ALCANCE' })
@UseFilters(ParametrosFiltro)
@Controller('cfg/parametros')
export class ParametrosController {
  constructor(
    @Inject(ListarParametros) private readonly listarParametros: ListarParametros,
    @Inject(ConsultarNiveles) private readonly consultarNiveles: ConsultarNiveles,
    @Inject(FijarValor) private readonly fijarValor: FijarValor,
    @Inject(RestablecerValor) private readonly restablecerValor: RestablecerValor,
  ) {}

  @Get()
  @Permiso(PERMISOS_CFG.parametroLeer)
  @ApiQuery({ name: 'producto', required: false, example: 'REST' })
  @ApiQuery({ name: 'q', required: false, description: 'Texto en código o descripción' })
  @ApiQuery({ name: 'obsoletos', required: false, enum: [...BOOLEANOS_TEXTO] })
  @ApiOkResponse({ type: [ParametroListadoDto] })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  async listar(@Query() consulta: unknown): Promise<ParametroListadoDto[]> {
    const filtro = validar(EsquemaListar, consulta);
    const listados = await this.listarParametros.ejecutar({ productoCodigo: filtro.producto, texto: filtro.q, incluirObsoletas: filtro.obsoletos === 'true' });
    return listados.map(parametroListadoDto);
  }

  @Get(':codigo')
  @Permiso(PERMISOS_CFG.parametroLeer)
  @ApiOkResponse({ type: NivelesDto })
  @ApiNotFoundResponse({ description: 'PARAMETRO_NO_DEFINIDO' })
  async niveles(@Param('codigo') codigo: string): Promise<NivelesDto> {
    const { definicion, niveles } = await this.consultarNiveles.ejecutar(codigo);
    return { definicion: definicionDto(definicion), niveles: niveles.map(nivelDto) };
  }

  @Put(':codigo/valores')
  @Permiso(PERMISOS_CFG.parametroEditar)
  @HttpCode(200)
  @ApiBody({ type: FijarValorDto })
  @ApiOkResponse({ type: ValorFijadoDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA, AMBITO_INVALIDO, ALCANCE_NO_PERMITIDO (TR-CA-081) o VALOR_INVALIDO (TR-CA-082)' })
  @ApiNotFoundResponse({ description: 'PARAMETRO_NO_DEFINIDO o NO_ENCONTRADO (empresa o sucursal de otro tenant)' })
  @ApiConflictResponse({ description: 'PARAMETRO_OBSOLETO o cambio concurrente' })
  async fijar(@PrincipalActual() principal: Principal, @Param('codigo') codigo: string, @Body() cuerpo: unknown): Promise<ValorFijadoDto> {
    const datos = validar(EsquemaFijar, cuerpo);
    const fijado = await this.fijarValor.ejecutar({
      codigo,
      alcance: datos.alcance,
      empresaId: datos.empresa_id,
      sucursalId: datos.sucursal_id,
      valor: datos.valor,
      actorId: principal.usuarioId,
    });
    return valorFijadoDto(fijado);
  }

  @Delete(':codigo/valores')
  @Permiso(PERMISOS_CFG.parametroEditar)
  @HttpCode(200)
  @ApiQuery({ name: 'alcance', enum: ALCANCES_PARAMETRO })
  @ApiQuery({ name: 'empresa_id', required: false })
  @ApiQuery({ name: 'sucursal_id', required: false })
  @ApiQuery({ name: 'confirmar', enum: ['true'], description: 'Obligatorio (TR-RF-033)' })
  @ApiOkResponse({ type: RestablecidoDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA, AMBITO_INVALIDO o CONFIRMACION_REQUERIDA' })
  @ApiNotFoundResponse({ description: 'PARAMETRO_NO_DEFINIDO, VALOR_NO_CONFIGURADO o NO_ENCONTRADO' })
  @ApiConflictResponse({ description: 'Cambio concurrente' })
  async restablecer(@PrincipalActual() principal: Principal, @Param('codigo') codigo: string, @Query() consulta: unknown): Promise<RestablecidoDto> {
    const datos = validar(EsquemaRestablecer, consulta);
    return this.restablecerValor.ejecutar({
      codigo,
      alcance: datos.alcance,
      empresaId: datos.empresa_id,
      sucursalId: datos.sucursal_id,
      confirmar: datos.confirmar === 'true',
      actorId: principal.usuarioId,
    });
  }
}

function definicionDto(definicion: DefinicionParametro): DefinicionDto {
  return {
    codigo: definicion.codigo,
    producto_codigo: definicion.productoCodigo,
    descripcion: definicion.descripcion,
    tipo: definicion.tipo,
    alcance_maximo: definicion.alcanceMaximo,
    valor_defecto: definicion.valorDefecto,
    esquema: definicion.esquema,
    obsoleto: definicion.obsoleto,
  };
}

function parametroListadoDto({ definicion, efectivo }: ParametroListado): ParametroListadoDto {
  return { ...definicionDto(definicion), efectivo: efectivo && efectivoDto(efectivo) };
}

function efectivoDto(efectivo: ValorEfectivo): EfectivoDto {
  return { valor: efectivo.valor, origen: efectivo.origen };
}

function nivelDto(nivel: NivelConsultado): NivelDto {
  return {
    alcance: nivel.alcance,
    empresa_id: nivel.empresaId,
    sucursal_id: nivel.sucursalId,
    entidad_nombre: nivel.entidadNombre,
    valor: nivel.valor,
    modificado_por: nivel.modificadoPor,
    modificado_en: nivel.modificadoEn.toISOString(),
    fuera_de_alcance: nivel.fueraDeAlcance,
  };
}

function valorFijadoDto(fijado: ValorFijado): ValorFijadoDto {
  return {
    alcance: fijado.alcance,
    empresa_id: fijado.empresaId,
    sucursal_id: fijado.sucursalId,
    valor: fijado.valor,
    modificado_en: fijado.modificadoEn.toISOString(),
    cambiado: fijado.cambiado,
  };
}
