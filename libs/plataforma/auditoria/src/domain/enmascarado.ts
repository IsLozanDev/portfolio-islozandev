/** Claves cuyo valor nunca se guarda en la auditoría (TR-RNF-026). Se comparan en minúsculas. */
export const CAMPOS_ENMASCARADOS = ['clave', 'contrasena', 'password', 'token', 'secreto', 'secret', 'numero_documento', 'dni'] as const;
export const VALOR_ENMASCARADO = '***';

/** Copia de `valor` con `***` en toda clave de `claves`, en objetos anidados y arreglos. No muta la entrada. */
export function enmascararCampos(valor: unknown, claves: readonly string[]): unknown {
  const clavesEnMinusculas = new Set(claves.map((clave) => clave.toLowerCase()));
  return enmascarar(valor, clavesEnMinusculas);
}

function enmascarar(valor: unknown, claves: ReadonlySet<string>): unknown {
  if (Array.isArray(valor)) return valor.map((elemento) => enmascarar(elemento, claves));
  if (!esObjetoPlano(valor)) return valor;
  return Object.fromEntries(
    Object.entries(valor).map(([clave, contenido]) => [clave, claves.has(clave.toLowerCase()) ? VALOR_ENMASCARADO : enmascarar(contenido, claves)]),
  );
}

/** Solo objetos literales: un Date u otra clase se serializa por su cuenta y no se recorre. */
function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null) return false;
  const prototipo = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
}
