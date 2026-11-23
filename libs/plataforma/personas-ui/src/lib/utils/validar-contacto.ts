import type { TipoContacto } from '../models/persona';

/**
 * Copias de `celular.ts`, `correo.ts`, `telefono-fijo.ts` y `whatsapp.ts` de `libs/shared/util` (specs 31 y 32):
 * esta lib se empaqueta con ng-packagr y no puede importar `shared/util`. El servidor repite la validación con
 * los originales; si cambia uno, cambian las copias.
 */
const CELULAR_PERUANO = /^9\d{8}$/;
const FORMA_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGITUD_MAXIMA_CORREO = 254;
const TELEFONO_FIJO = /^\d{6,9}$/;
/** E.164: `+`, código de país (nunca empieza en 0) y de 8 a 15 dígitos en total. */
const WHATSAPP_INTERNACIONAL = /^\+[1-9]\d{7,14}$/;

export function validarCelular(valor: string): boolean {
  return CELULAR_PERUANO.test(valor);
}

export function validarCorreo(valor: string): boolean {
  return valor.length <= LONGITUD_MAXIMA_CORREO && FORMA_CORREO.test(valor);
}

export function validarTelefonoFijo(valor: string): boolean {
  return TELEFONO_FIJO.test(valor);
}

export function validarWhatsapp(valor: string): boolean {
  return WHATSAPP_INTERNACIONAL.test(valor);
}

const VALIDADORES: Record<TipoContacto, (valor: string) => boolean> = {
  CELULAR: validarCelular,
  FIJO: validarTelefonoFijo,
  CORREO: validarCorreo,
  WHATSAPP: validarWhatsapp,
};

export function validarContacto(tipo: TipoContacto, valor: string): boolean {
  return VALIDADORES[tipo](valor);
}
