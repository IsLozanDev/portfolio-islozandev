export interface ConsultaPermisos {
  usuarioId: string;
  tenantId: string;
  sucursalId: string;
  /** Solo cuentan las asignaciones de alcance UNIDAD si viene la unidad (TR-RN-007). */
  unidadId?: string | null;
}

export interface OpcionMenu {
  codigo: string;
  /** Código de la opción padre. */
  padre: string | null;
  nombre: string;
  ruta: string | null;
  icono: string | null;
  orden: number;
}

export interface SucursalAccesible {
  id: string;
  empresaId: string;
  codigo: string;
  nombre: string;
}

export interface PermisosResueltos {
  permisos: string[];
  menu: OpcionMenu[];
}

/** vt: versión de seguridad del tenant; vc: versión de catálogo (TR-RNF-101). */
export interface VersionesSeguridad {
  vt: number;
  vc: number;
}

/** Funciones SQL de seg; dentro de UnitOfWork, con app.tenant_id fijado. */
export interface PermisosRepositorio {
  versiones(tenantId: string): Promise<VersionesSeguridad>;
  efectivos(consulta: ConsultaPermisos): Promise<string[]>;
  menu(consulta: ConsultaPermisos): Promise<OpcionMenu[]>;
  sucursalesAccesibles(usuarioId: string, tenantId: string): Promise<SucursalAccesible[]>;
}

export interface CachePermisos {
  leer(clave: string): Promise<PermisosResueltos | null>;
  /** `tenantId` mantiene el índice del tenant para invalidarTenant. */
  guardar(clave: string, tenantId: string, valor: PermisosResueltos, ttlSeg: number): Promise<void>;
  invalidarTenant(tenantId: string): Promise<void>;
}

export const PERMISOS_REPOSITORIO = Symbol('PERMISOS_REPOSITORIO');
export const CACHE_PERMISOS = Symbol('CACHE_PERMISOS');
