import type { ProductoCodigo } from '@vitrina/plataforma/org';
import type { TipoContacto } from '../../domain/contacto.js';
import type { TipoDocumentoPersona } from '../../domain/documento-identidad.js';
import type { DenominacionPersona, TipoPersona } from '../../domain/persona.js';
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

export interface PersonaDetalle extends PersonaResumen {
  roles: RolAsignado[];
  contactos: ContactoDetalle[];
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

/**
 * TR-RF-039 y 040. Para consumidores en proceso. El tenant sale del TenantContext y no se evalúa permiso.
 * `buscarPorDocumento` solo mira el tenant: no consulta TR-IDN.
 */
export interface PersonaPort {
  buscarPorDocumento(tipo: string, numero: string): Promise<PersonaResumen | null>;
  /** `PersonaNoEncontradaError` si no existe en el tenant. */
  obtener(personaId: string): Promise<PersonaDetalle>;
  registrar(comando: RegistrarPersonaComando): Promise<PersonaDetalle>;
  /** `asignado: false` si la persona ya tenía vigente ese rol en el producto. */
  asignarRol(comando: AsignarRolComando): Promise<{ asignado: boolean }>;
}
