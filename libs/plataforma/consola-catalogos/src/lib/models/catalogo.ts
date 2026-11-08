export const ALCANCES_CATALOGO = ['GLOBAL', 'MIXTO', 'TENANT'] as const;
export type AlcanceCatalogo = (typeof ALCANCES_CATALOGO)[number];

export interface Catalogo {
  id: string;
  codigo: string;
  nombre: string;
  alcance: AlcanceCatalogo;
  fuente: string | null;
  editablePorTenant: boolean;
  version: number;
  /** Tabla oficial: sus ítems globales cambian solo por importación. */
  importable: boolean;
}

/** `CatalogoDto` de la API (19a + 19d). */
export interface CatalogoRespuesta {
  id: string;
  codigo: string;
  nombre: string;
  alcance: AlcanceCatalogo;
  fuente: string | null;
  editable_por_tenant: boolean;
  version: number;
  importable: boolean;
}

export interface CatalogoActualizado extends Catalogo {
  /** false si no había cambios. */
  cambiado: boolean;
}

export interface CatalogoActualizadoRespuesta extends CatalogoRespuesta {
  cambiado: boolean;
}

/** `codigo` y `alcance` solo al crear: no cambian después. */
export interface SolicitudCatalogo {
  codigo: string;
  nombre: string;
  alcance: AlcanceCatalogo;
  fuente: string | null;
  editablePorTenant: boolean;
}

export type CambiosCatalogo = Omit<SolicitudCatalogo, 'codigo' | 'alcance'>;

export function aCatalogo(respuesta: CatalogoRespuesta): Catalogo {
  return {
    id: respuesta.id,
    codigo: respuesta.codigo,
    nombre: respuesta.nombre,
    alcance: respuesta.alcance,
    fuente: respuesta.fuente,
    editablePorTenant: respuesta.editable_por_tenant,
    version: respuesta.version,
    importable: respuesta.importable,
  };
}

export function aCatalogoActualizado(respuesta: CatalogoActualizadoRespuesta): CatalogoActualizado {
  return { ...aCatalogo(respuesta), cambiado: respuesta.cambiado };
}

export function aCuerpoCrearCatalogo(solicitud: SolicitudCatalogo): Record<string, unknown> {
  return {
    codigo: solicitud.codigo,
    nombre: solicitud.nombre,
    alcance: solicitud.alcance,
    fuente: solicitud.fuente,
    editable_por_tenant: solicitud.editablePorTenant,
  };
}

export function aCuerpoActualizarCatalogo(cambios: CambiosCatalogo, version: number): Record<string, unknown> {
  return { nombre: cambios.nombre, fuente: cambios.fuente, editable_por_tenant: cambios.editablePorTenant, version };
}
