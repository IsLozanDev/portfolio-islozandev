import type { ProductoCodigo } from '@vitrina/plataforma/org';
import { Contacto, type TipoContacto } from '../../domain/contacto.js';
import { Direccion } from '../../domain/direccion.js';
import { DocumentoIdentidad, type TipoDocumentoPersona } from '../../domain/documento-identidad.js';
import { Persona, type TipoPersona } from '../../domain/persona.js';
import type { RolAsignado, RolPersona } from '../../domain/rol-persona.js';
import type { FilaContacto, FilaDireccion, FilaPersona, FilaPersonaRol } from './entidades.js';

type FilaPersonaNueva = Omit<FilaPersona, 'creadoEn' | 'actualizadoEn'>;
type FilaContactoNuevo = Omit<FilaContacto, 'creadoEn'>;
type FilaDireccionNueva = Omit<FilaDireccion, 'creadoEn'>;
/** Lo que una edición puede cambiar en la fila: el resto no cambia nunca. */
type ColumnasEditablesPersona = Pick<FilaPersona, 'nombres' | 'apellidoPaterno' | 'apellidoMaterno' | 'razonSocial' | 'version'>;
type ColumnasEditablesContacto = Pick<FilaContacto, 'valor' | 'principal'>;
type ColumnasEditablesDireccion = Omit<FilaDireccionNueva, 'id' | 'personaId' | 'tenantId'>;

export function filaDesdePersona(persona: Persona): FilaPersonaNueva {
  return {
    id: persona.id,
    tenantId: persona.tenantId,
    tipoPersona: persona.tipoPersona,
    tipoDocumento: persona.documento.tipo,
    numeroDocumento: persona.documento.numero,
    activo: persona.activo,
    ...columnasEditablesDePersona(persona),
  };
}

export function columnasEditablesDePersona(persona: Persona): ColumnasEditablesPersona {
  return {
    nombres: persona.nombres,
    apellidoPaterno: persona.apellidoPaterno,
    apellidoMaterno: persona.apellidoMaterno,
    razonSocial: persona.razonSocial,
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
    ...columnasEditablesDeContacto(contacto),
  };
}

export function columnasEditablesDeContacto(contacto: Contacto): ColumnasEditablesContacto {
  return { valor: contacto.valor, principal: contacto.principal };
}

export function filaDesdeDireccion(persona: Persona, direccion: Direccion): FilaDireccionNueva {
  return { id: direccion.id, personaId: persona.id, tenantId: persona.tenantId, ...columnasEditablesDeDireccion(direccion) };
}

export function columnasEditablesDeDireccion(direccion: Direccion): ColumnasEditablesDireccion {
  return {
    direccion: direccion.direccion,
    referencia: direccion.referencia,
    ubigeo: direccion.ubigeo,
    distrito: direccion.ubicacion.distrito,
    provincia: direccion.ubicacion.provincia,
    departamento: direccion.ubicacion.departamento,
    principal: direccion.principal,
  };
}

export interface FilasDePersona {
  persona: FilaPersona;
  roles: FilaPersonaRol[];
  contactos: FilaContacto[];
  direcciones: FilaDireccion[];
}

// Los CHECK de per garantizan que cada texto pertenece a su lista del dominio.
export function personaDesdeFilas({ persona, roles, contactos, direcciones }: FilasDePersona): Persona {
  return Persona.reconstituir(persona.id, persona.version, {
    tenantId: persona.tenantId,
    tipoPersona: persona.tipoPersona as TipoPersona,
    documento: DocumentoIdentidad.reconstituir(persona.tipoDocumento as TipoDocumentoPersona, persona.numeroDocumento),
    nombres: persona.nombres,
    apellidoPaterno: persona.apellidoPaterno,
    apellidoMaterno: persona.apellidoMaterno,
    razonSocial: persona.razonSocial,
    activo: persona.activo,
    roles: roles.map(rolDesdeFila),
    contactos: contactos.map(contactoDesdeFila),
    direcciones: direcciones.map(direccionDesdeFila),
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

function direccionDesdeFila(fila: FilaDireccion): Direccion {
  return Direccion.reconstituir({
    id: fila.id,
    direccion: fila.direccion,
    referencia: fila.referencia,
    ubigeo: fila.ubigeo,
    ubicacion: { distrito: fila.distrito, provincia: fila.provincia, departamento: fila.departamento },
    principal: fila.principal,
  });
}
