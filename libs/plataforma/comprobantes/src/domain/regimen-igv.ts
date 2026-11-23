/** Las mismas que el CHECK de fe.emisor.regimen_igv. */
export const REGIMENES_IGV = ['GENERAL', 'REDUCIDO_RESTAURANTES'] as const;
export type RegimenIgv = (typeof REGIMENES_IGV)[number];

export const REGIMEN_IGV_POR_DEFECTO: RegimenIgv = 'GENERAL';

export function esRegimenIgv(valor: string): valor is RegimenIgv {
  return (REGIMENES_IGV as readonly string[]).includes(valor);
}
