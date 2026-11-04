/** Etapa del ingreso que falló: la contraseña (sin token) o el segundo factor (con token aal1). */
export type EtapaIngreso = 'CLAVE' | 'MFA';

export const MOTIVOS_FALLO_INGRESO = [
  'CREDENCIALES',
  'CORREO_NO_CONFIRMADO',
  'USUARIO_SUSPENDIDO',
  'CODIGO_MFA',
  'BLOQUEO_INGRESO',
  'BLOQUEO_MFA',
] as const;
export type MotivoFalloIngreso = (typeof MOTIVOS_FALLO_INGRESO)[number];

/** Solo adivinar la clave o el código suma al bloqueo; un correo sin confirmar o suspendido no. */
export const MOTIVOS_QUE_CUENTAN: readonly MotivoFalloIngreso[] = ['CREDENCIALES', 'CODIGO_MFA'];

export const VENTANA_INTENTOS_SEG = 15 * 60;
export const DURACION_BLOQUEO_SEG = 15 * 60;
export const UMBRAL_FALLOS_CORREO_IP = 5;
export const UMBRAL_FALLOS_IP = 20;
export const UMBRAL_FALLOS_MFA = 5;

const CARACTERES_VISIBLES_CORREO = 2;
const MASCARA_CORREO = '****';

export function cuentaParaBloqueo(motivo: MotivoFalloIngreso): boolean {
  return MOTIVOS_QUE_CUENTAN.includes(motivo);
}

/** Recortado y en minúsculas, como `seg.usuario.email`. */
export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

/** «da****@gmail.com»: dos primeras letras del local y el dominio completo. La máscara no revela el largo. */
export function enmascararCorreo(correo: string): string {
  const normalizado = normalizarCorreo(correo);
  const arroba = normalizado.lastIndexOf('@');
  if (arroba < 0) return normalizado.slice(0, CARACTERES_VISIBLES_CORREO) + MASCARA_CORREO;
  const local = normalizado.slice(0, arroba);
  const dominio = normalizado.slice(arroba + 1);
  return `${local.slice(0, CARACTERES_VISIBLES_CORREO)}${MASCARA_CORREO}@${dominio}`;
}
