import { AggregateRoot, ConflictError, ValidationError } from '@vitrina/plataforma/kernel';
import { PerfilPredefinidoNoEditableError, ProductoNoContratadoError } from './errores.js';
import { diferencia, EVENTOS_SEG, type PerfilCreado } from './eventos.js';
import type { Rol } from './rol.js';
import { textoRequerido } from './texto.js';

export interface DatosPerfil {
  codigo: string;
  nombre: string;
}

export interface PerfilProps extends DatosPerfil {
  /** null = predefinido. */
  tenantId: string | null;
  roles: string[];
}

/** Perfil de puesto: agrupa roles, posiblemente de varios productos (TR-RF-012). */
export class Perfil extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: PerfilProps,
  ) {
    super(id, version);
  }

  /** `contratados`: productos con suscripción vigente del tenant. PLAT no se contrata. */
  static crear(id: string, tenantId: string, datos: DatosPerfil, roles: readonly Rol[], contratados: readonly string[]): Perfil {
    const perfil = Perfil.nuevo(id, tenantId, datos, roles, contratados);
    perfil.publicarCreado(null);
    return perfil;
  }

  /** Origen predefinido o del propio tenant; valida el conjunto final de roles con las reglas de `crear` (spec 16c). */
  static copiarDe(id: string, tenantId: string, origen: Perfil, datos: DatosPerfil, roles: readonly Rol[], contratados: readonly string[]): Perfil {
    if (origen.props.tenantId !== null && origen.props.tenantId !== tenantId) {
      throw new ConflictError('Solo se copian perfiles predefinidos o del propio tenant');
    }
    const perfil = Perfil.nuevo(id, tenantId, datos, roles, contratados);
    perfil.publicarCreado(origen.id);
    return perfil;
  }

  private static nuevo(id: string, tenantId: string, datos: DatosPerfil, roles: readonly Rol[], contratados: readonly string[]): Perfil {
    return new Perfil(id, 0, {
      tenantId,
      codigo: textoRequerido(datos.codigo, 3, 50, 'El código del perfil'),
      nombre: textoRequerido(datos.nombre, 3, 100, 'El nombre del perfil'),
      roles: validarRoles(tenantId, roles, contratados),
    });
  }

  private publicarCreado(copiadoDe: string | null): void {
    const { codigo, nombre, roles } = this.props;
    const payload: PerfilCreado = { codigo, nombre, copiado_de: copiadoDe, roles: [...roles] };
    this.raise({ eventType: EVENTOS_SEG.perfilCreado, aggregateType: 'perfil', schemaVersion: 1, payload });
  }

  static reconstituir(id: string, version: number, props: PerfilProps): Perfil {
    return new Perfil(id, version, { ...props, roles: [...props.roles].sort() });
  }

  get tenantId(): string | null {
    return this.props.tenantId;
  }

  get datos(): DatosPerfil {
    return { codigo: this.props.codigo, nombre: this.props.nombre };
  }

  get roles(): readonly string[] {
    return this.props.roles;
  }

  cambiarRoles(roles: readonly Rol[], contratados: readonly string[]): void {
    if (this.props.tenantId === null) throw new PerfilPredefinidoNoEditableError();
    const nuevos = validarRoles(this.props.tenantId, roles, contratados);
    const cambios = diferencia(this.props.roles, nuevos);
    if (cambios.agregados.length === 0 && cambios.quitados.length === 0) return;
    this.props = { ...this.props, roles: nuevos };
    this.raise({ eventType: EVENTOS_SEG.perfilRolesCambiados, aggregateType: 'perfil', schemaVersion: 1, payload: cambios });
  }
}

function validarRoles(tenantId: string, roles: readonly Rol[], contratados: readonly string[]): string[] {
  if (roles.length === 0) throw new ValidationError('El perfil debe tener al menos un rol');
  for (const rol of roles) {
    if (rol.tenantId !== null && rol.tenantId !== tenantId) throw new ConflictError('El rol no pertenece al tenant');
    if (!rol.activo) throw new ConflictError(`El rol ${rol.datos.codigo} está inactivo u obsoleto`);
    // TR-CA-035: un rol de producto no contratado no se acepta.
    if (rol.productoCodigo !== 'PLAT' && !contratados.includes(rol.productoCodigo)) {
      throw new ProductoNoContratadoError(rol.productoCodigo);
    }
  }
  return [...new Set(roles.map((r) => r.id))].sort();
}
