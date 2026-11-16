import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { TipoConsultable } from '../domain/datos-identidad.js';
import { RANGOS_PROVEEDOR, type ProveedorEditable } from '../domain/proveedor-editable.js';

const TIPOS_CONSULTABLES: TipoConsultable[] = ['DNI', 'RUC'];

/** Sin credenciales: viven en el entorno de apps/api (regla 9). */
export class ProveedorDto {
  @ApiProperty({ example: 'DECOLECTA' })
  codigo!: string;

  @ApiProperty({ enum: TIPOS_CONSULTABLES, isArray: true })
  tipos_doc!: TipoConsultable[];

  @ApiProperty({ example: 1, description: 'Menor número, primero en el orden de respaldo' })
  prioridad!: number;

  @ApiProperty({ example: 30, description: 'Días de vigencia de la caché' })
  ttl_dias!: number;

  @ApiProperty({ example: 3000 })
  timeout_ms!: number;

  @ApiProperty()
  activo!: boolean;

  @ApiProperty({ description: 'Para el PATCH (bloqueo optimista)' })
  version!: number;
}

export class CambiosProveedorDto {
  @ApiPropertyOptional({ minimum: RANGOS_PROVEEDOR.prioridad.minimo, maximum: RANGOS_PROVEEDOR.prioridad.maximo })
  prioridad?: number;

  @ApiPropertyOptional({ minimum: RANGOS_PROVEEDOR.ttlDias.minimo, maximum: RANGOS_PROVEEDOR.ttlDias.maximo })
  ttl_dias?: number;

  @ApiPropertyOptional({ minimum: RANGOS_PROVEEDOR.timeoutMs.minimo, maximum: RANGOS_PROVEEDOR.timeoutMs.maximo })
  timeout_ms?: number;

  @ApiPropertyOptional({ description: 'false no se acepta si deja un tipo de documento sin proveedor activo' })
  activo?: boolean;

  @ApiProperty({ minimum: 1, description: 'La que devolvió la lista' })
  version!: number;
}

export function proveedorDto(proveedor: ProveedorEditable): ProveedorDto {
  const { codigo, tiposDoc, prioridad, ttlDias, timeoutMs, activo, version } = proveedor;
  return { codigo, tipos_doc: [...tiposDoc], prioridad, ttl_dias: ttlDias, timeout_ms: timeoutMs, activo, version };
}
