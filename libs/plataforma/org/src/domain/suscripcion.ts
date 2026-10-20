import { AggregateRoot, ValidationError } from '@vitrina/plataforma/kernel';
import { textoOpcional } from './texto.js';

export const PRODUCTOS = ['REST', 'PSI', 'COL', 'LIB', 'GYM', 'CLI', 'DOC', 'ECO', 'LEX'] as const;
export type ProductoCodigo = (typeof PRODUCTOS)[number];

export const PLANES = ['BASICO', 'PRO', 'EMPRESA'] as const;
export type Plan = (typeof PLANES)[number];

export const ESTADOS_SUSCRIPCION = ['PRUEBA', 'ACTIVA', 'VENCIDA', 'CANCELADA'] as const;
export type EstadoSuscripcion = (typeof ESTADOS_SUSCRIPCION)[number];

export interface DatosSuscripcion {
  edicion: string | null;
  plan: Plan;
  estado: EstadoSuscripcion;
  limiteSucursales: number | null;
  limiteUsuarios: number | null;
  /** Fecha sin hora, `YYYY-MM-DD`. */
  vigenteHasta: string | null;
}

export interface SuscripcionProps extends DatosSuscripcion {
  tenantId: string;
  productoCodigo: ProductoCodigo;
}

/** Uso actual del tenant contra el que se validan los límites nuevos (TR-CA-014). */
export interface UsoActual {
  sucursalesActivas: number;
  usuariosActivos: number;
}

export class Suscripcion extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: SuscripcionProps,
  ) {
    super(id, version);
  }

  static crear(id: string, tenantId: string, productoCodigo: ProductoCodigo, datos: DatosSuscripcion, uso: UsoActual): Suscripcion {
    if (!PRODUCTOS.includes(productoCodigo)) throw new ValidationError(`Producto desconocido: ${productoCodigo}`);
    const limpios = validarDatos(datos, null, uso);
    const suscripcion = new Suscripcion(id, 0, { tenantId, productoCodigo, ...limpios });
    suscripcion.publicarCambio(true);
    return suscripcion;
  }

  static reconstituir(id: string, version: number, props: SuscripcionProps): Suscripcion {
    return new Suscripcion(id, version, { ...props });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get productoCodigo(): ProductoCodigo {
    return this.props.productoCodigo;
  }

  get datos(): DatosSuscripcion {
    const { edicion, plan, estado, limiteSucursales, limiteUsuarios, vigenteHasta } = this.props;
    return { edicion, plan, estado, limiteSucursales, limiteUsuarios, vigenteHasta };
  }

  /** PRUEBA o ACTIVA: otorga permisos y su límite de sucursales cuenta (TR-RN-006). */
  get vigente(): boolean {
    return this.props.estado === 'PRUEBA' || this.props.estado === 'ACTIVA';
  }

  cambiar(datos: DatosSuscripcion, uso: UsoActual): void {
    const limpios = validarDatos(datos, this.props.estado, uso);
    this.props = { ...this.props, ...limpios };
    this.publicarCambio(false);
  }

  private publicarCambio(nueva: boolean): void {
    const p = this.props;
    this.raise({
      eventType: 'suscripcion.cambiada',
      aggregateType: 'suscripcion',
      schemaVersion: 1,
      payload: {
        producto_codigo: p.productoCodigo,
        plan: p.plan,
        estado: p.estado,
        limite_sucursales: p.limiteSucursales,
        limite_usuarios: p.limiteUsuarios,
        vigente_hasta: p.vigenteHasta,
        nueva,
      },
    });
  }
}

function validarDatos(datos: DatosSuscripcion, estadoActual: EstadoSuscripcion | null, uso: UsoActual): DatosSuscripcion {
  if (!PLANES.includes(datos.plan)) throw new ValidationError(`Plan desconocido: ${datos.plan}`);
  if (!ESTADOS_SUSCRIPCION.includes(datos.estado)) throw new ValidationError(`Estado de suscripción desconocido: ${datos.estado}`);
  // VENCIDA tiene un solo dueño: el control diario de vencimientos (spec 12).
  if (datos.estado === 'VENCIDA' && estadoActual !== 'VENCIDA') {
    throw new ValidationError('El estado VENCIDA lo asigna solo el control diario de vencimientos');
  }

  const edicion = textoOpcional(datos.edicion, 30, 'La edición');
  if (datos.vigenteHasta !== null && !esFecha(datos.vigenteHasta)) {
    throw new ValidationError('vigente_hasta debe ser una fecha YYYY-MM-DD');
  }

  validarLimite(datos.limiteSucursales, uso.sucursalesActivas, 'sucursales activas');
  validarLimite(datos.limiteUsuarios, uso.usuariosActivos, 'usuarios activos');
  return { ...datos, edicion };
}

function validarLimite(limite: number | null, enUso: number, que: string): void {
  if (limite === null) return;
  if (!Number.isInteger(limite) || limite < 1) throw new ValidationError('Los límites deben ser enteros mayores o iguales a 1');
  if (limite < enUso) throw new ValidationError(`Hay ${enUso} ${que}; el límite no puede ser menor`);
}

function esFecha(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(valor);
}
