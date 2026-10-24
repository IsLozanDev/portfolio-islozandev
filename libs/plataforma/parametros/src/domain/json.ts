/** JSON con claves ordenadas: jsonb no conserva el orden y dos objetos iguales deben compararse iguales. */
export function jsonCanonico(valor: unknown): string {
  return JSON.stringify(valor, (_clave, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

export function igualJson(a: unknown, b: unknown): boolean {
  return jsonCanonico(a) === jsonCanonico(b);
}
