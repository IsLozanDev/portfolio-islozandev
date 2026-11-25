import type { Direccion } from '../domain/direccion.js';
import type { Persona } from '../domain/persona.js';
import type { DireccionDetalle, PersonaDetalle, PersonaResumen } from './ports/persona.port.js';

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

/** De dónde salió el detalle: la persona pedida o una absorbida que resolvió a ella, y sus alias. */
export interface AliasDelDetalle {
  resueltaDesde: string | null;
  alias: string[];
}

/** Una persona recién registrada no es alias ni tiene alias. */
export const SIN_ALIAS: AliasDelDetalle = { resueltaDesde: null, alias: [] };

export function detalleDe(persona: Persona, { resueltaDesde, alias }: AliasDelDetalle = SIN_ALIAS): PersonaDetalle {
  return {
    ...resumenDe(persona),
    version: persona.version,
    resueltaDesde,
    alias: [...alias],
    roles: persona.roles.map((rolAsignado) => ({ ...rolAsignado })),
    contactos: persona.contactos.map(({ id, tipo, valor, principal }) => ({ id, tipo, valor, principal })),
    direcciones: persona.direcciones.map(direccionDetalleDe),
  };
}

function direccionDetalleDe({ id, direccion, referencia, ubigeo, ubicacion, principal }: Direccion): DireccionDetalle {
  return { id, direccion, referencia, ubigeo, ...ubicacion, principal };
}
