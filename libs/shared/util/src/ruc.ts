// Módulo 11 de SUNAT (TR-RN-002): pesos sobre los 10 primeros dígitos; el undécimo es el verificador.
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function validarRuc(ruc: string): boolean {
  if (!/^(10|15|17|20)\d{9}$/.test(ruc)) return false;
  const suma = PESOS.reduce((acc, peso, i) => acc + peso * Number(ruc[i]), 0);
  const verificador = (11 - (suma % 11)) % 10;
  return verificador === Number(ruc[10]);
}
