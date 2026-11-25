import type { TipoContacto } from './contacto.js';
import type { DenominacionPersona } from './denominacion.js';
import {
  DocumentosDistintosError,
  MismaPersonaError,
  MotivoFusionInvalidoError,
  PersonaYaFusionadaError,
  TipoPersonaDistintoError,
} from './errores.js';
import type { Persona, TipoPersona } from './persona.js';
import type { RolAsignado } from './rol-persona.js';

export const ORIGENES_CAMPO = ['CONSERVADA', 'ABSORBIDA'] as const;
export type OrigenCampo = (typeof ORIGENES_CAMPO)[number];

export type CampoDatosBasicos = keyof DenominacionPersona;
export const CAMPOS_DATOS_BASICOS: readonly CampoDatosBasicos[] = ['nombres', 'apellidoPaterno', 'apellidoMaterno', 'razonSocial'];

/** Los datos básicos que cada tipo de persona puede elegir. */
export const CAMPOS_POR_TIPO_PERSONA: Record<TipoPersona, readonly CampoDatosBasicos[]> = {
  NATURAL: ['nombres', 'apellidoPaterno', 'apellidoMaterno'],
  JURIDICA: ['razonSocial'],
};

/** Clave del principal de direcciones en `CamposElegidos.principales`. */
export const PRINCIPAL_DIRECCION = 'DIRECCION';
export type ClavePrincipal = TipoContacto | typeof PRINCIPAL_DIRECCION;

/**
 * Qué se queda de cada ficha. Un campo o principal que no llega toma el de la conservada; si la conservada
 * no tiene principal de ese tipo, se mantiene el de la absorbida. El documento es siempre el de la conservada.
 */
export interface CamposElegidos {
  datosBasicos: Partial<Record<CampoDatosBasicos, OrigenCampo>>;
  /** Id del contacto o la dirección que queda principal; puede ser de cualquiera de las dos fichas. */
  principales: Partial<Record<ClavePrincipal, string>>;
}

/** La absorbida apunta a su conservada desde que se fusionó. */
export interface AliasFusion {
  conservadaId: string;
  fusionadaEn: Date;
}

/** Lo que la absorción movió, para que el repositorio cambie el `persona_id` de esas filas. */
export interface ResultadoAbsorcion {
  rolesMovidos: RolAsignado[];
  /** Roles que la conservada ya tenía y que toman el `desde` más antiguo de la absorbida. */
  rolesAdelantados: RolAsignado[];
  contactosMovidos: string[];
  direccionesMovidas: string[];
}

const MOTIVO_MINIMO = 5;
const MOTIVO_MAXIMO = 300;

/** TR-RNF-021: motivo obligatorio en una acción irreversible. Devuelve el motivo recortado. */
export function validarMotivoFusion(motivo: string): string {
  const recortado = motivo.trim();
  if (recortado.length < MOTIVO_MINIMO || recortado.length > MOTIVO_MAXIMO) {
    throw new MotivoFusionInvalidoError(MOTIVO_MINIMO, MOTIVO_MAXIMO);
  }
  return recortado;
}

export type ErrorDeFusion = MismaPersonaError | PersonaYaFusionadaError | TipoPersonaDistintoError | DocumentosDistintosError;

/** El bloqueo que impide fusionar el par, o nulo. La comparación lo muestra; la fusión lo lanza. */
export function errorDeFusion(conservada: Persona, absorbida: Persona): ErrorDeFusion | null {
  if (conservada.id === absorbida.id) return new MismaPersonaError();
  const yaFusionada = conservada.fusion ?? absorbida.fusion;
  if (yaFusionada) return new PersonaYaFusionadaError(yaFusionada.conservadaId);
  if (conservada.tipoPersona !== absorbida.tipoPersona) return new TipoPersonaDistintoError();
  const mismoTipo = conservada.documento.tipo === absorbida.documento.tipo;
  if (mismoTipo && conservada.documento.numero !== absorbida.documento.numero) return new DocumentosDistintosError();
  return null;
}

export function exigirFusionable(conservada: Persona, absorbida: Persona): void {
  const error = errorDeFusion(conservada, absorbida);
  if (error) throw error;
}
