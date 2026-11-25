/** Nombre del tenant del contexto para la variable `tenant` de los avisos (spec 44). */
export interface NombreTenant {
  /** Nombre comercial o razón social; null si no existe. */
  obtener(): Promise<string | null>;
}
