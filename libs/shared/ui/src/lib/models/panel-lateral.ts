export interface OpcionesPanelLateral<Datos> {
  datos: Datos;
}

export const CLASE_PANEL_LATERAL = 'vit-panel-lateral';
export const CLASE_FONDO_PANEL_LATERAL = 'vit-panel-lateral-fondo';
export const ANCHO_PANEL_LATERAL = 'min(480px, 100vw)';
export const ALTO_PANEL_LATERAL = '100dvh';

/**
 * MatDialog espera estos milisegundos antes de quitar el panel: deben coincidir con
 * `--duracion-panel-entrada`, `--duracion-panel-salida` y `--duracion-panel-reducida` de `tema.css`.
 */
export const DURACION_PANEL_ENTRADA_MS = 280;
export const DURACION_PANEL_SALIDA_MS = 200;
export const DURACION_PANEL_REDUCIDA_MS = 150;

export const CONSULTA_MOVIMIENTO_REDUCIDO = '(prefers-reduced-motion: reduce)';

/** El foco va al primer campo del cuerpo, no a la X de la cabecera. */
export const SELECTOR_PRIMER_CAMPO = '.vit-panel-lateral-cuerpo :is(input, textarea, select, mat-select, mat-button-toggle button, button)';
