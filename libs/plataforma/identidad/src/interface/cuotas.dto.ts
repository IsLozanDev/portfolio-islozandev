import { ApiProperty } from '@nestjs/swagger';
import type { CuotaActual } from '../application/consultar-cuota-actual.js';
import type { DetalleCuota, FilaCuotaConsola } from '../application/ports/cuotas.js';
import { porcentajeConsumo, type EstadoCuota } from '../domain/estado-cuota.js';
import { PLANES_CUOTA, type PlanCuota } from '../domain/plan-cuota.js';

export class CuotaActualDto {
  @ApiProperty({ example: '2026-11', description: 'Mes en hora de Lima' })
  periodo!: string;

  @ApiProperty({ enum: PLANES_CUOTA })
  plan!: PlanCuota;

  @ApiProperty({ example: 500 })
  incluidas!: number;

  @ApiProperty({ example: 120 })
  consumidas!: number;

  @ApiProperty({ example: 24, description: 'Entero, truncado; 100 si no hay incluidas' })
  porcentaje!: number;

  @ApiProperty({ example: 80 })
  umbral_aviso!: number;
}

class CuotaBaseDto {
  @ApiProperty({ format: 'uuid' })
  tenant_id!: string;

  @ApiProperty({ enum: PLANES_CUOTA })
  plan!: PlanCuota;

  @ApiProperty()
  incluidas!: number;

  @ApiProperty()
  consumidas!: number;

  @ApiProperty()
  porcentaje!: number;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  avisado_umbral_en!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  avisado_agotada_en!: string | null;

  @ApiProperty({ description: 'Para el PATCH (bloqueo optimista)' })
  version!: number;
}

export class FilaCuotaDto extends CuotaBaseDto {
  @ApiProperty({ example: 'Pollería Doña Rosa' })
  tenant_nombre!: string;
}

export class PaginaCuotasDto {
  @ApiProperty({ example: '2026-11' })
  periodo!: string;

  @ApiProperty({ type: [FilaCuotaDto], description: 'De mayor a menor consumo' })
  items!: FilaCuotaDto[];

  @ApiProperty({ description: 'Cuotas que cumplen el filtro, sin paginar' })
  total!: number;

  @ApiProperty()
  pagina!: number;

  @ApiProperty()
  tamano!: number;
}

export class ConsultasPorResultadoDto {
  @ApiProperty() CACHE!: number;
  @ApiProperty() PROVEEDOR!: number;
  @ApiProperty() NO_ENCONTRADO!: number;
  @ApiProperty() INVALIDO!: number;
  @ApiProperty() CUOTA_AGOTADA!: number;
  @ApiProperty() PROVEEDOR_NO_DISPONIBLE!: number;
}

export class DetalleCuotaDto extends FilaCuotaDto {
  @ApiProperty({ example: '2026-11' })
  periodo!: string;

  @ApiProperty({ format: 'date-time' })
  creada_en!: string;

  @ApiProperty({ type: ConsultasPorResultadoDto, description: 'Consultas del periodo en hora de Lima' })
  consultas_por_resultado!: ConsultasPorResultadoDto;
}

export class CuotaDto extends CuotaBaseDto {
  @ApiProperty({ example: '2026-11' })
  periodo!: string;
}

export class AjusteCuotaDto {
  @ApiProperty({ minimum: 0, example: 800, description: 'No menos que las consumidas' })
  incluidas!: number;

  @ApiProperty({ minimum: 1, description: 'La que devolvió la lista o el detalle' })
  version!: number;
}

export function cuotaActualDto(cuota: CuotaActual): CuotaActualDto {
  const { periodo, plan, incluidas, consumidas, porcentaje, umbralAviso } = cuota;
  return { periodo, plan, incluidas, consumidas, porcentaje, umbral_aviso: umbralAviso };
}

function cuotaBaseDto(cuota: Omit<EstadoCuota, 'periodo'>): CuotaBaseDto {
  return {
    tenant_id: cuota.tenantId,
    plan: cuota.plan,
    incluidas: cuota.incluidas,
    consumidas: cuota.consumidas,
    porcentaje: porcentajeConsumo(cuota),
    avisado_umbral_en: cuota.avisadoUmbralEn?.toISOString() ?? null,
    avisado_agotada_en: cuota.avisadoAgotadaEn?.toISOString() ?? null,
    version: cuota.version,
  };
}

export function filaCuotaDto(fila: FilaCuotaConsola): FilaCuotaDto {
  return { ...cuotaBaseDto(fila), tenant_nombre: fila.tenantNombre };
}

export function detalleCuotaDto(detalle: DetalleCuota): DetalleCuotaDto {
  return {
    ...filaCuotaDto(detalle),
    periodo: detalle.periodo,
    creada_en: detalle.creadaEn.toISOString(),
    consultas_por_resultado: detalle.consultasPorResultado,
  };
}

export function cuotaDto(cuota: EstadoCuota): CuotaDto {
  return { ...cuotaBaseDto(cuota), periodo: cuota.periodo };
}
