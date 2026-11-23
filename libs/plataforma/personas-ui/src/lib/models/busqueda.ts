import {
  aDenominacion,
  aPersonaResumen,
  type Denominacion,
  type DenominacionRespuesta,
  type PersonaResumen,
  type PersonaRespuesta,
  type ProductoCodigo,
  type RolPersona,
  type TipoDocumento,
  type TipoPersona,
} from './persona';

/** Por qué una persona entró en el listado; nula sin texto de búsqueda. */
export type Coincidencia = 'DOCUMENTO' | 'CONTACTO' | 'NOMBRE';

export interface RolVigente {
  productoCodigo: ProductoCodigo;
  rol: RolPersona;
}

export interface PersonaListada {
  id: string;
  tipoPersona: TipoPersona;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  /** «Quispe Mamani, Juana» o la razón social. */
  denominacion: string;
  celularPrincipal: string | null;
  correoPrincipal: string | null;
  roles: RolVigente[];
  coincidencia: Coincidencia | null;
}

export interface ListadoPersonas {
  items: PersonaListada[];
  total: number;
  pagina: number;
  tamano: number;
}

export interface CriteriosListado {
  q?: string;
  tipoPersona?: TipoPersona;
  producto?: ProductoCodigo;
  rol?: RolPersona;
  pagina?: number;
  tamano?: number;
}

/** Por qué TR-IDN no prellenó: el registro sigue a mano. */
export type AvisoIdentidad = 'IDENTIDAD_NO_DISPONIBLE' | 'CUOTA_AGOTADA' | 'NO_ENCONTRADO_EN_IDENTIDAD';

export type ResultadoBusquedaDocumento =
  | { encontrada: true; persona: PersonaResumen }
  | { encontrada: false; prellenado: Denominacion | null; aviso: AvisoIdentidad | null };

export interface PersonaListadaRespuesta {
  id: string;
  tipo_persona: TipoPersona;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  denominacion: string;
  celular_principal: string | null;
  correo_principal: string | null;
  roles: { producto_codigo: ProductoCodigo; rol: RolPersona }[];
  coincidencia: Coincidencia | null;
}

export interface ListadoPersonasRespuesta {
  items: PersonaListadaRespuesta[];
  total: number;
  pagina: number;
  tamano: number;
}

export interface BusquedaDocumentoRespuesta {
  encontrada: boolean;
  persona?: PersonaRespuesta;
  prellenado?: DenominacionRespuesta | null;
  aviso?: AvisoIdentidad;
}

export function aPersonaListada(respuesta: PersonaListadaRespuesta): PersonaListada {
  return {
    id: respuesta.id,
    tipoPersona: respuesta.tipo_persona,
    tipoDocumento: respuesta.tipo_documento,
    numeroDocumento: respuesta.numero_documento,
    denominacion: respuesta.denominacion,
    celularPrincipal: respuesta.celular_principal,
    correoPrincipal: respuesta.correo_principal,
    roles: respuesta.roles.map(({ producto_codigo, rol }) => ({ productoCodigo: producto_codigo, rol })),
    coincidencia: respuesta.coincidencia,
  };
}

export function aListadoPersonas(respuesta: ListadoPersonasRespuesta): ListadoPersonas {
  return { items: respuesta.items.map(aPersonaListada), total: respuesta.total, pagina: respuesta.pagina, tamano: respuesta.tamano };
}

export function aResultadoBusquedaDocumento(respuesta: BusquedaDocumentoRespuesta): ResultadoBusquedaDocumento {
  if (respuesta.encontrada && respuesta.persona) return { encontrada: true, persona: aPersonaResumen(respuesta.persona) };
  return {
    encontrada: false,
    prellenado: respuesta.prellenado ? aDenominacion(respuesta.prellenado) : null,
    aviso: respuesta.aviso ?? null,
  };
}

/** Los parámetros que vienen vacíos no viajan. */
export function aParametrosListado(criterios: CriteriosListado): Record<string, string> {
  const parametros: Record<string, string | number | undefined> = {
    q: criterios.q?.trim() || undefined,
    tipo_persona: criterios.tipoPersona,
    producto: criterios.producto,
    rol: criterios.rol,
    pagina: criterios.pagina,
    tamano: criterios.tamano,
  };
  return Object.fromEntries(
    Object.entries(parametros)
      .filter(([, valor]) => valor !== undefined)
      .map(([clave, valor]) => [clave, String(valor)]),
  );
}
