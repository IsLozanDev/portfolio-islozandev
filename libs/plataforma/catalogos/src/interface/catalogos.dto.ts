import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ALCANCES_CATALOGO, ESTADOS_ITEM } from '../domain/tipos.js';

// Cuerpos y respuestas de /v1/catalogos en snake_case, solo para OpenAPI. La validación va con zod.

export class CatalogoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'MEDIO_PAGO' })
  codigo!: string;

  @ApiProperty({ example: 'Medios de pago' })
  nombre!: string;

  @ApiProperty({ enum: ALCANCES_CATALOGO })
  alcance!: string;

  @ApiProperty({ nullable: true, example: 'SUNAT catálogo 06' })
  fuente!: string | null;

  @ApiProperty({ description: 'GLOBAL: false; MIXTO y TENANT: true' })
  editable_por_tenant!: boolean;

  @ApiProperty({ description: 'Versión de contenido global y bloqueo optimista', example: 1 })
  version!: number;

  @ApiProperty({ description: 'true en las tablas oficiales: sus ítems globales cambian solo por importación' })
  importable!: boolean;
}

export class CatalogoActualizadoDto extends CatalogoDto {
  @ApiProperty({ description: 'false si no había cambios: no se escribió ni se publicó' })
  cambiado!: boolean;
}

export class CrearCatalogoDto {
  @ApiProperty({ example: 'MEDIO_PAGO', description: 'De 3 a 60 mayúsculas, dígitos o guion bajo' })
  codigo!: string;

  @ApiProperty({ example: 'Medios de pago' })
  nombre!: string;

  @ApiProperty({ enum: ALCANCES_CATALOGO, description: 'No cambia después de crear' })
  alcance!: string;

  @ApiPropertyOptional({ nullable: true })
  fuente?: string | null;

  @ApiProperty({ description: 'GLOBAL: false; MIXTO y TENANT: true (TR-CA-059)' })
  editable_por_tenant!: boolean;
}

export class ActualizarCatalogoDto {
  @ApiProperty()
  nombre!: string;

  @ApiPropertyOptional({ nullable: true })
  fuente?: string | null;

  @ApiProperty()
  editable_por_tenant!: boolean;

  @ApiProperty({ description: 'Versión con la que se leyó' })
  version!: number;
}

export class ItemVisibleDto {
  @ApiProperty({ format: 'uuid' })
  item_id!: string;

  @ApiProperty({ example: 'YAPE' })
  codigo!: string;

  @ApiProperty({ nullable: true })
  codigo_externo!: string | null;

  @ApiProperty({ description: 'Con el alias del tenant, si lo tiene' })
  nombre!: string;

  @ApiProperty({ type: 'object', additionalProperties: true, example: { longitud: 8, regex: '^[0-9]{8}$' } })
  atributos!: Record<string, unknown>;

  @ApiProperty()
  orden!: number;
}

export class ItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  codigo!: string;

  @ApiProperty({ nullable: true })
  codigo_externo!: string | null;

  @ApiProperty()
  nombre!: string;

  @ApiProperty({ nullable: true })
  abreviatura!: string | null;

  @ApiProperty()
  orden!: number;

  @ApiProperty({ type: 'object', additionalProperties: true })
  atributos!: Record<string, unknown>;

  @ApiProperty({ format: 'date' })
  vigente_desde!: string;

  @ApiProperty({ format: 'date', nullable: true })
  vigente_hasta!: string | null;

  @ApiProperty()
  activo!: boolean;

  @ApiProperty()
  version!: number;
}

export class ItemActualizadoDto extends ItemDto {
  @ApiProperty({ description: 'false si no había cambios: no se escribió ni se publicó' })
  cambiado!: boolean;
}

class ContenidoItemDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 40, example: '1' })
  codigo_externo?: string | null;

  @ApiProperty({ maxLength: 200 })
  nombre!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 30 })
  abreviatura?: string | null;

  @ApiPropertyOptional({ default: 0 })
  orden?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'longitud, regex, valida_reniec, mascara y claves libres; hasta 4 KB' })
  atributos?: Record<string, unknown>;

  @ApiProperty({ format: 'date', example: '2026-01-01' })
  vigente_desde!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true, description: 'Inclusiva. Cerrarla es la alternativa a eliminar un ítem en uso' })
  vigente_hasta?: string | null;

  @ApiPropertyOptional({ default: true })
  activo?: boolean;
}

export class CrearItemDto extends ContenidoItemDto {
  @ApiProperty({ example: 'YAPE', maxLength: 40, description: 'No cambia después de crear' })
  codigo!: string;
}

export class ActualizarItemDto extends ContenidoItemDto {
  @ApiProperty({ description: 'Versión con la que se leyó' })
  version!: number;
}

export class AjusteDto {
  @ApiProperty()
  visible!: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'null: el orden del ítem global' })
  orden?: number | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 200, description: 'null: el nombre del ítem global' })
  alias?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Versión del ajuste leída; null si el tenant no tenía ajuste' })
  version?: number | null;
}

export class AjusteAplicadoDto {
  @ApiProperty({ format: 'uuid' })
  item_id!: string;

  @ApiProperty()
  visible!: boolean;

  @ApiProperty({ nullable: true })
  orden!: number | null;

  @ApiProperty({ nullable: true })
  alias!: string | null;

  @ApiProperty({ nullable: true, description: 'null si el ajuste quedó neutro y se borró' })
  version!: number | null;

  @ApiProperty()
  cambiado!: boolean;
}

export class AjusteAdministradoDto {
  @ApiProperty()
  visible!: boolean;

  @ApiProperty({ nullable: true, type: Number })
  orden!: number | null;

  @ApiProperty({ nullable: true, type: String })
  alias!: string | null;

  @ApiProperty()
  version!: number;
}

export class ItemAdministracionDto {
  @ApiProperty({ format: 'uuid' })
  item_id!: string;

  @ApiProperty({ example: 'PLIN' })
  codigo!: string;

  @ApiProperty({ nullable: true, type: String })
  codigo_externo!: string | null;

  @ApiProperty({ description: 'El del ítem, sin el alias del tenant' })
  nombre!: string;

  @ApiProperty({ nullable: true, type: String })
  abreviatura!: string | null;

  @ApiProperty({ description: 'El del ítem, sin el orden del ajuste' })
  orden!: number;

  @ApiProperty({ type: 'object', additionalProperties: true })
  atributos!: Record<string, unknown>;

  @ApiProperty({ format: 'date' })
  vigente_desde!: string;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  vigente_hasta!: string | null;

  @ApiProperty()
  activo!: boolean;

  @ApiProperty({ description: 'true si es del tenant' })
  propio!: boolean;

  @ApiProperty({ enum: ESTADOS_ITEM, description: 'Hoy en America/Lima, con el ajuste del tenant' })
  estado!: string;

  @ApiProperty({ type: AjusteAdministradoDto, nullable: true, description: 'El ajuste del tenant sobre un ítem global, o null' })
  ajuste!: AjusteAdministradoDto | null;

  @ApiProperty()
  version!: number;
}

export class PaginaItemsAdministracionDto {
  @ApiProperty({ type: [ItemAdministracionDto] })
  items!: ItemAdministracionDto[];

  @ApiProperty({ description: 'Ítems que cumplen los filtros, sin paginar' })
  total!: number;

  @ApiProperty()
  pagina!: number;

  @ApiProperty()
  tamano!: number;
}
