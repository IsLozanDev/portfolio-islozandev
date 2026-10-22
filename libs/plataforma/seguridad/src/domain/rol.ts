import { AggregateRoot, ConflictError } from '@vitrina/plataforma/kernel';
import type { Alcance } from './alcance.js';
import { PermisoAjenoAlProductoError, RolPredefinidoNoEditableError } from './errores.js';
import { diferencia, EVENTOS_SEG, type RolCreado } from './eventos.js';
import { textoRequerido } from './texto.js';

/** Fila de `seg.permiso` que el caso de uso trae del catálogo para validar. */
export interface PermisoCatalogo {
  codigo: string;
  productoCodigo: string;
  alcanceMinimo: Alcance;
  sensible: boolean;
  obsoleto: boolean;
}

export interface DatosRol {
  codigo: string;
  nombre: string;
}

export interface RolProps extends DatosRol {
  /** null = predefinido por el manifiesto: visible a todos, no editable por un tenant. */
  tenantId: string | null;
  productoCodigo: string;
  activo: boolean;
  obsoleto: boolean;
  permisos: string[];
}

export class Rol extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: RolProps,
  ) {
    super(id, version);
  }

  /** TR-RF-011. Que el producto esté contratado lo valida el caso de uso. */
  static crear(id: string, tenantId: string, productoCodigo: string, datos: DatosRol, permisos: readonly string[], catalogo: readonly PermisoCatalogo[]): Rol {
    const rol = new Rol(id, 0, {
      tenantId,
      productoCodigo,
      ...validarDatos(datos),
      activo: true,
      obsoleto: false,
      permisos: validarPermisos(productoCodigo, permisos, catalogo),
    });
    rol.publicarCreado(null);
    return rol;
  }

  /** TR-CA-031: copia los permisos del origen (predefinido o propio); la edición va después con cambiarPermisos. */
  static copiarDe(id: string, tenantId: string, origen: Rol, datos: DatosRol): Rol {
    if (origen.props.tenantId !== null && origen.props.tenantId !== tenantId) {
      throw new ConflictError('Solo se copian roles predefinidos o del propio tenant');
    }
    if (!origen.activo) throw new ConflictError('No se copia un rol inactivo u obsoleto');
    const rol = new Rol(id, 0, {
      tenantId,
      productoCodigo: origen.props.productoCodigo,
      ...validarDatos(datos),
      activo: true,
      obsoleto: false,
      permisos: [...origen.props.permisos],
    });
    rol.publicarCreado(origen.id);
    return rol;
  }

  static reconstituir(id: string, version: number, props: RolProps): Rol {
    return new Rol(id, version, { ...props, permisos: [...props.permisos].sort() });
  }

  get tenantId(): string | null {
    return this.props.tenantId;
  }

  get esPredefinido(): boolean {
    return this.props.tenantId === null;
  }

  get productoCodigo(): string {
    return this.props.productoCodigo;
  }

  get datos(): DatosRol {
    return { codigo: this.props.codigo, nombre: this.props.nombre };
  }

  /** Un rol obsoleto (retirado del manifiesto) tampoco da permisos. */
  get activo(): boolean {
    return this.props.activo && !this.props.obsoleto;
  }

  get permisos(): readonly string[] {
    return this.props.permisos;
  }

  /** Reemplaza el conjunto. Sin cambios no emite evento (TR-RNF-008). */
  cambiarPermisos(permisos: readonly string[], catalogo: readonly PermisoCatalogo[]): void {
    this.exigirEditable();
    const nuevos = validarPermisos(this.props.productoCodigo, permisos, catalogo);
    const cambios = diferencia(this.props.permisos, nuevos);
    if (cambios.agregados.length === 0 && cambios.quitados.length === 0) return;
    this.props = { ...this.props, permisos: nuevos };
    this.raise({ eventType: EVENTOS_SEG.rolPermisosCambiados, aggregateType: 'rol', schemaVersion: 1, payload: cambios });
  }

  /** TR-CA-033: `afectados` lo cuenta el caso de uso antes de pedir confirmación. */
  inactivar(afectados: number): void {
    this.exigirEditable();
    if (!this.props.activo) return;
    this.props = { ...this.props, activo: false };
    this.raise({ eventType: EVENTOS_SEG.rolInactivado, aggregateType: 'rol', schemaVersion: 1, payload: { afectados } });
  }

  private exigirEditable(): void {
    if (this.esPredefinido) throw new RolPredefinidoNoEditableError();
  }

  private publicarCreado(copiadoDe: string | null): void {
    const p = this.props;
    const payload: RolCreado = {
      producto_codigo: p.productoCodigo,
      codigo: p.codigo,
      nombre: p.nombre,
      copiado_de: copiadoDe,
      permisos: [...p.permisos],
    };
    this.raise({ eventType: EVENTOS_SEG.rolCreado, aggregateType: 'rol', schemaVersion: 1, payload });
  }
}

function validarDatos(datos: DatosRol): DatosRol {
  return {
    codigo: textoRequerido(datos.codigo, 3, 50, 'El código del rol'),
    nombre: textoRequerido(datos.nombre, 3, 100, 'El nombre del rol'),
  };
}

/** Cada permiso existe en el catálogo, es del producto del rol y no está obsoleto. Devuelve el conjunto ordenado. */
function validarPermisos(productoCodigo: string, permisos: readonly string[], catalogo: readonly PermisoCatalogo[]): string[] {
  const porCodigo = new Map(catalogo.map((p) => [p.codigo, p]));
  const unicos = [...new Set(permisos)].sort();
  const ajenos = unicos.filter((c) => {
    const p = porCodigo.get(c);
    return p === undefined || p.productoCodigo !== productoCodigo || p.obsoleto;
  });
  if (ajenos.length > 0) throw new PermisoAjenoAlProductoError(ajenos);
  return unicos;
}
