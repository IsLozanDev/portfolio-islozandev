import type { ProductoCodigo } from '@vitrina/plataforma/org';
import { In, IsNull, type EntityManager } from 'typeorm';
import type { PersonaDelPar } from '../../application/ports/consulta-duplicados.js';
import type { TipoDocumentoPersona } from '../../domain/documento-identidad.js';
import type { TipoPersona } from '../../domain/persona.js';
import type { RolPersona } from '../../domain/rol-persona.js';
import { ContactoEntidad, PersonaEntidad, PersonaRolEntidad, type FilaContacto, type FilaPersona, type FilaPersonaRol } from './entidades.js';

const TIPOS_CONTACTO_LISTADO = ['CELULAR', 'CORREO'];

/** Contactos principales y roles vigentes de varias personas en dos lecturas (sin N+1). */
export interface DetallesDeLista {
  contactos: FilaContacto[];
  roles: FilaPersonaRol[];
}

export async function leerDetallesDeLista(manager: EntityManager, tenantId: string, ids: string[]): Promise<DetallesDeLista> {
  const [contactos, roles] = await Promise.all([
    manager.getRepository(ContactoEntidad).find({
      where: { personaId: In(ids), tenantId, principal: true, tipoContacto: In(TIPOS_CONTACTO_LISTADO) },
    }),
    manager.getRepository(PersonaRolEntidad).find({
      where: { personaId: In(ids), tenantId, hasta: IsNull() },
      order: { productoCodigo: 'ASC', rol: 'ASC' },
    }),
  ]);
  return { contactos, roles };
}

/** Las personas de la lista, por id: la fila y sus detalles. */
export async function leerPersonasDeLista(manager: EntityManager, tenantId: string, ids: string[]): Promise<Map<string, PersonaDelPar>> {
  const [filas, detalles] = await Promise.all([
    manager.getRepository(PersonaEntidad).find({ where: { id: In(ids), tenantId } }),
    leerDetallesDeLista(manager, tenantId, ids),
  ]);
  return new Map(filas.map((fila) => [fila.id, personaDeLista(fila, detalles)]));
}

export function personaDeLista(fila: FilaPersona, { contactos, roles }: DetallesDeLista): PersonaDelPar {
  const contactosDeLaPersona = contactos.filter((contacto) => contacto.personaId === fila.id);
  return {
    id: fila.id,
    tipoPersona: fila.tipoPersona as TipoPersona,
    tipoDocumento: fila.tipoDocumento as TipoDocumentoPersona,
    numeroDocumento: fila.numeroDocumento,
    nombres: fila.nombres,
    apellidoPaterno: fila.apellidoPaterno,
    apellidoMaterno: fila.apellidoMaterno,
    razonSocial: fila.razonSocial,
    celularPrincipal: valorPrincipal(contactosDeLaPersona, 'CELULAR'),
    correoPrincipal: valorPrincipal(contactosDeLaPersona, 'CORREO'),
    roles: roles
      .filter((rol) => rol.personaId === fila.id)
      .map((rol) => ({ productoCodigo: rol.productoCodigo as ProductoCodigo, rol: rol.rol as RolPersona })),
  };
}

function valorPrincipal(contactos: FilaContacto[], tipo: string): string | null {
  return contactos.find((contacto) => contacto.tipoContacto === tipo)?.valor ?? null;
}
