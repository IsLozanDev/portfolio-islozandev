import type { ProductoCodigo } from '@vitrina/plataforma/org';
import type { TipoContacto } from '../../domain/contacto.js';
import type { DenominacionPersona } from '../../domain/denominacion.js';
import type { TipoDocumentoPersona } from '../../domain/documento-identidad.js';
import type { TipoPersona } from '../../domain/persona.js';
import type { RolAsignado, RolPersona } from '../../domain/rol-persona.js';

export const PERSONA_PORT = Symbol('PersonaPort');

export interface PersonaResumen extends DenominacionPersona {
  id: string;
  tipoPersona: TipoPersona;
  tipoDocumento: TipoDocumentoPersona;
  numeroDocumento: string;
  activo: boolean;
}

export interface ContactoDetalle {
  id: string;
  tipo: TipoContacto;
  valor: string;
  principal: boolean;
}

/** Distrito, provincia y departamento como estaban en el catálogo `UBIGEO` al guardar la dirección. */
export interface DireccionDetalle {
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
  /** Versión del agregado: la piden las ediciones y los borrados. */
  version: number;
  /** Id de la absorbida que se pidió y resolvió a esta conservada; nulo si se pidió esta persona. */
  resueltaDesde: string | null;
  /** Ids de las personas absorbidas en esta (spec 39). */
  alias: string[];
  roles: RolAsignado[];
  contactos: ContactoDetalle[];
  direcciones: DireccionDetalle[];
}

export interface RegistrarPersonaComando {
  tipoPersona: TipoPersona;
  /** Texto libre: un tipo fuera de DNI, CE, RUC y PASAPORTE se rechaza con `TipoDocumentoNoAdmitidoError`. */
  tipoDocumento: string;
  numeroDocumento: string;
  nombres?: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  razonSocial?: string | null;
  celular: string;
  correo?: string | null;
}

export interface AsignarRolComando {
  personaId: string;
  productoCodigo: ProductoCodigo;
  rol: RolPersona;
}

export interface AgregarContactoComando {
  personaId: string;
  tipo: TipoContacto;
  valor: string;
  /** Falso si no llega: el primer contacto de un tipo no se marca principal solo. */
  principal?: boolean;
}

export interface AgregarDireccionComando {
  personaId: string;
  direccion: string;
  referencia?: string | null;
  ubigeo: string;
  /** Falso si no llega. */
  principal?: boolean;
}

/**
 * TR-RF-039, 040 y 041. Para consumidores en proceso. El tenant sale del TenantContext y no se evalúa permiso.
 * `buscarPorDocumento` solo mira el tenant: no consulta TR-IDN. Editar y borrar contactos o direcciones
 * va solo por HTTP.
 */
export interface PersonaPort {
  buscarPorDocumento(tipo: string, numero: string): Promise<PersonaResumen | null>;
  /** `PersonaNoEncontradaError` si no existe en el tenant. */
  obtener(personaId: string): Promise<PersonaDetalle>;
  registrar(comando: RegistrarPersonaComando): Promise<PersonaDetalle>;
  /** `asignado: false` si la persona ya tenía vigente ese rol en el producto. */
  asignarRol(comando: AsignarRolComando): Promise<{ asignado: boolean }>;
  /** `ContactoInvalidoError` por formato y `ContactoDuplicadoError` si la persona ya tiene ese tipo y valor. */
  agregarContacto(comando: AgregarContactoComando): Promise<PersonaDetalle>;
  /** `DireccionInvalidaError` por formato y `UbigeoNoVigenteError` si el ubigeo no está vigente en el catálogo. */
  agregarDireccion(comando: AgregarDireccionComando): Promise<PersonaDetalle>;
}
