import type { ProductoCodigo } from '@vitrina/plataforma/org';
import type { ConsultaClasificada } from '../../domain/consulta-personas.js';
import type { DenominacionPersona } from '../../domain/denominacion.js';
import type { TipoDocumentoPersona } from '../../domain/documento-identidad.js';
import type { TipoPersona } from '../../domain/persona.js';
import type { RolPersona } from '../../domain/rol-persona.js';

/** Por qué una persona entró en el resultado. Nula sin texto de búsqueda. */
export type Coincidencia = 'DOCUMENTO' | 'CONTACTO' | 'NOMBRE';

export interface FiltrosPersonas {
  tipoPersona?: TipoPersona;
  /** Con un rol vigente de ese producto. */
  producto?: ProductoCodigo;
  /** Con ese rol vigente en algún producto (o en `producto`, si viene). */
  rol?: RolPersona;
}

export interface CriteriosConsultaPersonas extends FiltrosPersonas {
  consulta: ConsultaClasificada | null;
  pagina: number;
  tamano: number;
}

export interface PersonaListada extends DenominacionPersona {
  id: string;
  tipoPersona: TipoPersona;
  tipoDocumento: TipoDocumentoPersona;
  numeroDocumento: string;
  celularPrincipal: string | null;
  correoPrincipal: string | null;
  roles: { productoCodigo: ProductoCodigo; rol: RolPersona }[];
  coincidencia: Coincidencia | null;
}

export interface PaginaPersonas {
  items: PersonaListada[];
  /** Personas que cumplen la consulta y los filtros, sin paginar. */
  total: number;
}

/** Lectura del listado, aparte del repositorio del agregado: no arma personas ni necesita su versión. */
export interface ConsultaPersonas {
  buscar(criterios: CriteriosConsultaPersonas): Promise<PaginaPersonas>;
}
