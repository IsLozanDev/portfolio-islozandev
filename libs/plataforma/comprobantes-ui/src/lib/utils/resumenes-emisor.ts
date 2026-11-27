import type { Emisor } from '../models/emisor';
import { ETIQUETAS_PRUEBA } from '../models/estado-emisor';
import { MENSAJES_EMISOR } from '../models/mensajes-emisor';
import { formatoFechaCorta, formatoFechaHoraCorta } from './fechas';
import { motivoCertificadoDeshabilitado, motivoProduccionDeshabilitada, motivoPruebaDeshabilitada, VIGENCIA_PRUEBA_MS, type SeccionEmisor } from './reglas-emisor';

const SEPARADOR = ' · ';

/** «{proveedor} · {usuario}»; vacío sin emisor (la sección abre expandida). */
export function resumenProveedor(emisor: Emisor | null, nombreProveedor: string): string {
  if (!emisor?.proveedor) return '';
  return [nombreProveedor, emisor.usuarioProveedor].filter(Boolean).join(SEPARADOR);
}

/** «RUC {ruc} · vence {dd/mm/aa}», o por qué está deshabilitada. */
export function resumenCertificado(emisor: Emisor | null): string {
  const motivo = motivoCertificadoDeshabilitado(emisor);
  if (motivo) return motivo;
  const certificado = emisor?.certificado;
  if (!certificado) return MENSAJES_EMISOR.certificado.sinCertificado;
  return `RUC ${certificado.ruc}${SEPARADOR}vence ${formatoFechaCorta(certificado.venceEn)}`;
}

/** «Prueba n.º {n} · {estado} · {dd/mm/aa, hh:mm}» o «Sin pruebas»; antes de poder probar, el motivo. */
export function resumenPrueba(emisor: Emisor | null): string {
  const prueba = emisor?.prueba;
  if (!prueba) return motivoPruebaDeshabilitada(emisor) ?? MENSAJES_EMISOR.prueba.sinPruebas;
  const instante = prueba.resultadoEn ?? prueba.solicitadaEn;
  return [MENSAJES_EMISOR.prueba.numero(prueba.numero), ETIQUETAS_PRUEBA[prueba.estado], formatoFechaHoraCorta(instante)].join(SEPARADOR);
}

/** «En producción desde …», el motivo del bloqueo o hasta cuándo vale la prueba aceptada. */
export function resumenProduccion(emisor: Emisor | null, ahora: Date): string {
  if (emisor?.estado === 'PRODUCCION' && emisor.produccionHabilitadaEn) {
    return MENSAJES_EMISOR.produccion.enProduccionDesde(formatoFechaCorta(emisor.produccionHabilitadaEn));
  }
  return motivoProduccionDeshabilitada(emisor, ahora) ?? vigenciaDePrueba(emisor) ?? '';
}

/** Hasta cuándo habilita producción la prueba aceptada: `resultadoEn` + 24 h. */
export function vigenciaDePrueba(emisor: Emisor | null): string | null {
  const resultadoEn = emisor?.prueba?.estado === 'ACEPTADA' ? emisor.prueba.resultadoEn : null;
  if (!resultadoEn) return null;
  const vence = new Date(new Date(resultadoEn).getTime() + VIGENCIA_PRUEBA_MS).toISOString();
  return MENSAJES_EMISOR.produccion.vigenteHasta(formatoFechaHoraCorta(vence));
}

/** La marca de hecho en la entrada de cada sección. */
export function seccionHecha(seccion: SeccionEmisor, emisor: Emisor | null): boolean {
  if (!emisor) return false;
  switch (seccion) {
    case 'proveedor':
      return emisor.usuarioProveedor !== null && emisor.tieneCredencial;
    case 'certificado':
      return emisor.certificado !== null;
    case 'prueba':
      return emisor.estado === 'VERIFICADO' || emisor.estado === 'PRODUCCION';
    case 'produccion':
      return emisor.estado === 'PRODUCCION';
  }
}
