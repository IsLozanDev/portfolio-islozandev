/** Respuesta tal cual de `GET /v1/seg/asignables` (spec 16a). */
export interface AsignablesRespuesta {
  roles: { id: string; codigo: string; nombre: string; producto_codigo: string; sensible: boolean }[];
  perfiles: { id: string; codigo: string; nombre: string; sensible: boolean }[];
}

export interface PerfilAsignable {
  id: string;
  codigo: string;
  nombre: string;
  /** Asignarlo exige MFA reciente al otorgante (TR-RN-009). */
  sensible: boolean;
}

export interface RolAsignable extends PerfilAsignable {
  productoCodigo: string;
}

export interface Asignables {
  roles: RolAsignable[];
  perfiles: PerfilAsignable[];
}

export function aAsignables(respuesta: AsignablesRespuesta): Asignables {
  return {
    roles: respuesta.roles.map((rol) => ({ id: rol.id, codigo: rol.codigo, nombre: rol.nombre, productoCodigo: rol.producto_codigo, sensible: rol.sensible })),
    perfiles: respuesta.perfiles.map((perfil) => ({ id: perfil.id, codigo: perfil.codigo, nombre: perfil.nombre, sensible: perfil.sensible })),
  };
}
