import type { ProductoCodigo, RolPersona, TipoContacto, TipoDocumento, TipoPersona } from './persona';

export interface RegistroPersona {
  tipoPersona: TipoPersona;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombres?: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  razonSocial?: string | null;
  /** Queda como celular principal. */
  celular: string;
  /** Opcional; queda como correo principal. */
  correo?: string | null;
}

/** Un campo ausente no cambia; `apellidoMaterno: null` lo borra. */
export interface CambiosDatosBasicos {
  version: number;
  nombres?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string | null;
  razonSocial?: string;
}

export interface NuevoContacto {
  tipo: TipoContacto;
  valor: string;
  principal: boolean;
}

export interface EdicionContacto {
  version: number;
  valor?: string;
  principal?: boolean;
}

export interface NuevaDireccion {
  direccion: string;
  referencia: string | null;
  ubigeo: string;
  principal: boolean;
}

export interface EdicionDireccion {
  version: number;
  direccion?: string;
  referencia?: string | null;
  ubigeo?: string;
  principal?: boolean;
}

export interface AsignacionRol {
  productoCodigo: ProductoCodigo;
  rol: RolPersona;
}

/** Quita las claves sin valor: la API distingue «no enviado» de `null`. */
function sinIndefinidos<Cuerpo extends Record<string, unknown>>(cuerpo: Cuerpo): Partial<Cuerpo> {
  return Object.fromEntries(Object.entries(cuerpo).filter(([, valor]) => valor !== undefined)) as Partial<Cuerpo>;
}

export function aCuerpoRegistro(registro: RegistroPersona): Record<string, unknown> {
  return sinIndefinidos({
    tipo_persona: registro.tipoPersona,
    tipo_documento: registro.tipoDocumento,
    numero_documento: registro.numeroDocumento,
    nombres: registro.nombres,
    apellido_paterno: registro.apellidoPaterno,
    apellido_materno: registro.apellidoMaterno,
    razon_social: registro.razonSocial,
    celular: registro.celular,
    correo: registro.correo,
  });
}

export function aCuerpoDatosBasicos(cambios: CambiosDatosBasicos): Record<string, unknown> {
  return sinIndefinidos({
    version: cambios.version,
    nombres: cambios.nombres,
    apellido_paterno: cambios.apellidoPaterno,
    apellido_materno: cambios.apellidoMaterno,
    razon_social: cambios.razonSocial,
  });
}

export function aCuerpoEdicion<Edicion extends object>(edicion: Edicion): Record<string, unknown> {
  return sinIndefinidos({ ...edicion } as Record<string, unknown>);
}

export function aCuerpoRol(asignacion: AsignacionRol): Record<string, unknown> {
  return { producto_codigo: asignacion.productoCodigo, rol: asignacion.rol };
}
