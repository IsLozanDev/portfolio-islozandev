import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DireccionDetalle } from '../application/ports/persona.port.js';

export class DireccionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Av. Ejército 710' })
  direccion!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Frente al parque' })
  referencia!: string | null;

  @ApiProperty({ example: '040103', description: 'Código del catálogo UBIGEO' })
  ubigeo!: string;

  @ApiProperty({ example: 'CAYMA', description: 'Como estaba en el catálogo al guardar la dirección' })
  distrito!: string;

  @ApiProperty({ example: 'AREQUIPA' })
  provincia!: string;

  @ApiProperty({ example: 'AREQUIPA' })
  departamento!: string;

  @ApiProperty()
  principal!: boolean;
}

export class AgregarDireccionDto {
  @ApiProperty({ example: 'Av. Ejército 710', minLength: 5, maxLength: 250 })
  direccion!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 150 })
  referencia?: string | null;

  @ApiProperty({ example: '040103', description: '6 dígitos, vigente en el catálogo UBIGEO' })
  ubigeo!: string;

  @ApiPropertyOptional({ default: false, description: 'Verdadero desmarca la dirección principal anterior' })
  principal?: boolean;
}

export class EditarDireccionDto {
  @ApiProperty({ minimum: 0, description: 'Versión de la persona que se leyó' })
  version!: number;

  @ApiPropertyOptional({ minLength: 5, maxLength: 250 })
  direccion?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 150, description: 'Nula la borra' })
  referencia?: string | null;

  @ApiPropertyOptional({ example: '040103', description: 'Solo se valida contra el catálogo si cambia' })
  ubigeo?: string;

  @ApiPropertyOptional({ description: 'Verdadero desmarca la dirección principal anterior' })
  principal?: boolean;
}

export function direccionDto(direccion: DireccionDetalle): DireccionDto {
  return { ...direccion };
}
