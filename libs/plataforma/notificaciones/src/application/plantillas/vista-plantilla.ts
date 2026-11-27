import type { CanalNotificacion } from '../../domain/canal.js';
import { PlantillaBaseNoEncontradaError } from '../../domain/errores.js';
import { IDIOMA_POR_DEFECTO, origenDe, type OrigenPlantilla, type Plantilla, type VariableDeclarada } from '../../domain/plantilla.js';
import type { RepositorioPlantillas } from '../ports/repositorios.js';

export const ENTIDAD_PLANTILLA = 'plantilla_notificacion';
export const ACCIONES_PLANTILLA = {
  personalizar: 'plat.plantilla_notificacion.personalizar',
  restaurar: 'plat.plantilla_notificacion.restaurar',
} as const;

/** La vigente para el tenant y, aparte, el texto de la base para mostrar o comparar la original. */
export interface DetallePlantilla {
  codigo: string;
  nombre: string;
  canal: CanalNotificacion;
  idioma: string;
  origen: OrigenPlantilla;
  asunto: string | null;
  cuerpo: string;
  variables: readonly VariableDeclarada[];
  /** De la personalizada vigente; `null` si rige la base. Es la que el PUT devuelve (bloqueo optimista). */
  version: number | null;
  actualizadoEn: Date;
  base: { asunto: string | null; cuerpo: string };
}

export function detalleDe(vigente: Plantilla, base: Plantilla): DetallePlantilla {
  const origen = origenDe(vigente);
  return {
    codigo: vigente.codigo,
    nombre: vigente.nombre,
    canal: vigente.canal,
    idioma: vigente.idioma,
    origen,
    asunto: vigente.asunto,
    cuerpo: vigente.cuerpo,
    variables: vigente.variables,
    version: origen === 'BASE' ? null : vigente.version,
    actualizadoEn: vigente.creadoEn,
    base: { asunto: base.asunto, cuerpo: base.cuerpo },
  };
}

/** Solo se consultan y personalizan códigos con base personalizable (precondición de TR-RF-074). */
export async function exigirBase(plantillas: RepositorioPlantillas, codigo: string, canal: CanalNotificacion): Promise<Plantilla> {
  const base = await plantillas.basePersonalizable(codigo, canal, IDIOMA_POR_DEFECTO);
  if (!base) throw new PlantillaBaseNoEncontradaError(codigo);
  return base;
}

/** La personalizada vigente del tenant o, si no hay, la base; junto con la base. */
export async function vigenteConSuBase(
  plantillas: RepositorioPlantillas,
  codigo: string,
  canal: CanalNotificacion,
): Promise<{ vigente: Plantilla; base: Plantilla }> {
  const base = await exigirBase(plantillas, codigo, canal);
  const vigente = (await plantillas.vigenteDelTenant(codigo, canal, IDIOMA_POR_DEFECTO)) ?? base;
  return { vigente, base };
}

/** Lo que va a la auditoría de una versión: su origen, número y largos, nunca el texto (TR-RNF-013). */
export function huellaDe(plantilla: Plantilla): Record<string, unknown> {
  return {
    origen: origenDe(plantilla),
    version: plantilla.version,
    largo_asunto: plantilla.asunto?.length ?? 0,
    largo_cuerpo: plantilla.cuerpo.length,
  };
}

export function entidadIdDe(codigo: string, canal: CanalNotificacion): string {
  return `${codigo}/${canal}`;
}
