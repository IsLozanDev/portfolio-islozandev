/** Sesiones de Supabase ya vistas, para escribir un solo LOGIN por sesión (spec 18b). */
export interface RegistroSesiones {
  /** true solo la primera vez que se ve `sesionId`. Si el almacén falla, false: se pierde el LOGIN, no se duplica. */
  esNueva(sesionId: string): Promise<boolean>;
}
