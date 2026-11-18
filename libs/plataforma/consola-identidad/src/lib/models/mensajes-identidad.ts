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

export const MENSAJES_DETALLE_CUOTA = {
  titulo: 'Detalle de cuota',
  volver: 'Volver a cuotas',
  plan: 'Plan',
  avisoUmbral: 'Aviso de umbral',
  avisoAgotada: 'Aviso de agotada',
  sinAviso: 'Sin aviso',
  consultasDelMes: 'Consultas del mes',
  resultado: 'Resultado',
  cantidad: 'Consultas',
  total: 'Total',
  ajustarIncluidas: 'Ajustar incluidas',
  cuotaAjustada: 'Cuota ajustada',
} as const;

/** «120 de 500 (24 %)». */
export function textoConsumo(consumidas: number, incluidas: number, porcentaje: number): string {
  return `${consumidas} de ${incluidas} (${porcentaje} %)`;
}

/** «Enviado el 10/11/26, 10:00 a. m.». */
export function textoAvisoEnviado(fechaHora: string): string {
  return `Enviado el ${fechaHora}`;
}

/** «Este tenant no tiene cuota en octubre 2026». */
export function textoSinCuotaDelTenant(etiquetaMes: string): string {
  return `Este tenant no tiene cuota en ${etiquetaMes}`;
}

export const MENSAJES_AJUSTE_CUOTA = {
  titulo: 'Ajustar incluidas',
  incluidas: 'Consultas incluidas',
  enteroRequerido: 'Ingrese un número entero.',
  versionObsoleta: 'La cuota cambió mientras la editabas. Se recargaron los datos; revise el valor y vuelva a guardar.',
} as const;

/** «Ya se consumieron 120: el mínimo es 120.» */
export function textoMinimoConsumidas(consumidas: number): string {
  return `Ya se consumieron ${consumidas}: el mínimo es ${consumidas}.`;
}

/** «Pollería Doña Rosa · noviembre 2026». */
export function textoContextoAjuste(tenantNombre: string, etiquetaMes: string): string {
  return `${tenantNombre} · ${etiquetaMes}`;
}

export const MENSAJES_PROVEEDORES = {
  titulo: 'Proveedores DNI/RUC',
  sinProveedores: 'No hay proveedores configurados',
  editar: 'Editar',
  activo: 'Activo',
  inactivo: 'Inactivo',
  proveedorActualizado: 'Proveedor actualizado',
} as const;

export const COLUMNAS_PROVEEDORES = {
  prioridad: 'Prioridad',
  codigo: 'Código',
  tiposDoc: 'Tipos de documento',
  ttlDias: 'TTL (días)',
  timeoutMs: 'Timeout (ms)',
  estado: 'Estado',
} as const;

export const MENSAJES_PANEL_PROVEEDOR = {
  titulo: 'Editar proveedor',
  prioridad: 'Prioridad',
  ayudaPrioridad: 'Menor número, primero en el orden de respaldo',
  ttlDias: 'TTL de la caché (días)',
  timeoutMs: 'Timeout (ms)',
  activo: 'Activo',
  enteroRequerido: 'Ingrese un número entero.',
  tituloDesactivar: '¿Desactivar el proveedor?',
  desactivar: 'Desactivar',
  versionObsoleta: 'El proveedor cambió mientras lo editabas. Se recargaron los datos; revise los valores y vuelva a guardar.',
} as const;

/** «Las consultas dejarán de usar DECOLECTA». */
export function textoConfirmarDesactivar(codigo: string): string {
  return `Las consultas dejarán de usar ${codigo}`;
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
