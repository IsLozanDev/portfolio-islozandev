import { ApiProperty } from '@nestjs/swagger';
import { ESTADOS_SUSCRIPCION, ESTADOS_TENANT, PLANES, PRODUCTOS } from '@vitrina/plataforma/org';
import { z } from 'zod';
import type { CambioDeEstado, SuscripcionResumen, TenantDetalle, TenantListado } from './consulta-tenants.js';
import { EsquemaPagina } from './organizacion.http.js';

/** Igual que org.tenant.nombre: cota de la búsqueda por código o nombre. */
const LONGITUD_MAXIMA_BUSQUEDA = 150;

export const EsquemaListarTenants = EsquemaPagina.extend({
  q: z.string().trim().min(1).max(LONGITUD_MAXIMA_BUSQUEDA).optional(),
  estado: z.enum(ESTADOS_TENANT).optional(),
  producto: z.enum(PRODUCTOS).optional(),
});

/** El motivo (10 a 500, TR-RNF-021) y la transición (TR-RN-005) los valida el dominio, con sus mensajes. */
export const EsquemaCambiarEstado = z.object({
  estado: z.enum(ESTADOS_TENANT),
  motivo: z.string(),
});

export class SuscripcionResumenDto {
  @ApiProperty({ enum: PRODUCTOS })
  producto_codigo!: string;

  @ApiProperty({ enum: PLANES })
  plan!: string;

  @ApiProperty({ enum: ESTADOS_SUSCRIPCION })
  estado!: string;

  @ApiProperty({ format: 'date', nullable: true })
  vigente_hasta!: string | null;
}

/** Solo cabecera y suscripciones (TR-RNF-010). */
export class TenantListadoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'polleria-dona-rosa' })
  codigo!: string;

  @ApiProperty({ example: 'Pollería Doña Rosa' })
  nombre!: string;

  @ApiProperty({ enum: ESTADOS_TENANT })
  estado!: string;

  @ApiProperty({ format: 'date-time' })
  creado_en!: string;

  @ApiProperty({ type: [SuscripcionResumenDto] })
  suscripciones!: SuscripcionResumenDto[];
}

export class ListadoTenantsDto {
  @ApiProperty({ type: [TenantListadoDto] })
  items!: TenantListadoDto[];

  @ApiProperty()
  total!: number;
}

export class EmpresaPrincipalDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '20512345671' })
  ruc!: string;

  @ApiProperty()
  razon_social!: string;
}

export class CambioDeEstadoDto {
  @ApiProperty({ enum: ESTADOS_TENANT })
  estado_anterior!: string;

  @ApiProperty({ enum: ESTADOS_TENANT })
  estado_nuevo!: string;

  @ApiProperty()
  motivo!: string;

  @ApiProperty({ format: 'date-time' })
  fecha_efectiva!: string;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Nulo si lo hizo la tarea de vencimientos' })
  actor_id!: string | null;

  @ApiProperty({ format: 'date-time' })
  registrado_en!: string;
}

export class TenantDetalleDto extends TenantListadoDto {
  @ApiProperty({ nullable: true })
  estado_motivo!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  estado_cambiado_en!: string | null;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: EmpresaPrincipalDto, nullable: true })
  empresa_principal!: EmpresaPrincipalDto | null;

  @ApiProperty({ type: [CambioDeEstadoDto], description: 'Del más reciente al más antiguo' })
  historial!: CambioDeEstadoDto[];
}

export class CambiarEstadoDto {
  @ApiProperty({ enum: ESTADOS_TENANT })
  estado!: string;

  @ApiProperty({ minLength: 10, maxLength: 500, example: 'Falta de pago de dos meses consecutivos' })
  motivo!: string;
}

export class EstadoCambiadoDto {
  @ApiProperty({ description: 'false si ya estaba en ese estado: no se escribió historial' })
  cambiado!: boolean;

  @ApiProperty({ enum: ESTADOS_TENANT })
  estado!: string;
}

export function tenantListadoDto(tenant: TenantListado): TenantListadoDto {
  return {
    id: tenant.id,
    codigo: tenant.codigo,
    nombre: tenant.nombre,
    estado: tenant.estado,
    creado_en: tenant.creadoEn.toISOString(),
    suscripciones: tenant.suscripciones.map(suscripcionResumenDto),
  };
}

export function tenantDetalleDto(tenant: TenantDetalle): TenantDetalleDto {
  return {
    ...tenantListadoDto(tenant),
    estado_motivo: tenant.estadoMotivo,
    estado_cambiado_en: tenant.estadoCambiadoEn?.toISOString() ?? null,
    version: tenant.version,
    empresa_principal: tenant.empresaPrincipal && {
      id: tenant.empresaPrincipal.id,
      ruc: tenant.empresaPrincipal.ruc,
      razon_social: tenant.empresaPrincipal.razonSocial,
    },
    historial: tenant.historial.map(cambioDeEstadoDto),
  };
}

function suscripcionResumenDto(suscripcion: SuscripcionResumen): SuscripcionResumenDto {
  return { producto_codigo: suscripcion.productoCodigo, plan: suscripcion.plan, estado: suscripcion.estado, vigente_hasta: suscripcion.vigenteHasta };
}

function cambioDeEstadoDto(cambio: CambioDeEstado): CambioDeEstadoDto {
  return {
    estado_anterior: cambio.estadoAnterior,
    estado_nuevo: cambio.estadoNuevo,
    motivo: cambio.motivo,
    fecha_efectiva: cambio.fechaEfectiva,
    actor_id: cambio.actorId,
    registrado_en: cambio.registradoEn,
  };
}
