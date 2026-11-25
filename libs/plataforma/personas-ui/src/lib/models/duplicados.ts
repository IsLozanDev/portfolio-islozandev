import { aPersonaListada, type PersonaListada, type PersonaListadaRespuesta } from './busqueda';
import { aPersonaDetalle, type Denominacion, type PersonaDetalle, type PersonaDetalleRespuesta, type TipoContacto } from './persona';

/** Valores que fija la API de duplicados y fusión (spec 39). */
export const MOTIVOS_DUPLICADO = ['MISMO_NUMERO_OTRO_TIPO', 'CELULAR_Y_NOMBRE_IGUAL', 'CELULAR_Y_NOMBRE_PARECIDO'] as const;
export type MotivoDuplicado = (typeof MOTIVOS_DUPLICADO)[number];

export const CODIGOS_BLOQUEO = ['MISMA_PERSONA', 'DOCUMENTOS_DISTINTOS', 'TIPO_PERSONA_DISTINTO', 'PERSONA_FUSIONADA'] as const;
export type CodigoBloqueo = (typeof CODIGOS_BLOQUEO)[number];

/** De qué ficha sale un dato básico al fusionar. */
export type Origen = 'CONSERVADA' | 'ABSORBIDA';

export const PRINCIPAL_DIRECCION = 'DIRECCION';
export type ClavePrincipal = TipoContacto | typeof PRINCIPAL_DIRECCION;

export type CampoDatoBasico = keyof Denominacion;

export interface ParCandidato {
  /** La de id menor. */
  personaA: PersonaListada;
  personaB: PersonaListada;
  puntaje: number;
  motivos: MotivoDuplicado[];
}

export interface PaginaDuplicados {
  items: ParCandidato[];
  total: number;
  pagina: number;
  tamano: number;
}

export interface CriteriosDuplicados {
  pagina: number;
  tamano: number;
  /** Solo los pares donde está esta persona; nulo para todos. */
  personaId: string | null;
}

export interface ComparacionPar {
  /** Con `version`, para fusionar. */
  personaA: PersonaDetalle;
  personaB: PersonaDetalle;
  puntaje: number;
  motivos: MotivoDuplicado[];
  descartado: boolean;
  /** Lo que respondería la fusión; nulo si se puede fusionar. */
  bloqueo: CodigoBloqueo | null;
}

/** Lo que el administrador elige en la comparación. */
export interface EleccionFusion {
  conservadaId: string;
  datosBasicos: Partial<Record<CampoDatoBasico, Origen>>;
  /** Id del contacto o la dirección que queda como principal; puede ser de cualquiera de las dos fichas. */
  principales: Partial<Record<ClavePrincipal, string>>;
}

export interface SolicitudFusion extends EleccionFusion {
  absorbidaId: string;
  versionConservada: number;
  versionAbsorbida: number;
  motivo: string;
}

interface ParCandidatoRespuesta {
  persona_a: PersonaListadaRespuesta;
  persona_b: PersonaListadaRespuesta;
  puntaje: number;
  motivos: MotivoDuplicado[];
}

export interface PaginaDuplicadosRespuesta {
  items: ParCandidatoRespuesta[];
  total: number;
  pagina: number;
  tamano: number;
}

export interface ComparacionParRespuesta {
  persona_a: PersonaDetalleRespuesta;
  persona_b: PersonaDetalleRespuesta;
  puntaje: number;
  motivos: MotivoDuplicado[];
  descartado: boolean;
  bloqueo: CodigoBloqueo | null;
}

const CAMPOS_EN_LA_API: Record<CampoDatoBasico, string> = {
  nombres: 'nombres',
  apellidoPaterno: 'apellido_paterno',
  apellidoMaterno: 'apellido_materno',
  razonSocial: 'razon_social',
};

export function aPaginaDuplicados(respuesta: PaginaDuplicadosRespuesta): PaginaDuplicados {
  return {
    items: respuesta.items.map((item) => ({
      personaA: aPersonaListada(item.persona_a),
      personaB: aPersonaListada(item.persona_b),
      puntaje: item.puntaje,
      motivos: [...item.motivos],
    })),
    total: respuesta.total,
    pagina: respuesta.pagina,
    tamano: respuesta.tamano,
  };
}

export function aComparacionPar(respuesta: ComparacionParRespuesta): ComparacionPar {
  return {
    personaA: aPersonaDetalle(respuesta.persona_a),
    personaB: aPersonaDetalle(respuesta.persona_b),
    puntaje: respuesta.puntaje,
    motivos: [...respuesta.motivos],
    descartado: respuesta.descartado,
    bloqueo: respuesta.bloqueo,
  };
}

/** `persona` solo viaja si hay filtro. */
export function aParametrosDuplicados({ pagina, tamano, personaId }: CriteriosDuplicados): Record<string, string> {
  const parametros: Record<string, string> = { pagina: String(pagina), tamano: String(tamano) };
  if (personaId !== null) parametros['persona'] = personaId;
  return parametros;
}

export function aCuerpoParPersonas(personaAId: string, personaBId: string): { persona_a_id: string; persona_b_id: string } {
  return { persona_a_id: personaAId, persona_b_id: personaBId };
}

export function aCuerpoFusion(solicitud: SolicitudFusion): object {
  const datosBasicos = Object.fromEntries(
    Object.entries(solicitud.datosBasicos).map(([campo, origen]) => [CAMPOS_EN_LA_API[campo as CampoDatoBasico], origen]),
  );
  return {
    persona_conservada_id: solicitud.conservadaId,
    persona_absorbida_id: solicitud.absorbidaId,
    version_conservada: solicitud.versionConservada,
    version_absorbida: solicitud.versionAbsorbida,
    campos_elegidos: { datos_basicos: datosBasicos, principales: { ...solicitud.principales } },
    motivo: solicitud.motivo,
  };
}
