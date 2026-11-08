import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ESTADOS_IMPORTACION } from '../domain/importacion/tipos.js';

// Cuerpos y respuestas de las importaciones (spec 19b) en snake_case, solo para OpenAPI. La validación va con zod.

const ESTADOS_SEGUIMIENTO = [...ESTADOS_IMPORTACION, 'EN_PROCESO'];

export class PrevisualizarImportacionDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'CSV (UTF-8, `,` o `;`) o XLSX; hasta 20 MB y 50 000 filas' })
  archivo!: unknown;

  @ApiProperty({ example: '2026-06', description: 'De 1 a 40 caracteres' })
  version_oficial!: string;

  @ApiProperty({ example: '2026-06-01', description: 'YYYY-MM-DD: altas desde ese día y bajas hasta el anterior' })
  fecha_vigencia!: string;
}

export class ResumenImportacionDto {
  @ApiProperty() altas!: number;
  @ApiProperty() cambios!: number;
  @ApiProperty() bajas!: number;
  @ApiProperty() sin_cambios!: number;
}

export class ResumenPrevisualizacionDto extends ResumenImportacionDto {
  @ApiProperty() total_filas!: number;
}

export class FilaImportadaDto {
  @ApiProperty({ description: 'Fila del archivo, con la cabecera en la 1' }) fila!: number;
  @ApiProperty() codigo!: string;
  @ApiProperty({ nullable: true, type: String }) codigo_externo!: string | null;
  @ApiProperty() nombre!: string;
  @ApiProperty({ nullable: true, type: String }) abreviatura!: string | null;
  @ApiProperty() orden!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) atributos!: Record<string, string>;
}

export class ItemAntesDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() codigo!: string;
  @ApiProperty({ nullable: true, type: String }) codigo_externo!: string | null;
  @ApiProperty() nombre!: string;
  @ApiProperty({ nullable: true, type: String }) abreviatura!: string | null;
  @ApiProperty() orden!: number;
  @ApiProperty({ type: 'object', additionalProperties: true }) atributos!: Record<string, unknown>;
  @ApiProperty() vigente_desde!: string;
  @ApiProperty({ nullable: true, type: String }) vigente_hasta!: string | null;
  @ApiProperty() activo!: boolean;
}

export class CambioEnMuestraDto {
  @ApiProperty({ type: ItemAntesDto }) antes!: ItemAntesDto;
  @ApiProperty({ type: FilaImportadaDto }) despues!: FilaImportadaDto;
}

export class BajaEnMuestraDto {
  @ApiProperty({ format: 'uuid' }) item_id!: string;
  @ApiProperty() codigo!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ description: 'fecha_vigencia - 1, sin quedar antes de su vigente_desde (TR-CA-074)' }) vigente_hasta!: string;
}

export class MuestraDto {
  @ApiProperty({ type: [FilaImportadaDto] }) altas!: FilaImportadaDto[];
  @ApiProperty({ type: [CambioEnMuestraDto] }) cambios!: CambioEnMuestraDto[];
  @ApiProperty({ type: [BajaEnMuestraDto] }) bajas!: BajaEnMuestraDto[];
}

export class PrevisualizacionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'La que se envía en `aplicar` (bloqueo optimista)', example: 0 }) version!: number;
  @ApiProperty({ enum: ESTADOS_IMPORTACION }) estado!: string;
  @ApiProperty() version_oficial!: string;
  @ApiProperty() fecha_vigencia!: string;
  @ApiProperty() archivo_sha256!: string;
  @ApiProperty({ type: ResumenPrevisualizacionDto }) resumen!: ResumenPrevisualizacionDto;
  @ApiProperty({ type: MuestraDto, description: 'Hasta 20 de cada tipo' }) muestra!: MuestraDto;
  @ApiProperty({ format: 'date-time', description: 'A las 24 h queda VENCIDA' }) vence_en!: string;
}

export class ErrorFilaDto {
  @ApiProperty() fila!: number;
  @ApiProperty() columna!: string;
  @ApiProperty({ description: 'Recortado a 100 caracteres' }) valor!: string;
  @ApiProperty() mensaje!: string;
}

export class FilasInvalidasDto {
  @ApiProperty({ example: 'FILAS_INVALIDAS' }) codigo!: string;
  @ApiProperty() mensaje!: string;
  @ApiProperty({ format: 'uuid', description: 'La importación RECHAZADA: su reporte se descarga en errores.csv' }) importacion_id!: string;
  @ApiProperty({ description: 'Total real, aunque pase de los 10 000 guardados' }) total_errores!: number;
  @ApiProperty({ type: [ErrorFilaDto], description: 'Los primeros 100' }) errores!: ErrorFilaDto[];
}

export class ImportacionListadaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ESTADOS_IMPORTACION }) estado!: string;
  @ApiProperty() version_oficial!: string;
  @ApiProperty() fecha_vigencia!: string;
  @ApiProperty() archivo_nombre!: string;
  @ApiProperty() archivo_sha256!: string;
  @ApiProperty({ type: ResumenImportacionDto }) resumen!: ResumenImportacionDto;
  @ApiProperty() total_errores!: number;
  @ApiProperty({ nullable: true, type: String }) motivo_fallo!: string | null;
  @ApiProperty({ format: 'uuid' }) lanzado_por!: string;
  @ApiProperty({ format: 'date-time' }) creado_en!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) aplicado_por!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) terminado_en!: string | null;
}

export class HistorialImportacionesDto {
  @ApiProperty({ type: [ImportacionListadaDto] }) items!: ImportacionListadaDto[];
  @ApiProperty() total!: number;
}

/** `estado` es EN_COLA o EN_PROCESO (si Redis lo dice y la base sigue EN_COLA). */
export class ImportacionActivaDto extends ImportacionListadaDto {
  @ApiProperty({ nullable: true, type: Number, description: '0-99 desde Redis; el 100 llega con el fin' }) avance!: number | null;
}

export class DetalleImportacionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'UBIGEO' }) codigo!: string;
  @ApiProperty({ enum: ESTADOS_SEGUIMIENTO, description: 'EN_PROCESO si Redis lo dice y la base sigue EN_COLA' }) estado!: string;
  @ApiProperty({ nullable: true, type: Number }) avance!: number | null;
  @ApiProperty() version_oficial!: string;
  @ApiProperty() fecha_vigencia!: string;
  @ApiProperty() archivo_nombre!: string;
  @ApiProperty() archivo_sha256!: string;
  @ApiProperty({ type: ResumenImportacionDto }) resumen!: ResumenImportacionDto;
  @ApiProperty() total_errores!: number;
  @ApiProperty({ nullable: true, type: String }) motivo_fallo!: string | null;
  @ApiProperty({ format: 'uuid' }) lanzado_por!: string;
  @ApiProperty({ format: 'date-time' }) creado_en!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) aplicado_por!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) terminado_en!: string | null;
  @ApiProperty({ format: 'date-time' }) vence_en!: string;
}

export class AplicarImportacionDto {
  @ApiProperty({ description: 'Versión con la que se leyó la importación (bloqueo optimista)', example: 0 }) version!: number;
}

export class ImportacionEncoladaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['EN_COLA'] }) estado!: string;
}

export class AvisoImportacionDto {
  @ApiProperty({ enum: ['avance', 'fin'] }) tipo!: string;
  @ApiProperty({ enum: ['EN_COLA', 'EN_PROCESO', 'APLICADA', 'FALLIDA', 'OBSOLETA'] }) estado!: string;
  @ApiPropertyOptional({ description: 'Solo en `avance`: 0-99' }) avance?: number;
  @ApiPropertyOptional({ type: ResumenImportacionDto, nullable: true, description: 'Solo en `fin` APLICADA' }) resumen?: ResumenImportacionDto | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Solo en `fin` FALLIDA u OBSOLETA' }) motivo?: string | null;
}
