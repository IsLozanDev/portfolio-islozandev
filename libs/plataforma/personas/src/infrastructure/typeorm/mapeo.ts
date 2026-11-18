import type { ProductoCodigo } from '@vitrina/plataforma/org';
import { Contacto, type TipoContacto } from '../../domain/contacto.js';
import { DocumentoIdentidad, type TipoDocumentoPersona } from '../../domain/documento-identidad.js';
import { Persona, type TipoPersona } from '../../domain/persona.js';
import type { RolAsignado, RolPersona } from '../../domain/rol-persona.js';
import type { FilaContacto, FilaPersona, FilaPersonaRol } from './entidades.js';

type FilaPersonaNueva = Omit<FilaPersona, 'creadoEn' | 'actualizadoEn'>;
type FilaContactoNuevo = Omit<FilaContacto, 'creadoEn'>;

export function filaDesdePersona(persona: Persona): FilaPersonaNueva {
  return {
    id: persona.id,
    tenantId: persona.tenantId,
    tipoPersona: persona.tipoPersona,
    tipoDocumento: persona.documento.tipo,
    numeroDocumento: persona.documento.numero,
    nombres: persona.nombres,
    apellidoPaterno: persona.apellidoPaterno,
    apellidoMaterno: persona.apellidoMaterno,
    razonSocial: persona.razonSocial,
    activo: persona.activo,
    version: persona.version,
  };
}

export function filaDesdeRol(persona: Persona, rolAsignado: RolAsignado): FilaPersonaRol {
  return { personaId: persona.id, tenantId: persona.tenantId, ...rolAsignado };
}

export function filaDesdeContacto(persona: Persona, contacto: Contacto): FilaContactoNuevo {
  return {
    id: contacto.id,
    personaId: persona.id,
    tenantId: persona.tenantId,
    tipoContacto: contacto.tipo,
    valor: contacto.valor,
    principal: contacto.principal,
  };
}

// Los CHECK de per garantizan que cada texto pertenece a su lista del dominio.
export function personaDesdeFilas(fila: FilaPersona, roles: FilaPersonaRol[], contactos: FilaContacto[]): Persona {
  return Persona.reconstituir(fila.id, fila.version, {
    tenantId: fila.tenantId,
    tipoPersona: fila.tipoPersona as TipoPersona,
    documento: DocumentoIdentidad.reconstituir(fila.tipoDocumento as TipoDocumentoPersona, fila.numeroDocumento),
    nombres: fila.nombres,
    apellidoPaterno: fila.apellidoPaterno,
    apellidoMaterno: fila.apellidoMaterno,
    razonSocial: fila.razonSocial,
    activo: fila.activo,
    roles: roles.map(rolDesdeFila),
    contactos: contactos.map(contactoDesdeFila),
  });
}

function rolDesdeFila(fila: FilaPersonaRol): RolAsignado {
  return {
    productoCodigo: fila.productoCodigo as ProductoCodigo,
    rol: fila.rol as RolPersona,
    desde: fila.desde,
    hasta: fila.hasta,
  };
}

function contactoDesdeFila(fila: FilaContacto): Contacto {
  return Contacto.reconstituir({
    id: fila.id,
    tipo: fila.tipoContacto as TipoContacto,
    valor: fila.valor,
    principal: fila.principal,
  });
}
