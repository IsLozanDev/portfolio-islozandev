import { Body, Controller, Get, Inject, Param, Patch, UseFilters } from '@nestjs/common';
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
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Permiso, PrincipalActual, type Principal } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { ActualizarProveedor } from '../application/actualizar-proveedor.js';
import { ListarProveedores } from '../application/listar-proveedores.js';
import { PERMISOS_IDN } from '../domain/permisos-idn.js';
import { RANGOS_PROVEEDOR } from '../domain/proveedor-editable.js';
import { ErrorIdentidadDto } from './identidad.dto.js';
import { IdentidadFiltro, validar } from './identidad.http.js';
import { CambiosProveedorDto, ProveedorDto, proveedorDto } from './proveedores.dto.js';

const LONGITUD_MAXIMA_CODIGO = 30;
const entero = ({ minimo, maximo }: { minimo: number; maximo: number }) => z.number().int().min(minimo).max(maximo);

const EsquemaCodigo = z.object({ codigo: z.string().min(1).max(LONGITUD_MAXIMA_CODIGO) });
const EsquemaCambios = z.strictObject({
  prioridad: entero(RANGOS_PROVEEDOR.prioridad).optional(),
  ttl_dias: entero(RANGOS_PROVEEDOR.ttlDias).optional(),
  timeout_ms: entero(RANGOS_PROVEEDOR.timeoutMs).optional(),
  activo: z.boolean().optional(),
  version: z.number().int().min(1),
});

/** Consola del operador: orden de respaldo, TTL, timeout y estado de los proveedores de identidad (spec 29). */
@ApiTags('identidad')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO o MFA_REQUERIDA (permiso sensible sin aal2)' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO, SUCURSAL_NO_ASIGNADA u OPERADOR_REQUERIDO' })
@UseFilters(IdentidadFiltro)
@Controller('identidad/proveedores')
export class ProveedoresController {
  constructor(
    @Inject(ListarProveedores) private readonly listarProveedores: ListarProveedores,
    @Inject(ActualizarProveedor) private readonly actualizarProveedor: ActualizarProveedor,
  ) {}

  @Get()
  @Permiso(PERMISOS_IDN.proveedor)
  @ApiOkResponse({ type: [ProveedorDto], description: 'Por prioridad; sin credenciales' })
  async listar(): Promise<ProveedorDto[]> {
    return (await this.listarProveedores.ejecutar()).map(proveedorDto);
  }

  @Patch(':codigo')
  @Permiso(PERMISOS_IDN.proveedor)
  @ApiParam({ name: 'codigo', example: 'DECOLECTA' })
  @ApiBody({ type: CambiosProveedorDto })
  @ApiOkResponse({ type: ProveedorDto, description: 'Aplica desde la consulta siguiente; publica proveedor_identidad.actualizado' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (rangos, campos desconocidos o sin version)' })
  @ApiNotFoundResponse({ type: ErrorIdentidadDto, description: 'PROVEEDOR_NO_ENCONTRADO' })
  @ApiUnprocessableEntityResponse({ type: ErrorIdentidadDto, description: 'ULTIMO_PROVEEDOR_ACTIVO' })
  @ApiConflictResponse({ type: ErrorIdentidadDto, description: 'VERSION_OBSOLETA' })
  async actualizar(@PrincipalActual() principal: Principal, @Param() parametros: unknown, @Body() cuerpo: unknown): Promise<ProveedorDto> {
    const { codigo } = validar(EsquemaCodigo, parametros);
    const { prioridad, ttl_dias, timeout_ms, activo, version } = validar(EsquemaCambios, cuerpo);
    const cambios = { prioridad, ttlDias: ttl_dias, timeoutMs: timeout_ms, activo };
    return proveedorDto(await this.actualizarProveedor.ejecutar({ codigo, cambios, version, actorId: principal.usuarioId }));
  }
}
