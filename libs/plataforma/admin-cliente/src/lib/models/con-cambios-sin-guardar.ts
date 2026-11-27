/** Lo que implementa una página para que `cambiosSinGuardarGuard` pregunte antes de salir. */
export interface ConCambiosSinGuardar {
  tieneCambiosSinGuardar(): boolean;
}
