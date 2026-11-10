import type { ParamMap, Params } from '@angular/router';
import { tamanoPaginaParaUrl } from '@vitrina/shared/ui';
import { TIPOS_EVENTO_AUDITORIA, type FiltroAuditoria, type TipoEventoAuditoria } from '../models/evento-auditoria';
import { LONGITUD_MINIMA_USUARIO, rangoDesdeUrl } from './filtro-url-bitacora';
import { PARAMETRO_URL_ORGANIZACION, paginaDesdeUrl, paginaParaUrl, tamanoDesdeUrl } from './filtro-url-organizacion';

/** Query params de `/admin/auditoria`: los mismos nombres que la API, así otra pantalla arma el enlace sin traducir. */
export const PARAMETRO_URL_AUDITORIA = {
  desde: 'desde',
  hasta: 'hasta',
  usuario: 'usuario',
  accion: 'accion',
  tipo: 'tipo',
  sucursalId: 'sucursal_id',
  entidadTipo: 'entidad_tipo',
  entidadId: 'entidad_id',
  personaTitularId: 'persona_titular_id',
} as const;

/** Un `tipo` fuera del catálogo y un `usuario` de 1 carácter se ignoran; un rango incompleto toma la última semana. */
export function filtroAuditoriaDesdeUrl(parametros: ParamMap, ahora: Date): FiltroAuditoria {
  const tipo = parametros.get(PARAMETRO_URL_AUDITORIA.tipo) ?? '';
  const usuario = textoDeUrl(parametros, PARAMETRO_URL_AUDITORIA.usuario);
  return {
    ...rangoDesdeUrl(parametros, ahora),
    usuario: usuario && usuario.length >= LONGITUD_MINIMA_USUARIO ? usuario : undefined,
    accion: accionNormalizada(parametros.get(PARAMETRO_URL_AUDITORIA.accion)),
    tipo: (TIPOS_EVENTO_AUDITORIA as readonly string[]).includes(tipo) ? (tipo as TipoEventoAuditoria) : undefined,
    sucursalId: textoDeUrl(parametros, PARAMETRO_URL_AUDITORIA.sucursalId),
    entidadTipo: textoDeUrl(parametros, PARAMETRO_URL_AUDITORIA.entidadTipo),
    entidadId: textoDeUrl(parametros, PARAMETRO_URL_AUDITORIA.entidadId),
    personaTitularId: textoDeUrl(parametros, PARAMETRO_URL_AUDITORIA.personaTitularId),
    pagina: paginaDesdeUrl(parametros),
    tamano: tamanoDesdeUrl(parametros),
  };
}

/** `null` saca el parámetro de la URL. El rango siempre va: así el enlace se comparte con el mismo período. */
export function filtroAuditoriaParaUrl(filtro: FiltroAuditoria): Params {
  return {
    [PARAMETRO_URL_AUDITORIA.desde]: filtro.desde,
    [PARAMETRO_URL_AUDITORIA.hasta]: filtro.hasta,
    [PARAMETRO_URL_AUDITORIA.usuario]: filtro.usuario ?? null,
    [PARAMETRO_URL_AUDITORIA.accion]: filtro.accion ?? null,
    [PARAMETRO_URL_AUDITORIA.tipo]: filtro.tipo ?? null,
    [PARAMETRO_URL_AUDITORIA.sucursalId]: filtro.sucursalId ?? null,
    [PARAMETRO_URL_AUDITORIA.entidadTipo]: filtro.entidadTipo ?? null,
    [PARAMETRO_URL_AUDITORIA.entidadId]: filtro.entidadId ?? null,
    [PARAMETRO_URL_AUDITORIA.personaTitularId]: filtro.personaTitularId ?? null,
    [PARAMETRO_URL_ORGANIZACION.pagina]: paginaParaUrl(filtro.pagina),
    [PARAMETRO_URL_ORGANIZACION.tamano]: tamanoPaginaParaUrl(filtro.tamano),
  };
}

/** La API compara la acción exacta y su formato es en minúsculas: se recorta y se baja; vacía, sin filtro. */
export function accionNormalizada(texto: string | null | undefined): string | undefined {
  const accion = texto?.trim().toLowerCase() ?? '';
  return accion || undefined;
}

function textoDeUrl(parametros: ParamMap, clave: string): string | undefined {
  return parametros.get(clave)?.trim() || undefined;
}
