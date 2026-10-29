import { Controller, Get, Inject, Param, UseFilters } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiHeader, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { ConsultarCatalogo, ListarProductosDisponibles } from '../application/lecturas-roles.js';
import { PERMISOS_SEG } from '../domain/permisos-seg.js';
import { Permiso } from './decoradores.js';
import { MembresiasFiltro, validar } from './membresias.http.js';
import { ArbolPermisosDto, arbolPermisosDto, codigoProducto, ListadoProductosDto, listadoProductosDto } from './roles.http.js';

const EsquemaProductoDelCatalogo = z.object({ productoCodigo: codigoProducto });

/** Lo que necesita el editor de roles (spec 16b): productos y árbol de permisos. Con `plat.rol.gestionar`. */
@ApiTags('seg')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@UseFilters(MembresiasFiltro)
@Controller('seg')
export class CatalogoController {
  constructor(
    @Inject(ListarProductosDisponibles) private readonly listarProductosDisponibles: ListarProductosDisponibles,
    @Inject(ConsultarCatalogo) private readonly consultarCatalogo: ConsultarCatalogo,
  ) {}

  @Get('productos-disponibles')
  @Permiso(PERMISOS_SEG.rolGestionar)
  @ApiOkResponse({ type: ListadoProductosDto })
  async productos(): Promise<ListadoProductosDto> {
    return listadoProductosDto(await this.listarProductosDisponibles.ejecutar());
  }

  @Get('catalogo/:productoCodigo')
  @Permiso(PERMISOS_SEG.rolGestionar)
  @ApiOkResponse({ type: ArbolPermisosDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA o PRODUCTO_NO_CONTRATADO' })
  async catalogo(@Param() parametros: unknown): Promise<ArbolPermisosDto> {
    const { productoCodigo } = validar(EsquemaProductoDelCatalogo, parametros);
    return arbolPermisosDto(await this.consultarCatalogo.ejecutar(productoCodigo));
  }
}
