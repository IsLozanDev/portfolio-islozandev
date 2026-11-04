export type TipoUsuario = 'INTERNO' | 'EXTERNO' | 'SOPORTE';
export type NivelAutenticacion = 'aal1' | 'aal2';
export type ModoSoporte = 'LECTURA' | 'ESCRITURA';

/** Acceso de soporte vigente del usuario en este tenant (spec 18): el shell muestra el banner. */
export interface SesionSoporte {
  accesoId: string;
  ticket: string;
  modo: ModoSoporte;
  hasta: Date;
}

export interface OpcionMenu {
  codigo: string;
  padre: string | null;
  nombre: string;
  ruta: string | null;
  icono: string | null;
  orden: number;
}

/** Respuesta tal cual de `GET /v1/seg/mi-contexto` (`MiContextoDto`, spec 06). */
export interface MiContextoRespuesta {
  usuario_id: string;
  tenant_id: string;
  tipo_usuario: TipoUsuario;
  aal: NivelAutenticacion;
  mfa_vigente: boolean;
  mfa_en: string | null;
  sucursales: { id: string; empresa_id: string; codigo: string; nombre: string }[];
  sucursal_actual: string | null;
  requiere_seleccion: boolean;
  sin_accesos: boolean;
  permisos: string[];
  menu: OpcionMenu[];
  soporte: { acceso_id: string; ticket: string; modo: ModoSoporte; hasta: string } | null;
}

export interface SucursalAccesible {
  id: string;
  empresaId: string;
  codigo: string;
  nombre: string;
}

export interface ContextoUsuario {
  usuarioId: string;
  tenantId: string;
  tipoUsuario: TipoUsuario;
  aal: NivelAutenticacion;
  mfaVigente: boolean;
  mfaEn: Date | null;
  sucursales: SucursalAccesible[];
  sucursalActual: string | null;
  requiereSeleccion: boolean;
  sinAccesos: boolean;
  permisos: readonly string[];
  menu: OpcionMenu[];
  soporte: SesionSoporte | null;
}

export function aContextoUsuario(respuesta: MiContextoRespuesta): ContextoUsuario {
  return {
    usuarioId: respuesta.usuario_id,
    tenantId: respuesta.tenant_id,
    tipoUsuario: respuesta.tipo_usuario,
    aal: respuesta.aal,
    mfaVigente: respuesta.mfa_vigente,
    mfaEn: respuesta.mfa_en ? new Date(respuesta.mfa_en) : null,
    sucursales: respuesta.sucursales.map((sucursal) => ({
      id: sucursal.id,
      empresaId: sucursal.empresa_id,
      codigo: sucursal.codigo,
      nombre: sucursal.nombre,
    })),
    sucursalActual: respuesta.sucursal_actual,
    requiereSeleccion: respuesta.requiere_seleccion,
    sinAccesos: respuesta.sin_accesos,
    permisos: respuesta.permisos,
    menu: respuesta.menu,
    // `?? null`: una API anterior al spec 18 no manda el campo.
    soporte: respuesta.soporte
      ? { accesoId: respuesta.soporte.acceso_id, ticket: respuesta.soporte.ticket, modo: respuesta.soporte.modo, hasta: new Date(respuesta.soporte.hasta) }
      : null,
  };
}
