/** Qué se cuenta: el par correo+IP y la IP en la contraseña; el usuario en el MFA. */
export type ClaveBloqueo =
  | { alcance: 'CORREO_IP'; correo: string; ip: string }
  | { alcance: 'IP'; ip: string }
  | { alcance: 'MFA'; usuarioId: string };

export type AlcanceBloqueo = ClaveBloqueo['alcance'];

/**
 * Fallos de ingreso en una ventana fija y bloqueos vigentes (spec 18b). Si el almacén no responde,
 * falla abierto: no hay bloqueo y el fallo no se cuenta.
 */
export interface ContadorIntentos {
  /** Segundos que faltan del bloqueo más largo entre las claves, o null si ninguna está bloqueada. */
  bloqueoVigente(claves: readonly ClaveBloqueo[]): Promise<number | null>;
  /** Suma un fallo; al llegar al umbral bloquea, borra el contador y devuelve hasta cuándo. */
  registrarFallo(clave: ClaveBloqueo, umbral: number): Promise<{ bloqueadoHasta: Date | null }>;
  /** Borra el contador de fallos (no el bloqueo) tras un ingreso exitoso. */
  limpiar(clave: ClaveBloqueo): Promise<void>;
}
