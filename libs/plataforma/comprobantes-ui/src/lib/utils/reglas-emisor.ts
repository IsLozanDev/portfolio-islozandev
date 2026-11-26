import type { Emisor } from '../models/emisor';
import { MOTIVOS_DESHABILITADA } from '../models/mensajes-emisor';
import { porVencer } from './vencimiento-certificado';

/** Una prueba aceptada habilita el paso a producción durante 24 h (como VIGENCIA_PRUEBA_HORAS del back). */
export const VIGENCIA_PRUEBA_MS = 24 * 60 * 60 * 1000;

export type SeccionEmisor = 'proveedor' | 'certificado' | 'prueba' | 'produccion';
export type SeccionesExpandidas = Record<SeccionEmisor, boolean>;

const NINGUNA_EXPANDIDA: SeccionesExpandidas = { proveedor: false, certificado: false, prueba: false, produccion: false };

export function certificadoHabilitado(emisor: Emisor | null): boolean {
  return emisor !== null;
}

export function pruebaHabilitada(emisor: Emisor | null): boolean {
  return emisor?.estado === 'CONFIGURADO' || emisor?.estado === 'VERIFICADO';
}

export function pruebaEnProceso(emisor: Emisor | null): boolean {
  return emisor?.prueba?.estado === 'EN_PROCESO';
}

function pruebaAceptadaVigente(emisor: Emisor, ahora: Date): boolean {
  const { prueba } = emisor;
  if (prueba?.estado !== 'ACEPTADA' || !prueba.resultadoEn) return false;
  return ahora.getTime() - new Date(prueba.resultadoEn).getTime() < VIGENCIA_PRUEBA_MS;
}

/** VERIFICADO con una prueba aceptada de menos de 24 h. */
export function produccionHabilitada(emisor: Emisor | null, ahora: Date): boolean {
  return emisor?.estado === 'VERIFICADO' && pruebaAceptadaVigente(emisor, ahora);
}

export function motivoCertificadoDeshabilitado(emisor: Emisor | null): string | null {
  return certificadoHabilitado(emisor) ? null : MOTIVOS_DESHABILITADA.sinEmisor;
}

export function motivoPruebaDeshabilitada(emisor: Emisor | null): string | null {
  if (!emisor) return MOTIVOS_DESHABILITADA.sinEmisor;
  if (emisor.estado === 'BORRADOR') return MOTIVOS_DESHABILITADA.faltaConfigurar;
  if (emisor.estado === 'PRODUCCION') return MOTIVOS_DESHABILITADA.pruebaEnProduccion;
  return null;
}

/** null si se puede pasar a producción o ya se pasó. */
export function motivoProduccionDeshabilitada(emisor: Emisor | null, ahora: Date): string | null {
  if (!emisor) return MOTIVOS_DESHABILITADA.sinEmisor;
  if (emisor.estado === 'PRODUCCION' || produccionHabilitada(emisor, ahora)) return null;
  if (emisor.estado === 'BORRADOR') return MOTIVOS_DESHABILITADA.faltaConfigurar;
  if (emisor.estado === 'VERIFICADO' && emisor.prueba?.estado === 'ACEPTADA') return MOTIVOS_DESHABILITADA.pruebaVencida;
  return MOTIVOS_DESHABILITADA.sinPruebaAceptada;
}

function seccionDelPasoPendiente(emisor: Emisor | null): Partial<SeccionesExpandidas> {
  if (!emisor) return { proveedor: true };
  switch (emisor.estado) {
    case 'BORRADOR':
      return { proveedor: true, certificado: emisor.certificado === null };
    case 'CONFIGURADO':
      return { prueba: true };
    case 'VERIFICADO':
      return { produccion: true };
    case 'PRODUCCION':
      return {};
  }
}

/** Solo el paso pendiente; además, el certificado por vencer o vencido y la prueba en proceso. */
export function seccionesIniciales(emisor: Emisor | null, ahora: Date): SeccionesExpandidas {
  const certificado = emisor?.certificado;
  const expandidas = { ...NINGUNA_EXPANDIDA, ...seccionDelPasoPendiente(emisor) };
  if (certificado && porVencer(certificado.venceEn, ahora)) expandidas.certificado = true;
  if (pruebaEnProceso(emisor)) expandidas.prueba = true;
  return expandidas;
}
