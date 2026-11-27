import { CODIGOS_AVISO } from './avisos-plataforma.js';
import type { CanalNotificacion } from './canal.js';
import { escaparHtml } from './renderizador-plantilla.js';

export const VIGENCIA_ENLACE_DIAS = 30;
const MILISEGUNDOS_POR_DIA = 86_400_000;
const MASCARA = '***';
const RUTA_PREFERENCIAS = '/preferencias';
const BARRAS_FINALES = /\/+$/;
const CODIGOS_SIN_PIE: ReadonlySet<string> = new Set(Object.values(CODIGOS_AVISO));

/** Lo que firma el enlace del pie: identifica el destino sin llevar el correo en claro. */
export interface CargaEnlace {
  tenantId: string;
  canal: CanalNotificacion;
  destinoHash: string;
  personaId?: string;
  venceEn: Date;
}

export function vencimientoEnlace(ahora: Date): Date {
  return new Date(ahora.getTime() + VIGENCIA_ENLACE_DIAS * MILISEGUNDOS_POR_DIA);
}

export function enlaceVigente(carga: CargaEnlace, ahora: Date): boolean {
  return carga.venceEn.getTime() > ahora.getTime();
}

/** `juana@gmail.com` → `j***@gmail.com`: primera letra y dominio. */
export function enmascararCorreo(correo: string): string {
  const arroba = correo.lastIndexOf('@');
  if (arroba < 1) return MASCARA;
  return `${correo[0]}${MASCARA}${correo.slice(arroba)}`;
}

/** Los avisos de plataforma van a operadores y propietarios del servicio, no a destinatarios del tenant. */
export function llevaPiePreferencias(codigoPlantilla: string): boolean {
  return !CODIGOS_SIN_PIE.has(codigoPlantilla);
}

/** El token va en el fragmento: el navegador no lo manda al servidor y no queda en logs. */
export function urlPreferencias(urlBase: string, token: string): string {
  return `${urlBase.replace(BARRAS_FINALES, '')}${RUTA_PREFERENCIAS}#t=${token}`;
}

/** Se agrega después de renderizar: una plantilla del tenant no puede quitarlo ni alterarlo. */
export function agregarPiePreferencias(cuerpo: string, url: string): string {
  return `${cuerpo}<hr><p>¿No quieres recibir estos correos? <a href="${escaparHtml(url)}">Gestiona tus preferencias</a>.</p>`;
}
