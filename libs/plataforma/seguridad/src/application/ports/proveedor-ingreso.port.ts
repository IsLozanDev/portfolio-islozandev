import type { MotivoFalloIngreso } from '../../domain/intentos-ingreso.js';

/** Lo que el front pasa a `supabase.auth.setSession`. */
export interface SesionEmitida {
  accessToken: string;
  refreshToken: string;
  expiraEn: number;
  tipoToken: 'bearer';
}

/** GoTrue limitó la petición por su cuenta (429). No es un intento fallido del usuario. */
export const LIMITE_PROVEEDOR = 'LIMITE_PROVEEDOR';

export type ResultadoIngreso =
  | { exito: true; sesion: SesionEmitida; usuarioId: string }
  | { exito: false; motivo: MotivoFalloIngreso; reintentarEnSeg?: undefined }
  | { exito: false; motivo: typeof LIMITE_PROVEEDOR; reintentarEnSeg: number };

/**
 * Ingreso con contraseña y MFA contra el proveedor de identidad (Supabase Auth, ADR-29). Las respuestas
 * de error del proveedor vuelven como resultado; si no responde o falla, ProveedorIngresoNoDisponibleError.
 */
export interface ProveedorIngreso {
  conClave(correo: string, clave: string, ip: string): Promise<ResultadoIngreso>;
  /** `accessToken` es el aal1 del usuario; devuelve la sesión aal2. */
  verificarMfa(accessToken: string, factorId: string, codigo: string, ip: string): Promise<ResultadoIngreso>;
}
