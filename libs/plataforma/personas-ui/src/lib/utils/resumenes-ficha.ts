import { ETIQUETAS_TIPO_CONTACTO, ETIQUETAS_TIPO_PERSONA } from '../models/etiquetas-personas';
import { MENSAJES_FICHA } from '../models/mensajes-ficha';
import type { PersonaDetalle } from '../models/persona';
import { formatoDocumento, formatoRol } from './formato-persona';

/* Lo que se ve con las secciones de la ficha contraídas (spec 15e). */

const SEPARADOR_ROLES = ', ';

/** «DNI 45781236 · Persona natural». */
export function resumenDatosBasicos(persona: PersonaDetalle): string {
  return MENSAJES_FICHA.datos.resumen(
    formatoDocumento(persona.tipoDocumento, persona.numeroDocumento),
    ETIQUETAS_TIPO_PERSONA[persona.tipoPersona],
  );
}

/** «3 contactos · principal: celular». */
export function resumenContactos(persona: PersonaDetalle): string {
  const { contactos } = persona;
  if (contactos.length === 0) return MENSAJES_FICHA.contactos.sinContactos;
  const principal = contactos.find((contacto) => contacto.principal);
  return MENSAJES_FICHA.contactos.resumen(contactos.length, principal ? ETIQUETAS_TIPO_CONTACTO[principal.tipo] : null);
}

/** «2 direcciones · principal: CAYMA». */
export function resumenDirecciones(persona: PersonaDetalle): string {
  const { direcciones } = persona;
  if (direcciones.length === 0) return MENSAJES_FICHA.direcciones.sinDirecciones;
  const principal = direcciones.find((direccion) => direccion.principal);
  return MENSAJES_FICHA.direcciones.resumen(direcciones.length, principal?.distrito ?? null);
}

/** «CLI · Paciente, REST · Cliente»: solo los vigentes. */
export function resumenRoles(persona: PersonaDetalle): string {
  const vigentes = persona.roles.filter((rol) => rol.hasta === null);
  if (vigentes.length === 0) return MENSAJES_FICHA.roles.sinRoles;
  return vigentes.map((rol) => formatoRol(rol.productoCodigo, rol.rol)).join(SEPARADOR_ROLES);
}
