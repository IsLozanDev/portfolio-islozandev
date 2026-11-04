import type { ParamMap, Params } from '@angular/router';
import { tamanoPaginaParaUrl } from '@vitrina/shared/ui';
import { TIPOS_EVENTO, type FiltroBitacora, type TipoEvento } from '../models/evento-seguridad';
import { PARAMETRO_URL_ORGANIZACION, paginaDesdeUrl, paginaParaUrl, tamanoDesdeUrl } from './filtro-url-organizacion';

/** Query params de `/admin/bitacora`. `pagina` y `tamano` son los mismos de las listas de organización. */
export const PARAMETRO_URL_BITACORA = { desde: 'desde', hasta: 'hasta', tipo: 'tipo', usuario: 'usuario' } as const;

/** Sin rango en la URL, la última semana (spec 18): hoy y los 6 días anteriores. */
export const DIAS_RANGO_POR_DEFECTO = 7;
/** La API pide 2 caracteres como mínimo: con uno solo, no se filtra. */
export const LONGITUD_MINIMA_USUARIO = 2;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MILISEGUNDOS_POR_DIA = 86_400_000;
const FORMATO_DIA_LIMA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' });

/** `YYYY-MM-DD` del día en Lima, sin importar la zona del navegador. */
export function diaEnLima(instante: Date): string {
  return FORMATO_DIA_LIMA.format(instante);
}

export function rangoPorDefecto(ahora: Date): { desde: string; hasta: string } {
  return { desde: diaEnLima(new Date(ahora.getTime() - (DIAS_RANGO_POR_DEFECTO - 1) * MILISEGUNDOS_POR_DIA)), hasta: diaEnLima(ahora) };
}

/** Un `tipo` que no es del catálogo se ignora; un rango incompleto o mal escrito toma la última semana. */
export function filtroBitacoraDesdeUrl(parametros: ParamMap, ahora: Date): FiltroBitacora {
  const desde = parametros.get(PARAMETRO_URL_BITACORA.desde);
  const hasta = parametros.get(PARAMETRO_URL_BITACORA.hasta);
  const rango = desde && hasta && FECHA.test(desde) && FECHA.test(hasta) ? { desde, hasta } : rangoPorDefecto(ahora);
  const tipo = parametros.get(PARAMETRO_URL_BITACORA.tipo);
  const usuario = parametros.get(PARAMETRO_URL_BITACORA.usuario)?.trim() ?? '';
  return {
    ...rango,
    tipo: (TIPOS_EVENTO as readonly string[]).includes(tipo ?? '') ? (tipo as TipoEvento) : undefined,
    usuario: usuario.length >= LONGITUD_MINIMA_USUARIO ? usuario : undefined,
    pagina: paginaDesdeUrl(parametros),
    tamano: tamanoDesdeUrl(parametros),
  };
}

/** `null` saca el parámetro de la URL. El rango siempre va: así el enlace se comparte con el mismo período. */
export function filtroBitacoraParaUrl(filtro: FiltroBitacora): Params {
  return {
    [PARAMETRO_URL_BITACORA.desde]: filtro.desde,
    [PARAMETRO_URL_BITACORA.hasta]: filtro.hasta,
    [PARAMETRO_URL_BITACORA.tipo]: filtro.tipo ?? null,
    [PARAMETRO_URL_BITACORA.usuario]: filtro.usuario ?? null,
    [PARAMETRO_URL_ORGANIZACION.pagina]: paginaParaUrl(filtro.pagina),
    [PARAMETRO_URL_ORGANIZACION.tamano]: tamanoPaginaParaUrl(filtro.tamano),
  };
}
