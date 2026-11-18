const CELULAR_PERUANO = /^9\d{8}$/;

export function validarCelular(valor: string): boolean {
  return CELULAR_PERUANO.test(valor);
}
