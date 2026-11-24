import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DetallePlantilla } from '../application/plantillas/vista-plantilla.js';
import type { VersionPlantilla } from '../application/plantillas/listar-versiones-plantilla.js';
import type { VistaPrevia } from '../application/plantillas/vista-previa-plantilla.js';
import type { Pagina, ResumenPlantilla } from '../application/ports/repositorios.js';
import { CANALES_HABILITADOS } from '../domain/canal.js';
import { LARGO_MAXIMO_CUERPO } from '../domain/personalizacion-plantilla.js';
import { ORIGENES_PLANTILLA, type VariableDeclarada } from '../domain/plantilla.js';
import { LARGO_MAXIMO_ASUNTO } from '../domain/renderizador-plantilla.js';

const CODIGO_EJEMPLO = 'PRUEBA_CORREO';

export class PersonalizarPlantillaDto {
  @ApiProperty({ minLength: 1, maxLength: LARGO_MAXIMO_ASUNTO, example: 'Prueba de correo de {{producto}}', description: 'Una línea' })
  asunto!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: LARGO_MAXIMO_CUERPO,
    example: '<p>Hola {{nombre}}:</p><p>Gracias por usar {{producto}}.</p>',
    description: 'HTML; se sanea en el servidor con una lista blanca (TR-RNF-012). Solo marcadores {{variable}} declarados por la base',
  })
  cuerpo!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: null,
    description: 'Versión de la personalizada vigente que se leyó; null si regía la base (bloqueo optimista)',
  })
  version!: number | null;
}

export class VistaPreviaSolicitudDto {
  @ApiPropertyOptional({ maxLength: LARGO_MAXIMO_ASUNTO, description: 'Sin él se usa el asunto vigente' })
  asunto?: string;

  @ApiPropertyOptional({ maxLength: LARGO_MAXIMO_CUERPO, description: 'Sin él se usa el cuerpo vigente; se sanea como al guardar' })
  cuerpo?: string;
}

export class VistaPreviaDto {
  @ApiProperty({ example: 'Prueba de correo de SazónPOS' })
  asunto!: string;

  @ApiProperty({ example: '<p>Hola María Quispe:</p><p>Gracias por usar SazónPOS.</p>', description: 'Con los valores de ejemplo de cada variable' })
  cuerpo_html!: string;
}

class VariableDeclaradaDto {
  @ApiProperty({ example: 'nombre' })
  nombre!: string;

  @ApiProperty({ example: 'texto' })
  tipo!: string;

  @ApiProperty({ type: String, nullable: true, example: 'María Quispe', description: 'Valor de la vista previa' })
  ejemplo!: string | null;
}

class TextoBaseDto {
  @ApiProperty({ type: String, nullable: true })
  asunto!: string | null;

  @ApiProperty()
  cuerpo!: string;
}

export class PlantillaDto {
  @ApiProperty({ example: CODIGO_EJEMPLO })
  codigo!: string;

  @ApiProperty({ enum: CANALES_HABILITADOS })
  canal!: string;

  @ApiProperty({ example: 'es' })
  idioma!: string;

  @ApiProperty({ enum: ORIGENES_PLANTILLA })
  origen!: string;

  @ApiProperty({ type: String, nullable: true })
  asunto!: string | null;

  @ApiProperty({ description: 'HTML saneado' })
  cuerpo!: string;

  @ApiProperty({ type: [VariableDeclaradaDto], description: 'Las declara la base; el tenant no las edita' })
  variables!: VariableDeclaradaDto[];

  @ApiProperty({ type: Number, nullable: true, description: 'De la personalizada vigente; null si rige la base. Va en el PUT' })
  version!: number | null;

  @ApiProperty({ format: 'date-time' })
  actualizado_en!: string;

  @ApiProperty({ type: TextoBaseDto, description: 'Asunto y cuerpo de la base, para mostrar o comparar la original' })
  base!: TextoBaseDto;
}

class ResumenPlantillaDto {
  @ApiProperty({ example: CODIGO_EJEMPLO })
  codigo!: string;

  @ApiProperty({ enum: CANALES_HABILITADOS })
  canal!: string;

  @ApiProperty({ example: 'es' })
  idioma!: string;

  @ApiProperty({ enum: ORIGENES_PLANTILLA })
  origen!: string;

  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ type: String, nullable: true })
  asunto!: string | null;

  @ApiProperty({ format: 'date-time' })
  actualizado_en!: string;
}

export class PaginaPlantillasDto {
  @ApiProperty({ type: [ResumenPlantillaDto] })
  items!: ResumenPlantillaDto[];

  @ApiProperty({ description: 'Plantillas que cumplen los filtros, sin paginar' })
  total!: number;

  @ApiProperty()
  pagina!: number;

  @ApiProperty()
  tamano!: number;
}

export class VersionPlantillaDto {
  @ApiProperty({ example: 2 })
  version!: number;

  @ApiProperty({ description: 'La vigente del tenant; ninguna si se restauró la base' })
  activa!: boolean;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  creado_por!: string | null;

  @ApiProperty({ format: 'date-time' })
  creado_en!: string;
}

export class ErrorPlantillaDto {
  @ApiProperty({ example: 'VARIABLE_NO_PERMITIDA' })
  codigo!: string;

  @ApiProperty({ example: 'Variable no permitida: diagnostico' })
  mensaje!: string;

  @ApiPropertyOptional({ type: [String], example: ['diagnostico'], description: 'Solo en VARIABLE_NO_PERMITIDA' })
  variables?: string[];
}

function variableDto(variable: VariableDeclarada): VariableDeclaradaDto {
  return { nombre: variable.nombre, tipo: variable.tipo, ejemplo: variable.ejemplo ?? null };
}

export function plantillaDto(detalle: DetallePlantilla): PlantillaDto {
  return {
    codigo: detalle.codigo,
    canal: detalle.canal,
    idioma: detalle.idioma,
    origen: detalle.origen,
    asunto: detalle.asunto,
    cuerpo: detalle.cuerpo,
    variables: detalle.variables.map(variableDto),
    version: detalle.version,
    actualizado_en: detalle.actualizadoEn.toISOString(),
    base: { asunto: detalle.base.asunto, cuerpo: detalle.base.cuerpo },
  };
}

function resumenPlantillaDto(resumen: ResumenPlantilla): ResumenPlantillaDto {
  return {
    codigo: resumen.codigo,
    canal: resumen.canal,
    idioma: resumen.idioma,
    origen: resumen.origen,
    version: resumen.version,
    asunto: resumen.asunto,
    actualizado_en: resumen.actualizadoEn.toISOString(),
  };
}

export function paginaPlantillasDto(pagina: Pagina<ResumenPlantilla>): PaginaPlantillasDto {
  return {
    items: pagina.items.map(resumenPlantillaDto),
    total: pagina.total,
    pagina: pagina.pagina,
    tamano: pagina.tamano,
  };
}

export function versionPlantillaDto(version: VersionPlantilla): VersionPlantillaDto {
  return { version: version.version, activa: version.activa, creado_por: version.creadoPor, creado_en: version.creadoEn.toISOString() };
}

export function vistaPreviaDto(vista: VistaPrevia): VistaPreviaDto {
  return { asunto: vista.asunto, cuerpo_html: vista.cuerpoHtml };
}
