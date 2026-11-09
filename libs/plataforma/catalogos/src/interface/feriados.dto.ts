import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ALCANCES_FERIADO } from '../domain/feriados/tipos.js';

// Cuerpos y respuestas de /v1/feriados en snake_case, solo para OpenAPI. La validación va con zod.

export class FeriadoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ALCANCES_FERIADO })
  alcance!: string;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Solo en feriados de sucursal' })
  sucursal_id!: string | null;

  @ApiProperty({ format: 'date', example: '2026-07-28', description: 'Si es recurrente, vale desde ese año' })
  fecha!: string;

  @ApiProperty({ example: 'Fiestas Patrias' })
  nombre!: string;

  @ApiProperty()
  recurrente_anual!: boolean;

  @ApiProperty({ example: 0 })
  version!: number;
}

export class FeriadoDelAnioDto extends FeriadoDto {
  @ApiProperty({ format: 'date', example: '2027-07-28', description: 'Fecha en el año pedido' })
  fecha_en_anio!: string;

  @ApiProperty({ description: 'false en los globales si el actor no es del tenant operador' })
  editable!: boolean;
}

export class PaginaFeriadosDto {
  @ApiProperty({ type: [FeriadoDelAnioDto] })
  items!: FeriadoDelAnioDto[];

  @ApiProperty({ description: 'Feriados del año que cumplen los filtros, sin paginar' })
  total!: number;

  @ApiProperty()
  pagina!: number;

  @ApiProperty()
  tamano!: number;
}

export class FeriadoActualizadoDto extends FeriadoDto {
  @ApiProperty({ description: 'false si no había cambios: no se escribió ni se publicó' })
  cambiado!: boolean;
}

export class CrearFeriadoDto {
  @ApiProperty({ enum: ALCANCES_FERIADO, description: 'GLOBAL solo desde el tenant operador (TR-RN-012). No cambia después' })
  alcance!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Obligatoria en SUCURSAL; prohibida en los demás' })
  sucursal_id?: string | null;

  @ApiProperty({ format: 'date', example: '2026-10-08' })
  fecha!: string;

  @ApiProperty({ example: 'Combate de Angamos', description: 'De 3 a 100 caracteres' })
  nombre!: string;

  @ApiProperty()
  recurrente_anual!: boolean;
}

export class ActualizarFeriadoDto {
  @ApiProperty({ format: 'date' })
  fecha!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty()
  recurrente_anual!: boolean;

  @ApiProperty({ description: 'Versión con la que se leyó' })
  version!: number;

  @ApiPropertyOptional({ enum: ALCANCES_FERIADO, description: 'Si llega, debe ser el guardado: el alcance no se cambia' })
  alcance?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Si llega, debe ser la guardada' })
  sucursal_id?: string | null;
}
