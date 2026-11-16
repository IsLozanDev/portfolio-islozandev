import type { EstadoCuota } from './cuota-actual';

export const MENSAJES_CONSUMO_IDENTIDAD = {
  titulo: 'Consultas DNI/RUC',
  plan: 'Plan',
  errorCarga: 'No se pudo cargar el consumo',
  consumoDelMes: 'Consumo de consultas DNI/RUC del mes',
} as const;

export const ETIQUETAS_ESTADO_CUOTA: Readonly<Record<EstadoCuota, string>> = {
  AGOTADA: 'Agotada',
  EN_AVISO: 'Sobre el umbral',
  NORMAL: 'Normal',
};

/** «120 de 500 consultas». */
export function textoConsultas(consumidas: number, incluidas: number): string {
  return `${consumidas} de ${incluidas} consultas`;
}
