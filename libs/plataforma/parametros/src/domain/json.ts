/** Objeto JSON (ni null ni arreglo). */
export function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

/** JSON con claves ordenadas: jsonb no conserva el orden y dos objetos iguales deben compararse iguales. */
export function jsonCanonico(valor: unknown): string {
  return JSON.stringify(valor, (_clave, anidado: unknown) => (esObjeto(anidado) ? Object.fromEntries(Object.entries(anidado).sort(porClave)) : anidado));
}

export function igualJson(izquierdo: unknown, derecho: unknown): boolean {
  return jsonCanonico(izquierdo) === jsonCanonico(derecho);
}

/** Por código de carácter, no por idioma: el orden canónico no depende de la configuración regional. */
function porClave([claveA]: [string, unknown], [claveB]: [string, unknown]): number {
  if (claveA < claveB) return -1;
  if (claveA > claveB) return 1;
  return 0;
}
