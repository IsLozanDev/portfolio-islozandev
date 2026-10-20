import { AggregateRoot, ConflictError, ValidationError } from '@vitrina/plataforma/kernel';
import { CodigoTenant } from './codigo-tenant.js';
import { textoRequerido } from './texto.js';

export const ESTADOS_TENANT = ['PRUEBA', 'ACTIVO', 'SUSPENDIDO', 'BAJA'] as const;
export type EstadoTenant = (typeof ESTADOS_TENANT)[number];

// TR-RN-005 con reactivación (RF-006); BAJA es terminal (TR-CA-017).
export const TRANSICIONES: Readonly<Record<EstadoTenant, readonly EstadoTenant[]>> = {
  PRUEBA: ['ACTIVO', 'SUSPENDIDO', 'BAJA'],
  ACTIVO: ['SUSPENDIDO', 'BAJA'],
  SUSPENDIDO: ['ACTIVO', 'BAJA'],
  BAJA: [],
};

const EVENTO_POR_ESTADO: Partial<Record<EstadoTenant, string>> = {
  ACTIVO: 'tenant.reactivado',
  SUSPENDIDO: 'tenant.suspendido',
  BAJA: 'tenant.dado_de_baja',
};

export interface TenantProps {
  codigo: string;
  nombre: string;
  estado: EstadoTenant;
  estadoMotivo: string | null;
  estadoCambiadoEn: Date | null;
  bajaEn: Date | null;
}

export interface CambioEstadoTenant {
  estadoAnterior: EstadoTenant;
  estadoNuevo: EstadoTenant;
  motivo: string;
  fechaEfectiva: Date;
}

export class Tenant extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: TenantProps,
  ) {
    super(id, version);
  }

  static crear(datos: { id: string; codigo: string; nombre: string; estado: 'PRUEBA' | 'ACTIVO' }): Tenant {
    const codigo = CodigoTenant.de(datos.codigo).valor;
    const nombre = textoRequerido(datos.nombre, 3, 150, 'El nombre del tenant');
    const tenant = new Tenant(datos.id, 0, {
      codigo,
      nombre,
      estado: datos.estado,
      estadoMotivo: null,
      estadoCambiadoEn: null,
      bajaEn: null,
    });
    tenant.raise({
      eventType: 'tenant.creado',
      aggregateType: 'tenant',
      schemaVersion: 1,
      payload: { codigo, nombre, estado: datos.estado },
    });
    return tenant;
  }

  static reconstituir(id: string, version: number, props: TenantProps): Tenant {
    return new Tenant(id, version, { ...props });
  }

  get codigo(): string {
    return this.props.codigo;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get estado(): EstadoTenant {
    return this.props.estado;
  }

  get estadoMotivo(): string | null {
    return this.props.estadoMotivo;
  }

  get estadoCambiadoEn(): Date | null {
    return this.props.estadoCambiadoEn;
  }

  get bajaEn(): Date | null {
    return this.props.bajaEn;
  }

  /** PRUEBA o ACTIVO: puede registrar empresas, sucursales y unidades (RF-002 a RF-004). */
  exigirOperativo(): void {
    if (this.props.estado !== 'PRUEBA' && this.props.estado !== 'ACTIVO') {
      throw new ConflictError(`El tenant está ${this.props.estado} y no admite cambios en su estructura`);
    }
  }

  exigirNoDadoDeBaja(): void {
    if (this.props.estado === 'BAJA') throw new ConflictError('El tenant está dado de baja');
  }

  /** Devuelve null si ya está en ese estado: un reintento no cambia nada (TR-RNF-008). */
  cambiarEstado(nuevo: EstadoTenant, motivo: string, fechaEfectiva: Date): CambioEstadoTenant | null {
    const anterior = this.props.estado;
    if (nuevo === anterior) return null;
    const motivoLimpio = motivo.trim();
    if (motivoLimpio.length < 10 || motivoLimpio.length > 500) {
      throw new ValidationError('El motivo es obligatorio y debe tener de 10 a 500 caracteres');
    }
    if (anterior === 'BAJA') {
      throw new ConflictError('Un tenant dado de baja no puede reactivarse; cree uno nuevo o restaure desde respaldo');
    }
    if (!TRANSICIONES[anterior].includes(nuevo)) {
      throw new ConflictError(`Transición de estado no permitida: ${anterior} → ${nuevo}`);
    }

    this.props = {
      ...this.props,
      estado: nuevo,
      estadoMotivo: motivoLimpio,
      estadoCambiadoEn: fechaEfectiva,
      bajaEn: nuevo === 'BAJA' ? fechaEfectiva : null,
    };
    this.raise({
      eventType: EVENTO_POR_ESTADO[nuevo] as string,
      aggregateType: 'tenant',
      schemaVersion: 1,
      payload: { estado_anterior: anterior, motivo: motivoLimpio, fecha_efectiva: fechaEfectiva.toISOString() },
    });
    return { estadoAnterior: anterior, estadoNuevo: nuevo, motivo: motivoLimpio, fechaEfectiva };
  }
}
