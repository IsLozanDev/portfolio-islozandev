const TELEFONO_FIJO = /^\d{6,9}$/;

export function validarTelefonoFijo(valor: string): boolean {
  return TELEFONO_FIJO.test(valor);
}
