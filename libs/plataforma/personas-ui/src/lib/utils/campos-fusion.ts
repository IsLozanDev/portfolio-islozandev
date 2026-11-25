import {
  PRINCIPAL_DIRECCION,
  type CampoDatoBasico,
  type ClavePrincipal,
  type ComparacionPar,
  type EleccionFusion,
  type SolicitudFusion,
} from '../models/duplicados';
import {
  TIPOS_CONTACTO,
  type ContactoPersona,
  type DireccionPersona,
  type PersonaDetalle,
  type TipoDocumento,
  type TipoPersona,
} from '../models/persona';
import { formatoContacto } from './formato-contacto';
import { formatoUbigeo } from './formato-ubigeo';
import { normalizarTexto } from './normalizar-texto';

/** DNI y RUC se prefieren sobre CE y pasaporte como ficha que queda. */
const PRIORIDAD_DOCUMENTO: Record<TipoDocumento, number> = { DNI: 0, RUC: 0, CE: 1, PASAPORTE: 1 };

export const CAMPOS_POR_TIPO_PERSONA: Record<TipoPersona, readonly CampoDatoBasico[]> = {
  NATURAL: ['nombres', 'apellidoPaterno', 'apellidoMaterno'],
  JURIDICA: ['razonSocial'],
};

export const CLAVES_PRINCIPAL: readonly ClavePrincipal[] = [...TIPOS_CONTACTO, PRINCIPAL_DIRECCION];

export interface OpcionDatoBasico {
  campo: CampoDatoBasico;
  valorConservada: string | null;
  valorAbsorbida: string | null;
  /** Iguales sin tildes ni mayúsculas: no se ofrece elegir. */
  iguales: boolean;
}

export interface CandidatoPrincipal {
  id: string;
  texto: string;
  /** Ficha de donde sale; si está en las dos, la conservada. */
  personaId: string;
  enLasDos: boolean;
}

export interface GrupoPrincipal {
  clave: ClavePrincipal;
  candidatos: CandidatoPrincipal[];
}

interface Candidato {
  id: string;
  texto: string;
  principal: boolean;
  /** Mismo criterio que el back (`esMismoContacto`, `esMismoLugar`); solo cambia la presentación. */
  igualdad: string;
}

/** La de DNI o RUC sobre CE o pasaporte; si empatan, `a` (id menor). */
export function conservadaSugerida(personaA: PersonaDetalle, personaB: PersonaDetalle): PersonaDetalle {
  return PRIORIDAD_DOCUMENTO[personaB.tipoDocumento] < PRIORIDAD_DOCUMENTO[personaA.tipoDocumento] ? personaB : personaA;
}

/** Datos básicos de la conservada y, por clave, el principal de la conservada o, si no tiene, el de la absorbida. */
export function eleccionInicial(conservada: PersonaDetalle, absorbida: PersonaDetalle): EleccionFusion {
  const datosBasicos = Object.fromEntries(CAMPOS_POR_TIPO_PERSONA[conservada.tipoPersona].map((campo) => [campo, 'CONSERVADA']));
  const principales: EleccionFusion['principales'] = {};
  for (const clave of CLAVES_PRINCIPAL) {
    const principal = principalDe(conservada, clave) ?? principalDe(absorbida, clave);
    if (principal !== null) principales[clave] = principal;
  }
  return { conservadaId: conservada.id, datosBasicos, principales };
}

export function opcionesDatosBasicos(conservada: PersonaDetalle, absorbida: PersonaDetalle): OpcionDatoBasico[] {
  return CAMPOS_POR_TIPO_PERSONA[conservada.tipoPersona].map((campo) => ({
    campo,
    valorConservada: conservada[campo],
    valorAbsorbida: absorbida[campo],
    iguales: normalizarTexto(conservada[campo] ?? '') === normalizarTexto(absorbida[campo] ?? ''),
  }));
}

/** Por clave, los candidatos de las dos fichas; un repetido se muestra una vez, con el id de la conservada. */
export function opcionesPrincipales(conservada: PersonaDetalle, absorbida: PersonaDetalle): GrupoPrincipal[] {
  return CLAVES_PRINCIPAL.map((clave) => {
    const propios = candidatosDe(conservada, clave);
    const ajenos = candidatosDe(absorbida, clave);
    const igualdadesAjenas = new Set(ajenos.map((ajeno) => ajeno.igualdad));
    const igualdadesPropias = new Set(propios.map((propio) => propio.igualdad));
    const candidatos = [
      ...propios.map((propio) => aCandidatoPrincipal(propio, conservada.id, igualdadesAjenas.has(propio.igualdad))),
      ...ajenos.filter((ajeno) => !igualdadesPropias.has(ajeno.igualdad)).map((ajeno) => aCandidatoPrincipal(ajeno, absorbida.id, false)),
    ];
    return { clave, candidatos };
  }).filter((grupo) => grupo.candidatos.length > 0);
}

export function solicitudDe(eleccion: EleccionFusion, comparacion: ComparacionPar, motivo: string): SolicitudFusion {
  const [conservada, absorbida] =
    eleccion.conservadaId === comparacion.personaA.id
      ? [comparacion.personaA, comparacion.personaB]
      : [comparacion.personaB, comparacion.personaA];
  return {
    ...eleccion,
    absorbidaId: absorbida.id,
    versionConservada: conservada.version,
    versionAbsorbida: absorbida.version,
    motivo: motivo.trim(),
  };
}

function principalDe(persona: PersonaDetalle, clave: ClavePrincipal): string | null {
  return candidatosDe(persona, clave).find((candidato) => candidato.principal)?.id ?? null;
}

function candidatosDe(persona: PersonaDetalle, clave: ClavePrincipal): Candidato[] {
  if (clave === PRINCIPAL_DIRECCION) return persona.direcciones.map(candidatoDeDireccion);
  return persona.contactos.filter((contacto) => contacto.tipo === clave).map(candidatoDeContacto);
}

function candidatoDeContacto(contacto: ContactoPersona): Candidato {
  return { id: contacto.id, texto: formatoContacto(contacto.tipo, contacto.valor), principal: contacto.principal, igualdad: contacto.valor };
}

function candidatoDeDireccion(direccion: DireccionPersona): Candidato {
  return {
    id: direccion.id,
    texto: `${direccion.direccion} · ${formatoUbigeo(direccion)}`,
    principal: direccion.principal,
    igualdad: `${direccion.ubigeo}|${normalizarTexto(direccion.direccion)}`,
  };
}

function aCandidatoPrincipal(candidato: Candidato, personaId: string, enLasDos: boolean): CandidatoPrincipal {
  return { id: candidato.id, texto: candidato.texto, personaId, enLasDos };
}
