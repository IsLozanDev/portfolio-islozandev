/** JSON con claves ordenadas: jsonb no conserva el orden y dos objetos iguales deben compararse iguales. */
export function jsonCanonico(valor: unknown): string {
  return JSON.stringify(valor, (_clave, anidado: unknown) =>
    anidado !== null && typeof anidado === 'object' && !Array.isArray(anidado)
      ? Object.fromEntries(Object.entries(anidado as Record<string, unknown>).sort(([claveA], [claveB]) => (claveA < claveB ? -1 : claveA > claveB ? 1 : 0)))
      : anidado,
  );
}

export function igualJson(izquierdo: unknown, derecho: unknown): boolean {
  return jsonCanonico(izquierdo) === jsonCanonico(derecho);
}
