import { ClaveMaestraDesconocidaError, ClaveMaestraInvalidaError } from './errores.js';

export const BYTES_CLAVE = 32;
/** sec.clave_tenant.version_clave_maestra es smallint. */
const VERSION_MAXIMA = 32_767;

/**
 * Las claves maestras configuradas, por versión, y la activa: se envuelve con la activa y se desenvuelve con la
 * versión que indica cada clave de tenant. Las claves viven en un campo privado: ni `JSON.stringify` ni
 * `util.inspect` las muestran.
 */
export class ClavesMaestras {
  readonly #claves: ReadonlyMap<number, Uint8Array>;

  private constructor(
    claves: ReadonlyMap<number, Uint8Array>,
    readonly activa: number,
  ) {
    this.#claves = claves;
  }

  static crear(claves: ReadonlyMap<number, Uint8Array>, activa: number): ClavesMaestras {
    for (const [version, clave] of claves) exigirClaveValida(version, clave);
    if (!claves.has(activa)) throw new ClaveMaestraInvalidaError(`La versión activa ${activa} no está en la lista de claves maestras`);
    return new ClavesMaestras(new Map(claves), activa);
  }

  get versiones(): number[] {
    return [...this.#claves.keys()];
  }

  clave(version: number): Uint8Array {
    const clave = this.#claves.get(version);
    if (!clave) throw new ClaveMaestraDesconocidaError(version);
    return clave;
  }

  claveActiva(): Uint8Array {
    return this.clave(this.activa);
  }
}

function exigirClaveValida(version: number, clave: Uint8Array): void {
  if (!Number.isInteger(version) || version < 1 || version > VERSION_MAXIMA) {
    throw new ClaveMaestraInvalidaError(`La versión de una clave maestra va de 1 a ${VERSION_MAXIMA}`);
  }
  if (clave.length !== BYTES_CLAVE) {
    throw new ClaveMaestraInvalidaError(`La clave maestra ${version} debe tener ${BYTES_CLAVE} bytes`);
  }
}
