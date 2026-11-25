import {
  denominacionDe,
  formatoDocumento,
  opcionesDatosBasicos,
  opcionesPrincipales,
  type CampoDatoBasico,
  type ClavePrincipal,
  type ComparacionPar,
  type EleccionFusion,
  type Origen,
  type PersonaDetalle,
} from '@vitrina/plataforma/personas-ui';
import { MENSAJES_COMPARACION } from '../models/mensajes-comparacion';

const MENSAJES = MENSAJES_COMPARACION;

/** Una de las dos opciones de una fila de datos básicos, en el orden de las columnas (Ficha A, Ficha B). */
export interface OpcionFusion {
  ficha: string;
  personaId: string;
  valor: string | null;
  marcada: boolean;
}

export interface FilaDatoBasico {
  campo: CampoDatoBasico;
  etiqueta: string;
  iguales: boolean;
  opciones: OpcionFusion[];
}

export interface CandidatoVista {
  id: string;
  texto: string;
  origen: string;
  enLasDos: boolean;
  marcada: boolean;
}

export interface GrupoVista {
  clave: ClavePrincipal;
  titulo: string;
  candidatos: CandidatoVista[];
}

export interface FichaVista {
  id: string;
  etiqueta: string;
  denominacion: string;
  documento: string;
  roles: string[];
  queda: boolean;
}

export function fichaDe(comparacion: ComparacionPar, personaId: string): PersonaDetalle {
  return comparacion.personaA.id === personaId ? comparacion.personaA : comparacion.personaB;
}

export function otraFicha(comparacion: ComparacionPar, personaId: string): PersonaDetalle {
  return comparacion.personaA.id === personaId ? comparacion.personaB : comparacion.personaA;
}

/** La ficha que queda y la que pasa a ser alias según la elección. */
export function conservadaYAbsorbida(comparacion: ComparacionPar, eleccion: EleccionFusion): [PersonaDetalle, PersonaDetalle] {
  return [fichaDe(comparacion, eleccion.conservadaId), otraFicha(comparacion, eleccion.conservadaId)];
}

export function etiquetaFicha(comparacion: ComparacionPar, personaId: string): string {
  return comparacion.personaA.id === personaId ? MENSAJES.fichaA : MENSAJES.fichaB;
}

export function documentoDe(persona: PersonaDetalle): string {
  return formatoDocumento(persona.tipoDocumento, persona.numeroDocumento);
}

/** El origen que corresponde a elegir el dato de `personaId`. */
export function origenDe(eleccion: EleccionFusion, personaId: string): Origen {
  return personaId === eleccion.conservadaId ? 'CONSERVADA' : 'ABSORBIDA';
}

export function filasDatosBasicos(comparacion: ComparacionPar, eleccion: EleccionFusion): FilaDatoBasico[] {
  const [conservada, absorbida] = conservadaYAbsorbida(comparacion, eleccion);
  return opcionesDatosBasicos(conservada, absorbida).map(({ campo, iguales }) => ({
    campo,
    etiqueta: MENSAJES.campos[campo],
    iguales,
    opciones: [comparacion.personaA, comparacion.personaB].map((persona) => ({
      ficha: etiquetaFicha(comparacion, persona.id),
      personaId: persona.id,
      valor: persona[campo],
      marcada: eleccion.datosBasicos[campo] === origenDe(eleccion, persona.id),
    })),
  }));
}

export function gruposPrincipales(comparacion: ComparacionPar, eleccion: EleccionFusion): GrupoVista[] {
  const [conservada, absorbida] = conservadaYAbsorbida(comparacion, eleccion);
  return opcionesPrincipales(conservada, absorbida).map(({ clave, candidatos }) => ({
    clave,
    titulo: MENSAJES.principales[clave],
    candidatos: candidatos.map((candidato) => ({
      id: candidato.id,
      texto: candidato.texto,
      origen: candidato.enLasDos ? MENSAJES.enLasDos : etiquetaFicha(comparacion, candidato.personaId),
      enLasDos: candidato.enLasDos,
      marcada: eleccion.principales[clave] === candidato.id,
    })),
  }));
}

export function fichasVista(comparacion: ComparacionPar, eleccion: EleccionFusion, rolesDe: (persona: PersonaDetalle) => string[]): FichaVista[] {
  return [comparacion.personaA, comparacion.personaB].map((persona) => ({
    id: persona.id,
    etiqueta: etiquetaFicha(comparacion, persona.id),
    denominacion: denominacionDe(persona),
    documento: documentoDe(persona),
    roles: rolesDe(persona),
    queda: persona.id === eleccion.conservadaId,
  }));
}

/** Cómo quedará la denominación con los datos elegidos. */
export function denominacionResultante(comparacion: ComparacionPar, eleccion: EleccionFusion): string {
  const [conservada, absorbida] = conservadaYAbsorbida(comparacion, eleccion);
  const valor = (campo: CampoDatoBasico) => (eleccion.datosBasicos[campo] === 'ABSORBIDA' ? absorbida[campo] : conservada[campo]);
  return denominacionDe({
    nombres: valor('nombres'),
    apellidoPaterno: valor('apellidoPaterno'),
    apellidoMaterno: valor('apellidoMaterno'),
    razonSocial: valor('razonSocial'),
  });
}
