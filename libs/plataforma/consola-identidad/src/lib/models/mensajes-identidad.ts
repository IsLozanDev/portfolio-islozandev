import type { EstadoCuota, ResultadoConsulta } from './cuota';

/** Textos de la consola de identidad, en español de Perú. */
export const MENSAJE_ERROR_DESCONOCIDO = 'No se pudo completar la operación. Inténtelo de nuevo.';

export const MENSAJES_POR_CODIGO: Readonly<Record<string, string>> = {
  INCLUIDAS_MENOR_QUE_CONSUMIDAS: 'Las incluidas no pueden ser menos que las ya consumidas.',
  PERIODO_CERRADO: 'Solo se puede ajustar la cuota del mes actual.',
  VERSION_OBSOLETA: 'La cuota cambió mientras la editabas.',
  ULTIMO_PROVEEDOR_ACTIVO: 'Debe quedar al menos un proveedor activo.',
  PROVEEDOR_NO_ENCONTRADO: 'El proveedor no existe.',
  CUOTA_NO_ENCONTRADA: 'El tenant no tiene cuota en ese mes.',
  OPERADOR_REQUERIDO: 'Esta pantalla solo está disponible para el operador de la plataforma',
};

export const MENSAJES_CUOTAS = {
  titulo: 'Cuotas DNI/RUC',
  mes: 'Mes',
  buscarTenant: 'Buscar tenant por nombre',
  sinCoincidencias: 'Ningún tenant coincide con la búsqueda',
  verDetalle: 'Ver detalle',
  consumoDe: 'Consumo de',
} as const;

/** «No hay cuotas en noviembre 2026». */
export function textoSinCuotas(etiquetaMes: string): string {
  return `No hay cuotas en ${etiquetaMes}`;
}

export const COLUMNAS_CUOTAS = {
  tenant: 'Tenant',
  plan: 'Plan',
  consumo: 'Consumo',
  estado: 'Estado',
} as const;

export const ETIQUETAS_ESTADO_CUOTA: Readonly<Record<EstadoCuota, string>> = {
  AGOTADA: 'Agotada',
  EN_AVISO: 'Sobre el umbral',
  NORMAL: 'Normal',
};

export const ETIQUETAS_RESULTADO_CONSULTA: Readonly<Record<ResultadoConsulta, string>> = {
  CACHE: 'Desde caché',
  PROVEEDOR: 'Al proveedor',
  NO_ENCONTRADO: 'No encontrado',
  INVALIDO: 'Inválido',
  CUOTA_AGOTADA: 'Rechazada por cuota',
  PROVEEDOR_NO_DISPONIBLE: 'Proveedor no disponible',
};
