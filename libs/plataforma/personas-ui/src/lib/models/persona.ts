/** Valores que fija la API de personas (specs 31 y 32). */
export const TIPOS_PERSONA = ['NATURAL', 'JURIDICA'] as const;
export type TipoPersona = (typeof TIPOS_PERSONA)[number];

export const TIPOS_DOCUMENTO = ['DNI', 'CE', 'RUC', 'PASAPORTE'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const ROLES_PERSONA = ['CLIENTE', 'PACIENTE', 'SOCIO', 'ADMINISTRADO', 'CONTRAPARTE', 'PROVEEDOR'] as const;
export type RolPersona = (typeof ROLES_PERSONA)[number];

/** Los de `PRODUCTOS` de ORG: el filtro de la lista los ofrece todos (un rol puede ser de una suscripción vencida). */
export const PRODUCTOS = ['REST', 'PSI', 'COL', 'LIB', 'GYM', 'CLI', 'DOC', 'ECO', 'LEX'] as const;
export type ProductoCodigo = (typeof PRODUCTOS)[number];

export const TIPOS_CONTACTO = ['CELULAR', 'FIJO', 'CORREO', 'WHATSAPP'] as const;
export type TipoContacto = (typeof TIPOS_CONTACTO)[number];

export interface Denominacion {
  nombres: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  razonSocial: string | null;
}

export interface PersonaResumen extends Denominacion {
  id: string;
  tipoPersona: TipoPersona;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  activo: boolean;
}

export interface RolAsignado {
  productoCodigo: ProductoCodigo;
  rol: RolPersona;
  /** `AAAA-MM-DD`, fecha de Lima. */
  desde: string;
  hasta: string | null;
}

export interface ContactoPersona {
  id: string;
  tipo: TipoContacto;
  valor: string;
  principal: boolean;
}

/** Distrito, provincia y departamento como estaban en el catálogo `UBIGEO` al guardar. */
export interface DireccionPersona {
  id: string;
  direccion: string;
  referencia: string | null;
  ubigeo: string;
  distrito: string;
  provincia: string;
  departamento: string;
  principal: boolean;
}

export interface PersonaDetalle extends PersonaResumen {
  /** Se envía al editar o borrar; cada respuesta trae la nueva. */
  version: number;
  roles: RolAsignado[];
  contactos: ContactoPersona[];
  direcciones: DireccionPersona[];
}

export interface DenominacionRespuesta {
  nombres: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  razon_social: string | null;
}

export interface PersonaRespuesta extends DenominacionRespuesta {
  id: string;
  tipo_persona: TipoPersona;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  activo: boolean;
}

export interface PersonaDetalleRespuesta extends PersonaRespuesta {
  version: number;
  roles: { producto_codigo: ProductoCodigo; rol: RolPersona; desde: string; hasta: string | null }[];
  contactos: ContactoPersona[];
  direcciones: DireccionPersona[];
}

export function aDenominacion(respuesta: DenominacionRespuesta): Denominacion {
  return {
    nombres: respuesta.nombres,
    apellidoPaterno: respuesta.apellido_paterno,
    apellidoMaterno: respuesta.apellido_materno,
    razonSocial: respuesta.razon_social,
  };
}

export function aPersonaResumen(respuesta: PersonaRespuesta): PersonaResumen {
  return {
    id: respuesta.id,
    tipoPersona: respuesta.tipo_persona,
    tipoDocumento: respuesta.tipo_documento,
    numeroDocumento: respuesta.numero_documento,
    ...aDenominacion(respuesta),
    activo: respuesta.activo,
  };
}

export function aPersonaDetalle(respuesta: PersonaDetalleRespuesta): PersonaDetalle {
  return {
    ...aPersonaResumen(respuesta),
    version: respuesta.version,
    roles: respuesta.roles.map(({ producto_codigo, rol, desde, hasta }) => ({ productoCodigo: producto_codigo, rol, desde, hasta })),
    contactos: respuesta.contactos.map((contacto) => ({ ...contacto })),
    direcciones: respuesta.direcciones.map((direccion) => ({ ...direccion })),
  };
}
