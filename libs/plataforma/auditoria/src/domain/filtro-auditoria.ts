import { FiltroAuditoriaInvalidoError, RangoInvalidoError } from './errores.js';

export const TIPOS_EVENTO_AUDITORIA = ['OPERACION', 'ACCESO_SENSIBLE'] as const;
export type TipoEventoAuditoria = (typeof TIPOS_EVENTO_AUDITORIA)[number];

/** Fechas YYYY-MM-DD en America/Lima, inclusive en ambos extremos. */
export interface FiltroAuditoria {
  desde: string;
  hasta: string;
  /** Parte del correo o del nombre de quien actuó. */
  usuario?: string;
  accion?: string;
  entidadTipo?: string;
  entidadId?: string;
  sucursalId?: string;
  tipo?: TipoEventoAuditoria;
  personaTitularId?: string;
}

export interface Paginacion {
  pagina: number;
  tamano: number;
}

/** Acota el `count` de la lista sobre tablas de 100 000 eventos por tenant (TR-RNF-002). */
export const MAXIMO_DIAS_RANGO = 92;
export const MAXIMO_FILAS_EXPORTACION = 10_000;
export const TAMANO_PAGINA_DEFECTO = 20;
export const TAMANO_PAGINA_MAXIMO = 100;
export const LONGITUD_MINIMA_USUARIO = 2;
export const LONGITUD_MAXIMA_USUARIO = 100;
/** Los mismos topes que las columnas de aud.evento_auditoria. */
export const LONGITUD_MAXIMA_ACCION = 80;
export const LONGITUD_MAXIMA_ENTIDAD_TIPO = 40;
export const LONGITUD_MAXIMA_ENTIDAD_ID = 80;

const MILISEGUNDOS_POR_DIA = 86_400_000;
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rango obligatorio, en orden y de hasta 92 días; ids uuid y textos dentro de sus topes. Devuelve el filtro sin espacios sobrantes en `usuario`. */
export function validarFiltroAuditoria(filtro: FiltroAuditoria): FiltroAuditoria {
  exigirRango(filtro.desde, filtro.hasta);
  exigirUuid('sucursalId', filtro.sucursalId);
  exigirUuid('personaTitularId', filtro.personaTitularId);
  exigirLongitudMaxima('accion', filtro.accion, LONGITUD_MAXIMA_ACCION);
  exigirLongitudMaxima('entidadTipo', filtro.entidadTipo, LONGITUD_MAXIMA_ENTIDAD_TIPO);
  exigirLongitudMaxima('entidadId', filtro.entidadId, LONGITUD_MAXIMA_ENTIDAD_ID);
  if (filtro.tipo !== undefined && !TIPOS_EVENTO_AUDITORIA.includes(filtro.tipo)) throw new FiltroAuditoriaInvalidoError('tipo');
  if (filtro.usuario === undefined) return filtro;

  const usuario = filtro.usuario.trim();
  if (usuario.length < LONGITUD_MINIMA_USUARIO || usuario.length > LONGITUD_MAXIMA_USUARIO) throw new FiltroAuditoriaInvalidoError('usuario');
  return { ...filtro, usuario };
}

export function validarPaginacion(paginacion: Partial<Paginacion>): Paginacion {
  const pagina = paginacion.pagina ?? 1;
  const tamano = paginacion.tamano ?? TAMANO_PAGINA_DEFECTO;
  if (!Number.isInteger(pagina) || pagina < 1) throw new FiltroAuditoriaInvalidoError('pagina');
  if (!Number.isInteger(tamano) || tamano < 1 || tamano > TAMANO_PAGINA_MAXIMO) throw new FiltroAuditoriaInvalidoError('tamano');
  return { pagina, tamano };
}

function exigirRango(desde: string | undefined, hasta: string | undefined): void {
  const inicio = desde ? diaCalendario(desde) : null;
  const fin = hasta ? diaCalendario(hasta) : null;
  if (inicio === null || fin === null || fin < inicio) throw new RangoInvalidoError();
  if ((fin - inicio) / MILISEGUNDOS_POR_DIA >= MAXIMO_DIAS_RANGO) throw new RangoInvalidoError();
}

/** Milisegundos del día a medianoche UTC, o null si no es una fecha que exista (2026-02-30). */
function diaCalendario(valor: string): number | null {
  if (!FORMATO_FECHA.test(valor)) return null;
  const instante = new Date(`${valor}T00:00:00Z`);
  return instante.toISOString().startsWith(valor) ? instante.getTime() : null;
}

function exigirUuid(campo: string, valor: string | undefined): void {
  if (valor !== undefined && !FORMATO_UUID.test(valor)) throw new FiltroAuditoriaInvalidoError(campo);
}

function exigirLongitudMaxima(campo: string, valor: string | undefined, maximo: number): void {
  if (valor !== undefined && (valor.length === 0 || valor.length > maximo)) throw new FiltroAuditoriaInvalidoError(campo);
}
