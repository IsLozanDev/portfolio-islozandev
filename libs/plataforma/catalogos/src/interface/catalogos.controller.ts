import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post, Put, Query, Res, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permiso, PrincipalActual, type Principal } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { ActualizarCatalogo } from '../application/actualizar-catalogo.js';
import { AjustarItem, type AjusteAplicado } from '../application/ajustar-item.js';
import { ConsultarItems } from '../application/consultar-items.js';
import type { ContenidoItemComando } from '../application/contenido-item.js';
import { CrearCatalogo } from '../application/crear-catalogo.js';
import { EliminarItemGlobal } from '../application/eliminar-item-global.js';
import { EliminarItemPropio } from '../application/eliminar-item-propio.js';
import { GuardarItemGlobal } from '../application/guardar-item-global.js';
import { GuardarItemPropio } from '../application/guardar-item-propio.js';
import { ListarCatalogos } from '../application/listar-catalogos.js';
import type { ItemVisible } from '../application/ports/repositorios.js';
import type { Actualizado, DefinicionCatalogo, ItemGuardado } from '../application/resultados.js';
import { ItemNoEncontradoError } from '../domain/errores.js';
import { PERMISOS_CAT } from '../domain/permisos-cat.js';
import { ALCANCES_CATALOGO } from '../domain/tipos.js';
import {
  ActualizarCatalogoDto,
  ActualizarItemDto,
  AjusteAplicadoDto,
  AjusteDto,
  CatalogoActualizadoDto,
  CatalogoDto,
  CrearCatalogoDto,
  CrearItemDto,
  ItemActualizadoDto,
  ItemDto,
  ItemVisibleDto,
} from './catalogos.dto.js';
import { CatalogosFiltro, validar } from './catalogos.http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ENTERO_MAXIMO = 2_147_483_647;
const ENTERO_MINIMO = -2_147_483_648;
const ORDEN_POR_DEFECTO = 0;
/** El navegador revalida siempre con el ETag (TR-RNF-102). */
const CACHE_CONTROL_ITEMS = 'private, no-cache';
// Cotas de entrada: los mínimos y las reglas finas los valida el dominio, con sus mensajes.
const CODIGO_CATALOGO_MAXIMO = 60;
const NOMBRE_CATALOGO_MAXIMO = 150;
const FUENTE_MAXIMA = 150;
const CODIGO_ITEM_MAXIMO = 40;
const NOMBRE_ITEM_MAXIMO = 200;
const ABREVIATURA_MAXIMA = 30;
const CODIGO_EXTERNO_MAXIMO = 40;
const ALIAS_MAXIMO = 200;

const version = z.number().int().min(0);
const orden = z.number().int().min(ENTERO_MINIMO).max(ENTERO_MAXIMO);
const fecha = z.string().regex(FECHA);

const EsquemaCrearCatalogo = z.object({
  codigo: z.string().max(CODIGO_CATALOGO_MAXIMO),
  nombre: z.string().max(NOMBRE_CATALOGO_MAXIMO),
  alcance: z.enum(ALCANCES_CATALOGO),
  fuente: z.string().max(FUENTE_MAXIMA).nullish(),
  editable_por_tenant: z.boolean(),
});
const EsquemaActualizarCatalogo = z.object({
  nombre: z.string().max(NOMBRE_CATALOGO_MAXIMO),
  fuente: z.string().max(FUENTE_MAXIMA).nullish(),
  editable_por_tenant: z.boolean(),
  version,
});
const contenidoItem = {
  codigo_externo: z.string().max(CODIGO_EXTERNO_MAXIMO).nullish(),
  nombre: z.string().max(NOMBRE_ITEM_MAXIMO),
  abreviatura: z.string().max(ABREVIATURA_MAXIMA).nullish(),
  orden: orden.optional(),
  atributos: z.record(z.string(), z.unknown()).optional(),
  vigente_desde: fecha,
  vigente_hasta: fecha.nullish(),
  activo: z.boolean().optional(),
};
const EsquemaCrearItem = z.object({ codigo: z.string().max(CODIGO_ITEM_MAXIMO), ...contenidoItem });
const EsquemaActualizarItem = z.object({ ...contenidoItem, version });
const EsquemaAjuste = z.object({
  visible: z.boolean(),
  orden: orden.nullish(),
  alias: z.string().max(ALIAS_MAXIMO).nullish(),
  version: version.nullish(),
});
const EsquemaEliminar = z.object({ version: z.string().regex(/^\d+$/) });

/** Lo que el controlador usa de la respuesta de Express para el ETag y el 304. */
interface RespuestaItems {
  status(codigo: number): unknown;
  setHeader(nombre: string, valor: string): unknown;
}

/**
 * TR-CAT (TR-RF-022 a 027). `gestionar` e `item_gestionar` son sensibles: PermisoGuard exige MFA y, además,
 * el actor debe estar en el tenant operador (TR-RN-009). Los ítems propios y los ajustes son del tenant del token.
 */
@ApiTags('catalogos')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO o MFA_REQUERIDA (permiso sensible, TR-RN-009)' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO, SUCURSAL_NO_ASIGNADA u OPERADOR_REQUERIDO' })
@UseFilters(CatalogosFiltro)
@Controller('catalogos')
export class CatalogosController {
  constructor(
    @Inject(ListarCatalogos) private readonly listarCatalogos: ListarCatalogos,
    @Inject(CrearCatalogo) private readonly crearCatalogo: CrearCatalogo,
    @Inject(ActualizarCatalogo) private readonly actualizarCatalogo: ActualizarCatalogo,
    @Inject(ConsultarItems) private readonly consultarItems: ConsultarItems,
    @Inject(GuardarItemGlobal) private readonly guardarItemGlobal: GuardarItemGlobal,
    @Inject(EliminarItemGlobal) private readonly eliminarItemGlobal: EliminarItemGlobal,
    @Inject(GuardarItemPropio) private readonly guardarItemPropio: GuardarItemPropio,
    @Inject(EliminarItemPropio) private readonly eliminarItemPropio: EliminarItemPropio,
    @Inject(AjustarItem) private readonly ajustarItem: AjustarItem,
  ) {}

  @Get()
  @Permiso(PERMISOS_CAT.leer)
  @ApiOkResponse({ type: [CatalogoDto] })
  async listar(): Promise<CatalogoDto[]> {
    return (await this.listarCatalogos.ejecutar()).map(catalogoDto);
  }

  @Post()
  @Permiso(PERMISOS_CAT.gestionar)
  @ApiBody({ type: CrearCatalogoDto })
  @ApiCreatedResponse({ type: CatalogoDto, description: 'Nace en versión 1 (TR-CA-058)' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA o CATALOGO_INVALIDO (TR-CA-059)' })
  @ApiConflictResponse({ description: 'CATALOGO_DUPLICADO' })
  async crear(@PrincipalActual() principal: Principal, @Body() cuerpo: unknown): Promise<CatalogoDto> {
    const datos = validar(EsquemaCrearCatalogo, cuerpo);
    const definicion = await this.crearCatalogo.ejecutar({
      codigo: datos.codigo,
      nombre: datos.nombre,
      alcance: datos.alcance,
      fuente: datos.fuente ?? null,
      editablePorTenant: datos.editable_por_tenant,
      actorId: principal.usuarioId,
    });
    return catalogoDto(definicion);
  }

  @Put(':codigo')
  @Permiso(PERMISOS_CAT.gestionar)
  @ApiBody({ type: ActualizarCatalogoDto })
  @ApiOkResponse({ type: CatalogoActualizadoDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA o CATALOGO_INVALIDO' })
  @ApiNotFoundResponse({ description: 'CATALOGO_NO_EXISTE' })
  @ApiConflictResponse({ description: 'VERSION_OBSOLETA' })
  async actualizar(@PrincipalActual() principal: Principal, @Param('codigo') codigo: string, @Body() cuerpo: unknown): Promise<CatalogoActualizadoDto> {
    const datos = validar(EsquemaActualizarCatalogo, cuerpo);
    const definicion = await this.actualizarCatalogo.ejecutar({
      codigo,
      nombre: datos.nombre,
      fuente: datos.fuente ?? null,
      editablePorTenant: datos.editable_por_tenant,
      version: datos.version,
      actorId: principal.usuarioId,
    });
    return { ...catalogoDto(definicion), cambiado: definicion.cambiado };
  }

  @Get(':codigo/items')
  @Permiso(PERMISOS_CAT.leer)
  @ApiHeader({ name: 'If-None-Match', required: false, description: 'ETag de una lectura anterior' })
  @ApiOkResponse({ type: [ItemVisibleDto], description: 'Ítems vigentes y visibles para el tenant, con ETag' })
  @ApiResponse({ status: HttpStatus.NOT_MODIFIED, description: 'El ETag coincide: sin cuerpo (TR-CA-064)' })
  @ApiNotFoundResponse({ description: 'CATALOGO_NO_EXISTE (TR-CA-065)' })
  async items(
    @Param('codigo') codigo: string,
    @Headers('if-none-match') siNoCoincide: string | undefined,
    @Res({ passthrough: true }) respuesta: RespuestaItems,
  ): Promise<ItemVisibleDto[] | undefined> {
    const resultado = await this.consultarItems.ejecutar({ catalogo: codigo, siNoCoincide });
    respuesta.setHeader('ETag', resultado.etag);
    respuesta.setHeader('Cache-Control', CACHE_CONTROL_ITEMS);
    if (resultado.noModificado) {
      respuesta.status(HttpStatus.NOT_MODIFIED);
      return undefined;
    }
    return resultado.items.map(itemVisibleDto);
  }

  @Post(':codigo/items-globales')
  @Permiso(PERMISOS_CAT.itemGestionar)
  @ApiBody({ type: CrearItemDto })
  @ApiCreatedResponse({ type: ItemDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA o ITEM_INVALIDO' })
  @ApiNotFoundResponse({ description: 'CATALOGO_NO_EXISTE' })
  @ApiConflictResponse({ description: 'CODIGO_DUPLICADO o ALCANCE_NO_PERMITE' })
  async crearItemGlobal(@PrincipalActual() principal: Principal, @Param('codigo') codigo: string, @Body() cuerpo: unknown): Promise<ItemDto> {
    const datos = validar(EsquemaCrearItem, cuerpo);
    return itemDto(await this.guardarItemGlobal.crear({ catalogo: codigo, codigo: datos.codigo, ...contenidoDe(datos), actorId: principal.usuarioId }));
  }

  @Put(':codigo/items-globales/:id')
  @Permiso(PERMISOS_CAT.itemGestionar)
  @ApiBody({ type: ActualizarItemDto })
  @ApiOkResponse({ type: ItemActualizadoDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA o ITEM_INVALIDO' })
  @ApiNotFoundResponse({ description: 'CATALOGO_NO_EXISTE o ITEM_NO_ENCONTRADO' })
  @ApiConflictResponse({ description: 'VERSION_OBSOLETA' })
  async actualizarItemGlobal(
    @PrincipalActual() principal: Principal,
    @Param('codigo') codigo: string,
    @Param('id') id: string,
    @Body() cuerpo: unknown,
  ): Promise<ItemActualizadoDto> {
    const itemId = exigirUuid(id);
    const datos = validar(EsquemaActualizarItem, cuerpo);
    const item = await this.guardarItemGlobal.actualizar({ catalogo: codigo, itemId, version: datos.version, ...contenidoDe(datos), actorId: principal.usuarioId });
    return itemActualizadoDto(item);
  }

  @Delete(':codigo/items-globales/:id')
  @Permiso(PERMISOS_CAT.itemGestionar)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiQuery({ name: 'version', required: true })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  @ApiNotFoundResponse({ description: 'CATALOGO_NO_EXISTE o ITEM_NO_ENCONTRADO' })
  @ApiConflictResponse({ description: 'ITEM_REFERENCIADO (cierre su vigencia o inactívelo, TR-CA-061) o VERSION_OBSOLETA' })
  async eliminarGlobal(@PrincipalActual() principal: Principal, @Param('codigo') codigo: string, @Param('id') id: string, @Query() consulta: unknown): Promise<void> {
    const itemId = exigirUuid(id);
    const { version: versionLeida } = validar(EsquemaEliminar, consulta);
    await this.eliminarItemGlobal.ejecutar({ catalogo: codigo, itemId, version: Number(versionLeida), actorId: principal.usuarioId });
  }

  @Post(':codigo/items')
  @Permiso(PERMISOS_CAT.itemPropio)
  @ApiBody({ type: CrearItemDto })
  @ApiCreatedResponse({ type: ItemDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA o ITEM_INVALIDO' })
  @ApiNotFoundResponse({ description: 'CATALOGO_NO_EXISTE' })
  @ApiConflictResponse({ description: 'CODIGO_DUPLICADO (TR-CA-069) o ALCANCE_NO_PERMITE' })
  async crearItemPropio(@PrincipalActual() principal: Principal, @Param('codigo') codigo: string, @Body() cuerpo: unknown): Promise<ItemDto> {
    const datos = validar(EsquemaCrearItem, cuerpo);
    return itemDto(await this.guardarItemPropio.crear({ catalogo: codigo, codigo: datos.codigo, ...contenidoDe(datos), actorId: principal.usuarioId }));
  }

  @Put(':codigo/items/:id')
  @Permiso(PERMISOS_CAT.itemPropio)
  @ApiBody({ type: ActualizarItemDto })
  @ApiOkResponse({ type: ItemActualizadoDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA o ITEM_INVALIDO' })
  @ApiNotFoundResponse({ description: 'CATALOGO_NO_EXISTE o ITEM_NO_ENCONTRADO (global, de otro tenant o de otro catálogo)' })
  @ApiConflictResponse({ description: 'VERSION_OBSOLETA' })
  async actualizarItemPropio(
    @PrincipalActual() principal: Principal,
    @Param('codigo') codigo: string,
    @Param('id') id: string,
    @Body() cuerpo: unknown,
  ): Promise<ItemActualizadoDto> {
    const itemId = exigirUuid(id);
    const datos = validar(EsquemaActualizarItem, cuerpo);
    const item = await this.guardarItemPropio.actualizar({ catalogo: codigo, itemId, version: datos.version, ...contenidoDe(datos), actorId: principal.usuarioId });
    return itemActualizadoDto(item);
  }

  @Delete(':codigo/items/:id')
  @Permiso(PERMISOS_CAT.itemPropio)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiQuery({ name: 'version', required: true })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA' })
  @ApiNotFoundResponse({ description: 'CATALOGO_NO_EXISTE o ITEM_NO_ENCONTRADO' })
  @ApiConflictResponse({ description: 'ITEM_REFERENCIADO (cierre su vigencia o inactívelo) o VERSION_OBSOLETA' })
  async eliminarPropio(@PrincipalActual() principal: Principal, @Param('codigo') codigo: string, @Param('id') id: string, @Query() consulta: unknown): Promise<void> {
    const itemId = exigirUuid(id);
    const { version: versionLeida } = validar(EsquemaEliminar, consulta);
    await this.eliminarItemPropio.ejecutar({ catalogo: codigo, itemId, version: Number(versionLeida), actorId: principal.usuarioId });
  }

  @Put(':codigo/items/:id/ajuste')
  @Permiso(PERMISOS_CAT.personalizar)
  @ApiBody({ type: AjusteDto })
  @ApiOkResponse({ type: AjusteAplicadoDto })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA o ITEM_INVALIDO (alias)' })
  @ApiNotFoundResponse({ description: 'CATALOGO_NO_EXISTE o ITEM_NO_ENCONTRADO' })
  @ApiConflictResponse({ description: 'ALCANCE_NO_PERMITE (TR-CA-067) o VERSION_OBSOLETA' })
  async ajustar(@PrincipalActual() principal: Principal, @Param('codigo') codigo: string, @Param('id') id: string, @Body() cuerpo: unknown): Promise<AjusteAplicadoDto> {
    const itemId = exigirUuid(id);
    const datos = validar(EsquemaAjuste, cuerpo);
    const ajuste = await this.ajustarItem.ejecutar({
      catalogo: codigo,
      itemId,
      visible: datos.visible,
      orden: datos.orden ?? null,
      alias: datos.alias ?? null,
      version: datos.version ?? null,
      actorId: principal.usuarioId,
    });
    return ajusteDto(ajuste);
  }
}

/** Un id que no es UUID no puede existir: 404 sin llegar al caso de uso. */
function exigirUuid(id: string): string {
  if (!UUID.test(id)) throw new ItemNoEncontradoError();
  return id;
}

type CuerpoItem = z.infer<typeof EsquemaActualizarItem> | z.infer<typeof EsquemaCrearItem>;

/** Campos opcionales con su valor por defecto: el PUT reemplaza el contenido completo. */
function contenidoDe(datos: CuerpoItem): ContenidoItemComando {
  return {
    codigoExterno: datos.codigo_externo ?? null,
    nombre: datos.nombre,
    abreviatura: datos.abreviatura ?? null,
    orden: datos.orden ?? ORDEN_POR_DEFECTO,
    atributos: datos.atributos ?? {},
    vigenteDesde: datos.vigente_desde,
    vigenteHasta: datos.vigente_hasta ?? null,
    activo: datos.activo ?? true,
  };
}

function catalogoDto(definicion: DefinicionCatalogo): CatalogoDto {
  return {
    id: definicion.id,
    codigo: definicion.codigo,
    nombre: definicion.nombre,
    alcance: definicion.alcance,
    fuente: definicion.fuente,
    editable_por_tenant: definicion.editablePorTenant,
    version: definicion.version,
  };
}

function itemVisibleDto(item: ItemVisible): ItemVisibleDto {
  return { item_id: item.itemId, codigo: item.codigo, codigo_externo: item.codigoExterno, nombre: item.nombre, atributos: item.atributos, orden: item.orden };
}

function itemDto(item: ItemGuardado): ItemDto {
  return {
    id: item.id,
    codigo: item.codigo,
    codigo_externo: item.codigoExterno,
    nombre: item.nombre,
    abreviatura: item.abreviatura,
    orden: item.orden,
    atributos: item.atributos,
    vigente_desde: item.vigenteDesde,
    vigente_hasta: item.vigenteHasta,
    activo: item.activo,
    version: item.version,
  };
}

function itemActualizadoDto(item: Actualizado<ItemGuardado>): ItemActualizadoDto {
  return { ...itemDto(item), cambiado: item.cambiado };
}

function ajusteDto(ajuste: AjusteAplicado): AjusteAplicadoDto {
  return { item_id: ajuste.itemId, visible: ajuste.visible, orden: ajuste.orden, alias: ajuste.alias, version: ajuste.version, cambiado: ajuste.cambiado };
}
