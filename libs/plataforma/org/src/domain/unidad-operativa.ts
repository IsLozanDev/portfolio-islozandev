import { AggregateRoot, ConflictError, ValidationError } from '@vitrina/plataforma/kernel';
import type { Empresa } from './empresa.js';
import type { Sucursal } from './sucursal.js';
import { textoRequerido } from './texto.js';

// Lista cerrada hasta que el catálogo TIPO_UNIDAD la reemplace (spec 19a).
export const TIPOS_UNIDAD = [
  'ALMACEN',
  'CAJA',
  'PUNTO_VENTA',
  'CONSULTORIO',
  'VENTANILLA',
  'SALON',
  'ESTACION_PRODUCCION',
  'FARMACIA',
  'OFICINA',
] as const;
export type TipoUnidad = (typeof TIPOS_UNIDAD)[number];

export type Atributos = Record<string, unknown>;

export interface DatosUnidad {
  codigo: string;
  nombre: string;
  atributos: Atributos;
}

export interface UnidadProps extends DatosUnidad {
  tenantId: string;
  empresaId: string;
  sucursalId: string | null;
  tipo: TipoUnidad;
  padreId: string | null;
  activo: boolean;
}

export class UnidadOperativa extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: UnidadProps,
  ) {
    super(id, version);
  }

  /** `sucursal` null solo para ALMACEN, que queda a nivel de empresa (TR-RN-004, TR-CA-012). */
  static crear(
    id: string,
    empresa: Empresa,
    sucursal: Sucursal | null,
    tipo: TipoUnidad,
    datos: DatosUnidad,
    padre: UnidadOperativa | null,
  ): UnidadOperativa {
    if (!TIPOS_UNIDAD.includes(tipo)) throw new ValidationError(`Tipo de unidad desconocido: ${tipo}`);
    if (!empresa.activo) throw new ConflictError('La empresa está inactiva');
    if (sucursal === null && tipo !== 'ALMACEN') {
      throw new ValidationError('Solo los almacenes pueden registrarse sin sucursal');
    }
    if (sucursal !== null) {
      if (sucursal.empresaId !== empresa.id) throw new ConflictError('La sucursal no pertenece a la empresa');
      if (!sucursal.activo) throw new ConflictError('La sucursal está inactiva');
    }
    const unidad = new UnidadOperativa(id, 0, {
      tenantId: empresa.tenantId,
      empresaId: empresa.id,
      sucursalId: sucursal?.id ?? null,
      tipo,
      padreId: null,
      activo: true,
      ...validarDatos(datos),
    });
    unidad.props.padreId = unidad.validarPadre(padre);
    unidad.publicar('unidad.creada');
    return unidad;
  }

  static reconstituir(id: string, version: number, props: UnidadProps): UnidadOperativa {
    return new UnidadOperativa(id, version, { ...props, atributos: { ...props.atributos } });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get empresaId(): string {
    return this.props.empresaId;
  }

  get sucursalId(): string | null {
    return this.props.sucursalId;
  }

  get tipo(): TipoUnidad {
    return this.props.tipo;
  }

  get padreId(): string | null {
    return this.props.padreId;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  get datos(): DatosUnidad {
    const { codigo, nombre, atributos } = this.props;
    return { codigo, nombre, atributos: { ...atributos } };
  }

  /** Tipo, empresa y sucursal no cambian: definen dónde vive la unidad. */
  editar(datos: DatosUnidad, padre: UnidadOperativa | null): void {
    const padreId = this.validarPadre(padre);
    this.props = { ...this.props, ...validarDatos(datos), padreId };
    this.publicar('unidad.actualizada');
  }

  inactivar(): void {
    if (!this.props.activo) return;
    this.props = { ...this.props, activo: false };
    this.publicar('unidad.inactivada');
  }

  reactivar(): void {
    if (this.props.activo) return;
    this.props = { ...this.props, activo: true };
    this.publicar('unidad.actualizada');
  }

  private validarPadre(padre: UnidadOperativa | null): string | null {
    if (padre === null) return null;
    if (padre.id === this.id) throw new ValidationError('Una unidad no puede ser su propio padre');
    if (padre.empresaId !== this.props.empresaId) {
      throw new ConflictError('La unidad padre debe ser de la misma empresa');
    }
    return padre.id;
  }

  private publicar(eventType: string): void {
    const p = this.props;
    this.raise({
      eventType,
      aggregateType: 'unidad',
      schemaVersion: 1,
      payload: { empresa_id: p.empresaId, sucursal_id: p.sucursalId, tipo: p.tipo, codigo: p.codigo },
    });
  }
}

function validarDatos(datos: DatosUnidad): DatosUnidad {
  const { atributos } = datos;
  if (atributos === null || typeof atributos !== 'object' || Array.isArray(atributos)) {
    throw new ValidationError('Los atributos de la unidad deben ser un objeto');
  }
  return {
    codigo: textoRequerido(datos.codigo, 1, 20, 'El código de unidad'),
    nombre: textoRequerido(datos.nombre, 3, 150, 'El nombre de la unidad'),
    atributos: { ...atributos },
  };
}
