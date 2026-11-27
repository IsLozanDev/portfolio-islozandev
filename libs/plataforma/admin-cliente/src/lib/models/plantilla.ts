export const ORIGENES_PLANTILLA = ['BASE', 'PERSONALIZADA'] as const;
export type OrigenPlantilla = (typeof ORIGENES_PLANTILLA)[number];

/** Único canal habilitado en R2 (TR-CA-186 queda latente). */
export type CanalPlantilla = 'CORREO';

/** Mismo largo que valida el back (spec 43). */
export const LARGO_MAXIMO_ASUNTO = 150;

export interface VariableDeclarada {
  nombre: string;
  tipo: string;
  ejemplo: string | null;
}

export interface ResumenPlantilla {
  codigo: string;
  nombre: string;
  canal: CanalPlantilla;
  idioma: string;
  origen: OrigenPlantilla;
  /** De la personalizada vigente; `null` si rige la base. */
  version: number | null;
  asunto: string;
  actualizadoEn: string;
}

export interface DetallePlantilla extends ResumenPlantilla {
  cuerpo: string;
  variables: VariableDeclarada[];
  base: { asunto: string; cuerpo: string };
}

export interface VersionPlantilla {
  version: number;
  activa: boolean;
  creadoPor: string | null;
  creadoEn: string;
}

export interface VistaPrevia {
  asunto: string;
  cuerpoHtml: string;
}

/** Lo que se envía al guardar; `version` es la que se leyó (`null` si regía la base). */
export interface ContenidoPlantilla {
  asunto: string;
  cuerpo: string;
  version: number | null;
}

export interface FiltroPlantillas {
  q?: string;
  pagina: number;
  tamano: number;
}

export interface PaginaPlantillas {
  items: ResumenPlantilla[];
  total: number;
}

/** `ResumenPlantillaDto` de `GET /v1/notificaciones/plantillas`. */
export interface ResumenPlantillaRespuesta {
  codigo: string;
  nombre: string;
  canal: CanalPlantilla;
  idioma: string;
  origen: OrigenPlantilla;
  version: number;
  asunto: string | null;
  actualizado_en: string;
}

export interface PaginaPlantillasRespuesta {
  items: ResumenPlantillaRespuesta[];
  total: number;
  pagina: number;
  tamano: number;
}

/** `PlantillaDto` del detalle y del `PUT`. */
export interface DetallePlantillaRespuesta {
  codigo: string;
  nombre: string;
  canal: CanalPlantilla;
  idioma: string;
  origen: OrigenPlantilla;
  asunto: string | null;
  cuerpo: string;
  variables: VariableDeclarada[];
  version: number | null;
  actualizado_en: string;
  base: { asunto: string | null; cuerpo: string };
}

export interface VersionPlantillaRespuesta {
  version: number;
  activa: boolean;
  creado_por: string | null;
  creado_en: string;
}

export interface VistaPreviaRespuesta {
  asunto: string;
  cuerpo_html: string;
}

/** La lista trae la versión de la base aunque rija ella; se muestra vacía, como en el detalle. */
export function aResumenPlantilla(respuesta: ResumenPlantillaRespuesta): ResumenPlantilla {
  return {
    codigo: respuesta.codigo,
    nombre: respuesta.nombre,
    canal: respuesta.canal,
    idioma: respuesta.idioma,
    origen: respuesta.origen,
    version: respuesta.origen === 'BASE' ? null : respuesta.version,
    asunto: respuesta.asunto ?? '',
    actualizadoEn: respuesta.actualizado_en,
  };
}

export function aPaginaPlantillas(respuesta: PaginaPlantillasRespuesta): PaginaPlantillas {
  return { items: respuesta.items.map(aResumenPlantilla), total: respuesta.total };
}

export function aDetallePlantilla(respuesta: DetallePlantillaRespuesta): DetallePlantilla {
  return {
    codigo: respuesta.codigo,
    nombre: respuesta.nombre,
    canal: respuesta.canal,
    idioma: respuesta.idioma,
    origen: respuesta.origen,
    version: respuesta.version,
    asunto: respuesta.asunto ?? '',
    actualizadoEn: respuesta.actualizado_en,
    cuerpo: respuesta.cuerpo,
    variables: respuesta.variables.map((variable) => ({ nombre: variable.nombre, tipo: variable.tipo, ejemplo: variable.ejemplo })),
    base: { asunto: respuesta.base.asunto ?? '', cuerpo: respuesta.base.cuerpo },
  };
}

export function aVersionPlantilla(respuesta: VersionPlantillaRespuesta): VersionPlantilla {
  return { version: respuesta.version, activa: respuesta.activa, creadoPor: respuesta.creado_por, creadoEn: respuesta.creado_en };
}

export function aVistaPrevia(respuesta: VistaPreviaRespuesta): VistaPrevia {
  return { asunto: respuesta.asunto, cuerpoHtml: respuesta.cuerpo_html };
}

/** Query params de la lista; el texto vacío no viaja. */
export function parametrosConsultaPlantillas(filtro: FiltroPlantillas): Record<string, string | number> {
  return { pagina: filtro.pagina, tamano: filtro.tamano, ...(filtro.q ? { q: filtro.q } : {}) };
}
