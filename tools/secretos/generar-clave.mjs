// `pnpm secretos:clave [versión]` (spec 41): imprime una clave maestra nueva como `<versión>:<base64 de 32 bytes>`,
// lista para agregar a SEC_CLAVES_MAESTRAS. No escribe archivos: se copia al gestor de contraseñas y al panel del
// proveedor de despliegue, nunca al repo.
import { randomBytes } from 'node:crypto';

const BYTES_CLAVE = 32;
const VERSION_POR_DEFECTO = '1';
const VERSION_MAXIMA = 32_767;
const FORMATO_VERSION = /^\d+$/;

const argumento = process.argv[2] ?? VERSION_POR_DEFECTO;
const version = Number(argumento);
if (!FORMATO_VERSION.test(argumento) || version < 1 || version > VERSION_MAXIMA) {
  console.error(`Uso: secretos:clave [versión de 1 a ${VERSION_MAXIMA}]`);
  process.exit(1);
}

console.log(`${version}:${randomBytes(BYTES_CLAVE).toString('base64')}`);
