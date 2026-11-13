import { hashDocumento } from './hash-documento.js';

/** Campos que nunca salen en claro en un log (TR-RNF-026), en la raíz o hasta dos niveles de anidación. */
export const CAMPOS_SENSIBLES = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'contrasena',
  'token',
  'access_token',
  'refresh_token',
  'body',
  'query',
  'correo',
  'email',
] as const;

/** Números de documento: salen como hash con sal (TR-RNF-111), no redactados, para poder correlacionar. */
export const CAMPOS_DOCUMENTO = ['dni', 'ruc', 'documento', 'numeroDocumento', 'numero_documento'] as const;

export const TEXTO_REDACTADO = '[REDACTADO]';

const PREFIJOS_DE_PROFUNDIDAD = ['', '*', '*.*'];

/** Rutas para `redact.paths` de pino: `campo`, `*.campo`, `*.*.campo`. */
export function rutasRedactadas(): string[] {
  const campos = [...CAMPOS_SENSIBLES, ...CAMPOS_DOCUMENTO];
  return PREFIJOS_DE_PROFUNDIDAD.flatMap((prefijo) => campos.map((campo) => rutaConPrefijo(prefijo, campo)));
}

/** Valor que reemplaza a un campo redactado: hash para documentos, texto fijo para el resto. */
export function valorCensurado(valor: unknown, ruta: readonly string[], sal: string): string {
  const campo = ruta[ruta.length - 1];
  const esDocumento = (CAMPOS_DOCUMENTO as readonly string[]).includes(campo ?? '');
  if (!esDocumento || (typeof valor !== 'string' && typeof valor !== 'number')) return TEXTO_REDACTADO;
  return hashDocumento(String(valor), sal);
}

// Sintaxis de fast-redact: `a.b` para identificadores y `a["b-c"]` para el resto.
function rutaConPrefijo(prefijo: string, campo: string): string {
  if (!/^[A-Za-z_$][\w$]*$/.test(campo)) return `${prefijo}["${campo}"]`;
  return prefijo ? `${prefijo}.${campo}` : campo;
}
