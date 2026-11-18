import type { Persona } from '../domain/persona.js';
import type { PersonaDetalle, PersonaResumen } from './ports/persona.port.js';

export function resumenDe(persona: Persona): PersonaResumen {
  return {
    id: persona.id,
    tipoPersona: persona.tipoPersona,
    tipoDocumento: persona.documento.tipo,
    numeroDocumento: persona.documento.numero,
    nombres: persona.nombres,
    apellidoPaterno: persona.apellidoPaterno,
    apellidoMaterno: persona.apellidoMaterno,
    razonSocial: persona.razonSocial,
    activo: persona.activo,
  };
}

export function detalleDe(persona: Persona): PersonaDetalle {
  return {
    ...resumenDe(persona),
    roles: persona.roles.map((rolAsignado) => ({ ...rolAsignado })),
    contactos: persona.contactos.map(({ id, tipo, valor, principal }) => ({ id, tipo, valor, principal })),
  };
}
