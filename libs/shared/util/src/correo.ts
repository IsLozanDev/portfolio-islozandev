const FORMA_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGITUD_MINIMA_CORREO = 3;
const LONGITUD_MAXIMA_CORREO = 254;

export function validarCorreo(valor: string): boolean {
  if (valor.length < LONGITUD_MINIMA_CORREO || valor.length > LONGITUD_MAXIMA_CORREO) return false;
  return FORMA_CORREO.test(valor);
}
